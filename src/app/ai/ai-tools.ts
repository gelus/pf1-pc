import {ApplyCharacterService} from '../apply-character.service';
import {adjustmentReference} from '../rules/adjustment-reference';
import {AiProvider, AiToolDeclaration} from './ai-provider';
import {basedOnKinds, createFeature, createItem, featureLists, itemTypes, slots} from './builders';
import {editFeature, editItem, removeFeature, removeItem} from './editors';
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
}

export interface AiTool extends AiToolDeclaration {
  // what the chat shows while the tool runs ("looking up AC")
  label(args: {[name: string]: unknown}): string;
  // the tool changes the character (a play action): the chat shows what it did, with an undo
  changes?: boolean;
  run(args: {[name: string]: unknown}, context: AiToolContext): object | Promise<object>;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const named = (what: string) => ({type: 'object' as const, properties: {name: {type: 'string' as const, description: what}}, required: ['name']});

export const aiTools: AiTool[] = [
  {
    name: 'get_character_summary',
    description: 'The character sheet in short: race, classes and level, ability scores, hp, AC, saves, attacks, '
      + 'trained skills, active conditions and features, defenses, spells per day. Every number is final, as the sheet '
      + 'shows it. Call it first in a conversation, and again after the player says the character changed.',
    label: () => 'reading the sheet',
    run: (_, {character}) => characterSummary(character),
  },
  {
    name: 'explain_stat',
    description: 'Where a number of the sheet comes from, line by line as its tooltip shows it: every bonus and '
      + 'penalty with the feature it comes from and its bonus type, the ones that do not count (a larger bonus of the '
      + 'same type wins) and situational bonuses (vs. fear). Use it to answer "why is my AC 17".',
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
    description: 'A feature of the character by name (a feat, a class feature, a racial trait, an item\'s feature, '
      + 'a condition): its description, what it adjusts and where it comes from. The adjustments are what the sheet '
      + 'applies, see get_adjustment_reference for how to read them.',
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
    description: 'How features adjust the character in this app: paths, bonus types, modes (set, min, max), '
      + 'formulas and examples. Only needed to read or explain the adjustments of a feature in detail.',
    label: () => 'reading how features work',
    run: () => ({reference: adjustmentReference()}),
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
    description: 'Reads the rules of a feat, spell, trait, magic item, weapon, armor or piece of gear from Archives of '
      + 'Nethys (aonprd.com) or d20pfsrd.com and gives its rules text word for word, with the page it is on. Look a '
      + 'rule up before building something from it, and before answering a rules question about a specific one. With '
      + 'a name it tries the Archives of Nethys pages of that kind (the exact name works best); with a url (from the '
      + 'player) it reads that page. Magic items are only found by a link. It can not search the web: when it finds '
      + 'nothing, ask the player for a link.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'the name as the rules write it (Power Attack, Cloak of Resistance)'},
        kind: {type: 'string', enum: ruleKinds, description: 'what it is, when known: narrows the pages tried'},
        url: {type: 'string', description: 'a link to its page on aonprd.com or d20pfsrd.com, when the player gave one'},
      },
    },
    label: args => `looking up ${text(args['name']) || text(args['url']) || 'the rules'}`,
    run: (args, {provider}) => lookUpRule(provider, args),
  },
  {
    name: 'create_feature',
    description: 'Builds a feature from its rules text or the player\'s description and adds it to the character: a '
      + 'custom condition (a buff like Bless or Inspire Courage, a GM ruling), a feat, a trait, a drawback or a special '
      + 'ability. Its adjustments are what the engine applies (read get_adjustment_reference first for the paths, bonus '
      + 'types and formulas). A plain path applies all the time: a bonus that only applies sometimes (to one combat '
      + 'maneuver, against fear, when charging) must be a variant, path[situation]: Improved Grapple is '
      + '{"cmb[grapple]": 2, "cmd[grapple]": 2}, never {"cmb": 2}. What the sheet can not apply goes in the description. '
      + 'It is checked before it is added: on problems nothing is added, fix them and call again.',
    parameters: {
      type: 'object',
      properties: {
        list: {type: 'string', enum: [...featureLists], description: 'where it goes: conditions for temporary effects and buffs'},
        name: {type: 'string'},
        description: {type: 'string', description: 'what it does, in short, as the player would read it on the sheet'},
        adjustments: {type: 'string', description: 'a JSON object of what it adjusts, {"attackRollBonus": {"value": 1, "type": "morale"}}, "{}" for none'},
        uses_total: {type: 'integer', description: 'uses per day or per encounter, when it has them'},
        uses_label: {type: 'string', description: 'what the uses are called (rounds per day, uses per day)'},
        uses_per: {type: 'string', enum: ['day', 'encounter', 'none'], description: 'when the uses come back'},
        can_turn_off: {type: 'boolean', description: 'true for a feature the player turns on and off (a stance, a toggled ability); conditions always can'},
        based_on: {type: 'string', enum: [...basedOnKinds], description: 'where what you built comes from: looked up (with source_url), the player\'s description, or your own knowledge (the player is told to check it)'},
        source_url: {type: 'string', description: 'the page it was looked up on'},
      },
      required: ['list', 'name', 'adjustments', 'based_on'],
    },
    changes: true,
    label: args => `building ${text(args['name']) || 'a feature'}`,
    run: (args, {character}) => createFeature(character, args),
  },
  {
    name: 'create_item',
    description: 'Builds an item and adds it to the inventory: gear, a weapon, armor, a shield or a magic item. What it '
      + 'does goes in its features, applied while it is equipped: a weapon\'s attack is a melee or ranged adjustment '
      + '(see get_adjustment_reference, Attacks), armor gives {"ac": {"value": 4, "type": "armor"}, "maxDexBonus": '
      + '{"value": 3, "mode": "min"}, "armorCheckPenalty": -4, "arcaneSpellFailureChance": 25}, a cloak of resistance '
      + '+1 {"savingThrowBonus": {"value": 1, "type": "resistance"}}. Checked before it is added, like create_feature.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        type: {type: 'string', enum: [...itemTypes]},
        description: {type: 'string', description: 'what it is and does, in short'},
        slot: {type: 'string', enum: slots, description: 'where it is worn; held for what is held in the hands'},
        features: {type: 'string', description: 'a JSON array of features, [{"name": "...", "adjustments": {...}}], "[]" for plain gear'},
        weight: {type: 'number', description: 'in pounds'},
        cost_gp: {type: 'number'},
        quantity: {type: 'integer'},
        hands: {type: 'integer', description: 'hands it takes while held, 2 for a two-handed weapon'},
        proficiency: {type: 'string', description: 'simple, martial or exotic for a weapon'},
        armor_category: {type: 'string', enum: ['light', 'medium', 'heavy']},
        shield_category: {type: 'string', enum: ['buckler', 'light', 'heavy', 'tower']},
        equip: {type: 'boolean', description: 'true to equip it as it is added, when the player is using it'},
        based_on: {type: 'string', enum: [...basedOnKinds], description: 'where what you built comes from: looked up (with source_url), the player\'s description, or your own knowledge (the player is told to check it)'},
        source_url: {type: 'string', description: 'the page it was looked up on'},
      },
      required: ['name', 'type', 'features', 'based_on'],
    },
    changes: true,
    label: args => `building ${text(args['name']) || 'an item'}`,
    run: (args, {character}) => createItem(character, args),
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
        cost_gp: {type: 'number'},
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

export const aiToolByName = (name: string): AiTool | undefined => aiTools.find(tool => tool.name === name);

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
