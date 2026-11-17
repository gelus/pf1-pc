import {CombatOption, CombatOptions} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {RuleModule, ruleFeature} from './rule-module';

// the combat options that trade offense for defense (core rulebook, chapter 8, combat):
//  fighting defensively as a standard or full-round action: -4 on attack rolls, +2 dodge bonus to AC until the next
//  turn, +3 instead with 3 or more ranks in acrobatics
//  total defense, a standard action: +4 dodge bonus to AC until the next turn, +6 instead with 3 or more ranks in
//  acrobatics. the character can not attack (not even attacks of opportunity) and can not fight defensively with it
// they are dodge bonuses: they stack with the other dodge bonuses and the character loses them when flat-footed, see
// bonusStackingKey and flatFootedAcIgnoredBonusTypes

// a better dodge bonus for enough ranks in a skill
export interface SkillRanksBonus {
  skill: string;
  ranks: number;
  dodge: number;
}

export interface DefensiveCombatOption {
  option: CombatOption;
  name: string;
  // added to every attack roll
  attackRollBonus?: number;
  // the dodge bonus to AC
  dodge: number;
  // replaces dodge with enough ranks in a skill
  skillRanksBonus?: SkillRanksBonus;
  // what the sheet can not show as a number
  note?: string;
}

export const DEFENSIVE_COMBAT_OPTIONS: DefensiveCombatOption[] = [
  {
    option: 'fightingDefensively',
    name: 'Fighting Defensively',
    attackRollBonus: -4,
    dodge: 2,
    skillRanksBonus: {skill: 'acrobatics', ranks: 3, dodge: 3},
  },
  {
    option: 'totalDefense',
    name: 'Total Defense',
    dodge: 4,
    skillRanksBonus: {skill: 'acrobatics', ranks: 3, dodge: 6},
    note: 'no attacks, not even attacks of opportunity',
  },
];

// fighting defensively and total defense are separate actions, a character takes one of them in a round. turning one
// on turns the other off, and a character saved with both on gets only total defense (the better AC, and it can not
// attack anyway, so the attack penalty of fighting defensively does not matter)
export const EXCLUSIVE_COMBAT_OPTIONS: CombatOption[][] = [['totalDefense', 'fightingDefensively']];

// the options turned off by turning option on
export const excludedCombatOptions = (option: CombatOption): CombatOption[] =>
  EXCLUSIVE_COMBAT_OPTIONS.filter(group => group.includes(option)).flat().filter(other => other !== option);

// the options of a group that apply, the first one on of each group (the groups list the better option first)
const applyingOptions = (options: Partial<CombatOptions> | undefined): Set<CombatOption> => {
  const on = new Set((Object.keys(options || {}) as CombatOption[]).filter(option => options?.[option]));
  for (const group of EXCLUSIVE_COMBAT_OPTIONS) {
    const first = group.find(option => on.has(option));
    for (const option of group) if (option !== first) on.delete(option);
  }
  return on;
};

// the ranks a character has in a skill (or a skill of a family, 'knowledge.arcana')
const skillRanks = (char: Character, skill: string): number => {
  const [name, sub] = skill.split('.');
  const found = sub ? char.skills?.[name]?.subSkills?.[sub] : char.skills?.[name];
  return Number(found?.ranks) || 0;
};

// the dodge bonus an option gives the character
export const defensiveDodgeBonus = (char: Character, option: DefensiveCombatOption): number => {
  const bonus = option.skillRanksBonus;
  return bonus && skillRanks(char, bonus.skill) >= bonus.ranks ? bonus.dodge : option.dodge;
};

// what an option does to the character, for the sheet to show next to it. undefined for an option that is not one
// of these
export const defensiveCombatOptionSummary = (char: Character, option: CombatOption): string | undefined => {
  const defensive = DEFENSIVE_COMBAT_OPTIONS.find(o => o.option === option);
  if (!defensive) return undefined;
  return [
    defensive.attackRollBonus ? `${defensive.attackRollBonus} attack` : '',
    `+${defensiveDodgeBonus(char, defensive)} dodge AC`,
    defensive.note || '',
  ].filter(Boolean).join(', ');
};

// final: the skill ranks are those features gave as well
export const defensiveCombatRule: RuleModule = {
  name: 'defensive combat',
  final(raw, applied) {
    const on = applyingOptions(applied.combatOptions);
    return DEFENSIVE_COMBAT_OPTIONS.filter(o => on.has(o.option)).map(o => ruleFeature(o.name, {
      ac: {value: defensiveDodgeBonus(applied, o), type: 'dodge'},
      ...(o.attackRollBonus ? {attackRollBonus: o.attackRollBonus} : {}),
    }));
  },
};
