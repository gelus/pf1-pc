import {Feature} from '../interfaces/character.interface';
import {Archetype, archetypesOf, ClassLevel, featureKey, Proficiencies} from '../utils/classlevel.class';
import {ClassSpellcasting} from '../interfaces/character.interface';
import {pageFactsFor} from './rules-lookup';

// the archetypes the AI gives with a class level (add_class_level archetypes), read, checked against the rules of
// archetypes (APG, chapter 2) and against their page, and put on the level. an archetype is data like any other: what
// it replaces keeps the base class's features out of later levels, its own features are the level's features. the
// rules held to, for any archetype of any class:
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
  + '"proficiencies": {"add": {"weapons": [], "armor": []}, "remove": {"weapons": [], "armor": []}}}]. One that changes '
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
    if (!replaces.length && !alters.length) {
      problems.push(`${name}: give "replaces" (and "alters"), the class features of ${className} it replaces or changes, as its page says ("This ability replaces ...")`);
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

// what an archetype trades: the features it replaces and those it alters
const traded = (archetype: Archetype): string[] => [...archetype.replaces, ...(archetype.alters || [])];

// the class features a page was read to say the archetype replaces or alters, that the AI left out of both
const leftOut = (archetype: Archetype, className: string): string[] => {
  const facts = pageFactsFor(archetype.sourceUrl, `${className} ${archetype.name}`) ?? pageFactsFor(undefined, archetype.name);
  const said = facts?.['replaced features'];
  if (!said || /^\s*none\b/i.test(said)) return [];
  const given = new Set(traded(archetype).map(featureKey));
  return said.split(/,|;|\band\b/).map(f => f.trim()).filter(Boolean).filter(f => featureKey(f) && !given.has(featureKey(f)));
};

// everything wrong with taking these archetypes at this level of the class, all at once
export const archetypeProblems = (levels: ClassLevel[], entry: ClassLevel, archetypes: Archetype[]): string[] => {
  if (!archetypes.length) return [];
  const problems: string[] = [];
  const before = archetypesOf(levels, entry.name);
  const earlier = levels.filter(l => lower(l.name) === lower(entry.name));
  // who trades each feature already, by its key
  const trades = new Map<string, string>();
  for (const a of before) for (const f of traded(a)) trades.set(featureKey(f), a.name);
  for (const archetype of archetypes) {
    if (before.some(a => lower(a.name) === lower(archetype.name)) || archetypes.filter(a => lower(a.name) === lower(archetype.name)).length > 1) {
      problems.push(`${entry.name} has the ${archetype.name} archetype already`);
      continue;
    }
    for (const feature of traded(archetype)) {
      const key = featureKey(feature);
      const other = trades.get(key);
      if (other && other !== archetype.name) {
        problems.push(`${archetype.name} and ${other} both replace or alter ${feature}: two archetypes of a class can not trade the same class feature (APG), so the character can not take both`);
      }
      trades.set(key, archetype.name);
      const gained = earlier.find(l => (l.features || []).some(f => featureKey(f.name || '') === key));
      if (gained) {
        problems.push(`${archetype.name} trades ${feature}, which the character gained at ${entry.name} ${gained.level}: an archetype is taken before the class features it replaces or alters are gained, so it can not be taken now`);
      }
    }
    if (archetype.proficiencies && entry.level !== 1) {
      problems.push(`${archetype.name} changes the class's proficiencies, a feature of ${entry.name} 1: it is taken at the class's 1st level`);
    }
    const missed = leftOut(archetype, entry.name);
    if (missed.length) {
      problems.push(`${archetype.name}: its page (as read) says it replaces or alters ${missed.join(', ')} too: add each to "replaces" or "alters". If the reading is wrong, look the page up again with focus "replaced features"`);
    }
  }
  return problems;
};

// the features given at a level of the class that one of its archetypes replaces: those are not gained
export const replacedFeatures = (archetypes: Archetype[], features: Feature[]): string[] => features.flatMap(feature => {
  const key = featureKey(feature.name || '');
  const by = archetypes.find(a => a.replaces.some(r => featureKey(r) === key));
  return key && by ? [`${feature.name} is replaced by the ${by.name} archetype: leave it out and give the archetype's feature of this level instead (its page)`] : [];
});

// the features given at a level that an archetype alters: gained, as the archetype writes them, which the AI is told
export const alteredFeatures = (archetypes: Archetype[], features: Feature[]): string[] => features.flatMap(feature => {
  const key = featureKey(feature.name || '');
  const by = archetypes.find(a => (a.alters || []).some(r => featureKey(r) === key));
  return key && by ? [`${feature.name} is changed by the ${by.name} archetype: check it is written as the archetype's page changes it`] : [];
});

// the archetypes put on the class: the level keeps them, and the class skills and proficiencies they change are the
// class's (every level of it, so whichever entry is read gives the same)
// (every level of it, so whichever entry is read gives the same). the new entry is changed, the earlier ones of the
// class are given back changed as copies, for the update to put in their place
// a spellcasting given (null for none) is the class's from now on, on every level of it
export const applyArchetypes = (
  entry: ClassLevel, earlier: ClassLevel[], archetypes: Archetype[], spellcasting?: ClassSpellcasting | null,
): Map<ClassLevel, ClassLevel> => {
  const changed = new Map<ClassLevel, ClassLevel>();
  if (!archetypes.length) return changed;
  if (spellcasting !== undefined) {
    const copy = () => spellcasting ? JSON.parse(JSON.stringify(spellcasting)) as ClassSpellcasting : undefined;
    entry.spellcasting = copy();
    for (const level of earlier) changed.set(level, new ClassLevel({...level, spellcasting: copy()}));
  }
  entry.archetypes = [...(entry.archetypes || []), ...archetypes];
  const skillsChanged = (skills: string[]): string[] => archetypes.reduce((list, a) => {
    if (!a.classSkills) return list;
    const removed = new Set(a.classSkills.remove || []);
    return [...new Set([...list.filter(s => !removed.has(s.toLowerCase())), ...(a.classSkills.add || [])])];
  }, skills);
  entry.classSkills = skillsChanged(entry.classSkills || []);
  if (archetypes.some(a => a.classSkills)) {
    for (const level of earlier) {
      const now = changed.get(level) ?? level;
      changed.set(level, new ClassLevel({...now, classSkills: skillsChanged(now.classSkills || [])}));
    }
  }
  // the proficiencies are the class's 1st level's
  for (const a of archetypes) {
    if (!a.proficiencies || !entry.proficiencies) continue;
    const change = (list: string[], kind: 'weapons' | 'armor') => {
      const removed = new Set((a.proficiencies!.remove?.[kind] || []).map(lower));
      return [...new Set([...list.filter(p => !removed.has(lower(p))), ...(a.proficiencies!.add?.[kind] || [])])];
    };
    entry.proficiencies = {weapons: change(entry.proficiencies.weapons, 'weapons'), armor: change(entry.proficiencies.armor, 'armor')};
  }
  return changed;
};

// the archetypes of each class, for the AI: what each trades away, so a later level leaves those features out
export const archetypesOverview = (levels: ClassLevel[]): {[className: string]: object[]} | undefined => {
  const classes = [...new Set(levels.map(l => l.name))];
  const overview = Object.fromEntries(classes.map(c => [c, archetypesOf(levels, c).map(a => ({
    name: a.name, replaces: a.replaces, ...(a.alters?.length ? {alters: a.alters} : {}),
  }))]).filter(([, list]) => (list as object[]).length));
  return Object.keys(overview).length ? overview : undefined;
};
