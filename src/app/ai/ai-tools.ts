import {ApplyCharacterService} from '../apply-character.service';
import {adjustmentReference} from '../rules/adjustment-reference';
import {AiToolDeclaration} from './ai-provider';
import {characterSummary, explainAttack, explainStat, findFeature} from './character-reader';

// the tools the AI can call, whichever provider runs it. each one is a declaration the AI reads and a function the
// app runs in the browser. these only read the character: the AI never works a number out itself, it asks the engine,
// which is what the sheet shows

export interface AiToolContext {
  character: ApplyCharacterService;
}

export interface AiTool extends AiToolDeclaration {
  // what the chat shows while the tool runs ("looking up AC")
  label(args: {[name: string]: unknown}): string;
  run(args: {[name: string]: unknown}, context: AiToolContext): object;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

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
