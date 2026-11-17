import {Feature} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {BabProgression, ClassLevel, SaveName, characterLevel} from '../utils/classlevel.class';
import {abilityModifier} from '../ability-mod.pipe';
import {RuleModule, ruleFeature} from './rule-module';

// Pathfinder 1e class progression: base attack bonus, saves, hit points, ability score increases and proficiencies
// worked out from the class level entries of the character
// see https://www.d20pfsrd.com/classes/ and https://www.d20pfsrd.com/basics-ability-scores/ability-scores/

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const SAVES: SaveName[] = ['fort', 'ref', 'will'];

// a class of the character with every entry it has, the entries are counted as its levels
export interface ClassGroup {
  name: string;
  entries: ClassLevel[];
}

const classKey = (name: string | undefined): string => (name || '').trim().toLowerCase();

// the entries grouped by class (by name, ignoring case), in the order the classes were first taken
export const classGroups = (classLevels: ClassLevel[] = []): ClassGroup[] => {
  const groups = new Map<string, ClassGroup>();
  for (const entry of classLevels) {
    const key = classKey(entry.name);
    if (!groups.has(key)) groups.set(key, {name: entry.name?.trim() || 'Unnamed class', entries: []});
    groups.get(key)!.entries.push(entry);
  }
  return [...groups.values()];
};

// the progression of a class comes from its first entry that gives one
const firstDefined = <K extends keyof ClassLevel>(group: ClassGroup, key: K): ClassLevel[K] | undefined =>
  group.entries.find(entry => entry[key] !== undefined && entry[key] !== null)?.[key];

// each class works its bab out on its own, a multiclass character adds them up
export const babFor = (progression: BabProgression, levels: number): number => {
  switch (progression) {
    case 'full': return levels;
    case 'threeQuarters': return Math.floor(levels * 3 / 4);
    case 'half': return Math.floor(levels / 2);
  }
};

// a good save starts at +2 and gains 1 every other level, a poor save gains 1 every third level
// each class gives its own, so a multiclass character gets the +2 of every class with a good save in it
export const saveFor = (good: boolean, levels: number): number =>
  good ? 2 + Math.floor(levels / 2) : Math.floor(levels / 3);

// whether an entry is a level in one of the favored classes of the character
export const isFavoredClassLevel = (char: Pick<Character, 'favoredClasses'>, entry: ClassLevel): boolean =>
  (char.favoredClasses || []).some(name => classKey(name) === classKey(entry.name));

// the number of favored class levels that give the bonus asked for, each gives one hit point or one skill rank
export const favoredClassBonuses = (
  char: Pick<Character, 'favoredClasses' | 'classLevels'>,
  bonus: ClassLevel['favoredClassBonus'],
): number => (char.classLevels || []).filter(entry => entry.favoredClassBonus === bonus && isFavoredClassLevel(char, entry)).length;

// every 4th character level raises an ability score by 1
export const isAbilityIncreaseLevel = (charLevel: number): boolean => charLevel > 0 && charLevel % 4 === 0;

const validAbility = (ability: string | undefined): string | undefined => {
  const lower = (ability || '').trim().toLowerCase();
  return ABILITIES.includes(lower) ? lower : undefined;
};

// how many ability increases the character is owed but has not picked a score for yet
export const pendingAbilityIncreases = (char: Pick<Character, 'classLevels'>): number =>
  (char.classLevels || []).filter((entry, index) =>
    isAbilityIncreaseLevel(index + 1) && !validAbility(entry.abilityIncrease)
  ).length;

// a character gets a feat at every odd character level, plus its bonus feats (racial, class, ...)
export const availableFeats = (char: Pick<Character, 'classLevels' | 'bonusFeats'>): number =>
  Math.floor((characterLevel(char) + 1) / 2) + (Number(char.bonusFeats) || 0);

const babFeatures = (groups: ClassGroup[]): Feature[] => groups.flatMap(group => {
  const progression = firstDefined(group, 'babProgression');
  if (!progression) return [];
  const levels = group.entries.length;
  return [ruleFeature(`${group.name} ${levels} (BAB)`, {bab: babFor(progression, levels)})];
});

