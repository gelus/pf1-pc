# merges a patch of traits or feats from any books into their authoring files ({"<slug or name>": {...}}): each item
# is found in the book file that has it. a patch's keys replace the item's (null removes one); what the drafter wrote
# for it is dropped (it is the hand's now); an item no book has is refused
import glob, json, os, sys
kind, path = sys.argv[1], sys.argv[2]
files = {p: json.load(open(p)) for p in glob.glob(f'author/{kind}/*.json')}
for name, change in json.load(open(path)).items():
    found = [p for p, a in files.items() if name in a]
    if not found: raise SystemExit(f'{name}: in no {kind} authoring file')
    item = files[found[0]][name]
    # what the drafter wrote goes with it: its example (of its adjustments) and its note
    if item.pop('drafted', None) and 'adjustments' in change:
        if 'examples' not in change: item['examples'] = [{'expect': {}}]
        if 'descriptionOnly' not in change: item.pop('descriptionOnly', None)
    for k, v in change.items():
        if v is None: item.pop(k, None)
        else: item[k] = v
for p, a in files.items(): json.dump(a, open(p, 'w'), indent=1, ensure_ascii=False)
print('patched', len(json.load(open(path))))
