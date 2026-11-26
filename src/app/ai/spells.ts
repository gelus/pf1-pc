import {metamagicName} from '../rules/metamagic';
import {Archetype, archetypesOf} from '../utils/classlevel.class';
import {ApplyCharacterService} from '../apply-character.service';
import {CasterType, ClassSpellcasting, Spell, SpellRow, SpellTable, spellTables} from '../interfaces/character.interface';
import {spellSchools} from '../rules/adjustment-schema';
import {SpellCastingType} from '../rules/spell-sources';
import {castableSpellLevels} from '../rules/spell-tables';
import {classCasters, fitsExtraSlot, isOppositionSpell} from '../rules/spellcasting';
import {BasedOn, describe, provenance, unchecked} from './builders';
import {parseJsonArg, parseJsonList} from './json-arg';
import {ActionResult} from './play-actions';
import {lookedUpUrlFor} from './rules-lookup';
import {abilityOf, spellFrom} from './spell-form';

// the spells of the character, built by the AI: what makes a class a caster (its spellcasting, from its page, for any
// class: the app has tables of the Core Rulebook's casters only), the choices of a caster (a wizard's school, a
// cleric's domains), the spells it knows or keeps in its book (add_spells), prepares (prepare_spells) or loses
// (remove_spells), and the spell-like abilities a feature gives. the engine works the numbers out (rules/spellcasting.ts:
// slots, bonus spells, DCs, spells known); these fill in what the player picked, each one step of the undo history

const lower = (value: unknown): string => (typeof value === 'string' ? value : '').trim().toLowerCase();
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const isObject = (value: unknown): value is {[key: string]: unknown} =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const listOf = (value: unknown): string[] =>
  (Array.isArray(value) ? value.map(String) : String(value ?? '').split(/,|\band\b/)).map(v => v.trim()).filter(Boolean);

// ---- a class's spellcasting, from its page ----

// the rows of a table as its page lists them, one per class level from 1st: {"1": ["-", 1], "2": ["-", 2]} or
// [["-", 1], ["-", 2]], each row its spell levels from 0 on up, a "—" (or "-", null) a level it can not cast yet
const rowsOf = (value: unknown, what: string): {rows?: SpellRow[], error?: string} => {
  if (value === undefined || value === null || value === '') return {};
  const read = typeof value === 'string' ? parseJsonArg(value, what) : {value};
  if (read.error) return {error: read.error};
  const given = read.value;
  const byLevel: [number, unknown][] = Array.isArray(given)
    ? given.map((row, index) => [index + 1, row])
    : isObject(given) ? Object.entries(given).map(([level, row]) => [Number(level), row]) : [];
  if (!byLevel.length) return {error: `${what} is the table's rows by class level, {"1": ["-", 1], "2": ["-", 2]}`};
  byLevel.sort((a, b) => a[0] - b[0]);
  const rows: SpellRow[] = [];
  for (const [index, [level, row]] of byLevel.entries()) {
    if (level !== index + 1) return {error: `${what}: every class level from 1st on is a row, level ${index + 1} is missing`};
    if (!Array.isArray(row)) return {error: `${what}: the row of level ${level} is a list of its spell levels from 0, ["-", 1]`};
    const entries: SpellRow = [];
    for (const cell of row) {
      const said = String(cell ?? '').trim();
      if (cell === null || /^(-|—|–|)$/.test(said)) { entries.push(null); continue; }
      const number = Number(said.replace(/^\+/, ''));
      if (!Number.isInteger(number) || number < 0) return {error: `${what}: level ${level} lists "${said}", a number or "-"`};
      entries.push(number);
    }
    // trailing dashes are levels it can not cast, as if not listed
    while (entries.length && entries[entries.length - 1] === null) entries.pop();
    rows.push(entries);
  }
  return {rows};
};

