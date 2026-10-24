/**
 * Shared IPC contract between main, preload and renderer processes.
 * Every channel used across processes must be declared here.
 */

export interface VerseView {
  canonicalId: string
  reference: string
  translation: string
  text: string
  validationStatus: string
}

export interface Passage {
  reference: string
  translation: string
  verses: VerseView[]
}

export interface TranslationInfo {
  abbreviation: string
  name: string
  language: string | null
  copyright: string | null
  available: boolean
}

export interface SessionInfo {
  id: string
  label: string
  startedAt: number
  endedAt: number | null
  hadOutput: boolean
}

export type DbState = 'not-checked' | 'missing' | 'invalid' | 'loaded'

export interface DbStatus {
  state: DbState
  path: string | null
  error: string | null
  schemaVersion: string | null
  databaseVersion: string | null
  canonical: string | null
  translations: TranslationInfo[]
  warnings: string[]
}

export type CandidateKind = 'reference' | 'phrase'

export interface Candidate {
  id: string
  kind: CandidateKind
  canonicalId: string
  reference: string
  translation: string
  text: string
  confidence: number
  snippet: string | null
  detectedAt: number
}

export interface CandidateState {
  candidates: Candidate[]
  activeIndex: number
  lastTranscript: string | null
  searching: boolean
}

export type SttState = 'unavailable' | 'starting' | 'listening' | 'paused' | 'error'

export interface SttStatus {
  state: SttState
  engine: string
  message: string | null
}

export type RemoteState = 'disabled' | 'starting' | 'running' | 'error'

export interface RemoteStatus {
  state: RemoteState
  url: string | null
  lanIp: string | null
  port: number | null
  pin: string | null
  pinExpiresAt: number | null
  clients: number
  error: string | null
}

export interface AccountStatus {
  configured: boolean
  signedIn: boolean
  displayName: string | null
  email: string | null
  workspace: string | null
  deviceId: string | null
  message: string | null
}

export type ThemeId = 'classic' | 'minimal' | 'dark'

export interface PresentationMeta {
  theme: ThemeId
  showReference: boolean
  showTranslationBadge: boolean
  fontSizePct: number
  displayId: number | null
  windowOpen: boolean
  fullscreen: boolean
  /** 0-based page within the current passage (long passages are paginated). */
  page: number
  pageCount: number
}

export interface AppState {
  revision: number
  db: DbStatus
  translation: string
  preview: Passage | null
  live: Passage | null
  black: boolean
  candidates: CandidateState
  stt: SttStatus
  remote: RemoteStatus
  account: AccountStatus
  presentation: PresentationMeta
}

export type AudioState = 'idle' | 'silence' | 'speech' | 'music' | 'mixed' | 'error'

export interface AudioStatus {
  state: AudioState
  label: string
  listening: boolean
  level: number
  error: string | null
}

export type SearchKind = 'reference' | 'chapter' | 'keyword' | 'phrase' | 'unknown'

export interface SearchResultItem {
  canonicalId: string
  reference: string
  translation: string
  text: string
  validationStatus: string
}

export interface SearchResponse {
  kind: SearchKind
  query: string
  translation: string
  results: SearchResultItem[]
  truncated: boolean
  error: string | null
  /** Set when a newer operator search superseded this one before it ran. */
  superseded?: boolean
}

export interface SettingsShape {
  dbPath: string | null
  translation: string
  theme: ThemeId
  appTheme: 'dark' | 'light'
  showReference: boolean
  showTranslationBadge: boolean
  fontSizePct: number
  displayId: number | null
  remoteEnabled: boolean
  remotePort: number
  listenEnabled: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  openLastSession: boolean
}

/** Audio stream messages sent renderer -> main. */
export type AudioStreamMessage =
  | { type: 'features'; frame: FrameFeatures }
  | { type: 'pcm'; data: Uint8Array }
  | { type: 'flush' }
  | { type: 'status'; listening: boolean; error: string | null }

export interface FrameFeatures {
  t: number
  rms: number
  db: number
  zcr: number
  centroid: number
  flatness: number
  flux: number
  voiced: number
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  primary: boolean
}

/** API exposed by the preload script as window.api */
export interface RendererApi {
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
  send(channel: string, ...args: unknown[]): void
  on(channel: string, listener: (...args: unknown[]) => void): () => void
}

export const IPC = {
  DB_CHOOSE: 'db:choose',
  DB_RELOAD: 'db:reload',
  DB_STATUS: 'db:status',
  SCRIPTURE_SEARCH: 'scripture:search',
  SCRIPTURE_PASSAGE: 'scripture:passage',
  SCRIPTURE_ADJACENT: 'scripture:adjacent',
  SCRIPTURE_TRANSLATIONS: 'scripture:translations',
  SCRIPTURE_BOOKS: 'scripture:books',
  PREVIEW_SET: 'presentation:preview',
  PRESENT_SET: 'presentation:present',
  PRESENTATION_BLACK: 'presentation:black',
  PRESENTATION_NEXT: 'presentation:next',
  PRESENTATION_PREV: 'presentation:prev',
  PRESENTATION_OPEN: 'presentation:open',
  PRESENTATION_CLOSE: 'presentation:close',
  PRESENTATION_FULLSCREEN: 'presentation:fullscreen',
  PRESENTATION_SET_DISPLAY: 'presentation:setDisplay',
  PRESENTATION_SETTINGS: 'presentation:settings',
  PRESENTATION_STATE: 'presentation:state',
  PRESENTATION_PAGE: 'presentation:page',
  CANDIDATE_SELECT: 'candidates:select',
  CANDIDATE_CONFIRM: 'candidates:confirm',
  CANDIDATE_REJECT: 'candidates:reject',
  TRANSLATION_SET: 'translation:set',
  AUDIO_STREAM: 'audio:stream',
  STT_STATUS: 'stt:status',
  TRANSCRIPT: 'recognition:transcript',
  REMOTE_STATUS: 'remote:status',
  REMOTE_SET_ENABLED: 'remote:setEnabled',
  REMOTE_NEW_PIN: 'remote:newPin',
  ACCOUNT_STATUS: 'account:status',
  ACCOUNT_SIGN_IN: 'account:signIn',
  ACCOUNT_SIGN_OUT: 'account:signOut',
  EASYWORSHIP_STATUS: 'easyworship:status',
  EASYWORSHIP_COPY: 'easyworship:copy',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  STATE_GET: 'state:get',
  DISPLAYS: 'window:displays',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
  WINDOW_MAXIMIZED: 'window:maximized',
  SESSIONS_LIST: 'sessions:list',
  SESSIONS_RENAME: 'sessions:rename',
  SESSIONS_CLEAR: 'sessions:clear',
  LOG: 'log',
  STATE_UPDATE: 'state:update'
} as const
