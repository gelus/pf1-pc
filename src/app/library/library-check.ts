import {ApplyCharacterService} from '../apply-character.service';
import {FavoredClassOption, Feature} from '../interfaces/character.interface';
import {formatProblems, validateFeature} from '../rules/adjustment-schema';
import {Character} from '../utils/character.class';
import {ClassLevel} from '../utils/classlevel.class';
import {getByPath} from '../utils/object.util';
import {favoredClassOptionFrom} from '../ai/favored-class';
import {growthProblems} from '../ai/feature-form';
import {mechanicsProblems} from '../ai/mechanics';
import {missingRacialTraits, racialTraitProblems} from '../ai/page-facts';
import {racialStatsIndex} from '../race-modal/race-modal.component';
import {archetypeRuleProblems, archetypeWarnings, traded} from '../rules/archetypes';
import {featureKey} from '../utils/classlevel.class';
import {ArchetypeData, ClassData, LibraryEntry, LibraryFavoredOption, RaceData, choiceProblems, classLevelsOf, entryFeatures, raceFeaturesWith} from './library-entry';
import {LibraryExample, adjustedPaths, entryShapeProblems} from './library-index';
import {nameKey} from './library.service';

// what is wrong with an entry of the library, all at once. an entry is the authority where it exists, so it is held
// to everything the AI's own writing is held to and more:
// - its shape (library-index.ts), and picks for its choices in every example
// - the validator (as pf1.validate and the builders), and the builders' reading of its features' text (a number the
//   text gives needs its path, mechanics.ts), its favored class options read as the AI's are (favored-class.ts)
// - its facts (a race's every standard trait there, an alternate one replacing what its race has, page-facts.ts)
// - its own rules text: every feature named in it, every number its adjustments give said in it
// - the engine: applied to a blank character (every ability 10), each example gives what it expects
// a kind whose checks are not written yet is refused, so no entry of it goes in unchecked

const SINGLE_FEATURE = ['feat', 'trait', 'class-option'];

const facts = (entry: LibraryEntry): {[fact: string]: string} =>
  Object.fromEntries(Object.entries(entry.facts || {}).map(([fact, value]) => [fact, Array.isArray(value) ? value.join(', ') : value]));

// the numbers an adjustment gives ({"value": 30, "mode": "set"} gives 30, "1/2" a half), as its text would say them,
// not the size (a number for a word)
const numbersOf = (adjustments: {[path: string]: unknown}): {path: string, said: string}[] =>
  Object.entries(adjustments).flatMap(([path, written]) => {
    if (path === 'size') return [];
    const value = written && typeof written === 'object' && !Array.isArray(written) ? (written as {value?: unknown}).value : written;
    if (typeof value === 'number' && value !== 0) return [{path, said: String(Math.abs(value))}];
    if (typeof value === 'string' && /^[+-]?\d+\s*\/\s*\d+$/.test(value.trim())) return [{path, said: value.trim().replace(/^[+-]/, '').replace(/\s/g, '')}];
    return [];
  });

// a number said in the text, a 1 also as "a", "an" or "one" ("gain Endurance as a bonus feat")
const says = (text: string, number: string): boolean =>
  new RegExp(`(^|[^0-9/])${number.replace('/', '\\/')}([^0-9/]|$)`).test(text) || (number === '1' && /\b(a|an|one|once)\b/i.test(text));

const textProblems = (text: string, features: Feature[], skip: number): string[] => {
  const problems: string[] = [];
  features.forEach((feature, at) => {
    if (at === skip) return;
    if (!nameKey(text).includes(nameKey(feature.name || ''))) problems.push(`${feature.name}: its rules text does not name it`);
    // a count of the feats it gives is said by naming them ("gains Improved Unarmed Strike and Catch Off-Guard as bonus feats")
    const given = ((feature.adjustments as {feats?: unknown[]}).feats || []).length;
    for (const {path, said} of numbersOf(feature.adjustments as {[path: string]: unknown})) {
      if (path === 'bonusFeats' && Number(said) === given) continue;
      if (!says(text, said)) problems.push(`${feature.name}: ${path} gives ${said}, which its rules text never says`);
    }
  });
  return problems;
};

