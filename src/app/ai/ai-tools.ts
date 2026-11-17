import {ApplyCharacterService} from '../apply-character.service';
import {adjustmentReference} from '../rules/adjustment-reference';
import {AiToolDeclaration} from './ai-provider';
import {characterSummary, explainAttack, explainStat, findFeature} from './character-reader';
import {
  addCondition, castSpell, heal, removeCondition, rest, setCombatOption, setFeatureActive, takeDamage, undoLast, useCharges,
} from './play-actions';

// the tools the AI can call, whichever provider runs it. each one is a declaration the AI reads and a function the
// app runs in the browser. the AI never works a number out itself, it asks the engine, which is what the sheet shows.
// the reading tools only read, the play actions (play-actions.ts) change the character, each one a step of the undo
// history the chat offers to take back

export interface AiToolContext {
  character: ApplyCharacterService;
}

export interface AiTool extends AiToolDeclaration {
  // what the chat shows while the tool runs ("looking up AC")
  label(args: {[name: string]: unknown}): string;
  // the tool changes the character (a play action): the chat shows what it did, with an undo
  changes?: boolean;
  run(args: {[name: string]: unknown}, context: AiToolContext): object;
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
export const runAiTool = (name: string, args: {[name: string]: unknown}, context: AiToolContext): object => {
  const tool = aiToolByName(name);
  if (!tool) return {error: `there is no tool ${name}, the tools are ${aiTools.map(t => t.name).join(', ')}`};
  try {
    const result = tool.run(args || {}, context);
    // a function result is an object for every provider
    return Array.isArray(result) ? {results: result} : result;
  } catch (e) {
    return {error: `${name} failed: ${(e as Error).message}`};
  }
};
