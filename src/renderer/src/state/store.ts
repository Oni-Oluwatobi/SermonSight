import { useSyncExternalStore } from 'react'
import {
  IPC,
  type AppState,
  type AudioStatus,
  type Candidate,
  type DbStatus,
  type DisplayInfo,
  type Passage,
  type RemoteStatus,
  type SearchResponse,
  type SettingsShape,
  type TranslationInfo
} from '@shared/ipc'

export type ToastTone = 'info' | 'error' | 'success'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

export type AuthPhase = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthInfo {
  phase: AuthPhase
  email: string | null
  displayName: string | null
}

let state: AppState | null = null
let auth: AuthInfo = { phase: 'loading', email: null, displayName: null }
let audio: AudioStatus = {
  state: 'idle',
  label: 'Not listening',
  listening: false,
  level: 0,
  error: null
}
let toast: Toast | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function applyAppTheme(theme: 'dark' | 'light'): void {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
}

export function initStore(): void {
  window.api.on(IPC.STATE_UPDATE, (s) => {
    state = s as AppState
    emit()
  })
  void window.api
    .invoke<AppState>(IPC.STATE_GET)
    .then((s) => {
      state = s
      emit()
    })
    .catch(() => undefined)
  void window.api
    .invoke<SettingsShape>(IPC.SETTINGS_GET)
    .then((s) => applyAppTheme(s.appTheme))
    .catch(() => undefined)
}

export function useAppState(): AppState | null {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state
  )
}

export function useAudioStatus(): AudioStatus {
  return useSyncExternalStore(
    subscribe,
    () => audio,
    () => audio
  )
}

export function useAuth(): AuthInfo {
  return useSyncExternalStore(
    subscribe,
    () => auth,
    () => auth
  )
}

export function setAuth(next: Partial<AuthInfo>): void {
  const merged = { ...auth, ...next }
  if (merged.phase === auth.phase && merged.email === auth.email && merged.displayName === auth.displayName)
    return
  auth = merged
  emit()
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    subscribe,
    () => toast,
    () => toast
  )
}

export function setAudioStatus(next: Partial<AudioStatus>): void {
  const merged = { ...audio, ...next }
  const unchanged =
    merged.state === audio.state &&
    merged.label === audio.label &&
    merged.listening === audio.listening &&
    merged.error === audio.error &&
    Math.abs(merged.level - audio.level) < 0.04
  if (unchanged) return
  audio = merged
  emit()
}

export function showToast(message: string, tone: ToastTone = 'info', ttlMs = 3600): void {
  toast = { id: Date.now(), message, tone }
  emit()
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast = null
    toastTimer = null
    emit()
  }, ttlMs)
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return await window.api.invoke<T>(channel, ...args)
  } catch (err) {
    showToast(String(err instanceof Error ? err.message : err), 'error')
    throw err
  }
}

export interface ActionResult {
  ok: boolean
  error: string | null
}

async function action(channel: string, ...args: unknown[]): Promise<ActionResult> {
  try {
    const res = await window.api.invoke<ActionResult>(channel, ...args)
    if (res && res.ok === false && res.error) showToast(res.error, 'error')
    return res ?? { ok: false, error: 'No response from engine.' }
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err)
    showToast(message, 'error')
    return { ok: false, error: message }
  }
}

export const actions = {
  search: (query: string, translation: string): Promise<SearchResponse> =>
    invoke<SearchResponse>(IPC.SCRIPTURE_SEARCH, query, translation),

  translations: (): Promise<TranslationInfo[]> =>
    invoke<TranslationInfo[]>(IPC.SCRIPTURE_TRANSLATIONS),

  preview: (reference: string): Promise<ActionResult> => action(IPC.PREVIEW_SET, reference),
  present: (reference: string): Promise<ActionResult> => action(IPC.PRESENT_SET, reference),
  black: (on?: boolean): Promise<boolean> => invoke<boolean>(IPC.PRESENTATION_BLACK, on),
  next: (): Promise<boolean> => invoke<boolean>(IPC.PRESENTATION_NEXT),
  prev: (): Promise<boolean> => invoke<boolean>(IPC.PRESENTATION_PREV),

  openPresentation: (): Promise<boolean> => invoke<boolean>(IPC.PRESENTATION_OPEN),
  closePresentation: (): Promise<boolean> => invoke<boolean>(IPC.PRESENTATION_CLOSE),
  toggleFullscreen: (): Promise<boolean> => invoke<boolean>(IPC.PRESENTATION_FULLSCREEN),
  setDisplay: (id: number | null): Promise<boolean> =>
    invoke<boolean>(IPC.PRESENTATION_SET_DISPLAY, id),
  displays: (): Promise<DisplayInfo[]> => invoke<DisplayInfo[]>(IPC.DISPLAYS),

  selectCandidate: (index: number): Promise<ActionResult> =>
    action(IPC.CANDIDATE_SELECT, index),
  confirm: (id?: string): Promise<ActionResult> => action(IPC.CANDIDATE_CONFIRM, id),
  reject: (id?: string): Promise<ActionResult> => action(IPC.CANDIDATE_REJECT, id),

  setTranslation: (abbr: string): Promise<ActionResult> => action(IPC.TRANSLATION_SET, abbr),

  reloadDb: (): Promise<DbStatus> => invoke<DbStatus>(IPC.DB_RELOAD),
  chooseDb: (): Promise<DbStatus> => invoke<DbStatus>(IPC.DB_CHOOSE),

  getSettings: (): Promise<SettingsShape> => invoke<SettingsShape>(IPC.SETTINGS_GET),
  setSettings: (partial: Partial<SettingsShape>): Promise<SettingsShape> =>
    invoke<SettingsShape>(IPC.SETTINGS_SET, partial),

  remoteStatus: (): Promise<RemoteStatus & { qr?: string | null }> =>
    invoke<RemoteStatus & { qr?: string | null }>(IPC.REMOTE_STATUS),
  setRemoteEnabled: (enabled: boolean): Promise<RemoteStatus> =>
    invoke<RemoteStatus>(IPC.REMOTE_SET_ENABLED, enabled),
  newPin: (): Promise<{ pin: string | null; expiresAt: number | null; qr?: string | null }> =>
    invoke(IPC.REMOTE_NEW_PIN),

  signIn: (email: string, password: string): Promise<unknown> =>
    invoke(IPC.ACCOUNT_SIGN_IN, email, password),
  signOut: (): Promise<unknown> => invoke(IPC.ACCOUNT_SIGN_OUT),

  easyWorshipStatus: (): Promise<{
    detected: boolean
    version: string | null
    installPaths: string[]
    methods: string[]
    note: string
  }> => invoke(IPC.EASYWORSHIP_STATUS),
  easyWorshipCopy: (): Promise<{ ok: boolean; error: string | null; text: string | null }> =>
    invoke(IPC.EASYWORSHIP_COPY),

  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void => {
    window.api.send(IPC.LOG, level, message, data)
  }
}

export function candidateText(c: Candidate): string {
  return c.snippet || c.text
}
