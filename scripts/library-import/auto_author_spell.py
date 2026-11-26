# drafts the authoring of a book's spells its file lacks (author/spell/<book>.json, by name): what draft_adjustments.py
# reads of each one's text in the rules' fixed forms ("a +1 morale bonus on attack rolls") as its effect, marked
# drafted; the rest with nothing, an example expecting nothing. the library's checks then flag what they miss, for
# the hand
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from book_code import BOOKS
from draft_adjustments import draft
book = sys.argv[1]
# --redo: what the drafter wrote is drafted again (its reading improved); what the hand wrote is kept
redo = '--redo' in sys.argv
SIGNED = re.compile(r'(?<![\w)])[+–-]\s?\d+(?![\d%]|d\d)(?!\s*(feet|ft\b|-?foot|gp|minutes?|hours?|rounds?|days?|\/|\s*per\b))')
# a number of a spell that is no effect on the creature it affects: its damage or healing ("1d8 + 1 point per caster
# level (maximum +25)"), a DC, a caster level check, a save against it, a table's. a spell whose every number is so,
# and whose text gives no bonus or penalty on a stat, is noted as such; the rest is the drafter's or the hand's
OWN = re.compile(r'damage|cures?\b|heal|hit points|\bDC\b|caster level|maximum|saving throw|\bsave\b|spell resistance|\|', re.I)
STAT = re.compile(r'\b(bonus|penalty) (on|to) (?!(its|the|their|his|her) sav|the save|saving throws? against (this|the) spell|caster level)', re.I)
def rolled_only(text):
    text = re.sub(r'\s+', ' ', text)
    clauses = [c for c in re.split(r'(?<=[.!?;])\s+', text) if SIGNED.search(c)]
    if not clauses or any(STAT.search(c) for c in clauses) or not all(OWN.search(c) for c in clauses): return None
    # (a bonus of its own with no signed number: "an insight bonus equal to your caster level on Perception checks")
    if re.search(r'\bbonus\b(?![^.;]*\b(save|saving throw)s? against (this|the) spell)', text, re.I) and not re.search(r'\bbonus\b[^.;]*\b(damage|hit points|caster level check)', text, re.I): return None
    return "no path: its numbers are its damage or healing, DCs and saves against it, rolled at the table"
path = os.path.join(HERE, 'author', 'spell', f'{book}.json'); os.makedirs(os.path.dirname(path), exist_ok=True)
author = json.load(open(path)) if os.path.exists(path) else {}
made = with_effect = 0
for p in sorted(glob.glob(os.path.join(HERE, 'parsed', 'spell', '*.json'))):
    s = json.load(open(p))
    src = next((x for x in s['sources'] if x['book'] in BOOKS), None)
    if not src or src['book'] != book: continue
    if s['name'] in author and not (redo and (author[s['name']].get('drafted') or not author[s['name']])): continue
    adj, choices = draft(s['description'], spell=True)
    a = {}
    note = rolled_only(s['description']) if not adj else None
    if note: a = {'descriptionOnly': note, 'drafted': True}
    if adj:
        a = {'adjustments': adj, 'drafted': True}; with_effect += 1
        if choices: a['choices'] = choices
    author[s['name']] = a; made += 1
json.dump(dict(sorted(author.items())), open(path, 'w'), indent=1, ensure_ascii=False)
print(book, made, 'drafted,', with_effect, 'with an effect,', len(author), 'in all')
