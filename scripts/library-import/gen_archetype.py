# writes an archetype's library entry from its page as parse_archetype.py read it (text, source, the level each
# feature is gained at and what it replaces or alters: verbatim) and an authoring file (only judgment: each
# feature's adjustments, where it shows, what grows, its uses; class skill, proficiency or spellcasting changes; the
# examples). a feature on the page the authoring file lacks stops it
import sys, json, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from entry_parts import extras
parsed = json.load(open(sys.argv[1])); author = json.load(open(sys.argv[2])); out = sys.argv[3]
arch = author['archetype']
# the first of its sources whose book's notice the OGL page can list
books = json.load(open(os.path.join(out, 'books.json')))
parsed['source'] = next((x for x in parsed.get('sources', [parsed['source']]) if x['book'] in books), parsed['source'])
# what it trades, sorted against its class's own feature names (as featureKey reads them): a whole feature it
# replaces or alters, else a part of one (the rage powers gained at 4th, 8th and 12th level), else not a feature (its
# skills, its alignment: given as its class skill changes)
class_entry = json.load(open(os.path.join(out, 'class', arch['class'] + '.json')))
def key(name):
    k = re.sub(r'\([^)]*\)|[+-]?\d*d\d+|[+-]?\d+(st|nd|rd|th)?\b', '', name.lower().replace('’', "'"))
    k = re.sub(r"^(both|the|a|an)\s+|\b(barbarian|bard|cleric|druid|fighter|monk|paladin|ranger|rogue|sorcerer|wizard)'s\s+", '', re.sub(r"[^a-z' ]", ' ', k).strip())
    return re.sub(r'\s+', ' ', k).strip().rstrip('s')
features_of_class = {key(f['name']): f['name'] for f in class_entry['data']['features']}
# a phrase naming a class feature among other words ("the dirge of doom bardic performance") is that feature, the
# longest name it holds as whole words
def feature_in(name):
    k = key(name)
    if k in features_of_class: return features_of_class[k]
    held = [f for f in features_of_class if re.search(r'\b' + re.escape(f) + r's?\b', k)]
    return features_of_class[max(held, key=len)] if held else None
def whole(names): return [feature_in(n) for n in names if feature_in(n)]
# the pieces of one partial trade the page lists with commas ("the rage powers gained at 4th, 8th, and 12th levels"),
# put back together as the page says it
def parts(names):
    pieces = [n for n in names if not feature_in(n) and re.search(r'\b\d+(st|nd|rd|th)\b|\brage powers?\b|\bbonus feats?\b|\btalents?\b|\blevels?\b', n)]
    return [', '.join(pieces)] if pieces else []
# the steps of a feature gained at several levels it trades, by the levels the class table names the feature at:
# "weapon training 1", "3", "4" (the page's "weapon training 1, 3, and 4") are its 1st, 3rd and 4th; "the bonus feat
# gained at 6th level" and "bonus feats gained at 1st", "10th levels" are those levels. the phrases left are whole trades
def table_levels(name):
    return [r['level'] for r in class_entry['data']['table'] if any(key(p) == key(name) for p in r['special'].split(','))]
partly = []
def steps(names):
    out, rest, current = {}, [], None
    for n in names:
        # "replaces some of the bonus feats": a part of it, whose levels its other features name
        if re.match(r'^(some|part|several|a few|any) of\b', n.strip()):
            current = None; partly.append(n); continue
        feature = feature_in(n) if re.search(r'[a-z]{3}', n) else None
        ordinal = re.findall(r'\b(\d+)(?:st|nd|rd|th)\b', n)
        number = re.match(r'^(?:and\s+)?(\d+)$', n.strip()) or (re.search(r'\s(\d+)$', n.strip()) if feature else None)
        if feature and ordinal: current = (feature, 'level')
        elif feature and number: current = (feature, 'step')
        elif not feature and current and (ordinal or number): pass
        else:
            current = None; rest.append(n); continue
        name, mode = current
        if mode == 'level': levels = [int(x) for x in ordinal]
        else:
            at = table_levels(name); i = int(number.group(1)) - 1
            levels = [at[i]] if 0 <= i < len(at) else []
        out.setdefault(name, []).extend(l for l in levels if l not in out.get(name, []))
    return out, rest
missing, features, cites, replaces, alters, partial, trades_at = [], [], set(), [], [], [], {}
for f in parsed['features']:
    a = author['features'].get(f['name'])
    if a is None: missing.append(f['name']); continue
    if a.get('todo'): missing.append(f"{f['name']}: {a['todo']}"); continue
    stepped, rest = steps(f['replaces'])
    for name, levels in a.get('tradesAt', stepped).items(): trades_at.setdefault(name, []).extend(l for l in levels if l not in trades_at.get(name, []))
    replaces += [r for r in a.get('replaces', whole(rest)) if r not in replaces]
    alters += [r for r in a.get('alters', whole(f['alters'])) if r not in alters]
    partial += [r for r in a.get('partial', parts(rest + f['alters']) + partly) if r not in partial]; partly.clear()
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
        features.append({'name': feature['name'], 'description': f['text'], 'adjustments': extras(stage, feature['name'], cites), 'gainedAt': stage['gainedAt'],
                         **({'shownIn': stage.get('shownIn', feature.get('shownIn'))} if stage.get('shownIn', feature.get('shownIn')) else {})})
# every step of a feature taken is the whole feature
for name, levels in list(trades_at.items()):
    if set(table_levels(name)) <= set(levels):
        del trades_at[name]
        if name not in replaces: replaces.append(name)
    else: trades_at[name] = sorted(levels)
trades_at = {n: l for n, l in trades_at.items() if n not in replaces}
# a feature it "replaces" with one of its own of the same name (an archivist's Lore Master) is rewritten: altered
own = {key(f['name']) for f in features}
alters += [r for r in replaces + list(trades_at) if key(r) in own and r not in alters]
replaces = [r for r in replaces if key(r) not in own]
trades_at = {n: l for n, l in trades_at.items() if key(n) not in own}
extra = sorted(set(author['features']) - {f['name'] for f in parsed['features']})
if missing or extra:
    print('not written:', *missing, *(f'authored but not on the page: {e}' for e in extra), sep='\n  '); sys.exit(1)
cls = arch['class']
archetype = {'name': parsed['name'], 'replaces': replaces, **({'alters': alters} if alters else {}), **({'partial': partial} if partial else {}), **({'tradesAt': trades_at} if trades_at else {}),
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
print(f"{parsed['name']} ({cls}): {len(features)} features, replaces {', '.join(replaces) or 'nothing'}{'; steps ' + json.dumps(trades_at) if trades_at else ''}{'; alters ' + ', '.join(alters) if alters else ''}{'; partly ' + '; '.join(partial) if partial else ''}")
