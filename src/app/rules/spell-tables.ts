import {SpellRow, SpellTable} from '../interfaces/character.interface';

// the spells per day and spells known of the casters of the Pathfinder Core Rulebook, by class level
// a row is one class level (row 0 is 1st level), its entries are the spell levels from 0 on up
// a missing entry (or null) is a '—' of the table: the class can not cast spells of that level yet, not even bonus
// spells. a 0 is a 0 of the table: the class casts only the bonus spells of that level
// sources: Core Rulebook, chapter 3 (Classes), tables 3-3 bard, 3-6 cleric, 3-7 druid, 3-11 paladin, 3-12 ranger,
// 3-14 sorcerer spells per day, 3-15 sorcerer spells known, 3-17 wizard; also d20pfsrd.com/classes/core-classes
type Row = SpellRow;
const _ = null;

// cleric, druid and wizard progress alike: 0-level spells (orisons, cantrips) are prepared, and cast at will
const FULL_PREPARED: Row[] = [
  [3, 1],
  [4, 2],
  [4, 2, 1],
  [4, 3, 2],
  [4, 3, 2, 1],
  [4, 3, 3, 2],
  [4, 4, 3, 2, 1],
  [4, 4, 3, 3, 2],
  [4, 4, 4, 3, 2, 1],
  [4, 4, 4, 3, 3, 2],
  [4, 4, 4, 4, 3, 2, 1],
  [4, 4, 4, 4, 3, 3, 2],
  [4, 4, 4, 4, 4, 3, 2, 1],
  [4, 4, 4, 4, 4, 3, 3, 2],
  [4, 4, 4, 4, 4, 4, 3, 2, 1],
  [4, 4, 4, 4, 4, 4, 3, 3, 2],
  [4, 4, 4, 4, 4, 4, 4, 3, 2, 1],
  [4, 4, 4, 4, 4, 4, 4, 3, 3, 2],
  [4, 4, 4, 4, 4, 4, 4, 4, 3, 3],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
];

// paladin and ranger: no spells before 4th level, then up to 4th level spells
const HALF_CASTER: Row[] = [
  [],
  [],
  [],
  [_, 0],
  [_, 1],
  [_, 1],
  [_, 1, 0],
  [_, 1, 1],
  [_, 2, 1],
  [_, 2, 1, 0],
  [_, 2, 1, 1],
  [_, 2, 2, 1],
  [_, 3, 2, 1, 0],
  [_, 3, 2, 1, 1],
  [_, 3, 2, 2, 1],
  [_, 3, 3, 2, 1],
  [_, 4, 3, 2, 1],
  [_, 4, 3, 2, 2],
  [_, 4, 3, 3, 2],
  [_, 4, 4, 3, 3],
];

// spontaneous casters cast their 0-level spells at will, the table gives none per day (only how many they know)
const SORCERER_PER_DAY: Row[] = [
  [_, 3],
  [_, 4],
  [_, 5],
  [_, 6, 3],
  [_, 6, 4],
  [_, 6, 5, 3],
  [_, 6, 6, 4],
  [_, 6, 6, 5, 3],
  [_, 6, 6, 6, 4],
  [_, 6, 6, 6, 5, 3],
  [_, 6, 6, 6, 6, 4],
  [_, 6, 6, 6, 6, 5, 3],
  [_, 6, 6, 6, 6, 6, 4],
  [_, 6, 6, 6, 6, 6, 5, 3],
  [_, 6, 6, 6, 6, 6, 6, 4],
  [_, 6, 6, 6, 6, 6, 6, 5, 3],
  [_, 6, 6, 6, 6, 6, 6, 6, 4],
  [_, 6, 6, 6, 6, 6, 6, 6, 5, 3],
  [_, 6, 6, 6, 6, 6, 6, 6, 6, 4],
  [_, 6, 6, 6, 6, 6, 6, 6, 6, 6],
];

const SORCERER_KNOWN: Row[] = [
  [4, 2],
  [5, 2],
  [5, 3],
  [6, 3, 1],
  [6, 4, 2],
  [7, 4, 2, 1],
  [7, 5, 3, 2],
  [8, 5, 3, 2, 1],
  [8, 5, 4, 3, 2],
  [9, 5, 4, 3, 2, 1],
  [9, 5, 5, 4, 3, 2],
  [9, 5, 5, 4, 3, 2, 1],
  [9, 5, 5, 4, 4, 3, 2],
  [9, 5, 5, 4, 4, 3, 2, 1],
  [9, 5, 5, 4, 4, 4, 3, 2],
  [9, 5, 5, 4, 4, 4, 3, 2, 1],
  [9, 5, 5, 4, 4, 4, 3, 3, 2],
  [9, 5, 5, 4, 4, 4, 3, 3, 2, 1],
  [9, 5, 5, 4, 4, 4, 3, 3, 3, 2],
  [9, 5, 5, 4, 4, 4, 3, 3, 3, 3],
];

