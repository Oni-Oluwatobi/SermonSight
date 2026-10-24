import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { AccountStatus } from '../../shared/ipc'
import { logger } from '../logger'

interface FirebaseConfig {
  apiKey?: string
  authDomain?: string
  projectId?: string
  appId?: string
}

interface AuthUser {
  displayName: string | null
  email: string | null
}

const SESSION_FILE = 'account-session.json'
const DEVICE_FILE = 'device-registration.json'

function configPath(): string {
  return path.join(app.getAppPath(), 'resources', 'firebase-config.json')
}

function sessionPath(): string {
  return path.join(app.getPath('userData'), SESSION_FILE)
}

function devicePath(): string {
  return path.join(app.getPath('userData'), DEVICE_FILE)
}

function loadConfig(): FirebaseConfig | null {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8')
    const parsed = JSON.parse(raw) as FirebaseConfig
    if (parsed?.apiKey && parsed?.projectId) return parsed
  } catch {
    /* not configured */
  }
  return null
}

/**
 * Account/identity layer.
 *
 * Firebase is an OPTIONAL cloud layer: when no configuration file is present
 * the app reports "not configured" and everything local keeps working.
 * The live presentation engine NEVER waits on this provider.
 */
export class AccountProvider {
  private config: FirebaseConfig | null = null
  private auth: any = null
  private app: any = null
  private user: AuthUser | null = null
  private deviceId: string | null = null
  private loadAttempted = false
  private loadError: string | null = null

  private ensureLoaded(): void {
    if (this.loadAttempted) return
    this.loadAttempted = true
    this.config = loadConfig()
    try {
      const raw = fs.readFileSync(devicePath(), 'utf8')
      this.deviceId = (JSON.parse(raw) as { deviceId?: string }).deviceId ?? null
    } catch {
      this.deviceId = null
    }
    if (!this.config) return
    try {
      const raw = fs.readFileSync(sessionPath(), 'utf8')
      const s = JSON.parse(raw) as AuthUser
      if (s?.email) this.user = { displayName: s.displayName ?? null, email: s.email }
    } catch {
      this.user = null
    }
  }

  status(): AccountStatus {
    this.ensureLoaded()
    if (!this.config) {
      return {
        configured: false,
        signedIn: false,
        displayName: null,
        email: null,
        workspace: null,
        deviceId: this.deviceId,
        message: 'Account: not configured'
      }
    }
    if (this.loadError) {
      return {
        configured: true,
        signedIn: false,
        displayName: null,
        email: null,
        workspace: this.config.projectId ?? null,
        deviceId: this.deviceId,
        message: this.loadError
      }
    }
    return {
      configured: true,
      signedIn: this.user != null,
      displayName: this.user?.displayName ?? null,
      email: this.user?.email ?? null,
      workspace: this.config.projectId ?? null,
      deviceId: this.deviceId,
      message: this.user ? `Signed in: ${this.user.email}` : 'Signed out'
    }
  }

  private async ensureFirebase(): Promise<boolean> {
    if (!this.config) return false
    if (this.auth) return true
    try {
      const pkg = 'firebase/app'
      const authPkg = 'firebase/auth'
      const fb: any = await import(/* @vite-ignore */ pkg)
      const fbAuth: any = await import(/* @vite-ignore */ authPkg)
      this.app = fb.initializeApp(this.config)
      this.auth = fbAuth.getAuth(this.app)
      return true
    } catch (err) {
      this.loadError = 'Firebase SDK not installed (run: npm install firebase).'
      logger.warn('firebase unavailable', String(err))
      return false
    }
  }

  async signIn(email: string, password: string): Promise<AccountStatus> {
    this.ensureLoaded()
    if (!this.config) return this.status()
    if (!(await this.ensureFirebase())) return this.status()
    try {
      const authPkg = 'firebase/auth'
      const fbAuth: any = await import(/* @vite-ignore */ authPkg)
      const cred = await fbAuth.signInWithEmailAndPassword(this.auth, email, password)
      this.user = {
        displayName: cred.user.displayName ?? null,
        email: cred.user.email ?? null
      }
      fs.writeFileSync(
        sessionPath(),
        JSON.stringify({ displayName: this.user.displayName, email: this.user.email }, null, 2)
      )
      logger.info('account signed in', { email: this.user.email })
    } catch (err) {
      this.loadError = `Sign-in failed: ${err instanceof Error ? err.message : String(err)}`
      logger.warn('account sign-in failed', this.loadError)
    }
    return this.status()
  }

  async signOut(): Promise<AccountStatus> {
    this.ensureLoaded()
    try {
      if (this.auth) {
        const authPkg = 'firebase/auth'
        const fbAuth: any = await import(/* @vite-ignore */ authPkg)
        await fbAuth.signOut(this.auth)
      }
    } catch (err) {
      logger.warn('sign-out error', String(err))
    }
    this.user = null
    try {
      fs.rmSync(sessionPath(), { force: true })
    } catch {
      /* ignore */
    }
    logger.info('account signed out')
    return this.status()
  }

  /** Device registration is best-effort and local until cloud is configured. */
  registerDevice(): AccountStatus {
    this.ensureLoaded()
    if (!this.deviceId) {
      this.deviceId = `ss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      try {
        fs.writeFileSync(devicePath(), JSON.stringify({ deviceId: this.deviceId }, null, 2))
        logger.info('device registered', { deviceId: this.deviceId })
      } catch (err) {
        logger.warn('device registration failed', String(err))
      }
    }
    return this.status()
  }
}

export const accountProvider = new AccountProvider()
