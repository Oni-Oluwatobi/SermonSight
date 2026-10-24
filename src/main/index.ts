import { app } from 'electron'
import { initLogger, logger } from './logger'
import { loadSettings } from './settings'
import { patch, patchAccount, patchPresentation, patchStt, setBroadcaster } from './state'
import { databaseService } from './database/DatabaseService'
import { searchService } from './database/SearchService'
import {
  registerIpcHandlers,
  pushStateToRemote,
  shutdownSubsystems,
  startRemote
} from './ipc'
import { broadcastState, createOperatorWindow, getOperatorWindow, getPresentationWindow, openPresentationWindow } from './windows'
import { startSession, endSession, markSessionOutput, lastClosedSessionHadOutput } from './sessions'
import { sttHost } from './stt/SttHost'
import { handleFinalTranscript, handlePartialTranscript } from './recognition/RecognitionService'
import { accountProvider } from './account/AccountProvider'

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // focus the existing operator window instead of starting twice
    const win = getOperatorWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    const settings = loadSettings()
    initLogger(settings.logLevel)
    logger.info('sermonsight starting', {
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node
    })

    registerIpcHandlers()

    // offline STT events -> recognition (never blocks presentation)
    sttHost.onEvent((e) => {
      if (e.type === 'status') {
        patchStt({ state: e.state, engine: e.engine, message: e.message })
      } else if (e.type === 'partial') {
        handlePartialTranscript(e.text ?? '')
      } else if (e.type === 'final') {
        void handleFinalTranscript(e.text ?? '')
      }
    })

    // load Scripture database (startup integrity checks only — no full scans)
    const dbStatus = databaseService.reload()
    if (dbStatus.state === 'loaded') {
      // pre-spawn the search worker so the first search pays no process-start cost
      searchService.warm()
    }
    patch({
      db: dbStatus,
      translation: settings.translation,
      presentation: {
        theme: settings.theme,
        showReference: settings.showReference,
        showTranslationBadge: settings.showTranslationBadge,
        fontSizePct: settings.fontSizePct,
        displayId: settings.displayId,
        windowOpen: false,
        fullscreen: false,
        page: 0,
        pageCount: 1
      }
    })

    // state broadcast: operator UI + presentation window + phone remote
    setBroadcaster((state) => {
      broadcastState(state)
      pushStateToRemote()
    })

    // account layer: local device registration, cloud optional
    try {
      patchAccount(accountProvider.registerDevice())
    } catch (err) {
      logger.warn('device registration skipped', String(err))
    }

    createOperatorWindow()

    startSession(false)
    if (settings.openLastSession && lastClosedSessionHadOutput()) {
      openPresentationWindow()
    }

    if (settings.remoteEnabled) {
      void startRemote()
    }

    app.on('activate', () => {
      if (getOperatorWindow() === null) createOperatorWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    logger.info('sermonsight shutting down')
    try {
      markSessionOutput(getPresentationWindow() !== null)
      endSession()
    } catch (err) {
      logger.warn('session close failed', String(err))
    }
    shutdownSubsystems()
    logger.flush()
  })

  // Reliability: errors are logged, the app keeps running (§29 — never crash).
  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception', String(err?.stack ?? err))
  })
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', String(reason))
  })
}