const saveFeatures = (groups: ClassGroup[]): Feature[] => groups.flatMap(group => {
  // a class without good saves given is a legacy class, its saves are given by its features
  const goodSaves = firstDefined(group, 'goodSaves');
  if (!goodSaves) return [];
  const levels = group.entries.length;
  const adjustments: Feature['adjustments'] = {};
  for (const save of SAVES) {
    const value = saveFor(goodSaves.includes(save), levels);
    if (value) adjustments[`saves.${save}`] = value;
  }
  return [ruleFeature(`${group.name} ${levels} (saves)`, adjustments)];
});

const abilityIncreaseFeatures = (classLevels: ClassLevel[]): Feature[] => classLevels.flatMap((entry, index) => {
  const ability = validAbility(entry.abilityIncrease);
  if (!ability || !isAbilityIncreaseLevel(index + 1)) return [];
  return [ruleFeature(`Level ${index + 1} ability increase`, {[`abilityScores.${ability}`]: 1})];
});

// the proficiencies every class grants, given as features so a tooltip of them could tell where they come from
const proficiencyFeatures = (groups: ClassGroup[]): Feature[] => groups.flatMap(group => {
  const weapons = group.entries.flatMap(entry => entry.proficiencies?.weapons || []);
  const armor = group.entries.flatMap(entry => entry.proficiencies?.armor || []);
  if (!weapons.length && !armor.length) return [];
  return [ruleFeature(`${group.name} (proficiencies)`, {'proficiencies.weapons': weapons, 'proficiencies.armor': armor})];
});

// the first character level gets the most a hit die can roll, the levels after it what was rolled
// every level adds the con modifier, but gives at least 1 hit point
const hitPointFeatures = (raw: Character, applied: Character): Feature[] => {
  const classLevels = raw.classLevels || [];
  if (!classLevels.length) return [];
  const conMod = abilityModifier(applied, 'con');
  const roll = (entry: ClassLevel, index: number): number =>
    (index === 0 ? Number(entry.hitDice) : Number(entry.rolledHp)) || 0;

  const features = classGroups(classLevels).flatMap(group => {
    const dice = group.entries.reduce((sum, entry) => sum + roll(entry, classLevels.indexOf(entry)), 0);
    return dice ? [ruleFeature(`${group.name} ${group.entries.length} (hit dice)`, {hp: dice})] : [];
  });
  if (conMod) features.push(ruleFeature('Constitution (HP)', {hp: conMod * classLevels.length}));

  const belowMinimum = classLevels.reduce((sum, entry, index) => sum + Math.max(0, 1 - (roll(entry, index) + conMod)), 0);
  if (belowMinimum) features.push(ruleFeature('Minimum 1 HP per level', {hp: belowMinimum}));

  const favored = favoredClassBonuses(raw, 'hp');
  if (favored) features.push(ruleFeature('Favored class (HP)', {hp: favored}));
  return features;
};

export const classProgressionModule: RuleModule = {
  name: 'class progression',
  base: (raw) => {
    const groups = classGroups(raw.classLevels);
    return [
      ...babFeatures(groups),
      ...saveFeatures(groups),
      ...abilityIncreaseFeatures(raw.classLevels || []),
      ...proficiencyFeatures(groups),
    ];
  },
  // hit points take the final con of the character
  final: (raw, applied) => hitPointFeatures(raw, applied),
  // whatever granted a proficiency, the character has it once, by its lowercase name
  finalize: (_raw, applied) => {
    const normalize = (names: unknown): string[] => [...new Set(
      (Array.isArray(names) ? names : [names]).filter(Boolean).map(name => String(name).trim().toLowerCase()).filter(Boolean)
    )];
    applied.proficiencies = {
      weapons: normalize(applied.proficiencies?.weapons),
      armor: normalize(applied.proficiencies?.armor),
    };
  },
};
