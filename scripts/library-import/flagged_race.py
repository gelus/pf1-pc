# prints the race items the library's checks flagged (.pages/race-problems.txt), with their text: alternate racial
# traits by name, favored class options by their authoring key
import json, re, sys
race = sys.argv[1]
parsed = json.load(open(f'parsed/{race}.parsed.json'))
counts = {}
for x in parsed['favored']: counts[x['class']] = counts.get(x['class'], 0) + 1
def tslug(n): return re.sub(r'[^a-z0-9]+', '-', n.lower().replace('’', '').replace("'", '')).strip('-')
by = {}
for l in open('.pages/race-problems.txt'):
    l = l.strip()
    m = re.match(r'racial-trait/' + race + r'/([^ :]+)(?: example \d+)?: (.*)$', l)
    if m:
        alt = next(a for a in parsed['alternate'] if tslug(a['name']) == m.group(1))
        by.setdefault(('alt', alt['name'], alt['text']), []).append(m.group(2)); continue
    m = re.match(r'race/' + race + r' favored class option (\d+) \(([^)]*)\): (.*)$', l)
    if m:
        f = parsed['favored'][int(m.group(1)) - 1]  # the checks count from 1
        key = f['class'] + (('|' + f['text'][:20]) if counts[f['class']] > 1 else '')
        by.setdefault(('fav', key, f['text']), []).append(m.group(3)); continue
    if l.startswith(f'race/{race} '): by.setdefault(('race', '', ''), []).append(l)
for (kind, name, text), ps in by.items():
    print(f'===== {kind} {name}')
    for p in ps: print('  !', re.sub(r'(Put them in its adjustments|give "uses_by_level"|give them as).*', '', p)[:220])
    if text: print('   ', text[:900].replace('\n', ' '))
