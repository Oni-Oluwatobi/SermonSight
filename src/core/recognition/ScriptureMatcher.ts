import type { SearchResponse } from '../../shared/ipc'
import { referenceConfidence, scorePhraseMatch, significantTokens } from './ConfidenceScorer'

export interface CandidateDraft {
  kind: 'reference' | 'phrase'
  canonicalKey: string
  reference: string
  text: string
  confidence: number
  snippet: string | null
}

export interface MatchQuery {
  (query: string, translation: string, limit: number): Promise<SearchResponse>
}

const MAX_WINDOW_TOKENS = 12
const MAX_ATTEMPT_TERMS = 4

/**
 * Matches recognized speech against the local Scripture index.
 * Deterministic: SQL filtering + lexical scoring. No network, no LLM.
 */
export class ScriptureMatcher {
  constructor(private readonly queryFn: MatchQuery) {}

  async match(transcript: string, translation: string, limit = 3): Promise<CandidateDraft[]> {
    const tokens = significantTokens(transcript)
    // Two significant words is enough to narrow the SQL to a handful of verses
    // ("god loved" → AND of both terms). Streaming partials search from here;
    // single-word queries would match half the Bible and rank no better than
    // canon order, so they wait for one more word.
    if (tokens.length < 2) return []
    const window = tokens.slice(-MAX_WINDOW_TOKENS)

    // choose the most distinctive terms first to keep the SQL narrow.
    // Bounded to TWO attempts: each attempt is a full scan of the verses table
    // (measured 40-150ms per scan on the dev machine, worse on low-end hardware),
    // and the query now runs in the search worker process, never on main.
    const byLength = [...window].sort((a, b) => b.length - a.length)
    const attempts: string[][] = [
      byLength.slice(0, Math.min(MAX_ATTEMPT_TERMS, byLength.length)),
      byLength.slice(0, 1)
    ]

    let rows: SearchResponse['results'] = []
    for (const terms of attempts) {
      if (terms.length === 0) continue
      const res = await this.queryFn(terms.join(' '), translation, 40)
      if (res.error || res.superseded) return []
      if (res.results.length > 0) {
        rows = res.results
        break
      }
    }
    if (rows.length === 0) return []

    const scored = rows
      .map((r) => {
        const s = scorePhraseMatch(window, r.text, transcript)
        return {
          ...r,
          score: s.score,
          coverage: s.coverage
        }
      })
      .filter((r) => r.coverage >= 0.5 && r.score >= 0.35)
      .sort((a, b) => b.score - a.score)

    return scored.slice(0, limit).map((r) => ({
      kind: 'phrase' as const,
      canonicalKey: r.canonicalId,
      reference: r.reference,
      text: r.text,
      confidence: r.score,
      snippet: snippetOf(r.text)
    }))
  }
}

export function snippetOf(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return clean.slice(0, max - 1).trimEnd() + '…'
}

/** Deterministic confidence for explicitly parsed references. */
export function parsedReferenceConfidence(raw: string, hasVerse: boolean, ambiguous: boolean): number {
  return referenceConfidence({
    explicitVerse: hasVerse,
    ambiguousBook: ambiguous,
    digitsInInput: /\d/.test(raw)
  })
}
