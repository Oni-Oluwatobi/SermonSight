import { BOOKS, BOOK_BY_ORDER, BOOK_BY_NAME, type BookDef } from '../canon/books'
import { referenceParser, parseCanonicalId } from '../recognition/ReferenceParser'
import type { DbProbe, BookRow, SqlExecutor } from './schema'
import type {
  Passage,
  SearchKind,
  SearchResponse,
  SearchResultItem,
  TranslationInfo,
  VerseView
} from '../../shared/ipc'
import { REQUIRED_TRANSLATIONS } from './schema'

export interface ScriptureRef {
  book: BookDef
  chapter: number | null
  verse: number | null
  verseEnd: number | null
}

interface RawVerse {
  reference?: string | null
  canonical_id?: string | null
  text?: string | null
  validation_status?: string | null
  book_id?: number | null
  chapter_number?: number | null
  verse_number?: number | null
}

const MAX_VERSES_PER_CHAPTER = 500
const DEFAULT_SEARCH_LIMIT = 50

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c)
}

function normKey(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Canonical Scripture access layer.
 * All lookups go through canonical references; translation is a parameter,
 * never part of the identity. Text returned is exactly the source text.
 */
export class ScriptureRepository {
  private readonly dbBookByOrder = new Map<number, BookRow>()
  private readonly myBookByDbId = new Map<number, BookDef>()
  private readonly translationValue = new Map<string, string | number>()
  private readonly availableAbbr: string[] = []
  private bookJoin = ''
  private warnings: string[] = []

  constructor(
    private readonly db: SqlExecutor,
    private readonly probe: DbProbe
  ) {
    this.buildBookMap()
    this.buildTranslationMap()
    this.bookJoin = probe.hasBookId ? ' JOIN books b ON b.id = v.book_id ' : ' '
  }

  getWarnings(): string[] {
    return [...this.warnings]
  }

  private buildBookMap(): void {
    const keyToMy = new Map<string, BookDef>()
    for (const b of BOOKS) {
      const keys = [b.name, b.osis, b.code, ...b.aliases]
      for (const k of keys) {
        const nk = normKey(k)
        if (nk && !keyToMy.has(nk)) keyToMy.set(nk, b)
      }
    }

    const claimed = new Set<number>()
    for (const row of this.probe.books) {
      let my: BookDef | undefined
      for (const candidate of [row.osis_id, row.name, row.abbreviation]) {
        const nk = normKey(candidate)
        if (nk && keyToMy.has(nk)) {
          my = keyToMy.get(nk)
          break
        }
      }
      if (!my && row.canonical_order != null) {
        const byOrder = BOOK_BY_ORDER[row.canonical_order - 1]
        if (byOrder) my = byOrder
      }
      if (!my) {
        this.warnings.push(`unmapped database book: ${row.name || row.osis_id || row.id}`)
        continue
      }
      if (claimed.has(my.order)) {
        this.warnings.push(`duplicate database rows for book ${my.name}`)
        continue
      }
      claimed.add(my.order)
      this.dbBookByOrder.set(my.order, row)
      this.myBookByDbId.set(row.id, my)
    }
    for (const b of BOOKS) {
      if (!this.dbBookByOrder.has(b.order)) {
        this.warnings.push(`book missing from database: ${b.name}`)
      }
    }
  }

  private buildTranslationMap(): void {
    for (const t of this.probe.translations) {
      const abbr = (t.abbreviation || String(t.id)).toUpperCase()
      this.translationValue.set(abbr, t.id)
      if (!this.availableAbbr.includes(abbr)) this.availableAbbr.push(abbr)
    }
  }

  hasTranslation(abbr: string): boolean {
    return this.translationValue.has(abbr.toUpperCase())
  }

  translationHasVerses(abbr: string): boolean {
    const count = this.probe.counts[abbr.toUpperCase()]
    return (count ?? 0) > 0
  }

  listTranslations(): TranslationInfo[] {
    const seen = new Set<string>()
    const out: TranslationInfo[] = []
    const all = [...REQUIRED_TRANSLATIONS, ...this.availableAbbr]
    for (const abbrRaw of all) {
      const abbr = abbrRaw.toUpperCase()
      if (seen.has(abbr)) continue
      seen.add(abbr)
      const row = this.probe.translations.find(
        (t) => (t.abbreviation || String(t.id)).toUpperCase() === abbr
      )
      out.push({
        abbreviation: abbr,
        name: row?.name ?? abbr,
        language: row?.language ?? null,
        copyright: row?.copyright ?? null,
        available: (this.probe.counts[abbr] ?? 0) > 0
      })
    }
    return out
  }

  /** WHERE fragment restricting rows to one translation. */
  private translationWhere(abbr: string): { sql: string; params: unknown[] } | null {
    const value = this.translationValue.get(abbr.toUpperCase())
    if (value == null) return null
    if (this.probe.translationLink === 'abbreviation') {
      return { sql: 'UPPER(v.translation_id) = ?', params: [String(value).toUpperCase()] }
    }
    return { sql: 'v.translation_id = ?', params: [value] }
  }

  private selectColumns(): string {
    const cols: string[] = []
    if (this.probe.hasReference) cols.push('v.reference')
    if (this.probe.hasCanonicalId) cols.push('v.canonical_id')
    cols.push('v.text')
    if (this.probe.hasValidationStatus) cols.push('v.validation_status')
    if (this.probe.hasBookId) cols.push('v.book_id')
    if (this.probe.hasChapterNumber) cols.push('v.chapter_number')
    if (this.probe.hasVerseNumber) cols.push('v.verse_number')
    return cols.join(', ')
  }

  private fetchRaw(where: string, params: unknown[], limit = MAX_VERSES_PER_CHAPTER): RawVerse[] {
    // No JOIN and no ORDER BY here on purpose:
    //  - the books join forces a per-row lookup that is never needed (book resolution
    //    uses book_id / canonical_id / reference);
    //  - ORDER BY v.rowid makes SQLite prefer idx_verses_trans and scan ALL rows of the
    //    translation (measured 32ms per chapter fetch -> full-scan). Without it the
    //    optimizer picks idx_verses_book_chap_verse (single-digit-millisecond range).
    // Callers that display results re-sort canonically (sortViews) or by relevance.
    const sql = `SELECT ${this.selectColumns()} FROM verses v WHERE ${where} LIMIT ?`
    return this.db.all<RawVerse>(sql, [...params, limit])
  }

  private resolveBook(raw: RawVerse, fromCanonical?: string): BookDef | null {
    if (raw.book_id != null) {
      const my = this.myBookByDbId.get(Number(raw.book_id))
      if (my) return my
    }
    const cid = raw.canonical_id ?? fromCanonical
    if (cid) {
      const parsed = parseCanonicalId(cid)
      if (parsed) {
        const byCode = BOOKS.find((b) => b.code.toLowerCase() === parsed.code.toLowerCase())
        if (byCode) return byCode
        const byAlias = BOOK_BY_NAME.get(parsed.code.toLowerCase())
        if (byAlias) return byAlias
      }
    }
    if (this.probe.hasReference && raw.reference) {
      const p = referenceParser.parseFirst(raw.reference)
      if (p) return p.book
    }
    return null
  }

  private toVerseView(raw: RawVerse, translation: string): VerseView | null {
    const book = this.resolveBook(raw)
    const chapter =
      raw.chapter_number != null ? Number(raw.chapter_number) : this.deriveChapter(raw)
    const verse = raw.verse_number != null ? Number(raw.verse_number) : this.deriveVerse(raw)
    if (!book || chapter == null || verse == null) return null

    const canonicalId =
      (this.probe.hasCanonicalId && raw.canonical_id) || `${book.code}.${chapter}.${verse}`
    const reference =
      (this.probe.hasReference && raw.reference) || `${book.name} ${chapter}:${verse}`
    const text = raw.text ?? ''
    let status = raw.validation_status ?? null
    if (!status) status = text.trim() ? 'verified' : 'missing_source_text'
    return {
      canonicalId: String(canonicalId),
      reference: String(reference),
      translation,
      text,
      validationStatus: String(status)
    }
  }

  private deriveChapter(raw: RawVerse): number | null {
    const cid = raw.canonical_id
    if (cid) {
      const p = parseCanonicalId(String(cid))
      if (p) return p.chapter
    }
    if (raw.reference) {
      const p = referenceParser.parseFirst(String(raw.reference))
      if (p?.chapter != null) return p.chapter
    }
    return null
  }

  private deriveVerse(raw: RawVerse): number | null {
    const cid = raw.canonical_id
    if (cid) {
      const p = parseCanonicalId(String(cid))
      if (p) return p.verse
    }
    if (raw.reference) {
      const p = referenceParser.parseFirst(String(raw.reference))
      if (p?.verse != null) return p.verse
    }
    return null
  }

  private sortViews(views: VerseView[]): VerseView[] {
    const orderOf = (v: VerseView): number => {
      const parsed = parseCanonicalId(v.canonicalId)
      if (parsed) {
        const my = BOOKS.find((b) => b.code.toLowerCase() === parsed.code.toLowerCase())
        if (my) return my.order * 1000000 + parsed.chapter * 1000 + parsed.verse
      }
      const p = referenceParser.parseFirst(v.reference)
      if (p) return p.book.order * 1000000 + (p.chapter ?? 0) * 1000 + (p.verse ?? 0)
      return Number.MAX_SAFE_INTEGER
    }
    return [...views].sort((a, b) => orderOf(a) - orderOf(b))
  }

  /** Fetch a single verse by canonical id (my canonical code form). */
  getVerse(canonicalId: string, translation: string): VerseView | null {
    const parsed = parseCanonicalId(canonicalId)
    if (!parsed) return null
    const book = BOOKS.find((b) => b.code.toLowerCase() === parsed.code.toLowerCase())
    if (!book) return null
    const row = this.dbBookByOrder.get(book.order)
    if (!row) return null
    const tw = this.translationWhere(translation)
    if (!tw) return null
    const conditions: string[] = ['v.book_id = ?', 'v.chapter_number = ?', 'v.verse_number = ?', tw.sql]
    const raw = this.fetchRaw(conditions.join(' AND '), [row.id, parsed.chapter, parsed.verse, ...tw.params], 1)
    if (raw.length === 0) return null
    return this.toVerseView(raw[0], translation)
  }

  /** Build a passage from a parsed reference. verse=null -> whole chapter. */
  getPassage(ref: ScriptureRef, translation: string, limit = MAX_VERSES_PER_CHAPTER): Passage | null {
    if (ref.chapter == null) return null
    const row = this.dbBookByOrder.get(ref.book.order)
    if (!row) return null
    const tw = this.translationWhere(translation)
    if (!tw) return null

    let where: string
    let params: unknown[]
    if (ref.verse != null) {
      const end = ref.verseEnd ?? ref.verse
      where = 'v.book_id = ? AND v.chapter_number = ? AND v.verse_number >= ? AND v.verse_number <= ? AND ' + tw.sql
      params = [row.id, ref.chapter, ref.verse, Math.min(end, ref.verse + 199), ...tw.params]
    } else {
      where = 'v.book_id = ? AND v.chapter_number = ? AND ' + tw.sql
      params = [row.id, ref.chapter, ...tw.params]
    }

    const raw = this.fetchRaw(where, params, limit)
    const views = this.sortViews(raw.map((r) => this.toVerseView(r, translation)).filter(Boolean) as VerseView[])
    if (views.length === 0) return null

    const reference =
      ref.verse == null
        ? `${ref.book.name} ${ref.chapter}`
        : ref.verseEnd != null && ref.verseEnd !== ref.verse
          ? `${ref.book.name} ${ref.chapter}:${ref.verse}-${ref.verseEnd}`
          : `${ref.book.name} ${ref.chapter}:${ref.verse}`
    return { reference, translation, verses: views }
  }

  /**
   * Move one verse forward/backward within the same book.
   * Returns null when there is no adjacent verse.
   */
  adjacentVerse(current: VerseView, direction: 1 | -1, translation: string): Passage | null {
    const parsed = parseCanonicalId(current.canonicalId)
    let book: BookDef | null = null
    let chapter: number | null = null
    let verse: number | null = null

    if (parsed) {
      book =
        BOOKS.find((b) => b.code.toLowerCase() === parsed.code.toLowerCase()) ??
        BOOK_BY_NAME.get(parsed.code.toLowerCase()) ??
        null
      chapter = parsed.chapter
      verse = parsed.verse
    }
    if (!book || chapter == null || verse == null) {
      const p = referenceParser.parseFirst(current.reference)
      if (p?.book && p.chapter != null && p.verse != null) {
        book = p.book
        chapter = p.chapter
        verse = p.verse
      }
    }
    if (!book || chapter == null || verse == null) return null

    const tryVerse = (ch: number, v: number): Passage | null =>
      this.getPassage({ book, chapter: ch, verse: v, verseEnd: null }, translation)

    if (direction === 1) {
      const next = tryVerse(chapter, verse + 1)
      if (next) return next
      const inNextChapter = tryVerse(chapter + 1, 1)
      if (inNextChapter) return inNextChapter
      return null
    }

    const prev = tryVerse(chapter, verse - 1)
    if (prev) return prev
    if (chapter <= 1) return null
    const maxRow = this.db.get<{ maxv: number | null }>(
      'SELECT MAX(verse_number) AS maxv FROM verses v' +
        this.bookJoin +
        'WHERE v.book_id = ? AND v.chapter_number = ?' +
        (this.probe.hasBookId ? ' AND b.id = v.book_id' : ''),
      [this.dbBookByOrder.get(book.order)?.id, chapter - 1]
    )
    const maxVerse = maxRow?.maxv
    if (maxVerse == null) return null
    return tryVerse(chapter - 1, Number(maxVerse))
  }

  /**
   * Intelligent offline search: reference / chapter / book / keyword / phrase.
   * Never returns fabricated text; missing rows are simply absent.
   */
  search(query: string, translation: string, limit = DEFAULT_SEARCH_LIMIT): SearchResponse {
    const q = query.trim()
    const base: SearchResponse = {
      kind: 'unknown',
      query: q,
      translation,
      results: [],
      truncated: false,
      error: null
    }
    if (!q) return base
    if (!this.hasTranslation(translation) || !this.translationHasVerses(translation)) {
      return { ...base, error: `${translation} is not available in this database.` }
    }

    // 1) reference-like input
    const refs = referenceParser.parse(q)
    const withChapter = refs.filter((r) => r.chapter != null)
    if (withChapter.length > 0) {
      const r = withChapter[0]
      const passage = this.getPassage(
        { book: r.book, chapter: r.chapter, verse: r.verse, verseEnd: r.verseEnd },
        translation,
        limit
      )
      if (passage) {
        const kind: SearchKind = r.verse != null ? 'reference' : 'chapter'
        return {
          ...base,
          kind,
          results: passage.verses.map(toResultItem),
          truncated: passage.verses.length >= limit
        }
      }
      if (!this.dbBookByOrder.has(r.book.order)) {
        return { ...base, kind: 'reference', error: `${r.book.name} is not present in this database.` }
      }
      return { ...base, kind: 'reference', error: `No verses found for "${r.raw}".` }
    }
    if (refs.length > 0 && refs[0].chapter == null) {
      // book-level query: offer the start of the book
      const r = refs[0]
      const passage = this.getPassage(
        { book: r.book, chapter: 1, verse: null, verseEnd: null },
        translation,
        Math.min(limit, 30)
      )
      if (passage) {
        return { ...base, kind: 'chapter', results: passage.verses.map(toResultItem) }
      }
    }

    // 2) keyword / phrase search over exact source text
    const tokens = q
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter(Boolean)
    if (tokens.length === 0) return base
    const terms = tokens.filter((t) => t.length > 2 || /\d/.test(t))
    const effective = terms.length > 0 ? terms : tokens
    const kind: SearchKind = tokens.length >= 2 ? 'phrase' : 'keyword'

    const tw = this.translationWhere(translation)
    if (!tw) return base

    const likeClauses = effective.map(() => "v.text LIKE ? ESCAPE '\\'").join(' AND ')
    const where = `${likeClauses} AND ${tw.sql}`
    const params = [...effective.map((t) => `%${escapeLike(t)}%`), ...tw.params]
    const raw = this.fetchRaw(where, params, Math.max(limit * 3, 150))

    let views = raw
      .map((r) => this.toVerseView(r, translation))
      .filter((v): v is VerseView => v != null)

    if (views.length === 0) {
      return { ...base, kind, results: [], truncated: false }
    }

    if (views.length > 1) {
      const phrase = effective.join(' ')
      views = views
        .map((v) => ({ v, score: scoreText(v.text, effective, phrase) }))
        .sort((a, b) => b.score - a.score || sortKey(a.v) - sortKey(b.v))
        .slice(0, limit)
        .map((x) => x.v)
    } else {
      views = this.sortViews(views).slice(0, limit)
    }

    const truncated = raw.length >= Math.max(limit * 3, 150) || views.length >= limit
    return { ...base, kind, results: views.map(toResultItem), truncated }
  }
}

function sortKey(v: VerseView): number {
  const p = parseCanonicalId(v.canonicalId)
  if (p) {
    const my = BOOKS.find((b) => b.code.toLowerCase() === p.code.toLowerCase())
    if (my) return my.order * 1000000 + p.chapter * 1000 + p.verse
  }
  return Number.MAX_SAFE_INTEGER
}

/** Rank a candidate verse text for keyword/phrase queries. */
function scoreText(text: string, terms: string[], phrase: string): number {
  const lower = text.toLowerCase()
  let score = 0
  if (phrase && lower.includes(phrase)) score += 100
  for (const t of terms) {
    if (lower.includes(t)) score += 5 + Math.min(t.length, 12) / 4
    const idx = lower.indexOf(t)
    if (idx >= 0) score += Math.max(0, 3 - idx / 100)
  }
  // ordered appearance bonus
  let cursor = -1
  let ordered = true
  for (const t of terms) {
    const i = lower.indexOf(t, cursor + 1)
    if (i < 0) {
      ordered = false
      break
    }
    cursor = i
  }
  if (ordered && terms.length > 1) score += 15
  return score
}

export function toResultItem(v: VerseView): SearchResultItem {
  return {
    canonicalId: v.canonicalId,
    reference: v.reference,
    translation: v.translation,
    text: v.text,
    validationStatus: v.validationStatus
  }
}
