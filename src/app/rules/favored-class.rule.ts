import {Adjustments, Feature, FavoredClassOption} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {isFavoredClassLevel} from './class-progression';
import {RuleModule, ruleFeature} from './rule-module';

// the alternate favored class bonuses of a race (Advanced Race Guide and the race pages): a favored class level picks
// one of its race's options (ClassLevel.favoredClassOption) instead of +1 hp or +1 skill rank. each option is data on
// the race, what one pick adjusts, so no race or option is known to the app
//  - the picks of an option add up: a number of it times the times it was picked, fractions included. the rules round
//    the total down ("+1/4 caster level" picked three times is +0, four times +1), toward 0 for a penalty
//  - what is not a number (a text, a flag) is given once, by the first pick
//  - the option is listed in the special qualities with how many times it was picked, its fraction so far shown
// hp and skill ranks picked this way are those of class-progression.ts (favoredClassBonuses), not here

const isObject = (value: unknown): value is {[key: string]: unknown} =>
  !!value && typeof value === 'object' && !Array.isArray(value);

// the times each option of the race was picked, on favored class levels
export const favoredClassPicks = (raw: Character): {option: FavoredClassOption, picks: number}[] => {
  const options = raw.race?.favoredClassOptions || [];
  const counts = new Map<string, number>();
  for (const entry of raw.classLevels || []) {
    if (entry.favoredClassBonus !== 'other' || !entry.favoredClassOption || !isFavoredClassLevel(raw, entry)) continue;
    counts.set(entry.favoredClassOption, (counts.get(entry.favoredClassOption) || 0) + 1);
  }
  return options.filter(option => counts.has(option.id)).map(option => ({option, picks: counts.get(option.id)!}));
};

const roundDown = (total: number): number => (total < 0 ? Math.ceil(total - 1e-9) : Math.floor(total + 1e-9));

// what the picks of an option adjust in all, with the totals before rounding (to show how far the next point is)
export const favoredClassAdjustments = (option: FavoredClassOption, picks: number): {adjustments: Adjustments, fractions: string[]} => {
  const adjustments: {[path: string]: unknown} = {};
  const fractions: string[] = [];
  for (const [path, given] of Object.entries(option.adjustments || {})) {
    const wrapped = isObject(given) && 'value' in given;
    const value = wrapped ? (given as {value: unknown}).value : given;
    if (typeof value !== 'number') {
      adjustments[path] = given;
      continue;
    }
    const total = value * picks;
    const whole = roundDown(total);
    if (total !== whole) fractions.push(`${path} ${Math.round(total * 100) / 100}`);
    if (whole) adjustments[path] = wrapped ? {...(given as object), value: whole} : whole;
  }
  return {adjustments: adjustments as Adjustments, fractions};
};

export const favoredClassRule: RuleModule = {
  name: 'favored class',
  base: (raw) => favoredClassPicks(raw).map(({option, picks}) => {
    const label = `Favored class (${option.class}): ${option.name || option.description}`;
    const {adjustments, fractions} = favoredClassAdjustments(option, picks);
    // listed on the sheet: the bonus, the times it was picked, the fraction of a point toward the next one
    const entry = new Feature({
      id: `favored-class:${option.id}`, name: `Favored class bonus (${option.class})${picks > 1 ? ` x${picks}` : ''}`,
      description: `${option.description}${picks > 1 ? `, picked ${picks} times` : ''}${fractions.length ? ` (so far ${fractions.join(', ')}, rounded down)` : ''}`,
      adjustments: {},
    });
    return ruleFeature(label, {...adjustments, specialQuality: entry} as Adjustments);
  }),
};
