import json, os, time, urllib.request, urllib.parse, sys

BASE = os.path.dirname(os.path.abspath(__file__))
XML_DIR = os.path.join(BASE, 'xml')
os.makedirs(XML_DIR, exist_ok=True)
log_path = os.path.join(BASE, 'download.log')

def log(msg):
    line = '[%s] %s' % (time.strftime('%H:%M:%S'), msg)
    with open(log_path, 'a', encoding='utf-8') as f:
        f.write(line + '\n')
    print(line, flush=True)

manifest = json.load(open(os.path.join(BASE, 'manifest.json'), encoding='utf-8'))
contents = json.load(open(os.path.join(BASE, 'contents.json'), encoding='utf-8'))
url_by_name = {x['name']: x['download_url'] for x in contents}

ok = fail = skip = 0
for entry in manifest:
    fn = entry['file']
    dest = os.path.join(XML_DIR, fn)
    if os.path.exists(dest) and os.path.getsize(dest) > 100000:
        skip += 1
        continue
    url = url_by_name.get(fn)
    if not url:
        log('NO-URL: %s' % fn)
        fail += 1
        continue
    success = False
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 SermonSight-import/1.0'})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if len(data) < 100000:
                raise IOError('too small: %d' % len(data))
            with open(dest + '.part', 'wb') as f:
                f.write(data)
            os.replace(dest + '.part', dest)
            log('OK %s (%d bytes)' % (fn, len(data)))
            success = True
            break
        except Exception as e:
            log('RETRY %d %s: %r' % (attempt + 1, fn, e))
            time.sleep(3 * (attempt + 1))
    if success:
        ok += 1
        time.sleep(1.5)
    else:
        log('FAIL: %s' % fn)
        fail += 1

log('DONE ok=%d skip=%d fail=%d' % (ok, skip, fail))
sys.exit(1 if fail else 0)
