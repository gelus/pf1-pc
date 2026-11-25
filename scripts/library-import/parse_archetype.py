# an Archives of Nethys archetype page (as html2text.py gives it) read into its parts, verbatim: its name, source,
# introduction, and each feature with the level its text gains it at and the class features its text says it
# replaces or alters ("This ability replaces uncanny dodge, improved uncanny dodge, and damage reduction.")
import sys, re, json
text = open(sys.argv[1], encoding='utf8').read()
m = re.search(r'^# (.+?)\n(.*?)(?:Site Owner:|\Z)', text, re.M | re.S)
name, body = m.group(1).strip(), m.group(2)
src = re.search(r'\*\*Source\*\*\s*(?:PRPG )?(.+?) pg\. (\S+)', body)
code = re.sub(r'[^a-z0-9]+', '-', src.group(1).lower().replace("'", '')).strip('-')
paras = [p.strip() for p in re.sub(r'^\*\*Source\*\*[^\n]*\n', '', body.strip()).split('\n\n') if p.strip()]
def names(said):
    said = re.sub(r'\bthe\b|\bclass features?\b|\babilities\b|\bability\b|\bbarbarian\'s\b', '', said)
    return [n.strip().strip('.').strip() for n in re.split(r',\s*(?:and\s+)?|\s+and\s+', said) if n.strip().strip('.')]
features, intro = [], []
for p in paras:
    fm = re.match(r'^\*\*(.+?)\*\*:?\s*(.*)$', p, re.S)
    if not fm or not fm.group(2):
        (features[-1].__setitem__('text', features[-1]['text'] + '\n\n' + p) if features else intro.append(p)); continue
    fname = fm.group(1).strip().rstrip(':')
    kind = re.search(r'\((Ex|Su|Sp)\)$', fname)
    features.append({'name': re.sub(r'\s*\((Ex|Su|Sp)\)$', '', fname).strip(), 'type': kind.group(1) if kind else None, 'text': fm.group(2).strip()})
for f in features:
    lvl = re.search(r'\b(?:at|starting at|beginning at|upon reaching)\s+(\d+)(?:st|nd|rd|th) level', f['text'], re.I) or re.search(r'\b(\d+)(?:st|nd|rd|th)[- ]level\b', f['text'])
    f['level'] = int(lvl.group(1)) if lvl else None
    f['replaces'] = [n for m2 in re.finditer(r'\b(?:replaces?|in place of)\s+([^.]+?)\.', f['text']) for n in names(m2.group(1))]
    f['alters'] = [n for m2 in re.finditer(r'\b(?:alters?|modifies|changes)\s+([^.]+?)\.', f['text']) for n in names(m2.group(1))]
print(json.dumps({'name': name, 'source': {'book': 'unchained' if code == 'pathfinder-unchained' else code, 'name': src.group(1), 'page': src.group(2)},
                  'intro': '\n\n'.join(intro), 'features': features}, indent=1, ensure_ascii=False))
