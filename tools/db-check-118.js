const D = require('better-sqlite3')
const db = new D('assets/sermonsight.ss', { readonly: true })
const mism = db.prepare(`
  SELECT b.name, c.chapter_number ch, c.verse_count expected,
         SUM(CASE WHEN v.id IS NOT NULL THEN 1 ELSE 0 END) actual
  FROM chapters c
  JOIN books b ON b.id = c.book_id
  LEFT JOIN verses v ON v.book_id = c.book_id AND v.chapter_number = c.chapter_number AND v.translation_id = 'KJV'
  GROUP BY c.id
  HAVING actual <> expected
  ORDER BY (expected - actual) DESC
`).all()
console.log('mismatched chapters (manifest vs actual KJV rows):', mism.length)
console.log(JSON.stringify(mism.slice(0, 30), null, 1))
const sumE = db.prepare('SELECT SUM(verse_count) s FROM chapters').get().s
const sumA = db.prepare(`SELECT COUNT(*) s FROM verses WHERE translation_id='KJV'`).get().s
console.log('manifest sum:', sumE, 'actual sum:', sumA)
db.close()
