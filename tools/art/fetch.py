# Скачивает с Poly Haven: python3 fetch.py tex <id>... | model <id>...  (в ./tex/<id>/ и ./models/<id>/)
import json, os, sys, urllib.request, concurrent.futures as cf
UA = {'User-Agent': 'game-asset-fetch/1.0'}
def get(url, path=None):
    import time
    for k in range(5):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=120) as r: data = r.read()
            break
        except Exception as e:
            if k == 4: raise
            time.sleep(1.5 * (k + 1))
    if path:
        os.makedirs(os.path.dirname(path), exist_ok=True); open(path, 'wb').write(data)
    return data
def tex(i, res='1k', maps=('Diffuse', 'nor_gl', 'Rough')):
    f = json.loads(get(f'https://api.polyhaven.com/files/{i}'))
    for m in maps:
        if m not in f: print('  no', m, 'in', i, list(f)[:12]); continue
        u = f[m][res]['jpg']['url']; p = f'tex/{i}/{m}.jpg'
        if not os.path.exists(p): get(u, p)
    return i
def model(i, res='1k'):
    f = json.loads(get(f'https://api.polyhaven.com/files/{i}'))
    g = f['gltf'][res]['gltf']; d = f'models/{i}'
    p = f'{d}/{i}.gltf'
    if not os.path.exists(p): get(g['url'], p)
    for rel, inc in g.get('include', {}).items():
        q = f'{d}/{rel}'
        if not os.path.exists(q): get(inc['url'], q)
    return i
if __name__ == '__main__':
    kind, ids = sys.argv[1], sys.argv[2:]
    fn = tex if kind == 'tex' else model
    def safe(i):
        try: return fn(i)
        except Exception as e: return f'{i} FAILED {e}'
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(safe, ids): print('ok', r)
