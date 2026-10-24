/**
 * Canonical 66-book Protestant canon table (structural metadata only).
 * Used for reference parsing, canonical IDs and database book mapping.
 * No Scripture text lives here.
 */

export type Testament = 'OT' | 'NT'

export interface BookDef {
  order: number
  /** Stable internal code used in canonical IDs, e.g. JHN.3.16 */
  code: string
  /** OSIS book id, e.g. John — used to map DB rows that store OSIS ids */
  osis: string
  name: string
  testament: Testament
  /** Lowercase surface forms accepted by the reference parser */
  aliases: string[]
}

/** Alias builder for numbered books (1 Samuel, 2 Peter, ...). */
function numbered(
  order: number,
  num: 1 | 2 | 3,
  name: string,
  code: string,
  osis: string,
  testament: Testament,
  root: string
): BookDef {
  const words: Record<number, string[]> = {
    1: ['1', '1st', 'first', 'one', 'i'],
    2: ['2', '2nd', 'second', 'two', 'ii'],
    3: ['3', '3rd', 'third', 'three', 'iii']
  }
  const prefixes = words[num]
  const aliases = new Set<string>()
  for (const p of prefixes) {
    aliases.add(`${p} ${root}`)
    aliases.add(`${p} ${root.replace(/ /g, '')}`)
  }
  aliases.add(code.toLowerCase()) // e.g. 1sa, 1co
  aliases.add(osis.toLowerCase()) // e.g. 1sam, 1cor
  aliases.add(`${num}${root.replace(/ /g, '')}`) // e.g. 1samuel
  return { order, code, osis, name, testament, aliases: [...aliases] }
}

function plain(
  order: number,
  name: string,
  code: string,
  osis: string,
  testament: Testament,
  extra: string[] = []
): BookDef {
  const base = name.toLowerCase()
  const aliases = [base, code.toLowerCase(), osis.toLowerCase(), ...extra]
  return {
    order,
    code,
    osis,
    name,
    testament,
    aliases: Array.from(new Set(aliases.filter((a) => a && a.length > 1)))
  }
}