// how a class casts, as the AI read it from its page, for a class the app has no preset of (a core class's preset has
// it): {"ability": "cha", "type": "spontaneous", "magic": "divine", "table": "sorcerer"} for a class with the table of
// a core class, or its own table's rows, "spells_per_day" (and "spells_known" for a class that counts what it knows)
// with base, the spellcasting the class has, the value gives only what changes (an archetype that casts with
// Intelligence, or with one fewer spell a day): the rest is the class's
export const spellcastingFrom = (
  value: unknown, className: string, classLevel: number, base?: ClassSpellcasting,
): {spellcasting?: ClassSpellcasting, problems: string[], notes: string[]} => {
  const read = typeof value === 'string' ? parseJsonArg(value, 'spellcasting') : {value};
  if (read.error) return {problems: [read.error], notes: []};
  const given = base && isObject(read.value) ? changedSpellcasting(base, read.value) : read.value;
  if (!isObject(given)) return {problems: ['spellcasting is a JSON object, {"ability": "cha", "type": "spontaneous", "magic": "divine", "table": "sorcerer"}'], notes: []};
  const problems: string[] = [];
  const notes: string[] = [];
  const ability = abilityOf(given['ability']);
  if (!ability) problems.push('spellcasting.ability is the ability its spells are cast with (its page: "an oracle must have a Charisma score equal to 10 + the spell level"), str to cha');
  const type = lower(given['type'] ?? given['casting']);
  if (type !== 'prepared' && type !== 'spontaneous') problems.push('spellcasting.type is "prepared" (prepares its spells ahead of time) or "spontaneous" (casts any spell it knows)');
  const magic = lower(given['magic'] ?? given['kind'] ?? (given['arcane'] === true ? 'arcane' : given['arcane'] === false ? 'divine' : ''));
  if (!['arcane', 'divine', 'psychic'].includes(magic)) problems.push('spellcasting.magic is "arcane", "divine" or "psychic": what its page calls its spells');
  const table = lower(given['table']) as SpellTable;
  const perDay = rowsOf(given['spells_per_day'] ?? given['perDay'], 'spellcasting.spells_per_day');
  const known = rowsOf(given['spells_known'] ?? given['known'], 'spellcasting.spells_known');
  problems.push(...[perDay.error, known.error].filter((e): e is string => !!e));
  const namedTable = (spellTables as readonly string[]).includes(table);
  if (table && !namedTable && !perDay.rows) {
    problems.push(`spellcasting.table "${given['table']}" is not one the app has (${spellTables.join(', ')}): give its own table's rows as "spells_per_day" (and "spells_known"), all of its levels`);
  } else if (!namedTable && !perDay.rows && !perDay.error) {
    problems.push(`spellcasting needs its table: "table" when it is the same as a core class's (${spellTables.join(', ')}: an oracle's is the sorcerer's, a witch's the wizard's), else its own rows as "spells_per_day", {"1": ["-", 1], "2": ["-", 2], ...} for every level of the class`);
  }
  if (perDay.rows && perDay.rows.length < classLevel) problems.push(`spellcasting.spells_per_day lists ${perDay.rows.length} levels, the class is at ${classLevel}: give every row of its table`);
  if (type === 'spontaneous' && perDay.rows && !known.rows && !namedTable) {
    problems.push('a spontaneous caster knows a number of spells: give its "Spells Known" table as "spells_known", rows by class level like spells_per_day');
  }
  if (perDay.rows && perDay.rows.length < 20 && perDay.rows.length >= classLevel) {
    notes.push(`its table has ${perDay.rows.length} levels: a class of more levels needs every row (a prestige class of 10 is fine)`);
  }
  const offset = Number(given['caster_level_offset'] ?? given['casterLevelOffset'] ?? 0);
  if (!Number.isInteger(offset) || offset > 0) problems.push('spellcasting.caster_level_offset is 0 or less: what its caster level is below its class level (a paladin\'s is -3)');
  const extra = lower(given['extra_slot'] ?? given['extraSlot']);
  if (extra && extra !== 'domain' && extra !== 'school') problems.push('spellcasting.extra_slot is "domain" (a domain slot of each spell level, as a cleric) or "school" (a specialist\'s school slot, as a wizard)');
  const ignored = listOf(given['ignore_armor_spell_failure'] ?? given['ignoreArmorSpellFailure']).map(lower);
  const perDayChange = Number(given['spells_per_day_change'] ?? given['perDayChange'] ?? 0);
  if (!Number.isInteger(perDayChange)) problems.push('spellcasting.spells_per_day_change is a whole number added to the spells per day of each spell level from 1st (-1 for one fewer)');
  if (problems.length) return {problems, notes};
  const spellcasting: ClassSpellcasting = {
    origin: className.trim().toLowerCase(), ability: ability!, type: type as ClassSpellcasting['type'], arcane: magic === 'arcane',
    ...(namedTable ? {table} : {}),
    ...(perDay.rows ? {perDay: perDay.rows} : {}),
    ...(known.rows ? {known: known.rows} : {}),
    ...(offset ? {casterLevelOffset: offset} : {}),
    ...(perDayChange ? {perDayChange} : {}),
    ...(extra === 'domain' ? {domainSlots: true} : {}),
    ...(extra === 'school' ? {specialistSchool: true} : {}),
    ...(ignored.length ? {ignoreArmorSpellFailure: ignored} : {}),
  };
  if (!castableSpellLevels(spellcasting, 20).length) {
    return {problems: ['spellcasting\'s table gives no spell level at any class level: read its table again'], notes};
  }
  return {spellcasting, problems: [], notes};
};

