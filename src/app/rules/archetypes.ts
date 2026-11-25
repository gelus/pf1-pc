import {ClassSpellcasting, Feature} from '../interfaces/character.interface';
import {Archetype, archetypesOf, ClassLevel, featureKey} from '../utils/classlevel.class';
import {KNOWLEDGE_SPECIALTIES} from '../utils/skilllist.class';

// the rules of archetypes (APG, chapter 2), for any archetype of any class. the AI's add_class_level and retrain
// (ai/archetypes.ts, which also holds an archetype to its page) and the class levels editor take one by them:
//  - a class feature an archetype replaces or alters is not gained (a replaced one) or gained as it says (an altered one)
//  - two archetypes of a class can not replace or alter the same feature
//  - an archetype is taken before the class features it replaces are gained: one that trades away uncanny dodge can
//    not be taken by a barbarian who has it
//  - a proficiency it changes is the class's 1st-level feature, so it is taken at the class's 1st level then

const lower = (value: unknown): string => (typeof value === 'string' ? value : '').trim().toLowerCase();

// what an archetype trades: the features it replaces and those it alters
export const traded = (archetype: Archetype): string[] => [...archetype.replaces, ...(archetype.alters || [])];

// what two archetypes both trade: a feature one replaces or alters and the other trades at all, or a step of a feature
// both take (two fighter archetypes may each take other steps of weapon training, never the same one)
const tradedByBoth = (a: Archetype, b: Archetype): string[] => {
  const whole = (x: Archetype) => new Set(traded(x).map(featureKey));
  const steps = (x: Archetype) => new Map(Object.entries(x.tradesAt || {}).map(([f, levels]) => [featureKey(f), levels]));
  const [wa, wb, sa, sb] = [whole(a), whole(b), steps(a), steps(b)];
  const names = [...traded(a), ...Object.keys(a.tradesAt || {})];
  return [...new Set(names.filter(name => {
    const key = featureKey(name);
    if (wa.has(key)) return wb.has(key) || sb.has(key);
    return wb.has(key) || (sa.get(key) || []).some(level => (sb.get(key) || []).includes(level));
  }))];
};

// everything wrong with taking these archetypes at this level of the class by the rules of archetypes, all at once
export const archetypeRuleProblems = (levels: ClassLevel[], entry: ClassLevel, archetypes: Archetype[]): string[] => {
  if (!archetypes.length) return [];
  const problems: string[] = [];
  const before = archetypesOf(levels, entry.name);
  const earlier = levels.filter(l => lower(l.name) === lower(entry.name));
  const highest = Math.max(0, ...earlier.map(l => l.level || 0));
  const taken: Archetype[] = [...before];
  for (const archetype of archetypes) {
    if (before.some(a => lower(a.name) === lower(archetype.name)) || archetypes.filter(a => lower(a.name) === lower(archetype.name)).length > 1) {
      problems.push(`${entry.name} has the ${archetype.name} archetype already`);
      continue;
    }
    for (const other of taken) {
      for (const feature of tradedByBoth(archetype, other)) {
        problems.push(`${archetype.name} and ${other.name} both replace or alter ${feature}: two archetypes of a class can not trade the same class feature (APG), so the character can not take both`);
      }
    }
    taken.push(archetype);
    for (const [feature, levels] of Object.entries(archetype.tradesAt || {})) {
      const had = levels.filter(level => level <= highest);
      if (had.length) {
        problems.push(`${archetype.name} trades ${feature} gained at ${entry.name} ${had.join(', ')}, which the character has: an archetype is taken before the class features it replaces or alters are gained, so it can not be taken now`);
      }
    }
    for (const feature of traded(archetype)) {
      const key = featureKey(feature);
      const gained = earlier.find(l => (l.features || []).some(f => featureKey(f.name || '') === key));
      if (gained) {
        problems.push(`${archetype.name} trades ${feature}, which the character gained at ${entry.name} ${gained.level}: an archetype is taken before the class features it replaces or alters are gained, so it can not be taken now`);
      }
    }
    if (archetype.proficiencies && entry.level !== 1) {
      problems.push(`${archetype.name} changes the class's proficiencies, a feature of ${entry.name} 1: it is taken at the class's 1st level`);
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

// what is wrong with the archetypes a character's classes have now: a class feature one of them replaced, a feature
// two of them trade. the end check of a creation or level up holds to them, the class levels editor shows them
export const archetypeWarnings = (levels: ClassLevel[]): string[] =>
  [...new Set(levels.map(l => l.name))].flatMap(name => {
    const archetypes = archetypesOf(levels, name);
    const features = levels.filter(l => l.name === name).flatMap(l => l.features || []);
    const twice = archetypes.flatMap((a, i) => archetypes.slice(i + 1).flatMap(b => tradedByBoth(a, b)
      .map(f => `${a.name} and ${b.name} both trade ${f}: two archetypes of ${name} can not trade the same class feature`)));
    return [...replacedFeatures(archetypes, features), ...twice];
  });

// the archetypes put on the class: the level keeps them, and the class skills and proficiencies they change are the
// class's (every level of it, so whichever entry is read gives the same). the entry is changed, the other levels of
// the class are given back changed as copies, for the update to put in their place
// a spellcasting given (null for none) is the class's from now on, on every level of it
export const applyArchetypes = (
  entry: ClassLevel, others: ClassLevel[], archetypes: Archetype[], spellcasting?: ClassSpellcasting | null,
): Map<ClassLevel, ClassLevel> => {
  const changed = new Map<ClassLevel, ClassLevel>();
  if (!archetypes.length) return changed;
  if (spellcasting !== undefined) {
    const copy = () => spellcasting ? JSON.parse(JSON.stringify(spellcasting)) as ClassSpellcasting : undefined;
    entry.spellcasting = copy();
    for (const level of others) changed.set(level, new ClassLevel({...level, spellcasting: copy()}));
  }
  entry.archetypes = [...(entry.archetypes || []), ...archetypes];
  const skillsChanged = (skills: string[]): string[] => archetypes.reduce((list, a) => {
    if (!a.classSkills) return list;
    const removed = new Set((a.classSkills.remove || []).map(lower));
    // a Knowledge it takes off a class that has them all (an arcane warden's nobility): the others stay
    const spread = [...removed].some(s => s.startsWith('knowledge (')) && list.some(s => lower(s) === 'knowledge')
      ? [...list.filter(s => lower(s) !== 'knowledge'), ...KNOWLEDGE_SPECIALTIES.map(k => `knowledge (${k})`)] : list;
    return [...new Set([...spread.filter(s => !removed.has(lower(s))), ...(a.classSkills.add || [])])];
  }, skills);
  entry.classSkills = skillsChanged(entry.classSkills || []);
  if (archetypes.some(a => a.classSkills)) {
    for (const level of others) {
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
