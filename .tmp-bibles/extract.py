import zipfile, os, sys, time
dst = r'C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight\.tmp-bibles'
zpath = os.path.join(dst, 'bibles.zip')
log = os.path.join(dst, 'extract.log')
t0 = time.time()
with open(log, 'w', encoding='utf-8') as f:
    try:
        with zipfile.ZipFile(zpath) as z:
            z.extractall(dst)
        f.write('EXTRACT OK %.1fs\n' % (time.time() - t0))
        xmls = []
        for root, dirs, files in os.walk(dst):
            for fn in files:
                if fn.lower().endswith('.xml'):
                    p = os.path.join(root, fn)
                    xmls.append((fn, os.path.getsize(p)))
        xmls.sort()
        f.write('XML COUNT: %d\n' % len(xmls))
        total = 0
        for name, size in xmls:
            total += size
            f.write('%s\t%d\n' % (name, size))
        f.write('TOTAL XML BYTES: %d\n' % total)
    except Exception as e:
        f.write('ERROR: %r\n' % (e,))
        raise
print('done')
