import {Archetype, archetypesOf, ClassLevel, featureKey, Proficiencies} from '../utils/classlevel.class';
import {alteredFeatures, applyArchetypes, archetypeRuleProblems, replacedFeatures, traded} from '../rules/archetypes';
import {pageFactsFor} from './rules-lookup';

// the archetypes the AI gives with a class level (add_class_level archetypes), read, checked against the rules of
// archetypes (APG, chapter 2, rules/archetypes.ts, which the class levels editor takes them by too) and against their
// page, and put on the level. an archetype is data like any other: what it replaces keeps the base class's features
// out of later levels, its own features are the level's features. the rules held to, for any archetype of any class:
//  - a class feature an archetype replaces or alters is not gained (a replaced one) or gained as it says (an altered one)
//  - two archetypes of a class can not replace or alter the same feature
//  - an archetype is taken before the class features it replaces are gained: one that trades away uncanny dodge can
//    not be taken by a barbarian who has it
//  - a proficiency it changes is the class's 1st-level feature, so it is taken at the class's 1st level then

const lower = (value: unknown): string => (typeof value === 'string' ? value : '').trim().toLowerCase();
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const listOf = (value: unknown): string[] => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/,|;/) : [])
  .map(v => text(String(v ?? ''))).filter(v => v && !/^none$/i.test(v));

const parsed = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const proficienciesPart = (value: unknown): Partial<Proficiencies> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as {[key: string]: unknown};
  const weapons = listOf(v['weapons']).map(w => w.toLowerCase());
  const armor = listOf(v['armor']).map(a => a.toLowerCase());
  return weapons.length || armor.length ? {...(weapons.length ? {weapons} : {}), ...(armor.length ? {armor} : {})} : undefined;
};

export const ARCHETYPE_FORM = '[{"name": "Invulnerable Rager", "source_url": "<its page>", "replaces": ["Uncanny Dodge", '
  + '"Improved Uncanny Dodge", "Trap Sense"], "alters": [], "class_skills": {"add": [], "remove": []}, '
  + '"proficiencies": {"add": {"weapons": [], "armor": []}, "remove": {"weapons": [], "armor": []}}}]. One that trades '
  + 'no class feature (its page says it replaces nothing) has "replaces": "none". One that changes '
  + 'how the class casts adds "spellcasting": "none" when the class casts nothing with it, else only what changes, as '
  + 'add_class_level\'s spellcasting: {"ability": "int"}, {"type": "spontaneous", "table": "sorcerer"}, '
  + '{"spells_per_day_change": -1} (one fewer a day at each spell level from 1st), {"extra_slot": "none"} (no domain or school slot)';

