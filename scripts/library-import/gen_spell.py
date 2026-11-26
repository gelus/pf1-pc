# writes the library entries of a book's spells (public/library/spell/<slug>.json): from each spell's page as
# parse_spell.py read it (its statistics and text, verbatim) and the book's authoring file (author/spell/<book>.json:
# what only judgment gives, by the spell's name: its effect's adjustments, a note, choices, examples). a spell is the
# book's when its first source with a notice in books.json is that book. a spell of the book the authoring file
# lacks, or one it has that isn't the book's, stops it: nothing is written from memory
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from entry_parts import extras
from book_code import BOOKS
book = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', '..', 'public', 'library')
def slug(name): return re.sub(r'[^a-z0-9]+', '-', name.lower().replace('’', '').replace("'", '')).strip('-')
def book_of(spell): return next((s for s in spell['sources'] if s['book'] in BOOKS), None)
spells = [s for s in (json.load(open(p)) for p in sorted(glob.glob(os.path.join(HERE, 'parsed', 'spell', '*.json'))))
          if (book_of(s) or {}).get('book') == book]
path = os.path.join(HERE, 'author', 'spell', f'{book}.json')
author = json.load(open(path)) if os.path.exists(path) else {}
missing = [s['name'] for s in spells if s['name'] not in author]
extra = sorted(set(author) - {s['name'] for s in spells})
if missing or extra:
    print('not written:', *(f'no authoring: {m}' for m in missing), *(f'authored but not of the book: {e}' for e in extra), sep='\n  '); sys.exit(1)
written = skipped = 0
os.makedirs(os.path.join(out, 'spell'), exist_ok=True)
for s in spells:
    a = author[s['name']]
    if a.get('skip'): skipped += 1; continue
    if not s['levels']: print('  no levels read:', s['name']); skipped += 1; continue
    src = book_of(s); cites = set()
    spell = {'name': s['name'], 'school': s['school'], **({'subSchool': s['subSchool']} if s['subSchool'] else {}),
             **({'descriptors': s['descriptors']} if s['descriptors'] else {}),
             'castingTime': s['castingTime'], 'components': s['components'], 'range': s['range'] or 'none',
             'target': s['target'], 'duration': s['duration'] or 'none', 'savingThrow': s['savingThrow'] or 'none',
             'spellResistance': s['spellResistance'], 'description': s['description']}
    adjustments = extras(a, s['name'], cites)
    if adjustments: spell['adjustments'] = adjustments
    if a.get('descriptionOnly'): spell['descriptionOnly'] = a['descriptionOnly']
    cites.discard(src['book'])
    school = s['school'] + (f" ({s['subSchool']})" if s['subSchool'] else '') + (f" [{', '.join(s['descriptors'])}]" if s['descriptors'] else '')
    stats = [f"**School** {school}; **Level** {s['levelText']}", f"**Casting Time** {s['castingTime']}",
             f"**Components** {s['componentsText']}", f"**Range** {s['range']}" if s['range'] else '',
             f"**{s['target'].split(':')[0]}** {s['target'].split(':', 1)[1].strip()}" if ':' in s['target'] else (f"**Target** {s['target']}" if s['target'] else ''),
             f"**Duration** {s['duration']}" if s['duration'] else '',
             f"**Saving Throw** {s['savingThrow'] or 'none'}; **Spell Resistance** {s['spellResistanceText'] or 'no'}"]
    text = f"**{s['name']}**\n\n" + '\n'.join(x for x in stats if x) + '\n\n' + s['description'] + '\n'
    entry = {'id': f"spell/{slug(s['name'])}", 'kind': 'spell', 'name': s['name'],
      **({'aliases': a['aliases']} if a.get('aliases') else {}),
      'source': {'book': src['book'], 'page': src['page'], 'url': 'https://aonprd.com/SpellDisplay.aspx?ItemName=' + s['name'].replace(' ', '%20')},
      **({'cites': sorted(cites)} if cites else {}), 'schemaVersion': 1, 'text': text,
      'tags': [s['school'].capitalize()] + a.get('tags', []),
      'facts': {'school': s['school'], 'levels': s['levelText']},
      **({'choices': a['choices']} if a.get('choices') else {}),
      'examples': a.get('examples', [{'expect': {}}]), 'data': {'spell': spell, 'levels': s['levels']}}
    with open(os.path.join(out, 'spell', slug(s['name']) + '.json'), 'w') as fh: fh.write(json.dumps(entry, indent=1, ensure_ascii=False) + '\n')
    written += 1
print(f'{book}: {written} spells written' + (f', {skipped} left out' if skipped else ''))
