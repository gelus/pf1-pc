import {assignByPath, evaluateVal, isCalculatedString, parseFormula, ParsedFormula} from './object.util'

describe('evaluateVal', () => {
  it('should do basic math', () => {
    expect(evaluateVal('5+2')).toBe(7);
    expect(evaluateVal('3+9')).toBe(12);
    expect(evaluateVal('1+2')).toBe(3);

    expect(evaluateVal('5-2')).toBe(3);
    expect(evaluateVal('3-9')).toBe(-6);
    expect(evaluateVal('1-2')).toBe(-1);

    expect(evaluateVal('5*2')).toBe(10);
    expect(evaluateVal('3*9')).toBe(27);
    expect(evaluateVal('1*2')).toBe(2);

    expect(evaluateVal('5/2')).toBe(2.5);
    expect(evaluateVal('10/5')).toBe(2);
    expect(evaluateVal('1/2')).toBe(0.5);
  });
  it('should evaluate values from the object', () => {
    let ob: any = {one: 1};
    expect(evaluateVal('{one}', ob)).toBe(1);

    ob = {nest:{one: 1}};
    expect(evaluateVal('{nest.one}', ob)).toBe(1);
  })
  it('should be able to do math with values from objects', () => {
    let ob: any = {nest:{three: 3}, two: 2};
    expect(evaluateVal('{nest.three}+{two}', ob)).toBe(5);
    expect(evaluateVal('{nest.three}-{two}', ob)).toBe(1);
    expect(evaluateVal('{nest.three}*{two}', ob)).toBe(6);
    expect(evaluateVal('{nest.three}/{two}', ob)).toBe(1.5);
  })
  it('should be able to combine basic math, numbers and object lookups', () => {
    let ob: any = {nest:{three: 3}, two: 2};
    expect(evaluateVal('{nest.three}+5*{two}-1', ob)).toBe(12);
  })
  it('should multiply and divide before adding and subtracting', () => {
    expect(evaluateVal('1+7/4')).toBe(2.75);
    expect(evaluateVal('2+3*4-1')).toBe(13);
    expect(evaluateVal('10-4-3')).toBe(3);
    expect(evaluateVal('8/2/2')).toBe(2);
    expect(evaluateVal('1+{bab}/4', {bab: 8})).toBe(3);
  })
  it('should work out parentheses first', () => {
    expect(evaluateVal('(1+7)/4')).toBe(2);
    expect(evaluateVal('2*(3+(4-1))')).toBe(12);
  })
  it('should take leading and repeated signs', () => {
    expect(evaluateVal('-3')).toBe(-3);
    expect(evaluateVal('3--2')).toBe(5);
    expect(evaluateVal('3+-2')).toBe(1);
    expect(evaluateVal('-(2+1)*2')).toBe(-6);
    expect(evaluateVal('+4')).toBe(4);
  })
  it('should round with floor, ceil and round', () => {
    expect(evaluateVal('floor({level}/2)', {level: 5})).toBe(2);
    expect(evaluateVal('ceil({level}/2)', {level: 5})).toBe(3);
    expect(evaluateVal('round(2.5)')).toBe(3);
    expect(evaluateVal('abs(-{two})', {two: 2})).toBe(2);
    // power attack: -1 and one more per 4 points of bab
    expect(evaluateVal('-1-floor({bab}/4)', {bab: 11})).toBe(-3);
  })
  it('should take the lowest or highest of its arguments with min and max', () => {
    expect(evaluateVal('min(5, {mod:abilityScores.dex})', {abilityScores: {dex: 18}})).toBe(4);
    expect(evaluateVal('max(1, floor({level}/3))', {level: 2})).toBe(1);
    expect(evaluateVal('min(10, max(2, 7), 8)')).toBe(7);
  })
  it('should reference the character level and the levels of a class', () => {
    const char = {classLevels: [{name: 'Rogue'}, {name: 'Fighter'}, {name: 'rogue'}]};
    expect(evaluateVal('{level}', char)).toBe(3);
    expect(evaluateVal('{level.rogue}', char)).toBe(2);
    expect(evaluateVal('{level.Fighter}', char)).toBe(1);
    expect(evaluateVal('{level.wizard}', char)).toBe(0);
    expect(evaluateVal('ceil({level.rogue}/2)', char)).toBe(1);
    // a field of that name wins
    expect(evaluateVal('{level}', {level: 7, classLevels: []})).toBe(7);
  })
  it('should take decimals', () => {
    expect(evaluateVal('1.5*{two}', {two: 2})).toBe(3);
  })
  it('should be NaN for a formula it can not work out', () => {
    for (const formula of ['1+', '(1+2', '1+2)', 'floor(1, 2)', 'sqrt(4)', '{nest.three}+5}', '', '{missing}+1']) {
      expect(evaluateVal(formula, {nest: {three: 3}})).withContext(formula).toBeNaN();
    }
  })
  it('should explain why a formula can not be parsed', () => {
    expect(parseFormula('sqrt(4)')).toContain('unknown function sqrt()');
    expect(parseFormula('(1+2')).toContain('not closed');
    expect(parseFormula('1+')).toContain('the end of the formula');
    const parsed = parseFormula('floor({bab}/4)+{mod:abilityScores.str}');
    expect(typeof parsed).toBe('object');
    expect((parsed as ParsedFormula).references).toEqual([
      {path: 'bab', mod: false}, {path: 'abilityScores.str', mod: true},
    ]);
  })
  it('should take formulas with functions and parentheses as calculated strings, and words as text', () => {
    expect(isCalculatedString('floor({level}/2)')).toBeTrue();
    expect(isCalculatedString('(1+2)*3')).toBeTrue();
    expect(isCalculatedString('max')).toBeFalse();
    expect(isCalculatedString('fire')).toBeFalse();
    expect(isCalculatedString('half')).toBeFalse();
  })
  it('should be able to calculate the mod value of ability scores', () => {
    let ob: any = {dex: 22, str: 12, wis: 15};
    expect(evaluateVal('{mod:dex}', ob)).toBe(6);
    expect(evaluateVal('{mod:str}', ob)).toBe(1);
    expect(evaluateVal('{mod:wis}', ob)).toBe(2);
  })
  it('takes the ability damage of the character into the mod of its ability scores', () => {
    const ob: any = {abilityScores: {dex: 16, str: 12}, abilityDamage: {dex: 4}};
    expect(evaluateVal('{mod:abilityScores.dex}', ob)).toBe(1);
    expect(evaluateVal('-2-{mod:abilityScores.dex}', ob)).toBe(-3);
    expect(evaluateVal('{mod:abilityScores.str}', ob)).toBe(1);
    // the score itself is left alone
    expect(evaluateVal('{abilityScores.dex}', ob)).toBe(16);
    // a raw character without damage
    expect(evaluateVal('{mod:abilityScores.str}', {abilityScores: {str: 12}})).toBe(1);
  })
  it('should target every key of an object one level deep when using *', () => {
    const obj: any = {
      skills: {
        craft: {
          subSkills: {
            pottery: { value: 1 },
            alchemy: { value: 2 },
          },
        },
      },
      speed: { land: 30, swim: 10, fly: 0 },
    };
    assignByPath(obj, 'skills.craft.subSkills.*.value', 3);
    expect(obj.skills.craft.subSkills.pottery.value).toBe(4);
    expect(obj.skills.craft.subSkills.alchemy.value).toBe(5);

    assignByPath(obj, 'speed.*', 10);
    expect(obj.speed).toEqual({ land: 40, swim: 20, fly: 10 });
  });
});
