import {FavoredClassOption, Feature} from '../interfaces/character.interface';
import {ABILITIES} from '../rules/ability-damage';
import {fromForm} from '../ai/feature-form';
import {ClassPreset} from '../rules/class-presets';
import {applyArchetypes} from '../rules/archetypes';
import {Archetype, ClassLevel, featureKey} from '../utils/classlevel.class';
import {skillAbilityMap} from '../utils/skilllist.class';
import {LibraryChoice, LibraryEntryBase, LibrarySource} from './library-index';
import {withChoices} from '../utils/choices';

// what each kind of entry keeps as its data, in the app's own shapes. a feature is written as the character keeps it,
// with no id: taking the entry gives it a new one, on the character's own copy

export type LibraryFeature = Omit<Partial<Feature>, 'id'> & {name: string; description: string; adjustments: Feature['adjustments']};

// an alternate favored class bonus of a race, as its page gives it: the class, the text verbatim, what one pick adds
// (a fraction as the page writes it, "1/2"), its source when not the race's, and, for a bonus no path can hold, why
// ("no path: the mount's hit points are on its own sheet")
export type LibraryFavoredOption = Omit<FavoredClassOption, 'id' | 'adjustments'> & {
  adjustments: {[path: string]: unknown};
  descriptionOnly?: string;
  source?: LibrarySource;
};

// a race: its standard racial traits, the racial stats first (its ability modifiers, size, speed, languages), and the
// alternate favored class bonuses its page lists. its alternate racial traits are entries of their own
// (racial-trait/<race>/<trait>), each with what it replaces
export interface RaceData {
  subtype: string;
  quadruped?: boolean;
  features: LibraryFeature[];
  favoredClassOptions?: LibraryFavoredOption[];
}

// a feat, a trait, a racial trait, a class option (a rage power, a hex, a domain's power): one feature
export interface FeatureData {
  feature: LibraryFeature;
}

// a row of a class's table as its page gives it: the level, the base attack bonus ("+6/+1"), the base saves and the
// special column ("Rage power, Trap sense +2")
export interface ClassTableRow {
  level: number;
  bab: string;
  fort: string;
  ref: string;
  will: string;
  special: string;
  // a caster's spells per day and (spontaneous) spells known at this level, by spell level, as its tables give them
  // ("—" left out)
  spells?: {[spellLevel: string]: number};
  known?: {[spellLevel: string]: number};
}

// a class feature: the level it is gained at, and what grows by level as the class table gives it, in the form the
// builders take from the AI (feature-form.ts): "grows" ({"<path>": {"<level>": <value>}}) and "uses_by_level"
// ({"at": {"<level>": <uses>}, "plus": "con"}). the app fits the formula when the class is taken, as for the AI
export type LibraryClassFeature = LibraryFeature & {
  gainedAt: number;
  grows?: {[path: string]: {[level: string]: number}};
  uses_by_level?: {at: {[level: string]: number}; plus?: string; per?: string; label?: string};
};

// a class: what a level of it starts out with (its preset), its table, and its features by the level gained
export interface ClassData {
  preset: ClassPreset;
  table: ClassTableRow[];
  features: LibraryClassFeature[];
}

// an archetype: the class it is of (its entry's id), what it trades as the app keeps it on a class level (what it
// replaces and alters, its class skills, proficiencies and spellcasting changed), and its own features by level, in
// the form of a class's
export interface ArchetypeData {
  class: string;
  archetype: Archetype;
  features: LibraryClassFeature[];
}

export type LibraryEntry =
  | (LibraryEntryBase & {kind: 'race'; data: RaceData})
  | (LibraryEntryBase & {kind: 'racial-trait' | 'feat' | 'trait' | 'class-option'; data: FeatureData})
  | (LibraryEntryBase & {kind: 'class'; data: ClassData})
  | (LibraryEntryBase & {kind: 'archetype'; data: ArchetypeData})
  | (LibraryEntryBase & {kind: 'item' | 'spell'; data: unknown});

