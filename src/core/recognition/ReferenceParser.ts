import { BOOKS, BOOK_BY_NAME, type BookDef } from '../canon/books'

/**
 * Deterministic Scripture reference parser.
 * Converts written and spoken forms to canonical references:
 *   "John 3:16"                        -> John 3:16
 *   "John chapter three verse sixteen" -> John 3:16
 *   "first corinthians 13:4-7"         -> 1 Corinthians 13:4-7
 *   "psalm twenty three"               -> Psalms 23
 * No LLM involved. Never produces references absent from the input text.
 */

export interface ParsedReference {
  book: BookDef
  chapter: number | null
  verse: number | null
  verseEnd: number | null
  explicitVerse: boolean
  ambiguousBook: boolean
  start: number
  end: number
  raw: string
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90
}

/** Bare split-book roots ("samuel", "corinthians") that need a book guess. */
const BARE_SPLIT_BOOKS: Record<string, BookDef> = Object.fromEntries(
  BOOKS.filter((b) => ['1SA', '1KI', '1CH', '1CO', '1TH', '1TI', '1PE'].includes(b.code)).map(
    (b) => [b.name.toLowerCase().replace(/^\d+\s*/, ''), b]
  )
)

const NUMBERED_PREFIX_BEFORE =
  /(?:^|[^a-z])(?:\d+|1st|2nd|3rd|first|second|third|one|two|three|i|ii|iii)\s+$/

interface Converted {
  out: string
  /** original tail index just AFTER the source span of out[i] */
  ends: number[]
}

function parseNumberToken(raw: string): number | null {
  const token = raw.replace(/[^a-z-]/g, '')
  if (!token) return null
  const pieces = token.split('-')
  let value = 0
  let saw = false
  for (const p of pieces) {
    const w = p.replace(/[^a-z]/g, '')
    if (!w) return null
    if (w === 'hundred') {
      if (!saw) return null
      value *= 100
      continue
    }
    if (w === 'thousand') {
      if (!saw) return null
      value *= 1000
      continue
    }
    const v = NUMBER_WORDS[w]
    if (v === undefined) return null
    value += v
    saw = true
  }
  return saw ? value : null
}

/** Replace spoken number words with digits, tracking original positions. */
function convertNumberWords(tail: string): Converted {
  const tokens = tail.split(/(\s+)/)
  const offsets: number[] = []
  let off = 0
  for (const t of tokens) {
    offsets.push(off)
    off += t.length
  }

  const out: string[] = []
  const ends: number[] = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (/^\s*$/.test(t)) {
      out.push(t)
      ends.push(offsets[i] + t.length)
      i++
      continue
    }
    // try to consume a run of number words starting here
    let cur = 0
    let j = i
    let ok = false
    while (j < tokens.length) {
      const tok = tokens[j]
      if (/^\s*$/.test(tok)) {
        const nxt = tokens[j + 1]
        if (nxt != null && !/^\s*$/.test(nxt) && parseNumberToken(nxt) != null) {
          j += 2
          continue
        }
        break
      }
      const v = parseNumberToken(tok)
      if (v == null) break
      cur += v
      ok = true
      j++
    }
    if (ok && cur > 0) {
      const value = String(cur)
      const runEnd = offsets[Math.min(j, tokens.length) - 1] + tokens[Math.min(j, tokens.length) - 1].length
      for (const ch of value) {
        out.push(ch)
        ends.push(runEnd)
      }
      i = j
      continue
    }
    out.push(t)
    ends.push(offsets[i] + t.length)
    i++
  }
  return { out: out.join(''), ends }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface AliasPattern {
  book: BookDef
  pattern: RegExp
  ambiguous: boolean
}

function buildAliasPatterns(): AliasPattern[] {
  const entries: { alias: string; book: BookDef; ambiguous: boolean }[] = []
  for (const b of BOOKS) {
    for (const a of b.aliases) entries.push({ alias: a, book: b, ambiguous: false })
  }
  for (const [root, book] of Object.entries(BARE_SPLIT_BOOKS)) {
    entries.push({ alias: root, book, ambiguous: true })
  }
  entries.sort((x, y) => y.alias.length - x.alias.length)
  return entries.map((e) => ({
    book: e.book,
    ambiguous: e.ambiguous,
    pattern: new RegExp(
      `(?<![a-z0-9])${escapeRegex(e.alias).replace(/ /g, '\\s+')}(?![a-z])`,
      'gi'
    )
  }))
}

let cachedAliases: AliasPattern[] | null = null
function aliasPatterns(): AliasPattern[] {
  if (!cachedAliases) cachedAliases = buildAliasPatterns()
  return cachedAliases
}

/** Length-preserving lowercase + punctuation fold so indices stay aligned. */
function fold(input: string): string {
  return input
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\n\r\t]/g, ' ')
}

interface TailMatch {
  chapter: number
  verse: number | null
  verseEnd: number | null
  consumed: number
}

function ok(n: number): boolean {
  return Number.isFinite(n) && n >= 1 && n <= 200
}

