# drafts the adjustments of a trait's or feat's rules text where it says them in the rules' own fixed forms:
#   "+1 trait bonus on Bluff and Diplomacy checks"          skills.bluff.value, skills.diplomacy.value
#   "... on Perception checks to notice traps"              skills.perception.value[notice traps]
#   "Sense Motive is a class skill for you"                 skills.sense motive.classSkill
#   "one of these skills (your choice) is a class skill"   a choice of those skills
#   "+1 trait bonus on Will saves (against fear)"           saves.will(, [fear])
#   "+1 trait bonus on saving throws against poison"        savingThrowBonus[poison]
#   "+2 trait bonus on initiative checks"                   init
#   "+1 trait bonus on concentration checks"                spells.*.concentration
#   "+1 trait bonus on combat maneuver checks to trip"     cmb[trip]; "to CMD against disarm" cmd[disarm]
#   "+1 trait bonus on attack rolls against goblinoids"     attackRollBonus[goblinoids]
# what it can't read is left for the hand: a sentence with "when", "if", "while" or "once per" around a bonus is a
# situation the drafter names only when its form is one of these. what it drafts is held to the text by the library's
# checks like anything written by hand
import re
SKILLS = ['acrobatics', 'appraise', 'bluff', 'climb', 'craft', 'diplomacy', 'disable device', 'disguise', 'escape artist',
          'fly', 'handle animal', 'heal', 'intimidate', 'knowledge', 'linguistics', 'perception', 'perform', 'profession',
          'ride', 'sense motive', 'sleight of hand', 'spellcraft', 'stealth', 'survival', 'swim', 'use magic device']
KNOWLEDGE = ['arcana', 'dungeoneering', 'engineering', 'geography', 'history', 'local', 'nature', 'nobility', 'planes', 'religion']
NUM = r'\+(\d+)'
def skill_paths(phrase):
    # the skills a phrase names, as their paths: "Knowledge (arcana)", "Craft (alchemy)", "all Knowledge skills"
    out = []
    for m in re.finditer(r'\b(Knowledge|Craft|Perform|Profession)\s*\(([^)]+)\)', phrase):
        family = m.group(1).lower()
        for spec in re.split(r'\s*(?:,|\bor\b|\band\b)\s*', m.group(2).lower()):
            spec = spec.strip()
            if family == 'knowledge' and spec in KNOWLEDGE: out.append(f'knowledge.subSkills.{spec}')
            elif family != 'knowledge' and spec and spec not in ('any', 'all'): out.append(f'{family}.subSkills.{spec}')
            elif spec in ('any', 'all'): out.append(f'{family}.subSkills.*')
    rest = re.sub(r'\b(Knowledge|Craft|Perform|Profession)\s*\([^)]+\)', ' ', phrase)
    if re.search(r'\ball Knowledge\b|\bKnowledge skills\b', rest): out.append('knowledge.subSkills.*')
    # a family named without its specialty is every one of it ("Craft checks made to craft weapons")
    for family in ('Craft', 'Perform', 'Profession'):
        if re.search(r'\b' + family + r'\b(?!\s*\()', rest): out.append(f'{family.lower()}.subSkills.*')
    for skill in SKILLS:
        if skill in ('knowledge', 'craft', 'perform', 'profession'): continue
        if re.search(r'\b' + re.escape(skill.title().replace(' Of ', ' of ')) + r'\b', rest): out.append(skill)
    return list(dict.fromkeys(out))
def situations(phrase):
    # a purpose or situation, one variant each. distinct purposes ("to avoid being surprised and to detect ...") apart;
    # a list in one keeps the first item's words before it and the last item's word after it: "notice traps or ambushes"
    # is [notice traps] and [notice ambushes], "detect invisible or incorporeal creatures" [detect invisible creatures]
    # and [detect incorporeal creatures], "improve the attitude of oppressed, enslaved, or imprisoned subjects" three
    # [improve the attitude of ... subjects]
    phrase = re.sub(r'^(you (make|attempt) )?(made |attempted )?(in order )?(to |when |while |against |in |on |involving |with |vs\.? )', '', phrase.strip()).strip(' .,;')
    out = []
    for each in re.split(r',?\s+and\s+(?=(?:to|when|while|against)\s)', phrase):
        each = re.sub(r'^(and |or )?(to|when|while|against) ', '', each.strip()).strip(' ,')
        if not each: continue
        items = [p.strip() for p in re.split(r'\s*,\s*(?:or\s+|and\s+)?|\s+or\s+|\s+and\s+', each) if p.strip()]
        if len(items) < 2: out.append(each); continue
        first, last = items[0].split(' '), items[-1].split(' ')
        middle = items[1:-1]
        if any(len(m.split(' ')) > 1 for m in middle): out.extend(items); continue
        prefix = first[:-1]
        suffix = last[1:] if len(last) == 2 and len(first) <= 2 or (len(last) == 2 and len(first) > 2) else []
        if len(last) > 2: suffix = []
        heads = [first[-1]] + middle + [last[0] if suffix else ' '.join(last)]
        out.extend(' '.join(prefix + [h] + suffix) for h in heads)
    return out
