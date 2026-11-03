import {assignByPath, evaluateVal} from './object.util'

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
    expect(evaluateVal('{nest.three}+5*{two}-1}', ob)).toBe(15);
  })
  it('should be able to calculate the mod value of ability scores', () => {
    let ob: any = {dex: 22, str: 12, wis: 15};
    expect(evaluateVal('{mod:dex}', ob)).toBe(6);
    expect(evaluateVal('{mod:str}', ob)).toBe(1);
    expect(evaluateVal('{mod:wis}', ob)).toBe(2);
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
