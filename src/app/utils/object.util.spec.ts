import {evaluateVal} from './object.util'

fdescribe('evaluateVal', () => {
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
  fit('should be able to calculate the mod value of ability scores', () => {
    let ob: any = {dex: 22, str: 12, wis: 15};
    expect(evaluateVal('{mod:dex}', ob)).toBe(6);
    expect(evaluateVal('{mod:str}', ob)).toBe(1);
    expect(evaluateVal('{mod:wis}', ob)).toBe(2);
  })
});