// a race's favored class options read as the AI's are, each held to its own text
const favoredProblems = (entry: LibraryEntry, options: LibraryFavoredOption[]): {options: FavoredClassOption[], problems: string[]} => {
  const problems: string[] = [];
  const read: FavoredClassOption[] = [];
  options.forEach((option, n) => {
    const where = `${entry.id} favored class option ${n + 1} (${option.class})`;
    const from = favoredClassOptionFrom({class: option.class, description: option.description, adjustments: option.adjustments,
      ...(option.descriptionOnly ? {description_only: option.descriptionOnly} : {})});
    problems.push(...from.problems.map(p => `${where}: ${p}`));
    if (option.source && !option.source.book) problems.push(`${where}: its source book`);
    for (const {path, said} of numbersOf(option.adjustments)) {
      if (!says(option.description, said)) problems.push(`${where}: ${path} gives ${said}, which its text never says`);
    }
    if (from.option) read.push({...from.option, ...(option.name ? {name: option.name} : {})});
  });
  return {options: read, problems};
};

// the applied character's value at a path against what an example expects: null is nothing there (a trait an
// alternate one replaced), a list holds every item expected (any case), anything else is equal
const expectProblems = (applied: Character, example: LibraryExample, where: string): string[] =>
  Object.entries(example.expect).flatMap(([path, wanted]) => {
    const value = getByPath(applied, path);
    const same = wanted === null ? value === undefined || value === null
      : Array.isArray(wanted)
      ? Array.isArray(value) && wanted.every(item => value.some(has => String(has).toLowerCase() === String(item).toLowerCase()))
      : typeof wanted === 'string' ? String(value ?? '').toLowerCase() === wanted.toLowerCase()
      : value === wanted;
    return same ? [] : [`${where}: ${path} is ${JSON.stringify(value)}, the example expects ${JSON.stringify(wanted)}`];
  });

// a blank character to apply an entry to: every ability 10, nothing else
const blank = (): Character => {
  const character = new Character();
  character.abilityScores = {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10};
  return character;
};

// levels of a class taking a favored class option, as an example asks
const favoredLevels = (example: LibraryExample, options: FavoredClassOption[], where: string): {levels: ClassLevel[], problem?: string} => {
  const asked = example.favored;
  if (!asked) return {levels: []};
  const forClass = options.filter(o => nameKey(o.class) === nameKey(asked.class));
  const option = asked.option ? forClass.find(o => nameKey(o.description).startsWith(nameKey(asked.option!))) : forClass.length === 1 ? forClass[0] : undefined;
  if (!option) return {levels: [], problem: `${where}: no one favored class option of ${asked.class}${asked.option ? ` starting "${asked.option}"` : ''}`};
  return {levels: Array.from({length: asked.picks}, (_, i) => new ClassLevel({name: asked.class, level: i + 1, favoredClassBonus: 'other', favoredClassOption: option.id}))};
};

// a variant is one kind of situation, named for it alone: "savingThrowBonus[fear]" and "savingThrowBonus[despair]",
// never "savingThrowBonus[vs. fear and despair effects]". bonuses for one situation from different sources then meet
// under one name, where they stack or not by their types
const variantProblems = (entry: LibraryEntry): string[] => {
  const options = entry.kind === 'race' ? (entry.data as RaceData).favoredClassOptions || [] : [];
  const grown = entry.kind === 'class' || entry.kind === 'archetype' ? (entry.data as ClassData | ArchetypeData).features.flatMap(feature => Object.keys(feature.grows || {})) : [];
  return [...new Set([...adjustedPaths(entry.data), ...grown, ...options.flatMap(option => Object.keys(option.adjustments))])].flatMap(path => {
    const label = /\[(.*)\]$/.exec(path)?.[1];
    if (label === undefined) return [];
    if (/^(vs\.?|versus|against|when|while|to)\s/i.test(label)) return [`${entry.id}: ${path}: a variant is the situation alone ("saves.will[fear]", "cmd[trip]")`];
    if (/,|\bor\b(?!\s+(more|fewer|less|larger|smaller|higher|lower)\b)/i.test(label)) return [`${entry.id}: ${path}: one variant for each situation it names ("savingThrowBonus[fear]" and "savingThrowBonus[despair]")`];
    return [];
  });
};

// a number of the class table ("+6/+1" is 6)
const first = (said: string): number => Number(/[+-]?\d+/.exec(said)?.[0] ?? NaN);

