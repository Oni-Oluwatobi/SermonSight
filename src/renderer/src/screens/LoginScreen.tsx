import React, { useState } from 'react'
import { showToast } from '../state/store'
import { authCreateAccount, authResetPassword, authSignIn } from '../auth/firebaseAuth'

type Mode = 'signin' | 'signup'

/**
 * The only entry point when signed out. The operator app (and every internal
 * screen behind it) is gated on the authenticated phase in App.tsx.
 */
export function LoginScreen(): JSX.Element {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (busy) return
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signin') await authSignIn(email, password)
      else await authCreateAccount(email, password)
      showToast(mode === 'signin' ? 'Signed in.' : 'Account created.', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const resetPassword = async (): Promise<void> => {
    if (busy) return
    if (!email.trim()) {
      setError('Enter your email first, then request a reset link.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await authResetPassword(email)
      showToast(`Password reset email sent to ${email.trim()}.`, 'success', 6000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={(e) => void submit(e)}>
        <div className="auth-brand">
          <span className="brand-name">SermonSight</span>
          <span className="brand-tag">The Kreadive Galaxy</span>
        </div>
        <h1 className="auth-title">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
        <p className="auth-sub">
          SermonSight’s sermon tools run fully offline on this computer — signing in protects this
          workspace and keeps your session on this device.
        </p>

        <label className="auth-label" htmlFor="auth-email">
          Email
        </label>
        <input
          id="auth-email"
          className="auth-input"
          type="email"
          autoComplete="email"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="pastor@example.com"
        />

        <label className="auth-label" htmlFor="auth-password">
          Password
        </label>
        <input
          id="auth-password"
          className="auth-input"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <button className="btn primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        <div className="auth-links">
          <button
            type="button"
            className="linklike"
            disabled={busy}
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
            }}
          >
            {mode === 'signin' ? 'Create an account' : 'I already have an account'}
          </button>
          {mode === 'signin' && (
            <button type="button" className="linklike" disabled={busy} onClick={() => void resetPassword()}>
              Forgot password?
            </button>
          )}
        </div>

        <p className="auth-foot">
          First sign-in needs an internet connection. After that this device stays signed in and the
          app opens offline.
        </p>
      </form>
    </div>
  )
}
