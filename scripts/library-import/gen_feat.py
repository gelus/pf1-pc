# writes the library entries of a book's feats (public/library/feat/<slug>.json): from each feat's page as
# parse_feat.py read it (its text, prerequisites and types, verbatim) and the book's authoring file
# (author/feat/<book>.json: what only judgment gives, by the feat's name: adjustments, where it shows, choices, uses,
# examples). a feat is the book's when its first source with a notice in books.json is that book. a feat of the book
# the authoring file lacks, or one it has that isn't the book's, stops it: nothing is written from memory
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from entry_parts import extras
from book_code import BOOKS
book = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', '..', 'public', 'library')
def slug(name): return re.sub(r'[^a-z0-9]+', '-', name.lower().replace('’', '').replace("'", '')).strip('-')
WORDS = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9}
def book_of(feat): return next((s for s in feat['sources'] if s['book'] in BOOKS), None)
feats = [f for f in (json.load(open(p)) for p in sorted(glob.glob(os.path.join(HERE, 'parsed', 'feat', '*.json'))))
         if (book_of(f) or {}).get('book') == book]
path = os.path.join(HERE, 'author', 'feat', f'{book}.json')
author = json.load(open(path)) if os.path.exists(path) else {}
missing = [f['name'] for f in feats if f['name'] not in author]
extra = sorted(set(author) - {f['name'] for f in feats})
if missing or extra:
    print('not written:', *(f'no authoring: {m}' for m in missing), *(f'authored but not of the book: {e}' for e in extra), sep='\n  '); sys.exit(1)
written = skipped = 0
os.makedirs(os.path.join(out, 'feat'), exist_ok=True)
for feat in feats:
    a = author[feat['name']]
    if a.get('skip'): skipped += 1; continue
    src = book_of(feat)
    cites = set()
    # what a pick of the feat does, as the sheet keeps it: its benefit and its special rules
    description = '\n\n'.join(part for part in (feat['benefit'], feat['special'] and f"Special: {feat['special']}") if part) or feat['text']
    f = {'name': a.get('as', feat['name']), 'description': description, 'adjustments': extras(a, feat['name'], cites)}
    if feat['prerequisites'] and not re.match(r'^none$', feat['prerequisites'], re.I): f['prerequisites'] = feat['prerequisites']
    # a metamagic feat's slot, as its benefit says it ("uses up a spell slot one level higher"), unless authored
    mm = re.search(r'spell slot (\w+) levels? higher', feat['benefit'])
    if 'metamagic' in a: f['metamagic'] = a['metamagic']
    elif 'Metamagic' in feat['types'] and mm and mm.group(1).lower() in WORDS: f['metamagic'] = {'levels': WORDS[mm.group(1).lower()]}
    for k in ('shownIn', 'charges', 'descriptionOnly', 'active', 'stacks'):
        if k in a: f[k] = a[k]
    # a style feat (its types say Style, or the authoring does for a page that leaves it out) starts a stance: a
    # toggle, off until the player enters it (Feature.style)
    if a.get('style', 'Style' in feat['types']): f['style'] = True; f['active'] = False
    cites.discard(src['book'])
    types = f" ({', '.join(feat['types'])})" if feat['types'] else ''
    text = f"**{feat['name']}**{types}\n\n" + feat['text'] + '\n'
    entry = {'id': f"feat/{slug(feat['name'])}", 'kind': 'feat', 'name': feat['name'],
      **({'aliases': a['aliases']} if a.get('aliases') else {}),
      'source': {'book': src['book'], 'page': src['page'], 'url': 'https://aonprd.com/FeatDisplay.aspx?ItemName=' + feat['name'].replace(' ', '%20')},
      **({'cites': sorted(cites)} if cites else {}), 'schemaVersion': 1, 'text': text,
      **({'tags': feat['types'] + a.get('tags', [])} if feat['types'] or a.get('tags') else {}),
      'facts': {'prerequisites': feat['prerequisites'] or 'none', **({'type': feat['types']} if feat['types'] else {})},
      **({'choices': a['choices']} if a.get('choices') else {}),
      'examples': a.get('examples', [{'expect': {}}]), 'data': {'feature': f}}
    with open(os.path.join(out, 'feat', slug(feat['name']) + '.json'), 'w') as fh: fh.write(json.dumps(entry, indent=1, ensure_ascii=False) + '\n')
    written += 1
print(f'{book}: {written} feats written' + (f', {skipped} left out' if skipped else ''))