# a stat named alone in a list of them
STAT_PIECE = re.compile(r'^(?:on )?(?:all )?(?:melee |ranged |weapon )?(attack rolls?|saving throws?|saves|ability checks?|skill checks?|(?:weapon )?damage rolls?|AC|Armor Class|initiative(?: checks)?|caster level checks?|combat maneuver checks?|CMD|Fortitude saves?|Reflex saves?|Will saves?)$', re.I)
def typed(n, kind):
    return {'value': int(n), 'type': kind} if kind else int(n)
# a sentence about another creature or a thing: its numbers are not the character's (an ally's +2, the animal
# companion's, the weapon's own, creatures that lie to it). a spell's subject or target is the creature it affects,
# a feat's or a trait's is someone else
OTHERS = re.compile(r"^(?:in addition, |additionally, |also, |however, |further(?:more)?, )?(?:each |any |all |other |nearby |adjacent )?(enem(?:y|ies)|opponents?|foes?|attackers?|allies|(?:an? |your |the |each )?ally|creatures? (?:that|who|which|attacking|within|in)|anyone|those (?:who|within)|the (?:wall|weapon|eye|hand|sword|rope|illusion|swarm|summoned creature|construct|spirit|phantom|familiar|animal companion|companion|mount|eidolon|cohort|webbing|area|object|item)|(?:your |its |the )(?:animal companion|companion|familiar|mount|eidolon|cohort|phantom))\b", re.I)
FOE = re.compile(r"^(?:in addition, |additionally, |also, )?(?:the|that|this|each|your) (target|subject|victim|creature (?:struck|hit)|struck creature)\b", re.I)
# a text that leaves a pick ("choose one of the following", "if the form you take is"): the options are the hand's,
# written as a choice, never summed
PICK = re.compile(r"\b(choose|select) (one|either|between)\b(?! (opponent|creature|target|ally|allies|enemy|foe|square|adjacent|of your allies|of the creatures|of its targets|of them))|\bone of the following\b|\bif the form you (take|assume) is\b|\byou (can|may) (choose|select) (one|an?|either)\b", re.I)
# what a text gives without a signed number, in the forms the rules write it in, when it gives it to the character
NOT_ITS_OWN = re.compile(r"\b(ignor\w*|bypass\w*|overcom\w*|penetrat\w*|loses?|lost|lack\w*|without|suppress\w*|negat\w*|reduc\w*|halv\w*|lower\w*|instead of|if (it|he|she|you) (already|has)|for 24 hours|from that (source|creature)|any of the following|the listed ability|affected creatures?|a creature under|allies|an ally|the ally|familiar|sensor|companion|mount|eidolon|the subject|grant the)\b", re.I)
def unsigned(s, adj):
    # (nor one in a condition, "if you are immune", "even if they are immune")
    if NOT_ITS_OWN.search(s) or re.search(r'\b(if|unless|whether)\b[^.;,]{0,40}\b(immune|darkvision|DR|damage reduction|resist\w*|speed)\b', s, re.I): return
    m = re.search(r'\bdarkvision\b(?! beyond)[^.;]{0,30}?\b(\d+)\s*(feet|ft)', s, re.I)
    if m: adj.setdefault('senses.darkvision', int(m.group(1)))
    for m in re.finditer(r'\b(?:DR|damage reduction) (\d+)\s*/\s*([a-z][a-z \-]*?|[—–-])(?=[,.;)]| and | for | against |$)', s, re.I):
        bypass = '-' if m.group(2).strip() in ('—', '–', '-') else m.group(2).strip().lower()
        adj.setdefault(f'damageReduction.{bypass}', int(m.group(1)))
    for m in re.finditer(r'\b(?:resistance (?:to )?(acid|cold|electricity|fire|sonic) (\d+)|(acid|cold|electricity|fire|sonic) resistance (\d+)|resist (acid|cold|electricity|fire|sonic) (\d+))', s, re.I):
        energy = (m.group(1) or m.group(3) or m.group(5)).lower(); n = int(m.group(2) or m.group(4) or m.group(6))
        adj.setdefault(f'energyResistance.{energy}', n)
    m = re.search(r'\b(?:you|he|she|it|they|the (?:subject|target|recipient|warded creature)) (?:also )?(?:become|becomes|is|are|gain|gains) (?:also )?immun(?:e|ity) to ([^.;]+)', s, re.I)
    if m and not re.match(r'\s*(this|the effects of this|that|its|it\b)', m.group(1), re.I):
        things = [t.strip() for t in re.split(r',\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+', re.sub(r'\s*\([^)]*\)', '', m.group(1))) if t.strip()]
        if things and all(len(t.split()) <= 4 for t in things): adj.setdefault('immunities', things)
    for m in re.finditer(r'\b(fly|swim|climb|burrow)(?:ing)? speed (?:of )?(\d+)\s*(?:feet|ft)|\b(fly|swim|climb|burrow) (\d+)\s*(?:feet|ft)', s, re.I):
        kind = (m.group(1) or m.group(3)).lower(); adj.setdefault(f'speed.{kind}', {'value': int(m.group(2) or m.group(4)), 'mode': 'set'})
        if kind == 'fly':
            how = re.search(r'\b(clumsy|poor|average|good|perfect)\b(?:\s+maneuverability)?', s[m.end():m.end() + 40], re.I)
            if how: adj.setdefault('flyManeuverability', how.group(1).lower())
