import json, os, sqlite3, hashlib, time

BASE = os.path.dirname(os.path.abspath(__file__))
DB = r'C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight\assets\sermonsight.ss'
BACKUP = DB + '.bak-preimport-20261009-090500'
REPORT = os.path.join(BASE, 'validate-report.json')
LOG = os.path.join(BASE, 'validate.log')

def log(msg):
    line = '[%s] %s' % (time.strftime('%H:%M:%S'), msg)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')
    print(line, flush=True)

PD_ABBRS = ['AKJV', 'ASV', 'BSB', 'BRE', 'COV', 'DAR', 'DRB', 'GNV', 'HNV', 'HRV',
            'MTB', 'RNKJV', 'RV', 'ROT', 'TYN', 'WBS', 'WEB', 'WYC', 'YLT']
ALL_NEW = PD_ABBRS + ['NKJV']
FROZEN = ['KJV', 'NLT']

SPOTS = {
    'GEN.1.1': 'In the beginning',
    'JHN.3.16': 'For God so loved',
    'REV.22.21': None,
    'MAT.1.1': None,
    'PSA.23.1': None,
}

def main():
    out = {}
    con = sqlite3.connect(DB, timeout=30)
    con.execute('PRAGMA query_only=ON')
    cur = con.cursor()

    log('integrity: %r' % cur.execute('PRAGMA integrity_check').fetchall())
    out['integrity'] = cur.execute('PRAGMA integrity_check').fetchone()[0]

    fk = cur.execute('PRAGMA foreign_key_check').fetchall()
    log('fk violations: %d' % len(fk))
    out['fk_violations'] = len(fk)

    trans_counts = dict(cur.execute(
        "SELECT translation_id, COUNT(*) FROM verses GROUP BY translation_id"))
    out['verse_counts'] = trans_counts
    log('verse counts: %r' % trans_counts)

    idx_counts = dict(cur.execute(
        "SELECT translation_id, COUNT(*) FROM search_index GROUP BY translation_id"))
    out['index_counts'] = idx_counts

    canon = {r[0] for r in cur.execute('SELECT canonical_id FROM chapters')}
    all_slots = set()
    for cid, vcount in cur.execute('SELECT canonical_id, verse_count FROM chapters'):
        osis = cid.rsplit('.', 1)[0]
        chnum = int(cid.rsplit('.', 1)[1])
        for v in range(1, vcount + 1):
            all_slots.add('%s.%d.%d' % (osis, chnum, v))
    log('canonical slots: %d' % len(all_slots))

    per_trans = {}
    for abbr in ALL_NEW:
        got = {r[0] for r in cur.execute(
            'SELECT canonical_id FROM verses WHERE translation_id=?', (abbr,))}
        idx = {r[0] for r in cur.execute(
            'SELECT canonical_id FROM search_index WHERE translation_id=?', (abbr,))}
        missing = sorted(all_slots - got)
        extras = sorted(got - all_slots)
        idx_missing = got - idx
        idx_orphans = idx - got
        nonempty = cur.execute(
            "SELECT COUNT(*) FROM verses WHERE translation_id=? AND TRIM(text)!=''", (abbr,)).fetchone()[0]
        dups = cur.execute(
            'SELECT COUNT(*) FROM (SELECT canonical_id FROM verses WHERE translation_id=? GROUP BY canonical_id HAVING COUNT(*)>1)',
            (abbr,)).fetchone()[0]
        per_trans[abbr] = {'inserted': len(got), 'missing': len(missing),
                           'missing_sample': missing[:10], 'extras': len(extras),
                           'extras_sample': extras[:10], 'nonempty': nonempty,
                           'index_missing': len(idx_missing), 'index_orphans': len(idx_orphans),
                           'dup_canonical': dups}
        log('%s: %d verses, missing=%d extras=%d idx_miss=%d idx_orph=%d dups=%d' % (
            abbr, len(got), len(missing), len(extras), len(idx_missing), len(idx_orphans), dups))
    out['per_translation'] = per_trans

    frozen = {}
    bcon = sqlite3.connect(BACKUP, timeout=30)
    bcur = bcon.cursor()
    for abbr in FROZEN:
        h1 = hashlib.sha256()
        for row in cur.execute(
                'SELECT canonical_id, text FROM verses WHERE translation_id=? ORDER BY canonical_id', (abbr,)):
            h1.update(('%s|%s\n' % row).encode('utf-8'))
        h2 = hashlib.sha256()
        for row in bcur.execute(
                'SELECT canonical_id, text FROM verses WHERE translation_id=? ORDER BY canonical_id', (abbr,)):
            h2.update(('%s|%s\n' % row).encode('utf-8'))
        c1 = cur.execute('SELECT COUNT(*) FROM verses WHERE translation_id=?', (abbr,)).fetchone()[0]
        c2 = bcur.execute('SELECT COUNT(*) FROM verses WHERE translation_id=?', (abbr,)).fetchone()[0]
        frozen[abbr] = {'count': c1, 'backup_count': c2, 'hash_match': h1.hexdigest() == h2.hexdigest()}
        log('%s frozen check: count %d vs backup %d, hash_match=%s' % (
            abbr, c1, c2, frozen[abbr]['hash_match']))
    bcon.close()
    out['frozen_translations'] = frozen

    spots = {}
    for cid, prefix in SPOTS.items():
        rows = {}
        for abbr in ['KJV', 'NLT'] + ALL_NEW:
            r = cur.execute('SELECT text FROM verses WHERE canonical_id=? AND translation_id=?',
                            (cid, abbr)).fetchone()
            rows[abbr] = (r[0][:60] if r and r[0] else None)
        spots[cid] = rows
    out['spot_verses'] = spots
    log('spot verses captured for %d refs' % len(spots))

    kjv_idx = cur.execute(
        "SELECT COUNT(*) FROM search_index WHERE translation_id='KJV' AND keywords LIKE '%beginning%'").fetchone()[0]
    out['kjv_search_smoke'] = kjv_idx
    log("KJV search smoke ('beginning'): %d hits" % kjv_idx)

    db_size = os.path.getsize(DB)
    out['db_bytes'] = db_size
    log('db size: %d bytes (%.1f MB)' % (db_size, db_size / 1048576))

    json.dump(out, open(REPORT, 'w', encoding='utf-8'), indent=2)
    con.close()
    log('VALIDATION DONE')

if __name__ == '__main__':
    main()
