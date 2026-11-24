# an Archives of Nethys class page (as html2text.py gives it) read into its parts, verbatim: its source, alignment,
# hit die, starting wealth, class skills and skill ranks, its table (base attack, saves, special, and any spells per
# day columns), and each class feature's text in the order the page gives them, with the level the table first names
# it at and the numbers the table's special column gives it by level ("Trap sense +2", "Damage reduction 3/-")
import sys, re, json
lines = open(sys.argv[1], encoding='utf8').read().splitlines()
text = '\n'.join(lines)
def grab(pattern, flags=0):
    m = re.search(pattern, text, flags); return m.group(1).strip() if m else None
out = {'name': grab(r'^# (.+)$', re.M)}
m = re.search(r'\*\*Source\*\*\s*(?:PRPG )?(.+?) pg\. (\S+)', text)
out['source'] = {'book': re.sub(r'[^a-z0-9]+', '-', m.group(1).lower().replace("'", '')).strip('-'), 'page': m.group(2)}
out['alignment'] = grab(r'^\*\*Alignment\*\*:\s*(.+?)\.?$', re.M)
out['hitDie'] = int(grab(r'^\*\*Hit Die\*\*:\s*d(\d+)', re.M))
out['wealth'] = grab(r'^\*\*Starting Wealth\*\*:\s*(.+)$', re.M)
avg = re.search(r'average (\d[\d,]*) gp', out['wealth'] or '')
out['averageWealth'] = int(avg.group(1).replace(',', '')) if avg else None
skills = grab(r"class skills are (.+?)\.\s*$", re.M)
out['classSkills'] = [re.sub(r'\s*\((Str|Dex|Con|Int|Wis|Cha)\)$', '', s.strip()).strip() for s in re.split(r',\s*(?:and\s+)?|\s+and\s+', skills)] if skills else []
out['skillRanks'] = int(grab(r'^\*\*Skill (?:Points|Ranks) (?:at each|per) Level\*\*:\s*(\d+)', re.M))
# the tables: the class table (the first after "## Class Features", with every column it has: the monk's AC bonus,
# a caster's spells per day) and a spontaneous caster's "## Spells Known"
def tables_after(heading):
    at = next((i for i, l in enumerate(lines) if l.strip() == heading), None)
    if at is None: return []
    rows, header = [], None
    for line in lines[at + 1:]:
        s = line.strip()
        if s.startswith('| **Level**'): header = [c.strip().strip('*').strip() for c in s.strip('|').split('|')]; continue
        if header and re.match(r'^\|\s*\d+(st|nd|rd|th)\s*\|', s):
            cells = [c.strip() for c in s.strip('|').split('|')]
            rows.append(dict(zip(header, cells)))
        elif rows and not s.startswith('|'): break
    return rows
table = []
for row in tables_after('## Class Features'):
    table.append({'level': int(re.match(r'\d+', row['Level']).group()), 'bab': row.get('Base Attack Bonus', ''),
      'fort': row.get('Fort Save', ''), 'ref': row.get('Ref Save', ''), 'will': row.get('Will Save', ''),
      'special': row.get('Special', ''),
      'columns': {k: v for k, v in row.items() if k not in ('Level', 'Base Attack Bonus', 'Fort Save', 'Ref Save', 'Will Save', 'Special')}})
out['spellsKnown'] = [{'level': int(re.match(r'\d+', r['Level']).group()), **{k: v for k, v in r.items() if k != 'Level'}} for r in tables_after('## Spells Known')]
out['table'] = table
# the class features: from "## Class Features" to the next "## " section, each "**Name (Ex)**: text" with the
# paragraphs after it until the next one
start = next(i for i, l in enumerate(lines) if l.strip() == '## Class Features')
features = []; current = None
for line in lines[start + 1:]:
    s = line.strip()
    if s == '## Spells Known': continue
    if s.startswith('## '): break
    if not s or s.startswith('|'): continue
    m = re.match(r'^\*\*(.+?)\*\*:?\s*(.*)$', s)
    if m and m.group(2):
        name = m.group(1).strip().rstrip(':')
        kind = re.search(r'\((Ex|Su|Sp)\)$', name)
        current = {'name': re.sub(r'\s*\((Ex|Su|Sp)\)$', '', name).strip(), 'type': kind.group(1) if kind else None, 'text': m.group(2).strip()}
        features.append(current)
    elif current:
        current['text'] += '\n\n' + s
out['features'] = features
# where the table first names each feature, and the numbers it gives by level
def key(name): return re.sub(r'[^a-z ]', '', name.lower()).strip()
special = []
for row in table:
    for part in re.split(r',\s*', row['special']):
        part = part.strip()
        if not part or part in ('—', '-'): continue
        num = re.search(r'([+-]?\d+)(?:/[-—–]|d\d+)?', part)
        special.append((row['level'], key(re.sub(r'[+-]?\d+(/[-—–\w]*)?(d\d+)?', '', part)), int(num.group(1)) if num else None, part))
out['special'] = [{'level': l, 'key': k, 'value': v, 'said': p} for l, k, v, p in special]
print(json.dumps(out, indent=1, ensure_ascii=False))
