import {SpellTable} from '../interfaces/character.interface';

// the spells per day and spells known of the casters of the Pathfinder Core Rulebook, by class level
// a row is one class level (row 0 is 1st level), its entries are the spell levels from 0 on up
// a missing entry (or null) is a '—' of the table: the class can not cast spells of that level yet, not even bonus
// spells. a 0 is a 0 of the table: the class casts only the bonus spells of that level
// sources: Core Rulebook, chapter 3 (Classes), tables 3-3 bard, 3-6 cleric, 3-7 druid, 3-11 paladin, 3-12 ranger,
// 3-14 sorcerer spells per day, 3-15 sorcerer spells known, 3-17 wizard; also d20pfsrd.com/classes/core-classes
type Row = (number | null)[];
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
  if (!rows || classLevel < 1) return null;
  const row = rows[Math.min(classLevel, rows.length) - 1];
  const value = row?.[spellLevel];
  return value === undefined ? null : value;
};

// the spells per day of the table at that class level, null for a '—'
export const spellsPerDay = (table: SpellTable, classLevel: number, spellLevel: number): number | null =>
  entry(SPELLS_PER_DAY[table], classLevel, spellLevel);

// the spells known of the table at that class level, null when the class does not count them (or a '—')
export const spellsKnown = (table: SpellTable, classLevel: number, spellLevel: number): number | null =>
  entry(SPELLS_KNOWN[table], classLevel, spellLevel);

// the spell levels the class can cast at that class level: the levels with an entry (0 included) in its spells per
// day, or in its spells known (the 0-level spells of a spontaneous caster)
export const castableSpellLevels = (table: SpellTable, classLevel: number): number[] =>
  Array.from({length: 10}, (_unused, level) => level).filter(level =>
    spellsPerDay(table, classLevel, level) !== null || spellsKnown(table, classLevel, level) !== null
  );

// the bonus spells of an ability modifier at a spell level (Core Rulebook table 1-3), none for 0-level spells
export const bonusSpells = (modifier: number, spellLevel: number): number =>
  spellLevel >= 1 && modifier >= spellLevel ? Math.floor((modifier - spellLevel) / 4) + 1 : 0;
