# a quick check of a book's spell entries (public/library/spell, those of the book), the library spec's main spell
# checks in short, so a book's spells can be worked through without running the spec: the statistics every spell has,
# its effect's situation names, and every signed number its text gives held by its effect or named in its note.
# the spec (npm test, library.spec.ts) stays the authority; this only finds most of what it would
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
book = sys.argv[1]
SIGNED = re.compile(r'(?<![\w)])(?<!DC )(?<!level )(?<!modifier )[+–-]\s?\d+(?![\d%]|d\d)(?!\s*(feet|ft\b|-?foot|gp|minutes?|hours?|rounds?|days?|/|\s*per\b))|\b\d+\s+(temporary\s+)?hit points\b')
SCHOOLS = {'abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation', 'universal'}
def bad_situation(sit):
    return (re.search(r'[+–]\s?\d|(?<![a-z\d])-\d|\b(bonus(es)?|penalt(y|ies)) (on|to)\b', sit, re.I)
        or re.search(r'\b(\w+) \1\b', sit, re.I)
        or re.search(r"^(and|or|but|which|who|they|as long as|are|is|you|if|when|whenever|while|to|made|can|can['’]t|do|does|unless)\b", sit, re.I)
        or re.search(r'\b(of|to|with|from|by|out|in|on|for|at|the|a|an|and|or|while|that|than|as|your|its)$', sit, re.I)
        or sit.count('(') != sit.count(')') or len(sit.split()) > 10 or re.search(r'\bor\b|,', sit)
        or re.search(r'fighting defensively|total defense|combat expertise|power attack|deadly aim|two-weapon fighting', sit, re.I))
def paths(adj):
    for k, v in (adj or {}).items():
        if k.startswith('{choice') and isinstance(v, dict):
            for o in v.values():
                if isinstance(o, dict): yield from paths(o)
        else: yield k
def values(formula):
    out = []
    for n in range(1, 21):
        e = re.sub(r'\{[^}]+\}', str(n), formula)
        if re.fullmatch(r'[\d\s+\-*/().,a-z]*', e) and not re.sub(r'\b(floor|ceil|round|abs|min|max)\b', '', e).strip(' 0123456789+-*/().,'):
            try: out.append(abs(round(eval(e, {'__builtins__': {}}, {'floor': lambda x: int(x // 1), 'ceil': lambda x: -int(-x // 1), 'round': round, 'abs': abs, 'min': min, 'max': max}))))
            except Exception: pass
    return out
problems = []
for f in sorted(glob.glob(os.path.join(HERE, '..', '..', 'public', 'library', 'spell', '*.json'))):
    e = json.load(open(f))
    if e['source']['book'] != book: continue
    sp, levels = e['data']['spell'], e['data']['levels']
    where = e['id']
    if sp.get('school') not in SCHOOLS: problems.append(f'{where}: its school')
    if not levels: problems.append(f'{where}: its levels')
    if not sp.get('components'): problems.append(f'{where}: its components')
    for k in ('castingTime', 'range', 'duration', 'savingThrow'):
        if not str(sp.get(k, '')).strip(): problems.append(f'{where}: its {k}')
    adj = sp.get('adjustments') or {}
    for p in paths(adj):
        m = re.search(r'\[([^\]]*)\]$', p)
        if m and not m.group(1).startswith('{choice') and bad_situation(m.group(1)): problems.append(f'{where}: the variant "{m.group(1)}" is no situation named alone, in a few words')
    note = sp.get('descriptionOnly') or ''
    if note.startswith('no path'): continue
    own = ' '.join(s for s in re.split(r'(?<=[.!?])\s+', sp['description']) if not re.search(r'\b(replaces?|alters?)\b', s, re.I))
    own = re.sub(r'\d+%', '', own)
    written = json.dumps(adj)
    held = [int(x) for x in re.findall(r'\d+', written)]
    sums = set(held) | {a + b for i, a in enumerate(held) for b in held[i + 1:]} | {int(x) for x in re.findall(r'\d+', note)}
    for formula in re.findall(r'"([^"]*\{[^"]*)"', written): sums |= set(values(formula))
    miss = [m.group(0) for m in SIGNED.finditer(own) if int(re.search(r'\d+', m.group(0)).group()) != 0 and int(re.search(r'\d+', m.group(0)).group()) not in sums]
    if miss: problems.append(f'{where}: its text gives {", ".join(dict.fromkeys(miss))}, which its effect does not hold: write each as a path, or name it in descriptionOnly ("no path:" when it is no effect on the creature it affects)')
print('\n'.join(problems)); print(f'{book}: {len(problems)} problems')