const SKILLS = Object.keys(skillAbilityMap);

// what is wrong with the picks for an entry's choices: one missing, or one its kind (or its options) does not allow
export const choiceProblems = (choices: LibraryChoice[] = [], picks: {[choice: string]: string} = {}): string[] => {
  const problems: string[] = [];
  for (const choice of choices) {
    const pick = String(picks[choice.id] ?? '').trim();
    if (!pick) {
      problems.push(`${choice.id}: ${choice.label}${choice.options?.length ? ` (${choice.options.join(', ')})` : ''}`);
      continue;
    }
    const allowed = choice.options?.length ? choice.options
      : choice.kind === 'ability' ? [...ABILITIES]
      : choice.kind === 'skill' ? SKILLS
      : undefined;
    if (allowed && !allowed.some(option => option.toLowerCase() === pick.toLowerCase())) {
      problems.push(`${choice.id}: ${pick} is not one of ${allowed.join(', ')}`);
    }
  }
  return problems;
};

// the entry's data with its choices filled in (utils/choices.ts)
export {withChoices};

// the features of an entry, as the engine keeps them (each with an id of its own)
export const entryFeatures = (entry: LibraryEntry, picks?: {[choice: string]: string}): Feature[] => {
  const filled = withChoices(entry.data, picks);
  const written: LibraryFeature[] = entry.kind === 'race' ? (filled as RaceData).features
    : ['racial-trait', 'feat', 'trait', 'class-option'].includes(entry.kind) ? [(filled as FeatureData).feature]
    : [];
  return written.map(feature => new Feature(JSON.parse(JSON.stringify(feature))));
};

// a race's features with alternate racial traits taken: each in place of the standard traits it replaces (by the
// names its page gives, "Darkvision", matched as featureKey does). the race's own choices and the traits' are filled
// from the same picks
export const raceFeaturesWith = (
  race: LibraryEntry & {kind: 'race'}, alternates: LibraryEntry[], picks?: {[choice: string]: string},
): Feature[] => {
  const traits = alternates.flatMap(alternate => entryFeatures(alternate, picks));
  const replaced = new Set(traits.flatMap(trait => trait.replaces || []).map(featureKey));
  return [...entryFeatures(race, picks).filter(feature => !replaced.has(featureKey(feature.name || ''))), ...traits];
};

// the class levels of a character with this many levels of the class: each its preset's fixed values (proficiencies,
// wealth and spellcasting on the first, as a level up keeps them), and the features gained at it, their tables fitted
// into formulas of the class level and their uses worked out at that level (with the character's ability modifiers
// when applied is given, as the builders do)
// a class feature without the steps an archetype takes, by the class levels they are gained at: each number it grows
// by loses what those levels added (a fighter's bonus feats without the 6th level's: 2 at 4th, still 3 at 6th, 4 at
// 12th), and it is gained at the first level whose step is kept. with no step kept, it is not gained at all
// its steps are the levels the class table names it at ("Weapon training 2" at 9th)
const withoutSteps = (feature: LibraryClassFeature, levels: number[], table: ClassTableRow[]): LibraryClassFeature[] => {
  const key = featureKey(feature.name);
  const named = table.filter(row => row.special.split(',').some(part => featureKey(part) === key)).map(row => row.level);
  const kept = (named.length ? named : [feature.gainedAt]).filter(level => !levels.includes(level)).sort((a, b) => a - b);
  if (!kept.length) return [];
  const copy = JSON.parse(JSON.stringify(feature)) as LibraryClassFeature;
  copy.gainedAt = Math.max(feature.gainedAt, kept[0]);
  // a number by level, less what the levels taken added
  const less = (byLevel: {[level: string]: number}): {[level: string]: number} => {
    const points = Object.entries(byLevel).map(([level, value]) => [Number(level), value]).sort((a, b) => a[0] - b[0]);
    const out: {[level: string]: number} = {};
    let lost = 0;
    points.forEach(([level, value], i) => {
      if (levels.includes(level)) lost += value - (i ? points[i - 1][1] : 0);
      else if (level >= copy.gainedAt) out[level] = value - lost;
    });
    return out;
  };
  for (const path of Object.keys(copy.grows || {})) copy.grows![path] = less(copy.grows![path]);
  if (copy.uses_by_level) copy.uses_by_level.at = less(copy.uses_by_level.at);
  return [copy];
};

