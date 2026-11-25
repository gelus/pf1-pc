# writes a class's library entry from its page as parse_class.py read it (text, table, sources: verbatim) and an
# authoring file (only judgment: each feature's adjustments, where it shows, what grows with which path, its uses, the
# class's proficiencies, spellcasting and examples). a feature on the page the authoring file lacks stops it, and so
# does one it has that the page doesn't
import sys, json, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from entry_parts import extras
parsed = json.load(open(sys.argv[1])); author = json.load(open(sys.argv[2])); out = sys.argv[3]
cls = author['class']
def key(name): return re.sub(r'[^a-z ]', '', name.lower()).strip()
def skill(name):
    n = name.strip().lower()
    return 'knowledge' if n == 'knowledge (all)' else n
series = {}
for s in parsed['special']:
    series.setdefault(s['key'], []).append((s['level'], s['value']))
first_level = {k: min(l for l, _ in v) for k, v in series.items()}
table = parsed['table']
bab20 = int(re.match(r'[+-]?\d+', table[-1]['bab']).group())
babProgression = {20: 'full', 15: 'threeQuarters', 10: 'half'}[bab20]
goodSaves = [s for s in ('fort', 'ref', 'will') if table[0][s].strip() == '+2']
missing, features, cites, parts = [], [], set(), {}
# the abilities a feature's text sets out as paragraphs of their own ("Inspire Courage (Su): ..." in bardic
# performance), lifted out as features of their own where the authoring file says so, each found in the table by name
page_features = []
for f in parsed['features']:
    splits = (author['features'].get(f['name']) or {}).get('splits', [])
    kept, lifted = [], []
    for para in f['text'].split('\n\n'):
        m = re.match(r'^(' + '|'.join(re.escape(n) for n in splits) + r')\s*\((Ex|Su|Sp)\):\s*(.*)$', para.strip(), re.S) if splits else None
        if m: lifted.append({'name': m.group(1), 'type': m.group(2), 'text': m.group(3)})
        else: kept.append(para)
    page_features += [{**f, 'text': '\n\n'.join(kept)}] + lifted
