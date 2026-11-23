import {Feature} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {masterClassLevel} from './companions';
import {RuleModule, ruleFeature} from './rule-module';

// a familiar (Core Rulebook, chapter 3, arcane bond: familiars), for any class that grants one: what it takes from its
// master (rules/companions.ts, its copy of the master) and what its master class level gives it. the creature itself
// (a cat, a raven: its size, speeds, natural attacks, senses and ability scores) is its race and scores
//  - hit points: half its master's total, rounded down
//  - base attack bonus: its master's
//  - saving throws: its master's base saves where they are better than its own
//  - skills: its master's ranks where they are better than its own, Acrobatics, Climb, Fly, Perception, Stealth and
//    Swim its class skills
//  - by master class level (the levels of every class that grants it, stacked): a natural armor bonus of +1 a two
//    levels and an Int of 5 + as much, and its abilities as the levels come

// the abilities of a familiar, the master class level each comes at, where the sheet lists it and what it does
const ABILITIES: {level: number, name: string, shownIn: Feature['shownIn'], description: string}[] = [
  {level: 1, name: 'Alertness', shownIn: 'specialQuality', description: 'While the familiar is within arm\'s reach, its master gains the Alertness feat.'},
  {level: 1, name: 'Improved Evasion', shownIn: 'defensiveAbilities', description: 'No damage on a successful Reflex save for half, half on a failed one.'},
  {level: 1, name: 'Share Spells', shownIn: 'specialQuality', description: 'Its master may cast a spell with a target of "You" on it, and spells on its master may affect it within 5 feet.'},
  {level: 1, name: 'Empathic Link', shownIn: 'specialQuality', description: 'A telepathic link with its master to 1 mile: they share emotions, not words.'},
  {level: 3, name: 'Deliver Touch Spells', shownIn: 'specialAttack', description: 'It delivers its master\'s touch spells, as the master would.'},
  {level: 5, name: 'Speak with Master', shownIn: 'specialQuality', description: 'It and its master speak verbally as if sharing a language, others can not understand it without magic.'},
  {level: 7, name: 'Speak with Animals of Its Kind', shownIn: 'specialQuality', description: 'It communicates with animals of about its kind.'},
  {level: 11, name: 'Spell Resistance', shownIn: 'defensiveAbilities', description: 'Spell resistance of its master class level + 5.'},
  {level: 13, name: 'Scry on Familiar', shownIn: 'specialQuality', description: 'Once a day its master may scry on it, as the spell scrying.'},
];
const CLASS_SKILLS = ['acrobatics', 'climb', 'fly', 'perception', 'stealth', 'swim'];

// a skill's path by the name the copy keeps it under: "perception", "craft (alchemy)"
const skillPath = (name: string): string => {
  const family = /^(\w+) \((.+)\)$/.exec(name);
  return family ? `skills.${family[1]}.subSkills.${family[2]}.value` : `skills.${name}.value`;
};
const ownRanks = (raw: Character, name: string): number => {
  const family = /^(\w+) \((.+)\)$/.exec(name);
  return Number(family ? raw.skills?.[family[1]]?.subSkills?.[family[2]]?.ranks : raw.skills?.[name]?.ranks) || 0;
};

export const familiarFeatures = (raw: Character): Feature[] => {
  const link = raw.master;
  if (link?.kind !== 'familiar' || !link.copy) return [];
  const copy = link.copy;
  const level = masterClassLevel(link);
  const step = Math.ceil(Math.max(1, level) / 2);
  const features: Feature[] = [
    // from its master
    ruleFeature(`half ${copy.name}'s hit points`, {hp: {value: Math.floor(copy.hp / 2), mode: 'set'}}),
    ruleFeature(`${copy.name}'s base attack bonus`, {bab: {value: copy.bab, mode: 'set'}}),
    ruleFeature(`${copy.name}'s base saves`, {
      'saves.fort': {value: copy.baseSaves.fort, mode: 'max'}, 'saves.ref': {value: copy.baseSaves.ref, mode: 'max'},
      'saves.will': {value: copy.baseSaves.will, mode: 'max'},
    }),
    ruleFeature('familiar class skills', Object.fromEntries(CLASS_SKILLS.map(s => [`skills.${s}.classSkill`, true]))),
  ];
  // the master's ranks where better, with the +3 of a class skill the familiar's own ranks would not have given
  const skills: Feature['adjustments'] = {};
  for (const [name, ranks] of Object.entries(copy.skillRanks)) {
    const own = ownRanks(raw, name);
    if (ranks <= own) continue;
    const classSkill = CLASS_SKILLS.includes(name) && own === 0 ? 3 : 0;
    (skills as any)[skillPath(name)] = ranks - own + classSkill;
  }
  if (Object.keys(skills).length) features.push(ruleFeature(`${copy.name}'s skill ranks`, skills));
  if (level >= 1) {
    features.push(ruleFeature(`familiar (master class level ${level})`, {
      ac: {value: step, type: 'natural armor increase'},
      'abilityScores.int': {value: 5 + step, mode: 'set'},
      ...(level >= 11 ? {spellResistance: {value: level + 5, mode: 'max'}} : {}),
    }));
    // its abilities, as the entries of the sheet's lists (a rule's feature is listed by what it gives)
    const entries: {[list: string]: Feature[]} = {};
    for (const ability of ABILITIES.filter(a => a.level <= level)) {
      (entries[ability.shownIn!] ??= []).push(new Feature({id: `rule:familiar:${ability.name}`, name: ability.name,
        description: ability.description, adjustments: {}}));
    }
    features.push(ruleFeature('familiar abilities', entries as Feature['adjustments']));
  }
  return features;
};

export const familiarRule: RuleModule = {
  name: 'familiar',
  base: raw => familiarFeatures(raw),
};