def draft(text, bonus_type=None, spell=False):
    adj = {}; choices = []
    text = re.sub(r'\s+', ' ', text)
    if PICK.search(text): return {}, []
    sentences = re.split(r'(?<=[.!?])\s+', text)
    for s in sentences:
        if OTHERS.search(s) or (not spell and FOE.search(s)): continue
        # a bonus that depends on something the sheet can't see as a plain situation is left to the hand
        # a sentence that opens with when it applies ("Whenever you are adjacent to an ally who also has this feat, you
        # receive ...", "If you are flanking, ..."): every bonus in it is a variant of that, the round it lasts too
        lead = re.match(r'^(?:In addition, |Additionally, |Also, )?(?:While|When(?:ever)?|If|As long as|Against) ([^,]{3,80}), ', s)
        # "When you do," names no situation of its own
        if lead and re.match(r'^(you do|you do so|it does|this happens|so)$', lead.group(1).strip(), re.I): continue
        # an option the character takes ("You can choose to take a –1 penalty ... to gain a +2 bonus"), or a pick ("the
        # selected weapon", "the chosen skill"): the hand's
        if re.search(r'\b(can|may) choose to\b|\b(the|your) (selected|chosen)\b', s, re.I): continue
        if not lead and re.search(r'\b(once per|per day|for 1 round|for one round|as a (swift|move|free|standard) action|until|(?<!choose )(?<!Choose )either)\b', s, re.I): continue
        if lead and re.search(r'\b(once per|per day|(?<!choose )(?<!Choose )either)\b', s, re.I): continue
        # "the skill you select": a bonus on a skill the player picks from a list (and its class skill)
        pick = re.search(r'(?:Select|Choose|Pick) (?:one of the following skills:?|either)\s*([^.;]+)[.;]', s) or re.search(r'(?:Select|Choose|Pick) (?:one of the following skills:?|either)\s*([^.;]+)[.;]', text)
        if pick and re.search(r'bonus on (that skill|checks with that skill|checks with the selected skill|checks with the chosen skill)', s):
            named = skill_paths(pick.group(1))
            n = re.search(NUM, s)
            if named and n:
                choices.append({'id': 'skill', 'kind': 'text', 'label': 'the skill it picks', 'options': [p.replace('.subSkills.', ' (') + (')' if '.subSkills.' in p else '') for p in named]})
                adj['skills.{choice:skill}.value'] = typed(n.group(1), bonus_type)
                if re.search(r'class skill', s): adj['skills.{choice:skill}.classSkill'] = True
                continue
        # (what it gives with no signed number, held to the same: not for an action or a while, the hand's toggle)
        if not lead and (re.search(r'\b(you|he|she|it|they|the (subject|target|recipient)|(?:a|an) \w+ (?:gains?|has))\b', s, re.I) or re.match(r'\s*(darkvision|DR|damage reduction|resist)', s, re.I)) and not re.search(r'\bfor (\d+|one|a|an) (rounds?|minutes?|hours?)\b|\bnumber of rounds\b', s, re.I): unsigned(s, adj)
        before = set(adj)
        # (a type of two words: a spell's "+2 natural armor bonus"), and a penalty as the negative number ("takes a –1
        # penalty on attack rolls": a spell's on the creatures it affects)
        for m in re.finditer(r'(\+|[–-])\s?(\d+)\s+(?:(natural armor|\w+)\s+)?(bonus|penalty) (?:on|to) ([^.;]+?)(?=,?\s+(?:and )?(?:a |an )?[+–-]\d|[.;]|$)', s):
            sign, n, kind, what, whole = m.group(1), m.group(2), (m.group(3) or '').lower(), m.group(4), m.group(5)
            if (sign == '+') != (what == 'bonus'): continue
            n = n if what == 'bonus' else f'-{n}'
            # (what the bonus is not part of: "(to a minimum of 1)", "due to its increased size")
            whole = re.sub(r'\s+due to .*$', '', re.sub(r'\s*\([^)]*\)', '', whole))
            # a list of stats ("attack rolls, saves, and skill checks"): each its own
            pieces = [re.sub(r'^on\s+', '', p.strip()) for p in re.split(r',\s*(?:and\s+)?|\s+and\s+', whole) if p.strip()]
            # (the last may say when: "attack rolls and saves against fear effects")
            if len(pieces) > 1 and all(STAT_PIECE.match(p) for p in pieces[:-1]) and STAT_PIECE.match(re.sub(r'\s+(against|versus|vs\.?|to resist|made to|when|while)\b.*$', '', pieces[-1])):
                for piece in pieces: one(adj, piece, n, kind, bonus_type)
                continue
            # "Bluff checks and on Use Magic Device checks made to ...": each its own
            for rest in re.split(r',?\s+(?:and|as well as) on\s+', whole):
                one(adj, rest, n, kind, bonus_type)
        if lead:
            # the situation named plainly: "you are adjacent to an ally who also has this feat" is [adjacent to an ally
            # who also has this feat]; one with "or" is each of its parts
            sit = re.sub(r'^(you are |you\'re |you |your )', '', lead.group(1).strip())
            sits = situations(sit) if re.search(r'\bor\b', sit) else [sit]
            for p in [p for p in adj if p not in before]:
                value = adj.pop(p)
                for one_sit in sits:
                    # one named already for its purpose keeps it, while the situation: [overcoming spell resistance while
                    # adjacent to an ally who also has this feat]
                    adj[f'{p[:-1]} while {one_sit}]' if '[' in p else f'{p}[{one_sit}]'] = value
    return finish(text, adj, choices)
