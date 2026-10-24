/* Read-only inventory + validation of sermonsight.ss (canonical model).
   Run: node_modules\electron\dist\electron.exe tools\validate-db.js [dbPath]
   Output: JSON report (translation | books | chapters | verses | missing | duplicates | status). */
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const dbPath = process.argv[2] || path.join(__dirname, '..', 'assets', 'sermonsight.ss')
const db = new Database(dbPath, { readonly: true })
db.pragma('query_only = ON')

const TOTAL_BOOKS = db.prepare('SELECT COUNT(*) c FROM books').get().c
const TOTAL_CHAPTERS = db.prepare('SELECT COUNT(*) c FROM chapters').get().c

const canonicalSlots = db.prepare('SELECT COALESCE(SUM(verse_count), 0) c FROM chapters').get().c
const canonicalVerseRows = db.prepare('SELECT COUNT(*) c FROM verses').get().c
const kjvVerses = db.prepare("SELECT COUNT(*) c FROM verses WHERE translation_id = 'KJV'").get().c

function transReport(id) {
  const row = db.prepare('SELECT id, text_status, license_status FROM translations WHERE id = ?').get(id)
  const verses = db.prepare('SELECT COUNT(*) c FROM verses WHERE translation_id = ?').get(id).c
  const books = db.prepare('SELECT COUNT(DISTINCT book_id) c FROM verses WHERE translation_id = ?').get(id).c
  const chapters = db
    .prepare("SELECT COUNT(DISTINCT book_id || '.' || chapter_number) c FROM verses WHERE translation_id = ?")
    .get(id).c
  const dupes = db
    .prepare(
      'SELECT COUNT(*) c FROM (SELECT canonical_id FROM verses WHERE translation_id = ? GROUP BY canonical_id HAVING COUNT(*) > 1)'
    )
    .get(id).c
  const malformed = db
    .prepare(
      "SELECT COUNT(*) c FROM verses WHERE translation_id = ? AND (reference NOT LIKE '%:%' OR canonical_id NOT LIKE '%.%.%' OR TRIM(text) = '')"
    )
    .get(id).c
  const missing = verses === 0 ? 'ALL (no data)' : canonicalSlots - verses
  let status
  if (verses === 0) status = 'REQUIRES_AUTHORIZED_SOURCE'
  else if (books === TOTAL_BOOKS && chapters === TOTAL_CHAPTERS && verses === canonicalSlots && dupes === 0 && malformed === 0)
    status = 'VERIFIED'
  else status = 'INCOMPLETE'
  return {
    translation: id,
    present: !!row,
    text_status: row?.text_status ?? 'ABSENT',
    license_status: row?.license_status ?? 'ABSENT',
    books: `${books}/${TOTAL_BOOKS}`,
    chapters: `${chapters}/${TOTAL_CHAPTERS}`,
    verses,
    missing,
    duplicates: dupes,
    malformed,
    status
  }
}

const out = {
  file: dbPath,
  size: fs.statSync(dbPath).size,
  schema_version: db.pragma('user_version', { simple: true }),
  journal_mode: db.pragma('journal_mode', { simple: true }),
  tables: db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name),
  index_count: db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").get().c,
  canonical: {
    books: `${db.prepare('SELECT COUNT(*) c FROM books').get().c}/${TOTAL_BOOKS}`,
    chapters: `${db.prepare('SELECT COUNT(*) c FROM chapters').get().c}/${TOTAL_CHAPTERS}`,
    canonical_slots: canonicalSlots,
    all_translation_rows: canonicalVerseRows,
    book_order_ok: db.prepare('SELECT COUNT(*) c FROM books WHERE canonical_order BETWEEN 1 AND 66').get().c === TOTAL_BOOKS
  },
  search_index: db.prepare('SELECT COUNT(*) c FROM search_index').get().c,
  aliases: db.prepare('SELECT COUNT(*) c FROM aliases').get().c,
  translations: ['KJV', 'NIV', 'NLT', 'NKJV', 'MSG'].map(transReport),
  kjv_sample: {}
}

for (const s of ['GEN.1.1', 'JHN.3.16', 'PSA.23.1', 'ROM.8.28', 'REV.22.21']) {
  const r = db
    .prepare('SELECT reference, text FROM verses WHERE canonical_id = ? AND translation_id = ?')
    .get(s, 'KJV')
  out.kjv_sample[s] = r ? `${r.reference}: ${r.text.slice(0, 70)}` : 'MISSING'
}

const lines = [
  'Translation | Books | Chapters | Verses | Missing | Duplicates | Malformed | Status',
  ...out.translations.map(
    (t) =>
      `${t.translation} | ${t.books} | ${t.chapters} | ${t.verses} | ${t.missing} | ${t.duplicates} | ${t.malformed} | ${t.status}`
  )
]
out.table = lines.join('\n')
console.log(JSON.stringify(out, null, 2))
db.close()

