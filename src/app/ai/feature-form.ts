import {Feature} from '../interfaces/character.interface';
import {abilityModifier} from '../ability-mod.pipe';
import {evaluateVal} from '../utils/object.util';

// the form the AI fills for a feature from its rules page, instead of writing formulas: what it reads off the page
// (the level it is gained at, the class table's column of a number that grows, the uses a day by level), which the
// app turns into the engine's adjustments the same way for every feature. the AI reads a table well and writes a
// formula badly (Track's half level without its minimum, Studied Target's +1 that never grew), and no feature has to
// be known to the app
//
//   "gained_at": 3                                        the class level of the table row it is in
//   "grows": {"skills.survival.value[follow tracks]": {"1": 1, "4": 2, "6": 3, ...}}
//                                                         a number by level, as the class table lists it: each value
//                                                         holds from its level to the next one listed
//   "uses_by_level": {"at": {"1": 4, "2": 6, ...}, "plus": "con", "per": "day", "label": "rounds"}
//                                                         uses (rounds) a day by level, plus an ability modifier

export type LevelTable = {[level: string]: number};

const MAX_LEVEL = 20;

// the table read: its levels and values, or why it can not be read
const readTable = (table: unknown): {points?: [number, number][], error?: string} => {
  if (!table || typeof table !== 'object' || Array.isArray(table)) return {error: 'a table of levels and values, {"1": 1, "5": 2}'};
  const points: [number, number][] = [];
  for (const [key, value] of Object.entries(table)) {
    const level = Number(key);
    const number = Number(value);
    if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) return {error: `its levels are 1 to ${MAX_LEVEL}, not "${key}"`};
    if (!Number.isFinite(number)) return {error: `the value at level ${key} is a number, not ${JSON.stringify(value)}`};
    points.push([level, number]);
  }
  if (!points.length) return {error: 'the table has no levels'};
  return {points: points.sort((a, b) => a[0] - b[0])};
};

// the value at every level from the first listed to 20: each listed value holds until the next
const expanded = (points: [number, number][]): Map<number, number> => {
  const values = new Map<number, number>();
  let at = 0;
  for (let level = points[0][0]; level <= MAX_LEVEL; level++) {
    while (at + 1 < points.length && points[at + 1][0] <= level) at++;
    values.set(level, points[at][1]);
  }
  return values;
};

const term = (b: number, inner: string, d: number): string => {
  const scaled = d === 1 ? inner : `floor(${inner}/${d})`;
  return b === 1 ? scaled : b === -1 ? `-${scaled}` : `${b}*${scaled}`;
};
const shifted = (level: string, c: number): string => (c === 0 ? level : c > 0 ? `(${level}+${c})` : `(${level}${c})`);

// a formula of the level giving the table, the simplest of a + b*floor((L+c)/d), kept to at least the table's least
// value when it needs it, else a sum of steps (min(1, floor(L/k)) is 1 from level k on). the formula is evaluated at
// every level of the table and must give each value: the app's own check of what it wrote
export const fittedFormula = (table: LevelTable, level: string): {formula?: string | number, error?: string} => {
  const read = readTable(table);
  if (read.error) return {error: read.error};
  const values = expanded(read.points!);
  const levels = [...values.keys()];
  const distinct = new Set(values.values());
  if (distinct.size === 1) return {formula: [...distinct][0]};
  const least = Math.min(...values.values());
  const gives = (f: (l: number) => number) => levels.every(l => Math.abs(f(l) - values.get(l)!) < 1e-9);
  let best: {formula: string, cost: number} | undefined;
  for (let d = 1; d <= 10; d++) {
    for (let c = -(d - 1); c <= d - 1; c++) {
      for (const b of [1, 2, 3, 4, 5, -1, -2, -3]) {
        for (let a = -10; a <= 20; a++) {
          const raw = (l: number) => a + b * Math.floor((l + c) / d);
          for (const kept of [false, true]) {
            if (kept ? !gives(l => Math.max(least, raw(l))) : !gives(raw)) continue;
            const cost = Math.abs(a) + Math.abs(c) * 2 + (kept ? 3 : 0) + (d > 1 ? 1 : 0) + Math.abs(b) - 1;
            if (best && best.cost <= cost) continue;
            const body = term(b, shifted(level, c), d);
            const sum = a === 0 ? body : body.startsWith('-') ? `${a}${body}` : `${a}+${body}`;
            best = {formula: kept ? `max(${least}, ${sum})` : sum, cost};
          }
        }
      }
    }
  }
  if (best) return {formula: best.formula};
  // steps: the first value, and each change from the level it happens at
  const first = values.get(levels[0])!;
  const steps: string[] = [];
  let before = first;
  for (const l of levels.slice(1)) {
    const now = values.get(l)!;
    if (now !== before) steps.push(`${now - before}*min(1, floor(${level}/${l}))`);
    before = now;
  }
  return {formula: [String(first), ...steps].join('+').replace(/\+-/g, '-')};
};