// the archetypes as the AI gave them: a JSON array (or one object), each named, with what it replaces from its page
export const archetypesFrom = (value: unknown, className: string): {archetypes: Archetype[], problems: string[]} => {
  if (value === undefined || value === null || value === '' || lower(value) === 'none') return {archetypes: [], problems: []};
  const read = parsed(value);
  const given = Array.isArray(read) ? read : read && typeof read === 'object' ? [read] : undefined;
  if (!given) return {archetypes: [], problems: [`archetypes is a JSON array: ${ARCHETYPE_FORM}`]};
  const problems: string[] = [];
  const archetypes: Archetype[] = [];
  for (const one of given) {
    const a = (one && typeof one === 'object' ? one : {}) as {[key: string]: unknown};
    // "Barbarian Invulnerable Rager", as it was looked up, is the class's Invulnerable Rager
    const name = text(a['name']).replace(new RegExp(`^${className.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:(-]?\\s*`, 'i'), '').replace(/\)$/, '').trim();
    if (!name) {
      problems.push(`an archetype has no name: ${ARCHETYPE_FORM}`);
      continue;
    }
    const replaces = listOf(a['replaces']);
    const alters = listOf(a['alters']);
    // an archetype may trade nothing (a totem warrior only narrows the rage powers it picks): said as "none", so a
    // list left empty is not taken for one
    const saysNone = [a['replaces'], a['alters']].some(given => /^\s*none\b/i.test(String(Array.isArray(given) ? given[0] ?? '' : given ?? '')));
    if (!replaces.length && !alters.length && !saysNone) {
      problems.push(`${name}: give "replaces" (and "alters"), the class features of ${className} it replaces or changes, as its page says ("This ability replaces ..."), or "replaces": "none" when its page says it replaces nothing`);
    }
    const skills = (a['class_skills'] && typeof a['class_skills'] === 'object' ? a['class_skills'] : {}) as {[key: string]: unknown};
    const addSkills = listOf(skills['add']).map(s => s.toLowerCase());
    const removeSkills = listOf(skills['remove']).map(s => s.toLowerCase());
    const prof = (a['proficiencies'] && typeof a['proficiencies'] === 'object' ? a['proficiencies'] : {}) as {[key: string]: unknown};
    const addProf = proficienciesPart(prof['add']);
    const removeProf = proficienciesPart(prof['remove']);
    const sourceUrl = text(a['source_url']) || text(a['sourceUrl']);
    const casting = parsed(a['spellcasting']);
    const spellcasting = lower(a['spellcasting']) === 'none' ? 'none' as const
      : casting && typeof casting === 'object' && !Array.isArray(casting) && Object.keys(casting).length ? casting as {[change: string]: unknown} : undefined;
    if (a['spellcasting'] !== undefined && a['spellcasting'] !== '' && !spellcasting) {
      problems.push(`${name}: spellcasting is "none" (the class casts no spells with it) or what it changes, a JSON object as add_class_level's spellcasting ({"ability": "int"}, {"spells_per_day_change": -1}, {"extra_slot": "none"})`);
    }
    archetypes.push({
      name, replaces, ...(alters.length ? {alters} : {}),
      ...(addSkills.length || removeSkills.length ? {classSkills: {...(addSkills.length ? {add: addSkills} : {}), ...(removeSkills.length ? {remove: removeSkills} : {})}} : {}),
      ...(addProf || removeProf ? {proficiencies: {...(addProf ? {add: addProf} : {}), ...(removeProf ? {remove: removeProf} : {})}} : {}),
      ...(spellcasting ? {spellcasting} : {}),
      ...(sourceUrl ? {sourceUrl} : {}),
    });
  }
  return {archetypes, problems};
};

// the features a page was read to say the archetype replaces or alters, that the AI left out of both
const leftOut = (archetype: Archetype, className: string): string[] => {
  const facts = pageFactsFor(archetype.sourceUrl, `${className} ${archetype.name}`) ?? pageFactsFor(undefined, archetype.name);
  const said = facts?.['replaced features'];
  if (!said || /^\s*none\b/i.test(said)) return [];
  const given = new Set(traded(archetype).map(featureKey));
  return said.split(/,|;|\band\b/).map(f => f.trim()).filter(Boolean).filter(f => featureKey(f) && !given.has(featureKey(f)));
};

// everything wrong with taking these archetypes at this level of the class, all at once: the rules of archetypes
// (rules/archetypes.ts), and what the archetype's page says it trades
export const archetypeProblems = (levels: ClassLevel[], entry: ClassLevel, archetypes: Archetype[]): string[] => [
  ...archetypeRuleProblems(levels, entry, archetypes),
  ...archetypes.flatMap(archetype => {
    if (archetypesOf(levels, entry.name).some(a => lower(a.name) === lower(archetype.name))) return [];
    const missed = leftOut(archetype, entry.name);
    return missed.length
      ? [`${archetype.name}: its page (as read) says it replaces or alters ${missed.join(', ')} too: add each to "replaces" or "alters". If the reading is wrong, look the page up again with focus "replaced features"`]
      : [];
  }),
];

export {alteredFeatures, applyArchetypes, replacedFeatures};

// the archetypes of each class, for the AI: what each trades away, so a later level leaves those features out
export const archetypesOverview = (levels: ClassLevel[]): {[className: string]: object[]} | undefined => {
  const classes = [...new Set(levels.map(l => l.name))];
  const overview = Object.fromEntries(classes.map(c => [c, archetypesOf(levels, c).map(a => ({
    name: a.name, replaces: a.replaces, ...(a.alters?.length ? {alters: a.alters} : {}),
  }))]).filter(([, list]) => (list as object[]).length));
  return Object.keys(overview).length ? overview : undefined;
};
