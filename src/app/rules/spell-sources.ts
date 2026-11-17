import {CasterType, Feature, Spell, SpellCasting, SpellLevel} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {getByPath} from '../utils/object.util';

// where the raw character keeps what a caster is made of: the caster itself (spells.<origin>) and the features that
// add to it (a caster, its spell levels or its spells given as adjustments). what the character does with its spells
// (slots spent, spells prepared and cast) is kept there, so a rest finds it there too (see restSpellLevel)
// these work on whatever character they are given, the service gives them its raw character, a rest a copy of it

export type SpellCastingType = 'spells' | 'spellLikeAbilities';

// the lists of features of the character, besides those of its class levels and its items
export const FEATURE_LIST_LOCATIONS = ['race.features', 'conditions', 'feats', 'specialAttack', 'traits', 'drawbacks'];

// the active features that apply to the character: those of its class levels, its feature lists and its equipped items
export const activeRawFeatures = (char: Character, locations: string[] = FEATURE_LIST_LOCATIONS): Feature[] => {
  const featureLists = locations
    .map(location => getByPath(char, location) as Feature[])
    .filter((features): features is Feature[] => Array.isArray(features));
  return [
    ...(char.classLevels || []).flatMap(classLevel => classLevel.features || []),
    ...featureLists.flat(),
    ...(char.inventory || []).filter(item => item.equipped).flatMap(item => item.features || []),
  ].filter(feature => feature && feature.active !== false);
};

export const rawCasterSources = (
  char: Character, type: SpellCastingType, origin: string, locations?: string[],
): CasterType[] => {
  const sources: CasterType[] = [];
  const direct = char[type]?.[origin];
  if (direct) sources.push(direct);

  for (const feature of activeRawFeatures(char, locations)) {
    const rootCaster = (feature.adjustments?.[type] as SpellCasting | undefined)?.[origin];
    const originCaster = feature.adjustments?.[`${type}.${origin}`] as CasterType | undefined;
    if (rootCaster) sources.push(rootCaster);
    if (originCaster && originCaster !== rootCaster) sources.push(originCaster);
  }
  return sources;
};

export const rawSpellLevelSources = (
  char: Character, type: SpellCastingType, origin: string, levelIndex: number, locations?: string[],
): SpellLevel[] => {
  const sources = rawCasterSources(char, type, origin, locations)
    .map(caster => caster.spells?.[levelIndex])
    .filter((level): level is SpellLevel => !!level);

  for (const feature of activeRawFeatures(char, locations)) {
    const levels = feature.adjustments?.[`${type}.${origin}.spells`];
    const level = feature.adjustments?.[`${type}.${origin}.spells.${levelIndex}`];
    if (Array.isArray(levels) && levels[levelIndex]) sources.push(levels[levelIndex]);
    if (level?.perDay && !sources.includes(level)) sources.push(level);
  }
  return sources;
};

export const rawSpellArrays = (
  char: Character, type: SpellCastingType, origin: string, levelIndex: number, locations?: string[],
): Spell[][] => {
  const arrays = rawSpellLevelSources(char, type, origin, levelIndex, locations)
    .map(level => level.spells)
    .filter((spells): spells is Spell[] => Array.isArray(spells));

  for (const feature of activeRawFeatures(char, locations)) {
    const adjustment = feature.adjustments?.[`${type}.${origin}.spells.${levelIndex}.spells`];
    if (Array.isArray(adjustment)) arrays.push(adjustment);
  }
  return arrays;
};

// a rest, for one spell level: every use of the level comes back (its uses per day, the slots spent of a class caster,
// its domain or school slot) and its prepared spells can be cast again, a prepared caster keeps what it prepared
// changes the character it is given
export const restSpellLevel = (
  char: Character, type: SpellCastingType, origin: string, levelIndex: number, locations?: string[],
): void => {
  for (const level of rawSpellLevelSources(char, type, origin, levelIndex, locations)) {
    if (level.perDay) level.perDay.current = level.perDay.total;
    if (level.used) level.used = 0;
    if (level.extraUsed) level.extraUsed = 0;
    for (const prepared of level.prepared || []) prepared.cast = false;
  }
};
