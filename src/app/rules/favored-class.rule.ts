import {Adjustments, Feature, FavoredClassOption} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {isFavoredClassLevel} from './class-progression';
import {RuleModule, ruleFeature} from './rule-module';
import {withChoices} from '../utils/choices';

// the alternate favored class bonuses of a race (Advanced Race Guide and the race pages): a favored class level picks
// one of its race's options (ClassLevel.favoredClassOption) instead of +1 hp or +1 skill rank. each option is data on
// the race, what one pick adjusts, so no race or option is known to the app
//  - the picks of an option add up: a number of it times the times it was picked, fractions included. the rules round
//    the total down ("+1/4 caster level" picked three times is +0, four times +1), toward 0 for a penalty
//  - what is not a number (a text, a flag) is given once, by the first pick
//  - the option is listed in the special qualities with how many times it was picked, its fraction so far shown
//  - an option with choices (option.choices: the energy a resistance is against) is filled with each level's picks
//    (ClassLevel.favoredClassChoices), and the levels with the same picks add up together: a gnome shifter's ten picks
//    of cold resistance, then fire, are resistance 10 to cold and so many to fire. a level that hasn't picked adds nothing
// hp and skill ranks picked this way are those of class-progression.ts (favoredClassBonuses), not here

const isObject = (value: unknown): value is {[key: string]: unknown} =>
  !!value && typeof value === 'object' && !Array.isArray(value);

// the times each option of the race was picked, on favored class levels, with the same picks of its choices
export const favoredClassPicks = (raw: Character): {option: FavoredClassOption, picks: number, chosen: {[choice: string]: string}}[] => {
  const options = raw.race?.favoredClassOptions || [];
  const groups = new Map<string, {option: FavoredClassOption, picks: number, chosen: {[choice: string]: string}}>();
  for (const entry of raw.classLevels || []) {
    if (entry.favoredClassBonus !== 'other' || !entry.favoredClassOption || !isFavoredClassLevel(raw, entry)) continue;
    const option = options.find(o => o.id === entry.favoredClassOption);
    if (!option) continue;
    const chosen = Object.fromEntries((option.choices || []).map(choice => [choice.id, String(entry.favoredClassChoices?.[choice.id] ?? '').trim()]));
    if (Object.values(chosen).some(pick => !pick)) continue;
    const key = `${option.id}|${JSON.stringify(chosen).toLowerCase()}`;
    const group = groups.get(key) ?? {option, picks: 0, chosen};
    group.picks++;
    groups.set(key, group);
  }
  return [...groups.values()];
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
  base: (raw) => favoredClassPicks(raw).map(({option, picks, chosen}) => {
    const named = Object.values(chosen).join(', ');
    const label = `Favored class (${option.class}): ${option.name || option.description}${named ? ` (${named})` : ''}`;
    const filled = withChoices({adjustments: option.adjustments}, chosen).adjustments;
    const {adjustments, fractions} = favoredClassAdjustments({...option, adjustments: filled}, picks);
    // listed on the sheet: the bonus, the times it was picked, the fraction of a point toward the next one
    const entry = new Feature({
      id: `favored-class:${option.id}${named ? `:${named.toLowerCase()}` : ''}`,
      name: `Favored class bonus (${option.class}${named ? `, ${named}` : ''})${picks > 1 ? ` x${picks}` : ''}`,
      description: `${option.description}${picks > 1 ? `, picked ${picks} times` : ''}${fractions.length ? ` (so far ${fractions.join(', ')}, rounded down)` : ''}`,
      adjustments: {},
    });
    return ruleFeature(label, {...adjustments, specialQuality: entry} as Adjustments);
  }),
};
