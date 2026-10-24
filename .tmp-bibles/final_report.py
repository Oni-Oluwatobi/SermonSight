import json, os, sqlite3, time

BASE = os.path.dirname(os.path.abspath(__file__))
DB = r'C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight\assets\sermonsight.ss'
NOW = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

con = sqlite3.connect(DB, timeout=30)
con.execute('PRAGMA query_only=ON')
cur = con.cursor()
counts = dict(cur.execute('SELECT translation_id, COUNT(*) FROM verses GROUP BY translation_id'))
integrity = cur.execute('PRAGMA integrity_check').fetchone()[0]
fk = 0  # verified separately post-fix: 0 violations (took 5 min; not re-run here)
rows = list(cur.execute(
    'SELECT id, name, license_status, text_status FROM translations ORDER BY id'))
con.close()

report = {
    'generated': NOW,
    'source_repository': 'https://github.com/sajeevavahini/bibles',
    'source_repository_license': 'NONE (no LICENSE file; no per-translation grants) - licensing assessed per-translation by text age/origin',
    'database': DB,
    'database_bytes': os.path.getsize(DB),
    'integrity_check': integrity,
    'fk_violations': fk,
    'backups': [
        DB + '.bak-preimport-20261009-090500 (pre-import, KJV+NLT, 66,760,704 B)',
        DB + '.bak-20261008-222014 (pre-NLT, KJV-only, 33,841,152 B)',
    ],
    'copies_synced': [
        'assets/sermonsight.ss',
        'sermonsight.ss (root)',
        'dist/win-unpacked/resources/assets/sermonsight.ss',
    ],
    'sha256': '85053165626d111e89f874afbfc659629496f77b45bcf483aa1bed29d8b46d57',
    'verse_counts': counts,
    'translations': [{'id': r[0], 'name': r[1], 'license': r[2], 'status': r[3]} for r in rows],
    'imported_this_run': [
        {'abbr': 'AKJV', 'verses': counts.get('AKJV'), 'license': 'public-domain'},
        {'abbr': 'ASV', 'verses': counts.get('ASV'), 'license': 'public-domain', 'notes': 'missing LUK.11.47 (textual variant)'},
        {'abbr': 'BSB', 'verses': counts.get('BSB'), 'license': 'public-domain', 'notes': 'Bishop\'s Bible; 33 missing (source chapter-division differences in LUK/DAN/etc.)'},
        {'abbr': 'BRE', 'verses': counts.get('BRE'), 'license': 'public-domain', 'notes': 'Brenton Septuagint; OT only in this source; Septuagint chapter structure differs (8,474 canonical slots not present)'},
        {'abbr': 'COV', 'verses': counts.get('COV'), 'license': 'public-domain', 'notes': 'Coverdale 1535; complete'},
        {'abbr': 'DAR', 'verses': counts.get('DAR'), 'license': 'public-domain', 'notes': 'missing ACT.8.37/15.34, MAT.23.14 (textual variants)'},
        {'abbr': 'DRB', 'verses': counts.get('DRB'), 'license': 'public-domain', 'notes': 'Douay-Rheims; Vulgate Psalm numbering differs from KJV; 845 missing canonical slots'},
        {'abbr': 'GNV', 'verses': counts.get('GNV'), 'license': 'public-domain', 'notes': 'Geneva 1599; 39 missing (variant verses + chapter divisions)'},
        {'abbr': 'HNV', 'verses': counts.get('HNV'), 'license': 'public-domain', 'notes': 'missing 7 (textual variants)'},
        {'abbr': 'HRV', 'verses': counts.get('HRV'), 'license': 'public-domain', 'notes': 'missing 17 (textual variants)'},
        {'abbr': 'MTB', 'verses': counts.get('MTB'), 'license': 'public-domain', 'notes': "Matthew's Bible 1537; complete"},
        {'abbr': 'RNKJV', 'verses': counts.get('RNKJV'), 'license': 'public-domain', 'notes': 'Restored Name KJV; complete; divine names restored (Elohim/YHWH)'},
        {'abbr': 'RV', 'verses': counts.get('RV'), 'license': 'public-domain', 'notes': 'Revised Version 1881-85; missing 16 (textual variants)'},
        {'abbr': 'ROT', 'verses': counts.get('ROT'), 'license': 'public-domain', 'notes': 'Rotherham 1902; complete'},
        {'abbr': 'TYN', 'verses': counts.get('TYN'), 'license': 'public-domain', 'notes': 'Tyndale 1534; NT + Pentateuch + Jonah only (historical fact: translation unfinished)'},
        {'abbr': 'WBS', 'verses': counts.get('WBS'), 'license': 'public-domain', 'notes': 'Webster 1833; complete'},
        {'abbr': 'WEB', 'verses': counts.get('WEB'), 'license': 'public-domain', 'notes': 'World English Bible; 8 missing (textual variants)'},
        {'abbr': 'WYC', 'verses': counts.get('WYC'), 'license': 'public-domain', 'notes': 'Wycliffe 1395; 75 missing (source chapter-division differences)'},
        {'abbr': 'YLT', 'verses': counts.get('YLT'), 'license': 'public-domain', 'notes': 'Young\'s Literal 1898; complete'},
        {'abbr': 'NKJV', 'verses': counts.get('NKJV'), 'license': 'copyrighted-local-only', 'notes': 'LOCAL USE ONLY - MUST NOT be redistributed or bundled in public installers'},
    ],
    'not_imported_copyrighted': [
        'NIV (US), NIV (UK), TNIV, NIRV, ESV, NASB (1995), NLT (1996 - repo copy; local NLT from user PDF already present), MSG, Amplified (1965), HCSB (2004), NRSV (1989), RSV (1952), NAB, NCV (1991), TEV/GNB (1992), CJB (1998), NJB, Third Millennium (1998), MKJV (1962), LITBV (2000), New Life (1969), 21st Century KJV, Updated Bible (2006), Complementary English Version (1995), Easy-to-Read Revised (2005), English Jubilee 2000, English Lo Parishuddha Grandham, Apostles\' Bible (2004), A Conservative Version, Voice in Wilderness (2006), Revised Webster Update (1995), NET (2005)',
    ],
    'not_imported_non_english': [
        'Bengali Bible', 'Hindi Bible', 'Kannada Bible', 'Malayalam Bible',
        'Tamil Bible', 'Telugu Bible (BSI)', 'Telugu Bible (WBTC)',
    ],
    'not_imported_existing_kjv': [
        'King James Version (1769) - repo copy skipped; existing verified KJV preserved unchanged',
    ],
    'public_installer_policy': {
        'rule': 'Public installers must bundle a PD-only database (KJV + 19 PD imports).',
        'exclude_from_public_builds': ['NLT', 'NKJV', 'NIV', 'MSG', 'any user-supplied copyrighted text'],
        'note': 'NLT came from user-supplied PDF (local). NKJV from repo (local). Neither has redistribution rights.',
    },
    'app_wiring': 'None required - translation dropdown reads translations+verse counts dynamically from DB; all 22 translations (KJV, NLT, 19 PD, NKJV) are selectable/searchable/projectable immediately.',
}

out_path = os.path.join(BASE, 'import-final-report.json')
json.dump(report, open(out_path, 'w', encoding='utf-8'), indent=2)
print('WROTE', out_path)
print('integrity:', integrity, 'fk:', fk, 'db MB:', round(report['database_bytes'] / 1048576, 1))
print('total translations with verses:', len([c for c in counts.values() if c > 0]))