def one(adj, rest, n, kind, bonus_type):
    if True:
        if True:
            # "Handle Animal checks and Ride checks", "concentration and initiative checks"
            # "Sense Motive checks and Diplomacy checks to gather information": what follows is the last one's alone
            parts = re.split(r'(?:\bchecks\b[^,]*?)?(?:,\s*(?:and\s+)?|\s+and\s+)(?=(?:on\s+)?[A-Z][\w ()]*? checks\b)', rest) if re.search(r'checks\b.*\bchecks\b', rest) else [rest]
            if len(parts) > 1:
                pieces = re.findall(r'(.*?\bchecks\b[^,]*?)(?=(?:,\s*(?:and\s+)?|\s+and\s+)(?:on\s+)?[A-Z][\w ()]*? checks\b|$)', rest)
                pieces = [p.strip(' ,') for p in pieces if p.strip(' ,')]
                pieces = [re.sub(r'^(and |on )+', '', p) for p in pieces]
                if len(pieces) > 1:
                    for part in pieces: one(adj, part, n, kind, bonus_type)
                    return
            if re.match(r'initiative and ([A-Z][\w ()]*) checks', rest):
                one(adj, 'initiative checks', n, kind, bonus_type)
                one(adj, re.sub(r'^initiative and ', '', rest), n, kind, bonus_type)
                return
            if re.match(r'concentration and initiative checks|initiative and concentration checks', rest):
                adj['init'] = typed(n, kind if kind in ('trait',) else bonus_type); adj['spells.*.concentration'] = adj['init']; return
            kind = kind if kind in ('trait', 'racial', 'insight', 'luck', 'morale', 'competence', 'sacred', 'profane', 'dodge',
                                    'enhancement', 'deflection', 'shield', 'armor', 'natural armor', 'size', 'resistance', 'alchemical', 'circumstance') else (bonus_type if kind == 'trait' else None)
            kind = kind or bonus_type
            value = typed(n, kind)
            both = re.match(r'(Fortitude|Reflex|Will),? (?:and|or) (Fortitude|Reflex|Will) sav\w*\s*$', rest)
            if both:
                for name in both.groups(): adj[{'Fortitude': 'saves.fort', 'Reflex': 'saves.ref', 'Will': 'saves.will'}[name]] = value
                return
            rest = re.sub(r'^all (?=(Fortitude|Reflex|Will) sav|Initiative|initiative|damage|melee|ranged|weapon|attack)', '', rest)
            rest = re.sub(r'^Initiative', 'initiative', rest)
            # attack and damage rolls against a kind of foe
            ad = re.match(r'(?:(melee|ranged|weapon) )?attack and (?:weapon )?damage rolls?(?: (?:against|with|made with|when) (.+))?\s*$', rest)
            if ad:
                which = [ad.group(1)] if ad.group(1) in ('melee', 'ranged') else ['melee', 'ranged']
                sits = situations(ad.group(2)) if ad.group(2) else []
                for path in ['attackRollBonus'] + [f'{w}.*.damageBonus' for w in which]:
                    if path == 'attackRollBonus' and len(which) == 1: path = f'{which[0]}.*.toHitBonus'
                    for sit in sits or [None]: adj[f'{path}[{sit}]' if sit else path] = value
                return
            # caster level checks to overcome spell resistance (of a kind of creature)
            cl = re.match(r'caster level checks? (?:made )?to overcome (?:the )?spell resistance(?: of (.+))?\s*$', rest)
            if cl:
                adj[f'spells.*.casterLevel[overcoming the spell resistance of {cl.group(1).strip()}]' if cl.group(1) else 'spells.*.casterLevel[overcoming spell resistance]'] = value
                return
            # an ability's skills ("Charisma-based skill checks to influence evil creatures"), or an ability's checks
            ab = re.match(r'(?:opposed )?(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)-based (?:skill )?checks?(.*)$', rest)
            if ab:
                key = ab.group(1)[:3].lower(); sits = situations(ab.group(2)) if ab.group(2).strip() else []
                for sit in sits or [None]: adj[f'skills.@{key}.value[{sit}]' if sit else f'skills.@{key}.value'] = value
                return
            ac_ = re.match(r'(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) checks? (?:made )?(?:to |when |against )(.+)$', rest)
            if ac_:
                for sit in situations(ac_.group(2)): adj[f'abilityCheckBonus[{sit}]'] = value
                return
            if re.match(r'(all )?saving throws|(all )?saves\b', rest) or re.match(r'(Fortitude|Reflex|Will) sav', rest):
                save = re.match(r'(Fortitude|Reflex|Will)', rest)
                path = {'Fortitude': 'saves.fort', 'Reflex': 'saves.ref', 'Will': 'saves.will'}[save.group(1)] if save else 'savingThrowBonus'
                tail = re.sub(r'^(all )?(saving throws|saves|Fortitude saves?|Reflex saves?|Will saves?|Fortitude saving throws?|Reflex saving throws?|Will saving throws?)\s*', '', rest)
                tail = re.split(r'\s*(?:,\s*and\b|\band on\b|\band you\b)', tail)[0]
                if tail.strip():
                    for sit in situations(re.sub(r'^(made )?(to resist|against|versus|vs\.?)\s+', '', tail)):
                        adj[f'{path}[{re.sub(r" (effects?|spells?)$", lambda x: x.group(0) if "spell" in x.group(0) else "", sit)}]'] = value
                else: adj[path] = value
                return
            # an ability score (a spell's "+4 enhancement bonus to Strength", "to Strength and Constitution")
            abs_ = re.match(r'(?:its |your |his |her |the subject\'s )?(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?:(?:,| and) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma))?(?:\s+scores?)?\s*(?:,|$)', rest)
            if abs_:
                for name in [g for g in abs_.groups() if g]: adj[f'abilityScores.{name[:3].lower()}'] = value
                return
            # every skill, every ability check, every attack's damage named alone
            if re.match(r'(all )?skill checks?\s*$', rest): adj['skillCheckBonus'] = value; return
            if re.match(r'(all )?ability checks?\s*$', rest): adj['abilityCheckBonus'] = value; return
            if re.match(r'(Armor Class|AC)\s*$', rest): adj['ac'] = value; return
            # plain only when nothing follows: "initiative checks when underground" is the hand's
            if re.match(r'initiative( checks?| rolls?)?\s*$', rest): adj['init'] = value; return
            if rest.startswith('initiative'): return
            if rest.startswith('concentration check'): adj['spells.*.concentration'] = value; return
            cm = re.match(r'(?:combat maneuver checks?|CMB) (?:made |attempted )?to ([^,;]+)', rest)
            if cm:
                for sit in situations(cm.group(1)): adj[f'cmb[{sit}]'] = value
                return
            cd = re.match(r'(?:your )?CMD (?:against|to resist|versus|when resisting) ([^,;]+)', rest)
            if cd:
                for sit in situations(cd.group(1)): adj[f'cmd[{sit}]'] = value
                return
            cr = re.match(r'(?:attack )?rolls? (?:made )?to confirm critical hits(?: (?:against|with) (.+))?$', rest)
            if cr:
                adj[f'attackRollBonus[confirming critical hits{" against " + cr.group(1).strip() if cr.group(1) else ""}]'] = value
                return
            at = re.match(r'(?:(melee|ranged) )?attack rolls? (against|with|made with|when fighting|when you|while) (.+)$', rest)
            if at:
                path = f'{at.group(1)}.*.toHitBonus' if at.group(1) else 'attackRollBonus'
                sit_text = at.group(3) if not at.group(2).startswith(('when you', 'while')) else at.group(2).replace('when you', '').strip() + ' ' + at.group(3)
                for sit in situations(sit_text.strip()): adj[f'{path}[{sit}]'] = value
                return
            if re.match(r'(all )?attack rolls\s*$', rest): adj['attackRollBonus'] = value; return
            # "attack rolls you make using the selected weapon": a pick, the hand's
            if rest.startswith('attack rolls'): return
            nx = re.match(r'(?:your |her |his )?next (melee |ranged )?attack rolls?', rest)
            if nx:
                adj[f'{nx.group(1).strip()}.*.toHitBonus[its next attack]' if nx.group(1) else 'attackRollBonus[its next attack]'] = value
                return
            # damage: every attack's, or weapons' against a kind of foe ("weapon damage rolls against undead")
            dm = re.match(r'(?:(melee|ranged) )?(?:weapon )?damage(?: rolls?)?(?: (?:made )?(?:against|with|when attacking|when|as long as|while) (.+))?\s*$', rest)
            if dm:
                which = [dm.group(1)] if dm.group(1) else ['melee', 'ranged']
                sits = situations(dm.group(2)) if dm.group(2) else []
                for w in which:
                    if sits:
                        for sit in sits: adj[f'{w}.*.damageBonus[{sit}]'] = value
                    else: adj[f'{w}.*.damageBonus'] = value
                return
            # a bonus to AC against a kind of foe ("+1 dodge bonus to AC against goblinoids")
            ac = re.match(r'(?:your )?(?:AC|Armor Class)(?: (?:against|versus|vs\.?) ([^,;]+))?\s*$', rest)
            if ac:
                if ac.group(1):
                    for sit in situations(ac.group(1)): adj[f'ac[{sit}]'] = value
                else: adj['ac'] = value
                return
            sk = re.match(r'(.+?) checks?\b(.*)$', rest)
            if sk:
                paths = skill_paths(sk.group(1))
                if not paths: return
                tail = re.split(r'\s*(?:,\s*and\b|\band\b(?= [A-Z])|\band you\b|;)', sk.group(2))[0]
                sits = situations(tail) if tail.strip() else []
                for p in paths:
                    if sits:
                        for sit in sits: adj[f'skills.{p}.value[{sit}]'] = value
                    else: adj[f'skills.{p}.value'] = value
