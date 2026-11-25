# writes an archetype's library entry from its page as parse_archetype.py read it (text, source, the level each
# feature is gained at and what it replaces or alters: verbatim) and an authoring file (only judgment: each
# feature's adjustments, where it shows, what grows, its uses; class skill, proficiency or spellcasting changes; the
# examples). a feature on the page the authoring file lacks stops it
import sys, json, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from entry_parts import extras
parsed = json.load(open(sys.argv[1])); author = json.load(open(sys.argv[2])); out = sys.argv[3]
arch = author['archetype']
# what it trades, sorted against its class's own feature names (as featureKey reads them): a whole feature it
# replaces or alters, else a part of one (the rage powers gained at 4th, 8th and 12th level), else not a feature (its
# skills, its alignment: given as its class skill changes)
class_entry = json.load(open(os.path.join(out, 'class', arch['class'] + '.json')))
def key(name):
    k = re.sub(r'\([^)]*\)|[+-]?\d*d\d+|[+-]?\d+(st|nd|rd|th)?\b', '', name.lower().replace('’', "'"))
    k = re.sub(r"^(both|the|a|an)\s+|\b(barbarian|bard|cleric|druid|fighter|monk|paladin|ranger|rogue|sorcerer|wizard)'s\s+", '', re.sub(r"[^a-z' ]", ' ', k).strip())
    return re.sub(r'\s+', ' ', k).strip().rstrip('s')
features_of_class = {key(f['name']): f['name'] for f in class_entry['data']['features']}
def whole(names): return [features_of_class[key(n)] for n in names if key(n) in features_of_class]
# the pieces of one partial trade the page lists with commas ("the rage powers gained at 4th, 8th, and 12th levels"),
# put back together as the page says it
def parts(names):
    pieces = [n for n in names if key(n) not in features_of_class and re.search(r'\b\d+(st|nd|rd|th)\b|\brage powers?\b|\bbonus feats?\b|\btalents?\b|\blevels?\b', n)]
    return [', '.join(pieces)] if pieces else []
missing, features, cites, replaces, alters, partial = [], [], set(), [], [], []
for f in parsed['features']:
    a = author['features'].get(f['name'])
    if a is None: missing.append(f['name']); continue
    replaces += [r for r in a.get('replaces', whole(f['replaces'])) if r not in replaces]
    alters += [r for r in a.get('alters', whole(f['alters'])) if r not in alters]
    partial += [r for r in a.get('partial', parts(f['replaces'] + f['alters'])) if r not in partial]
    if a.get('skip'): continue
    gained = a.get('gainedAt') or f['level'] or 1
    feature = {'name': a.get('as', f['name']), 'description': f['text'], 'adjustments': extras(a, a.get('as', f['name']), cites), 'gainedAt': gained}
    for x in ('shownIn', 'charges', 'descriptionOnly', 'active'):
        if x in a: feature[x] = a[x]
    if 'grows' in a: feature['grows'] = a['grows']
    if 'uses' in a:
        u = a['uses']
        at = {str(l): u['start'] + u.get('step', 0) * (l - u.get('from', 1)) // u.get('every', 1) for l in range(u.get('from', 1), 21)} if 'start' in u else u['at']
        feature['uses_by_level'] = {'at': at, **{x: u[x] for x in ('plus', 'per', 'label') if x in u}}
    features.append(feature)
    # a feature that gives more at later levels than a number can grow by (a sense at 10th, another at 13th): the same
    # feature gained again at each of those levels with what it adds then
    for stage in a.get('stages', []):
        features.append({'name': feature['name'], 'description': f['text'], 'adjustments': stage['adjustments'], 'gainedAt': stage['gainedAt'],
                         **({'shownIn': stage.get('shownIn', feature.get('shownIn'))} if stage.get('shownIn', feature.get('shownIn')) else {})})
extra = sorted(set(author['features']) - {f['name'] for f in parsed['features']})
if missing or extra:
    print('not written:', *missing, *(f'authored but not on the page: {e}' for e in extra), sep='\n  '); sys.exit(1)
cls = arch['class']
archetype = {'name': parsed['name'], 'replaces': replaces, **({'alters': alters} if alters else {}), **({'partial': partial} if partial else {}),
  **{k: arch[k] for k in ('classSkills', 'proficiencies', 'spellcasting') if k in arch}, 'sourceUrl': arch['url']}
text = f"## {parsed['name']}\n\n{parsed['intro']}\n\n" + '\n\n'.join(
  f"**{f['name']}{' (' + f['type'] + ')' if f['type'] else ''}**: {f['text']}" for f in parsed['features']) + '\n'
slug = re.sub(r'[^a-z0-9]+', '-', parsed['name'].lower().replace("'", '')).strip('-')
entry = {'id': f'archetype/{cls}/{slug}', 'kind': 'archetype', 'name': parsed['name'], **({'aliases': arch['aliases']} if arch.get('aliases') else {}),
  'source': {'book': parsed['source']['book'], 'page': parsed['source']['page'], 'url': arch['url']},
  **({'cites': sorted(cites - {parsed['source']['book']})} if cites - {parsed['source']['book']} else {}),
  'schemaVersion': 1, 'text': text, **({'tags': arch['tags']} if arch.get('tags') else {}),
  'facts': {'class': cls.title(), 'replaced features': replaces + alters},
  **({'choices': arch['choices']} if arch.get('choices') else {}), 'examples': arch['examples'],
  'data': {'class': f'class/{cls}', 'archetype': archetype, 'features': features}}
os.makedirs(f'{out}/archetype/{cls}', exist_ok=True)
with open(f"{out}/{entry['id']}.json", 'w') as fh: fh.write(json.dumps(entry, indent=1, ensure_ascii=False) + '\n')
print(f"{parsed['name']} ({cls}): {len(features)} features, replaces {', '.join(replaces) or 'nothing'}{'; alters ' + ', '.join(alters) if alters else ''}{'; partly ' + '; '.join(partial) if partial else ''}")
