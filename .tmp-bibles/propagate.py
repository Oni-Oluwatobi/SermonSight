import hashlib, os, shutil, time

BASE = r'C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight'
SRC = os.path.join(BASE, 'assets', 'sermonsight.ss')
TARGETS = [
    os.path.join(BASE, 'sermonsight.ss'),
    os.path.join(BASE, 'dist', 'win-unpacked', 'resources', 'assets', 'sermonsight.ss'),
]

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

src_size = os.path.getsize(SRC)
src_hash = sha256(SRC)
print('SRC  %d bytes %s' % (src_size, src_hash))
ok = True
for t in TARGETS:
    shutil.copy2(SRC, t)
    t_size = os.path.getsize(t)
    t_hash = sha256(t)
    match = (t_size == src_size and t_hash == src_hash)
    print('%s %d bytes %s match=%s' % ('OK ' if match else 'BAD', t_size, t_hash, match))
    ok = ok and match
    for suffix in ('-wal', '-shm'):
        stray = t + suffix
        if os.path.exists(stray):
            os.remove(stray)
            print('removed stray', stray)
print('PROPAGATION', 'OK' if ok else 'FAILED')
