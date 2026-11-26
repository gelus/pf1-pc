# the Archives of Nethys page of each spell (cached by fetch_spells.py) read into its parts, verbatim: its name,
# sources, school (subschool, descriptors), level in each class, casting time, components, range, area or targets,
# duration, saving throw, spell resistance and text, without the mythic version the page goes on to. written to
# parsed/spell/<slug>.json, one a spell; a page that isn't a spell's is listed and left
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from book_code import code_of
OUT = os.path.join(HERE, 'parsed', 'spell'); os.makedirs(OUT, exist_ok=True)
def slug(name): return re.sub(r'[^a-z0-9]+', '-', name.lower().replace('’', '').replace("'", '')).strip('-')
def sources(line):
    return [{'book': code_of(m.group(1)), 'name': m.group(1).strip(), 'page': m.group(2)}
            for m in re.finditer(r'\s*(?:PRPG |Pathfinder RPG )?(.+?) pg\. ([^,\s]+),?', line)]
def line(body, name):
    # (a line ends at the next statistic, "; **Spell Resistance**", or its end: "V, S; see text" and a component's
    # "(...; plus one silver pin per caster level)" are its own)
    m = re.search(r'\*\*' + name + r'\*\*\s*(.*?)(?=;\s*\*\*|\n|$)', body)
    return m.group(1).strip() if m else ''
def levels(text):
    out = {}
    # (a level line may end on what it is for: "witch 4 (half-orc)", a race's spell)
    for part in re.split(r',\s*', re.sub(r'\s*\([^)]*\)\s*$', '', text)):
        m = re.match(r'^\s*([A-Za-z/ ()\-]+?)\s+(\d)\s*$', part)
        if not m: continue
        for cls in m.group(1).split('/'):
            out[cls.strip().lower()] = int(m.group(2))
    return out
def components(text):
    # what each component is made of ("M (a pinch of sulfur)") is its text's, the components are their letters
    bare = re.sub(r';.*$', '', re.sub(r'\([^)]*\)', '', text))
    return [c.strip() for c in re.split(r',\s*|\s+or\s+', bare) if re.match(r'^(V|S|M|F|DF|F/DF|M/DF|M/F)$', c.strip())]
bad = []; n = 0
for path in sorted(glob.glob(os.path.join(HERE, '.pages', 'spells', '*.txt'))):
    text = open(path, encoding='utf8').read()
    m = re.search(r'^# (.+?)\s*$\n(.*?)(?=^## |^# |Site Owner:|\Z)', text, re.M | re.S)
    src = m and re.search(r'^\*\*Source\*\*\s*([^\n]+)', m.group(2), re.M)
    if not m or not src: bad.append(os.path.basename(path)); continue
    name, body = m.group(1).strip(), m.group(2)
    school_line = line(body, 'School')
    sm = re.match(r'^([a-z]+)\s*(?:\(([^)]*)\))?\s*(?:\[([^\]]*)\])?', school_line)
    desc = re.search(r'^### Description\s*\n(.*)', body, re.M | re.S)
    description = re.sub(r'\n\s*\n+', '\n\n', desc.group(1)).strip() if desc else ''
    # the Archives of Nethys marks the book a rule is from on its name ("emotionUM"): the rule's own text has no mark
    description = re.sub(r'(?<=[a-z])(?:APG|ACG|ARG|UC|UE|UI|UM|UW|OA|HA|MA|PA|AG|ISG|ISWG|ISR|B[1-6]|TG|MC|ACO|PPC|CRB)\b', '', description)
    target = ' '.join(f'{k}: {line(body, k)}' for k in ('Area', 'Effect', 'Targets?') if line(body, k)).replace('Targets?:', 'Target:')
    for k in ('Target', 'Targets'):
        if line(body, k) and not target: target = line(body, k)
    sr = line(body, 'Spell Resistance')
    spell = {'name': name, 'sources': sources(src.group(1)),
             'school': sm.group(1) if sm else '', 'subSchool': (sm.group(2) or '').strip() if sm else '',
             'descriptors': [d.strip() for d in (sm.group(3) or '').split(',') if d.strip()] if sm else [],
             'levels': levels(line(body, 'Level')), 'levelText': line(body, 'Level'),
             'castingTime': line(body, 'Casting Time'), 'componentsText': line(body, 'Components'),
             'components': components(line(body, 'Components')),
             'range': line(body, 'Range'), 'target': target, 'duration': line(body, 'Duration'),
             'savingThrow': line(body, 'Saving Throw'), 'spellResistanceText': sr, 'spellResistance': sr.lower().startswith('yes'),
             'description': description}
    json.dump(spell, open(os.path.join(OUT, slug(name) + '.json'), 'w'), indent=1, ensure_ascii=False); n += 1
print(n, 'spells parsed;', len(bad), 'pages without a spell:', ', '.join(bad[:20]))