export const classLevelsOf = (
  entry: LibraryEntry & {kind: 'class'}, levels: number, picks?: {[choice: string]: string}, applied?: unknown,
  archetypes: (LibraryEntry & {kind: 'archetype'})[] = [],
): {levels: ClassLevel[], problems: string[]} => {
  const data = withChoices(entry.data, picks);
  // with archetypes: the class's features they replace left out, those they alter left out when the archetype gives
  // the feature as it rewrites it, with what it adjusts (a controlled rage named Rage), kept when the archetype only adds to it (a giant
  // stalker speaks Giant while raging); theirs in at the levels they are gained (APG)
  const taken = archetypes.map(archetype => withChoices(archetype.data, picks));
  // (a feature of the archetype's that only tells what changes, adjusting nothing and with no uses, leaves the class's numbers: a monk
  // archetype's Bonus Feat that changes the list keeps the class's bonus feats)
  const rewritten = new Set(taken.flatMap(archetype => archetype.features
    .filter(f => Object.keys(f.adjustments || {}).length || (f as LibraryClassFeature).uses_by_level || f.charges).map(f => featureKey(f.name))));
  const trades = new Set(taken.flatMap(archetype => [
    ...archetype.archetype.replaces, ...(archetype.archetype.alters || []).filter(name => rewritten.has(featureKey(name))),
  ]).map(featureKey));
  // the steps of a feature they take (weapon training 1, the bonus feat of 6th level): gained from its first step left,
  // and growing only by the steps left
  const steps = new Map<string, number[]>();
  for (const archetype of taken) {
    for (const [name, levels] of Object.entries(archetype.archetype.tradesAt || {})) {
      steps.set(featureKey(name), [...(steps.get(featureKey(name)) || []), ...levels]);
    }
  }
  data.features = [
    ...data.features.filter(feature => !trades.has(featureKey(feature.name))).flatMap(feature => {
      const levels = steps.get(featureKey(feature.name));
      return levels ? withoutSteps(feature, levels, data.table) : [feature];
    }),
    ...taken.flatMap(archetype => archetype.features)];
  const {proficiencies, startingWealth, spellcasting, ...each} = data.preset;
  const problems: string[] = [];
  const className = data.preset.name;
  const built = Array.from({length: levels}, (_, i) => new ClassLevel({
    ...JSON.parse(JSON.stringify(each)), level: i + 1,
    ...(i === 0 ? {proficiencies, startingWealth, ...(spellcasting ? {spellcasting} : {})} : {startingWealth: 0}),
    features: data.features.filter(feature => feature.gainedAt === i + 1).map(written => {
      const {gainedAt: _, ...rest} = JSON.parse(JSON.stringify(written));
      const feature = new Feature(rest);
      problems.push(...fromForm(feature, {level: `{level.${className.toLowerCase()}}`, className, classLevel: levels, applied}).problems);
      return feature;
    }),
  }));
  // its class skills, proficiencies and spellcasting as the archetypes change them, kept on the class's levels
  if (built.length && taken.length) {
    const archetypes = taken.map(archetype => archetype.archetype);
    const others = applyArchetypes(built[0], built.slice(1), archetypes);
    built.forEach((level, i) => { if (i && others.has(level)) built[i] = others.get(level)!; });
  }
  return {levels: built, problems};
};
