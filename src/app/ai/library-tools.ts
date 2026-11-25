import {ApplyCharacterService} from '../apply-character.service';
import {FavoredClassOption} from '../interfaces/character.interface';
import {LibraryService, nameKey} from '../library/library.service';
import {LIBRARY_KINDS, LibraryIndexRow, LibraryKind} from '../library/library-index';
import {ArchetypeData, LibraryEntry, RaceData, choiceProblems, classLevelsOf, entryFeatures, raceFeaturesWith} from '../library/library-entry';
import {Archetype, ClassLevel, archetypesOf} from '../utils/classlevel.class';
import {favoredClassOptionFrom} from './favored-class';
import {parseJsonArg} from './json-arg';
import {LibraryClassLevel} from './level-up';
import {racialTraitProblems} from './page-facts';
import {RuleKind} from './rules-lookup';

// the library (library/, public/library) as the AI's tools read it: its entries are the app's own rules, written and
// checked once, so where one exists it is the authority. the AI finds it (search_library, or look_up_rules, which
// answers from it first), reads its text and choices (get_library_entry), and takes it with the player's picks
// (set_race, add_class_level and create_feature with library_id): the entry is copied onto the character, which keeps
// all it needs, each copy with the entry's id (libraryId). no page is read and nothing is written by the AI

// the library of the tools that are run without one (a spec): the same static files
export const defaultLibrary = new LibraryService();

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const list = (value: unknown): string[] =>
  (Array.isArray(value) ? value.map(String) : text(value).split(',')).map(item => item.trim()).filter(item => item && !/^none$/i.test(item));

// the player's picks, a JSON object by the choices' ids ({"ability": "str"})
const picksOf = (value: unknown): {picks: {[choice: string]: string}, error?: string} => {
  if (value === undefined || value === null || value === '') return {picks: {}};
  const read = typeof value === 'string' ? parseJsonArg(value, 'choices') : {value};
  if (read.error) return {picks: {}, error: read.error};
  if (!read.value || typeof read.value !== 'object' || Array.isArray(read.value)) return {picks: {}, error: 'choices is a JSON object of the player\'s picks by their ids: {"ability": "str"}'};
  return {picks: Object.fromEntries(Object.entries(read.value as object).map(([id, pick]) => [id, String(pick).trim()]))};
};

// the picks a taken entry still needs: each choice named in what it built and left unpicked (one an alternate trait
// replaced is not asked for), and each given that its kind or options don't allow
const pickProblems = (choices: LibraryEntry['choices'], picks: {[choice: string]: string}, built: unknown): string[] => {
  const written = JSON.stringify(built);
  return choiceProblems((choices || []).filter(choice => written.includes(`{choice:${choice.id}}`) || picks[choice.id] !== undefined), picks)
    .map(problem => `choices: ${problem}`);
};

// a row as the AI reads it in a list: enough to tell entries apart and take one
const rowOf = (row: LibraryIndexRow) => ({
  id: row.id, kind: row.kind, name: row.name, book: row.source?.book,
  ...(row.facts && Object.keys(row.facts).length ? {facts: row.facts} : {}),
  ...(row.tags.length ? {tags: row.tags.slice(0, 10)} : {}),
});

export const searchLibrary = async (library: LibraryService, args: {[name: string]: unknown}): Promise<object> => {
  const kind = text(args['kind']);
  if (kind && !LIBRARY_KINDS.includes(kind as LibraryKind)) return {error: `kind is one of ${LIBRARY_KINDS.join(', ')}`};
  let facts: {[fact: string]: string} | undefined;
  if (args['facts'] !== undefined && args['facts'] !== '') {
    const read = typeof args['facts'] === 'string' ? parseJsonArg(args['facts'], 'facts') : {value: args['facts']};
    if (read.error) return {error: read.error};
    facts = Object.fromEntries(Object.entries((read.value || {}) as object).map(([fact, value]) => [fact, String(value)]));
  }
  const rows = await library.search({text: text(args['text']), ...(kind ? {kind: kind as LibraryKind} : {}), tags: list(args['tags']), facts, limit: 25});
  if (!rows.length) {
    return {found: [], note: 'the library has no such entry: look_up_rules reads its page, and the rule is built from it as usual'};
  }
  return {found: rows.map(rowOf), use: 'get_library_entry reads one (its rules text and choices); take it with library_id'};
};

