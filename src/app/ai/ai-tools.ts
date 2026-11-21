import {ApplyCharacterService} from '../apply-character.service';
import {adjustmentReference} from '../rules/adjustment-reference';
import {AiProvider, AiToolDeclaration} from './ai-provider';
import {basedOnKinds, createFeature, createItem, featureLists, itemTypes, slots} from './builders';
import {editFeature, editItem, removeFeature, removeItem} from './editors';
import {addClassLevel, chooseAbilityIncrease, levelUpStatus, setSkillRanks} from './level-up';
import {creationStatus, priceGear, setAbilityScores, setCharacterDetails, setRace} from './creation';
import {CREATION_STEPS, CreationConversation, completeCreationStep, getCreationStep, offerPointBuy} from './creation-script';
import {lookUpRule, ruleKinds} from './rules-lookup';
import {characterSummary, explainAttack, explainStat, findFeature, findItem} from './character-reader';
import {
  addCondition, castSpell, heal, removeCondition, rest, setCombatOption, setFeatureActive, takeDamage, undoLast, useCharges,
} from './play-actions';

// the tools the AI can call, whichever provider runs it. each one is a declaration the AI reads and a function the
// app runs in the browser. the AI never works a number out itself, it asks the engine, which is what the sheet shows.
// the reading tools only read, the play actions (play-actions.ts) change the character, each one a step of the undo
// history the chat offers to take back

export interface AiToolContext {
  character: ApplyCharacterService;
  // the AI itself, for the tools that ask it something of their own (reading a rules page)
  provider?: AiProvider | null;
  // the conversation, for the creation script: the player's messages and the step last asked
  conversation?: CreationConversation;
}

