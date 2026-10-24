import {
  DatabaseError,
  type BookRow,
  type DbProbe,
  type SqlExecutor,
  type TranslationRow
} from './schema'
import { REQUIRED_TABLES, REQUIRED_TRANSLATIONS } from './schema'

function safeGet<T>(db: SqlExecutor, sql: string, params?: unknown[]): T | undefined {
  try {
    return db.get<T>(sql, params)
  } catch {
    return undefined
  }
}

function safeAll<T>(db: SqlExecutor, sql: string, params?: unknown[]): T[] {
  try {
    return db.all<T>(sql, params)
  } catch {
    return []
  }
}

function tableExists(tables: string[], name: string): boolean {
  return tables.includes(name.toLowerCase())
}

function columnNames(db: SqlExecutor, table: string): string[] {
  const rows = safeAll<{ name: string }>(db, `PRAGMA table_info(${JSON.stringify(table)})`)
  return rows.map((r) => r.name)
}

function readMetadata(db: SqlExecutor, tables: string[]): {
  present: boolean
  schemaVersion: string | null
  databaseVersion: string | null
  canonical: string | null
} {
  let schemaVersion: string | null = null
  let databaseVersion: string | null = null
  let canonical: string | null = null

  if (!tableExists(tables, 'metadata')) {
    return { present: false, schemaVersion, databaseVersion, canonical }
  }

  const cols = columnNames(db, 'metadata')
  const lower = cols.map((c) => c.toLowerCase())

  if (lower.includes('key') && lower.includes('value')) {
    const rows = safeAll<{ key: string; value: string }>(
      db,
      'SELECT key, value FROM metadata'
    )
    const map = new Map(rows.map((r) => [String(r.key).toLowerCase(), r.value]))
    schemaVersion = map.get('schema_version') ?? null
    databaseVersion = map.get('database_version') ?? null
    canonical = map.get('canonical') ?? null
    return { present: rows.length > 0, schemaVersion, databaseVersion, canonical }
  }
  if (cols.length > 0) {
    const row = safeGet<Record<string, unknown>>(db, 'SELECT * FROM metadata LIMIT 1')
    if (row) {
      const map = new Map(
        Object.entries(row).map(([k, v]) => [k.toLowerCase(), v == null ? null : String(v)])
      )
      schemaVersion = map.get('schema_version') ?? null
      databaseVersion = map.get('database_version') ?? null
      canonical = map.get('canonical') ?? null
      return { present: true, schemaVersion, databaseVersion, canonical }
    }
  }
  return { present: false, schemaVersion, databaseVersion, canonical }
}

/**
 * Lightweight startup validation: exists/open is handled by the provider;
 * here we verify structure, required tables and translation availability
 * without scanning verse rows.
 */
