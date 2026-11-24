// the library: the app's own repository of rules (races, classes, archetypes, feats, traits, items, spells), each an
// entry in the app's own shapes with its adjustments already written and checked, and its full rules text. where an
// entry exists it is the authority: the AI reads its text and applies it instead of reading a page and writing the
// feature itself (the race of a half-orc took fourteen AI calls and still failed). entries are files under
// public/library, served as they are, and index.json lists them for search without loading them.
//
// this file has no imports: the build script (scripts/build-library.mts) runs it in node as it is, so the index the app
// searches is made by the same code the checks hold it to

// the kinds of entry, and the folder each is in (public/library/<kind>/...)
export const LIBRARY_KINDS = [
  'race', 'racial-trait', 'class', 'archetype', 'class-option', 'feat', 'trait', 'item', 'spell',
] as const;
export type LibraryKind = typeof LIBRARY_KINDS[number];

// bumped when the shape of an entry or the adjustment language changes in a way that needs every entry looked at
export const LIBRARY_SCHEMA_VERSION = 1;

// where an entry's rules come from: the book (its code in books.json, for the OGL notice), and the page read
export interface LibrarySource {
  book: string;
  page?: string;
  url?: string;
}

// a choice the player makes when the entry is taken (a half-orc's +2, Weapon Focus's weapon): its adjustments name it
// in their paths as {choice:<id>} ("abilityScores.{choice:ability}"), filled from the pick
export interface LibraryChoice {
  id: string;
  kind: 'ability' | 'skill' | 'weapon' | 'school' | 'energy' | 'text';
  label: string;
  // the picks allowed, when fewer than every one of its kind
  options?: string[];
}

// a pick of every choice and what the engine gives for it, at the paths of the applied character: the checks apply
// the entry to a blank character and hold it to these
export interface LibraryExample {
  choices?: {[choice: string]: string};
  // a class's: the levels of it the character has, and ability scores other than 10 (a caster's casting ability)
  level?: number;
  abilityScores?: {[ability: string]: number};
  // a race's alternate favored class bonus picked on this many levels of its class (the option whose text starts
  // with option, or the class's only one)
  favored?: {class: string; option?: string; picks: number};
  expect: {[path: string]: unknown};
}

export interface LibraryEntryBase {
  id: string;
  kind: LibraryKind;
  name: string;
  aliases?: string[];
  source: LibrarySource;
  // other books its data quotes (a spell-like ability's spell, a feat a trait grants), for the OGL notice
  cites?: string[];
  schemaVersion: number;
  // the full rules text, as markdown
  text: string;
  // the curated tags ("Combat", "Social", "Mobility"): the ones its adjustments show are added from them
  tags?: string[];
  // what the page-fact checks read: prerequisites, category, a race's racial traits, what an archetype replaces
  facts?: {[fact: string]: string | string[]};
  choices?: LibraryChoice[];
  examples?: LibraryExample[];
  data: unknown;
}

// a row of index.json: what search needs, without the text or the data
export interface LibraryIndexRow {
  id: string;
  kind: LibraryKind;
  name: string;
  aliases?: string[];
  tags: string[];
  facts?: {[fact: string]: string | string[]};
  source: LibrarySource;
  cites?: string[];
}

// the books an entry's rules come from: its own and those it cites
export const booksOf = (entry: Pick<LibraryIndexRow, 'source' | 'cites'>): string[] =>
  [...new Set([entry.source?.book, ...(entry.cites || [])].filter((book): book is string => !!book))];

export interface LibraryIndex {
  schemaVersion: number;
  entries: LibraryIndexRow[];
}

// the file an entry is in, under public/library
export const libraryFile = (id: string): string => `library/${id}.json`;

// what the adjustments of an entry show it does, as tags: by the paths they adjust, the same for every entry so a
// search by "AC" finds everything that adjusts it. a path is read without its variant ("saves.will[fear]")
const TAG_RULES: [RegExp, (match: RegExpExecArray) => string[]][] = [
  [/^(ac|touchAc|flatFootedAc)$/, () => ['AC']],
  [/^cmb$/, () => ['CMB']],
  [/^cmd$/, () => ['CMD']],
  [/^saves\.(fort|ref|will)$/, m => ['Saves', {fort: 'Fortitude', ref: 'Reflex', will: 'Will'}[m[1]] as string]],
  [/^savingThrowBonus$/, () => ['Saves']],
  [/^init$/, () => ['Initiative']],
  [/^hp$/, () => ['Hit Points']],
  [/^abilityScores\./, () => ['Ability Scores']],
  [/^skills\.([^.]+)(\.subSkills\.([^.]+))?\./, m => ['Skills', m[1] === '*' || m[1].startsWith('@') ? '' : titled(m[3] && m[3] !== '*' ? `${m[1]} (${m[3]})` : m[1])]],
  [/^(skillCheckBonus|bonusSkillRanks)$/, () => ['Skills']],
  [/^(melee|ranged)\.[^.]+\.toHitBonus$|^(attackRollBonus|meleeAttackRollBonus|rangedAttackRollBonus)$/, () => ['Attack']],
  [/^(melee|ranged)\.[^.]+\.damageBonus$/, () => ['Damage']],
  [/^(melee|ranged)$/, () => ['Attack']],
  [/^(spells|spellSchoolDcBonus|spellLikeAbilities)(\.|$)/, () => ['Casting']],
  [/^(speed\.|speedUnslowedByArmorAndLoad$|flyManeuverability$)/, () => ['Movement']],
  [/^senses\./, () => ['Senses']],
  [/^extraUses\./, () => ['Uses']],
  [/^bonusFeats$/, () => ['Feats']],
  [/^proficiencies\./, () => ['Proficiency']],
  [/^languages$/, () => ['Languages']],
  [/^(energyResistance|damageReduction|spellResistance|immunities|concealment)(\.|$)/, () => ['Defense']],
  [/^availableCombatOptions\./, () => ['Combat Options']],
  [/^size$/, () => ['Size']],
];

