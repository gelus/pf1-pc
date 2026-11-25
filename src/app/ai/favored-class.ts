import {Adjustments, FavoredClassOption, Feature} from '../interfaces/character.interface';
import {formatProblems, validateAdjustments} from '../rules/adjustment-schema';
import {parseJsonArg} from './json-arg';
import {mechanicsProblems, normalizedFeature} from './mechanics';
import {v4} from 'uuid';
import {missingPicks, withChoices} from '../utils/choices';

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
  // the picks its text leaves to the player at each pick ("against acid, cold, electricity, or fire"), named in its
  // adjustments as {choice:<id>}
  const choices = Array.isArray(value['choices']) ? value['choices'].filter(isObject).map(choice => ({
    id: String(choice['id'] ?? '').trim(), label: String(choice['label'] ?? choice['id'] ?? '').trim(),
    ...(Array.isArray(choice['options']) ? {options: choice['options'].map(String)} : {}),
  })) : [];
  // checked as one pick fills it, its first option (any pick, when it lists none)
  const sample = withChoices({adjustments: kept}, Object.fromEntries(choices.map(c => [c.id, c.options?.[0] ?? 'any']))).adjustments;
  const invalid = validateAdjustments(sample as Adjustments).filter(p => p.severity === 'error');
  if (invalid.length) problems.push(...formatProblems(invalid).split('\n').filter(Boolean).map(p => `${label}: ${p}`));
  // its text's numbers as paths, as for any feature ("+1/4 to the caster level" is spells.<class>.casterLevel)
  const descriptionOnly = value['description_only'] ?? value['descriptionOnly'];
  problems.push(...mechanicsProblems([Object.assign(new Feature({name: label, description, adjustments: kept as Adjustments}),
    descriptionOnly ? {descriptionOnly: String(descriptionOnly)} : {})]));
  const named = new Set([...JSON.stringify(kept).matchAll(/\{choice:([^}]+)\}/g)].map(m => m[1]));
  for (const id of named) if (!choices.some(c => c.id === id)) problems.push(`${label}: {choice:${id}} is in its adjustments, give it in "choices": [{"id": "${id}", "label": "...", "options": [...]}]`);
  if (problems.length) return {problems};
  return {option: {id: v4(), class: className, ...(name ? {name} : {}), description, adjustments: kept as Adjustments,
    ...(choices.length ? {choices} : {})}, problems: []};
};

// a level's picks of its option's choices (favored_class_choices, {"energy": "cold"}), each held to the option
export const favoredPicksFrom = (option: FavoredClassOption, given: unknown): {picks?: {[choice: string]: string}, problems: string[]} => {
  if (!option.choices?.length) return {problems: []};
  const read = typeof given === 'string' ? (given.trim() ? parseJsonArg(given, 'favored_class_choices') : {value: {}}) : {value: given ?? {}};
  if (read.error) return {problems: [read.error]};
  const value = isObject(read.value) ? read.value : {};
  const picks = Object.fromEntries(option.choices.filter(c => value[c.id] !== undefined).map(c => [c.id, String(value[c.id]).trim()]));
  const missing = missingPicks(option.choices, picks);
  return missing.length
    ? {problems: [`favored_class_choices: the bonus "${option.name || option.description}" needs the player's picks, as {${option.choices.map(c => `"${c.id}": "..."`).join(', ')}}: ${missing.join('; ')}`]}
    : {picks, problems: []};
};

// the option of the race a pick names: by its name or description (any case), among those for the class
export const findOption = (options: FavoredClassOption[], className: string, named: string): FavoredClassOption | undefined => {
  const wanted = lower(named);
  const forClass = options.filter(o => lower(o.class) === lower(className));
  return forClass.find(o => lower(o.name) === wanted || lower(o.description) === wanted || o.id === named)
    ?? forClass.find(o => wanted && (lower(o.description).includes(wanted) || lower(o.name).includes(wanted)))
    ?? (forClass.length === 1 && !wanted ? forClass[0] : undefined);
};

// a favored class bonus written out for a class the race lists its own for: the race's are the bonuses (a human monk's
// +1/4 ki point was written again as "kiPool", then "extraUses.ki pool", and the race's option went untaken). refused,
// naming the race's own to give by id or text; undefined when the race has none for the class (a race built from its page)
export const writtenOverRaceOptions = (options: FavoredClassOption[], className: string, written: FavoredClassOption): string | undefined => {
  const forClass = options.filter(o => lower(o.class) === lower(className));
  if (!forClass.length || forClass.some(o => sameOption(o, written))) return undefined;
  return `the race lists its own favored class bonuses for ${className}: give the one the player picked as favored_class_option, `
    + `by its id or its text, never written out: ${forClass.map(o => `"${o.id}" (${o.description})`).join('; ')}`;
};

// two options are the same when they are for one class and say the same
export const sameOption = (a: FavoredClassOption, b: FavoredClassOption): boolean =>
  lower(a.class) === lower(b.class) && lower(a.description) === lower(b.description);
