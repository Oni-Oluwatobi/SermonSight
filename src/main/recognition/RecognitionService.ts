import { BOOKS, BOOK_BY_NAME } from '../../core/canon/books'
import { referenceParser, parseCanonicalId } from '../../core/recognition/ReferenceParser'
import { ScriptureMatcher, snippetOf, parsedReferenceConfidence } from '../../core/recognition/ScriptureMatcher'
import { scorePhraseMatch, significantTokens } from '../../core/recognition/ConfidenceScorer'
import { buildCandidates } from '../../core/recognition/CandidateEngine'
import type { CandidateDraft } from '../../core/recognition/ScriptureMatcher'
import type { ScriptureRepository } from '../../core/database/ScriptureRepository'
import type { Candidate } from '../../shared/ipc'
import { databaseService } from '../database/DatabaseService'
import { searchService } from '../database/SearchService'
import { getState, patch, patchCandidates } from '../state'
import { setPreview, setPreviewPassage, setLive } from '../presentation/PresentationController'
import { logger } from '../logger'

const CANDIDATE_TTL_MS = 5 * 60 * 1000
const MAX_CANDIDATES = 5
// Partial transcripts arrive at up to 4/s from the STT worker; each one patched the
// full AppState and triggered a broadcast. Cap the display-only updates at ~3/s —
// the search scheduler below dedups by query text, so no search is lost.
const PARTIAL_PATCH_MIN_INTERVAL_MS = 300
let lastPartialPatchAt = 0

// ---- streaming search scheduler -------------------------------------------------
// Partials AND finals both go through ONE search pipeline with no debounce:
// the first meaningful query change searches immediately, identical queries are
// deduplicated, and at most one search runs at a time (newer queries coalesce,
// latest wins). Latest-wins seq: a superseded search never touches the UI.
let searchSeq = 0
let searchRunning = false
let scheduledSearch: { text: string; final: boolean } | null = null
let lastAppliedQuery = ''

function repo(): ScriptureRepository | null {
  return databaseService.getRepository()
}

/** Normalize a DB canonical id into the app's canonical key form. */
function normalizeCanonicalKey(id: string): string {
  const p = parseCanonicalId(id)
  if (!p) return id
  const my =
    BOOKS.find((b) => b.code.toLowerCase() === p.code.toLowerCase()) ??
    BOOK_BY_NAME.get(p.code.toLowerCase())
  if (!my) return id
  return `${my.code}.${p.chapter}.${p.verse}`
}

function currentExclusions(): Set<string> {
  // Live passages only. The PREVIEW is candidate-driven and transient: while a
  // phrase keeps streaming, the top candidate must stay in the list even after
  // it has been previewed — excluding previewed verses made candidates vanish
  // mid-speech on the next partial search.
  const s = getState()
  const keys = new Set<string>()
  for (const v of s.live?.verses ?? []) keys.add(normalizeCanonicalKey(v.canonicalId))
  return keys
}

/**
 * Streaming entry point: fires as soon as the STT worker emits a partial
 * (interim) result. Displays the transcript (rate-limited) and immediately
 * requests a search — never waits for silence or a final transcript.
 */
export function handlePartialTranscript(text: string): void {
  const trimmed = text.trim()
  if (!trimmed) return
  const now = Date.now()
  if (now - lastPartialPatchAt >= PARTIAL_PATCH_MIN_INTERVAL_MS) {
    lastPartialPatchAt = now
    patch({ candidates: { ...getState().candidates, lastTranscript: trimmed } })
  }
  requestSearch(trimmed, false)
}

/** Final transcript: same search pipeline as partials; always wins the display. */
export async function handleFinalTranscript(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return
  logger.debug('final transcript', { text: trimmed.slice(0, 200) })
  patch({ candidates: { ...getState().candidates, lastTranscript: trimmed } })
  requestSearch(trimmed, true)
}

/**
 * Dedup + coalesce: search now, or (while one is running) keep only the latest
 * query. An identical query that already produced results never re-runs — but a
 * final closes the utterance, so the same words may search again next time.
 */
function requestSearch(text: string, final: boolean): void {
  if (text === lastAppliedQuery) {
    if (final) lastAppliedQuery = ''
    return
  }
  if (searchRunning) {
    scheduledSearch = { text, final } // latest wins
    return
  }
  void runSearch(text, final)
}

