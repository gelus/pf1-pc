# an Archives of Nethys race page (as html2text.py gives it) read into its parts, verbatim: the standard racial
# traits, the alternate racial traits (with their sources and what they replace) and the favored class options
import sys, re, json
lines = open(sys.argv[1], encoding='utf8').read().splitlines()
books = json.load(open(sys.argv[2]))
def code(source):
    name = re.sub(r'^PRPG ', '', source.strip())
    c = re.sub(r'[^a-z0-9]+', '-', name.lower().replace("'", '')).strip('-')
    return 'unchained' if c == 'pathfinder-unchained' else c
def sources(text):  # "Advanced Race Guide pg. 53, Advanced Player's Guide pg. 19"
    out = []
    for part in re.split(r',\s*(?=[A-Z])', text):
        m = re.match(r'\s*(.+?)\s+pg\.\s*(\S+)', part)
        if m: out.append({'book': code(m.group(1)), 'name': m.group(1).strip(), 'page': m.group(2)})
    return out
def pick(srcs):  # the first source the OGL notice covers
    return next((s for s in srcs if s['book'] in books), None)
race = {'standard': [], 'alternate': [], 'favored': [], 'skipped': []}
section = None; replaces = None; current = None
for raw in lines:
    line = raw.strip()
    if re.match(r'^# .*Racial Traits$', line) and 'Alternate' not in line: section = 'standard'; continue
    if re.match(r'^# .*Alternate Racial Traits?$', line): section = 'alternate'; continue
    if re.match(r'^# .*Favored Class Options$', line): section = 'favored'; continue
    if line.startswith('# '): section = None; continue
    if section == 'standard':
        m = re.match(r'^\*\*(.+?)\*\*:\s*(.*)$', line)
        if m: race['standard'].append({'name': m.group(1).strip(), 'text': m.group(2).strip()})
    elif section == 'alternate':
        m = re.match(r'^## Replaces (.+)$', line)
        if m: replaces = [r.strip() for r in m.group(1).split(',')]; continue
        m = re.match(r'^\*\*\s*(.+?)\*\*$', line)
        if m and not line.startswith('**Source'):
            current = {'name': m.group(1).strip(), 'replaces': replaces, 'sources': [], 'text': ''}
            race['alternate'].append(current); continue
        m = re.match(r'^\*\*Source\*\*\s*(.+)$', line)
        if m and current: current['sources'] = sources(m.group(1)); continue
        if current and line: current['text'] = (current['text'] + '\n\n' + line).strip()
    elif section == 'favored':
        m = re.match(r'^\*\*\s*(.+?)\*\*\s*\((.+?)\):\s*(.*)$', line)
        if m: race['favored'].append({'class': m.group(1).strip(), 'sources': sources(m.group(2)), 'text': m.group(3).strip()})
kept = {'standard': race['standard'], 'alternate': [], 'favored': [], 'skipped': []}
for kind in ('alternate', 'favored'):
    for item in race[kind]:
        source = pick(item['sources'])
        if source: kept[kind].append({**item, 'source': source})
        else: kept['skipped'].append(f"{kind}: {item.get('name') or item.get('class')} ({', '.join(s['name'] for s in item['sources'])})")
print(json.dumps(kept, indent=1, ensure_ascii=False))
