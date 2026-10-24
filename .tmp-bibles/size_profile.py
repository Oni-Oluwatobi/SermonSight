import sqlite3, os

DB = r'C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight\assets\sermonsight.ss'
con = sqlite3.connect(DB, timeout=30)
con.execute('PRAGMA query_only=ON')
cur = con.cursor()

print('file size MB: %.1f' % (os.path.getsize(DB) / 1048576))
print('page_count:', cur.execute('PRAGMA page_count').fetchone()[0])
print('page_size:', cur.execute('PRAGMA page_size').fetchone()[0])
print('freelist_count:', cur.execute('PRAGMA freelist_count').fetchone()[0])
print('auto_vacuum:', cur.execute('PRAGMA auto_vacuum').fetchone()[0])

print('\n== per-table/index sizes via dbstat ==')
try:
    rows = cur.execute("SELECT name, SUM(pgsize), COUNT(*) FROM dbstat GROUP BY name ORDER BY SUM(pgsize) DESC").fetchall()
    for name, size, pages in rows:
        print('%-30s %10.1f MB  (%d pages)' % (name, size / 1048576, pages))
except Exception as e:
    print('dbstat unavailable:', e)

print('\n== logical column payload ==')
q = "SELECT COUNT(*), SUM(LENGTH(text)), SUM(LENGTH(reference)) FROM %s"
for t in ['verses', 'search_index']:
    c, tx, rf = cur.execute(q % t).fetchone()
    print('%s: rows=%d text=%.1f MB reference=%.1f MB' % (t, c, (tx or 0) / 1048576, (rf or 0) / 1048576))
for col in ['normalized_text', 'tokens', 'keywords']:
    s = cur.execute('SELECT SUM(LENGTH(%s)) FROM search_index' % col).fetchone()[0]
    print('search_index.%s: %.1f MB' % (col, s / 1048576))
same = cur.execute('SELECT COUNT(*) FROM search_index WHERE tokens = normalized_text').fetchone()[0]
print('rows where tokens == normalized_text: %d' % same)

print('\n== verses non-text payload ==')
s = cur.execute('SELECT SUM(LENGTH(source_id)+LENGTH(validation_status)+LENGTH(created_at)+LENGTH(reference)) FROM verses').fetchone()[0]
print('source_id+validation_status+created_at+reference: %.1f MB' % (s / 1048576))

print('\n== search usage sample ==')
# how many search_index rows vs verses
print('search_index rows:', cur.execute('SELECT COUNT(*) FROM search_index').fetchone()[0])
con.close()
