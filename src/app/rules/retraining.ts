import {Character} from '../utils/character.class';
import {characterLevel} from '../utils/classlevel.class';

// retraining (Ultimate Campaign, chapter 2, downtime: retraining): trading a choice the character made for another, in
// days of training at 10 gp x the character's level a day. the app says how long and what it costs and never holds
// the change back (the table decides), and the gold is paid only when the player says so (payGold). what each kind
// takes, as the rules give it for any class: a choice of a class (which rage powers, which domains) is a class feature
// whatever its class, and the classes whose levels retrain faster into each other ("synergy") are on the rules page,
// not here

// the rules page (the Ultimate Campaign text on d20pfsrd, read 2026-11-22): what a table changes, its class-pair
// synergy for class levels and its per-class list of class features, read there rather than kept here
export const RETRAINING_RULES_URL = 'https://www.d20pfsrd.com/basics-ability-scores/more-character-options/retraining/';

export type RetrainKind = 'feat' | 'class feature' | 'ability increase' | 'skill ranks' | 'hit points' | 'spells known'
  | 'class level' | 'archetype' | 'racial trait' | 'language';
export const RETRAIN_KINDS: RetrainKind[] = ['feat', 'class feature', 'ability increase', 'skill ranks', 'hit points',
  'spells known', 'class level', 'archetype', 'racial trait', 'language'];

// what a retraining is about, for its days: the class features it trades (an archetype's, a bloodline's powers), the
// level of the new spell, whether the classes have synergy, whether no trainer is to be had (twice the days)
export interface RetrainDetail {
  features?: number;
  spellLevel?: number;
  synergy?: boolean;
  npcClass?: boolean;
  noTrainer?: boolean;
}

interface KindRule {
  days: (detail: RetrainDetail) => number;
  // the rules of it in short, for the player
  rules: string;
  // a trainer is needed: without one the GM may allow it at twice the days
  trainer?: boolean;
}

const RULES: {[kind in RetrainKind]: KindRule} = {
  'feat': {days: () => 5, trainer: true,
    rules: 'a feat for another the character qualifies for; a bonus feat a class feature gives becomes one that feature allows'},
  'class feature': {days: d => 5 * Math.max(1, d.features ?? 1), trainer: true,
    rules: 'a choice of a class feature (a rage power, a talent, a hex, a domain, a school) for another of the same list at that level, 5 days a feature'},
  'ability increase': {days: () => 5,
    rules: 'the +1 of a 4th, 8th, 12th, 16th or 20th level moved to another ability'},
  'skill ranks': {days: () => 5,
    rules: 'up to the Intelligence bonus in ranks (at least 1) moved to other skills'},
  'hit points': {days: () => 3, trainer: true,
    rules: '+1 maximum hit point, while the hit points are below the most the hit dice give'},
  'spells known': {days: d => (d.spellLevel ?? 1) > 0 ? 2 * (d.spellLevel ?? 1) : 1, trainer: true,
    rules: 'a spontaneous caster\'s spell known for another of the same level on its list, 2 days a spell level (1 for a cantrip or orison)'},
  'class level': {days: d => d.npcClass ? 3 : d.synergy ? 5 : 7, trainer: true,
    rules: 'the highest level of a class for a level of another (5 days between classes with synergy, 3 from an NPC class); its feat and ability increase stay, they retrain on their own'},
  'archetype': {days: d => 5 * Math.max(1, d.features ?? 1), trainer: true,
    rules: 'taking or giving up an archetype, 5 days for each class feature it changes; swapping one for another is two retrainings'},
  'racial trait': {days: () => 20, trainer: true,
    rules: 'an alternate racial trait for another that replaces the same standard trait, 20 days'},
  'language': {days: () => 20,
    rules: 'a new language, 20 days, at most 1 + the Intelligence bonus times'},
};

export interface RetrainQuote {
  kind: RetrainKind;
  days: number;
  // in gp
  cost: number;
  rules: string;
  notes: string[];
}

// how long a retraining takes and what it costs the character, with what the rules say of it
export const retrainQuote = (char: Pick<Character, 'classLevels'>, kind: RetrainKind, detail: RetrainDetail = {}): RetrainQuote => {
  const rule = RULES[kind];
  const base = rule.days(detail);
  const days = rule.trainer && detail.noTrainer ? base * 2 : base;
  const level = Math.max(1, characterLevel(char));
  const notes = [
    ...(rule.trainer ? [detail.noTrainer ? 'without a trainer: twice the days (the GM decides)' : 'with a trainer of the class at least a level higher (without one, the GM may allow twice the days)'] : []),
    ...(kind === 'class level' && !detail.synergy && !detail.npcClass ? [`5 days instead if the two classes have synergy (its table: ${RETRAINING_RULES_URL})`] : []),
    'the GM may make it up to 50% cheaper or dearer where it is trained',
  ];
  return {kind, days, cost: 10 * level * days, rules: rule.rules, notes};
};

export const retrainKindOf = (value: unknown): RetrainKind | undefined => {
  const said = String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/s$/, '');
  return RETRAIN_KINDS.find(kind => kind.replace(/s$/, '') === said || kind === said);
};
