import crypto from 'crypto'

export interface PinInfo {
  pin: string
  expiresAt: number
}

const PIN_TTL_MS = 10 * 60 * 1000
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const MAX_PIN_ATTEMPTS = 5
const LOCK_MS = 30 * 1000

/**
 * Short-lived pairing PIN + session tokens for the local phone remote.
 * LAN-only trust boundary; no cloud involved.
 */
export class PairingManager {
  private pin: string | null = null
  private pinExpiresAt = 0
  private sessions = new Map<string, number>()
  private failedAttempts = 0
  private lockedUntil = 0

  newPin(ttlMs = PIN_TTL_MS): PinInfo {
    this.pin = String(crypto.randomInt(0, 10000)).padStart(4, '0')
    this.pinExpiresAt = Date.now() + ttlMs
    this.failedAttempts = 0
    this.lockedUntil = 0
    return { pin: this.pin, expiresAt: this.pinExpiresAt }
  }

  currentPin(): PinInfo | null {
    if (!this.pin || Date.now() > this.pinExpiresAt) return null
    return { pin: this.pin, expiresAt: this.pinExpiresAt }
  }

  /**
   * Issue a session token without a PIN (used for the QR code: scanning the
   * QR image is itself the trust gesture, so the phone opens straight to the
   * controller). Manual URL entry still requires the 4-digit PIN.
   */
  issueSession(): { token: string; expiresAt: number } {
    const token = crypto.randomBytes(16).toString('hex')
    const expiresAt = Date.now() + SESSION_TTL_MS
    this.sessions.set(token, expiresAt)
    this.prune()
    return { token, expiresAt }
  }

  redeem(pin: string): { token: string; expiresAt: number } | null {
    if (Date.now() < this.lockedUntil) return null
    const info = this.currentPin()
    if (!info) return null

    const a = Buffer.from(pin.trim(), 'utf8')
    const b = Buffer.from(info.pin, 'utf8')
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b)
    if (!ok) {
      this.failedAttempts++
      if (this.failedAttempts >= MAX_PIN_ATTEMPTS) {
        this.lockedUntil = Date.now() + LOCK_MS
        this.failedAttempts = 0
      }
      return null
    }
    this.failedAttempts = 0
    const token = crypto.randomBytes(16).toString('hex')
    const expiresAt = Date.now() + SESSION_TTL_MS
    this.sessions.set(token, expiresAt)
    this.prune()
    return { token, expiresAt }
  }

  verify(token: string | null | undefined): boolean {
    if (!token) return false
    this.prune()
    const exp = this.sessions.get(token)
    return exp != null && Date.now() < exp
  }

  revoke(token: string): void {
    this.sessions.delete(token)
  }

  activeSessions(): number {
    this.prune()
    return this.sessions.size
  }

  private prune(): void {
    const now = Date.now()
    for (const [t, exp] of this.sessions) {
      if (now >= exp) this.sessions.delete(t)
    }
  }
}
