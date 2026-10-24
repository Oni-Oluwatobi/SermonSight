import json, os, sqlite3, time

BASE = os.path.dirname(os.path.abspath(__file__))
DB = r'C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight\assets\sermonsight.ss'
NOW = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())

manifest = json.load(open(os.path.join(BASE, 'manifest.json'), encoding='utf-8'))
con = sqlite3.connect(DB, timeout=30)
cur = con.cursor()
cur.execute('BEGIN')
fixed = 0
for entry in manifest:
    abbr = entry['abbr']
    cur.execute('SELECT 1 FROM translations WHERE id=?', (abbr,))
    if cur.fetchone():
        print('exists:', abbr)
        continue
    if entry['license'] == 'public-domain':
        notice = 'Public Domain translation. Source: sajeevavahini/bibles (The Word XMLBIBLE format).'
        lic = 'public-domain'
        access = 'github-repo-xml'
        source = 'sajeevavahini/bibles (GitHub)'
        status = 'imported'
    else:
        notice = ('Scripture taken from the New King James Version. Copyright (c) 1982 by Thomas Nelson. '
                  'Used by permission. All rights reserved. Local personal use only - MUST NOT be bundled '
                  'in public installers or redistributed.')
        lic = 'commercial/licensed - Thomas Nelson'
        access = 'github-repo-xml-local-only'
        source = 'sajeevavahini/bibles (GitHub) - local import, not for redistribution'
        status = 'imported-local-only'
    cur.execute(
        'INSERT INTO translations (id, name, abbreviation, language, year, publisher, source, source_url, '
        'license_status, access_method, copyright_notice, is_default, text_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        (abbr, entry['name'], abbr, 'en', str(entry['year']), entry['publisher'], source,
         'https://github.com/sajeevavahini/bibles', lic, access, notice, 0, status))
    fixed += 1
    print('inserted:', abbr)
con.commit()
fk = cur.execute('PRAGMA foreign_key_check').fetchall()
print('fk violations after fix:', len(fk))
con.execute('PRAGMA optimize')
con.commit()
con.close()
print('FIX DONE rows_inserted=%d' % fixed)