// a class held to its page and to what the AI's class features are held to:
// - at every level of its table, the engine's base attack bonus and base saves are the table's (its progressions)
// - its features: the validator, the checks of class features (mechanics.ts, growth.ts), each named in its text, and
//   its tables fitted into formulas (feature-form.ts)
// - each example, at its level: what the engine gives
// an archetype is checked the same way, built on its class (shown: the entry whose examples and text are checked)
const classProblems = (
  entry: LibraryEntry & {kind: 'class'}, service: ApplyCharacterService,
  archetypes: (LibraryEntry & {kind: 'archetype'})[] = [], shown: LibraryEntry = entry,
): string[] => {
  const problems: string[] = [];
  const data = entry.data as ClassData;
  const at = (levels: number, picks?: {[choice: string]: string}, scores?: {[ability: string]: number}): ReturnType<typeof classLevelsOf> => {
    const once = classLevelsOf(entry, levels, picks, undefined, archetypes);
    const character = blank();
    Object.assign(character.abilityScores, scores || {});
    character.classLevels = once.levels;
    service.initializeCharacter(JSON.parse(JSON.stringify(character)));
    // the uses a day need the character's ability modifiers: built again with them, as a level up does
    const again = classLevelsOf(entry, levels, picks, service.applied(), archetypes);
    character.classLevels = again.levels;
    service.initializeCharacter(JSON.parse(JSON.stringify(character)));
    return again;
  };
  const choices = shown.examples?.find(example => example.choices)?.choices;
  // an archetype that changes the casting is held to its own tables, not the class's
  const casting = archetypes.some(archetype => archetype.data.archetype.spellcasting) ? undefined : data.preset.spellcasting;
  for (const row of data.table) {
    const built = at(row.level, choices, casting ? {[casting.ability]: 30} : undefined);
    if (row.level === data.table.length) problems.push(...[...new Set(built.problems)].map(p => `${shown.id}: ${p}`));
    const applied = service.applied();
    const wanted = {bab: first(row.bab), fort: first(row.fort), ref: first(row.ref), will: first(row.will)};
    const has = {bab: applied.bab, fort: applied.saves.fort, ref: applied.saves.ref, will: applied.saves.will};
    for (const key of Object.keys(wanted) as (keyof typeof wanted)[]) {
      if (has[key] !== wanted[key]) problems.push(`${entry.id} level ${row.level}: ${key} is ${has[key]}, its table says ${wanted[key]}`);
    }
    // a caster's spells per day and spells known, as its tables give them (before bonus spells)
    const levels = (applied.spells as {[origin: string]: {spells?: {base?: number, known?: number}[]}})[casting?.origin ?? '']?.spells || [];
    for (const [field, said] of [['base', row.spells], ['known', row.known]] as const) {
      for (const [level, count] of Object.entries(said || {})) {
        const has = levels[Number(level)]?.[field] ?? 0;
        if (has !== count) problems.push(`${entry.id} level ${row.level}: ${field === 'base' ? 'spells per day' : 'spells known'} of level ${level} is ${has}, its table says ${count}`);
      }
    }
  }
  const top = classLevelsOf(entry, data.table.length, choices, undefined, archetypes).levels;
  const all = top.flatMap(level => level.features);
  // the rules of archetypes: taken at the class's 1st level, no class feature they trade left at any level
  if (archetypes.length) {
    problems.push(...archetypeRuleProblems([], top[0], archetypes.map(a => a.data.archetype)).map(p => `${shown.id}: ${p}`));
    problems.push(...archetypeWarnings(top).map(p => `${shown.id}: ${p}`));
  }
  const invalid = all.flatMap((feature, i) => validateFeature(JSON.parse(JSON.stringify(feature)), {reference: service.applied()}, `${feature.name || 'feature'} [${i}]`))
    .filter(problem => problem.severity === 'error');
  problems.push(...formatProblems(invalid).split('\n').filter(Boolean).map(p => `${shown.id}: ${p}`));
  // read as the builders read them, once their tables are fitted (feature-form.ts)
  // an archetype's own features are its to answer for, its class's are checked with the class
  const mine = archetypes.length ? all.filter(f => archetypes.some(a => a.data.features.some(g => g.name === f.name))) : all;
  problems.push(...mechanicsProblems(mine, {classFeatures: true}).map(p => `${shown.id}: ${p}`));
  problems.push(...mine.flatMap(growthProblems).map(p => `${shown.id}: ${p}`));
  // the shown entry's own features named in its own text (an archetype's, not its class's)
  problems.push(...textProblems(shown.text, mine, -1).map(p => `${shown.id}: ${p}`));
  if (!shown.examples?.length) problems.push(`${shown.id}: an example, what the engine gives at a level of it`);
  (shown.examples || []).forEach((example, n) => {
    const where = `${shown.id} example ${n + 1}`;
    const picks = choiceProblems([...(shown.choices || []), ...(shown === entry ? [] : entry.choices || [])], example.choices);
    if (picks.length) { problems.push(...picks.map(p => `${where}: pick ${p}`)); return; }
    at(example.level ?? 1, example.choices, example.abilityScores);
    problems.push(...expectProblems(service.applied(), example, where));
  });
  return problems;
};

