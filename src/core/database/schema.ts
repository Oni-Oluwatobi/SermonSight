/**
 * Scripture database contract.
 *
 * The authoritative file is sermonsight.ss (SQLite internally).
 * Its exact column layout is produced by the database pipeline, so the app
 * probes the real schema at load time and adapts instead of assuming.
 * NEVER store or generate Scripture text here.
 */

/** Minimal SQL surface used by the repository (satisfied by better-sqlite3). */
export interface SqlExecutor {
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]
}

export const REQUIRED_TABLES = ['books', 'verses', 'translations'] as const
export const OPTIONAL_TABLES = [
  'chapters',
  'aliases',
  'search_index',
  'search_chunks',
  'validation_results',
  'metadata',
  'sources',
  'translation_manifest',
  'source_manifest'
] as const

export interface TranslationRow {
  id: string | number
  abbreviation: string
  name: string
  language: string | null
  copyright: string | null
}

export interface BookRow {
  id: number
  osis_id: string | null
  name: string
  abbreviation: string | null
  testament: string | null
  canonical_order: number | null
  chapter_count: number | null
}

export type TranslationLinkMode = 'foreign-key' | 'abbreviation' | 'unknown'

export interface DbProbe {
  tables: string[]
  hasMetadata: boolean
  schemaVersion: string | null
  databaseVersion: string | null
  canonical: string | null
  books: BookRow[]
  translations: TranslationRow[]
  verseColumns: string[]
  hasBookId: boolean
  hasChapterNumber: boolean
  hasVerseNumber: boolean
  hasCanonicalId: boolean
  hasReference: boolean
  hasValidationStatus: boolean
  translationLink: TranslationLinkMode
  fts: { table: string; textColumn: string; refColumn: string | null; translationColumn: string | null } | null
  /** verse counts per translation abbreviation */
  counts: Record<string, number>
  problems: string[]
  warnings: string[]
}

export interface VerseRecord {
  reference: string
  canonical_id: string | null
  text: string
  validation_status: string | null
}

/** All five required translations for the Sunday MVP. */
export const REQUIRED_TRANSLATIONS = ['KJV', 'NIV', 'NLT', 'NKJV', 'MSG'] as const
export type RequiredTranslation = (typeof REQUIRED_TRANSLATIONS)[number]

export function isRequiredTranslation(abbr: string): boolean {
  return (REQUIRED_TRANSLATIONS as readonly string[]).includes(abbr.toUpperCase())
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not-found'
      | 'not-a-database'
      | 'schema-mismatch'
      | 'open-failed'
      | 'no-verses'
      | 'internal'
  ) {
    super(message)
    this.name = 'DatabaseError'
  }
}