// the spellcasting of a class once its archetypes change it: the class's own (its preset, its page's) with each
// archetype's changes merged over it, in turn. null when an archetype takes it away, undefined when nothing changes
export const archetypeCasting = (
  base: ClassSpellcasting | undefined, archetypes: Archetype[], className: string, classLevel: number,
): {spellcasting?: ClassSpellcasting | null, problems: string[], notes: string[]} => {
  const changing = archetypes.filter(a => a.spellcasting);
  if (!changing.length) return {problems: [], notes: []};
  if (changing.some(a => a.spellcasting === 'none')) {
    return {spellcasting: null, problems: [], notes: [`${className} casts no spells with ${changing.find(a => a.spellcasting === 'none')!.name}`]};
  }
  let casting = base;
  const problems: string[] = [];
  const notes: string[] = [];
  for (const archetype of changing) {
    const read = spellcastingFrom(archetype.spellcasting, className, classLevel, casting);
    problems.push(...read.problems.map(p => `${archetype.name}: ${p}`));
    notes.push(...read.notes);
    if (read.spellcasting) casting = read.spellcasting;
  }
  return {...(problems.length ? {} : {spellcasting: casting}), problems, notes};
};

// the spellcasting the AI gives in full, from what a class has and what changes: a table given replaces the rows the
// class had and rows replace a table, an extra slot "none" takes the class's away
const changedSpellcasting = (base: ClassSpellcasting, change: {[key: string]: unknown}): {[key: string]: unknown} => {
  const rows = (list?: SpellRow[]) => list?.map(row => row.map(cell => cell === null ? '-' : cell));
  const newTable = change['table'] !== undefined;
  const newRows = change['spells_per_day'] !== undefined || change['perDay'] !== undefined;
  const merged: {[key: string]: unknown} = {
    ability: base.ability, type: base.type, magic: base.arcane ? 'arcane' : 'divine',
    ...(base.table && !newRows ? {table: base.table} : {}),
    ...(base.perDay && !newTable ? {spells_per_day: rows(base.perDay)} : {}),
    ...(base.known && !newTable ? {spells_known: rows(base.known)} : {}),
    ...(base.casterLevelOffset ? {caster_level_offset: base.casterLevelOffset} : {}),
    ...(base.perDayChange ? {spells_per_day_change: base.perDayChange} : {}),
    ...(base.domainSlots ? {extra_slot: 'domain'} : base.specialistSchool ? {extra_slot: 'school'} : {}),
    ...(base.ignoreArmorSpellFailure?.length ? {ignore_armor_spell_failure: base.ignoreArmorSpellFailure} : {}),
    ...change,
  };
  if (lower(merged['extra_slot']) === 'none') delete merged['extra_slot'];
  return merged;
};

// a class level's features say it casts (its "Spells" or "Orisons" entry): a class with no spellcasting given would
// keep its spells in a description, with no slots (an oracle went without a single spell)
const CASTS = /\b(casts?|casting) (arcane|divine|psychic|occult)?\s?spells\b|\bspellcasting\b|\b(cantrips|orisons|knacks)\b|\bspells (per day|known)\b|^\s*(spells|extracts)\s*$/i;
export const castsSpells = (texts: string[]): boolean => texts.some(t => CASTS.test(t));

// ---- the choices of a caster ----

