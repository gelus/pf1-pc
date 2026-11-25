# prints the flagged traits or feats (.pages/<kind>-problems.txt) with their text and what is authored for them
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
kind = sys.argv[1]; only = sys.argv[2] if len(sys.argv) > 2 else None
items = {}
for p in glob.glob(os.path.join(HERE, 'parsed', kind, '*.json')):
    it = json.load(open(p)); items[re.sub(r'[^a-z0-9]+', '-', (it.get('slug') or it['name']).lower().replace("'", '').replace('’', '')).strip('-')] = it
authored = {}
for p in glob.glob(os.path.join(HERE, 'author', kind, '*.json')):
    for k, v in json.load(open(p)).items(): authored[re.sub(r'[^a-z0-9]+', '-', k.lower().replace("'", '').replace('’', '')).strip('-')] = (os.path.basename(p)[:-5], k, v)
by = {}
for line in open(os.path.join(HERE, '.pages', f'{kind}-problems.txt')):
    m = re.match(r'\s*' + kind + r'/([^ :]+)(?: example \d+)?: (.*)$', line.strip())
    if m: by.setdefault(m.group(1), []).append(m.group(2))
for slug, ps in sorted(by.items()):
    it = items.get(slug); a = authored.get(slug)
    if only and (not a or a[0] != only): continue
    print(f'===== {a[1] if a else slug}')
    for p in ps: print('  !', re.sub(r'(Put them in its adjustments|give "uses_by_level"|give them as).*', '', p)[:230])
    if a and (a[2].get('adjustments') or a[2].get('choices')): print('   authored:', json.dumps({k: a[2][k] for k in ('adjustments', 'choices') if k in a[2]}, ensure_ascii=False)[:500])
    if it: print('   ', (it.get('text') if kind == 'trait' else it['benefit'] + ' ' + it['special'])[:800].replace('\n', ' '))
