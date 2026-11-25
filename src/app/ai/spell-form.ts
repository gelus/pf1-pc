import {CHARGES_PER, CasterType, Charges, Spell} from '../interfaces/character.interface';
import {formatProblems, spellSchools, validateAdjustments} from '../rules/adjustment-schema';
import {parseJsonArg} from './json-arg';

// a spell as the AI writes it (from its page: name, level, school, components, ...), made the engine's Spell, and the
// spell-like abilities a feature gives, written next to its adjustments. kept apart from the tools that add them
// (spells.ts), so the feature checks (mechanics.ts) can use it

const lower = (value: unknown): string => (typeof value === 'string' ? value : '').trim().toLowerCase();
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const isObject = (value: unknown): value is {[key: string]: unknown} =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const listOf = (value: unknown): string[] =>
  (Array.isArray(value) ? value.map(String) : String(value ?? '').split(/,|\band\b/)).map(v => v.trim()).filter(Boolean);
const ABILITY_WORDS: {[word: string]: string} = {
  strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha',
};
export const abilityOf = (value: unknown): string | undefined => {
  const said = lower(value);
  const ability = ABILITY_WORDS[said] ?? said.slice(0, 3);
  return ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(ability) ? ability : undefined;
};

const componentsOf = (value: unknown): string[] => {
  const said = Array.isArray(value) ? value.map(String).join(',') : String(value ?? '');
  // "V, S, M (bat guano)", "V, S, F/DF": the letters, the material's words left in the description
  return [...new Set(said.replace(/\([^)]*\)/g, '').split(/[,\s]+/).map(c => c.trim().toUpperCase()).filter(c => /^(V|S|M|F|DF|M\/DF|F\/DF)$/.test(c)))];
};

const yesNo = (value: unknown): boolean => typeof value === 'boolean' ? value : /^\s*(yes|true|y)\b/i.test(String(value ?? ''));

const usesOf = (value: unknown): Charges | undefined => {
  if (value === undefined || value === null || value === '' || /at will|constant/i.test(String(value))) return undefined;
  const given: {[key: string]: unknown} = isObject(value) ? value : {total: value};
  const said = String(given['total'] ?? '');
  const total = Math.floor(Number(/^(\d+)/.exec(said)?.[1] ?? given['total']));
  if (!(total > 0)) return undefined;
  const per = CHARGES_PER.includes(given['per'] as NonNullable<Charges['per']>) ? given['per'] as Charges['per'] : 'day';
  return {total, current: total, per, label: per === 'encounter' ? 'per encounter' : 'per day'};
};

// a spell as the engine keeps it, from what the AI wrote, with what is wrong with it
export const spellFrom = (given: unknown, index: number): {spell?: Spell, level?: number, problems: string[]} => {
  if (!isObject(given)) return {problems: [`spell [${index}] is an object, {"name": "Magic Missile", "level": 1, "school": "evocation", ...}`]};
  const name = text(given['name']);
  const label = name || `spell [${index}]`;
  const problems: string[] = [];
  if (!name) problems.push(`${label}: name`);
  const level = Number(given['level']);
  if (!Number.isInteger(level) || level < 0 || level > 9) problems.push(`${label}: level is its spell level for this caster, 0 to 9 (its page lists it by class: "sorcerer/wizard 1")`);
  const schoolSaid = lower(given['school']);
  const school = schoolSaid.replace(/\s*\(.*$/, '').trim();
  if (!(spellSchools as readonly string[]).includes(school)) problems.push(`${label}: school is one of ${spellSchools.join(', ')}`);
  const subSchool = text(given['subschool'] ?? given['sub_school']) || /\(([^)]*)\)/.exec(schoolSaid)?.[1];
  const components = componentsOf(given['components']);
  if (!components.length) problems.push(`${label}: components as its page lists them, "V, S, M"`);
  const description = text(given['description']);
  if (!description) problems.push(`${label}: description, what it does in short`);
  let adjustments: unknown = given['adjustments'];
  if (typeof adjustments === 'string') adjustments = parseJsonArg(adjustments, 'adjustments').value;
  if (adjustments !== undefined && !isObject(adjustments)) problems.push(`${label}: adjustments is a JSON object of what it does to its target's numbers ({"ac": {"value": 4, "type": "armor"}})`);
  else if (isObject(adjustments) && Object.keys(adjustments).length) {
    const invalid = validateAdjustments(adjustments).filter(p => p.severity === 'error');
    if (invalid.length) problems.push(...formatProblems(invalid).split('\n').filter(Boolean).map(p => `${label}: ${p}`));
  }
  if (problems.length) return {problems};
  const descriptors = listOf(given['descriptors']).map(lower);
  const domain = text(given['domain']);
  const uses = usesOf(given['uses'] ?? given['uses_per_day']);
  const spell: Spell = {
    name, school, ...(subSchool ? {subSchool: subSchool.toLowerCase()} : {}), ...(descriptors.length ? {descriptors} : {}),
    ...(domain ? {domain} : {}),
    castingTime: text(given['casting_time'] ?? given['castingTime']) || '1 standard action',
    components,
    range: text(given['range']), target: text(given['target'] ?? given['area'] ?? given['effect']),
    duration: text(given['duration']), savingThrow: text(given['saving_throw'] ?? given['savingThrow']) || 'none',
    spellResistance: yesNo(given['spell_resistance'] ?? given['spellResistance']),
    description,
    ...(isObject(adjustments) && Object.keys(adjustments).length ? {adjustments: adjustments as Spell['adjustments']} : {}),
    ...(uses ? {uses} : {}),
  };
  return {spell, level, problems};
};

