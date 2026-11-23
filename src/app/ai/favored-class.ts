import {Adjustments, FavoredClassOption, Feature} from '../interfaces/character.interface';
import {formatProblems, validateAdjustments} from '../rules/adjustment-schema';
import {parseJsonArg} from './json-arg';
import {mechanicsProblems, normalizedFeature} from './mechanics';
import {v4} from 'uuid';

// the alternate favored class bonuses of a race as the AI writes them from its page ("Wizard: Add +1/4 to the
// wizard's caster level when casting spells of the necromancy school"): its class, its text, and what one pick of it
// adjusts, a fraction written as a number or as "1/4". checked as any feature: a number its text gives needs its path

const isObject = (value: unknown): value is {[key: string]: unknown} =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const lower = (value: unknown): string => (typeof value === 'string' ? value : '').trim().toLowerCase();

// "1/4", "+1/2", "1/6" are what one pick adds: 0.25, 0.5, 0.1666...
const perPick = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const fraction = /^\s*([+-]?)\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(value);
  return fraction ? (fraction[1] === '-' ? -1 : 1) * Number(fraction[2]) / Number(fraction[3]) : value;
};

export const favoredClassOptionFrom = (
  given: unknown, defaultClass?: string,
): {option?: FavoredClassOption, problems: string[]} => {
  const read = typeof given === 'string' && given.trim().startsWith('{') ? parseJsonArg(given, 'favored_class_option') : {value: given};
  if (read.error) return {problems: [read.error]};
  if (!isObject(read.value)) return {problems: ['an alternate favored class bonus is {"class": "Wizard", "description": "+1/4 caster level with necromancy spells", "adjustments": {"spells.wizard.casterLevel[necromancy]": "1/4"}}']};
  const value = read.value;
  const className = String(value['class'] ?? defaultClass ?? '').trim();
  const description = String(value['description'] ?? value['text'] ?? '').trim();
  const name = String(value['name'] ?? '').trim();
  const label = `the ${className || 'class'} favored class bonus`;
  const problems: string[] = [];
  if (!className) problems.push(`${label}: its class`);
  if (!description) problems.push(`${label}: its description, as its page says it`);
  let adjustments: unknown = value['adjustments'] ?? {};
  if (typeof adjustments === 'string') adjustments = parseJsonArg(adjustments, 'adjustments').value;
  if (!isObject(adjustments)) {
    problems.push(`${label}: adjustments is a JSON object of what one pick adds`);
    return {problems};
  }
  const kept: {[path: string]: unknown} = {};
  for (const [path, written] of Object.entries(normalizedFeature({adjustments}).adjustments as {[path: string]: unknown})) {
    kept[path] = isObject(written) && 'value' in written ? {...written, value: perPick(written['value'])} : perPick(written);
  }
  const invalid = validateAdjustments(kept).filter(p => p.severity === 'error');
  if (invalid.length) problems.push(...formatProblems(invalid).split('\n').filter(Boolean).map(p => `${label}: ${p}`));
  // its text's numbers as paths, as for any feature ("+1/4 to the caster level" is spells.<class>.casterLevel)
  const descriptionOnly = value['description_only'] ?? value['descriptionOnly'];
  problems.push(...mechanicsProblems([Object.assign(new Feature({name: label, description, adjustments: kept as Adjustments}),
    descriptionOnly ? {descriptionOnly: String(descriptionOnly)} : {})]));
  if (problems.length) return {problems};
  return {option: {id: v4(), class: className, ...(name ? {name} : {}), description, adjustments: kept as Adjustments}, problems: []};
};

// the option of the race a pick names: by its name or description (any case), among those for the class
export const findOption = (options: FavoredClassOption[], className: string, named: string): FavoredClassOption | undefined => {
  const wanted = lower(named);
  const forClass = options.filter(o => lower(o.class) === lower(className));
  return forClass.find(o => lower(o.name) === wanted || lower(o.description) === wanted || o.id === named)
    ?? forClass.find(o => wanted && (lower(o.description).includes(wanted) || lower(o.name).includes(wanted)))
    ?? (forClass.length === 1 && !wanted ? forClass[0] : undefined);
};

// two options are the same when they are for one class and say the same
export const sameOption = (a: FavoredClassOption, b: FavoredClassOption): boolean =>
  lower(a.class) === lower(b.class) && lower(a.description) === lower(b.description);
