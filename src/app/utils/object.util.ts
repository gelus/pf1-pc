import { AbilityModAlgorithm } from "../ability-mod.pipe";

export interface SourceObj<init> {
  value: init;
  origin: string;
  type?: string;
}

export type SourceItem<init> = init | SourceObj<init>;

export type Source<init> = init | SourceItem<init>[];

export const getByPath = (obj: any, path:string): any => path.split('.').reduce((cur, path) => cur[path], obj)

// value can be a number, or a string and be assigned directly
// value can be a "calculated string: which is a string consisting of number or object locators denoted by `{(mod:)?path}` and basic arithmatic operations (* + - /)
// Note that calculated string are just resolved from left to right
export const assignByPath = (obj: any, path:string|string[], val:any) => {
  const arPath = Array.isArray(path) ? path : path.split('.');
  const key: string = arPath.shift() as string;
  const calculatedStringRegex = /^([\d*+\-\/]|{((mod|stat):)?[a-z.]+})+$/i
  if (typeof val === 'string' && calculatedStringRegex.test(val)) val = evaluateVal(val, obj);
  if (typeof val.value === 'string' && calculatedStringRegex.test(val.value)) val = { ...val, value: evaluateVal(val.value, obj)};
  if (arPath.length === 0) {
    if (typeof obj[key] === 'undefined') obj[key] = (val.value ?? val);
    else if (typeof obj[key] === 'number') obj[key] += (val.value ?? val);
    else if (typeof obj[key] === 'string') obj[key] += ' ' + (val.value ?? val);
    else if (Array.isArray(obj[key])) obj[key].push(val.value ?? val);
  } else {
    if (key === '*' && Array.isArray(obj)) {
      for (let t of obj) assignByPath(t, arPath, val)
    } else assignByPath(obj[key], arPath, val) ;
  }
}

export const evaluateVal = (val: string|number, ob?:any): number => {
  console.log(val, typeof val)
  if (typeof val === 'number') return val;

  if (ob) val = val.replace(/{((mod|stat):)?[a-z.]+}/gi, (match) => {
    const mod = match.includes('mod:');
    const value = getByPath(ob, match.replace(/{|}|((mod|stat):)/g, ''));
    return mod ? AbilityModAlgorithm(value) : value;
  });

  let cur:any = null, operator = null;
  const split = val.split(/(?<=\d)([+\-*\/])/);
  for(const o of split) {
    if (cur === null) cur = parseFloat(o);
    else {
      if (/[+\-*\/]/.test(o)) operator = o;
      else {
        if (operator === '+') cur = cur+parseFloat(o);
        else if (operator === '-') cur = cur-parseFloat(o);
        else if (operator === '*') cur = cur*parseFloat(o);
        else if (operator === '/') cur = cur/parseFloat(o);
      }
    }
  }
  console.log(cur);
  return cur;
}
