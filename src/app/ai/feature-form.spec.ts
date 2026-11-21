import {Feature} from '../interfaces/character.interface';
import {evaluateVal} from '../utils/object.util';
import {LevelTable, fittedFormula, fromForm, growthProblems, usesAgain, valuesByLevel} from './feature-form';

// the value a table gives at a level: the last listed at or below it
const tableAt = (table: LevelTable, level: number): number =>
  Object.entries(table).map(([l, v]) => [Number(l), v] as const).filter(([l]) => l <= level).sort((a, b) => b[0] - a[0])[0][1];
const at = (formula: string | number, level: number) =>
  evaluateVal(formula as string, {classLevels: Array.from({length: level}, () => ({name: 'Slayer'}))});

describe('the form of a feature', () => {
  it('writes the simplest formula a class table gives', () => {
    const L = '{level.slayer}';
    // half level, minimum 1 (Track)
    expect(fittedFormula({1: 1, 4: 2, 6: 3, 8: 4, 10: 5, 12: 6, 14: 7, 16: 8, 18: 9, 20: 10}, L).formula).toBe(`max(1, floor(${L}/2))`);
    // +1, +1 more at 5th and every 5 levels (Studied Target)
    expect(fittedFormula({1: 1, 5: 2, 10: 3, 15: 4, 20: 5}, L).formula).toBe(`1+floor(${L}/5)`);
    // +1 at 2nd, +1 more every 4 levels after (Bravery)
    expect(fittedFormula({2: 1, 6: 2, 10: 3, 14: 4, 18: 5}, L).formula).toBe(`floor((${L}+2)/4)`);
    // 1d6, +1d6 every 2 levels (sneak attack's dice)
    expect(fittedFormula({1: 1, 3: 2, 5: 3, 7: 4, 9: 5, 11: 6, 13: 7, 15: 8, 17: 9, 19: 10}, L).formula).toBe(`floor((${L}+1)/2)`);
    // one value at every level is that number
    expect(fittedFormula({1: 2}, L).formula).toBe(2);
    expect(fittedFormula({0: 1} as any, L).error).toContain('1 to 20');
    expect(fittedFormula({1: 'one'} as any, L).error).toContain('a number');
  });

  it('gives every table at every level, whatever its shape', () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 60; n++) {
      const table: LevelTable = {};
      let value = Math.floor(random() * 4);
      for (let level = 1 + Math.floor(random() * 3); level <= 20; level += 1 + Math.floor(random() * 5)) {
        table[level] = value;
        value += Math.floor(random() * 3);
      }
      const {formula} = fittedFormula(table, '{level.slayer}');
      const first = Math.min(...Object.keys(table).map(Number));
      for (let level = first; level <= 20; level++) expect(at(formula!, level)).withContext(`${JSON.stringify(table)} at ${level}: ${formula}`).toBe(tableAt(table, level));
    }
  });

  it('puts a grown number where the feature keeps its numbers, and says it by level', () => {
    const studied = new Feature({name: 'Studied Target', adjustments: {specialAttack: {name: 'Studied Target', active: false}} as any});
    (studied as any).grows = {'melee.*.toHitBonus': {1: 1, 5: 2, 10: 3, 15: 4, 20: 5}};
    const form = fromForm(studied, {level: '{level.slayer}', className: 'Slayer', classLevel: 1});
    expect(form.problems).toEqual([]);
    expect((studied.adjustments as any).specialAttack.adjustments['melee.*.toHitBonus']).toBe('1+floor({level.slayer}/5)');
    expect(form.wrote).toEqual(['Studied Target melee.*.toHitBonus: 1+floor({level.slayer}/5) (1st 1, 2nd 1, 3rd 1, 4th 1, 5th 2, 10th 3, 15th 4, 20th 5)']);
    expect((studied as any).grows).toBeUndefined();
    expect(valuesByLevel('max(1, floor({level.slayer}/2))', 'Slayer')).toBe('1st 1, 2nd 1, 5th 2, 10th 5, 20th 10');
    expect(fromForm(new Feature({name: 'x', grows: 3} as any), {level: '{level}'}).problems[0]).toContain('grows is');
  });

  it('works out uses a day by level and ability, and again at a later level', () => {
    const applied = {abilityScores: {con: 14}};
    const rage = new Feature({name: 'Rage', adjustments: {}} as any);
    (rage as any).uses_by_level = {at: {1: 4, 2: 6, 3: 8}, plus: 'con', label: 'rounds'};
    expect(fromForm(rage, {level: '{level.barbarian}', classLevel: 1, applied}).wrote).toEqual(['Rage: 6 rounds a day at level 1']);
    expect(rage.charges).toEqual(jasmine.objectContaining({total: 6, current: 6, label: 'rounds', per: 'day'}));
    rage.charges!.current = 2;
    expect(usesAgain([rage], 3, applied)).toEqual(['Rage: 10 rounds now']);
    // the rounds spent stay spent
    expect(rage.charges).toEqual(jasmine.objectContaining({total: 10, current: 6}));
    const bad = new Feature({name: 'Bad', uses_by_level: {at: {1: 3}, plus: 'luck'}} as any);
    expect(fromForm(bad, {level: '{level}', applied}).problems[0]).toContain('plus is an ability');
  });

  it('refuses a number its text says grows, written fixed, and leaves one with no number to grow', () => {
    const fixed = new Feature({name: 'Studied Target', description: '+1, increases by 1 at 5th level and every 5 levels thereafter',
      adjustments: {specialAttack: {name: 'Studied Target', active: false, adjustments: {'melee.*.toHitBonus': 1}}}} as any);
    expect(growthProblems(fixed)).toEqual([jasmine.stringContaining('melee.*.toHitBonus stays the same at every level')]);
    const grown = new Feature({name: 'Track', description: 'half his level to Survival', adjustments: {'skills.survival.value[follow tracks]': 'max(1, floor({level.slayer}/2))'}} as any);
    expect(growthProblems(grown)).toEqual([]);
    const dice = new Feature({name: 'Sneak Attack', description: '+1d6 per two levels', adjustments: {specialAttack: {name: 'Sneak Attack', description: '+1d6'}}} as any);
    expect(growthProblems(dice)).toEqual([]);
    const flat = new Feature({name: 'Fast Movement', description: '+10 ft. speed', adjustments: {'speed.land': 10}} as any);
    expect(growthProblems(flat)).toEqual([]);
  });
});