// what the AI needs to take an entry: its rules text, the choices it leaves to the player, and for a race or a class
// what goes with it (alternate racial traits, favored class options, archetypes)
export const getLibraryEntry = async (library: LibraryService, args: {[name: string]: unknown}): Promise<object> => {
  const entry = await entryNamed(library, args['id'] ?? args['name'], text(args['kind']) as LibraryKind);
  if (!entry) return {error: `no library entry ${text(args['id'] ?? args['name'])}: search_library finds one by its name or what it does`};
  const index = await library.loadIndex();
  const related = entry.kind === 'race'
    ? {
      alternateRacialTraits: index.entries.filter(row => row.kind === 'racial-trait' && nameKey(String(row.facts?.['race'] ?? '')) === nameKey(entry.name))
        .map(row => ({id: row.id, name: row.name, replaces: row.facts?.['replaces']})),
      favoredClassOptions: ((entry.data as RaceData).favoredClassOptions || []).map(option => ({class: option.class, description: option.description,
        ...(option.choices?.length ? {choices: option.choices} : {})})),
    }
    : entry.kind === 'class'
    ? {archetypes: index.entries.filter(row => row.kind === 'archetype' && row.id.startsWith(`archetype/${entry.id.split('/')[1]}/`)).map(row => ({id: row.id, name: row.name}))}
    : entry.kind === 'archetype' ? {trades: (entry.data as ArchetypeData).archetype} : {};
  return {
    id: entry.id, kind: entry.kind, name: entry.name, book: entry.source.book, text: entry.text,
    ...(entry.choices?.length ? {choices: entry.choices} : {}),
    ...(entry.facts ? {facts: entry.facts} : {}),
    ...related,
    use: useOf(entry),
  };
};

const useOf = (entry: LibraryEntry): string =>
  entry.kind === 'race' ? `set_race library_id "${entry.id}", with alternate_traits (the ids of those the player picked) and choices (the picks of its and their choices)`
  : entry.kind === 'class' ? `add_class_level library_id "${entry.id}", with library_archetypes (the archetypes taken at this level) and choices`
  : entry.kind === 'archetype' ? `add_class_level of its class, library_archetypes ["${entry.id}"], at a level before the features it trades`
  : entry.kind === 'racial-trait' ? 'set_race of its race, with its id in alternate_traits'
  : `create_feature library_id "${entry.id}", with choices`;

