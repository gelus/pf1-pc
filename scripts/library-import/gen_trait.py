# writes the library entries of a book's traits (public/library/trait/<slug>.json): from the trait lists as
# parse_traits.py read them (each trait's text, category and requirements, verbatim) and the book's authoring file
# (author/trait/<book>.json, by the trait's slug: adjustments, choices, uses, examples). a trait is the book's when its
# first source with a notice is that book. a trait of the book the file lacks, or one it has that isn't the book's,
# stops it. a drawback goes in the character's drawbacks, every other trait in its traits
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from entry_parts import extras
from book_code import BOOKS
book = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', '..', 'public', 'library')
def book_of(t): return next((s for s in t['sources'] if s['book'] in BOOKS), None)
traits = [t for t in (json.load(open(p)) for p in sorted(glob.glob(os.path.join(HERE, 'parsed', 'trait', '*.json'))))
          if (book_of(t) or {}).get('book') == book]
path = os.path.join(HERE, 'author', 'trait', f'{book}.json')
author = json.load(open(path)) if os.path.exists(path) else {}
missing = [t['slug'] for t in traits if t['slug'] not in author]
extra = sorted(set(author) - {t['slug'] for t in traits})
if missing or extra:
    print('not written:', *(f'no authoring: {m}' for m in missing), *(f'authored but not of the book: {e}' for e in extra), sep='\n  '); sys.exit(1)
os.makedirs(os.path.join(out, 'trait'), exist_ok=True)
written = skipped = 0
for t in traits:
    a = author[t['slug']]
    if a.get('skip'): skipped += 1; continue
    src = book_of(t); cites = set()
    f = {'name': t['name'], 'description': t['text'], 'adjustments': extras(a, t['name'], cites)}
    for k in ('shownIn', 'charges', 'descriptionOnly', 'active', 'stacks'):
        if k in a: f[k] = a[k]
    cites.discard(src['book'])
    kind = 'drawback' if t['category'] == 'Drawback' else f"{t['category'].lower()} trait"
    text = f"**{t['name']}** ({kind}{'; ' + t['requirements'] if t['requirements'] else ''})\n\n{t['text']}\n"
    entry = {'id': f"trait/{t['slug']}", 'kind': 'trait', 'name': t['name'],
      'source': {'book': src['book'], 'page': src['page'], 'url': 'https://aonprd.com/TraitDisplay.aspx?ItemName=' + t['name'].replace(' ', '%20')},
      **({'cites': sorted(cites)} if cites else {}), 'schemaVersion': 1, 'text': text,
      'tags': [t['category']] + a.get('tags', []),
      'facts': {'category': t['category'], **({'requirements': t['requirements']} if t['requirements'] else {})},
      **({'choices': a['choices']} if a.get('choices') else {}),
      'examples': a.get('examples', [{'expect': {}}]), 'data': {'feature': f}}
    with open(os.path.join(out, 'trait', t['slug'] + '.json'), 'w') as fh: fh.write(json.dumps(entry, indent=1, ensure_ascii=False) + '\n')
    written += 1
print(f'{book}: {written} traits written' + (f', {skipped} left out' if skipped else ''))
