import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { IPC } from '../shared/ipc'
import type { AppState, DisplayInfo } from '../shared/ipc'
import { logger } from './logger'
import { patchPresentation } from './state'
import { loadSettings, saveSettings } from './settings'

let operatorWindow: BrowserWindow | null = null
let presentationWindow: BrowserWindow | null = null

export function createOperatorWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: '#0a0a0f',
    title: 'SermonSight',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
    if (!win.webContents.isDevToolsOpened() && process.env['SERMONSIGHT_DEVTOOLS'] === '1') {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  })

  const broadcastMaximized = (): void => {
    if (!win.isDestroyed()) win.webContents.send(IPC.WINDOW_MAXIMIZED, win.isMaximized())
  }
  win.on('maximize', broadcastMaximized)
  win.on('unmaximize', broadcastMaximized)

  win.on('closed', () => {
    operatorWindow = null
  })

  operatorWindow = win
  loadRenderer(win, '')
  return win
}

export function minimizeOperatorWindow(): void {
  getOperatorWindow()?.minimize()
}

export function toggleMaximizeOperatorWindow(): boolean {
  const win = getOperatorWindow()
  if (!win) return false
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
  return win.isMaximized()
}

export function closeOperatorWindow(): void {
  getOperatorWindow()?.close()
}

export function isOperatorMaximized(): boolean {
  return getOperatorWindow()?.isMaximized() ?? false
}

export function getOperatorWindow(): BrowserWindow | null {
  return operatorWindow && !operatorWindow.isDestroyed() ? operatorWindow : null
}

export function getPresentationWindow(): BrowserWindow | null {
  return presentationWindow && !presentationWindow.isDestroyed() ? presentationWindow : null
}

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Display ${i + 1}`,
    bounds: { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height },
    primary: d.id === primaryId
  }))
}

function targetDisplay(): Electron.Display {
  const displays = screen.getAllDisplays()
  const configuredId = loadSettings().displayId
  if (configuredId != null) {
    const found = displays.find((d) => d.id === configuredId)
    if (found) return found
  }
  if (displays.length > 1) {
    const op = getOperatorWindow()
    const opDisplay = op ? screen.getDisplayMatching(op.getBounds()) : screen.getPrimaryDisplay()
    return displays.find((d) => d.id !== opDisplay.id) ?? screen.getPrimaryDisplay()
  }
  return screen.getPrimaryDisplay()
}

export function openPresentationWindow(): boolean {
  try {
    const existing = getPresentationWindow()
    if (existing) {
      existing.show()
      existing.focus()
      patchPresentation({ windowOpen: true })
      return true
    }

    const display = targetDisplay()
    const displays = screen.getAllDisplays()
    const op = getOperatorWindow()
    const opDisplay = op ? screen.getDisplayMatching(op.getBounds()) : screen.getPrimaryDisplay()
    const isExternal = display.id !== opDisplay.id || displays.length > 1

    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: Math.min(1280, display.bounds.width),
      height: Math.min(720, display.bounds.height),
      show: false,
      backgroundColor: '#000000',
      title: 'SermonSight Presentation',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    win.once('ready-to-show', () => {
      win.show()
      if (isExternal) {
        win.setFullScreen(true)
        patchPresentation({ fullscreen: true })
      }
    })
    win.on('closed', () => {
      presentationWindow = null
      patchPresentation({ windowOpen: false, fullscreen: false })
    })

    presentationWindow = win
    loadRenderer(win, 'presentation')
    patchPresentation({ windowOpen: true, displayId: display.id })
    logger.info('presentation window opened', { display: display.label, external: isExternal })
    return true
  } catch (err) {
    logger.error('failed to open presentation window', String(err))
    return false
  }
}

export function closePresentationWindow(): void {
  const win = getPresentationWindow()
  if (win) win.close()
}

export function togglePresentationFullscreen(): boolean {
  const win = getPresentationWindow()
  if (!win) return false
  const next = !win.isFullScreen()
  win.setFullScreen(next)
  patchPresentation({ fullscreen: next })
  return next
}

export function setPresentationDisplay(displayId: number | null): void {
  saveSettings({ displayId })
  patchPresentation({ displayId })
  if (getPresentationWindow()) {
    closePresentationWindow()
    setTimeout(() => openPresentationWindow(), 250)
  }
}

export function broadcastState(state: AppState): void {
  const op = getOperatorWindow()
  if (op && !op.isDestroyed()) {
    op.webContents.send('state:update', state)
  }
  const pres = getPresentationWindow()
  if (pres && !pres.isDestroyed()) {
    pres.webContents.send('state:update', state)
  }
}

function loadRenderer(win: BrowserWindow, query: string): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(query ? `${devUrl}/?window=${query}` : devUrl)
  } else if (query) {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { window: query } })
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}
