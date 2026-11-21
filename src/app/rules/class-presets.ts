import {ClassLevel} from '../utils/classlevel.class';
import {ClassSpellcasting} from '../interfaces/character.interface';

// the 11 classes of the Core Rulebook, what a level in them starts out with
// class skills use the skill names of skilllist.class.ts, 'knowledge' alone makes every knowledge a class skill
// starting wealth is the average gold of the class (3d6 x 10 gp averages 105 gp, ...)
// the class features are left out, they are added level by level as features
export type ClassPreset = Pick<
  ClassLevel,
  'name' | 'hitDice' | 'babProgression' | 'goodSaves' | 'skillRanks' | 'classSkills' | 'proficiencies' | 'startingWealth'
  | 'spellcasting' | 'alignment'
>;

// the spellcasting of the casters of the Core Rulebook (chapter 3), see rules/spellcasting.ts
// bard: casts bard spells in light armor without arcane spell failure (medium armor, shields still have it)
const caster = (spellcasting: ClassSpellcasting): {spellcasting: ClassSpellcasting} => ({spellcasting});

export const CLASS_PRESETS: ClassPreset[] = [
  {
    name: 'Barbarian', alignment: 'any nonlawful', hitDice: 12, babProgression: 'full', goodSaves: ['fort'], skillRanks: 4, startingWealth: 105,
    classSkills: [
      'acrobatics', 'climb', 'craft', 'handle animal', 'intimidate', 'knowledge (nature)', 'perception', 'ride',
      'survival', 'swim',
    ],
    proficiencies: {weapons: ['simple', 'martial'], armor: ['light', 'medium', 'shield']},
  },
  {
    name: 'Bard', hitDice: 8, babProgression: 'threeQuarters', goodSaves: ['ref', 'will'], skillRanks: 6, startingWealth: 105,
    ...caster({origin: 'bard', ability: 'cha', type: 'spontaneous', arcane: true, table: 'bard', ignoreArmorSpellFailure: ['light']}),
    classSkills: [
      'acrobatics', 'appraise', 'bluff', 'climb', 'craft', 'diplomacy', 'disguise', 'escape artist', 'intimidate',
      'knowledge', 'linguistics', 'perception', 'perform', 'profession', 'sense motive', 'sleight of hand', 'spellcraft',
      'stealth', 'use magic device',
    ],
    proficiencies: {
      weapons: ['simple', 'longsword', 'rapier', 'sap', 'short sword', 'shortbow', 'whip'],
      armor: ['light', 'shield'],
    },
  },
  {
    name: 'Cleric', hitDice: 8, babProgression: 'threeQuarters', goodSaves: ['fort', 'will'], skillRanks: 2, startingWealth: 140,
    ...caster({origin: 'cleric', ability: 'wis', type: 'prepared', arcane: false, table: 'cleric', domainSlots: true}),
    classSkills: [
      'appraise', 'craft', 'diplomacy', 'heal', 'knowledge (arcana)', 'knowledge (history)', 'knowledge (nobility)',
      'knowledge (planes)', 'knowledge (religion)', 'linguistics', 'profession', 'sense motive', 'spellcraft',
    ],
    // and the favored weapon of the deity
    proficiencies: {weapons: ['simple'], armor: ['light', 'medium', 'shield']},
  },
  {
    name: 'Druid', alignment: 'any neutral', hitDice: 8, babProgression: 'threeQuarters', goodSaves: ['fort', 'will'], skillRanks: 4, startingWealth: 70,
    ...caster({origin: 'druid', ability: 'wis', type: 'prepared', arcane: false, table: 'druid'}),
    classSkills: [
      'climb', 'craft', 'fly', 'handle animal', 'heal', 'knowledge (geography)', 'knowledge (nature)', 'perception',
      'profession', 'ride', 'spellcraft', 'survival', 'swim',
    ],
    // druids wear no metal armor and carry no metal shields
    proficiencies: {
      weapons: ['club', 'dagger', 'dart', 'quarterstaff', 'scimitar', 'scythe', 'sickle', 'shortspear', 'sling', 'spear'],
      armor: ['light', 'medium', 'shield'],
    },
  },
  {
    name: 'Fighter', hitDice: 10, babProgression: 'full', goodSaves: ['fort'], skillRanks: 2, startingWealth: 175,
    classSkills: [
      'climb', 'craft', 'handle animal', 'intimidate', 'knowledge (dungeoneering)', 'knowledge (engineering)',
      'profession', 'ride', 'survival', 'swim',
    ],
    proficiencies: {weapons: ['simple', 'martial'], armor: ['light', 'medium', 'heavy', 'shield', 'tower shield']},
  },
  {
    name: 'Monk', alignment: 'any lawful', hitDice: 8, babProgression: 'threeQuarters', goodSaves: ['fort', 'ref', 'will'], skillRanks: 4, startingWealth: 35,
    classSkills: [
      'acrobatics', 'climb', 'craft', 'escape artist', 'intimidate', 'knowledge (history)', 'knowledge (religion)',
      'perception', 'perform', 'profession', 'ride', 'sense motive', 'stealth', 'swim',
    ],
    proficiencies: {
      weapons: [
        'club', 'light crossbow', 'heavy crossbow', 'dagger', 'handaxe', 'javelin', 'kama', 'nunchaku', 'quarterstaff',
        'sai', 'shortspear', 'short sword', 'shuriken', 'siangham', 'sling', 'spear',
      ],
      armor: [],
    },
  },
  {
    name: 'Paladin', alignment: 'lawful good', hitDice: 10, babProgression: 'full', goodSaves: ['fort', 'will'], skillRanks: 2, startingWealth: 175,
    ...caster({origin: 'paladin', ability: 'cha', type: 'prepared', arcane: false, table: 'paladin', casterLevelOffset: -3}),
    classSkills: [
      'craft', 'diplomacy', 'handle animal', 'heal', 'knowledge (nobility)', 'knowledge (religion)', 'profession',
      'ride', 'sense motive', 'spellcraft',
    ],
    proficiencies: {weapons: ['simple', 'martial'], armor: ['light', 'medium', 'heavy', 'shield']},
  },
  {
    name: 'Ranger', hitDice: 10, babProgression: 'full', goodSaves: ['fort', 'ref'], skillRanks: 6, startingWealth: 175,
    ...caster({origin: 'ranger', ability: 'wis', type: 'prepared', arcane: false, table: 'ranger', casterLevelOffset: -3}),
    classSkills: [
      'climb', 'craft', 'handle animal', 'heal', 'intimidate', 'knowledge (dungeoneering)', 'knowledge (geography)',
      'knowledge (nature)', 'perception', 'profession', 'ride', 'spellcraft', 'stealth', 'survival', 'swim',
    ],
    proficiencies: {weapons: ['simple', 'martial'], armor: ['light', 'medium', 'shield']},
  },
  {
    name: 'Rogue', hitDice: 8, babProgression: 'threeQuarters', goodSaves: ['ref'], skillRanks: 8, startingWealth: 140,
    classSkills: [
      'acrobatics', 'appraise', 'bluff', 'climb', 'craft', 'diplomacy', 'disable device', 'disguise', 'escape artist',
      'intimidate', 'knowledge (dungeoneering)', 'knowledge (local)', 'linguistics', 'perception', 'perform',
      'profession', 'sense motive', 'sleight of hand', 'stealth', 'swim', 'use magic device',
    ],
    proficiencies: {
      weapons: ['simple', 'hand crossbow', 'rapier', 'sap', 'shortbow', 'short sword'],
      armor: ['light'],
    },
  },
  {
    name: 'Sorcerer', hitDice: 6, babProgression: 'half', goodSaves: ['will'], skillRanks: 2, startingWealth: 70,
    ...caster({origin: 'sorcerer', ability: 'cha', type: 'spontaneous', arcane: true, table: 'sorcerer'}),
    classSkills: [
      'appraise', 'bluff', 'craft', 'fly', 'intimidate', 'knowledge (arcana)', 'profession', 'spellcraft',
      'use magic device',
    ],
    proficiencies: {weapons: ['simple'], armor: []},
  },
  {
    name: 'Wizard', hitDice: 6, babProgression: 'half', goodSaves: ['will'], skillRanks: 2, startingWealth: 70,
    ...caster({origin: 'wizard', ability: 'int', type: 'prepared', arcane: true, table: 'wizard', specialistSchool: true}),
    classSkills: ['appraise', 'craft', 'fly', 'knowledge', 'linguistics', 'profession', 'spellcraft'],
    proficiencies: {weapons: ['club', 'dagger', 'heavy crossbow', 'light crossbow', 'quarterstaff'], armor: []},
  },
];

// a new class level entry from a preset, level is which level of the class it is
// only the first level of a class grants its proficiencies, and only the first class of the character its wealth
export const classLevelFromPreset = (preset: ClassPreset, level: number, firstCharacterLevel: boolean): ClassLevel =>
  new ClassLevel({
    name: preset.name,
    level,
    hitDice: preset.hitDice,
    rolledHp: 0,
    skillRanks: preset.skillRanks,
    classSkills: [...preset.classSkills],
    babProgression: preset.babProgression,
    goodSaves: [...(preset.goodSaves || [])],
    startingWealth: firstCharacterLevel ? preset.startingWealth : 0,
    proficiencies: level === 1
      ? {weapons: [...(preset.proficiencies?.weapons || [])], armor: [...(preset.proficiencies?.armor || [])]}
      : undefined,
    ...(preset.alignment ? {alignment: preset.alignment} : {}),
    // every level of a caster carries its spellcasting, so the class stays a caster whichever entry is removed
    ...(preset.spellcasting ? {spellcasting: {...preset.spellcasting, ...(preset.spellcasting.ignoreArmorSpellFailure
      ? {ignoreArmorSpellFailure: [...preset.spellcasting.ignoreArmorSpellFailure]} : {})}} : {}),
    features: [],
  });
