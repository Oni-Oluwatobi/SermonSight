import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User
} from 'firebase/auth'
import config from '../../../../resources/firebase-config.json'
import { setAuth } from '../state/store'

/**
 * Renderer-side Firebase Authentication (source of truth for the app gate).
 * Uses browser persistence (IndexedDB) so a signed-in session survives restarts
 * and the app still opens offline after the first successful sign-in.
 */

let app: FirebaseApp | null = null
let auth: Auth | null = null
let started = false

function friendly(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-password':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.'
    case 'auth/invalid-email':
      return 'That email address is not valid.'
    case 'auth/missing-password':
      return 'Enter your password.'
    case 'auth/email-already-in-use':
      return 'An account already exists for that email.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.'
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled yet. Enable it in the Firebase console (Authentication → Sign-in method).'
    case 'auth/configuration-not-found':
      return 'This Firebase project has no authorized domain or sign-in provider yet. Enable Email/Password in the Firebase console.'
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in service. Check the internet connection and try again.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.'
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    default:
      return err instanceof Error ? err.message : String(err)
  }
}

export function initAuth(): void {
  if (started) return
  started = true
  try {
    app = initializeApp(config)
    auth = getAuth(app)
    let restored = false
    // The SDK normally resolves the cached session in well under a second, even
    // offline. On a dead network the initial callback can stall forever — the
    // app must never hang behind the "Restoring session…" spinner (Firebase is
    // optional; the operator needs the gate, not a deadlock). If the SDK
    // recovers later, onAuthStateChanged still upgrades the UI automatically.
    const bail = setTimeout(() => {
      if (restored) return
      restored = true
      console.warn('auth restore timed out — showing sign-in gate')
      setAuth({ phase: 'unauthenticated', email: null, displayName: null })
    }, 10000)
    bail.unref?.()
    onAuthStateChanged(
      auth,
      (user: User | null) => {
        restored = true
        clearTimeout(bail)
        if (user) {
          setAuth({ phase: 'authenticated', email: user.email, displayName: user.displayName ?? null })
        } else {
          setAuth({ phase: 'unauthenticated', email: null, displayName: null })
        }
      },
      (err) => {
        restored = true
        clearTimeout(bail)
        console.error('auth state error', err)
        setAuth({ phase: 'unauthenticated', email: null, displayName: null })
      }
    )
  } catch (err) {
    console.error('firebase init failed', err)
    setAuth({ phase: 'unauthenticated' })
  }
}

export async function authSignIn(email: string, password: string): Promise<void> {
  if (!auth) throw new Error('Sign-in is not available (configuration error).')
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  } catch (err) {
    throw new Error(friendly(err))
  }
}

export async function authCreateAccount(email: string, password: string): Promise<void> {
  if (!auth) throw new Error('Sign-up is not available (configuration error).')
  try {
    await createUserWithEmailAndPassword(auth, email.trim(), password)
  } catch (err) {
    throw new Error(friendly(err))
  }
}

export async function authResetPassword(email: string): Promise<void> {
  if (!auth) throw new Error('Password reset is not available (configuration error).')
  try {
    await sendPasswordResetEmail(auth, email.trim())
  } catch (err) {
    throw new Error(friendly(err))
  }
}

export async function authSignOut(): Promise<void> {
  setAuth({ phase: 'unauthenticated', email: null, displayName: null })
  if (!auth) return
  try {
    await signOut(auth)
  } catch (err) {
    console.error('sign-out failed', err)
  }
}
