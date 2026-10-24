import fs from 'fs'
import path from 'path'
import { clipboard } from 'electron'
import { getState } from '../state'
import { logger } from '../logger'

export interface EasyWorshipStatus {
  detected: boolean
  version: string | null
  installPaths: string[]
  /** Free, local integration methods actually available. */
  methods: string[]
  note: string
}

let cached: EasyWorshipStatus | null = null

/**
 * EasyWorship compatibility layer.
 *
 * Free/local methods only: detect installed EasyWorship versions from the
 * filesystem (Program Files / Start Menu), and offer a clipboard hand-off of the
 * current Scripture for pasting into EasyWorship's Bible input. No paid APIs,
 * no SDKs, no DRM/activation interference. SermonSight never depends on
 * EasyWorship being installed — detection failure or absence changes nothing.
 */
function scanRoots(): string[] {
  const found: string[] = []
  const roots = [
    process.env['ProgramFiles'] ?? 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    process.env['ProgramData'] ?? 'C:\\ProgramData'
  ]
  for (const root of roots) {
    let entries: string[] = []
    try {
      entries = fs.readdirSync(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!/easyworship/i.test(entry)) continue
      const full = path.join(root, entry)
      found.push(full)
      continue
    }
    // EasyWorship 7/9/2019 commonly live under vendor folders (e.g. SoftTouch)
    for (const vendor of entries) {
      if (!/softtouch|EasyWorship/i.test(vendor)) continue
      const vendorDir = path.join(root, vendor)
      try {
        const st = fs.statSync(vendorDir)
        if (!st.isDirectory()) continue
        for (const sub of fs.readdirSync(vendorDir)) {
          if (/easyworship/i.test(sub)) found.push(path.join(vendorDir, sub))
        }
      } catch {
        /* ignore */
      }
    }
  }
  // Start Menu shortcuts (works even when binaries live elsewhere)
  const sm = path.join(
    process.env['ProgramData'] ?? 'C:\\ProgramData',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs'
  )
  try {
    for (const entry of walk(sm, 3)) {
      if (/easyworship/i.test(entry)) {
        const full = path.join(sm, entry)
        if (!found.some((f) => f.toLowerCase() === full.toLowerCase())) found.push(full)
      }
    }
  } catch {
    /* ignore */
  }
  return found
}

function walk(dir: string, depth: number): string[] {
  if (depth <= 0) return []
  let out: string[] = []
  try {
    for (const entry of fs.readdirSync(dir)) {
      out.push(entry)
      try {
        if (fs.statSync(path.join(dir, entry)).isDirectory()) {
          out = out.concat(walk(path.join(dir, entry), depth - 1).map((e) => path.join(entry, e)))
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return out
}

function versionFromName(name: string): string | null {
  const m = /easyworship\s*(20\d{2}|\d+)/i.exec(name)
  return m ? m[1] : null
}

export function getEasyWorshipStatus(): EasyWorshipStatus {
  if (cached) return cached
  try {
    const installPaths = scanRoots()
    const versions = installPaths
      .map((p) => versionFromName(path.basename(p)))
      .filter((v): v is string => !!v)
    const detected = installPaths.length > 0
    const version = versions.length > 0 ? versions[versions.length - 1] : null
    cached = {
      detected,
      version,
      installPaths,
      methods: detected ? ['clipboard', 'sermonsight-output'] : ['sermonsight-output'],
      note: detected
        ? 'EasyWorship found. Coexistence mode: SermonSight keeps its own output window and can copy the current Scripture to the clipboard for pasting into EasyWorship. No paid integration is used.'
        : 'EasyWorship not found. SermonSight runs fully standalone with its own presentation output.'
    }
    logger.info('easyworship detection', {
      detected: cached.detected,
      version: cached.version,
      paths: installPaths.length
    })
  } catch (err) {
    logger.warn('easyworship detection failed', String(err))
    cached = {
      detected: false,
      version: null,
      installPaths: [],
      methods: ['sermonsight-output'],
      note: 'EasyWorship detection unavailable; SermonSight runs standalone.'
    }
  }
  return cached
}

/** Copy the current (live, else preview) Scripture to the clipboard for EasyWorship. */
export function copyCurrentForEasyWorship(): { ok: boolean; error: string | null; text: string | null } {
  const s = getState()
  const passage = s.live ?? s.preview
  if (!passage || passage.verses.length === 0) {
    return { ok: false, error: 'Nothing is displayed yet. Show a passage first.', text: null }
  }
  const verseLines = passage.verses.map((v) => v.text.trim())
  const text = `${passage.reference} (${passage.translation})\n${verseLines.join(' ')}`
  try {
    clipboard.writeText(text)
    logger.info('scripture copied for easyworship', { reference: passage.reference })
    return { ok: true, error: null, text }
  } catch (err) {
    return { ok: false, error: String(err), text: null }
  }
}