export const BOOKS: BookDef[] = [
  plain(1, 'Genesis', 'GEN', 'Gen', 'OT', ['gn']),
  plain(2, 'Exodus', 'EXO', 'Exod', 'OT', ['exo', 'ex']),
  plain(3, 'Leviticus', 'LEV', 'Lev', 'OT', ['lev']),
  plain(4, 'Numbers', 'NUM', 'Num', 'OT', ['nm']),
  plain(5, 'Deuteronomy', 'DEU', 'Deut', 'OT', ['dt']),
  plain(6, 'Joshua', 'JOS', 'Josh', 'OT', []),
  plain(7, 'Judges', 'JDG', 'Judg', 'OT', []),
  plain(8, 'Ruth', 'RUT', 'Ruth', 'OT', []),
  numbered(9, 1, 'Samuel', '1SA', '1Sam', 'OT', 'samuel'),
  numbered(10, 2, 'Samuel', '2SA', '2Sam', 'OT', 'samuel'),
  numbered(11, 1, 'Kings', '1KI', '1Kgs', 'OT', 'kings'),
  numbered(12, 2, 'Kings', '2KI', '2Kgs', 'OT', 'kings'),
  numbered(13, 1, 'Chronicles', '1CH', '1Chr', 'OT', 'chronicles'),
  numbered(14, 2, 'Chronicles', '2CH', '2Chr', 'OT', 'chronicles'),
  plain(15, 'Ezra', 'EZR', 'Ezra', 'OT', []),
  plain(16, 'Nehemiah', 'NEH', 'Neh', 'OT', []),
  plain(17, 'Esther', 'EST', 'Est', 'OT', []),
  plain(18, 'Job', 'JOB', 'Job', 'OT', []),
  plain(19, 'Psalms', 'PSA', 'Ps', 'OT', ['psalm', 'ps', 'psm']),
  plain(20, 'Proverbs', 'PRO', 'Prov', 'OT', ['proverb', 'pr']),
  plain(21, 'Ecclesiastes', 'ECC', 'Ecc', 'OT', ['ec', 'preacher']),
  plain(22, 'Song of Solomon', 'SNG', 'Song', 'OT', [
    'song of songs',
    'song',
    'canticles',
    'song of solomons'
  ]),
  plain(23, 'Isaiah', 'ISA', 'Isa', 'OT', []),
  plain(24, 'Jeremiah', 'JER', 'Jer', 'OT', []),
  plain(25, 'Lamentations', 'LAM', 'Lam', 'OT', ['lamentations of jeremiah']),
  plain(26, 'Ezekiel', 'EZE', 'Ezek', 'OT', []),
  plain(27, 'Daniel', 'DAN', 'Dan', 'OT', []),
  plain(28, 'Hosea', 'HOS', 'Hos', 'OT', []),
  plain(29, 'Joel', 'JOL', 'Joel', 'OT', []),
  plain(30, 'Amos', 'AMO', 'Amos', 'OT', []),
  plain(31, 'Obadiah', 'OBA', 'Obad', 'OT', []),
  plain(32, 'Jonah', 'JON', 'Jon', 'OT', ['jonas']),
  plain(33, 'Micah', 'MIC', 'Mic', 'OT', []),
  plain(34, 'Nahum', 'NAH', 'Nah', 'OT', []),
  plain(35, 'Habakkuk', 'HAB', 'Hab', 'OT', ['habacuc']),
  plain(36, 'Zephaniah', 'ZEP', 'Zeph', 'OT', []),
  plain(37, 'Haggai', 'HAG', 'Hag', 'OT', []),
  plain(38, 'Zechariah', 'ZEC', 'Zech', 'OT', []),
  plain(39, 'Malachi', 'MAL', 'Mal', 'OT', []),
  plain(40, 'Matthew', 'MAT', 'Matt', 'NT', ['saint matthew', 'gospel of matthew', 'matthews gospel']),
  plain(41, 'Mark', 'MAR', 'Mark', 'NT', ['saint mark', 'gospel of mark', 'marks gospel', 'st mark']),
  plain(42, 'Luke', 'LUK', 'Luke', 'NT', ['saint luke', 'gospel of luke', 'lukes gospel']),
  plain(43, 'John', 'JHN', 'John', 'NT', ['saint john', 'gospel of john', 'johns gospel', 'gospel according to john']),
  plain(44, 'Acts', 'ACT', 'Acts', 'NT', ['act', 'acts of the apostles', 'the acts']),
  plain(45, 'Romans', 'ROM', 'Rom', 'NT', ['epistle to the romans']),
  numbered(46, 1, 'Corinthians', '1CO', '1Cor', 'NT', 'corinthians'),
  numbered(47, 2, 'Corinthians', '2CO', '2Cor', 'NT', 'corinthians'),
  plain(48, 'Galatians', 'GAL', 'Gal', 'NT', []),
  plain(49, 'Ephesians', 'EPH', 'Eph', 'NT', []),
  plain(50, 'Philippians', 'PHP', 'Phil', 'NT', []),
  plain(51, 'Colossians', 'COL', 'Col', 'NT', []),
  numbered(52, 1, 'Thessalonians', '1TH', '1Thess', 'NT', 'thessalonians'),
  numbered(53, 2, 'Thessalonians', '2TH', '2Thess', 'NT', 'thessalonians'),
  numbered(54, 1, 'Timothy', '1TI', '1Tim', 'NT', 'timothy'),
  numbered(55, 2, 'Timothy', '2TI', '2Tim', 'NT', 'timothy'),
  plain(56, 'Titus', 'TIT', 'Titus', 'NT', []),
  plain(57, 'Philemon', 'PHM', 'Phlm', 'NT', []),
  plain(58, 'Hebrews', 'HEB', 'Heb', 'NT', ['epistle to the hebrews']),
  plain(59, 'James', 'JAS', 'James', 'NT', []),
  numbered(60, 1, 'Peter', '1PE', '1Pet', 'NT', 'peter'),
  numbered(61, 2, 'Peter', '2PE', '2Pet', 'NT', 'peter'),
  numbered(62, 1, 'John', '1JO', '1John', 'NT', 'john'),
  numbered(63, 2, 'John', '2JO', '2John', 'NT', 'john'),
  numbered(64, 3, 'John', '3JO', '3John', 'NT', 'john'),
  plain(65, 'Jude', 'JUD', 'Jude', 'NT', []),
  plain(66, 'Revelation', 'REV', 'Rev', 'NT', ['revelations', 'the revelation', 'apocalypse'])
]

export const BOOK_BY_ORDER: BookDef[] = BOOKS
export const OT_BOOKS = BOOKS.filter((b) => b.testament === 'OT')
export const NT_BOOKS = BOOKS.filter((b) => b.testament === 'NT')

function index(fn: (b: BookDef) => string[]): Map<string, BookDef> {
  const m = new Map<string, BookDef>()
  for (const b of BOOKS) {
    for (const key of fn(b)) {
      const k = key.trim().toLowerCase()
      if (k && !m.has(k)) m.set(k, b)
    }
  }
  return m
}

export const BOOK_BY_NAME = index((b) => [b.name, b.osis, ...b.aliases])
export const BOOK_BY_CODE = new Map(BOOKS.map((b) => [b.code.toLowerCase(), b]))
export const BOOK_BY_OSIS = new Map(BOOKS.map((b) => [b.osis.toLowerCase(), b]))

/** Normalize free text for book matching: lowercase, unify quotes, collapse spaces. */
export function normalizeBookText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\bthe (book|gospel|epistle|letter) of\b/g, ' ')
    .replace(/\bbook of\b/g, ' ')
    .replace(/\bepistle to\b/g, ' ')
    .replace(/\bletter to\b/g, ' ')
    .replace(/\bchapter\b/g, ' chapter ')
    .replace(/\bverse\b/g, ' verse ')
    .replace(/[^a-z0-9' \-:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