const SCHOOLS = spellSchools.filter(s => s !== 'universal');
const schoolOf = (value: unknown): string | undefined => {
  const said = lower(value).replace(/\s*\(.*\)$/, '').replace(/ school$/, '');
  if (said === 'universalist' || said === 'universal') return 'universalist';
  return (SCHOOLS as readonly string[]).find(school => school === said);
};

export interface CasterChoices {school?: string, oppositionSchools?: string[], domains?: string[]}

// the choices a class caster needs, from what the AI gave (school, opposition_schools, domains): a specialist's
// school and its opposition schools, a domain caster's domains. none needed by a caster that has no such slot
export const casterChoicesFrom = (
  args: {[name: string]: unknown}, info: Pick<ClassSpellcasting, 'specialistSchool' | 'domainSlots'>, have: CasterChoices = {},
): {choices: CasterChoices, problems: string[]} => {
  const problems: string[] = [];
  const choices: CasterChoices = {};
  const schoolGiven = args['school'] ?? args['arcane_school'];
  if (schoolGiven !== undefined && schoolGiven !== '') {
    const school = schoolOf(schoolGiven);
    if (!school) problems.push(`school is a school of magic (${SCHOOLS.join(', ')}) or "universalist", not "${schoolGiven}"`);
    else choices.school = school;
  }
  const oppositionGiven = args['opposition_schools'];
  if (oppositionGiven !== undefined && oppositionGiven !== '') {
    const said = listOf(oppositionGiven);
    const schools = said.map(schoolOf);
    const wrong = said.filter((_s, i) => !schools[i] || schools[i] === 'universalist');
    if (wrong.length) problems.push(`opposition_schools are schools of magic (${SCHOOLS.join(', ')}), not ${wrong.map(w => `"${w}"`).join(', ')}`);
    else choices.oppositionSchools = schools as string[];
  }
  const domainsGiven = args['domains'];
  if (domainsGiven !== undefined && domainsGiven !== '') {
    const domains = listOf(domainsGiven).map(d => d.replace(/\s+domain$/i, ''));
    if (!domains.length) problems.push('domains are the domains the player picked, "Fire, Sun"');
    else choices.domains = domains;
  }
  const school = choices.school ?? have.school;
  const opposition = choices.oppositionSchools ?? have.oppositionSchools;
  if (info.specialistSchool) {
    if (!school) {
      problems.push(`school: this class specializes in a school of magic (its page): ask the player which (${SCHOOLS.join(', ')}, or "universalist" for none), and its opposition_schools`);
    } else if (school !== 'universalist') {
      if (!opposition?.length) problems.push(`opposition_schools: a ${school} specialist gives up two other schools (its page), ask the player which`);
      else if (opposition.includes(school)) problems.push(`opposition_schools can not hold the specialty, ${school}`);
    }
  }
  if (info.domainSlots && !(choices.domains ?? have.domains)?.length) {
    problems.push('domains: this class picks domains (its page), ask the player which and give them as domains');
  }
  return {choices, problems};
};

// the choices kept on the raw caster, as the sheet's own fields keep them
export const setCasterChoices = (service: ApplyCharacterService, origin: string, choices: CasterChoices): void => {
  if (choices.school !== undefined) service.setCasterChoice(origin, 'school', choices.school);
  if (choices.oppositionSchools) service.setCasterChoice(origin, 'oppositionSchools', choices.oppositionSchools.join(', '));
  if (choices.domains) service.setCasterChoice(origin, 'domains', choices.domains.join(', '));
};

// ---- the casters of the character, by name ----

interface FoundCaster {type: SpellCastingType, origin: string, caster: CasterType}

const castersOf = (service: ApplyCharacterService, type?: SpellCastingType): FoundCaster[] => {
  const applied = service.applied();
  return ((type ? [type] : ['spells', 'spellLikeAbilities']) as SpellCastingType[]).flatMap(t =>
    Object.entries(applied[t] || {}).map(([origin, caster]) => ({type: t, origin, caster})));
};

const describeCasters = (found: FoundCaster[]): string =>
  found.map(c => `${c.origin}${c.type === 'spellLikeAbilities' ? ' (spell-like)' : ''}`).join(', ') || 'none';