async function runSearch(text: string, final: boolean): Promise<void> {
  searchRunning = true
  try {
    await searchTranscript(text, final)
  } catch (err) {
    logger.warn('transcript search failed', String(err))
    patch({ candidates: { ...getState().candidates, searching: false } })
  } finally {
    searchRunning = false
  }
  const next = scheduledSearch
  scheduledSearch = null
  if (!next) return
  if (next.text === lastAppliedQuery) {
    if (next.final) lastAppliedQuery = ''
    return
  }
  await runSearch(next.text, next.final)
}

/**
 * Mic went off (or recognition stopped): invalidate any in-flight or queued
 * transcript search so a slow result can never patch candidates/preview after
 * the operator has stopped listening.
 */
export function cancelSpeechSearches(): void {
  searchSeq++
  scheduledSearch = null
  lastAppliedQuery = ''
  if (searchRunning) {
    patch({ candidates: { ...getState().candidates, searching: false } })
  }
}

/**
 * The single search pipeline for speech (partials and finals alike):
 *   explicit reference parse (indexed) → phrase match via ScriptureMatcher →
 *   searchService.search (same worker/SQL/ranking as manual search) →
 *   merge + patch candidates → preview the strongest candidate.
 */
async function searchTranscript(trimmed: string, final: boolean): Promise<void> {
  const r = repo()
  const seq = ++searchSeq
  patch({ candidates: { ...getState().candidates, searching: true } })

  if (!r) {
    patch({
      candidates: { ...getState().candidates, lastTranscript: trimmed, searching: false }
    })
    if (final) lastAppliedQuery = ''
    return
  }

  const t0 = Date.now()
  const translation = getState().translation
  const drafts: CandidateDraft[] = []

  // 1) explicit references — deterministic parsing first (indexed lookups, fast)
  const refs = referenceParser.parse(trimmed).filter((p) => p.chapter != null).slice(0, 3)
  for (const ref of refs) {
    const passage = r.getPassage(
      {
        book: ref.book,
        chapter: ref.chapter,
        verse: ref.verse,
        verseEnd: ref.verseEnd
      },
      translation
    )
    if (!passage || passage.verses.length === 0) continue
    const first = passage.verses[0]
    drafts.push({
      kind: 'reference',
      canonicalKey: normalizeCanonicalKey(first.canonicalId),
      reference: passage.reference,
      text: first.text,
      confidence: parsedReferenceConfidence(ref.raw, ref.verse != null, ref.ambiguousBook),
      snippet: snippetOf(passage.verses.map((v) => v.text).join(' '), 220)
    })
  }

  // 2) phrase matching against the local index (search worker process, never main).
  // Skipped when an explicit reference already produced a draft: the matcher would
  // only run redundant full-index scans after "John 3:16"-style input.
  if (drafts.length === 0) {
    try {
      const matcher = new ScriptureMatcher((q, t, limit) =>
        searchService.search(q, t, limit, { canSkip: false })
      )
      drafts.push(...(await matcher.match(trimmed, translation, 3)))
    } catch (err) {
      logger.warn('phrase matching failed', String(err))
    }
  }

  // A newer query superseded this one while the search worker ran.
  if (seq !== searchSeq) return

  const state = getState()
  const merged = mergeCandidates(
    state.candidates.candidates,
    drafts,
    translation,
    currentExclusions(),
    significantTokens(trimmed).slice(-12),
    trimmed
  )
  lastAppliedQuery = final ? '' : trimmed

  if (merged.length === 0) {
    patch({
      candidates: {
        ...state.candidates,
        lastTranscript: final ? trimmed : state.candidates.lastTranscript,
        searching: false
      }
    })
    return
  }

  patch({
    candidates: {
      candidates: merged,
      activeIndex: 0,
      lastTranscript: final ? trimmed : state.candidates.lastTranscript,
      searching: false
    }
  })
  logger[final ? 'info' : 'debug']('candidates updated', {
    count: merged.length,
    top: merged[0] ? { ref: merged[0].reference, conf: merged[0].confidence } : null,
    ms: Date.now() - t0,
    final
  })

  // A detected candidate goes to PREVIEW first — never to live. Skip when the
  // preview already shows it (streaming partials re-apply the same top match).
  const active = merged[0]
  if (active && getState().preview?.reference !== active.reference) {
    setPreview(active.reference, 'candidate')
  }
}

