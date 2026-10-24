import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { SessionInfo } from '../shared/ipc'
import { logger } from './logger'

const MAX_SESSIONS = 100

let sessions: SessionInfo[] = []
let currentId: string | null = null
let loaded = false

function file(): string {
  return path.join(app.getPath('userData'), 'sessions.json')
}

function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as SessionInfo[]
    sessions = Array.isArray(raw) ? raw.slice(0, MAX_SESSIONS) : []
  } catch {
    sessions = []
  }
}

function persist(): void {
  try {
    fs.writeFileSync(file(), JSON.stringify(sessions, null, 2), 'utf8')
  } catch (err) {
    logger.warn('sessions persist failed', String(err))
  }
}

function defaultLabel(): string {
  const d = new Date()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `Session · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}

export function startSession(hadOutput: boolean): void {
  ensureLoaded()
  const id = new Date().toISOString()
  currentId = id
  sessions.unshift({ id, label: defaultLabel(), startedAt: Date.now(), endedAt: null, hadOutput })
  sessions = sessions.slice(0, MAX_SESSIONS)
  persist()
}

export function markSessionOutput(open: boolean): void {
  if (!currentId) return
  const s = sessions.find((x) => x.id === currentId)
  if (s) {
    s.hadOutput = open
    persist()
  }
}

export function endSession(): void {
  if (!currentId) return
  const s = sessions.find((x) => x.id === currentId)
  if (s) {
    s.endedAt = Date.now()
    persist()
  }
  currentId = null
}

export function listSessions(): SessionInfo[] {
  ensureLoaded()
  return sessions
}

export function renameSession(id: string, label: string): SessionInfo[] {
  ensureLoaded()
  const s = sessions.find((x) => x.id === id)
  const trimmed = label.trim()
  if (s && trimmed) {
    s.label = trimmed
    persist()
  }
  return sessions
}

export function clearSessions(): SessionInfo[] {
  ensureLoaded()
  sessions = currentId ? sessions.filter((x) => x.id === currentId) : []
  persist()
  return sessions
}

export function lastClosedSessionHadOutput(): boolean {
  ensureLoaded()
  const closed = sessions.find((x) => x.endedAt !== null)
  return closed?.hadOutput === true
}
