import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC, type AudioStreamMessage, type SearchResponse, type SettingsShape } from '../shared/ipc'
import { databaseService } from './database/DatabaseService'
import { searchService } from './database/SearchService'
import { getState, patch, patchAccount, patchPresentation, patchRemote } from './state'
import {
  advanceLive,
  setBlack,
  setLive,
  setPreview,
  switchTranslation
} from './presentation/PresentationController'
import {
  cancelSpeechSearches,
  confirmCandidate,
  handleFinalTranscript,
  handlePartialTranscript,
  refreshCandidateTexts,
  rejectCandidate,
  selectCandidate
} from './recognition/RecognitionService'
import {
  closePresentationWindow,
  listDisplays,
  openPresentationWindow,
  setPresentationDisplay,
  togglePresentationFullscreen,
  minimizeOperatorWindow,
  toggleMaximizeOperatorWindow,
  closeOperatorWindow,
  isOperatorMaximized
} from './windows'
import { listSessions, renameSession, clearSessions } from './sessions'
import { localServer } from './remote/LocalServer'
import { getEasyWorshipStatus, copyCurrentForEasyWorship } from './integration/EasyWorship'
import { accountProvider } from './account/AccountProvider'
import { loadSettings, saveSettings } from './settings'
import { setLogLevel, logger } from './logger'
import { sttHost } from './stt/SttHost'

type IpcEvent = Electron.IpcMainInvokeEvent

