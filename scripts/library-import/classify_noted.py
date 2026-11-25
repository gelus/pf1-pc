# notes "no path:" on the flagged traits or feats whose every number belongs to others or to an action taken at the
# table: each sentence with a signed number is about another creature ("the target takes a -2 penalty", "allies gain
# a +2 bonus") or an action the character takes ("as a standard action", "you can choose to take a -2 penalty",
# "once per day"). one with a number in a plain bonus of its own, a style or stance ("while using"), or a sentence of
# neither is left for the hand. the note says which it found, so it reads as its reason
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
kind = sys.argv[1]
SIGNED = re.compile(r'(?<![\w)])[+–-]\s?\d+(?!\s*(feet|ft\b|gp|minutes?|hours?|rounds?|days?))|\b\d+\s+(temporary\s+)?hit points\b')
OTHERS = re.compile(r'\b(the|a|that|your|each|any|its) (target|opponent|foe|enemy|creature|ally|allies|summoned|undead|monster|subject|victim)s?\b[^.]*?\b(takes?|gains?|receives?|suffers?|must|is|are|can)\b|\b(enemies|opponents|foes|allies|targets|creatures)\b[^.]*?\b(take|gain|receive|suffer|must)\b|\b(it|they|he|she)\s+(takes?|gains?|receives?|suffers?)\b', re.I)
ACTION = re.compile(r'\bas an? (swift|move|standard|full-round|immediate|free) action\b|\b(you )?(can|may) (choose to )?(take|accept|attempt|make|spend|expend|use)\b|\bonce per (day|round|encounter|hour|minute)\b|\b(spend|expend)s? (\d+|a|one|two) (ki|grit|panache|stamina|use)|\bwhen(ever)? you (use|make|attempt|spend|cast|activate|confirm|perform|channel|deliver|throw|charge)\b|\bif you (do|succeed|hit|confirm)\b', re.I)
KEEP = re.compile(r'\bwhile (you are )?(using|in|wearing|wielding|raging)\b|\bstyle\b|\bstance\b', re.I)
items = {}
for p in glob.glob(os.path.join(HERE, 'parsed', kind, '*.json')):
    it = json.load(open(p)); items[re.sub(r'[^a-z0-9]+', '-', (it.get('slug') or it['name']).lower().replace("'", '').replace('’', '')).strip('-')] = it
flagged = {}
for line in open(os.path.join(HERE, '.pages', f'{kind}-problems.txt')):
    m = re.match(r'\s*' + kind + r'/([^ :]+)(?: example \d+)?: (.*)$', line.strip())
    if m: flagged.setdefault(m.group(1), []).append(m.group(2))
noted = left = 0
files = {p: json.load(open(p)) for p in glob.glob(os.path.join(HERE, 'author', kind, '*.json'))}
for slug, problems in flagged.items():
    it = items.get(slug)
    if not it or not all('adjusts nothing, and its text gives numbers' in p for p in problems): continue
    text = it['text'] if kind == 'trait' else ' '.join(x for x in (it['benefit'], it['special']) if x)
    text = re.sub(r'\s+', ' ', text)
    sentences = [s for s in re.split(r'(?<=[.!?])\s+', text) if SIGNED.search(s)]
    if not sentences or any(KEEP.search(s) for s in sentences): left += 1; continue
    whose = ['others' if OTHERS.search(s) and not re.search(r'\byou (gain|get|receive)\b[^.]*\+\d', s, re.I) else 'action' if ACTION.search(s) else None for s in sentences]
    if None in whose: left += 1; continue
    reason = ('its numbers are other creatures\'' if set(whose) == {'others'} else 'its numbers are an action\'s, taken at the table' if set(whose) == {'action'}
              else 'its numbers are an action\'s taken at the table, or other creatures\'')
    key = it.get('slug') or it['name']
    for p, a in files.items():
        if key in a and not a[key].get('adjustments') and not a[key].get('descriptionOnly'):
            a[key] = {**a[key], 'descriptionOnly': f'no path: {reason}', 'drafted': True}; noted += 1
for p, a in files.items(): json.dump(a, open(p, 'w'), indent=1, ensure_ascii=False)
print(kind, noted, 'noted', left, 'left for the hand')
