#!/usr/bin/env python3
"""Build assets/sermonsight-public.ss — the PUBLIC DISTRIBUTION database.

Copies assets/sermonsight.ss, removes every translation that is NOT safe to
redistribute (NLT, NKJV, NIV, MSG and any other licensed text), vacuums,
validates, and writes a JSON report. The installer bundles this file as
sermonsight.ss (see electron-builder.yml) — licensed texts that the operator
added locally are never shipped.

Usage: python tools/build_public_db.py
"""
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'sermonsight.ss')
OUT = os.path.join(ROOT, 'assets', 'sermonsight-public.ss')
REPORT = os.path.join(ROOT, 'assets', 'public-db-report.json')

# Public-domain (or permissive) English translations safe to redistribute.
# Everything else present in the master DB (NLT, NKJV, NIV, MSG, ...) is removed.
PUBLIC_ABBRS = {
    'KJV', 'AKJV', 'ASV', 'BSB', 'BRE', 'COV', 'DAR', 'DRB', 'GNV',
    'HNV', 'HRV', 'MTB', 'RNKJV', 'ROT', 'RV', 'TYN', 'WEB', 'WBS', 'WYC', 'YLT',
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    if not os.path.exists(SRC):
        print('missing source database:', SRC)
        sys.exit(1)
    shutil.copy2(SRC, OUT)
    print('copied %s -> %s (%d MB)' % (SRC, OUT, os.path.getsize(OUT) // 2**20))

    con = sqlite3.connect(OUT)
    try:
        con.execute('PRAGMA journal_mode=DELETE')
        translations = con.execute('SELECT id, abbreviation FROM translations').fetchall()
        keep, drop = [], []
        for tid, abbr in translations:
            (keep if str(abbr or '').upper() in PUBLIC_ABBRS else drop).append((tid, abbr))

        verses_deleted = 0
        dropped = []
        with con:  # transaction
            for tid, abbr in drop:
                cur = con.execute('DELETE FROM verses WHERE translation_id = ?', (tid,))
                verses_deleted += cur.rowcount if cur.rowcount >= 0 else 0
                con.execute('DELETE FROM translations WHERE id = ?', (tid,))
                dropped.append(str(abbr))
            # search_index is unused by the app (search scans verses directly) —
            # keep it empty so the public copy cannot leak removed text.
            try:
                con.execute('DELETE FROM search_index')
            except sqlite3.Error:
                pass

        con.execute('VACUUM')
        integrity = con.execute('PRAGMA integrity_check').fetchone()[0]
        # rowcount after DELETE within transaction: re-count via remaining tables
        remaining = con.execute(
            'SELECT t.abbreviation, (SELECT COUNT(*) FROM verses v WHERE v.translation_id = t.id) '
            'FROM translations t ORDER BY t.abbreviation'
        ).fetchall()
        total_remaining = con.execute('SELECT COUNT(*) FROM verses').fetchone()[0]
    finally:
        con.close()

    # Exact deleted count from totals (rowcount is unreliable across drivers).
    src_con = sqlite3.connect(SRC)
    try:
        src_total = src_con.execute('SELECT COUNT(*) FROM verses').fetchone()[0]
    finally:
        src_con.close()
    verses_deleted = src_total - total_remaining

    report = {
        'generated': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'source': SRC,
        'sourceSha256': sha256(SRC),
        'sourceBytes': os.path.getsize(SRC),
        'sourceVerses': src_total,
        'output': OUT,
        'outputSha256': sha256(OUT),
        'outputBytes': os.path.getsize(OUT),
        'outputVerses': total_remaining,
        'integrity': integrity,
        'kept': [{'abbreviation': a, 'verses': n} for a, n in remaining],
        'dropped': dropped,
        'versesDeleted': verses_deleted,
    }
    with open(REPORT, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)

    print('integrity_check:', integrity)
    print('kept %d translations, dropped %d, deleted %d verses'
          % (len(keep), len(drop), verses_deleted))
    for a, n in remaining:
        print('  %-6s %d verses' % (a, n))
    print('dropped:', ', '.join(dropped) or '(none)')
    print('report:', REPORT)
    if integrity != 'ok':
        print('INTEGRITY CHECK FAILED')
        sys.exit(1)


if __name__ == '__main__':
    main()
