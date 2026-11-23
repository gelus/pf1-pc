import {Feature} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {CompanionLink, companionLevel, increaseLevelsOf} from './companions';
import {saveFor} from './class-progression';
import {unmetPrerequisitesOf} from './prerequisites';
import {RuleModule, ruleFeature} from './rule-module';

// an eidolon (Advanced Player's Guide, summoner; Pathfinder Unchained, unchained summoner), by its summoner level
// (rules/companions.ts, companionLevel). its tables as d20pfsrd gives them (read 2026-11-23): the two summoners' share
// every column but the evolution pool. its base form (biped, quadruped, serpentine; and an Unchained eidolon's subtype)
// is its race: its starting statistics, its free evolutions (cost 0) and the evolutions its subtype gains at set levels
// (Feature.atLevel). its other evolutions are racial traits too, each with its cost (Feature.cost) from its pool
//  - its Hit Dice by level, and from them as an outsider's: d10 hit points (their average, with its Con), a base
//    attack bonus of its Hit Dice, the good saves of its base form (CompanionLink.goodSaves) and a poor one, 6 + Int
//    skill ranks a Hit Die, a feat every two Hit Dice
//  - an armor bonus (natural armor) and a Str/Dex bonus of half of it, by level
//  - darkvision, link and share spells; evasion at 2nd, devotion at 6th, multiattack at 9th, improved evasion at 14th;
//    an ability score increase at 5th, 10th and 15th (CompanionLink.increases)
//  - an evolution pool and a most natural attacks by level, which its evolutions are held to (eidolonWarnings)

const HIT_DICE = [1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 12, 12, 13, 14, 15, 15];
const ARMOR_BONUS = [0, 2, 2, 2, 4, 4, 6, 6, 6, 8, 8, 10, 10, 10, 12, 12, 14, 14, 14, 16];
const POOL = [3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 25, 26];
const POOL_UNCHAINED = [1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 12, 12, 13, 14, 15, 15];
const MAX_ATTACKS = [3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7];
const CLASS_SKILLS = ['bluff', 'craft', 'knowledge.subSkills.planes', 'perception', 'sense motive', 'stealth'];
const SAVES = ['fort', 'ref', 'will'] as const;

const ABILITIES: {level: number, name: string, shownIn: 'specialQuality' | 'defensiveAbilities', description: string}[] = [
  {level: 1, name: 'Link', shownIn: 'specialQuality', description: 'Its summoner and it communicate telepathically; its summoner may also issue it commands as a free action.'},
  {level: 1, name: 'Share Spells', shownIn: 'specialQuality', description: 'Its summoner may cast a spell with a target of "You" on it, and spells on its summoner may affect it within 5 feet.'},
  {level: 2, name: 'Evasion', shownIn: 'defensiveAbilities', description: 'No damage on a successful Reflex save for half.'},
  {level: 6, name: 'Devotion', shownIn: 'defensiveAbilities', description: '+4 morale bonus on Will saves against enchantment spells and effects.'},
  {level: 9, name: 'Multiattack', shownIn: 'specialQuality', description: 'Multiattack as a bonus feat with three or more natural attacks; otherwise a second attack with its primary natural weapon at -5.'},
  {level: 14, name: 'Improved Evasion', shownIn: 'defensiveAbilities', description: 'No damage on a successful Reflex save for half, half on a failed one.'},
];

const at = (column: number[], level: number): number => column[Math.min(20, Math.max(1, level)) - 1];
export const eidolonHitDice = (level: number): number => at(HIT_DICE, level);
export const evolutionPool = (link: CompanionLink | undefined): number => at(link?.unchained ? POOL_UNCHAINED : POOL, companionLevel(link));
export const maxAttacks = (level: number): number => at(MAX_ATTACKS, level);

