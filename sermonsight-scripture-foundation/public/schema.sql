-- SermonSight Master Scripture Database Schema
-- File: sermonsight.ss (SQLite format)
-- Canonical 66-Book Protestant Structure with Translation Layers

CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  language TEXT NOT NULL,
  year TEXT,
  publisher TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT NOT NULL,
  license_status TEXT NOT NULL,
  access_method TEXT NOT NULL,
  copyright_notice TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  text_status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY,
  osis_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL,
  testament TEXT NOT NULL CHECK(testament IN ('OT', 'NT')),
  canonical_order INTEGER NOT NULL UNIQUE,
  chapter_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  canonical_id TEXT NOT NULL UNIQUE,
  verse_count INTEGER NOT NULL,
  UNIQUE(book_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_id TEXT NOT NULL,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  verse_number INTEGER NOT NULL,
  reference TEXT NOT NULL,
  translation_id TEXT NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source_id TEXT NOT NULL,
  validation_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(canonical_id, translation_id)
);

CREATE TABLE IF NOT EXISTS aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  alias TEXT NOT NULL COLLATE NOCASE,
  match_type TEXT NOT NULL DEFAULT 'standard',
  UNIQUE(book_id, alias)
);

CREATE TABLE IF NOT EXISTS search_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_id TEXT NOT NULL,
  translation_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  tokens TEXT NOT NULL,
  keywords TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS validation_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT NOT NULL,
  checked_at TEXT NOT NULL
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_verses_canonical ON verses (canonical_id, translation_id);
CREATE INDEX IF NOT EXISTS idx_verses_book_chap_verse ON verses (book_id, chapter_number, verse_number);
CREATE INDEX IF NOT EXISTS idx_verses_ref ON verses (reference);
CREATE INDEX IF NOT EXISTS idx_verses_trans ON verses (translation_id);
CREATE INDEX IF NOT EXISTS idx_search_norm ON search_index (normalized_text);
CREATE INDEX IF NOT EXISTS idx_search_canonical ON search_index (canonical_id);
CREATE INDEX IF NOT EXISTS idx_search_trans ON search_index (translation_id);
CREATE INDEX IF NOT EXISTS idx_aliases_alias ON aliases (alias COLLATE NOCASE);