// the caster a tool names: by its origin or name, any case ("Wizard", "wizard"); the only one when none is named
export const findCaster = (service: ApplyCharacterService, named: unknown, type?: SpellCastingType): {found?: FoundCaster, error?: string} => {
  const all = castersOf(service, type);
  const wanted = lower(named);
  if (!wanted) {
    const spells = all.filter(c => c.type === 'spells');
    if (spells.length === 1) return {found: spells[0]};
    if (all.length === 1) return {found: all[0]};
    return {error: all.length ? `say which caster: ${describeCasters(all)}` : 'the character has no caster: a class level that casts (add_class_level with its spellcasting) makes one'};
  }
  const found = all.find(c => lower(c.origin) === wanted) ?? all.find(c => lower(c.caster.name) === wanted)
    ?? all.find(c => lower(c.origin).includes(wanted) || wanted.includes(lower(c.origin)));
  return found ? {found} : {error: `the character has no caster "${named}": its casters are ${describeCasters(all)}`};
};

// how many spells the caster itself keeps at a level: the spells its features give (a mystery's, a bloodline's) are
// bonus spells, not counted against what it knows
const ownSpellCount = (service: ApplyCharacterService, type: SpellCastingType, origin: string, level: number): number =>
  service.raw()[type]?.[origin]?.spells?.[level]?.spells?.length ?? 0;

// ---- the tools ----

// adds spells to a caster: the spells a spontaneous caster knows, a wizard's spellbook, a cleric's list to prepare
// from. checked against what the caster can have: the levels it casts, the spells it knows at each, a domain spell's
// domain. a spell built from memory is marked so, as any feature
export const addSpells = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const type: SpellCastingType = /like/i.test(text(args['kind'])) ? 'spellLikeAbilities' : 'spells';
  const caster = findCaster(service, args['caster'], type);
  if (caster.error) return {error: `nothing was added: ${caster.error}`};
  const {origin, caster: applied} = caster.found!;
  const read = parseJsonList(args['spells'], 'spells');
  if (read.error) return {error: read.error};
  const given = Array.isArray(read.value) ? read.value : read.value === undefined ? [] : [read.value];
  if (!given.length) return {error: 'spells is a JSON array of the spells to add, [{"name": "Magic Missile", "level": 1, "school": "evocation", "components": "V, S", ...}]'};
  // where each spell comes from: the page given, else each spell's own page, looked up by its name with the others
  // (eleven spells read in one lookup were refused for want of one source_url, and went in as the player's)
  const givenNames = given.map(g => (isObject(g) ? text(g['name']) : '')).filter(Boolean);
  const lookedUp = text(args['based_on']) === 'looked up' && !text(args['source_url']);
  // (a spell of the app's library is its rules as written there, read as much as a page looked up)
  const fromLibrary = args['fromLibrary'] === true;
  const unread = lookedUp && !fromLibrary ? givenNames.filter(n => !lookedUpUrlFor(n)) : [];
  const source = lookedUp && !unread.length ? {basedOn: 'looked up' as BasedOn, sourceUrl: ''} : provenance(args, givenNames.length === 1 ? givenNames[0] : undefined);
  const problems: string[] = source.error
    ? [unread.length ? `based_on "looked up": ${unread.join(', ')} ${unread.length > 1 ? 'were' : 'was'} not looked up (look_up_rules with names, kind spell), or say own knowledge for ${unread.length > 1 ? 'them' : 'it'}` : source.error]
    : [];
  const sourceOf = (name: string): string => source.sourceUrl || lookedUpUrlFor(name) || '';
  const notes: string[] = [];
  const toAdd: {spell: Spell, level: number}[] = [];
  const classCaster = !!applied.classTable;
  const counts = new Map<number, number>();
  for (const [index, entry] of given.entries()) {
    const built = spellFrom(entry, index);
    problems.push(...built.problems);
    if (!built.spell) continue;
    const {spell, level} = built as {spell: Spell, level: number};
    const levelNow = applied.spells?.[level];
    if (classCaster && !levelNow) {
      const castable = applied.spells.map((l, i) => l ? i : -1).filter(i => i >= 0);
      problems.push(`${spell.name}: ${origin} casts no level ${level} spells yet (its levels: ${castable.join(', ') || 'none'})`);
      continue;
    }
    const already = (levelNow?.spells || []).some(s => lower(s.name) === lower(spell.name));
    if (already || toAdd.some(a => a.level === level && lower(a.spell.name) === lower(spell.name))) {
      notes.push(`${spell.name} is on the ${origin} list at level ${level} already`);
      continue;
    }
    if (applied.domainSlots && spell.domain && applied.domains?.length && !applied.domains.map(lower).includes(lower(spell.domain))) {
      problems.push(`${spell.name}: its domain ${spell.domain} is not one of the caster's (${applied.domains.join(', ')})`);
      continue;
    }
    if (isOppositionSpell(applied, spell)) notes.push(`${spell.name} is of an opposition school (${spell.school}): preparing it takes two slots`);
    if (applied.maxSpellLevel !== undefined && level > applied.maxSpellLevel) notes.push(`${spell.name}: the caster's ${applied.ability} is too low to cast level ${level} spells yet`);
    counts.set(level, (counts.get(level) || 0) + 1);
    toAdd.push({spell, level});
  }
  // a caster that counts the spells it knows knows no more than its table gives (bonus spells a feature gives aside)
  for (const [level, adding] of counts) {
    const known = applied.spells?.[level]?.known;
    if (known === undefined) continue;
    const have = ownSpellCount(service, type, origin, level);
    if (have + adding > known) problems.push(`${origin} knows ${known} level ${level} spells, it has ${have}: ${have + adding} is ${have + adding - known} too many (remove_spells to swap one)`);
  }
  if (problems.length) return {error: 'nothing was added: fix every one of these, all in one call', problems};
  if (!toAdd.length) return {error: 'nothing was added', notes};
  const basedOn = source.basedOn as BasedOn;
  const names = toAdd.map(a => a.spell.name);
  return service.labelled(`${origin} ${type === 'spells' ? 'spells' : 'spell-like abilities'}: ${names.join(', ')}`, () => {
    for (const {spell, level} of toAdd) {
      service.saveSpell(type, origin, level, {...spell, description: describe(spell.description, basedOn, sourceOf(spell.name))});
    }
    const now = service.applied()[type][origin];
    return {
      done: `added to ${origin}: ${names.join(', ')}${unchecked(basedOn)}`,
      ...(notes.length ? {notes} : {}),
      levels: (now?.spells || []).map((l, i) => l ? `${i}: ${l.spells.map(s => s.name).join(', ') || 'none'}${l.known !== undefined ? ` (${l.spells.length} of ${l.known} known)` : ''}` : undefined).filter(Boolean),
      ...(now?.casting === 'prepared' ? {next: 'prepare the spells of the day with prepare_spells'} : {}),
    };
  });
};

