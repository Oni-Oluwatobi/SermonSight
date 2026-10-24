import sqlite3, time

DB = r'C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight\assets\sermonsight.ss'
con = sqlite3.connect(DB, timeout=30)
con.execute('PRAGMA query_only=ON')
cur = con.cursor()
ABBR = ['AKJV', 'ASV', 'BSB', 'BRE', 'COV', 'DAR', 'DRB', 'GNV', 'HNV', 'HRV',
        'MTB', 'RNKJV', 'RV', 'ROT', 'TYN', 'WBS', 'WEB', 'WYC', 'YLT', 'NKJV']
for cid in ['GEN.1.1', 'JHN.3.1', 'PSA.23.1']:
    print('==== %s ====' % cid)
    for a in ABBR:
        r = cur.execute('SELECT text FROM verses WHERE canonical_id=? AND translation_id=?', (cid, a)).fetchone()
        t = r[0] if r else '<MISSING>'
        print('%-6s %s' % (a, t[:110]))
print('==== translations table (id, name, text_status, license) ====')
for row in cur.execute('SELECT id, name, text_status, license_status FROM translations ORDER BY id'):
    print(row)
con.close()
