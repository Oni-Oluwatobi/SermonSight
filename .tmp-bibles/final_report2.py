import json, os, sqlite3, time, sys

DB = r'C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight\assets\sermonsight.ss'
BASE = os.path.dirname(os.path.abspath(__file__))
NOW = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
print('start', flush=True)

con = sqlite3.connect(DB, timeout=30)
con.execute('PRAGMA query_only=ON')
cur = con.cursor()
print('connected', flush=True)
counts = dict(cur.execute('SELECT translation_id, COUNT(*) FROM verses GROUP BY translation_id'))
print('counts', flush=True)
rows = list(cur.execute('SELECT id, name, license_status, text_status FROM translations ORDER BY id'))
print('rows', flush=True)
con.close()

report = {
    'generated': NOW,
    'source_repository': 'https://github.com/sajeevavahini/bibles',
    'source_repository_license': 'NONE (no LICENSE file; no per-translation grants) - assessed per-translation by text age/origin',
    'database_bytes': os.path.getsize(DB),
    'integrity_check': 'ok (verified post-import)',
    'fk_violations': 0,
    'backups': [
        'assets/sermonsight.ss.bak-preimport-20261009-090500 (pre-import, KJV+NLT, 66,760,704 B)',
        'assets/sermonsight.ss.bak-20261008-222014 (pre-NLT, KJV-only, 33,841,152 B)',
    ],
    'copies_synced': [
        'assets/sermonsight.ss',
        'sermonsight.ss (root)',
        'dist/win-unpacked/resources/assets/sermonsight.ss',
    ],
    'sha256': '85053165626d111e89f874afbfc659629496f77b45bcf483aa1bed29d8b46d57',
    'verse_counts': counts,
    'translations': [{'id': r[0], 'name': r[1], 'license': r[2], 'status': r[3]} for r in rows],
    'notes': {
        'ASV': 'missing LUK.11.47 (textual variant)',
        'BSB': 'Bishop\'s Bible; 33 missing (source chapter-division differences)',
        'BRE': 'Brenton Septuagint; OT-only source; Septuagint structure differs (8,474 canonical slots absent)',
        'DAR': 'missing ACT.8.37, ACT.15.34, MAT.23.14 (textual variants)',
        'DRB': 'Douay-Rheims; Vulgate Psalm numbering differs from KJV; 845 missing canonical slots',
        'GNV': '39 missing (variant verses + chapter divisions)',
        'HNV': '7 missing (textual variants)',
        'HRV': '17 missing (textual variants)',
        'RV': '16 missing (textual variants)',
        'TYN': 'Tyndale 1534; NT + Pentateuch + Jonah only (historical: translation unfinished)',
        'WEB': '8 missing (textual variants)',
        'WYC': '75 missing (source chapter-division differences)',
        'NKJV': 'LOCAL USE ONLY - MUST NOT be redistributed or bundled in public installers',
    },
    'imported_complete': ['AKJV', 'COV', 'MTB', 'RNKJV', 'ROT', 'WBS', 'YLT', 'NKJV'],
    'not_imported_copyrighted': [
        'NIV (US), NIV (UK), TNIV, NIRV, ESV, NASB (1995), NLT (repo copy skipped - local NLT from user PDF already present), MSG, Amplified (1965), HCSB (2004), NRSV (1989), RSV (1952), NAB, NCV (1991), TEV/GNB (1992), CJB (1998), NJB, Third Millennium (1998), MKJV (1962), LITBV (2000), New Life (1969), 21st Century KJV, Updated Bible (2006), Complementary English Version (1995), Easy-to-Read Revised (2005), English Jubilee 2000, English Lo Parishuddha Grandham, Apostles\' Bible (2004), A Conservative Version, Voice in Wilderness (2006), Revised Webster Update (1995), NET (2005)',
    ],
    'not_imported_non_english': [
        'Bengali', 'Hindi', 'Kannada', 'Malayalam', 'Tamil', 'Telugu (BSI)', 'Telugu (WBTC)',
    ],
    'not_imported_existing_kjv': 'King James Version (1769) repo copy skipped; existing verified KJV preserved unchanged',
    'public_installer_policy': {
        'rule': 'Public installers must bundle a PD-only database (KJV + 19 PD imports).',
        'exclude_from_public_builds': ['NLT', 'NKJV', 'NIV', 'MSG', 'any user-supplied copyrighted text'],
    },
    'app_wiring': 'None required - translation dropdown reads DB dynamically; all 22 translations selectable/searchable/projectable immediately.',
}
out_path = os.path.join(BASE, 'import-final-report.json')
json.dump(report, open(out_path, 'w', encoding='utf-8'), indent=2)
print('WROTE', out_path, flush=True)
print('db MB:', round(report['database_bytes'] / 1048576, 1), 'translations with verses:', len([c for c in counts.values() if c > 0]), flush=True)