# a variant's name as the library's checks hold it (ai/mechanics.ts variantNameProblems): the situation alone, in a few
# words. a draft whose name is a piece of its sentence ("attacks of opportunity caused when you move out of") is not
# drafted: the item is left for the hand, as one the drafter can't read
def clean_situation(sit):
    sit = re.sub(r'\s*\((?:such as|see|including|like|pathfinder|page)\b[^)]*\)?', '', sit, flags=re.I)
    # (how long it lasts is no situation: "fear effects for 12 hours")
    sit = re.sub(r'\s+for (\d+|one|a|an) (rounds?|minutes?|hours?|days?)\b.*$', '', sit, flags=re.I)
    return re.sub(r'\s+', ' ', sit).strip(' ,;')
def bad_situation(sit):
    return bool(re.search(r'[+–]\s?\d|(?<![a-z\d])-\d|\b(bonus(es)?|penalt(y|ies)) (on|to)\b', sit, re.I)
        or re.search(r'\b(\w+) \1\b', sit, re.I)
        or re.search(r"^(and|or|but|which|who|they|as long as|are|is|you|if|when|whenever|while|to|made|can|can['’]t|do|does|unless)\b", sit, re.I)
        or re.search(r'\b(of|to|with|from|by|out|in|on|for|at|the|a|an|and|or|while|that|than|as|your|its)$', sit, re.I)
        or sit.count('(') != sit.count(')') or len(sit.split()) > 10
        or re.search(r'fighting defensively|fight defensively|total defense|combat expertise|power attack|deadly aim|two-weapon fighting', sit, re.I)
        or re.match(r'^(it|this|that|these|those|such|so|them|him|her|the spell|this spell|doing so|the target|the subject|the creature|the effect)$', sit, re.I)
        or re.search(r'\bfor the duration\b|\bthe spell lasts\b|\bwhile the spell\b|\bspell is in effect\b|\buntil the (end|start|beginning)\b|\||\bsuch as\b|\bas well as\b|\bthis (spell|feat|trait|ability)\b|\busing this\b|\bwith this (feat|trait|ability)\b', sit, re.I))