export function registerIpcHandlers(): void {
  // ---------- database ----------
  ipcMain.handle(IPC.DB_CHOOSE, async (e: IpcEvent) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: Electron.OpenDialogOptions = {
      title: 'Choose Scripture Database',
      properties: ['openFile'],
      filters: [
        { name: 'SermonSight Database', extensions: ['ss'] },
        { name: 'SQLite Database', extensions: ['sqlite', 'db'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return databaseService.getStatus()
    saveSettings({ dbPath: res.filePaths[0] })
    const status = databaseService.choosePath(res.filePaths[0])
    patch({ db: status })
    return status
  })

  ipcMain.handle(IPC.DB_RELOAD, () => {
    const status = databaseService.reload()
    patch({ db: status })
    return status
  })

  ipcMain.handle(IPC.DB_STATUS, () => databaseService.getStatus())

  // ---------- scripture ----------
  ipcMain.handle(IPC.SCRIPTURE_SEARCH, (_e, query: unknown, translation: unknown): Promise<SearchResponse> => {
    const q = String(query ?? '')
    const t = String(translation ?? getState().translation)
    // Runs in the search worker child process (never blocks the main process);
    // operator searches are superseded by newer queued operator searches.
    return searchService.search(q, t, undefined, { canSkip: true })
  })

  ipcMain.handle(IPC.SCRIPTURE_TRANSLATIONS, () => databaseService.getStatus().translations)

  // ---------- preview / live ----------
  ipcMain.handle(IPC.PREVIEW_SET, (_e, reference: unknown) =>
    setPreview(String(reference ?? ''), 'manual')
  )
  ipcMain.handle(IPC.PRESENT_SET, (_e, reference: unknown) => setLive(String(reference ?? '')))
  ipcMain.handle(IPC.PRESENTATION_BLACK, (_e, on: unknown) =>
    setBlack(typeof on === 'boolean' ? on : undefined)
  )
  ipcMain.handle(IPC.PRESENTATION_NEXT, () => advanceLive(1))
  ipcMain.handle(IPC.PRESENTATION_PREV, () => advanceLive(-1))
  ipcMain.handle(IPC.PRESENTATION_OPEN, () => openPresentationWindow())
  ipcMain.handle(IPC.PRESENTATION_CLOSE, () => {
    closePresentationWindow()
    return true
  })
  ipcMain.handle(IPC.PRESENTATION_FULLSCREEN, () => togglePresentationFullscreen())
  ipcMain.handle(IPC.PRESENTATION_SET_DISPLAY, (_e, displayId: unknown) => {
    setPresentationDisplay(typeof displayId === 'number' ? displayId : null)
    return true
  })
  ipcMain.handle(IPC.PRESENTATION_SETTINGS, (_e, settings: unknown) => {
    const s = (settings ?? {}) as Partial<SettingsShape>
    applySettings(s)
    return getState().presentation
  })
  // Reported by the output window after measuring how many pages a passage needs.
  ipcMain.on(IPC.PRESENTATION_PAGE, (_e, page: unknown, pageCount: unknown) => {
    const pc = Math.max(1, Math.floor(Number(pageCount) || 1))
    const p = Math.min(Math.max(0, Math.floor(Number(page) || 0)), pc - 1)
    const cur = getState().presentation
    if (cur.page === p && cur.pageCount === pc) return
    patchPresentation({ page: p, pageCount: pc })
  })

  // ---------- candidates ----------
  ipcMain.handle(IPC.CANDIDATE_SELECT, (_e, index: unknown) => selectCandidate(Number(index)))
  ipcMain.handle(IPC.CANDIDATE_CONFIRM, (_e, id: unknown) =>
    confirmCandidate(typeof id === 'string' ? id : undefined)
  )
  ipcMain.handle(IPC.CANDIDATE_REJECT, (_e, id: unknown) =>
    rejectCandidate(typeof id === 'string' ? id : undefined)
  )

  // manual transcript injection (recognition test tool, mirrors STT output)
  ipcMain.handle(IPC.TRANSCRIPT, (_e, text: unknown, partial: unknown) => {
    const t = String(text ?? '').trim()
    if (!t) return { ok: false, error: 'Empty transcript.' }
    if (partial === true) handlePartialTranscript(t)
    else void handleFinalTranscript(t)
    return { ok: true, error: null }
  })

  // ---------- translation ----------
  ipcMain.handle(IPC.TRANSLATION_SET, (_e, abbr: unknown) => {
    const res = switchTranslation(String(abbr ?? ''))
    if (res.ok) refreshCandidateTexts()
    return res
  })

  // ---------- audio stream (renderer -> main) ----------
  ipcMain.on(IPC.AUDIO_STREAM, (_e, msg: AudioStreamMessage) => {
    if (!msg || typeof msg !== 'object') return
    try {
      if (msg.type === 'pcm') {
        sttHost.feed(msg.data instanceof Uint8Array ? msg.data : new Uint8Array(msg.data as ArrayBuffer))
      } else if (msg.type === 'flush') {
        sttHost.flush()
      } else if (msg.type === 'status') {
        logger.info('audio status', { listening: msg.listening, error: msg.error ?? null, pid: process.pid })
        if (msg.listening) {
          sttHost.start()
        } else {
          // Mic off: drop any in-flight transcript search so a stale result can
          // never change candidates/preview after listening stopped.
          cancelSpeechSearches()
          sttHost.pause()
        }
        if (msg.error) logger.warn('audio input status', msg.error)
      }
    } catch (err) {
      logger.error('audio stream handling failed', String(err))
    }
  })

  // ---------- remote ----------
  ipcMain.handle(IPC.REMOTE_STATUS, () => ({
    ...localServer.getStatus(),
    qr: localServer.getQr()
  }))
  ipcMain.handle(IPC.REMOTE_SET_ENABLED, async (_e, enabled: unknown) => {
    if (enabled) await startRemote()
    else stopRemote()
    return getState().remote
  })
  ipcMain.handle(IPC.REMOTE_NEW_PIN, () => {
    const pin = localServer.newPin()
    if (!pin) return { pin: null, expiresAt: null, qr: localServer.getQr() }
    patchRemote({ pin: pin.pin, pinExpiresAt: pin.expiresAt })
    return { pin: pin.pin, expiresAt: pin.expiresAt, qr: localServer.getQr() }
  })

  // ---------- account ----------
  ipcMain.handle(IPC.ACCOUNT_STATUS, () => accountProvider.status())
  ipcMain.handle(IPC.ACCOUNT_SIGN_IN, async (_e, email: unknown, password: unknown) => {
    const status = await accountProvider.signIn(String(email ?? ''), String(password ?? ''))
    patchAccount(status)
    return status
  })
  ipcMain.handle(IPC.ACCOUNT_SIGN_OUT, async () => {
    const status = await accountProvider.signOut()
    patchAccount(status)
    return status
  })

  // ---------- EasyWorship (optional, free/local only) ----------
  ipcMain.handle(IPC.EASYWORSHIP_STATUS, () => getEasyWorshipStatus())
  ipcMain.handle(IPC.EASYWORSHIP_COPY, () => copyCurrentForEasyWorship())

  // ---------- settings ----------
  ipcMain.handle(IPC.SETTINGS_GET, () => loadSettings())
  ipcMain.handle(IPC.SETTINGS_SET, (_e, partial: unknown) => {
    applySettings((partial ?? {}) as Partial<SettingsShape>)
    return loadSettings()
  })

  // ---------- misc ----------
  ipcMain.handle(IPC.STATE_GET, () => getState())
  ipcMain.handle(IPC.STT_STATUS, () => sttHost.status())
  ipcMain.handle(IPC.DISPLAYS, () => listDisplays())
  ipcMain.handle(IPC.LOG, (_e, level: unknown, message: unknown, data: unknown) => {
    const lv = ['debug', 'info', 'warn', 'error'].includes(String(level))
      ? (String(level) as 'debug' | 'info' | 'warn' | 'error')
      : 'info'
    logger[lv](String(message ?? ''), data)
  })

  // ---------- window controls (custom title bar) ----------
  ipcMain.handle(IPC.WINDOW_MINIMIZE, () => {
    minimizeOperatorWindow()
    return true
  })
  ipcMain.handle(IPC.WINDOW_MAXIMIZE, () => toggleMaximizeOperatorWindow())
  ipcMain.handle(IPC.WINDOW_CLOSE, () => {
    closeOperatorWindow()
    return true
  })
  ipcMain.handle(IPC.WINDOW_IS_MAXIMIZED, () => isOperatorMaximized())

  // ---------- sessions (Hub / open-last-session) ----------
  ipcMain.handle(IPC.SESSIONS_LIST, () => listSessions())
  ipcMain.handle(IPC.SESSIONS_RENAME, (_e, id: unknown, label: unknown) =>
    renameSession(String(id ?? ''), String(label ?? ''))
  )
  ipcMain.handle(IPC.SESSIONS_CLEAR, () => clearSessions())
}

/** Persist settings and apply their side effects. */
export function applySettings(s: Partial<SettingsShape>): void {
  const saved = saveSettings(s)
  if (s.logLevel) setLogLevel(saved.logLevel)
  if (s.dbPath !== undefined && s.dbPath !== null) {
    const status = databaseService.choosePath(saved.dbPath)
    patch({ db: status })
  }
  if (s.translation !== undefined) {
    const res = switchTranslation(saved.translation)
    if (res.ok) refreshCandidateTexts()
    else logger.warn('translation switch rejected', res.error)
  }
  if (
    s.theme !== undefined ||
    s.showReference !== undefined ||
    s.showTranslationBadge !== undefined ||
    s.fontSizePct !== undefined
  ) {
    patchPresentation({
      theme: saved.theme,
      showReference: saved.showReference,
      showTranslationBadge: saved.showTranslationBadge,
      fontSizePct: saved.fontSizePct
    })
  }
  if (s.displayId !== undefined) setPresentationDisplay(saved.displayId)
  if (s.remoteEnabled !== undefined || s.remotePort !== undefined) {
    if (saved.remoteEnabled) void startRemote()
    else stopRemote()
  }
  if (s.remotePort !== undefined && saved.remoteEnabled) void startRemote()
}

export async function startRemote(): Promise<void> {
  patchRemote({ state: 'starting', error: null })
  const status = await localServer.start({
    port: loadSettings().remotePort,
    // Real WebSocket connections drive AppState.remote.clients — the UI count is
    // never faked or snapshotted from server start (it used to stay 0 forever).
    onClientsChange: (clients) => patchRemote({ clients }),
    onCommand: (cmd) => {
      switch (cmd) {
        case 'confirm':
          confirmCandidate()
          break
        case 'reject':
          rejectCandidate()
          break
        case 'next':
          advanceLive(1)
          break
        case 'prev':
          advanceLive(-1)
          break
        case 'black':
          setBlack()
          break
      }
    },
    // Phone-side Scripture control: search / display / translate.
    // The database never leaves the laptop — only requests/results cross the LAN.
    rpcHandler: async (op, payload) => {
      switch (op) {
        case 'search': {
          const q = String(payload.query ?? '')
          const t = String(payload.translation ?? getState().translation)
          return searchService.search(q, t, undefined, { canSkip: true })
        }
        case 'setPreview':
          return setPreview(String(payload.reference ?? ''), 'manual')
        case 'setLive':
          return setLive(String(payload.reference ?? ''))
        case 'adjacent':
          return advanceLive(Number(payload.direction) === -1 ? -1 : 1)
        case 'setTranslation': {
          const res = switchTranslation(String(payload.translation ?? ''))
          if (res.ok) refreshCandidateTexts()
          return res
        }
        case 'getState':
          return getState()
        default:
          throw new Error(`unknown op: ${op}`)
      }
    }
  })
  // Re-read the live count: a phone may have connected between the snapshot
  // inside start() and this patch — never overwrite a real count with a stale 0.
  patchRemote({ ...status, clients: localServer.getStatus().clients })
}

export function stopRemote(): void {
  localServer.stop()
  patchRemote({
    state: 'disabled',
    url: null,
    lanIp: null,
    port: null,
    pin: null,
    pinExpiresAt: null,
    clients: 0,
    error: null
  })
}

export function pushStateToRemote(): void {
  if (localServer.getStatus().state === 'running') {
    localServer.broadcastState(JSON.stringify({ type: 'state', state: getState() }))
  }
}

export function shutdownSubsystems(): void {
  try {
    stopRemote()
  } catch {
    /* ignore */
  }
  try {
    sttHost.stop()
  } catch {
    /* ignore */
  }
  try {
    searchService.dispose()
  } catch {
    /* ignore */
  }
  try {
    databaseService.close()
  } catch {
    /* ignore */
  }
}