for f in page_features:
    a = author['features'].get(f['name'])
    if a is None: missing.append(f['name']); continue
    if a.get('skip'): continue
    # a block of another feature's rules the page sets apart (a paladin's mounts): its text goes on that feature
    if a.get('partOf'):
        parts.setdefault(a['partOf'], []).append(f"**{f['name']}**: {f['text']}")
        continue
    k = key(a.get('tableKey', f['name']))
    gained = a.get('gainedAt') or first_level.get(k) or first_level.get(k.rstrip('s')) or (1 if a.get('atFirst') else None)
    if not gained: missing.append(f"{f['name']}: the level it is gained at (the table names no \"{k}\")"); continue
    # the rules alone: the site's own notes ("Note from Nethys", "See the ... section") left out
    text = '\n\n'.join(p for p in f['text'].split('\n\n') if not re.match(r'^(Note from Nethys|See the \*\*)', p.strip()))
    feature = {'name': a.get('as', f['name']), 'description': text, 'adjustments': extras(a, a.get('as', f['name']), cites), 'gainedAt': gained}
    for x in ('shownIn', 'charges', 'descriptionOnly', 'active'):
        if x in a: feature[x] = a[x]
    if 'grows' in a:
        grows = {}
        for path, given in a['grows'].items():
            # from another column of the table ("column:AC Bonus"), its value at each level it changes
            if isinstance(given, str) and given.startswith('column:'):
                col = given[len('column:'):]
                pts = [(r['level'], int(m.group())) for r in table for m in [re.search(r'[+-]?\d+', r['columns'].get(col, ''))] if m]
                grows[path] = {str(l): v for i, (l, v) in enumerate(pts) if i == 0 or v != pts[i - 1][1]}
                continue
            # how many times the table has named it by each level (a fighter's bonus feats)
            if given == 'count':
                levels = sorted(l for l, _ in series.get(k, []))
                grows[path] = {str(l): i + 1 for i, l in enumerate(levels)}
                continue
            if given == 'table':
                points = [(l, v) for l, v in series.get(k, []) if v is not None]
                if not points: missing.append(f"{f['name']}: grows {path} from the table, which gives it no numbers"); continue
                grows[path] = {str(l): v for l, v in points}
            else: grows[path] = given
        feature['grows'] = grows
    # an attack's dice by level from a column of the table ("Unarmed Damage"): each level the dice change at
    if isinstance(a.get('damageByLevel'), str) and a['damageByLevel'].startswith('column:'):
        col = a['damageByLevel'][len('column:'):]
        cells = [(r['level'], r['columns'].get(col, '').strip()) for r in table]
        dice = {str(l): d for i, (l, d) in enumerate(cells) if d and (i == 0 or d != cells[i - 1][1])}
        for attack in feature['adjustments'].get('melee', []): attack['damageByLevel'] = dice
    if 'uses' in a:
        u = a['uses']
        if u.get('table'):
            at = {str(l): v for l, v in series.get(k, []) if v is not None}
        elif 'start' in u:
            at = {str(l): u['start'] + u.get('step', 0) * (l - u.get('from', 1)) // u.get('every', 1) for l in range(u.get('from', 1), 21)}
        else: at = u['at']
        feature['uses_by_level'] = {'at': at, **{x: u[x] for x in ('plus', 'per', 'label') if x in u}}
    features.append(feature)
for feature in features:
    for part in parts.pop(feature['name'], []): feature['description'] += '\n\n' + part
if parts: missing.append(f"part of a feature that is not there: {', '.join(parts)}")
extra = sorted(set(author['features']) - {f['name'] for f in page_features})
if missing or extra:
    print('not written:', *missing, *(f'authored but not on the page: {e}' for e in extra), sep='\n  '); sys.exit(1)
# a row of the class table, with a caster's spells per day and spells known by spell level ("1st" is 1, "—" none)
def counts(cells):
    out = {}
    for name, value in cells.items():
        lvl = re.match(r'^(\d+)(st|nd|rd|th)?$', name.strip()); n = re.match(r'\d+', value.strip())
        if lvl and n: out[str(int(lvl.group(1)))] = int(n.group())
    return out
known_by_level = {r['level']: counts({k: v for k, v in r.items() if k != 'level'}) for r in parsed.get('spellsKnown', [])}
def row_of(r):
    row = {k: r[k] for k in ('level', 'bab', 'fort', 'ref', 'will', 'special')}
    if cls.get('spellcasting'):
        if counts(r.get('columns', {})): row['spells'] = counts(r['columns'])
        if known_by_level.get(r['level']): row['known'] = known_by_level[r['level']]
    return row
# the table in the text with every column the page gives
extra = list(table[0].get('columns', {}))
md_table = ('| Level | Base Attack Bonus | Fort | Ref | Will | Special |' + ''.join(f' {c} |' for c in extra) + '\n|' + '---|' * (6 + len(extra)) + '\n'
  + '\n'.join(f"| {r['level']} | {r['bab']} | {r['fort']} | {r['ref']} | {r['will']} | {r['special']} |"
              + ''.join(f" {r['columns'].get(c, '')} |" for c in extra) for r in table))
text = (f"## {parsed['name']}\n\n**Alignment**: {parsed['alignment']}.\n\n**Hit Die**: d{parsed['hitDie']}.\n\n"
  f"**Starting Wealth**: {parsed['wealth']}\n\n**Class Skills**: {', '.join(parsed['classSkills'])}.\n\n"
  f"**Skill Ranks per Level**: {parsed['skillRanks']} + Int modifier.\n\n{md_table}\n\n"
  + '\n\n'.join(f"**{f['name']}{' (' + f['type'] + ')' if f['type'] else ''}**: " + '\n\n'.join(p for p in f['text'].split('\n\n') if not re.match(r'^(Note from Nethys|See the \*\*)', p.strip())) for f in parsed['features']) + '\n')
preset = {'name': parsed['name'], 'alignment': (parsed['alignment'] or '').lower(), 'hitDice': parsed['hitDie'],
  'babProgression': babProgression, 'goodSaves': goodSaves, 'skillRanks': parsed['skillRanks'],
  'startingWealth': parsed['averageWealth'], 'classSkills': [skill(s) for s in parsed['classSkills']],
  'proficiencies': cls['proficiencies'], **({'spellcasting': cls['spellcasting']} if cls.get('spellcasting') else {})}
entry = {'id': f"class/{cls['slug']}", 'kind': 'class', 'name': parsed['name'], **({'aliases': cls['aliases']} if cls.get('aliases') else {}),
  'source': {**parsed['source'], 'url': cls['url']}, **({'cites': sorted(cites - {parsed['source']['book']})} if cites - {parsed['source']['book']} else {}),
  'schemaVersion': 1, 'text': text,
  'facts': {'hit die': f"d{parsed['hitDie']}", 'skill ranks': str(parsed['skillRanks']), 'class skills': ', '.join(parsed['classSkills']),
            'alignment': parsed['alignment'] or 'any'},
  **({'choices': cls['choices']} if cls.get('choices') else {}), 'examples': cls['examples'],
  'data': {'preset': preset, 'table': [row_of(r) for r in table], 'features': features}}
os.makedirs(f'{out}/class', exist_ok=True)
with open(f"{out}/class/{cls['slug']}.json", 'w') as fh: fh.write(json.dumps(entry, indent=1, ensure_ascii=False) + '\n')
print(f"{parsed['name']}: {len(features)} class features, table of {len(table)} levels")
