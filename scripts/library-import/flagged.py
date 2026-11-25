# prints the features the library's checks flagged, with their text, for the archetypes named (or all)
import json, re, sys
cls = sys.argv[1]; only = set(sys.argv[2:])
lines = [l.strip() for l in open(f'.pages/{cls}-problems.txt') if l.strip()]
by = {}
for l in lines:
    m = re.match(r'archetype/' + cls + r'/([^ :]+)(?: example \d+)?: (.*)$', l)
    if m: by.setdefault(m.group(1), []).append(m.group(2))
for slug, problems in sorted(by.items()):
    if only and slug not in only: continue
    a = json.load(open(f'parsed/archetype/{cls}.{slug}.json'))
    print(f'===== {slug}')
    for p in problems:
        name = p.split(':')[0].replace(' shows on the sheet but adjusts nothing, and its text gives numbers', '').strip()
        f = next((f for f in a['features'] if f['name'] == name), None)
        short = re.sub(r'(Put them in its adjustments|give "uses_by_level"|give them as).*', '', p)[:200]
        print(f'  ! {short}')
        if f: print(f"    [{f['name']} @{f['level']}] {f['text'][:700]}".replace('\n', ' '))
