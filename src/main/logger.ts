import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

let minLevel: number = LEVELS.info
let logFile: string | null = null
let buffer: string[] = []
let flushTimer: NodeJS.Timeout | null = null

export function initLogger(level: LogLevel = 'info'): void {
  try {
    const dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().slice(0, 10)
    logFile = path.join(dir, `sermonsight-${stamp}.log`)
  } catch {
    logFile = null
  }
  setLogLevel(level)
  log('info', 'application starting')
}

export function setLogLevel(level: LogLevel): void {
  minLevel = LEVELS[level] ?? LEVELS.info
}

function flush(): void {
  if (!logFile || buffer.length === 0) return
  const lines = buffer.join('') + ''
  buffer = []
  try {
    fs.appendFileSync(logFile, lines)
  } catch {
    /* logging must never crash the app */
  }
}

export function log(level: LogLevel, message: string, data?: unknown): void {
  if (LEVELS[level] < minLevel) return
  const time = new Date().toISOString()
  const extra = data !== undefined ? ` ${safeJson(data)}` : ''
  const line = `[${time}] [${level.toUpperCase()}] ${message}${extra}\n`
  buffer.push(line)
  if (buffer.length > 200) flush()
  else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, 1500)
    flushTimer.unref?.()
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export const logger = {
  debug: (m: string, d?: unknown) => log('debug', m, d),
  info: (m: string, d?: unknown) => log('info', m, d),
  warn: (m: string, d?: unknown) => log('warn', m, d),
  error: (m: string, d?: unknown) => log('error', m, d),
  flush
}
