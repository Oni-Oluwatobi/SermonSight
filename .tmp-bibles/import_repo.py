import json, os, re, sqlite3, sys, time, unicodedata
import xml.etree.ElementTree as ET

BASE = os.path.dirname(os.path.abspath(__file__))
XML_DIR = os.path.join(BASE, 'xml')
DB = r'C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight\assets\sermonsight.ss'
REPORT = os.path.join(BASE, 'import-report.json')
LOG = os.path.join(BASE, 'import.log')

def log(msg):
    line = '[%s] %s' % (time.strftime('%H:%M:%S'), msg)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')
    print(line, flush=True)

NUM = {'1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V', '6': 'VI', '7': 'VII',
       '8': 'VIII', '9': 'IX', '10': 'X', '11': 'XI', '12': 'XII'}

def name_keys(name):
    s = unicodedata.normalize('NFKD', name)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = s.replace('&', ' and ')
    s = re.sub(r"\(.*?\)", ' ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    parts = [p for p in s.split() if p]
    joined = ''.join(parts)
    keys = {joined}
    cleaned = [p for p in parts if p not in ('the', 'of', 'bible', 'book')]
    if cleaned:
        keys.add(''.join(cleaned))
    return keys

ROMAN = re.compile(r'^[ivxlcdm]+$')

def split_name(name):
    s = unicodedata.normalize('NFKD', name)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'^the\s+', '', s.strip(), flags=re.I)
    s = re.sub(r'\(.*?\)', '', s).strip()
    m = re.match(r'^([1-5])\s*(.+)$', s)
    if m:
        return m.group(2), NUM[m.group(1)]
    m = re.match(r'^([1-5])\s*\.\s*(.+)$', s)
    if m:
        return m.group(2), NUM[m.group(1)]
    m = re.match(r'^([IVXLC]+)\s*\.\s*(.+)$', s)
    if m and m.group(1).upper() in NUM.values():
        return m.group(2), m.group(1).upper()
    return s, ''

def normalize(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9_\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def tokenize(normalized):
    return normalized

def keywords_of(normalized):
    seen = []
    for tok in normalized.split():
        if len(tok) > 3 and tok not in seen:
            seen.append(tok)
    return ' '.join(seen)

def get_bnumber(book):
    for attr in ('bnumber', 'bNumber', 'bsn', 'bname'):
        pass
    v = book.get('bnumber')
    if v is None:
        v = book.get('bNumber')
    if v is None:
        v = book.get('bsn')
    return v

def get_bname(book):
    for attr in ('bname', 'bName', 'btitle', 'btitle'):
        v = book.get(attr)
        if v:
            return v.strip()
    return ''

def parse_verses(elem):
    parts = []
    if elem.text:
        parts.append(elem.text)
    for child in elem:
        tag = child.tag.upper()
        if tag in ('ND', 'TS', 'Q', 'BR', 'L'):
            if child.tail:
                parts.append(' ' + child.tail)
            continue
        if tag in ('NOTE', 'EXTRACT', 'PARAM'):
            if child.tail:
                parts.append(child.tail)
            continue
        if child.text:
            parts.append(child.text)
        if child.tail:
            parts.append(child.tail)
    return ''.join(parts)

def clean_text(text):
    text = text.replace(' ', ' ')
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r' ?\n ?', ' ', text)
    return text.strip()

NOW = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())