export const entryProblems = (entry: LibraryEntry, service: ApplyCharacterService, library: LibraryEntry[] = []): string[] => {
  const problems = entryShapeProblems(entry);
  if (problems.length) return problems;
  problems.push(...variantProblems(entry));
  if (entry.kind === 'class') return [...problems, ...classProblems(entry, service)];
  if (entry.kind === 'archetype') {
    const data = entry.data as ArchetypeData;
    const cls = library.find(e => e.id === data.class && e.kind === 'class') as LibraryEntry & {kind: 'class'} | undefined;
    if (!cls) return [...problems, `${entry.id}: its class ${data.class} is no class of the library`];
    // what it trades is a feature of its class, by the names the class page gives them
    const features = new Set((cls.data as ClassData).features.map(f => featureKey(f.name)));
    const unknown = traded(data.archetype).filter(name => !features.has(featureKey(name)));
    if (unknown.length) problems.push(`${entry.id}: it trades ${unknown.join(', ')}, which ${cls.name} has no feature of`);
    // and exactly what its page says it replaces or alters (its facts, read from the page)
    const said = new Set([entry.facts?.['replaced features'] ?? []].flat().map(featureKey));
    const trades = new Set(traded(data.archetype).map(featureKey));
    const left = [...said].filter(name => !trades.has(name));
    const more = [...trades].filter(name => !said.has(name));
    if (left.length || more.length) {
      problems.push(`${entry.id}: its page says it replaces or alters ${[...said].join(', ') || 'nothing'}, its data trades ${[...trades].join(', ') || 'nothing'}`);
    }
    return [...problems, ...classProblems(cls, service, [entry as LibraryEntry & {kind: 'archetype'}], entry)];
  }
  const race = entry.kind === 'race' ? entry
    : entry.kind === 'racial-trait' ? library.find(e => e.kind === 'race' && nameKey(e.name) === nameKey(String(entry.facts?.['race'] ?? ''))) as LibraryEntry & {kind: 'race'} | undefined
    : undefined;
  if (entry.kind === 'racial-trait' && !race) return [`${entry.id}: its race (facts.race) is no race of the library`];
  if (!race && !SINGLE_FEATURE.includes(entry.kind)) return [`${entry.id}: the checks of a ${entry.kind} entry are not written yet`];
  const favored = entry.kind === 'race' ? favoredProblems(entry, (entry.data as RaceData).favoredClassOptions || []) : {options: [], problems: []};
  problems.push(...favored.problems);
  if (!entry.examples?.length) problems.push(`${entry.id}: an example, what the engine gives once it is applied`);
  (entry.examples || []).forEach((example, n) => {
    const where = `${entry.id} example ${n + 1}`;
    const picks = choiceProblems([...(entry.choices || []), ...(race && race !== entry ? race.choices || [] : [])], example.choices);
    if (picks.length) { problems.push(...picks.map(p => `${where}: pick ${p}`)); return; }
    const own = entryFeatures(entry, example.choices);
    const features = entry.kind === 'race' ? own : race ? raceFeaturesWith(race, [entry], example.choices) : own;
    const character = blank();
    if (race) {
      character.race = {...character.race, name: race.name, subtype: (race.data as RaceData).subtype, features, favoredClassOptions: favored.options};
    } else {
      character.feats = own;
    }
    const levels = favoredLevels(example, favored.options, where);
    if (levels.problem) problems.push(levels.problem);
    if (levels.levels.length) {
      character.classLevels = levels.levels;
      character.favoredClasses = [example.favored!.class];
    }
    service.initializeCharacter(JSON.parse(JSON.stringify(character)));
    const invalid = own.flatMap((feature, i) => validateFeature(JSON.parse(JSON.stringify(feature)), {reference: service.applied()}, `${feature.name || 'feature'} [${i}]`))
      .filter(problem => problem.severity === 'error');
    problems.push(...formatProblems(invalid).split('\n').filter(Boolean).map(p => `${where}: ${p}`));
    // the first example is read for what holds whatever the picks (its text, its facts, its features' writing)
    if (n === 0) {
      problems.push(...mechanicsProblems(own).map(p => `${entry.id}: ${p}`));
      if (race) {
        const missing = entry.kind === 'race' ? missingRacialTraits(facts(race), features) : [];
        if (missing.length) problems.push(`${entry.id}: its racial traits fact lists ${missing.join(', ')}, which no feature is`);
        problems.push(...racialTraitProblems(facts(race), features).map(p => `${entry.id}: ${p}`));
      }
      problems.push(...textProblems(entry.text, own, entry.kind === 'race' ? racialStatsIndex(own) : -1).map(p => `${entry.id}: ${p}`));
    }
    problems.push(...expectProblems(service.applied(), example, where));
  });
  return problems;
};