export const eidolonFeatures = (raw: Character): Feature[] => {
  const link = raw.master;
  if (link?.kind !== 'eidolon' || !link.copy) return [];
  const level = companionLevel(link);
  if (level < 1) return [];
  const hd = eidolonHitDice(level);
  const armor = at(ARMOR_BONUS, level);
  const good = new Set(link.goodSaves || []);
  const features: Feature[] = [
    ruleFeature(`${hd} Hit Dice (eidolon)`, {
      // the average of its d10s with its Con a Hit Die, worked out once its Con is final
      hp: {value: `floor(${hd} * 5.5) + ${hd} * {mod:abilityScores.con}`, mode: 'set'},
      bab: {value: hd, mode: 'set'},
      ...Object.fromEntries(SAVES.map(save => [`saves.${save}`, {value: saveFor(good.has(save), hd), mode: 'set'}])),
      bonusSkillRanks: `${hd} * max(1, 6 + {mod:abilityScores.int})`,
      bonusFeats: Math.floor((hd + 1) / 2),
      'senses.darkvision': 60,
      ...Object.fromEntries(CLASS_SKILLS.map(s => [`skills.${s}.classSkill`, true])),
    } as Feature['adjustments']),
  ];
  if (armor) {
    features.push(ruleFeature(`eidolon (level ${level})`, {
      ac: {value: armor, type: 'natural armor increase'}, 'abilityScores.str': armor / 2, 'abilityScores.dex': armor / 2,
    } as Feature['adjustments']));
  }
  const increases = (link.increases || []).slice(0, increaseLevelsOf(link).filter(l => l <= level).length);
  if (increases.length) {
    const raised: {[path: string]: number} = {};
    for (const ability of increases) raised[`abilityScores.${ability}`] = (raised[`abilityScores.${ability}`] || 0) + 1;
    features.push(ruleFeature('ability score increases', raised as Feature['adjustments']));
  }
  const without = new Set((link.without || []).map(w => w.trim().toLowerCase()));
  const entries: {[list: string]: Feature[]} = {};
  for (const ability of ABILITIES.filter(a => a.level <= level && !without.has(a.name.toLowerCase()))) {
    (entries[ability.shownIn] ??= []).push(new Feature({id: `rule:eidolon:${ability.name}`, name: ability.name,
      description: ability.description, adjustments: {}}));
  }
  features.push(ruleFeature('eidolon abilities', entries as Feature['adjustments']));
  return features;
};

// its evolutions: its racial traits with a cost (its base form's free ones cost 0)
export const evolutionsOf = (raw: Character): Feature[] => (raw.race?.features || []).filter(f => f.cost !== undefined);

// what the rules of evolutions would have the player know, for any evolution (never a refusal): its points spent
// against its pool (all of them are spent at each level), its natural attacks against its most (an Unchained
// eidolon's weapon attacks count too), an evolution taken before its level, one missing what it requires
export const eidolonWarnings = (raw: Character, applied: Character): string[] => {
  const link = raw.master;
  if (link?.kind !== 'eidolon' || !link.copy) return [];
  const level = companionLevel(link);
  const warnings: string[] = [];
  if (!(link.goodSaves || []).length) warnings.push(`${raw.name} has no good saves: give those of its base form (a biped's Fortitude and Will)`);
  const evolutions = evolutionsOf(raw);
  const spent = evolutions.reduce((sum, f) => sum + (Number(f.cost) || 0), 0);
  const pool = evolutionPool(link);
  if (spent > pool) warnings.push(`its evolutions cost ${spent} points, its pool at level ${level} is ${pool}`);
  else if (spent < pool) warnings.push(`${pool - spent} of its ${pool} evolution points are not spent (the rules spend them all at each level)`);
  const attacks = [...(applied.melee || []), ...(applied.ranged || [])].reduce((sum, a) => sum + (a.type === 'natural'
    ? Math.max(1, Number(a.count) || 1) : link.unchained ? (a.result?.attackBonuses?.length ?? 1) : 0), 0);
  if (attacks > maxAttacks(level)) warnings.push(`${attacks} ${link.unchained ? 'attacks' : 'natural attacks'}, its most at level ${level} is ${maxAttacks(level)}`);
  for (const evolution of evolutions) {
    if ((Number(evolution.atLevel) || 0) > level) warnings.push(`${evolution.name} is taken at summoner level ${evolution.atLevel}, the eidolon is level ${level}`);
    const unmet = evolution.prerequisites ? unmetPrerequisitesOf(applied, evolution.prerequisites) : [];
    if (unmet.length) warnings.push(`${evolution.name} requires ${unmet.join('; ')}`);
  }
  return warnings;
};

export const eidolonRule: RuleModule = {
  name: 'eidolon',
  base: raw => eidolonFeatures(raw),
};