// an entry by its id, or by its name (an alias, any spelling) and kind
const entryNamed = async (library: LibraryService, named: unknown, kind?: LibraryKind): Promise<LibraryEntry | undefined> => {
  const wanted = text(named);
  if (!wanted) return undefined;
  if (/^[a-z-]+\//.test(wanted)) return library.get(wanted);
  return library.find(wanted, kind || undefined);
};

// look_up_rules asked for a rule the library has: its entry stands for the page (no page read, no AI call)
const LIBRARY_KIND_OF: {[kind in RuleKind]?: LibraryKind} = {race: 'race', class: 'class', archetype: 'archetype', feat: 'feat', trait: 'trait'};
export const libraryAnswer = async (library: LibraryService, name: string, kind?: RuleKind): Promise<object | undefined> => {
  const libraryKind = kind ? LIBRARY_KIND_OF[kind] : undefined;
  if (kind && !libraryKind) return undefined;
  let entry = await library.find(name, libraryKind);
  // an archetype is looked up with its class first ("Barbarian Invulnerable Rager")
  if (!entry && (!kind || kind === 'archetype')) {
    const rows = (await library.loadIndex()).entries.filter(row => row.kind === 'archetype'
      && nameKey(name) === nameKey(`${row.id.split('/')[1]} ${row.name}`));
    if (rows.length === 1) entry = await library.get(rows[0].id);
  }
  if (!entry) return undefined;
  return {fromLibrary: true, ...(await getLibraryEntry(library, {id: entry.id})),
    note: 'this is the app\'s own library: its rules are the authority, already written as the sheet keeps them. Take it as "use" says instead of writing it'};
};

// a favored class option of the library as a race keeps it: its fractions as numbers, and an id made from its class
// and text, so taking the race again keeps the levels that picked it
const idOf = (seed: string): string => {
  let hash = 5381;
  for (const char of seed) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  return `fco-${hash.toString(36)}`;
};

export const raceFromLibrary = async (service: ApplyCharacterService, library: LibraryService, args: {[name: string]: unknown}) => {
  const race = await entryNamed(library, args['library_id'], 'race');
  if (!race || race.kind !== 'race') return {error: `no race ${text(args['library_id'])} in the library: search_library kind race`};
  const problems: string[] = [];
  const picks = picksOf(args['choices']);
  if (picks.error) problems.push(picks.error);
  // the alternate racial traits the player picked, by id or name, each of this race
  const alternates: LibraryEntry[] = [];
  for (const named of list(args['alternate_traits'])) {
    const found = /\//.test(named) ? await library.get(named) : await traitNamed(library, race.name, named);
    if (!found || found.kind !== 'racial-trait' || nameKey(String(found.facts?.['race'] ?? '')) !== nameKey(race.name)) {
      problems.push(`${named} is no alternate racial trait of the ${race.name} in the library (get_library_entry "${race.id}" lists them)`);
    } else alternates.push(found);
  }
  const features = raceFeaturesWith(race, alternates, picks.picks).map(feature => {
    const from = alternates.find(a => (a.data as {feature?: {name?: string}}).feature?.name === feature.name);
    return Object.assign(feature, {libraryId: from?.id ?? race.id});
  });
  problems.push(...pickProblems([...(race.choices || []), ...alternates.flatMap(a => a.choices || [])], picks.picks, features));
  const raceFacts: {[fact: string]: string} = Object.fromEntries(Object.entries(race.facts || {}).map(([fact, value]) => [fact, Array.isArray(value) ? value.join(', ') : String(value)]));
  problems.push(...racialTraitProblems(raceFacts, features));
  if (problems.length) return {error: 'nothing was changed: fix every one of these, all in one call', problems};
  const favoredClassOptions: FavoredClassOption[] = ((race.data as RaceData).favoredClassOptions || []).flatMap(option => {
    const read = favoredClassOptionFrom({class: option.class, description: option.description, adjustments: option.adjustments,
      ...(option.descriptionOnly ? {description_only: option.descriptionOnly} : {}), ...(option.choices ? {choices: option.choices} : {})});
    return read.option ? [{...read.option, id: idOf(`${option.class}|${option.description}`)}] : [];
  });
  const raw = service.raw();
  const was = raw.race?.features?.length ? raw.race.name : undefined;
  const data = race.data as RaceData;
  return service.labelled(`race ${race.name}`, () => {
    service.update({race: {...raw.race, name: race.name, subtype: data.subtype, features, libraryId: race.id,
      ...(data.quadruped ? {quadruped: true} : {}), favoredClassOptions}});
    return {
      done: `${was ? `race ${was} -> ${race.name}` : `race ${race.name}`} from the library: ${features.map(f => f.name).join(', ')}`,
      ...(alternates.length ? {alternateTraits: alternates.map(a => a.name)} : {}),
    };
  });
};

// an alternate racial trait of a race by its name
const traitNamed = async (library: LibraryService, race: string, named: string): Promise<LibraryEntry | undefined> => {
  const row = (await library.search({text: named, kind: 'racial-trait', facts: {race}, limit: 50})).find(r => nameKey(r.name) === nameKey(named));
  return row ? library.get(row.id) : undefined;
};

// the next level of a class built from its library entry: its fixed values (a 1st level's proficiencies, wealth and
// spellcasting), and the features its table gains at that level with the trades of its archetypes made (those the
// class has already and those taken now)
export const classLevelFromLibrary = async (
  service: ApplyCharacterService, library: LibraryService, args: {[name: string]: unknown},
): Promise<{level?: LibraryClassLevel, error?: string}> => {
  const cls = await entryNamed(library, args['library_id'], 'class');
  if (!cls || cls.kind !== 'class') return {error: `no class ${text(args['library_id'])} in the library: search_library kind class`};
  const raw = service.raw();
  const problems: string[] = [];
  const picks = picksOf(args['choices']);
  if (picks.error) problems.push(picks.error);
  const levels = raw.classLevels || [];
  const className = cls.name;
  const level = levels.filter(l => nameKey(l.name) === nameKey(className)).length + 1;
  // the archetypes the class has (by their library ids) and those taken now
  const had = archetypesOf(levels, className).map(a => a.libraryId).filter((id): id is string => !!id);
  const taken: (LibraryEntry & {kind: 'archetype'})[] = [];
  for (const named of list(args['library_archetypes'])) {
    const archetype = await entryNamed(library, named, 'archetype');
    if (!archetype || archetype.kind !== 'archetype' || (archetype.data as ArchetypeData).class !== cls.id) {
      problems.push(`${named} is no archetype of the ${className} in the library (get_library_entry "${cls.id}" lists them)`);
    } else taken.push(archetype as LibraryEntry & {kind: 'archetype'});
  }
  // an archetype written by hand beside a library class is never read: a monk's Master of Many Styles given so was
  // dropped, and the level came out a plain monk's. it is refused with the library's id for it
  const written = (() => {
    const given = args['archetypes'];
    if (given === undefined || given === '' || given === null) return [];
    try {
      const parsed = typeof given === 'string' ? JSON.parse(given) : given;
      return (Array.isArray(parsed) ? parsed : [parsed]).map(a => typeof a === 'string' ? a : text((a as {name?: unknown})?.name)).filter(Boolean);
    } catch { return [text(given)]; }
  })();
  for (const named of written) {
    const archetype = await entryNamed(library, named, 'archetype');
    problems.push(archetype && archetype.kind === 'archetype' && (archetype.data as ArchetypeData).class === cls.id
      ? `${named}: a class of the library takes its archetypes by id, never written out: library_archetypes "${archetype.id}"`
      : `${named} is no archetype of the ${className} in the library: take it by id from those get_library_entry "${cls.id}" lists, or add the level without library_id to build it from its page`);
  }
  const before = (await Promise.all(had.map(id => library.get(id)))).filter((e): e is LibraryEntry & {kind: 'archetype'} => e?.kind === 'archetype');
  const archetypes = [...before, ...taken];
  const built = classLevelsOf(cls as LibraryEntry & {kind: 'class'}, level, picks.picks, service.applied(), archetypes);
  const plain = classLevelsOf(cls as LibraryEntry & {kind: 'class'}, level, picks.picks, service.applied(), []);
  const features = built.levels[level - 1].features.map(feature => {
    const own = archetypes.find(a => (a.data as ArchetypeData).features.some(f => f.name === feature.name && f.gainedAt === level));
    return Object.assign(feature, {libraryId: own?.id ?? cls.id});
  });
  // the class's picks (a ranger's favored enemy) are asked at the level whose features name them
  problems.push(...pickProblems([...(cls.choices || []), ...archetypes.flatMap(a => a.choices || [])], picks.picks, features), ...built.problems);
  const entry = new ClassLevel({...plain.levels[level - 1], libraryId: cls.id, features: []});
  if (level === 1 && levels.length) entry.startingWealth = 0;
  const trades = taken.map(archetype => ({...JSON.parse(JSON.stringify((archetype.data as ArchetypeData).archetype)), libraryId: archetype.id}) as Archetype);
  return {level: {entry, archetypes: trades, features, problems}};
};

// a feat, a trait or a class option of the library, copied into the list it goes in
export const featureFromLibrary = async (library: LibraryService, args: {[name: string]: unknown}) => {
  const entry = await entryNamed(library, args['library_id']);
  if (!entry || !['feat', 'trait', 'class-option', 'racial-trait'].includes(entry.kind)) {
    return {error: `no feat, trait or class option ${text(args['library_id'])} in the library: search_library finds one`};
  }
  if (entry.kind === 'racial-trait') return {error: `${entry.name} is an alternate racial trait: set_race of the ${entry.facts?.['race']}, with it in alternate_traits`};
  const picks = picksOf(args['choices']);
  const features = entryFeatures(entry, picks.picks).map(feature => Object.assign(feature, {libraryId: entry.id}));
  const problems = [...(picks.error ? [picks.error] : []), ...pickProblems(entry.choices, picks.picks, features)];
  if (problems.length) return {error: 'nothing was changed', problems};
  return {entry, features};
};
