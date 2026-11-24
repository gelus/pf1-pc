import {FavoredClassOption, Feature} from '../interfaces/character.interface';
import {ABILITIES} from '../rules/ability-damage';
import {fromForm} from '../ai/feature-form';
import {ClassPreset} from '../rules/class-presets';
import {ClassLevel, featureKey} from '../utils/classlevel.class';
import {skillAbilityMap} from '../utils/skilllist.class';
import {LibraryChoice, LibraryEntryBase, LibrarySource} from './library-index';

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

export type LibraryEntry =
  | (LibraryEntryBase & {kind: 'race'; data: RaceData})
  | (LibraryEntryBase & {kind: 'racial-trait' | 'feat' | 'trait' | 'class-option'; data: FeatureData})
  | (LibraryEntryBase & {kind: 'class'; data: ClassData})
  | (LibraryEntryBase & {kind: 'archetype' | 'item' | 'spell'; data: unknown});

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

// the entry's data with its choices filled in: every {choice:<id>} becomes the pick, in a path (lower case, as the
// paths are: "abilityScores.{choice:ability}" with con is "abilityScores.con") and in any text or formula (Skill
// Focus's name and its "+6 at 10 ranks" formula name the skill). a copy, the entry is never changed
export const withChoices = <T>(data: T, picks: {[choice: string]: string} = {}): T => {
  const fill = (text: string, lower: boolean): string => text.replace(/\{choice:([^}]+)\}/g, (whole, id) =>
    picks[id] === undefined ? whole : lower ? String(picks[id]).trim().toLowerCase() : String(picks[id]).trim());
  const copy = (value: unknown, path = false): unknown => {
    if (typeof value === 'string') return fill(value, path);
    if (Array.isArray(value)) return value.map(item => copy(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, inner]) =>
      key === 'adjustments' && inner && typeof inner === 'object' && !Array.isArray(inner)
        ? [key, Object.fromEntries(Object.entries(inner).map(([adjusted, given]) => [fill(adjusted, true), copy(given, /\{[a-z]+\./.test(String(given)))]))]
        : [key, copy(inner)]));
  };
  return copy(data) as T;
};

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
export const classLevelsOf = (
  entry: LibraryEntry & {kind: 'class'}, levels: number, picks?: {[choice: string]: string}, applied?: unknown,
): {levels: ClassLevel[], problems: string[]} => {
  const data = withChoices(entry.data, picks);
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
  return {levels: built, problems};
};