// prepares spells into the slots of a prepared caster: the regular slots of each level, the extra (domain or school)
// slot with slot "extra". a spell of an opposition school takes two slots. replace empties the level's slots first
export const prepareSpells = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const caster = findCaster(service, args['caster'], 'spells');
  if (caster.error) return {error: `nothing was prepared: ${caster.error}`};
  const {origin, caster: applied} = caster.found!;
  if (applied.casting !== 'prepared') return {error: `${origin} casts spontaneously: it casts any spell it knows, nothing is prepared`};
  const level = Number(args['level']);
  const spellLevel = applied.spells?.[level];
  if (!Number.isInteger(level) || !spellLevel) return {error: `level is a spell level ${origin} casts (${applied.spells.map((l, i) => l ? i : -1).filter(i => i >= 0).join(', ')})`};
  const names = listOf(args['spells']);
  if (!names.length) return {error: 'spells are the names to prepare, comma separated; a name twice is prepared twice'};
  const slot = lower(args['slot']) === 'extra' ? 'extra' : 'regular';
  // with metamagic (rules/metamagic.ts): spells of lower levels raised into this level's slots
  const metamagic = listOf(args['metamagic']);
  const missing = metamagic.length ? [] : names.filter(n => !spellLevel.spells.some(s => lower(s.name) === lower(n)));
  if (missing.length) {
    return {error: `nothing was prepared: ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not on the ${origin} level ${level} list (add_spells first)`, list: spellLevel.spells.map(s => s.name)};
  }
  if (slot === 'extra') {
    if (!spellLevel.extraSlot) return {error: `${origin} has no domain or school slot at level ${level}`};
    const wrong = names.filter(n => !fitsExtraSlot(applied, spellLevel.spells.find(s => lower(s.name) === lower(n))));
    if (wrong.length) return {error: `${wrong.join(', ')} can not go in the ${spellLevel.extraSlot.kind} slot: it takes a ${spellLevel.extraSlot.kind === 'domain' ? 'spell of one of the caster\'s domains' : `spell of its school (${applied.school})`}`};
  }
  return service.labelled(`prepare ${origin} level ${level}: ${names.join(', ')}`, () => {
    if (args['replace'] === true || args['replace'] === 'true') {
      const rawLevel = service.raw().spells[origin]?.spells?.[level];
      if (rawLevel?.prepared) rawLevel.prepared = rawLevel.prepared.filter(p => (p.slot === 'extra') !== (slot === 'extra'));
      // the slots it frees count for what is prepared next
      service.update();
    }
    const refused: string[] = [];
    const prepared: string[] = [];
    for (const name of names) {
      const why = service.prepareSpell(origin, level, name, slot, metamagic);
      if (why) refused.push(`${name}: ${why}`); else prepared.push(name);
    }
    service.update();
    const now = service.applied().spells[origin]?.spells?.[level];
    // a spell refused for the regular slots that fits the extra slot left empty (Burning Hands, an evoker's school slot)
    const extraFree = !!now?.extraSlot && !(now.prepared || []).some(p => p.slot === 'extra');
    const fitsExtra = extraFree && slot === 'regular' ? refused.map(r => r.split(':')[0])
      .filter(n => fitsExtraSlot(applied, spellLevel.spells.find(sp => lower(sp.name) === lower(n)))) : [];
    return {
      ...(fitsExtra.length ? {hint: `the ${now!.extraSlot!.kind} slot is free and ${fitsExtra.join(', ')} ${fitsExtra.length > 1 ? 'fit' : 'fits'} it: prepare_spells with slot extra`} : {}),
      ...(prepared.length ? {done: `prepared ${prepared.join(', ')} (${origin} level ${level})`} : {error: 'nothing was prepared'}),
      ...(refused.length ? {refused} : {}),
      preparedNow: (now?.prepared || []).map(p => `${metamagicName(p.name, p.metamagic)}${p.slot === 'extra' ? ' (extra slot)' : ''}`),
      slots: now?.atWill ? `prepares ${now.perDay.total}` : `${now?.perDay.total ?? 0} a day${now?.extraSlot ? ` + 1 ${now.extraSlot.kind} slot` : ''}`,
    };
  });
};

