import sqlite3, os, hashlib, time

DB = r'C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight\assets\sermonsight.ss'
BACKUP = DB + '.bak-preslim-20261010-013044'

def verse_hash(con, abbr):
    h = hashlib.sha256()
    for row in con.execute(
            'SELECT canonical_id, text FROM verses WHERE translation_id=? ORDER BY canonical_id', (abbr,)):
        h.update(('%s|%s\n' % row).encode('utf-8'))
    return h.hexdigest()

con = sqlite3.connect(DB, timeout=30)
con.execute('PRAGMA query_only=ON')
cur = con.cursor()
print('integrity:', cur.execute('PRAGMA integrity_check').fetchone()[0])
print('fk violations:', len(cur.execute('PRAGMA foreign_key_check').fetchall()))

counts = dict(cur.execute('SELECT translation_id, COUNT(*) FROM verses GROUP BY translation_id'))
print('verse counts (%d translations, %d total):' % (len(counts), sum(counts.values())))
for k in sorted(counts):
    print('  %s: %d' % (k, counts[k]))

idx = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")]
print('indexes:', idx)
print('search_index rows:', cur.execute('SELECT COUNT(*) FROM search_index').fetchone()[0])

t0 = time.time()
hits = cur.execute(
    "SELECT COUNT(*) FROM verses WHERE text LIKE '%shepherd%' AND translation_id='KJV'").fetchone()[0]
print("search smoke KJV 'shepherd': %d hits in %.2fs" % (hits, time.time() - t0))

bcon = sqlite3.connect(BACKUP, timeout=30)
bcon.execute('PRAGMA query_only=ON')
for abbr in ['KJV', 'NLT']:
    h1 = verse_hash(con, abbr)
    h2 = verse_hash(bcon, abbr)
    c1 = counts[abbr]
    c2 = bcon.execute('SELECT COUNT(*) FROM verses WHERE translation_id=?', (abbr,)).fetchone()[0]
    print('%s: count %d vs backup %d, hash_match=%s' % (abbr, c1, c2, h1 == h2))
bcon.close()

print('db size: %.1f MB' % (os.path.getsize(DB) / 1048576))
con.close()
print('VALIDATION DONE')
