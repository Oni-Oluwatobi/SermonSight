import sqlite3, json, os, shutil

DB = r'C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight\assets\sermonsight.ss'
out = []

con = sqlite3.connect(DB, timeout=10)
con.execute('PRAGMA query_only=ON')
cur = con.cursor()

for (name, sql) in cur.execute("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name"):
    out.append('== TABLE %s ==\n%s' % (name, sql))

out.append('\n== translations rows ==')
cols = [d[1] for d in cur.execute('PRAGMA table_info(translations)')]
out.append('cols: ' + ', '.join(cols))
for row in cur.execute('SELECT * FROM translations'):
    out.append(repr(row))

for t in ['verses', 'search_index', 'books', 'chapters']:
    out.append('\n== %s cols ==' % t)
    out.append(', '.join(d[1] for d in cur.execute('PRAGMA table_info(%s)' % t)))
    out.append('count: %d' % cur.execute('SELECT COUNT(*) FROM %s' % t).fetchone()[0])

out.append('\n== verses sample ==')
for row in cur.execute("SELECT * FROM verses WHERE translation_id='KJV' LIMIT 3"):
    out.append(repr(row))

out.append('\n== search_index sample ==')
for row in cur.execute("SELECT * FROM search_index WHERE translation_id='KJV' LIMIT 2"):
    out.append(repr(row))

out.append('\n== books (id, name, abbrev, osis) ==')
for row in cur.execute("SELECT * FROM books ORDER BY id LIMIT 70"):
    out.append(repr(row))

out.append('\n== chapters sample ==')
for row in cur.execute('SELECT * FROM chapters LIMIT 5'):
    out.append(repr(row))

out.append('\n== indexes ==')
for row in cur.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"):
    out.append('%s: %s' % (row[0], row[1]))

con.close()

dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'schema-dump.txt')
open(dst, 'w', encoding='utf-8').write('\n'.join(out))
print('WROTE', dst)
