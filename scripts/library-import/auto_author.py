# drafts an authoring file for each archetype of a class that has none yet and whose book has a notice: every
# feature described on the sheet, no adjustments, and an example at the highest level a feature is gained. the
# library's checks then say which features give numbers the sheet keeps (as they hold the AI to the page), and those
# are written by hand. a feature that changes proficiencies is left marked "todo", which the generator refuses
import json, glob, os, re, sys
cls = sys.argv[1]
books = json.load(open('../../public/library/books.json'))
made = []
for p in sorted(glob.glob(f'parsed/archetype/{cls}.*.json')):
    slug = os.path.basename(p)[len(cls) + 1:-len('.json')]
    out = f'author/archetype/{cls}.{slug}.json'
    a = json.load(open(p))
    if os.path.exists(out) or not any(x['book'] in books for x in a.get('sources', [a['source']])): continue
    features = {}
    for f in a['features']:
        name, text = f['name'], f['text']
        if name in ('Errata', 'Rage Powers') or re.match(r'^(The following|Link\b)', text): features[name] = {'skip': True}
        elif re.search(r'proficien', name, re.I): features[name] = {'todo': 'its proficiency changes'}
        else: features[name] = {'shownIn': 'specialAttack' if re.search(r'perform|attack|damage|strike|combat', text, re.I) else 'specialQuality'}
    level = max([f['level'] or 1 for f in a['features']] + [1])
    url = 'https://aonprd.com/ArchetypeDisplay.aspx?FixedName=' + (cls.title() + ' ' + a['name']).replace(' ', '%20')
    json.dump({'archetype': {'class': cls, 'url': url, 'examples': [{'level': level, 'expect': {}}]}, 'features': features},
              open(out, 'w'), indent=1, ensure_ascii=False)
    made.append(slug)
print(f'{len(made)} drafted')