const titled = (text: string): string => text.replace(/\b[a-z]/g, letter => letter.toUpperCase());

// every path adjusted anywhere in the entry's data: a feature's adjustments, and those of the features they give
export const adjustedPaths = (data: unknown): string[] => {
  const paths: string[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { value.forEach(visit); return; }
    for (const [key, inner] of Object.entries(value)) {
      if (key === 'adjustments' && inner && typeof inner === 'object' && !Array.isArray(inner)) {
        paths.push(...Object.keys(inner));
      }
      visit(inner);
    }
  };
  visit(data);
  return paths;
};

export const derivedTags = (data: unknown): string[] => {
  const tags = new Set<string>();
  for (const written of adjustedPaths(data)) {
    const path = written.replace(/\[.*\]$/, '');
    if (written !== path) tags.add('Situational');
    for (const [rule, tagsOf] of TAG_RULES) {
      const match = rule.exec(path);
      if (match) tagsOf(match).filter(Boolean).forEach(tag => tags.add(tag));
    }
  }
  return [...tags];
};

// the row of the index for an entry: its curated tags with those its adjustments show, sorted
export const indexRow = (entry: LibraryEntryBase): LibraryIndexRow => ({
  id: entry.id,
  kind: entry.kind,
  name: entry.name,
  ...(entry.aliases?.length ? {aliases: entry.aliases} : {}),
  tags: [...new Set([...(entry.tags || []), ...derivedTags(entry.data)])].sort((a, b) => a.localeCompare(b)),
  ...(entry.facts && Object.keys(entry.facts).length ? {facts: entry.facts} : {}),
  source: entry.source,
  ...(entry.cites?.length ? {cites: entry.cites} : {}),
});

// what is wrong with the shape of an entry, the same in the build and in the checks: an id that is its kind and its
// file, the fields every entry has
export const entryShapeProblems = (entry: LibraryEntryBase, file?: string): string[] => {
  const problems: string[] = [];
  const where = entry?.id || file || 'an entry';
  if (!entry || typeof entry !== 'object') return [`${where}: not an object`];
  if (!LIBRARY_KINDS.includes(entry.kind)) problems.push(`${where}: kind is one of ${LIBRARY_KINDS.join(', ')}`);
  if (typeof entry.id !== 'string' || !entry.id.startsWith(`${entry.kind}/`)) problems.push(`${where}: its id starts with its kind ("${entry.kind}/...")`);
  else if (!/^[a-z0-9-]+(\/[a-z0-9-]+)+$/.test(entry.id)) problems.push(`${where}: its id is lower case words joined by "-", in folders ("race/half-orc")`);
  if (file && entry.id && file !== `${entry.id}.json`) problems.push(`${where}: is in ${file}, its id says ${entry.id}.json`);
  if (!entry.name?.trim()) problems.push(`${where}: its name`);
  if (!entry.source?.book?.trim()) problems.push(`${where}: its source book`);
  if (entry.schemaVersion !== LIBRARY_SCHEMA_VERSION) problems.push(`${where}: schemaVersion ${entry.schemaVersion}, the library is at ${LIBRARY_SCHEMA_VERSION}`);
  if (!entry.text?.trim()) problems.push(`${where}: its rules text`);
  if (entry.data === undefined || entry.data === null) problems.push(`${where}: its data`);
  // a choice is named in a path, or in a value its pick fills (a weapon proficiency, Skill Focus's name)
  const written = JSON.stringify(entry.data ?? null);
  for (const choice of entry.choices || []) {
    if (!written.includes(`{choice:${choice.id}}`)) problems.push(`${where}: its choice ${choice.id} is named nowhere in its data ("{choice:${choice.id}}")`);
  }
  const named = new Set((entry.choices || []).map(choice => choice.id));
  for (const id of new Set([...written.matchAll(/\{choice:([^}"]+)\}/g)].map(match => match[1]))) {
    if (!named.has(id)) problems.push(`${where}: its data names a choice it does not have (${id})`);
  }
  return problems;
};