export interface AiTool extends AiToolDeclaration {
  // what the chat shows while the tool runs ("looking up AC")
  label(args: {[name: string]: unknown}): string;
  // the tool changes the character (a play action): the chat shows what it did, with an undo
  changes?: boolean;
  run(args: {[name: string]: unknown}, context: AiToolContext): object | Promise<object>;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

// a part of the adjustment reference: it is long, and what the AI reads stays in the conversation it sends each time
export const referenceTopic = (topic: string): object => {
  const sections = adjustmentReference().split(/\n(?=## )/);
  const titled = (title: string) => sections.filter(section => section.startsWith(`## ${title}`));
  const parts: {[topic: string]: string[]} = {
    rules: [sections[0], ...titled('Adjustments')],
    paths: titled('What can be adjusted'),
    examples: titled('Examples'),
    all: sections,
  };
  if (!parts[topic]) return {error: `topic is one of ${Object.keys(parts).join(', ')}`};
  return {reference: parts[topic].join('\n'), ...(topic === 'all' ? {} : {otherTopics: Object.keys(parts).filter(t => t !== topic)})};
};
const named = (what: string) => ({type: 'object' as const, properties: {name: {type: 'string' as const, description: what}}, required: ['name']});

export const aiTools: AiTool[] = [
  {
    name: 'get_character_summary',
    description: 'The sheet in short, every number final: race, classes, ability scores, hp, AC, saves, attacks, '
      + 'trained skills, active conditions and features, defenses, spells per day. Call it first, and again after the '
      + 'player changed the character.',
    label: () => 'reading the sheet',
    run: (_, {character}) => characterSummary(character),
  },
  {
    name: 'explain_stat',
    description: 'Where a number of the sheet comes from, as its tooltip shows it: each bonus and penalty with its '
      + 'feature and type, those that do not stack, and situational ones (vs. fear). For "why is my AC 17".',
    parameters: {
      type: 'object',
      properties: {
        stat: {
          type: 'string',
          description: 'ac, touchAc, flatFootedAc, init, hp, bab, cmb, cmd, saves.fort, saves.ref, saves.will, '
            + 'speed.land, abilityScores.str (or another ability), maxDexBonus, armorCheckPenalty, '
            + 'spellFailureChance, or a skill by name: stealth, knowledge (arcana), sense motive',
        },
      },
      required: ['stat'],
    },
    label: args => `looking up ${text(args['stat']) || 'a stat'}`,
    run: (args, {character}) => explainStat(character, text(args['stat'])),
  },
  {
    name: 'explain_attack',
    description: 'What makes up an attack of the character: its attack bonuses (iteratives included), each part of '
      + 'the attack bonus and the damage with where it comes from, the critical range and notes.',
    parameters: {
      type: 'object',
      properties: {name: {type: 'string', description: 'the name of the attack, as in the summary (Greataxe, Bite)'}},
      required: ['name'],
    },
    label: args => `looking up the ${text(args['name']) || 'attack'}`,
    run: (args, {character}) => explainAttack(character, text(args['name'])),
  },
  {
    name: 'get_feature',
    description: 'A feature of the character by name (feat, class feature, racial trait, item feature, condition): '
      + 'its description, adjustments and where it comes from.',
    parameters: {
      type: 'object',
      properties: {name: {type: 'string', description: 'the name of the feature (Rage, Power Attack, Fatigued)'}},
      required: ['name'],
    },
    label: args => `reading ${text(args['name']) || 'a feature'}`,
    run: (args, {character}) => findFeature(character, text(args['name'])),
  },
  {
    name: 'get_item',
    description: 'An item of the inventory by name, equipped or not: its slot, weight, cost, description and the '
      + 'features it gives while equipped, with their adjustments.',
    parameters: named('the item'),
    label: args => `reading ${text(args['name']) || 'an item'}`,
    run: (args, {character}) => findItem(character, text(args['name'])),
  },
  {
    name: 'get_adjustment_reference',
    description: 'How features adjust the character, by topic: rules (the shape of a feature, modes, bonus types, '
      + 'formulas, variants: read it before building), paths (everything that can be adjusted), examples (whole '
      + 'features), or all. Read only the topic you need. A wrong path is refused with the closest right one.',
    parameters: {
      type: 'object',
      properties: {topic: {type: 'string', enum: ['rules', 'paths', 'examples', 'all'], description: 'rules when left out'}},
    },
    label: args => `reading how features work${text(args['topic']) && text(args['topic']) !== 'rules' ? ` (${text(args['topic'])})` : ''}`,
    run: args => referenceTopic(text(args['topic']) || 'rules'),
  },

  // play actions: they change the character at once, the player can undo each one
  {
    name: 'take_damage',
    description: 'The character takes damage: temporary hit points go first, then hit points (or nonlethal damage). '
      + 'Gives the hit points before and after and the conditions the character is under now (disabled, dying).',
    parameters: {
      type: 'object',
      properties: {
        amount: {type: 'integer', description: 'the damage, after the player rolled it and took off damage reduction or resistance'},
        nonlethal: {type: 'boolean', description: 'true for nonlethal damage'},
      },
      required: ['amount'],
    },
    changes: true,
    label: args => `taking ${args['amount']} damage`,
    run: (args, {character}) => takeDamage(character, args['amount'], args['nonlethal'] === true),
  },
  {
    name: 'heal',
    description: 'The character heals hit points (a cure spell, a potion), up to its maximum. It heals as much '
      + 'nonlethal damage too.',
    parameters: {type: 'object', properties: {amount: {type: 'integer', description: 'the hit points healed'}}, required: ['amount']},
    changes: true,
    label: args => `healing ${args['amount']}`,
    run: (args, {character}) => heal(character, args['amount']),
  },
  {
    name: 'add_condition',
    description: 'Puts the character under a condition of the rules (Shaken, Fatigued, Prone, Grappled, ...), with '
      + 'everything it does to the numbers. An error lists the conditions there are.',
    parameters: named('the condition, as the rules name it'),
    changes: true,
    label: args => `adding ${text(args['name'])}`,
    run: (args, {character}) => addCondition(character, args['name']),
  },
  {
    name: 'remove_condition',
    description: 'Ends a condition the character is under. Conditions from the rules (dying from hit points, '
      + 'staggered from nonlethal damage) end when what causes them changes, not with this.',
    parameters: named('the condition'),
    changes: true,
    label: args => `removing ${text(args['name'])}`,
    run: (args, {character}) => removeCondition(character, args['name']),
  },
  {
    name: 'set_feature_active',
    description: 'Turns a feature of the character that can be turned on and off on or off (Rage, a buff the '
      + 'player keeps on the sheet). Turning on does not spend a use, call use_feature for that. An error lists the '
      + 'features that turn on and off.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'the feature'},
        active: {type: 'boolean', description: 'true to turn it on, false to turn it off'},
      },
      required: ['name', 'active'],
    },
    changes: true,
    label: args => `turning ${text(args['name'])} ${args['active'] === false ? 'off' : 'on'}`,
    run: (args, {character}) => setFeatureActive(character, args['name'], args['active']),
  },
  {
    name: 'use_feature',
    description: 'Spends uses of a feature with uses per day (rages, channel energy, a wand\'s charges). An error '
      + 'lists the features with uses and how many are left.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'the feature'},
        uses: {type: 'integer', description: 'how many uses to spend, 1 when left out'},
      },
      required: ['name'],
    },
    changes: true,
    label: args => `using ${text(args['name'])}`,
    run: (args, {character}) => useCharges(character, args['name'], args['uses']),
  },
  {
    name: 'set_combat_option',
    description: 'Turns a combat option on or off: Power Attack, Deadly Aim, Two-Weapon Fighting, Fighting '
      + 'Defensively, Total Defense, Combat Expertise. The character needs a feat for most of them.',
    parameters: {
      type: 'object',
      properties: {
        option: {type: 'string', description: 'the option, as named above'},
        on: {type: 'boolean', description: 'true to turn it on, false to turn it off'},
      },
      required: ['option', 'on'],
    },
    changes: true,
    label: args => `${args['on'] === false ? 'turning off' : 'turning on'} ${text(args['option'])}`,
    run: (args, {character}) => setCombatOption(character, args['option'], args['on']),
  },
  {
    name: 'cast_spell',
    description: 'Casts a spell the character knows or prepared: spends its slot (or the prepared spell), rolls '
      + 'spell failure where it applies, and with on_self puts the spell\'s adjustments on the character. Name the '
      + 'caster or the level only when the spell is known more than once.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'the spell'},
        caster: {type: 'string', description: 'the caster it is cast as (cleric, sorcerer), when it is known by more than one'},
        level: {type: 'integer', description: 'the spell level, when it is known at more than one'},
        on_self: {type: 'boolean', description: 'true when the character is a target and the spell changes its numbers (Bless, Shield, Bull\'s Strength)'},
      },
      required: ['name'],
    },
    changes: true,
    label: args => `casting ${text(args['name'])}`,
    run: (args, {character}) => castSpell(character, args['name'], {caster: args['caster'], level: args['level'], onSelf: args['on_self']}),
  },
  {
    name: 'rest',
    description: 'The character rests: a night (8 hours) or a full day of bed rest. Heals, gives back spell slots and '
      + 'uses per day, ends fatigue. Gives what came back.',
    parameters: {
      type: 'object',
      properties: {kind: {type: 'string', enum: ['night', 'bed rest'], description: 'night, or bed rest for a full day'}},
    },
    changes: true,
    label: () => 'resting',
    run: (args, {character}) => rest(character, args['kind']),
  },

  // building: looking a rule up, then adding what it describes
  {
    name: 'look_up_rules',
    description: 'Reads a feat, spell, trait, class (its table and class features), race, archetype, magic item, '
      + 'weapon, armor or gear from aonprd.com or d20pfsrd.com: its rules text word for word, with its page. Look a '
      + 'rule up before building from it or answering about it. A name tries the Archives of Nethys pages of its kind '
      + '(exact names work best), a url reads that page; magic items need a url. It can not search: when it finds '
      + 'nothing, ask the player for a link.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'the name as the rules write it (Power Attack, Cloak of Resistance, Barbarian); an archetype with its class first (Barbarian Invulnerable Rager)'},
        kind: {type: 'string', enum: ruleKinds, description: 'what it is, when known: narrows the pages tried'},
        url: {type: 'string', description: 'a link to its page on aonprd.com or d20pfsrd.com, when the player gave one'},
        focus: {type: 'string', description: 'for a long page (a class), the part you need: "the table row and class features of level 2"'},
      },
    },
    label: args => `looking up ${text(args['name']) || text(args['url']) || 'the rules'}`,
    run: (args, {provider}) => lookUpRule(provider, args),
  },
  {
    name: 'create_feature',
    description: 'Builds a feature from its rules text or the player\'s description and adds it: a condition or '
      + 'buff (Bless, a GM ruling), feat, trait, drawback or special ability. Its adjustments are what the engine '
      + 'applies (get_adjustment_reference). A plain path applies always; a bonus only in a situation is a variant, '
      + 'path[situation]: Improved Grapple is {"cmb[grapple]": 2, "cmd[grapple]": 2}, never {"cmb": 2}; Weapon Focus '
      + '(longsword) {"attackRollBonus[longsword]": 1}. One the player switches on while it applies (a stance, a buff '
      + 'kept up) is can_turn_off with plain paths. A feature that changes no number needs description_only. Checked '
      + 'first: on problems nothing is added, fix them and call again.',
    parameters: {
      type: 'object',
      properties: {
        list: {type: 'string', enum: [...featureLists], description: 'where it goes: conditions for temporary effects and buffs'},
        name: {type: 'string'},
        description: {type: 'string', description: 'what it does, in short, as the sheet shows it'},
        adjustments: {type: 'string', description: 'a JSON object, {"attackRollBonus": {"value": 1, "type": "morale"}}'},
        uses_total: {type: 'integer', description: 'uses per day or encounter'},
        grows: {type: 'string', description: 'a number that grows with the character\'s level, as the rules list it, never a formula of your own: a JSON object of the adjustment path and its value by level, {"hp": {"1": 3, "4": 4, "5": 5}}; the app writes the formula'},
        uses_label: {type: 'string', description: 'rounds per day, uses per day, ...'},
        uses_per: {type: 'string', enum: ['day', 'encounter', 'none']},
        can_turn_off: {type: 'boolean', description: 'the player turns it on and off; conditions always can'},
        description_only: {type: 'string', description: 'only when it changes no number: why'},
        prerequisites: {type: 'string', description: 'a feat\'s prerequisites as its page lists them ("Cha 13, base attack bonus +1, Power Attack", or "none"): checked against the sheet'},
        based_on: {type: 'string', enum: [...basedOnKinds], description: 'looked up (with source_url), the player\'s description, or own knowledge (the player is told to check it)'},
        source_url: {type: 'string'},
      },
      required: ['list', 'name', 'adjustments', 'based_on'],
    },
    changes: true,
    label: args => `building ${text(args['name']) || 'a feature'}`,
    run: (args, {character}) => createFeature(character, args),
  },
  {
    name: 'create_item',
    description: 'Builds an item and adds it to the inventory: gear, weapon, armor, shield or magic item. What it does '
      + 'goes in its features, applied while equipped: a weapon\'s attack is made from damage, critical and attack_kind '
      + '(features "[]" then; ammunition is type other), armor {"ac": {"value": 4, "type": "armor"}, "maxDexBonus": {"value": 3, "mode": "min"}, '
      + '"armorCheckPenalty": -4, "arcaneSpellFailureChance": 25}. Checked like create_feature.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        type: {type: 'string', enum: [...itemTypes]},
        description: {type: 'string'},
        slot: {type: 'string', enum: slots, description: 'held for what is held in the hands'},
        features: {type: 'string', description: 'a JSON array, [{"name": "...", "adjustments": {...}}], "[]" for plain gear'},
        weight: {type: 'number', description: 'in pounds'},
        cost_gp: {type: 'string', description: 'the price of one in gp: quantity multiplies it. 1 gp = 10 sp = 100 cp, so 5 sp is 0.5 and 2 cp 0.02 (\"5 sp\" works too)'},
        quantity: {type: 'integer'},
        hands: {type: 'integer', description: 'hands it takes while held, 2 for a two-handed weapon'},
        proficiency: {type: 'string', description: 'simple, martial or exotic for a weapon'},
        damage: {type: 'string', description: 'a weapon: its damage dice for a medium wielder, "1d8" (its attack is made from these, no features needed)'},
        critical: {type: 'string', description: 'a weapon: "19-20/x2", "x3"'},
        attack_kind: {type: 'string', enum: ['melee', 'ranged', 'thrown'], description: 'a weapon: how it attacks'},
        damage_type: {type: 'string', description: 'a weapon: B, P, S or "P or S"'},
        range: {type: 'integer', description: 'a weapon: its range increment in feet'},
        armor_category: {type: 'string', enum: ['light', 'medium', 'heavy']},
        shield_category: {type: 'string', enum: ['buckler', 'light', 'heavy', 'tower']},
        equip: {type: 'boolean', description: 'equip it as it is added'},
        based_on: {type: 'string', enum: [...basedOnKinds], description: 'as for create_feature'},
        source_url: {type: 'string'},
      },
      required: ['name', 'type', 'features', 'based_on'],
    },
    changes: true,
    label: args => `building ${text(args['name']) || 'an item'}`,
    run: (args, {character}) => createItem(character, args),
  },

  // creating a character, step by step (creation-script.ts)
  {
    name: 'get_creation_step',
    description: 'The creation step the character is at (starting it): its questions, how to help, its tools and '
      + 'what was decided so far. Call it once to start: complete_creation_step gives each next step. Its changes are '
      + 'refused until the player answered (or player_answer quotes their earlier words).',
    label: () => 'reading the next step',
    run: (_, {character, conversation}) => getCreationStep(character, conversation ?? {playerTurns: 0}),
  },
  {
    name: 'complete_creation_step',
    description: 'Completes the creation step once the player answered and its changes are made, with what the player '
      + 'decided (the next steps read it to suggest from). Gives the next step to ask about: do not read it again.',
    parameters: {
      type: 'object',
      properties: {
        step: {type: 'string', description: 'the id of the step being completed'},
        decisions: {type: 'string', description: 'what the player decided at this step, in a sentence or two'},
      },
      required: ['step', 'decisions'],
    },
    changes: true,
    label: () => 'completing the step',
    run: (args, {character, conversation}) => completeCreationStep(character, conversation ?? {playerTurns: 0}, args),
  },
  {
    name: 'offer_point_buy',
    description: 'For a point buy: shows the player your suggested base ability scores (before the race) in the chat, '
      + 'to change and confirm there; the app sets them and completes the step. Call it once: give the scores you or '
      + 'the player have in mind, and raise and lower to fill the rest to the points.',
    parameters: {
      type: 'object',
      properties: {
        budget: {type: 'integer', description: 'the points of the point buy (10, 15, 20, 25)'},
        scores: {type: 'string', description: 'a JSON object of the base scores you suggest or the player set, {"str": 16, "dex": 14}; the ones left out start at 10'},
        raise: {type: 'string', description: 'the abilities to raise as high as the points go, first first ("str, con")'},
        lower: {type: 'string', description: 'the abilities to dump to 7 ("int, cha")'},
      },
      required: ['budget'],
    },
    label: () => 'suggesting a point buy',
    run: (args, {character}) => offerPointBuy(args, character),
  },
  {
    name: 'price_gear',
    description: 'What a kit costs in all and the starting gold left after it. Price every kit with it before suggesting '
      + 'it; never add prices up yourself. A composite bow costs 100 gp more per point of its Strength rating, '
      + 'masterwork adds 300 gp to a weapon and 150 gp to armor.',
    parameters: {
      type: 'object',
      properties: {items: {type: 'string', description: 'a JSON array, [{"name": "Longsword", "cost_gp": 15, "quantity": 1}], cost_gp the price of one in gp: 1 gp = 10 sp = 100 cp, so 5 sp is 0.5 and 2 cp 0.02 (\"5 sp\" works too)'}},
      required: ['items'],
    },
    label: () => 'pricing the gear',
    run: (args, {character}) => priceGear(character, args),
  },
  {
    name: 'get_creation_status',
    description: 'Where creating the character stands: details, race, base scores and their point buy cost, scores '
      + 'with the race, favored class, traits, starting wealth left, and the level up status.',
    label: () => 'checking the character',
    run: (_, {character}) => creationStatus(character),
  },
  {
    name: 'set_character_details',
    description: 'Sets who the character is: name, alignment, deity, description, age, height, weight, favored class '
      + 'and advancement track. Give only what changes.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        alignment: {type: 'string', description: 'LG, NG, CG, LN, N, CN, LE, NE or CE'},
        deity: {type: 'string'},
        description: {type: 'string'},
        age: {type: 'integer'}, height: {type: 'integer', description: 'in inches'}, weight: {type: 'integer', description: 'in pounds'},
        favored_classes: {type: 'string', description: 'the favored class (a half-elf may have two, "Fighter,Rogue")'},
        advancement_track: {type: 'string', enum: ['slow', 'medium', 'fast']},
        starting_gold: {type: 'number', description: 'the starting wealth in gp the first class level brings (rolled, or the class\'s average)'},
      },
    },
    changes: true,
    label: () => 'setting the details',
    run: (args, {character}) => setCharacterDetails(character, args),
  },
  {
    name: 'set_ability_scores',
    description: 'Sets the six base ability scores, before racial modifiers. A point buy is checked against its points.',
    parameters: {
      type: 'object',
      properties: {
        scores: {type: 'string', description: 'a JSON object of all six, {"str": 14, "dex": 12, "con": 14, "int": 10, "wis": 12, "cha": 8}'},
        method: {type: 'string', description: '"point buy 15" (10, 15, 20 or 25), "rolled", or "given" for scores the player already has'},
      },
      required: ['scores', 'method'],
    },
    changes: true,
    label: () => 'setting ability scores',
    // a point buy in a creation is the player's to confirm in the chat (offer_point_buy)
    run: (args, {character}) => /^\s*point/i.test(String(args['method'] ?? '')) && inCreation(character)
      ? {error: 'nothing was changed: a point buy is the player\'s to set, offer_point_buy shows it to them to change and confirm'}
      : setAbilityScores(character, args),
  },
  {
    name: 'set_race',
    description: 'Sets the race from its page (look_up_rules, kind race), replacing the old one: its racial traits as '
      + 'features, the first the racial stats (ability modifiers, speed and size with "mode": "set", languages). A '
      + 'trait giving a feat adds 1 to bonusFeats. Ask for a choice (a +2 to any one ability) first.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        subtype: {type: 'string', description: 'Humanoid (human, orc), ...'},
        features: {type: 'string', description: 'a JSON array of the racial traits'},
        based_on: {type: 'string', enum: ['looked up', 'player description', 'own knowledge']},
        source_url: {type: 'string', description: 'the race page'},
      },
      required: ['name', 'features', 'based_on'],
    },
    changes: true,
    label: args => `setting the race ${text(args['name'])}`,
    run: (args, {character}) => setRace(character, args),
  },

  // leveling up
  {
    name: 'get_level_up_status',
    description: 'What leveling up needs: level and classes, XP and whether a level is due, ability increases owed, '
      + 'feats taken and allowed, skill ranks left and the most per skill, the core classes the app knows. Call it '
      + 'before a level up and after.',
    label: () => 'checking the level up',
    run: (_, {character}) => levelUpStatus(character),
  },
  {
    name: 'add_class_level',
    description: 'Adds one level in a class: the next of a class the character has, a core class (its preset), or '
      + 'another class by hit_die, bab, good_saves, skill_ranks and class_skills from its page. The engine works out '
      + 'bab, saves and hp. features are this level\'s class features from the class page, as for create_feature, '
      + 'each shown through the specialAttack, defensiveAbilities or specialQuality entry it gives (a switched one has '
      + '"active": false on that entry); a number that grows goes in "grows" by level, uses a day in "uses_by_level"; '
      + 'others are refused with how to fix them. Every level after the first needs the hit die the player rolled.',
    parameters: {
      type: 'object',
      properties: {
        class_name: {type: 'string', description: 'Barbarian, Fighter, ...'},
        rolled_hp: {type: 'integer', description: 'what the player rolled on the hit die, for every level but the first'},
        favored_class_bonus: {type: 'string', enum: ['hp', 'skill', 'other'], description: 'for a level in a favored class: +1 hp, +1 skill rank, or another bonus'},
        ability_increase: {type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'], description: 'on every 4th character level'},
        features: {type: 'string', description: 'a JSON array of the class features this level gives, each with "gained_at" (the level of its table row), its adjustments, and "grows" for a number that grows with level (its value by level, as the class table lists it: the app writes the formula), [{"name": "Track", "gained_at": 1, "description": "+1/2 level (min 1) to follow tracks", "adjustments": {"specialQuality": {"name": "Track", "description": "+1/2 level to follow tracks"}}, "grows": {"skills.survival.value[follow tracks]": {"1": 1, "4": 2, "6": 3, "8": 4, "10": 5, "12": 6, "14": 7, "16": 8, "18": 9, "20": 10}}}], "[]" for none (a 1st class level always has some)'},
        based_on: {type: 'string', enum: ['looked up', 'player description', 'own knowledge'], description: 'as for create_feature'},
        source_url: {type: 'string', description: 'the class page'},
        hit_die: {type: 'integer', description: 'not a core class only, as are the four below'},
        bab: {type: 'string', enum: ['full', 'threeQuarters', 'half']},
        good_saves: {type: 'string', description: '"fort,will"'},
        skill_ranks: {type: 'integer', description: 'per level'},
        class_skills: {type: 'string', description: '"climb,intimidate,knowledge (dungeoneering)"'},
        starting_gold: {type: 'number', description: 'not a core class, the character\'s first level: the class\'s average starting wealth in gp (5d6 x 10 is 175)'},
        weapon_proficiencies: {type: 'string', description: 'not a core class, its first level: the weapons of its "Weapon and Armor Proficiency" ("simple, martial"; "simple, hand crossbow, rapier"; "none")'},
        armor_proficiencies: {type: 'string', description: 'not a core class, its first level: the armor and shields ("light, medium, shield"; "none")'},
      },
      required: ['class_name', 'features'],
    },
    changes: true,
    label: args => `adding a level of ${text(args['class_name']) || 'a class'}`,
    run: (args, {character}) => addClassLevel(character, args),
  },
  {
    name: 'set_skill_ranks',
    description: 'Sets the ranks of one or more skills (the total ranks each should have, not how many to add). '
      + 'Checked against the ranks the character has and the most per skill (one per character level).',
    parameters: {
      type: 'object',
      properties: {ranks: {type: 'string', description: 'a JSON object of skills and their ranks, {"climb": 2, "knowledge (dungeoneering)": 1}'}},
      required: ['ranks'],
    },
    changes: true,
    label: () => 'setting skill ranks',
    run: (args, {character}) => setSkillRanks(character, args),
  },
  {
    name: 'choose_ability_increase',
    description: 'Picks the ability an owed ability increase (every 4th character level) raises.',
    parameters: {
      type: 'object',
      properties: {
        ability: {type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha']},
        level: {type: 'integer', description: 'the character level it is for, the first owed one when left out'},
      },
      required: ['ability'],
    },
    changes: true,
    label: args => `raising ${text(args['ability'])}`,
    run: (args, {character}) => chooseAbilityIncrease(character, args),
  },

  // changing what the character has
  {
    name: 'edit_feature',
    description: 'Changes a feature the character has: a feat, trait, condition, class or racial feature, or a feature '
      + 'of an item (name the item). Give only what changes. New adjustments replace the old ones whole: read the '
      + 'feature first (get_feature) and write all of them. Checked like create_feature before it changes.',
    parameters: {
      type: 'object',
      properties: {
        grows: {type: 'string', description: 'a number that grows by level, as the rules table lists it: {"<adjustment path>": {"<level>": <value>, ...}}; the app writes the formula (never write one yourself)'},
        name: {type: 'string', description: 'the feature as it is named now'},
        item: {type: 'string', description: 'the item it is on, for the feature of an item'},
        new_name: {type: 'string'},
        description: {type: 'string'},
        adjustments: {type: 'string', description: 'a JSON object of every adjustment it should have'},
        uses_total: {type: 'integer', description: 'uses per day or encounter, 0 for none'},
        uses_label: {type: 'string'},
        uses_per: {type: 'string', enum: ['day', 'encounter', 'none']},
        can_turn_off: {type: 'boolean'},
      },
      required: ['name'],
    },
    changes: true,
    label: args => `changing ${text(args['name']) || 'a feature'}`,
    run: (args, {character}) => editFeature(character, args),
  },
  {
    name: 'remove_feature',
    description: 'Removes a feature the character has (a feat, a trait, a condition, a feature of an item). A feature '
      + 'another feature gives is changed or removed through that one.',
    parameters: {
      type: 'object',
      properties: {name: {type: 'string'}, item: {type: 'string', description: 'the item it is on, for the feature of an item'}},
      required: ['name'],
    },
    changes: true,
    label: args => `removing ${text(args['name']) || 'a feature'}`,
    run: (args, {character}) => removeFeature(character, args),
  },
  {
    name: 'edit_item',
    description: 'Changes an item in the inventory: its name, description, quantity, weight, cost, slot, whether it is '
      + 'equipped, or its features (a JSON array replacing them all: read the item first and write every one).',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'the item as it is named now'},
        new_name: {type: 'string'},
        description: {type: 'string'},
        quantity: {type: 'integer'},
        weight: {type: 'number'},
        cost_gp: {type: 'string', description: 'the new price of one in gp: 1 gp = 10 sp = 100 cp, so 5 sp is 0.5 and 2 cp 0.02 (\"5 sp\" works too)'},
        slot: {type: 'string', enum: slots},
        equipped: {type: 'boolean'},
        features: {type: 'string', description: 'a JSON array of every feature it should have'},
      },
      required: ['name'],
    },
    changes: true,
    label: args => `changing ${text(args['name']) || 'an item'}`,
    run: (args, {character}) => editItem(character, args),
  },
  {
    name: 'remove_item',
    description: 'Removes an item from the inventory (sold, lost, used up).',
    parameters: named('the item'),
    changes: true,
    label: args => `removing ${text(args['name']) || 'an item'}`,
    run: (args, {character}) => removeItem(character, args),
  },
  {
    name: 'undo_last_change',
    description: 'Takes back the last change to the character (one of your actions, or what the player changed on '
      + 'the sheet), when the player asks you to undo something.',
    changes: true,
    label: () => 'undoing',
    run: (_, {character}) => undoLast(character),
  },
];

