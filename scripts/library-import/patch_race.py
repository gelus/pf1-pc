# merges patches into a race's authoring file: {"alternate": {"<trait>": {...}}, "favored": {"<key>": {...}}}. an
# item's patch replaces the keys it gives (null removes one); a key of neither part is refused, unless
# --where-present (a patch of traits several races share, each patched where its race's page has it)
import json, sys
race, path = sys.argv[1], sys.argv[2]; present = '--where-present' in sys.argv
p = f'author/{race}.json'; a = json.load(open(p)); patch = json.load(open(path)); n = 0
for part, items in patch.items():
    for name, change in items.items():
        if name not in a[part] and present: continue
        if name not in a[part]: raise SystemExit(f'{part} {name}: not in the authoring file')
        for k, v in change.items():
            if v is None: a[part][name].pop(k, None)
            else: a[part][name][k] = v
        n += 1
json.dump(a, open(p, 'w'), indent=1, ensure_ascii=False)
print('patched', n)
