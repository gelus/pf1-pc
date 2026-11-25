# the Archives of Nethys page of each feat (cached by fetch_feats.py) read into its parts, verbatim: its name, types
# ("Combat, Teamwork"), sources, prerequisites and rules text (benefit, normal, special), without the mythic version
# the page goes on to. written to parsed/feat/<slug>.json, one a feat; a page that isn't a feat's is listed and left
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from book_code import code_of
OUT = os.path.join(HERE, 'parsed', 'feat'); os.makedirs(OUT, exist_ok=True)
def slug(name): return re.sub(r'[^a-z0-9]+', '-', name.lower().replace('’', '').replace("'", '')).strip('-')
def sources(line):
    return [{'book': code_of(m.group(1)), 'name': m.group(1).strip(), 'page': m.group(2)}
            for m in re.finditer(r'\s*(?:PRPG |Pathfinder RPG )?(.+?) pg\. ([^,\s]+),?', line)]
def field(body, name):
    m = re.search(r'^\*\*' + name + r'\*\*\s*:?\s*(.*?)(?=^\*\*[A-Z][\w ]*\*\*\s*:|\Z)', body, re.M | re.S)
    return re.sub(r'\n\s*\n+', '\n\n', m.group(1)).strip() if m else ''
bad = []; n = 0
for path in sorted(glob.glob(os.path.join(HERE, '.pages', 'feats', '*.txt'))):
    text = open(path, encoding='utf8').read()
    # the feat ends at the page's next heading: its mythic version, or a Combat Trick of Pathfinder Unchained's Combat
    # Stamina, rules of their own
    m = re.search(r'^# (.+?)\s*$\n(.*?)(?=^## |^# |Site Owner:|\Z)', text, re.M | re.S)
    src = m and re.search(r'^\*\*Source\*\*\s*([^\n]+)', m.group(2), re.M)
    if not m or not src: bad.append(os.path.basename(path)); continue
    title, body = m.group(1).strip(), m.group(2)
    t = re.match(r'^(.+?)\s*\(([^)]*)\)\s*$', title)
    name, types = (t.group(1).strip(), [x.strip() for x in t.group(2).split(',') if x.strip()]) if t else (title, [])
    body = re.sub(r'^\*\*Source\*\*[^\n]*\n', '', body.strip()).strip()
    # the Archives of Nethys marks the book a rule is from on its name ("emotionUM", "stealAPG"): the rule's own text has no mark
    body = re.sub(r'(?<=[a-z])(?:APG|ACG|ARG|UC|UE|UI|UM|UW|OA|HA|MA|PA|AG|ISG|ISWG|ISR|B[1-6]|TG|MC|ACO|PPC|CRB)\b', '', body)
    flavor = body.split('\n\n')[0].strip() if not body.startswith('**') else ''
    feat = {'name': name, 'types': types, 'sources': sources(src.group(1)),
            'prerequisites': field(body, 'Prerequisites?').rstrip('.'), 'benefit': field(body, 'Benefits?'),
            'normal': field(body, 'Normal'), 'special': field(body, 'Special'), 'flavor': flavor,
            'text': re.sub(r'\n\s*\n+', '\n\n', body).strip()}
    json.dump(feat, open(os.path.join(OUT, slug(name) + '.json'), 'w'), indent=1, ensure_ascii=False); n += 1
print(n, 'feats parsed;', len(bad), 'pages without a feat:', ', '.join(bad[:20]))
