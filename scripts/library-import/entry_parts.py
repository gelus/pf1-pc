# the parts of an entry written from the rules' own pages, shared by the generators
import re
import rules_pages

# what an authored trait gives beyond its adjustments, from the rules' own pages: a feat it grants
# ({"grantsFeat": {"name": "Endurance", "adjustments": {...}}}) and spell-like abilities ({"sla": {"spells":
# [{"name": "Dream", "uses": 1}], "ability": "cha"}}), written as the engine keeps them (spell-form.ts)
def SPELL_LEVEL(levels):
    for cls in ('sorcerer', 'wizard', 'sorcerer/wizard', 'cleric', 'druid'):
        if cls in levels: return levels[cls]
    return min(levels.values())
def extras(a, name, cites):
    adj = dict(a.get('adjustments', {}))
    if 'grantsFeat' in a:
        # one feat, or several ({"grantsFeat": [{"name": "Improved Unarmed Strike"}, {"name": "Catch Off-Guard"}]})
        granted = a['grantsFeat'] if isinstance(a['grantsFeat'], list) else [a['grantsFeat']]
        adj['bonusFeats'] = len(granted)
        adj['feats'] = []
        for g in granted:
            f = rules_pages.feat(g['name']); cites.add(f['source']['book'])
            adj['feats'].append({'name': g.get('as', f['name']), 'description': f['text'], 'adjustments': g.get('adjustments', {}),
                                 **({'prerequisites': f['prerequisites']} if f['prerequisites'] else {})})
    if 'sla' in a:
        levels = []
        for given in a['sla']['spells']:
            sp = rules_pages.spell(given['name']); cites.add(sp['source']['book'])
            lvl = SPELL_LEVEL(sp['levels'])
            while len(levels) <= lvl: levels.append({'perDay': {'total': 0, 'current': 0}, 'spells': []})
            comps = [c for c in re.split(r'[,\s]+', re.sub(r'\([^)]*\)', '', sp['components']).upper()) if re.match(r'^(V|S|M|F|DF|M/DF|F/DF)$', c)]
            spell = {'name': sp['name'], 'school': sp['school'], **({'subSchool': sp['subschool'].lower()} if sp['subschool'] else {}),
                     **({'descriptors': sp['descriptors']} if sp['descriptors'] else {}), 'castingTime': sp['castingTime'] or '1 standard action',
                     'components': comps, 'range': sp['range'], 'target': sp['target'], 'duration': sp['duration'],
                     'savingThrow': sp['savingThrow'] or 'none', 'spellResistance': sp['spellResistance'], 'description': sp['description']}
            if given.get('uses'): spell['uses'] = {'total': given['uses'], 'current': given['uses'], 'per': 'day', 'label': 'per day'}
            levels[lvl]['spells'].append(spell)
        origin = re.sub(r'[.\[\]]', '', name.strip().lower())
        adj[f'spellLikeAbilities.{origin}'] = {'name': name, 'ability': a['sla'].get('ability', 'cha'), 'casterLevel': 0, 'concentration': 0, 'spells': levels}
        adj[f'spellLikeAbilities.{origin}.casterLevel'] = a['sla'].get('casterLevel', '{level}')
    return adj
