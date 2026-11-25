# writes a race's library entries: the race (its standard traits and favored class options) and an entry for each
# alternate racial trait, from the page as parse_race.py read it (the text, verbatim) and an authoring file (what
# only judgment gives: adjustments, where each shows, the race's stats, examples). an item the authoring file lacks is
# an error: nothing is written from memory
import sys, json, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
parsed = json.load(open(sys.argv[1])); author = json.load(open(sys.argv[2])); out = sys.argv[3]
race = author['race']; slug = race['slug']
def tslug(name): return re.sub(r'[^a-z0-9]+', '-', name.lower().replace('’', '').replace("'", '')).strip('-')

from entry_parts import extras
missing = []
std = {s['name']: s['text'] for s in parsed['standard']}
race_cites = set()
features = []
stats_text = ' '.join(std[n] for n in race['statsFrom'])
features.append({'name': f"{race['name']} Racial Stats", 'description': stats_text, 'adjustments': race['stats'], 'shownIn': 'hidden'})
for name, text in std.items():
    if name in race['statsFrom']: continue
    a = author['standard'].get(name)
    if a is None: missing.append(f'standard {name}'); continue
    f = {'name': a.get('as', name), 'description': text, 'adjustments': extras(a, a.get('as', name), race_cites)}
    for k in ('shownIn', 'charges', 'descriptionOnly'):
        if k in a: f[k] = a[k]
    features.append(f)
options = []
for fcb in parsed['favored']:
    key = fcb['class'] + (('|' + fcb['text'][:20]) if sum(1 for x in parsed['favored'] if x['class'] == fcb['class']) > 1 else '')
    # a class with two options or more keys each by the start of its text, so neither takes the other's authoring
    a = author['favored'].get(key)
    if a is None: missing.append(f"favored {fcb['class']}"); continue
    o = {'class': fcb['class'], 'description': fcb['text'], 'adjustments': a.get('adjustments', {})}
    if a.get('descriptionOnly'): o['descriptionOnly'] = a['descriptionOnly']
    o['source'] = {'book': fcb['source']['book'], 'page': fcb['source']['page']}
    race_cites.add(fcb['source']['book'])
    options.append(o)
text = f"## {race['name']} Racial Traits\n\n" + '\n'.join(f"- **{n}**: {t}" for n, t in std.items()) + '\n'
entry = {'id': f'race/{slug}', 'kind': 'race', 'name': race['name'], **({'aliases': race['aliases']} if race.get('aliases') else {}),
  'source': race['source'], **({'cites': sorted(race_cites - {race['source']['book']})} if race_cites - {race['source']['book']} else {}),
  'schemaVersion': 1, 'text': text, 'facts': {'racial traits': race['traits']},
  **({'choices': race['choices']} if race.get('choices') else {}), 'examples': race['examples'],
  'data': {'subtype': race['subtype'], 'features': features, 'favoredClassOptions': options}}
alts = []; skipped = []
for alt in parsed['alternate']:
    a = author['alternate'].get(alt['name'])
    if a is None: missing.append(f"alternate {alt['name']}"); continue
    # one left out, with the reason ("skip"): a trait that replaces one the race has only from another alternate
    if a.get('skip'): skipped.append(f"{alt['name']} ({a['skip']})"); continue
    cites = set()
    f = {'name': alt['name'], 'description': alt['text'], 'adjustments': extras(a, alt['name'], cites), 'replaces': alt['replaces']}
    cites.discard(alt['source']['book'])
    for k in ('shownIn', 'charges', 'descriptionOnly'):
        if k in a: f[k] = a[k]
    alts.append({'id': f"racial-trait/{slug}/{tslug(alt['name'])}", 'kind': 'racial-trait', 'name': alt['name'],
      'source': {'book': alt['source']['book'], 'page': alt['source']['page'], 'url': race['source']['url']},
      **({'cites': sorted(cites)} if cites else {}), **({'choices': a['choices']} if a.get('choices') else {}),
      'schemaVersion': 1, 'text': f"**{alt['name']}**: " + alt['text'] + '\n', **({'tags': a['tags']} if a.get('tags') else {}),
      'facts': {'race': race['name'], 'replaces': alt['replaces']},
      'examples': a['examples'], 'data': {'feature': f}})
extra = sorted(set(author['alternate']) - {a['name'] for a in parsed['alternate']}) + sorted(set(author['standard']) - set(std))
if missing or extra:
    print('not written:', *missing, *(f'authored but not on the page: {e}' for e in extra), sep='\n  '); sys.exit(1)
os.makedirs(f'{out}/race', exist_ok=True); os.makedirs(f'{out}/racial-trait/{slug}', exist_ok=True)
for path, data in [(f'{out}/race/{slug}.json', entry)] + [(f"{out}/{a['id']}.json", a) for a in alts]:
    with open(path, 'w') as fh: fh.write(json.dumps(data, indent=1, ensure_ascii=False) + '\n')
print(f"{race['name']}: race, {len(options)} favored class options, {len(alts)} alternate racial traits"
      + (f"; left out: {', '.join(skipped)}" if skipped else ''))
