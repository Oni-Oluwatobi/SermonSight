import { referenceParser } from '../../core/recognition/ReferenceParser'
import type { ScriptureRepository, ScriptureRef } from '../../core/database/ScriptureRepository'
import type { Passage } from '../../shared/ipc'
import { logger } from '../logger'
import { getState, patch } from '../state'
import { databaseService } from '../database/DatabaseService'

export type PreviewSource = 'manual' | 'candidate' | null

let previewSource: PreviewSource = null

export function getPreviewSource(): PreviewSource {
  return previewSource
}

function repo(): ScriptureRepository | null {
  return databaseService.getRepository()
}

function resolvePassage(reference: string, translation: string): { passage: Passage | null; error: string | null } {
  const r = repo()
  if (!r) return { passage: null, error: 'Scripture database is not loaded.' }
  const parsed = referenceParser.parseFirst(reference)
  if (!parsed || parsed.chapter == null) {
    return { passage: null, error: `Could not resolve reference "${reference}".` }
  }
  const ref: ScriptureRef = {
    book: parsed.book,
    chapter: parsed.chapter,
    verse: parsed.verse,
    verseEnd: parsed.verseEnd
  }
  const passage = r.getPassage(ref, translation)
  if (!passage) {
    const available = r.hasTranslation(translation) && r.translationHasVerses(translation)
    return {
      passage: null,
      error: available
        ? `No text found for "${reference}" in ${translation}.`
        : `${translation} is not available in this database.`
    }
  }
  return { passage, error: null }
}

/** Preview: operator-facing only. Never reaches the live output. */
export function setPreview(reference: string, source: PreviewSource = 'manual'): { ok: boolean; error: string | null } {
  const { passage, error } = resolvePassage(reference, getState().translation)
  if (!passage) return { ok: false, error }
  previewSource = source
  patch({ preview: passage })
  logger.info('preview set', { reference: passage.reference, source })
  return { ok: true, error: null }
}

export function setPreviewPassage(passage: Passage | null, source: PreviewSource = 'manual'): void {
  previewSource = passage ? source : null
  patch({ preview: passage })
}

/**
 * Publish the passage to the live output.
 * Callers must be human-confirmed actions only.
 */
export function setLive(reference: string): { ok: boolean; error: string | null } {
  const { passage, error } = resolvePassage(reference, getState().translation)
  if (!passage) return { ok: false, error }
  const p = getState().presentation
  patch({ live: passage, presentation: { ...p, page: 0, pageCount: 1 } })
  logger.info('live set', { reference: passage.reference, translation: passage.translation })
  return { ok: true, error: null }
}

export function setBlack(on?: boolean): boolean {
  const next = on ?? !getState().black
  patch({ black: next })
  logger.info('black screen', { on: next })
  return next
}

/**
 * Advance: pages first (long passages are paginated by the output window),
 * then the adjacent passage. Page state is owned here so every control path
 * (keyboard, dashboard, phone remote) pages transparently.
 */
export function advanceLive(direction: 1 | -1): boolean {
  const state = getState()
  if (!state.live || state.live.verses.length === 0) return false
  const { page, pageCount } = state.presentation
  if (direction === 1 && pageCount > 1 && page < pageCount - 1) {
    patch({ presentation: { ...state.presentation, page: page + 1 } })
    logger.debug('presentation paged', { page: page + 1, pageCount })
    return true
  }
  if (direction === -1 && pageCount > 1 && page > 0) {
    patch({ presentation: { ...state.presentation, page: page - 1 } })
    logger.debug('presentation paged', { page: page - 1, pageCount })
    return true
  }
  const r = repo()
  if (!r) return false
  const anchor = direction === 1 ? state.live.verses[state.live.verses.length - 1] : state.live.verses[0]
  const next = r.adjacentVerse(anchor, direction, state.live.translation)
  if (!next) return false
  patch({ live: next, presentation: { ...state.presentation, page: 0, pageCount: 1 } })
  logger.debug('presentation advanced', { direction, reference: next.reference })
  return true
}

/** Switch translation in place — same canonical reference, new source text. */
export function switchTranslation(abbr: string): { ok: boolean; error: string | null } {
  const state = getState()
  const target = abbr.toUpperCase()
  if (target === state.translation) return { ok: true, error: null }
  const r = repo()
  if (!r) return { ok: false, error: 'Scripture database is not loaded.' }
  if (!r.hasTranslation(target) || !r.translationHasVerses(target)) {
    return { ok: false, error: `${target} is not available in this database.` }
  }

  let live = state.live
  let preview = state.preview
  if (live) {
    const res = resolvePassage(live.reference, target)
    if (res.passage) live = res.passage
    else logger.warn('live passage unavailable in new translation', { reference: live.reference, target })
  }
  if (preview) {
    const res = resolvePassage(preview.reference, target)
    if (res.passage) preview = res.passage
  }
  patch({
    translation: target,
    live,
    preview,
    presentation: { ...getState().presentation, page: 0, pageCount: 1 }
  })
  logger.info('translation switched', { translation: target })
  return { ok: true, error: null }
}