// while creating, a change is refused until the player answered its step: an answer they gave before it was asked
// counts when the AI quotes it (creationGate). every tool a step makes its changes with takes it
const GATED_TOOLS = new Set([...CREATION_STEPS.flatMap(step => step.tools), 'complete_creation_step']);
const PLAYER_ANSWER = {
  type: 'string' as const,
  description: 'while creating: the player\'s own words answering this, when they gave them before the step was asked',
};
for (const tool of aiTools) {
  if (GATED_TOOLS.has(tool.name) && tool.parameters) {
    tool.parameters = {...tool.parameters, properties: {...tool.parameters.properties, player_answer: PLAYER_ANSWER}};
  }
}

export const aiToolByName = (name: string): AiTool | undefined => aiTools.find(tool => tool.name === name);

// what the conversation is about: creating the character (no class level yet, or the creation script under way) or
// playing it (questions, play actions, leveling up). every request sends the declarations of the tools it offers, so
// each mode offers only its own: the play actions are of no use while creating, the creation tools none once created.
// reading, looking up, building, editing and undo are offered in both
export type AiMode = 'creation' | 'play';

const inCreation = (character: ApplyCharacterService): boolean => aiModeOf(character.raw()) === 'creation';

export const aiModeOf = (raw: {classLevels?: unknown[], creation?: unknown}): AiMode =>
  raw.creation || !(raw.classLevels || []).length ? 'creation' : 'play';