const BARD_PER_DAY: Row[] = [
  [_, 1],
  [_, 2],
  [_, 3],
  [_, 3, 1],
  [_, 4, 2],
  [_, 4, 3],
  [_, 4, 3, 1],
  [_, 4, 4, 2],
  [_, 5, 4, 3],
  [_, 5, 4, 3, 1],
  [_, 5, 4, 4, 2],
  [_, 5, 5, 4, 3],
  [_, 5, 5, 4, 3, 1],
  [_, 5, 5, 4, 4, 2],
  [_, 5, 5, 5, 4, 3],
  [_, 5, 5, 5, 4, 3, 1],
  [_, 5, 5, 5, 4, 4, 2],
  [_, 5, 5, 5, 5, 4, 3],
  [_, 5, 5, 5, 5, 5, 4],
  [_, 5, 5, 5, 5, 5, 5],
];

const BARD_KNOWN: Row[] = [
  [4, 2],
  [5, 3],
  [6, 4],
  [6, 4, 2],
  [6, 4, 3],
  [6, 4, 4],
  [6, 5, 4, 2],
  [6, 5, 4, 3],
  [6, 5, 4, 4],
  [6, 5, 5, 4, 2],
  [6, 6, 5, 4, 3],
  [6, 6, 5, 4, 4],
  [6, 6, 5, 5, 4, 2],
  [6, 6, 6, 5, 4, 3],
  [6, 6, 6, 5, 4, 4],
  [6, 6, 6, 5, 5, 4, 2],
  [6, 6, 6, 6, 5, 4, 3],
  [6, 6, 6, 6, 5, 4, 4],
  [6, 6, 6, 6, 5, 5, 4],
  [6, 6, 6, 6, 6, 5, 5],
];

export const SPELLS_PER_DAY: {[table in SpellTable]: Row[]} = {
  bard: BARD_PER_DAY,
  cleric: FULL_PREPARED,
  druid: FULL_PREPARED,
  paladin: HALF_CASTER,
  ranger: HALF_CASTER,
  sorcerer: SORCERER_PER_DAY,
  wizard: FULL_PREPARED,
};

export const SPELLS_KNOWN: {[table in SpellTable]?: Row[]} = {
  bard: BARD_KNOWN,
  sorcerer: SORCERER_KNOWN,
};

const entry = (rows: Row[] | undefined, classLevel: number, spellLevel: number): number | null => {
  if (!rows || !rows.length || classLevel < 1) return null;
  const row = rows[Math.min(classLevel, rows.length) - 1];
  const value = row?.[spellLevel];
  return value === undefined || value === null ? null : value;
};

// where a class's spells per day and spells known are read from: a table of the Core Rulebook it shares, by name, or
// the rows its own page gives (ClassSpellcasting.perDay, .known), for any class the app has no table of (an oracle
// has the sorcerer's, a magus a table of its own). rows of its own win over a table named with them
export type SpellTableSource = SpellTable | {table?: SpellTable, perDay?: Row[], known?: Row[]};

const perDayRows = (source: SpellTableSource): Row[] | undefined =>
  typeof source === 'string' ? SPELLS_PER_DAY[source] : source.perDay ?? (source.table ? SPELLS_PER_DAY[source.table] : undefined);

// rows of its own for spells per day and none for spells known: the class does not count what it knows (its page
// gives no such table), the known of a table it names does not apply to it
const knownRows = (source: SpellTableSource): Row[] | undefined =>
  typeof source === 'string' ? SPELLS_KNOWN[source]
    : source.known ?? (source.table && !source.perDay ? SPELLS_KNOWN[source.table] : undefined);

// the spells per day of the table at that class level, null for a '—'
export const spellsPerDay = (source: SpellTableSource, classLevel: number, spellLevel: number): number | null =>
  entry(perDayRows(source), classLevel, spellLevel);

// the spells known of the table at that class level, null when the class does not count them (or a '—')
export const spellsKnown = (source: SpellTableSource, classLevel: number, spellLevel: number): number | null =>
  entry(knownRows(source), classLevel, spellLevel);

// whether the source gives a table at all: a table of the Core Rulebook, or rows of its own
export const hasSpellTable = (source: SpellTableSource | undefined): boolean =>
  !!source && !!(perDayRows(source)?.length || knownRows(source)?.length);

// the spell levels the class can cast at that class level: the levels with an entry (0 included) in its spells per
// day, or in its spells known (the 0-level spells of a spontaneous caster)
export const castableSpellLevels = (source: SpellTableSource, classLevel: number): number[] =>
  Array.from({length: 10}, (_unused, level) => level).filter(level =>
    spellsPerDay(source, classLevel, level) !== null || spellsKnown(source, classLevel, level) !== null
  );

// the bonus spells of an ability modifier at a spell level (Core Rulebook table 1-3), none for 0-level spells
export const bonusSpells = (modifier: number, spellLevel: number): number =>
  spellLevel >= 1 && modifier >= spellLevel ? Math.floor((modifier - spellLevel) / 4) + 1 : 0;
