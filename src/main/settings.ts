import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { SettingsShape, ThemeId } from '../shared/ipc'
import { logger } from './logger'

const DEFAULTS: SettingsShape = {
  dbPath: null,
  translation: 'KJV',
  theme: 'classic',
  appTheme: 'dark',
  showReference: true,
  showTranslationBadge: false,
  fontSizePct: 100,
  displayId: null,
  remoteEnabled: false,
  remotePort: 7433,
  listenEnabled: false,
  logLevel: 'info',
  openLastSession: false
}

let cached: SettingsShape | null = null

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): SettingsShape {
  if (cached) return cached
  try {
    const raw = fs.readFileSync(settingsFile(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<SettingsShape>
    cached = { ...DEFAULTS, ...parsed }
  } catch {
    cached = { ...DEFAULTS }
  }
  return cached
}

export function saveSettings(next: Partial<SettingsShape>): SettingsShape {
  const merged = { ...loadSettings(), ...normalize(next) }
  cached = merged
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(merged, null, 2), 'utf8')
    logger.info('settings saved', next)
  } catch (err) {
    logger.error('failed to save settings', String(err))
  }
  return merged
}

function normalize(p: Partial<SettingsShape>): Partial<SettingsShape> {
  const out: Partial<SettingsShape> = {}
  const keys = Object.keys(DEFAULTS) as (keyof SettingsShape)[]
  for (const k of keys) {
    const v = p[k]
    if (v === undefined) continue
    if (k === 'theme' && !['classic', 'minimal', 'dark'].includes(String(v))) continue
    if (k === 'appTheme' && !['dark', 'light'].includes(String(v))) continue
    if (k === 'openLastSession' && typeof v !== 'boolean') continue
    if (k === 'logLevel' && !['debug', 'info', 'warn', 'error'].includes(String(v))) continue
    ;(out as Record<string, unknown>)[k] = v
  }
  return out
}

export function defaultTheme(): ThemeId {
  return loadSettings().theme
}