def named_plainly(adj):
    out = {}
    for path, value in adj.items():
        m = re.match(r'^(.*)\[([^\]]*)\]$', path)
        if not m or m.group(2).startswith('{choice:'): out[path] = value; continue
        sit = clean_situation(m.group(2))
        if sit and not bad_situation(sit): out[f'{m.group(1)}[{sit}]'] = value
    return out
def finish(text, adj, choices):
    adj = named_plainly(adj)
    # class skills: named ones, or one of those it names, the player's pick
    m = re.search(r'([^.]*?)\b(?i:one|either) of (?:these|those|them)\b ?(?:skills )?(?:\(your choice\) )?(?:is|becomes) (?:always )?a class skill', text)
    if m:
        named = skill_paths(text[:m.end()])
        if len(named) > 1:
            choices.append({'id': 'class-skill', 'kind': 'text', 'label': 'the skill it makes a class skill',
                            'options': [p.replace('.subSkills.', ' (') + (')' if '.subSkills.' in p else '') for p in named]})
            adj['skills.{choice:class-skill}.classSkill'] = True
    else:
        for sentence in re.split(r'(?<=[.!?])\s+', text):
            if re.search(r'\b(it|this skill|that skill|the skill) (?:is|becomes) (?:always )?(?:a )?class skill', sentence) and not re.search(r'one of|either|choice|select|choose|pick', sentence, re.I):
                for p in skill_paths(sentence): adj[f'skills.{p}.classSkill'] = True
        for c in re.finditer(r'([A-Z][^.;]*?)\s+(?:is|are|becomes?) (?:always )?(?:a )?class skills? for you', text):
            # the clause that names them: "..., and Stealth is a class skill for you" is Stealth
            subject = re.split(r',\s*(?:and\s+)?|;\s*', c.group(1))[-1]
            for p in skill_paths(subject): adj[f'skills.{p}.classSkill'] = True
    return adj, choices
if __name__ == '__main__':
    import sys, json
    print(json.dumps(draft(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None), indent=1))
