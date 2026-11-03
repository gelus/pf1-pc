import { AbilityModAlgorithm } from "../ability-mod.pipe";

export interface SourceObj<init> {
  value: init;
  origin: string;
  type?: string;
}

export type SourceItem<init> = init | SourceObj<init>;

export type Source<init> = init | SourceItem<init>[];

export const getByPath = (obj: any, path:string): any => path.split('.').reduce((cur, path) => cur?.[path], obj)

// value can be a number, or a string and be assigned directly
// value can be a "calculated string: which is a string consisting of number or object locators denoted by `{(mod:)?path}` and basic arithmatic operations (* + - /)
// Note that calculated string are just resolved from left to right
export const assignByPath = (obj: any, path:string|string[], val:any) => {
  if (!obj || typeof obj !== 'object') return;
  const arPath = Array.isArray(path) ? [...path] : path.split('.');
  const key: string = arPath.shift() as string;
  const calculatedStringRegex = /^([\d*+\-\/]|{((mod|stat):)?[a-z. ]+})+$/i
  if (typeof val === 'string' && calculatedStringRegex.test(val)) val = evaluateVal(val, obj);
  if (val && typeof val === 'object' && typeof val.value === 'string' && calculatedStringRegex.test(val.value)) val = { ...val, value: evaluateVal(val.value, obj)};
  if (key === '*') {
    for (const k of Object.keys(obj)) {
      assignByPath(obj, [k, ...arPath], val);
    }
    return;
  }
  const resolved = val?.value ?? val;
  if (arPath.length === 0) {
    if (typeof obj[key] === 'undefined') obj[key] = resolved;
    else if (typeof obj[key] === 'number') obj[key] += resolved;
    else if (typeof obj[key] === 'boolean') obj[key] = Boolean(resolved);
    else if (typeof obj[key] === 'string') obj[key] += ' ' + resolved;
    else if (Array.isArray(obj[key])) {
      if (Array.isArray(resolved)) obj[key].push(...resolved);
      else obj[key].push(resolved);
    }
  } else {
    assignByPath(obj[key], arPath, val);
  }
}

export const evaluateVal = (val: string|number, ob?:any): number => {
  if (typeof val === 'number') return val;

  if (ob) val = val.replace(/{((mod|stat):)?[a-z. ]+}/gi, (match) => {
    const mod = match.includes('mod:');
    const value = getByPath(ob, match.replace(/{|}|((mod|stat):)/g, ''));
    return String(mod ? AbilityModAlgorithm(value) : value);
  });

  let normalized = val;
  while (/(\+\+|--|\+-|-\+)/.test(normalized)) {
    normalized = normalized
      .replace(/\+\+|--/g, '+')
      .replace(/\+-|-\+/g, '-');
  }
  if (normalized.startsWith('+')) normalized = normalized.slice(1);

  let cur:any = null, operator = null;
  const split = normalized.split(/(?<=\d)([+\-*\/])/);
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
  return cur;
}
