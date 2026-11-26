import { AbilityModAlgorithm, abilityModifier } from "../ability-mod.pipe";

export interface SourceObj<init> {
  value: init;
  origin: string;
  type?: string;
}

export type SourceItem<init> = init | SourceObj<init>;

export type Source<init> = init | SourceItem<init>[];

export const getByPath = (obj: any, path:string): any => path.split('.').reduce((cur, path) => cur?.[path], obj)

// replaces the value at path, creating the objects leading up to it when they are missing
// unlike assignByPath it does not combine the new value with the one already there
export const setByPath = (obj: any, path: string, val: any): void => {
  if (!obj || typeof obj !== 'object') return;
  const arPath = path.split('.');
  const last = arPath.pop() as string;
  let cur = obj;
  for (const key of arPath) {
    if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key];
  }
  cur[last] = val;
}

// value can be a number, or a string and be assigned directly
// value can be a "calculated string": a formula of numbers, references to the character and arithmetic, see evaluateVal
const calculatedStringRegex =
  /^(\s|[\d.*+\-\/(),]|(floor|ceil|round|abs|min|max)(?=\s*\()|{((mod|stat):)?[a-z0-9_. ]+}|{feature:[^{}]+})+$/i
// whether a value is a calculated string, a formula evaluateVal can resolve to a number
export const isCalculatedString = (val: any): val is string => typeof val === 'string' && calculatedStringRegex.test(val);

export const assignByPath = (obj: any, path:string|string[], val:any) => {
  if (!obj || typeof obj !== 'object') return;
  const arPath = Array.isArray(path) ? [...path] : path.split('.');
  const key: string = arPath.shift() as string;
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

// a formula is worked out with the usual precedence: parentheses, then * and /, then + and -, left to right within each
//  numbers                     2, 1.5
//  references                  {bab}, {abilityScores.str} (the number at that path of the character)
//                              {level} (the character level), {level.rogue} (its rogue levels), see levelReference
//                              {mod:abilityScores.str} (the modifier of that score, ability damage included)
//                              {stat:abilityScores.dex} (the number there, resolved once every other adjustment is in)
//                              {feature:Bravery} (what that feature gives, once everything is applied: its path's
//                              bonus, the largest when it gives several, 0 without it), {feature:Bravery:saves.will[fear]}
//  operators                   + - * / and a leading minus, -{mod:abilityScores.dex}
//  functions                   floor(x) ceil(x) round(x) abs(x) min(a, b, ...) max(a, b, ...)
// division is not rounded: pathfinder rounds down, so "1d6 per 2 rogue levels" is ceil({level.rogue}/2) and "1 per 4 levels" floor({level}/4)
// a formula that can not be worked out (a typo, a reference to nothing) is NaN
export const formulaFunctions: {[name: string]: (...args: number[]) => number} = {
  floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, min: Math.min, max: Math.max,
};

type FormulaToken =
  | {kind: 'number', value: number}
  | {kind: 'reference', path: string, mod: boolean}
  | {kind: 'function', name: string}
  | {kind: 'symbol', value: string};

// the tokens of a formula, or the reason it has none
const tokenizeFormula = (formula: string): FormulaToken[] | string => {
  const tokens: FormulaToken[] = [];
  let i = 0;
  while (i < formula.length) {
    const rest = formula.slice(i);
    const space = /^\s+/.exec(rest);
    if (space) { i += space[0].length; continue; }
    const feature = /^{\s*feature:\s*([^{}]+?)\s*}/i.exec(rest);
    if (feature) {
      tokens.push({kind: 'reference', path: `feature:${feature[1]}`, mod: false});
      i += feature[0].length;
      continue;
    }
    const reference = /^{\s*((mod|stat):)?\s*([a-z0-9_. ]+?)\s*}/i.exec(rest);
    if (reference) {
      tokens.push({kind: 'reference', path: reference[3], mod: reference[2]?.toLowerCase() === 'mod'});
      i += reference[0].length;
      continue;
    }
    const number = /^(\d+(\.\d+)?|\.\d+)/.exec(rest);
    if (number) { tokens.push({kind: 'number', value: parseFloat(number[0])}); i += number[0].length; continue; }
    const fn = /^([a-z]+)\s*(?=\()/i.exec(rest);
    if (fn) {
      const name = fn[1].toLowerCase();
      if (!formulaFunctions[name]) {
        return `unknown function ${fn[1]}(), the functions are ${Object.keys(formulaFunctions).join(', ')}`;
      }
      tokens.push({kind: 'function', name});
      i += fn[0].length;
      continue;
    }
    if ('+-*/(),'.includes(rest[0])) { tokens.push({kind: 'symbol', value: rest[0]}); i++; continue; }
    if (rest[0] === '{') return `a reference that is not closed or not a path at "${rest}"`;
    return `unexpected "${rest[0]}" at "${rest}"`;
  }
  return tokens;
};

// a parsed formula: resolve works it out against a character, references lists what it reads
export interface ParsedFormula {
  resolve(ob?: any): number;
  references: {path: string, mod: boolean}[];
}

// the references a formula can make besides the paths of the character: its level, and its levels in a class
//  {level}          the character level, one per class level entry
//  {level.<class>}  the levels of that class (case does not matter): {level.rogue}
export const levelReference = (ob: any, path: string): number | undefined => {
  // a spell's effect that grows with its caster level ("+1 per three caster levels", Barkskin): the cast fills in its
  // caster's level (atCasterLevel), and a condition that was not cast (put on by hand, the library's checks) takes the
  // character's level
  // a feature's stacks, written in by the engine (see Feature.stacks): one it has not written is none
  if (/^stacks$/i.test(path.trim()) && ob && getByPath(ob, path) === undefined) return 0;
  if (/^casterLevel$/i.test(path.trim()) && ob && getByPath(ob, path) === undefined) {
    return Math.max(1, Array.isArray(ob.classLevels) ? ob.classLevels.length : 0);
  }
  const match = /^level(?:\.(.+))?$/i.exec(path.trim());
  if (!match || !ob || getByPath(ob, path) !== undefined) return undefined;
  const levels: {name?: string}[] = Array.isArray(ob.classLevels) ? ob.classLevels : [];
  // a companion whose levels come from its master (rules/companions.ts): its own level, the levels of its master's
  // classes that count with its class feature's offset (a paladin's mount: "spell resistance of its paladin level +
  // 11" is {level} + 11)
  const link = ob.master;
  if (!match[1] && link && link.kind !== 'cohort') {
    const counted = new Set((link.classes || []).map((c: string) => c.trim().toLowerCase()));
    const classes: {[name: string]: number} = link.copy?.classes || {};
    const master = Object.entries(classes).filter(([n]) => counted.has(n.toLowerCase())).reduce((sum, [, n]) => sum + n, 0);
    return Math.max(0, master + (Number(link.levelOffset) || 0));
  }
  if (!match[1]) return levels.length;
  const name = match[1].trim().toLowerCase();
  return levels.filter(level => (level?.name || '').trim().toLowerCase() === name).length;
};

// what a feature gives, as the engine reads it off what it applied (see {feature:...}): the engine puts it on the
// applied character, unseen and never saved. a character without it (a raw one, a plain object) reads NaN
export const FEATURE_VALUE = Symbol('feature value');
export type FeatureValue = (name: string, path?: string) => number;

const referenceValue = (ob: any, path: string, mod: boolean): number => {
  if (!ob) return NaN;
  const feature = /^feature:(.+)$/i.exec(path);
  if (feature) {
    const read = ob[FEATURE_VALUE] as FeatureValue | undefined;
    const [name, ...on] = feature[1].split(':');
    return read ? read(name.trim(), on.length ? on.join(':').trim() : undefined) : NaN;
  }
  const level = levelReference(ob, path);
  if (level !== undefined) return level;
  const value = getByPath(ob, path);
  if (!mod) return typeof value === 'number' ? value : parseFloat(String(value));
  // the modifier of an ability score of the character takes its ability damage too, see abilityModifier
  // the modifier of anything else ({mod:dex} of a plain object of scores) is that of the number found there
  const ability = /^abilityScores\.([a-z]+)$/i.exec(path)?.[1];
  return Number(ability && ob.abilityScores ? abilityModifier(ob, ability) : AbilityModAlgorithm(value));
};

// parses a formula, or gives the reason it can not be parsed
export const parseFormula = (formula: string): ParsedFormula | string => {
  const tokens = tokenizeFormula(formula);
  if (typeof tokens === 'string') return tokens;
  if (!tokens.length) return 'an empty formula';
  type Node = (ob: any) => number;
  let pos = 0;
  const peek = (): FormulaToken | undefined => tokens[pos];
  const isSymbol = (token: FormulaToken | undefined, ...values: string[]): boolean =>
    token?.kind === 'symbol' && values.includes(token.value);
  const fail = (message: string): never => { throw new Error(message); };
  const describe = (token: FormulaToken | undefined): string =>
    !token ? 'the end of the formula'
      : token.kind === 'symbol' ? `"${token.value}"`
      : token.kind === 'number' ? String(token.value)
      : token.kind === 'function' ? `${token.name}(`
      : `{${token.mod ? 'mod:' : ''}${token.path}}`;

  const expression = (): Node => {
    let node = term();
    while (isSymbol(peek(), '+', '-')) {
      const op = (tokens[pos++] as {value: string}).value;
      const left = node, right = term();
      node = op === '+' ? ob => left(ob) + right(ob) : ob => left(ob) - right(ob);
    }
    return node;
  };
  const term = (): Node => {
    let node = unary();
    while (isSymbol(peek(), '*', '/')) {
      const op = (tokens[pos++] as {value: string}).value;
      const left = node, right = unary();
      node = op === '*' ? ob => left(ob) * right(ob) : ob => left(ob) / right(ob);
    }
    return node;
  };
  const unary = (): Node => {
    if (isSymbol(peek(), '+', '-')) {
      const op = (tokens[pos++] as {value: string}).value;
      const operand = unary();
      return op === '-' ? ob => -operand(ob) : operand;
    }
    return primary();
  };
  const primary = (): Node => {
    const token = tokens[pos++];
    if (token?.kind === 'number') return () => token.value;
    if (token?.kind === 'reference') return ob => referenceValue(ob, token.path, token.mod);
    if (token?.kind === 'function') {
      if (!isSymbol(tokens[pos++], '(')) fail(`${token.name} needs its arguments in parentheses`);
      const args: Node[] = [expression()];
      while (isSymbol(peek(), ',')) { pos++; args.push(expression()); }
      if (!isSymbol(tokens[pos++], ')')) fail(`${token.name}( is not closed`);
      if (['floor', 'ceil', 'round', 'abs'].includes(token.name) && args.length !== 1) {
        fail(`${token.name}() takes one argument, it got ${args.length}`);
      }
      const fn = formulaFunctions[token.name];
      return ob => fn(...args.map(arg => arg(ob)));
    }
    if (isSymbol(token, '(')) {
      const node = expression();
      if (!isSymbol(tokens[pos++], ')')) fail('a parenthesis is not closed');
      return node;
    }
    return fail(`expected a number, a reference or a parenthesis, got ${describe(token)}`);
  };

  try {
    const root = expression();
    if (pos < tokens.length) fail(`unexpected ${describe(tokens[pos])}`);
    return {
      resolve: ob => root(ob),
      references: tokens
        .filter((t): t is Extract<FormulaToken, {kind: 'reference'}> => t.kind === 'reference')
        .map(({path, mod}) => ({path, mod})),
    };
  } catch (e) {
    return (e as Error).message;
  }
};

const parsedFormulas = new Map<string, ParsedFormula | string>();

// works a formula out against ob (the character), NaN when it can not be, see parseFormula
export const evaluateVal = (val: string|number, ob?:any): number => {
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return NaN;
  let parsed = parsedFormulas.get(val);
  if (parsed === undefined) {
    parsed = parseFormula(val);
    if (parsedFormulas.size > 5000) parsedFormulas.clear();
    parsedFormulas.set(val, parsed);
  }
  return typeof parsed === 'string' ? NaN : parsed.resolve(ob);
}

// a spell's adjustments as cast at a caster level: its {casterLevel} written as that number (see levelReference)
export const atCasterLevel = <T>(adjustments: T, casterLevel: number): T =>
  JSON.parse(JSON.stringify(adjustments).replace(/\{casterLevel\}/gi, String(casterLevel)));
