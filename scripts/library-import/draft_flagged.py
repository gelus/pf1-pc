# drafts the authoring of the flagged traits or feats of a book (.pages/<kind>-problems.txt, the library spec's lines)
# from their text (draft_adjustments.py): what it reads becomes their adjustments and choices, with an example
# expecting each plain number; a flagged one whose text gives no number (the checks said so) is told in its
# description. the rest is listed, for the hand. an item authored by hand already (it has adjustments or
# descriptionOnly) is left as it is
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from draft_adjustments import draft
kind, book = sys.argv[1], sys.argv[2]
# --all: every item the drafter wrote is drafted again (its reading improved), not only the flagged ones
again = '--all' in sys.argv
path = os.path.join(HERE, 'author', kind, f'{book}.json'); author = json.load(open(path))
parsed = {}
for p in glob.glob(os.path.join(HERE, 'parsed', kind, '*.json')):
    item = json.load(open(p)); key = item['slug'] if kind == 'trait' else item['name']
    if key in author: parsed[re.sub(r'[^a-z0-9]+', '-', (item.get('slug') or item['name']).lower().replace("'", '').replace('’', '')).strip('-')] = (key, item)
flags = {}
for line in open(os.path.join(HERE, '.pages', f'{kind}-problems.txt')):
    m = re.match(r'\s*' + kind + r'/([^ :]+)(?: example \d+)?: (.*)$', line.strip())
    if m and m.group(1) in parsed: flags.setdefault(m.group(1), []).append(m.group(2))
if again:
    for slug, (key, item) in parsed.items():
        if author[key].get('drafted') and author[key].get('adjustments'): flags.setdefault(slug, ['its bonus is a path'])
drafted = noted = 0; left = []
for slug, problems in sorted(flags.items()):
    key, item = parsed[slug]; a = author[key]
    if not a.get('drafted') and (a.get('adjustments') or a.get('descriptionOnly') or a.get('skip')): left.append(f'{key}: {problems[0][:150]}'); continue
    if all(re.search(r'adjusts nothing: write its rules', p) for p in problems):
        a['descriptionOnly'] = 'its rules change no number the sheet keeps'; a['drafted'] = True; noted += 1; continue
    text = item['text'] if kind == 'trait' else '\n\n'.join(x for x in (item['benefit'], item['special']) if x)
    adj, choices = draft(text, 'trait' if kind == 'trait' else None)
    if not adj: left.append(f'{key}: {problems[0][:150]}'); continue
    a['adjustments'] = adj; a['drafted'] = True; a.pop('descriptionOnly', None)
    if choices: a['choices'] = choices
    picks = {c['id']: c['options'][0] for c in choices}
    expect = {}
    for p, v in adj.items():
        # a caster's numbers are on no blank character
        if '[' in p or '{choice' in p or '*' in p or p.startswith('spells.'): continue
        expect[p] = v['value'] if isinstance(v, dict) else v
    a['examples'] = [{**({'choices': picks} if picks else {}), 'expect': expect}]
    drafted += 1
json.dump(author, open(path, 'w'), indent=1, ensure_ascii=False)
print(f'{book}: {drafted} drafted, {noted} told in their description, {len(left)} for the hand')
open(os.path.join(HERE, '.pages', f'{kind}-{book}-left.txt'), 'w').write('\n'.join(left) + '\n')
