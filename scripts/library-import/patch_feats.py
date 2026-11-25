# merges patches into a book's feat authoring: {"<feat>": {...}}. a feat's patch replaces the keys it gives (null
# removes one); a feat the file lacks is refused
import json, sys
book, path = sys.argv[1], sys.argv[2]
p = f'author/feat/{book}.json'; a = json.load(open(p)); patch = json.load(open(path))
for name, change in patch.items():
    if name not in a: raise SystemExit(f'{name}: not a feat of {book}')
    for k, v in change.items():
        if v is None: a[name].pop(k, None)
        else: a[name][k] = v
json.dump(a, open(p, 'w'), indent=1, ensure_ascii=False)
print('patched', len(patch))
