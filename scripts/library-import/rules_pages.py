# reads (and caches) the Archives of Nethys pages of spells and feats an entry refers to, verbatim: what a race's
# spell-like ability casts, the feat a racial trait grants
import json, os, re, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
PAGES = os.path.join(HERE, '.pages')  # the pages read, cached (not kept in git)
sys.path.insert(0, HERE)
def fetch(kind, name):
    folder = os.path.join(PAGES, kind); os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, re.sub(r'[^A-Za-z0-9]+', '_', name) + '.txt')
    if not os.path.exists(path):
        url = {'spells': 'https://aonprd.com/SpellDisplay.aspx?ItemName=', 'feats': 'https://aonprd.com/FeatDisplay.aspx?ItemName='}[kind] + name.replace(' ', '%20')
        html = subprocess.run(['curl', '-sL', '-A', 'Mozilla/5.0', url], capture_output=True, text=True).stdout
        tmp = path + '.html'; open(tmp, 'w').write(html)
        text = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'html2text.py'), tmp], capture_output=True, text=True).stdout
        open(path, 'w').write(text); time.sleep(0.5)
    text = open(path).read()
    m = re.search(r'^# ' + re.escape(name) + r'(\s*\([^)]*\))?\s*$(.*?)(^## Mythic|Site Owner:)', text, re.M | re.S | re.I)
    if not m: raise SystemExit(f'{kind} {name}: not found on its page')
    return m.group(2)
def source_of(block):
    m = re.search(r'\*\*Source\*\*\s*(?:PRPG )?(.+?) pg\. (\S+)', block)
    code = re.sub(r'[^a-z0-9]+', '-', re.sub(r'^The ', '', m.group(1)).lower().replace("'", '')).strip('-')
    return {'book': 'unchained' if code == 'pathfinder-unchained' else code, 'page': m.group(2)}
def field(block, name):
    m = re.search(r'\*\*' + name + r'\*\*\s*([^;\n]*)', block)
    return m.group(1).strip() if m else ''
def spell(name):
    b = fetch('spells', name)
    school = field(b, 'School')
    descriptors = re.findall(r'\[([^\]]+)\]', school)
    sub = re.search(r'\(([^)]*)\)', school)
    levels = dict((k.strip(), int(v)) for k, v in re.findall(r'([a-z/ ]+?) (\d)', field(b, 'Level')))
    desc = re.search(r'### Description\s*(.*)$', b, re.S).group(1).strip()
    return {'name': name, 'source': source_of(b), 'school': re.sub(r'\s*[\(\[].*$', '', school).strip(), 'subschool': sub.group(1) if sub else None,
            'descriptors': [d.strip() for x in descriptors for d in x.split(',')], 'levels': levels,
            'castingTime': field(b, 'Casting Time'), 'components': field(b, 'Components'), 'range': field(b, 'Range'),
            'target': field(b, 'Target') or field(b, 'Area') or field(b, 'Effect') or field(b, 'Target or Area'),
            'duration': field(b, 'Duration'), 'savingThrow': field(b, 'Saving Throw'),
            'spellResistance': field(b, 'Spell Resistance').lower().startswith('yes'), 'description': re.sub(r'\n\s*\n', '\n\n', desc)}
def feat(name):
    b = fetch('feats', name)
    body = re.sub(r'^\s*\*\*Source\*\*[^\n]*\n', '', b.strip()).strip()
    return {'name': name, 'source': source_of(b), 'text': re.sub(r'\n\s*\n', '\n\n', body),
            'prerequisites': field(b, 'Prerequisites').rstrip('.')}
if __name__ == '__main__':
    print(json.dumps({'spells': spell, 'feats': feat}[sys.argv[1]](sys.argv[2]), indent=1))
