# the Archives of Nethys trait lists (Traits.aspx?Type=<category>, cached in .pages/traits) read into each trait,
# verbatim: its name, category (Combat, Faith, Magic, Social, Campaign, Race, Region, Religion, Equipment, Mount,
# Family, Exemplar, Faction, Cosmic, Drawback), sources, requirements ("Dwarf", "Andoran", "Iomedae") and rules text.
# written to parsed/trait/<slug>.json; a name two categories share keeps the category in its slug
import glob, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from book_code import code_of
OUT = os.path.join(HERE, 'parsed', 'trait'); os.makedirs(OUT, exist_ok=True)
def slug(name): return re.sub(r'[^a-z0-9]+', '-', name.lower().replace('’', '').replace("'", '')).strip('-')
def sources(line):
    return [{'book': code_of(m.group(1)), 'name': m.group(1).strip(), 'page': m.group(2)}
            for m in re.finditer(r'\s*(?:PRPG |Pathfinder RPG )?(.+?) pg\. ([^,\s]+),?', line)]
traits = []
for path in sorted(glob.glob(os.path.join(HERE, '.pages', 'traits', '*.html'))):
    text = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'html2text.py'), path], capture_output=True, text=True).stdout
    m = re.search(r'^# (.+?) Traits\s*$', text, re.M) or re.search(r'^# (Drawbacks)\s*$', text, re.M)
    category = re.sub(r'^Basic \((\w+)\)$', r'\1', m.group(1)) if m else os.path.basename(path)
    category = 'Drawback' if category.startswith('Drawback') else category
    for block in re.split(r'^## (?=.+\[Link\]\s*$)', text[m.end():] if m else text, flags=re.M)[1:]:
        head, _, body = block.partition('\n')
        name = head.replace('[Link]', '').strip()
        src = re.search(r'^\*\*Source\*\*\s*([^\n]+)', body, re.M)
        req = re.search(r'^\*\*Requirement\(s\)\*\*\s*([^\n]+)', body, re.M)
        rules = re.sub(r'^\*\*(Source|Requirement\(s\))\*\*[^\n]*\n', '', body, flags=re.M)
        rules = re.split(r'^\s*\|\s*$|^# ', rules, flags=re.M)[0]
        rules = re.split(r'\s*Site Owner:', rules)[0]
        # the Archives of Nethys marks the book a rule is from on its name ("emotionUM", "stealAPG"): the rule's own text has no mark
        rules = re.sub(r'(?<=[a-z])(?:APG|ACG|ARG|UC|UE|UI|UM|UW|OA|HA|MA|PA|AG|ISG|ISWG|ISR|B[1-6]|TG|MC|ACO|PPC|CRB)\b', '', rules)
        # the page's lines wrapped inside a sentence are joined, its paragraphs kept
        rules = '\n\n'.join(re.sub(r'\s*\n\s*', ' ', para).strip() for para in re.split(r'\n\s*\n', rules) if para.strip())
        if not src or not rules: continue
        traits.append({'name': name, 'category': category, 'sources': sources(src.group(1)),
                       'requirements': req.group(1).strip() if req else '', 'text': rules})
names = {}
for t in traits: names.setdefault(slug(t['name']), set()).add(t['category'])
for t in traits:
    s = slug(t['name']) + (f"-{slug(t['category'])}" if len(names[slug(t['name'])]) > 1 else '')
    t['slug'] = s
    json.dump(t, open(os.path.join(OUT, s + '.json'), 'w'), indent=1, ensure_ascii=False)
print(len(traits), 'traits parsed', {c: sum(1 for t in traits if t['category'] == c) for c in sorted({t['category'] for t in traits})})