// takes spells off a caster's list (a spell known swapped at a new level, a spell lost), and out of its slots
export const removeSpells = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const type: SpellCastingType = /like/i.test(text(args['kind'])) ? 'spellLikeAbilities' : 'spells';
  const caster = findCaster(service, args['caster'], type);
  if (caster.error) return {error: `nothing was removed: ${caster.error}`};
  const {origin, caster: applied} = caster.found!;
  const names = listOf(args['spells']).map(lower);
  if (!names.length) return {error: 'spells are the names to remove, comma separated'};
  const levelGiven = args['level'] === undefined || args['level'] === '' ? undefined : Number(args['level']);
  const found: {level: number, name: string}[] = [];
  (applied.spells || []).forEach((level, index) => {
    if (!level || (levelGiven !== undefined && levelGiven !== index)) return;
    for (const spell of level.spells) if (names.includes(lower(spell.name))) found.push({level: index, name: spell.name});
  });
  const missing = names.filter(n => !found.some(f => lower(f.name) === n));
  if (missing.length) return {error: `nothing was removed: ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not on the ${origin} list`};
  return service.labelled(`remove from ${origin}: ${found.map(f => f.name).join(', ')}`, () => {
    const notGiven: string[] = [];
    for (const {level, name} of found) {
      service.deleteSpell(type, origin, level, name, false);
      const rawLevel = service.raw()[type]?.[origin]?.spells?.[level];
      if (rawLevel?.prepared) rawLevel.prepared = rawLevel.prepared.filter(p => lower(p.name) !== lower(name));
    }
    service.update();
    // a spell a feature gives (a domain's, a bloodline's) goes with that feature, not here
    for (const {level, name} of found) {
      if (service.applied()[type][origin]?.spells?.[level]?.spells.some(s => lower(s.name) === lower(name))) notGiven.push(name);
    }
    return {
      done: `removed from ${origin}: ${found.map(f => f.name).filter(n => !notGiven.includes(n)).join(', ') || 'nothing'}`,
      ...(notGiven.length ? {note: `${notGiven.join(', ')} ${notGiven.length > 1 ? 'are' : 'is'} given by a feature: change that feature instead`} : {}),
    };
  });
};

