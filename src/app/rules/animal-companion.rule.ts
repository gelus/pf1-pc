import {Feature} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {INCREASE_LEVELS, companionLevel} from './companions';
import {babFor, saveFor} from './class-progression';
import {RuleModule, ruleFeature} from './rule-module';

// an animal companion (Core Rulebook, chapter 3, druid: animal companions), for any class that grants one (a druid's
// nature bond, a ranger's hunter's bond, a cavalier's or paladin's mount): its statistics by its effective druid level
// (rules/companions.ts, companionLevel: the master class level with the class feature's offset). its creature (a
// wolf, a horse: its starting size, speeds, attacks, ability scores) is its race and scores, its growth at 4th or 7th
// a racial trait from that level (Feature.atLevel)
//  - its Hit Dice by level (the one column that is not a formula); from them, as an animal's: d8 hit points (their
//    average, with its Con), 3/4 base attack bonus, good Fortitude and Reflex saves, a skill rank and half a feat a HD
//  - +2 natural armor and +1 Str and Dex every 3 levels, a bonus trick every 3 levels and one at 1st
//  - an ability score increase at 4th, 9th, 14th and 19th (the player's pick, CompanionLink.increases)
//  - link and share spells, evasion at 3rd, devotion at 6th, multiattack at 9th, improved evasion at 15th

// its Hit Dice at each effective druid level, 1st to 20th
const HIT_DICE = [2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 12, 12, 13, 14, 15, 15, 16];
const CLASS_SKILLS = ['acrobatics', 'climb', 'escape artist', 'fly', 'intimidate', 'perception', 'stealth', 'survival', 'swim'];

export const COMPANION_ABILITY_NAMES = (): string[] => ABILITIES.map(a => a.name);
const ABILITIES: {level: number, name: string, shownIn: 'specialQuality' | 'defensiveAbilities', description: string}[] = [
  {level: 1, name: 'Link', shownIn: 'specialQuality', description: 'Its master handles it as a free action (a move action to push it), with +4 on wild empathy and Handle Animal checks with it.'},
  {level: 1, name: 'Share Spells', shownIn: 'specialQuality', description: 'Its master may cast a spell with a target of "You" on it, and spells on its master may affect it within 5 feet.'},
  {level: 3, name: 'Evasion', shownIn: 'defensiveAbilities', description: 'No damage on a successful Reflex save for half.'},
  {level: 6, name: 'Devotion', shownIn: 'defensiveAbilities', description: '+4 morale bonus on Will saves against enchantment spells and effects.'},
  {level: 9, name: 'Multiattack', shownIn: 'specialQuality', description: 'Multiattack as a bonus feat with three or more natural attacks; otherwise a second attack with its primary natural weapon at -5.'},
  {level: 15, name: 'Improved Evasion', shownIn: 'defensiveAbilities', description: 'No damage on a successful Reflex save for half, half on a failed one.'},
];

export const animalCompanionHitDice = (level: number): number => HIT_DICE[Math.min(20, Math.max(1, level)) - 1];

export const animalCompanionFeatures = (raw: Character): Feature[] => {
  const link = raw.master;
  if ((link?.kind !== 'animal companion' && link?.kind !== 'mount') || !link.copy) return [];
  const level = companionLevel(link);
  if (level < 1) return [];
  const hd = animalCompanionHitDice(level);
  const thirds = Math.floor(level / 3);
  const features: Feature[] = [
    ruleFeature(`${hd} Hit Dice (animal)`, {
      // the average of its d8s with its Con a Hit Die, worked out once its Con is final
      hp: {value: `floor(${hd} * 4.5) + ${hd} * {mod:abilityScores.con}`, mode: 'set'},
      bab: {value: babFor('threeQuarters', hd), mode: 'set'},
      'saves.fort': {value: saveFor(true, hd), mode: 'set'},
      'saves.ref': {value: saveFor(true, hd), mode: 'set'},
      'saves.will': {value: saveFor(false, hd), mode: 'set'},
      bonusSkillRanks: hd,
      bonusFeats: Math.floor((hd + 1) / 2),
      ...Object.fromEntries(CLASS_SKILLS.map(s => [`skills.${s}.classSkill`, true])),
    } as Feature['adjustments']),
  ];
  if (thirds) {
    features.push(ruleFeature(`${link.kind} (level ${level})`, {
      ac: {value: 2 * thirds, type: 'natural armor increase'}, 'abilityScores.str': thirds, 'abilityScores.dex': thirds,
    } as Feature['adjustments']));
  }
  // the ability score increases the levels gave, as the player picked them
  const increases = (link.increases || []).slice(0, INCREASE_LEVELS.filter(l => l <= level).length);
  if (increases.length) {
    const raised: {[path: string]: number} = {};
    for (const ability of increases) raised[`abilityScores.${ability}`] = (raised[`abilityScores.${ability}`] || 0) + 1;
    features.push(ruleFeature('ability score increases', raised as Feature['adjustments']));
  }
  const entries: {[list: string]: Feature[]} = {specialQuality: [new Feature({id: 'rule:companion:tricks', name: `Bonus Tricks (${thirds + 1})`,
    description: `${thirds + 1} tricks of Handle Animal on top of those its Int allows, taught at no check.`, adjustments: {}})]};
  // the abilities the class feature granting it takes away (a cavalier's mount has no share spells)
  const without = new Set((link.without || []).map(w => w.trim().toLowerCase()));
  for (const ability of ABILITIES.filter(a => a.level <= level && !without.has(a.name.toLowerCase()))) {
    (entries[ability.shownIn] ??= []).push(new Feature({id: `rule:companion:${ability.name}`, name: ability.name,
      description: ability.description, adjustments: {}}));
  }
  features.push(ruleFeature(`${link.kind} abilities`, entries as Feature['adjustments']));
  return features;
};

export const animalCompanionRule: RuleModule = {
  name: 'animal companion',
  base: raw => animalCompanionFeatures(raw),
};
