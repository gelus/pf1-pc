# an Archives of Nethys archetype page (as html2text.py gives it) read into its parts, verbatim: its name, source,
# introduction, and each feature with the level its text gains it at and the class features its text says it
# replaces or alters ("This ability replaces uncanny dodge, improved uncanny dodge, and damage reduction.")
import sys, re, json
text = open(sys.argv[1], encoding='utf8').read()
m = re.search(r'^# (.+?)\n(.*?)(?:Site Owner:|\Z)', text, re.M | re.S)
name, body = m.group(1).strip(), m.group(2)
# every source the page gives ("Inner Sea World Guide pg. 286, Inner Sea Magic pg. 30"): the generator takes the
# first whose book has a notice
line = re.search(r'\*\*Source\*\*\s*([^\n]+)', body).group(1)
def code_of(name):
    # without a leading "The", as the notices name the book ("The Harrow Handbook" is harrow-handbook)
    c = re.sub(r'[^a-z0-9]+', '-', re.sub(r'^(PRPG |Pathfinder RPG |The )', '', name.strip()).lower().replace("'", '')).strip('-')
    return 'unchained' if c == 'pathfinder-unchained' else c
sources = [{'book': code_of(m.group(1)), 'name': m.group(1).strip(), 'page': m.group(2)} for m in re.finditer(r'\s*(.+?) pg\. ([^,\s]+),?', line)]
src = sources[0]
paras = [p.strip() for p in re.sub(r'^\*\*Source\*\*[^\n]*\n', '', body.strip()).split('\n\n') if p.strip()]
def names(said):
    said = re.sub(r'\bthe\b|\bclass features?\b|\babilities\b|\bability\b|\bbarbarian\'s\b', '', said)
    return [n.strip().strip('.').strip() for n in re.split(r',\s*(?:and\s+)?|\s+and\s+', said) if n.strip().strip('.')]
features, intro = [], []
for p in paras:
    # a name bolded twice over ("****Bodyguard (Ex)****: ...", a witchguard's page) is bolded once
    p = re.sub(r'\*{4,}', '**', p)
    fm = re.match(r'^\*\*(.+?)\*\*:?\s*(.*)$', p, re.S)
    if not fm or not fm.group(2):
        (features[-1].__setitem__('text', features[-1]['text'] + '\n\n' + p) if features else intro.append(p)); continue
    fname = fm.group(1).strip().rstrip(':')
    kind = re.search(r'\((Ex|Su|Sp)\)$', fname)
    features.append({'name': re.sub(r'\s*\((Ex|Su|Sp)\)$', '', fname).strip(), 'type': kind.group(1) if kind else None, 'text': fm.group(2).strip()})
for f in features:
    lvl = re.search(r'\b(?:at|starting at|beginning at|upon reaching)\s+(\d+)(?:st|nd|rd|th) level', f['text'], re.I) or re.search(r'\b(\d+)(?:st|nd|rd|th)[- ]level\b', f['text'])
    f['level'] = int(lvl.group(1)) if lvl else None
    # "this does not alter the level of the spell" trades nothing
    f['replaces'] = [n for m2 in re.finditer(r'(?<!not )\b(?:replaces?|in place of)\s+([^.]+?)\.', f['text']) for n in names(m2.group(1))]
    f['alters'] = [n for m2 in re.finditer(r'(?<!not )\b(?:alters?|modifies|changes)\s+([^.]+?)\.', f['text']) for n in names(m2.group(1))]
print(json.dumps({'name': name, 'source': src, 'sources': sources,
                  'intro': '\n\n'.join(intro), 'features': features}, indent=1, ensure_ascii=False))