// changes the choices of a caster: a specialist's school and opposition schools, a domain caster's domains
export const changeCasterChoices = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const caster = findCaster(service, args['caster'], 'spells');
  if (caster.error) return {error: `nothing was changed: ${caster.error}`};
  const {origin, caster: applied} = caster.found!;
  const info = classCasters(service.raw()).find(c => c.info.origin === origin)?.info ?? applied;
  const {choices, problems} = casterChoicesFrom(args, {specialistSchool: !!info.specialistSchool, domainSlots: !!info.domainSlots}, applied);
  if (!Object.keys(choices).length && !problems.length) return {error: 'give what changes: school, opposition_schools or domains'};
  if (problems.length) return {error: 'nothing was changed', problems};
  return service.labelled(`${origin}: ${Object.entries(choices).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(', ') : v}`).join('; ')}`, () => {
    setCasterChoices(service, origin, choices);
    const now = service.applied().spells[origin];
    return {done: `${origin}: ${[now?.school && `school ${now.school}`, now?.oppositionSchools?.length && `opposition ${now.oppositionSchools.join(', ')}`, now?.domains?.length && `domains ${now.domains.join(', ')}`].filter(Boolean).join('; ')}`};
  });
};

// gives a class the character has its spellcasting, every level of it: a class added before it was given (an oracle
// made without spells), or one whose table was read wrong. the choices its caster needs come with it
export const setClassSpellcasting = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const className = text(args['class_name']);
  const levels = service.raw().classLevels || [];
  const ofClass = levels.filter(level => lower(level.name) === lower(className));
  if (!ofClass.length) return {error: `the character has no levels of "${className}": its classes are ${[...new Set(levels.map(l => l.name))].join(', ') || 'none'}`};
  const given = spellcastingFrom(args['spellcasting'], ofClass[0].name, ofClass.length);
  if (!given.spellcasting) return {error: 'nothing was changed', problems: given.problems};
  // the class's archetypes change it as they did when they were taken (one with Intelligence for Charisma)
  const archetypes = archetypesOf(levels, ofClass[0].name);
  const changed = archetypeCasting(given.spellcasting, archetypes, ofClass[0].name, ofClass.length);
  if (changed.spellcasting === null) return {error: `nothing was changed: ${changed.notes.join('; ')} (its archetype)`};
  if (changed.problems.length) return {error: 'nothing was changed', problems: changed.problems};
  const read = {...given, spellcasting: changed.spellcasting ?? given.spellcasting, notes: [...given.notes, ...changed.notes,
    ...(changed.spellcasting ? [`changed as ${archetypes.filter(a => a.spellcasting).map(a => a.name).join(', ')} changes it`] : [])]};
  const have = service.raw().spells?.[read.spellcasting.origin] ?? {};
  const choices = casterChoicesFrom(args, read.spellcasting, have);
  if (choices.problems.length) return {error: 'nothing was changed', problems: choices.problems};
  return service.labelled(`${ofClass[0].name} spellcasting`, () => {
    for (const level of ofClass) level.spellcasting = JSON.parse(JSON.stringify(read.spellcasting));
    service.update({classLevels: [...levels]});
    if (Object.keys(choices.choices).length) setCasterChoices(service, read.spellcasting!.origin, choices.choices);
    const caster = service.applied().spells?.[read.spellcasting!.origin];
    return {
      done: `${ofClass[0].name} casts ${read.spellcasting!.type} ${read.spellcasting!.arcane ? 'arcane' : 'divine'} spells with ${read.spellcasting!.ability}`,
      ...(read.notes.length ? {notes: read.notes} : {}),
      levels: (caster?.spells || []).map((l, i) => l ? `${i}: ${l.atWill ? 'at will' : `${l.perDay.total} a day`}${l.known !== undefined ? `, knows ${l.known}` : ''}` : undefined).filter(Boolean),
    };
  });
};