export function probeDatabase(db: SqlExecutor): DbProbe {
  const problems: string[] = []
  const warnings: string[] = []

  const tableRows = safeAll<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type='table'"
  )
  const tables = tableRows.map((r) => r.name.toLowerCase())

  for (const t of REQUIRED_TABLES) {
    if (!tableExists(tables, t)) problems.push(`missing required table: ${t}`)
  }
  if (problems.length > 0) {
    throw new DatabaseError(
      `Scripture database is missing required tables: ${problems.join(', ')}`,
      'schema-mismatch'
    )
  }

  const meta = readMetadata(db, tables)

  const bookCols = columnNames(db, 'books')
  const bookLower = new Map(bookCols.map((c) => [c.toLowerCase(), c]))
  const bookRows = safeAll<Record<string, unknown>>(
    db,
    'SELECT * FROM books ORDER BY rowid'
  )
  const books: BookRow[] = bookRows.map((r, i) => ({
    id: Number(r.id ?? r.book_id ?? i + 1),
    osis_id: (r.osis_id ?? r.osis ?? r.code ?? null) as string | null,
    name: String(r.name ?? ''),
    abbreviation: (r.abbreviation ?? r.abbrev ?? null) as string | null,
    testament: (r.testament ?? null) as string | null,
    canonical_order: (r.canonical_order ?? r.book_order ?? r.orden ?? null) as number | null,
    chapter_count: (r.chapter_count ?? null) as number | null
  }))
  if (books.length === 0) problems.push('books table is empty')
  if (books.length !== 0 && books.length !== 66) {
    warnings.push(`books table has ${books.length} rows (expected 66 for Protestant canon)`)
  }

  const transCols = columnNames(db, 'translations')
  const transLower = new Map(transCols.map((c) => [c.toLowerCase(), c]))
  const transRows = safeAll<Record<string, unknown>>(db, 'SELECT * FROM translations')
  const translations: TranslationRow[] = transRows.map((r) => {
    const abbrCol = transLower.get('abbreviation') ?? transLower.get('abbrev')
    const nameCol = transLower.get('name')
    const langCol = transLower.get('language')
    const copyCol = transLower.get('copyright_notice') ?? transLower.get('copyright')
    return {
      id: (r.id ?? r.translation_id) as string | number,
      abbreviation: String(abbrCol ? (r[abbrCol] ?? '') : (r.id ?? '')).toUpperCase(),
      name: String(nameCol ? (r[nameCol] ?? '') : ''),
      language: langCol && r[langCol] != null ? String(r[langCol]) : null,
      copyright: copyCol && r[copyCol] != null ? String(r[copyCol]) : null
    }
  })
  if (translations.length === 0) problems.push('translations table is empty')

  const verseCols = columnNames(db, 'verses')
  const vLower = new Set(verseCols.map((c) => c.toLowerCase()))
  const hasBookId = vLower.has('book_id')
  const hasChapterNumber = vLower.has('chapter_number')
  const hasVerseNumber = vLower.has('verse_number')
  const hasCanonicalId = vLower.has('canonical_id')
  const hasReference = vLower.has('reference')
  const hasValidationStatus = vLower.has('validation_status')
  const hasTranslationId = vLower.has('translation_id')
  const hasText = vLower.has('text')

  if (!hasText) problems.push('verses table has no text column')
  if (!hasTranslationId) problems.push('verses table has no translation_id column')
  if (!hasBookId && !hasCanonicalId) {
    problems.push('verses table needs book_id or canonical_id for lookups')
  }
  if (!hasChapterNumber || !hasVerseNumber) {
    if (!hasCanonicalId) problems.push('verses table needs chapter/verse columns or canonical_id')
    else warnings.push('verses table lacks chapter_number/verse_number; using canonical_id')
  }
  if (!hasReference) warnings.push('verses table has no reference column (references derived)')

  if (problems.length > 0) {
    throw new DatabaseError(problems.join('; '), 'schema-mismatch')
  }

  // Determine how verses.translation_id links to translations.
  let translationLink: DbProbe['translationLink'] = 'unknown'
  const distinctRaw = safeAll<Record<string, unknown>>(
    db,
    'SELECT DISTINCT translation_id FROM verses LIMIT 50'
  )
  const distinct = distinctRaw.map((r) => r.translation_id)
  if (distinct.length > 0) {
    const fkCount = safeGet<{ n: number }>(
      db,
      'SELECT COUNT(*) AS n FROM verses v JOIN translations t ON v.translation_id = t.id'
    )
    if (fkCount && fkCount.n > 0) {
      translationLink = 'foreign-key'
    } else {
      const abbrs = new Set(translations.map((t) => t.abbreviation.toUpperCase()))
      const allMatch = distinct.every((v) =>
        v == null ? false : abbrs.has(String(v).toUpperCase())
      )
      if (allMatch) translationLink = 'abbreviation'
      else problems.push('cannot link verses.translation_id to translations')
    }
  } else {
    problems.push('verses table is empty')
  }

  // Per-translation verse counts (single grouped query, no full scans).
  const counts: Record<string, number> = {}
  if (translationLink === 'foreign-key') {
    const rows = safeAll<{ abbreviation: string; n: number }>(
      db,
      'SELECT t.abbreviation AS abbreviation, COUNT(*) AS n FROM verses v JOIN translations t ON v.translation_id = t.id GROUP BY t.abbreviation'
    )
    for (const r of rows) counts[String(r.abbreviation).toUpperCase()] = Number(r.n)
  } else if (translationLink === 'abbreviation') {
    const rows = safeAll<{ translation_id: unknown; n: number }>(
      db,
      'SELECT translation_id, COUNT(*) AS n FROM verses GROUP BY translation_id'
    )
    for (const r of rows) counts[String(r.translation_id).toUpperCase()] = Number(r.n)
  }
  for (const t of REQUIRED_TRANSLATIONS) {
    if (!counts[t]) warnings.push(`translation ${t}: no verses in database`)
  }

  // Optional FTS index detection.
  let fts: DbProbe['fts'] = null
  for (const name of tables) {
    if (name.endsWith('_data') || name.endsWith('_idx') || name.endsWith('_docsize')) continue
    const sql = safeGet<{ sql: string }>(
      db,
      'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?',
      ['table', name]
    )
    if (!sql?.sql || !/USING\s+FTS/i.test(sql.sql)) continue
    const cols = columnNames(db, name).map((c) => c.toLowerCase())
    const textCol = ['text', 'normalized_text', 'body', 'verse_text'].find((c) => cols.includes(c))
    if (!textCol) continue
    const refCol = ['reference', 'ref', 'canonical_id'].find((c) => cols.includes(c)) ?? null
    const tCol = ['translation', 'translation_id', 'translation_abbr'].find((c) => cols.includes(c)) ?? null
    fts = { table: name, textColumn: textCol, refColumn: refCol, translationColumn: tCol }
    break
  }

  return {
    tables,
    hasMetadata: meta.present,
    schemaVersion: meta.schemaVersion,
    databaseVersion: meta.databaseVersion,
    canonical: meta.canonical,
    books,
    translations,
    verseColumns: verseCols,
    hasBookId,
    hasChapterNumber,
    hasVerseNumber,
    hasCanonicalId,
    hasReference,
    hasValidationStatus,
    translationLink,
    fts,
    counts,
    problems,
    warnings
  }
}