def main():
    manifest = json.load(open(os.path.join(BASE, 'manifest.json'), encoding='utf-8'))
    con = sqlite3.connect(DB, timeout=30)
    cur = con.cursor()

    canonical = {}
    for cid, bid, chnum, vcount in cur.execute('SELECT canonical_id, book_id, chapter_number, verse_count FROM chapters'):
        canonical.setdefault(bid, {})[chnum] = vcount
    all_slots = set()
    for cid, bid, chnum, vcount in cur.execute('SELECT canonical_id, book_id, chapter_number, verse_count FROM chapters'):
        for v in range(1, vcount + 1):
            all_slots.add('%s.%d.%d' % (cid.rsplit('.', 1)[0], chnum, v))
    slot_book = {}
    slot_ref = {}
    books_meta = {}
    for bid, osis, bname, babbrev in cur.execute('SELECT id, osis_id, name, abbreviation FROM books'):
        books_meta[bid] = (osis, bname, babbrev)
    for cid, bid, chnum, vcount in cur.execute('SELECT canonical_id, book_id, chapter_number, verse_count FROM chapters'):
        osis = books_meta[bid][0]
        for v in range(1, vcount + 1):
            slot_book['%s.%d.%d' % (osis, chnum, v)] = bid
            slot_ref['%s.%d.%d' % (osis, chnum, v)] = '%s %d:%d' % (books_meta[bid][1], chnum, v)
    log('canonical slots loaded: %d' % len(all_slots))

    key_to_book = {}
    for bid, (osis, bname, babbrev) in books_meta.items():
        for k in name_keys(bname):
            key_to_book.setdefault(k, bid)
        for k in name_keys(osis):
            key_to_book.setdefault(k, bid)
        for k in name_keys(babbrev):
            key_to_book.setdefault(k, bid)
    extra = {'psalm': 'Psalms', 'canticles': 'Song of Solomon', 'song of songs': 'Song of Solomon',
             'coheleth': 'Ecclesiastes', 'eclesiastes': 'Ecclesiastes', 'jesus son of sirach': None,
             'i maccabees': None, 'ii maccabees': None, 'iii maccabees': None, 'iv maccabees': None,
             'tobit': None, 'judith': None, 'wisdom': None, 'sirach': None, 'baruch': None,
             'epistle of jeremy': None, 'prayer of azariah': None, 'susanna': None, 'bel and the dragon': None,
             '1 esdras': None, '2 esdras': None, 'manasseh': None, 'psalm 151': None}
    for k, v in list(extra.items()):
        kk = k.replace(' ', '')
        if v is None:
            key_to_book.setdefault(kk, None)
        else:
            target = None
            for bid, (osis, bname, babbrev) in books_meta.items():
                if bname == v:
                    target = bid
            if target:
                key_to_book.setdefault(kk, target)

    results = []
    total_ins = 0
    for entry in manifest:
        fn = entry['file']
        abbr = entry['abbr']
        path = os.path.join(XML_DIR, fn)
        if not os.path.exists(path):
            log('SKIP missing file: %s' % fn)
            results.append({'abbr': abbr, 'status': 'missing-file'})
            continue
        t0 = time.time()
        try:
            tree = ET.parse(path)
        except Exception as e:
            log('XML PARSE FAIL %s: %r' % (abbr, e))
            results.append({'abbr': abbr, 'status': 'parse-error', 'error': repr(e)})
            continue
        root = tree.getroot()
        ins_rows = []
        unmatched_names = set()
        unmatched_books = {}
        dup_count = 0
        for book in root:
            bname = get_bname(book)
            bnum = get_bnumber(book)
            bid = None
            keys = name_keys(bname) if bname else set()
            for k in keys:
                if k in key_to_book:
                    v = key_to_book[k]
                    if v is None:
                        unmatched_names.add(bname)
                        break
                    bid = v
                    break
            if bid is None and bnum is not None:
                try:
                    n = int(bnum)
                    if 1 <= n <= 66:
                        bid = n
                except ValueError:
                    pass
            if bid is None or (bname and bname in unmatched_names):
                if bname:
                    unmatched_books[bname] = book
                continue
            osis = books_meta[bid][0]
            btitle = books_meta[bid][1]
            for ch in book:
                cnum_s = ch.get('cnumber') or ch.get('cNumber') or ch.get('cnum')
                if not cnum_s:
                    continue
                try:
                    cnum = int(cnum_s)
                except ValueError:
                    continue
                vcount = canonical.get(bid, {}).get(cnum)
                if vcount is None:
                    continue
                for vs in ch:
                    vnum_s = vs.get('vnumber') or vs.get('vNumber') or vs.get('vnum')
                    if not vnum_s:
                        continue
                    try:
                        vnum = int(vnum_s)
                    except ValueError:
                        continue
                    text = clean_text(parse_verses(vs))
                    cid = '%s.%d.%d' % (osis, cnum, vnum)
                    if vnum > vcount or text == '':
                        continue
                    ref = '%s %d:%d' % (btitle, cnum, vnum)
                    ins_rows.append((cid, bid, cnum, vnum, ref, abbr, text))
        seen = set()
        deduped = []
        for r in ins_rows:
            if r[0] in seen:
                dup_count += 1
                continue
            seen.add(r[0])
            deduped.append(r)
        ins_rows = deduped
        got = {r[0] for r in ins_rows}
        missing = sorted(all_slots - got)
        extras = []
        for bname, book in unmatched_books.items():
            cnt = sum(1 for _ in book.iter() if _.tag.upper().startswith('VERS'))
            extras.append({'book': bname, 'verses': cnt})
        for r in ins_rows:
            if r[0] not in slot_book:
                extras.append({'canonical_id': r[0]})
        now = NOW
        try:
            cur.execute('BEGIN')
            cur.execute("DELETE FROM verses WHERE translation_id=?", (abbr,))
            cur.execute("DELETE FROM search_index WHERE translation_id=?", (abbr,))
            si_rows = []
            for (cid, bid, cnum, vnum, ref, _a, text) in ins_rows:
                norm = normalize(text)
                si_rows.append((cid, abbr, ref, text, norm, tokenize(norm), keywords_of(norm)))
            cur.executemany(
                'INSERT INTO verses (canonical_id, book_id, chapter_number, verse_number, reference, translation_id, text, source_id, validation_status, created_at) '
                'VALUES (?,?,?,?,?,?,?,?,?,?)',
                [(r[0], r[1], r[2], r[3], r[4], r[5], r[6], 'sajeevavahini-bibles-xml', 'imported', now) for r in ins_rows])
            cur.executemany(
                'INSERT INTO search_index (canonical_id, translation_id, reference, text, normalized_text, tokens, keywords) VALUES (?,?,?,?,?,?,?)',
                si_rows)
            if entry['license'] == 'public-domain':
                cur.execute('UPDATE translations SET source=?, source_url=?, license_status=?, access_method=?, '
                            'copyright_notice=?, text_status=?, year=?, publisher=? WHERE id=?',
                            ('sajeevavahini/bibles (GitHub)', 'https://github.com/sajeevavahini/bibles',
                             'public-domain', 'github-repo-xml',
                             'Public Domain translation. Source: sajeevavahini/bibles (The Word XMLBIBLE format).',
                             'imported', str(entry['year']), entry['publisher'], abbr))
            else:
                cur.execute('UPDATE translations SET source=?, source_url=?, license_status=?, access_method=?, '
                            'copyright_notice=?, text_status=?, year=?, publisher=? WHERE id=?',
                            ('sajeevavahini/bibles (GitHub) - local import, not for redistribution',
                             'https://github.com/sajeevavahini/bibles',
                             'commercial/licensed - Thomas Nelson', 'github-repo-xml-local-only',
                             'Scripture taken from the New King James Version. Copyright (c) 1982 by Thomas Nelson. '
                             'Used by permission. All rights reserved. Local personal use only - MUST NOT be bundled '
                             'in public installers or redistributed.',
                             'imported-local-only', str(entry['year']), entry['publisher'], abbr))
            con.commit()
        except Exception as e:
            con.rollback()
            log('DB FAIL %s: %r' % (abbr, e))
            results.append({'abbr': abbr, 'status': 'db-error', 'error': repr(e)})
            continue
        total_ins += len(ins_rows)
        dt = time.time() - t0
        res = {'abbr': abbr, 'file': fn, 'status': 'ok', 'inserted': len(ins_rows),
               'missing': len(missing), 'missing_ids': missing[:50],
               'dups_skipped': dup_count,
               'unmatched_source_books': extras, 'seconds': round(dt, 1)}
        results.append(res)
        log('%s inserted=%d missing=%d dups=%d unmatched_books=%d (%.1fs)' % (
            abbr, len(ins_rows), len(missing), dup_count, len(extras), dt))
    con.execute('PRAGMA optimize')
    con.commit()
    con.close()
    json.dump({'generated': NOW, 'total_inserted': total_ins, 'results': results},
              open(REPORT, 'w', encoding='utf-8'), indent=2)
    log('ALL DONE total_inserted=%d' % total_ins)

if __name__ == '__main__':
    main()
