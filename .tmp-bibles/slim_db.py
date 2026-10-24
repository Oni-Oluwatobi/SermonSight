import sqlite3, os, time

DB = r'C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight\assets\sermonsight.ss'
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'slim.log')

def log(msg):
    line = '[%s] %s' % (time.strftime('%H:%M:%S'), msg)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')
    print(line, flush=True)

before = os.path.getsize(DB)
log('size before: %d (%.1f MB)' % (before, before / 1048576))

con = sqlite3.connect(DB, timeout=60)
cur = con.cursor()
log('journal_mode: %r' % cur.execute('PRAGMA journal_mode').fetchone()[0])

cur.execute('BEGIN')
n = cur.execute('SELECT COUNT(*) FROM search_index').fetchone()[0]
log('search_index rows to delete: %d' % n)
cur.execute('DELETE FROM search_index')
log('deleted, changes=%d' % cur.execute('SELECT changes()').fetchone()[0])
for idx in ['idx_search_norm', 'idx_search_canonical', 'idx_search_trans']:
    cur.execute('DROP INDEX IF EXISTS %s' % idx)
    log('dropped %s' % idx)
cur.execute('COMMIT')

remaining = cur.execute("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_search%'").fetchall()
log('remaining idx_search*: %r' % remaining)
log('search_index count now: %d' % cur.execute('SELECT COUNT(*) FROM search_index').fetchone()[0])
con.close()

t0 = time.time()
log('VACUUM start...')
con = sqlite3.connect(DB, timeout=600)
con.execute('VACUUM')
con.close()
log('VACUUM done in %.1fs' % (time.time() - t0))

after = os.path.getsize(DB)
log('size after: %d (%.1f MB)' % (after, after / 1048576))
log('saved: %.1f MB (%.1f%%)' % ((before - after) / 1048576, 100.0 * (before - after) / before))
print('SLIM DONE')