// a feature's spell-like abilities as the AI writes them, next to its adjustments:
//   "spell_like_abilities": [{"name": "Darkness", "level": 2, "uses": 1, "school": "evocation", ...}],
//   "spell_like_ability": "cha", "spell_like_caster_level": "{level}"
// made the engine's caster of them, spellLikeAbilities.<origin>, in the feature's adjustments: each with its own uses
// a day (Spell.uses), the caster level a formula of the character's level when the text says so. what is wrong is told
export const SLA_KEYS = ['spell_like_abilities', 'spellLikeAbilities', 'spell_like_ability', 'spell_like_caster_level'];
export const spellLikeAbilitiesOf = (
  feature: {[key: string]: unknown}, adjustments: {[path: string]: unknown},
): string[] => {
  const given = feature['spell_like_abilities'] ?? feature['spellLikeAbilities'];
  if (given === undefined) return [];
  const abilitySaid = feature['spell_like_ability'];
  const levelSaid = feature['spell_like_caster_level'];
  delete feature['spell_like_abilities'];
  delete feature['spellLikeAbilities'];
  delete feature['spell_like_ability'];
  delete feature['spell_like_caster_level'];
  const name = String(feature['name'] || 'spell-like abilities');
  const read = typeof given === 'string' ? parseJsonArg(given, 'spell_like_abilities') : {value: given};
  if (read.error) return [`${name}: ${read.error}`];
  const list = Array.isArray(read.value) ? read.value : [read.value];
  const problems: string[] = [];
  const levels: {spells: Spell[]}[] = [];
  list.forEach((entry, index) => {
    const built = spellFrom(entry, index);
    problems.push(...built.problems.map(p => `${name}: ${p}`));
    if (!built.spell) return;
    while (levels.length <= built.level!) levels.push({spells: []});
    levels[built.level!].spells.push(built.spell);
  });
  const ability = abilityOf(abilitySaid) ?? 'cha';
  const casterLevel = levelSaid === undefined || levelSaid === '' ? '{level}' : /^\s*(character )?level\s*$/i.test(String(levelSaid)) ? '{level}' : levelSaid;
  if (problems.length) return problems;
  const origin = name.trim().toLowerCase().replace(/[.\[\]]/g, '');
  adjustments[`spellLikeAbilities.${origin}`] = {
    name, ability, casterLevel: 0, concentration: 0,
    spells: levels.map(level => ({perDay: {total: 0, current: 0}, spells: level.spells})),
  };
  adjustments[`spellLikeAbilities.${origin}.casterLevel`] = casterLevel;
  return [];
};