export const PLAY_ONLY_TOOLS = [
  'take_damage', 'heal', 'add_condition', 'remove_condition', 'set_feature_active', 'use_feature', 'set_combat_option',
  'cast_spell', 'rest',
];
export const CREATION_ONLY_TOOLS = [
  'get_creation_step', 'complete_creation_step', 'offer_point_buy', 'price_gear', 'get_creation_status', 'set_ability_scores', 'set_race',
];

export const aiToolsFor = (mode: AiMode): AiTool[] => {
  const left = mode === 'creation' ? PLAY_ONLY_TOOLS : CREATION_ONLY_TOOLS;
  const tools = aiTools.filter(tool => !left.includes(tool.name));
  if (mode === 'creation') return tools;
  // player_answer is only for the creation's steps
  return tools.map(tool => {
    if (!tool.parameters?.properties?.['player_answer']) return tool;
    const {player_answer, ...properties} = tool.parameters.properties;
    return {...tool, parameters: {...tool.parameters, properties}};
  });
};

// runs a tool the AI asked for. a tool that fails or does not exist gives the AI an error to work with, never throws
export const runAiTool = async (name: string, args: {[name: string]: unknown}, context: AiToolContext): Promise<object> => {
  const tool = aiToolByName(name);
  if (!tool) return {error: `there is no tool ${name}, the tools are ${aiTools.map(t => t.name).join(', ')}`};
  try {
    const result = await tool.run(args || {}, context);
    // a function result is an object for every provider
    return Array.isArray(result) ? {results: result} : result;
  } catch (e) {
    return {error: `${name} failed: ${(e as Error).message}`};
  }
};
