import type { AppState, CandidateState, RemoteStatus, AccountStatus, SttStatus, PresentationMeta } from '../shared/ipc'
import { logger } from './logger'

function initialCandidateState(): CandidateState {
  return { candidates: [], activeIndex: 0, lastTranscript: null, searching: false }
}

function initialState(): AppState {
  return {
    revision: 0,
    db: {
      state: 'not-checked',
      path: null,
      error: null,
      schemaVersion: null,
      databaseVersion: null,
      canonical: null,
      translations: [],
      warnings: []
    },
    translation: 'KJV',
    preview: null,
    live: null,
    black: false,
    candidates: initialCandidateState(),
    stt: { state: 'unavailable', engine: 'none', message: 'Speech engine not started' },
    remote: {
      state: 'disabled',
      url: null,
      lanIp: null,
      port: null,
      pin: null,
      pinExpiresAt: null,
      clients: 0,
      error: null
    },
    account: {
      configured: false,
      signedIn: false,
      displayName: null,
      email: null,
      workspace: null,
      deviceId: null,
      message: 'Account: not configured'
    },
    presentation: {
      theme: 'classic',
      showReference: true,
      showTranslationBadge: false,
      fontSizePct: 100,
      displayId: null,
      windowOpen: false,
      fullscreen: false,
      page: 0,
      pageCount: 1
    }
  }
}

let state: AppState = initialState()
const listeners = new Set<(s: AppState) => void>()
let externalBroadcast: ((s: AppState) => void) | null = null

// Broadcasts serialize the full AppState (preview/live passages can be hundreds of
// verses) and push it to two windows + the phone remote. Unthrottled, audio-driven
// and transcript-driven patches produced 15-20 full serializations per second,
// saturating low-end CPUs. Coalesce to at most 10 Hz (trailing edge), always with
// the latest state snapshot.
const BROADCAST_MIN_INTERVAL_MS = 100
let broadcastTimer: ReturnType<typeof setTimeout> | null = null
let lastBroadcastAt = 0

function scheduleBroadcast(): void {
  if (broadcastTimer) return
  const wait = Math.max(0, BROADCAST_MIN_INTERVAL_MS - (Date.now() - lastBroadcastAt))
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    lastBroadcastAt = Date.now()
    if (!externalBroadcast) return
    try {
      externalBroadcast(state)
    } catch (err) {
      logger.error('state broadcast failed', String(err))
    }
  }, wait)
  broadcastTimer.unref?.()
}

export function getState(): AppState {
  return state
}

export function patch(p: Partial<AppState>): void {
  state = { ...state, ...p, revision: state.revision + 1 }
  for (const fn of listeners) {
    try {
      fn(state)
    } catch (err) {
      logger.error('state listener failed', String(err))
    }
  }
  scheduleBroadcast()
}

export function subscribe(fn: (s: AppState) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setBroadcaster(fn: ((s: AppState) => void) | null): void {
  externalBroadcast = fn
}

export function patchCandidates(p: Partial<CandidateState>): void {
  patch({ candidates: { ...state.candidates, ...p } })
}

export function patchStt(p: Partial<SttStatus>): void {
  patch({ stt: { ...state.stt, ...p } })
}

export function patchRemote(p: Partial<RemoteStatus>): void {
  patch({ remote: { ...state.remote, ...p } })
}

export function patchAccount(p: Partial<AccountStatus>): void {
  patch({ account: { ...state.account, ...p } })
}

export function patchPresentation(p: Partial<PresentationMeta>): void {
  patch({ presentation: { ...state.presentation, ...p } })
}