function mergeCandidates(
  existing: Candidate[],
  drafts: CandidateDraft[],
  translation: string,
  exclude: Set<string>,
  queryTokens: string[],
  exactText: string
): Candidate[] {
  const now = Date.now()
  const map = new Map<string, Candidate>()

  for (const c of existing) {
    if (now - c.detectedAt > CANDIDATE_TTL_MS) continue
    const key = normalizeCanonicalKey(c.canonicalId)
    if (exclude.has(key)) continue
    // Phrase candidates are re-scored against the CURRENT query so results
    // genuinely refine as speech grows: a stale match keeps its place but can
    // no longer outrank a candidate that matches what is being said right now.
    // Reference candidates keep their parse-based confidence.
    const confidence =
      c.kind === 'phrase' && queryTokens.length > 0
        ? scorePhraseMatch(queryTokens, c.text || c.snippet || '', exactText).score
        : c.confidence
    map.set(key, { ...c, translation, confidence })
  }

  const fresh = buildCandidates(drafts, { excludeKeys: exclude, max: MAX_CANDIDATES, now })
  for (const c of fresh) {
    const key = normalizeCanonicalKey(c.canonicalId)
    const prev = map.get(key)
    if (!prev || c.confidence > prev.confidence) {
      map.set(key, { ...c, translation })
    }
  }

  return [...map.values()]
    .sort((a, b) => b.confidence - a.confidence || a.reference.localeCompare(b.reference))
    .slice(0, MAX_CANDIDATES)
}

export function selectCandidate(index: number): { ok: boolean; error: string | null } {
  const state = getState()
  const list = state.candidates.candidates
  if (index < 0 || index >= list.length) return { ok: false, error: 'No such candidate.' }
  patchCandidates({ activeIndex: index })
  setPreview(list[index].reference, 'candidate')
  return { ok: true, error: null }
}

/**
 * Human confirmation: preview candidate becomes the live passage.
 * This is the ONLY path from recognition to the audience screen.
 */
export function confirmCandidate(id?: string): { ok: boolean; error: string | null } {
  const state = getState()
  const list = state.candidates.candidates
  const candidate = id ? list.find((c) => c.id === id) : list[state.candidates.activeIndex]
  if (!candidate) return { ok: false, error: 'No candidate to confirm.' }

  const res = setLive(candidate.reference)
  if (!res.ok) return res

  // round consumed: clear suggestions and keep preview aligned with live
  patchCandidates({ candidates: [], activeIndex: 0 })
  setPreviewPassage(getState().live, 'manual')
  logger.info('candidate confirmed', { reference: candidate.reference, confidence: candidate.confidence })
  return { ok: true, error: null }
}

/** Reject the active (or given) candidate. Live output is untouched. */
export function rejectCandidate(id?: string): { ok: boolean; error: string | null } {
  const state = getState()
  const list = state.candidates.candidates
  if (list.length === 0) return { ok: true, error: null }

  const index = id ? list.findIndex((c) => c.id === id) : state.candidates.activeIndex
  if (index < 0) return { ok: true, error: null }

  const next = list.filter((_, i) => i !== index)
  const nextActive = Math.min(index, Math.max(next.length - 1, 0))
  patchCandidates({ candidates: next, activeIndex: next.length === 0 ? 0 : nextActive })

  if (next.length > 0) {
    setPreview(next[nextActive].reference, 'candidate')
  } else if (state.preview) {
    // preview was candidate-driven; withdraw it. Live remains unchanged.
    setPreviewPassage(null, null)
  }
  logger.info('candidate rejected', { reference: list[index].reference })
  return { ok: true, error: null }
}

/** Re-fetch candidate texts after a translation switch. */
export function refreshCandidateTexts(): void {
  const r = repo()
  const state = getState()
  if (!r || state.candidates.candidates.length === 0) return
  const translation = state.translation
  const updated = state.candidates.candidates.map((c) => {
    const parsed = parseCanonicalId(normalizeCanonicalKey(c.canonicalId))
    if (!parsed) return { ...c, translation }
    const verse = r.getVerse(`${parsed.code}.${parsed.chapter}.${parsed.verse}`, translation)
    return verse ? { ...c, translation, text: verse.text, snippet: snippetOf(verse.text) } : { ...c, translation }
  })
  patchCandidates({ candidates: updated })
  const active = updated[state.candidates.activeIndex]
  if (active && state.preview) setPreview(active.reference, 'candidate')
}
