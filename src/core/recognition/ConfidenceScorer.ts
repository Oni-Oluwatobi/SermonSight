/**
 * Deterministic confidence scoring for transcript-to-verse matches.
 * Confidence = matching confidence only. It never means the verse is
 * guaranteed to be the one the preacher intended.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
  'that', 'this', 'these', 'those', 'it', 'its', 'he', 'she', 'they', 'them',
  'his', 'her', 'their', 'we', 'our', 'you', 'your', 'i', 'me', 'my', 'do',
  'does', 'did', 'not', 'no', 'so', 'if', 'then', 'than', 'into', 'unto',
  'shall', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'here', 'there', 'when', 'who', 'whom', 'which', 'what', 'how', 'all',
  'any', 'every', 'each', 'one', 'two', 'also', 'about', 'said', 'says',
  'say', 'like', 'over', 'out', 'up', 'down', 'again', 'now', 'very', 'just'
])

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export function significantTokens(text: string): string[] {
  return tokenise(text).filter((t) => t.length > 2 && !STOPWORDS.has(t))
}

export interface MatchScore {
  coverage: number
  ordered: number
  score: number
}

/**
 * Score how well a transcript window matches a verse text (0..1-ish).
 * `rawTranscript` is the full spoken text (stopwords intact): when the verse
 * literally contains what was said ("the lord is my shepherd" in Psalm 23:1),
 * that exact-phrase bonus is what breaks ties against looser word matches.
 */
export function scorePhraseMatch(
  transcriptTokens: string[],
  verseText: string,
  rawTranscript?: string
): MatchScore {
  if (transcriptTokens.length === 0) return { coverage: 0, ordered: 0, score: 0 }
  const verseSeq = tokenise(verseText)
  const verseTokens = new Set(verseSeq)
  let weightTotal = 0
  let weightHit = 0
  for (const t of transcriptTokens) {
    const w = 1 + Math.min(t.length, 12) / 8
    weightTotal += w
    if (verseTokens.has(t)) weightHit += w
  }
  const coverage = weightTotal > 0 ? weightHit / weightTotal : 0

  // longest common subsequence ratio against the verse token sequence
  const lcs = lcsLength(transcriptTokens, verseSeq)
  const ordered = lcs / transcriptTokens.length

  const exactSource = rawTranscript ? tokenise(rawTranscript).join(' ') : transcriptTokens.join(' ')
  const exactPhrase =
    exactSource.length > 0 && verseSeq.join(' ').includes(exactSource) ? 1 : 0
  const score = clamp(0.55 * coverage + 0.35 * ordered + 0.1 * exactPhrase, 0.03, 0.97)
  return { coverage, ordered, score: round2(score) }
}

function lcsLength(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const m = a.length
  const n = Math.min(b.length, 400)
  let prev = new Array<number>(n + 1).fill(0)
  let curr = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1])
    }
    const tmp = prev
    prev = curr
    curr = tmp
    curr.fill(0)
  }
  return prev[n]
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

/**
 * Confidence for an explicitly parsed reference.
 * Written digit forms are more certain than spoken/ambiguous forms.
 */
export function referenceConfidence(opts: {
  explicitVerse: boolean
  ambiguousBook: boolean
  digitsInInput: boolean
}): number {
  let c = opts.explicitVerse ? 0.97 : 0.93
  if (!opts.digitsInInput) c -= 0.03
  if (opts.ambiguousBook) c -= 0.06
  return round2(clamp(c, 0.5, 0.99))
}
