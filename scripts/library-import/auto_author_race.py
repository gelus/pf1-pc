# drafts the items of a race's page its authoring file lacks (alternate racial traits and favored class options from
# books whose notice is now in books.json): each described on the sheet, no adjustments, an example expecting
# nothing. the library's checks then say which give numbers the sheet keeps, and those are written by hand
import json, re, sys
race = sys.argv[1]
parsed = json.load(open(f'parsed/{race}.parsed.json')); path = f'author/{race}.json'; a = json.load(open(path))
made = []
for alt in parsed['alternate']:
    if alt['name'] in a['alternate']: continue
    shown = 'specialAttack' if re.search(r'\battack|damage\b|weapon', alt['text'], re.I) else \
        'defensiveAbilities' if re.search(r'\bsaving throws?\b|\bAC\b|resistance|immun', alt['text']) else 'specialQuality'
    a['alternate'][alt['name']] = {'shownIn': shown, 'examples': [{'expect': {}}]}; made.append(alt['name'])
for fcb in parsed['favored']:
    dup = sum(1 for x in parsed['favored'] if x['class'] == fcb['class']) > 1
    key = fcb['class'] + (('|' + fcb['text'][:20]) if dup else '')
    if key in a['favored']: continue
    a['favored'][key] = {}; made.append(key)
json.dump(a, open(path, 'w'), indent=1, ensure_ascii=False)
print(race, len(made), 'drafted')
