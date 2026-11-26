import {Character} from '../utils/character.class';
import {ClassLevel, featureKey} from '../utils/classlevel.class';
import {Feature, FeaturePicks, LevelPick} from '../interfaces/character.interface';

// a class feature the player picks for again as the class levels: a fighter's weapon training (a weapon group at 5th,
// another at 9th, every earlier one +1), a ranger's favored enemy (another at 5th, and +2 to any one of them). each
// level that gives a pick keeps it (ClassLevel.picks, by the feature's name), so retraining and a level up work on
// levels as they do. the feature's adjustments name the pick, "attackRollBonus[{pick}]": "{pick.amount}", and are
// written once for every pick, with that pick's bonus:
//  more 'all': every pick made before a new one grows by `by` (weapon training: 4, 3, 2, 1 at 17th)
//  more 'one': each pick starts at `first`, and a later level's raise adds `by` to the pick it names (favored enemy)

// the picks a character made for a feature of a class, in the order of its levels
export const picksOf = (char: Pick<Character, 'classLevels'>, className: string, feature: string): {level: ClassLevel, pick: LevelPick}[] => {
  const key = featureKey(feature);
  const levels = (char.classLevels || []).filter(level => (level?.name || '').trim().toLowerCase() === className.trim().toLowerCase());
  return levels.flatMap(level => Object.entries(level.picks || {})
    .filter(([named, pick]) => featureKey(named) === key && pick && String(pick.pick ?? '').trim())
    .map(([, pick]) => ({level, pick})));
};

// each pick with its bonus: its name, and its amount by how the feature grows
export const pickAmounts = (rule: FeaturePicks, picks: LevelPick[]): {name: string, amount: number}[] => {
  const first = Number(rule.first) || 0;
  const by = Number(rule.by) || 0;
  const named = picks.map(p => String(p.pick).trim());
  return named.map((name, i) => {
    if (rule.more === 'all') return {name, amount: first + by * (named.length - 1 - i)};
    const raises = picks.filter(p => p.raise && p.raise.trim().toLowerCase() === name.toLowerCase()).length;
    return {name, amount: first + by * raises};
  });
};

// a feature's adjustments with its picks written in: those naming {pick} once for every pick (none before the first
// pick is made), the rest as they are
export const withPicks = (feature: Feature, char: Pick<Character, 'classLevels'>, className: string): Feature => {
  const rule = feature.picks;
  if (!rule) return feature;
  const picks = pickAmounts(rule, picksOf(char, className, feature.name || '').map(p => p.pick));
  const adjustments: {[path: string]: unknown} = {};
  for (const [path, value] of Object.entries(feature.adjustments || {})) {
    const templated = path.includes('{pick}') || JSON.stringify(value ?? '').includes('{pick');
    if (!templated) { adjustments[path] = value; continue; }
    for (const {name, amount} of picks) {
      // (its bonus alone is the number, "{pick.amount}" is 2; in a formula it is written in, "2 * {pick.amount}")
      const fill = (text: string) => text.replace(/"\{pick\.amount\}"/gi, String(amount)).replace(/\{pick\.amount\}/gi, String(amount)).replace(/\{pick\}/gi, name);
      adjustments[fill(path)] = JSON.parse(fill(JSON.stringify(value)));
    }
  }
  return new Feature({...feature, adjustments: adjustments as Feature['adjustments']});
};

// what a character's levels are owed: a level the feature gives a pick at that keeps none, and a raise of a pick it
// never made. told, never refused (a character made by hand levels up)
export const pickProblemsOf = (char: Pick<Character, 'classLevels'>): string[] => {
  const problems: string[] = [];
  const byClass = new Map<string, ClassLevel[]>();
  for (const level of char.classLevels || []) {
    const name = (level?.name || '').trim();
    if (name) byClass.set(name.toLowerCase(), [...(byClass.get(name.toLowerCase()) || []), level]);
  }
  for (const [className, levels] of byClass) {
    for (const feature of levels.flatMap(level => level.features || []).filter(f => f.picks)) {
      const rule = feature.picks!;
      const key = featureKey(feature.name || '');
      levels.forEach((level, i) => {
        if (!(rule.at || []).includes(i + 1)) return;
        const own = Object.entries(level.picks || {}).find(([named]) => featureKey(named) === key)?.[1];
        if (!own?.pick?.trim()) {
          problems.push(`${levels[0].name} ${i + 1} gives a pick of ${feature.name}${rule.label ? ` (${rule.label})` : ''} it has not made (add_class_level picks, or the class level form)`);
        } else if (rule.more === 'one' && i > 0 && rule.by && !own.raise?.trim() && levels.slice(0, i).some(l => Object.keys(l.picks || {}).some(n => featureKey(n) === key))) {
          problems.push(`${levels[0].name} ${i + 1}'s ${feature.name} also raises one of its picks by ${rule.by}: say which (its raise)`);
        }
        if (own?.raise?.trim()) {
          const made = picksOf({classLevels: levels.slice(0, i + 1)}, className, feature.name || '').map(p => p.pick.pick.trim().toLowerCase());
          if (!made.includes(own.raise.trim().toLowerCase())) problems.push(`${levels[0].name} ${i + 1} raises ${own.raise}, which is no pick of ${feature.name}`);
        }
      });
    }
  }
  return problems;
};