// the formula's values at some levels, for the AI to hold against the class table: "1st 1, 5th 2, 10th 5, 20th 10"
const ordinal = (n: number): string => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
export const valuesByLevel = (formula: unknown, className: string | undefined, levels = [1, 2, 5, 10, 20], from = 1): string | undefined => {
  if (typeof formula !== 'string' || !/\{level/.test(formula)) return undefined;
  const at = levels.filter(l => l >= from);
  const values = at.map(l => {
    const char = {classLevels: Array.from({length: l}, () => ({name: className ?? 'class'}))};
    return evaluateVal(formula, char);
  });
  if (values.some(v => !Number.isFinite(v))) return undefined;
  return at.map((l, i) => `${ordinal(l)} ${values[i]}`).join(', ');
};

type Adjustments = {[path: string]: unknown};

// where a feature's numbers go: its own adjustments, or the sheet entry it shows through (a toggled one keeps them)
const holders = (feature: Feature): Adjustments[] => {
  const own = (feature.adjustments || {}) as Adjustments;
  const entries = Object.values(own).filter((v): v is {adjustments: Adjustments} =>
    !!v && typeof v === 'object' && !Array.isArray(v) && !!(v as any).adjustments && typeof (v as any).adjustments === 'object');
  return [own, ...entries.map(e => e.adjustments)];
};
const toggledEntry = (feature: Feature): Adjustments | undefined => {
  const entry = Object.values(feature.adjustments || {}).find((v: any) => v && typeof v === 'object' && !Array.isArray(v)
    && v.active !== undefined) as {adjustments?: Adjustments} | undefined;
  if (entry && !entry.adjustments) entry.adjustments = {};
  return entry?.adjustments;
};

export interface FormResult {
  problems: string[];
  // what the app wrote from the form, with its values by level, for the AI to check against the page
  wrote: string[];
}

// fills the feature in from its form, in place. level: the level its numbers grow with ({level.slayer} for a class
// feature, {level} for a feat); classLevel: the level of that class the character has now (the uses a day are for it);
// applied: the character, for the ability modifier of the uses
export const fromForm = (
  feature: Feature, options: {level: string, className?: string, classLevel?: number, applied?: unknown},
): FormResult => {
  const problems: string[] = [];
  const wrote: string[] = [];
  const f = feature as Feature & {grows?: unknown, uses_by_level?: unknown, gained_at?: unknown, usesByLevel?: unknown};
  const name = feature.name || 'a feature';
  if (f.grows !== undefined) {
    if (!f.grows || typeof f.grows !== 'object' || Array.isArray(f.grows)) problems.push(`${name}: grows is {"<path>": {"<level>": <value>, ...}}`);
    else {
      for (const [path, table] of Object.entries(f.grows as object)) {
        const fitted = fittedFormula(table as LevelTable, options.level);
        if (fitted.error) { problems.push(`${name}: grows ${path}: ${fitted.error}`); continue; }
        // on the holder that has the path already, else the entry the player switches on, else the feature
        const all = holders(feature);
        const holder = all.find(h => path in h) ?? toggledEntry(feature) ?? all[0];
        const old = holder[path];
        holder[path] = old && typeof old === 'object' && 'value' in (old as object) ? {...(old as object), value: fitted.formula} : fitted.formula;
        const from = Number(Object.keys(table as object).map(Number).sort((a, b) => a - b)[0]) || 1;
        const shown = valuesByLevel(fitted.formula, options.className, [1, 2, 3, 4, 5, 10, 15, 20], from);
        wrote.push(`${name} ${path}: ${fitted.formula}${shown ? ` (${shown})` : ''}`);
      }
      delete f.grows;
    }
  }
  if (f.uses_by_level !== undefined) {
    const form = (f.uses_by_level && typeof f.uses_by_level === 'object' ? f.uses_by_level : {}) as {at?: unknown, plus?: unknown, per?: unknown, label?: unknown};
    const read = readTable(form.at);
    const plus = typeof form.plus === 'string' ? form.plus.trim().toLowerCase().slice(0, 3) : '';
    if (read.error) problems.push(`${name}: uses_by_level at: ${read.error}`);
    else if (plus && !['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(plus)) problems.push(`${name}: uses_by_level plus is an ability (con, cha), not ${form.plus}`);
    else {
      // kept on the feature: a later level of the class works its uses out again
      f.usesByLevel = {at: Object.fromEntries(read.points!.map(([l, v]) => [String(l), v])), ...(plus ? {plus} : {})};
      const per = ['day', 'encounter', 'none'].includes(String(form.per)) ? String(form.per) : 'day';
      const label = typeof form.label === 'string' && form.label.trim() ? form.label.trim() : 'uses';
      const total = usesAt(f.usesByLevel as UsesByLevel, options.classLevel ?? 1, options.applied);
      if (total > 0) {
        feature.charges = {total, current: total, per: per as any, label};
        wrote.push(`${name}: ${total} ${label} a ${per} at level ${options.classLevel ?? 1}`);
      } else problems.push(`${name}: uses_by_level gives no uses at level ${options.classLevel ?? 1}`);
    }
    delete f.uses_by_level;
  }
  return {problems, wrote};
};

export interface UsesByLevel {
  at: LevelTable;
  plus?: string;
}

// the uses at a level of the class: the table's value there, plus the ability's modifier on the sheet
export const usesAt = (form: UsesByLevel, classLevel: number, applied: unknown): number => {
  const read = readTable(form.at);
  if (!read.points) return 0;
  const values = expanded(read.points);
  const base = values.get(Math.min(MAX_LEVEL, classLevel)) ?? (classLevel < read.points[0][0] ? 0 : read.points[0][1]);
  return Math.max(0, base + (form.plus ? abilityModifier(applied, form.plus) : 0));
};

// the uses of the features of a class worked out again at a new level of it (rage's rounds), from the form kept on
// each: what changed, for the AI
export const usesAgain = (features: Feature[], classLevel: number, applied: unknown): string[] => {
  const changed: string[] = [];
  for (const feature of features) {
    const form = (feature as {usesByLevel?: UsesByLevel}).usesByLevel;
    const charges = feature.charges ?? Object.values(feature.adjustments || {}).map((v: any) => v?.charges).find(Boolean);
    if (!form || !charges) continue;
    const total = usesAt(form, classLevel, applied);
    if (total === charges.total) continue;
    const spent = (Number(charges.total) || 0) - (Number(charges.current) || 0);
    charges.total = total;
    charges.current = Math.max(0, total - spent);
    changed.push(`${feature.name}: ${total} ${charges.label || 'uses'} now`);
  }
  return changed;
};

// the rules text saying a number grows with level: "+1 per 2 levels", "every four levels", "half his level", "at 5th
// level and every 5 levels thereafter", "increases by 1 for every 4 levels"
const GROWS = /\bper (two|three|four|five|six|\d+) (class |character )?levels?\b|\bper (class |character )?level\b|\bevery (two|three|four|five|six|\d+|other) (class |character )?levels?\b|\b(1\/2|one-half|half) (of )?(his|her|their|its|the|your)? ?([\w-]+ )?levels?\b|\b(\d+)(st|nd|rd|th) level,? and every\b|\bincreases? by [^.]{0,30}\b(at|every|for every)\b[^.]{0,30}\blevels?\b/i;

const isNumber = (value: unknown): boolean => typeof value === 'number'
  || (!!value && typeof value === 'object' && typeof (value as {value?: unknown}).value === 'number');
const isLevelFormula = (value: unknown): boolean => /\{level/.test(String(value && typeof value === 'object' && 'value' in (value as object) ? (value as any).value : value));

// a feature whose text says its number grows with level, but whose numbers are fixed: the growth left out (Studied
// Target's +1 that stayed +1). one with no number to grow (sneak attack's dice are in its text) is left alone
export const growthProblems = (feature: Feature): string[] => {
  const text = [feature.description, ...Object.values(feature.adjustments || {}).map((v: any) => v?.description)].filter(Boolean).join(' ');
  const said = GROWS.exec(text);
  if (!said) return [];
  if ((feature as {usesByLevel?: unknown}).usesByLevel) return [];
  const numbers = holders(feature).flatMap(h => Object.entries(h)).filter(([path, value]) =>
    !['adjustments', 'charges'].includes(path) && (isNumber(value) || isLevelFormula(value)));
  if (!numbers.length || numbers.some(([, value]) => isLevelFormula(value))) return [];
  return [`${feature.name || 'a feature'}: its text says it grows ("${said[0]}"), but ${numbers.map(([p]) => p).join(', ')} stay${numbers.length === 1 ? 's' : ''} the same at every level: give "grows" with its value at each level the class table changes it`];
};