// a feature whose text gives spell-like abilities with none in its adjustments: kept as text they were never on the
// sheet's spell-like abilities, nor counted (a gnome's dancing lights, a tiefling's darkness)
export const SPELL_LIKE = /\bspell-like abilit(y|ies)\b/gi;
// a text that gives them, not one that only names them for another rule ("+2 on saves vs. spells and spell-like
// abilities", "spell resistance against spell-like abilities")
// (nor one that names others' "creatures that use spell-like abilities")
export const givesSpellLikeAbilities = (text: string): boolean => [...text.matchAll(SPELL_LIKE)].some(match => {
  const before = text.slice(Math.max(0, match.index! - 80), match.index);
  return !/\b(vs\b|versus|against|saves?|saving throws?|resistance|immun\w*|from|by|of)[^;]{0,75}$/i.test(before)
    && !/\b(creatures?|those|ones?|foes?|enemies)\s+(that|who|which)\s+(use|have|cast)\s*$/i.test(before);
});
export const spellLikeProblems = (name: string, textOfFeature: string, paths: string[], reason?: unknown): string[] => {
  if (!givesSpellLikeAbilities(textOfFeature) || paths.some(p => p.startsWith('spellLikeAbilities'))) return [];
  if (typeof reason === 'string' && /^no (path|spell-like)\b/i.test(reason.trim())) return [];
  return [`${name}: its text gives spell-like abilities, which the sheet keeps and counts: give them as "spell_like_abilities", `
    + '[{"name": "Darkness", "level": 2, "uses": 1, "school": "evocation", "components": "V, M/DF", "range": "touch", '
    + '"duration": "1 min./level", "saving_throw": "none", "spell_resistance": "no", "description": "..."}] ("uses": "at will" '
    + 'for one at will), with "spell_like_ability": the ability its DCs use (cha when its text names none) and '
    + '"spell_like_caster_level": "level" when its caster level is the character\'s level, else a number. If its text only '
    + 'names them for another rule, start descriptionOnly with "no spell-like:"'];
};

// a caster as the AI reads it: how it casts, its choices, and at each level what it casts a day, what it knows at most,
// the spells on its list (with a spell-like ability's own uses) and those prepared. every number the sheet's
export const casterOverview = (origin: string, caster: CasterType): object => ({
  origin, ...(caster.name && caster.name !== origin ? {name: caster.name} : {}),
  ...(caster.casting ? {casting: `${caster.casting}, ${caster.arcane ? 'arcane' : 'divine'}`} : {}),
  ...(caster.ability ? {ability: caster.ability} : {}),
  casterLevel: caster.casterLevel, concentration: caster.concentration,
  ...(caster.school ? {school: caster.school} : {}), ...(caster.oppositionSchools?.length ? {opposition: caster.oppositionSchools} : {}),
  ...(caster.domains?.length ? {domains: caster.domains} : {}),
  ...(caster.maxSpellLevel !== undefined && caster.maxSpellLevel < 9 ? {maxSpellLevel: caster.maxSpellLevel} : {}),
  levels: (caster.spells || []).map((level, index) => {
    if (!level || !(level.perDay?.total || level.atWill || level.spells?.length || level.known)) return undefined;
    const perDay = level.atWill ? `at will${caster.casting === 'prepared' ? `, prepares ${level.perDay.total}` : ''}`
      : `${level.perDay.current}/${level.perDay.total} a day`;
    const spells = (level.spells || []).map(s => `${s.name}${s.uses ? ` (${s.uses.current}/${s.uses.total} a day)` : ''}${s.dc !== undefined ? ` DC ${s.dc}` : ''}`);
    return {
      level: index, perDay,
      ...(level.extraSlot ? {extraSlot: `${level.extraSlot.label} ${level.extraSlot.current}/${level.extraSlot.total}`} : {}),
      ...(level.known !== undefined ? {known: `${level.spells.length} of ${level.known}`} : {}),
      spells: spells.length ? spells : 'none',
      ...(caster.casting === 'prepared' ? {prepared: (level.prepared || []).map(p => `${p.name}${p.cast ? ' (cast)' : ''}${p.slot === 'extra' ? ' (extra slot)' : ''}`)} : {}),
    };
  }).filter(Boolean),
});
