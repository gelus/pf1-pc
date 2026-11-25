# merges patches into a class's archetype authoring files: {"<archetype>": {"<feature>": {...}, "_archetype": {...}}}.
# a feature's patch replaces the keys it gives; "_archetype" patches the archetype's own part (class skills, examples)
import json, sys
cls, path = sys.argv[1], sys.argv[2]
for slug, patch in json.load(open(path)).items():
    p = f'author/archetype/{cls}.{slug}.json'; a = json.load(open(p))
    for name, change in patch.items():
        target = a['archetype'] if name == '_archetype' else a['features'].setdefault(name, {})
        for k, v in change.items():
            if v is None: target.pop(k, None)
            else: target[k] = v
    json.dump(a, open(p, 'w'), indent=1, ensure_ascii=False)
print('patched', len(json.load(open(path))))