function matchTail(s: string): TailMatch | null {
  let m: RegExpExecArray | null

  // written form: "3:16" / "3.16" / "3:16-18"
  m = /^(\d{1,3})\s*[.:]\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?/.exec(s)
  if (m && ok(+m[1]) && ok(+m[2]) && (m[3] == null || ok(+m[3]))) {
    return { chapter: +m[1], verse: +m[2], verseEnd: m[3] ? +m[3] : null, consumed: m[0].length }
  }

  // "chapter 3 verse 16" / "chapter 3"
  m = /^chapter\s+(\d{1,3})(?:\s*verse\s+(\d{1,3})(?:\s*(?:-|to|through|and)\s+(\d{1,3}))?)?/.exec(s)
  if (m && ok(+m[1]) && (m[2] == null || ok(+m[2]))) {
    return { chapter: +m[1], verse: m[2] ? +m[2] : null, verseEnd: m[3] ? +m[3] : null, consumed: m[0].length }
  }

  // "3 verse 16" / "3 verses 16"
  m = /^(\d{1,3})\s+verses?\s+(\d{1,3})(?:\s*(?:-|to|through|and)\s+(\d{1,3}))?/.exec(s)
  if (m && ok(+m[1]) && ok(+m[2])) {
    return { chapter: +m[1], verse: +m[2], verseEnd: m[3] ? +m[3] : null, consumed: m[0].length }
  }

  // spoken: "3 16" / "3-16" / "3 to 16" / "13 4 7"
  m = /^(\d{1,3})\s*(?:-|\s|to\s|through\s|and\s)\s*(\d{1,3})(?:\s*(?:-|to|through|and)\s+(\d{1,3}))?/.exec(s)
  if (m && ok(+m[1]) && ok(+m[2]) && (m[3] == null || ok(+m[3]))) {
    return { chapter: +m[1], verse: +m[2], verseEnd: m[3] ? +m[3] : null, consumed: m[0].length }
  }

  // chapter only: "3"
  m = /^(\d{1,3})(?![\d:])/.exec(s)
  if (m && ok(+m[1])) {
    return { chapter: +m[1], verse: null, verseEnd: null, consumed: m[0].length }
  }
  return null
}

export class ReferenceParser {
  parse(text: string): ParsedReference[] {
    if (!text) return []
    const lower = fold(text)
    const results: ParsedReference[] = []
    const seen = new Set<string>()

    for (const ap of aliasPatterns()) {
      ap.pattern.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = ap.pattern.exec(lower)) !== null) {
        const matchStart = m.index
        const matchEnd = m.index + m[0].length
        if (ap.ambiguous && NUMBERED_PREFIX_BEFORE.test(lower.slice(0, matchStart))) continue

        const tailRaw = lower.slice(matchEnd, matchEnd + 64)
        const { out, ends } = convertNumberWords(tailRaw)
        const trimmed = out.replace(/^[,;.\s]+/, '')
        const stripCount = out.length - trimmed.length
        const parsed = matchTail(trimmed)

        if (!parsed) {
          const key = `${ap.book.code}:book`
          if (!seen.has(key)) {
            seen.add(key)
            results.push({
              book: ap.book,
              chapter: null,
              verse: null,
              verseEnd: null,
              explicitVerse: false,
              ambiguousBook: ap.ambiguous,
              start: matchStart,
              end: matchEnd,
              raw: text.slice(matchStart, matchEnd)
            })
          }
          continue
        }

        const consumedOut = stripCount + parsed.consumed
        const endIdx = consumedOut > 0 ? ends[Math.min(consumedOut, ends.length) - 1] : 0
        const end = matchEnd + Math.min(endIdx, tailRaw.length)
        const key = `${ap.book.code}:${parsed.chapter}:${parsed.verse ?? ''}:${parsed.verseEnd ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        results.push({
          book: ap.book,
          chapter: parsed.chapter,
          verse: parsed.verse,
          verseEnd: parsed.verseEnd,
          explicitVerse: parsed.verse != null,
          ambiguousBook: ap.ambiguous,
          start: matchStart,
          end,
          raw: text.slice(matchStart, end)
        })
      }
    }
    results.sort((a, b) => a.start - b.start || b.end - a.end)
    return results
  }

  /** Prefer references that include a chapter number. */
  parseFirst(text: string): ParsedReference | null {
    const all = this.parse(text)
    return all.find((r) => r.chapter != null) ?? all[0] ?? null
  }
}

/** Parse a canonical id such as "JHN.3.16" into its parts. */
export function parseCanonicalId(
  id: string
): { code: string; chapter: number; verse: number } | null {
  const m = /^([a-z0-9]+)\.(\d{1,3})\.(\d{1,4})$/i.exec(id.trim())
  if (!m) return null
  return { code: m[1].toUpperCase(), chapter: +m[2], verse: +m[3] }
}

export function bookByAlias(alias: string): BookDef | null {
  return BOOK_BY_NAME.get(alias.trim().toLowerCase()) ?? null
}

export const referenceParser = new ReferenceParser()
