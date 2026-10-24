import type { Candidate } from '../../shared/ipc'
import type { CandidateDraft } from './ScriptureMatcher'

export interface BuildOptions {
  /** canonical keys already live/previewed — never re-suggest them */
  excludeKeys?: Set<string>
  max?: number
  now?: number
}

/**
 * Merges reference and phrase drafts into the operator-facing candidate list.
 * Ranked deterministically; capped; NEVER auto-published.
 */
export function buildCandidates(drafts: CandidateDraft[], opts: BuildOptions = {}): Candidate[] {
  const exclude = opts.excludeKeys ?? new Set<string>()
  const max = opts.max ?? 5
  const now = opts.now ?? Date.now()

  const best = new Map<string, CandidateDraft>()
  for (const d of drafts) {
    if (exclude.has(d.canonicalKey)) continue
    const existing = best.get(d.canonicalKey)
    if (!existing || d.confidence > existing.confidence) best.set(d.canonicalKey, d)
  }

  return [...best.values()]
    .sort((a, b) => b.confidence - a.confidence || a.reference.localeCompare(b.reference))
    .slice(0, max)
    .map((d, i) => ({
      id: `cand-${now}-${i}`,
      kind: d.kind,
      canonicalId: d.canonicalKey,
      reference: d.reference,
      translation: '',
      text: d.text,
      confidence: d.confidence,
      snippet: d.snippet,
      detectedAt: now
    }))
}
