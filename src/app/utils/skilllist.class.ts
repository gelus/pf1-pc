import { SkillObj } from '../interfaces/character.interface';

export const SKILL_FAMILIES = ['craft', 'knowledge', 'perform', 'profession'] as const;
export const OPEN_SKILL_FAMILIES = ['craft', 'perform', 'profession'] as const;
export const KNOWLEDGE_SPECIALTIES = [
  'arcana',
  'dungeoneering',
  'engineering',
  'geography',
  'history',
  'local',
  'nature',
  'nobility',
  'planes',
  'religion',
] as const;

export const isSkillFamily = (name: string): boolean =>
  (SKILL_FAMILIES as readonly string[]).includes(name.toLowerCase());

export const isOpenSkillFamily = (name: string): boolean =>
  (OPEN_SKILL_FAMILIES as readonly string[]).includes(name.toLowerCase());

export const skillAbilityMap: {[name:string]: string} = {
  'acrobatics': 'dex',
  'appraise': 'int',
  'bluff': 'cha',
  'climb': 'str',
  'craft': 'int',
  'diplomacy': 'cha',
  'disable device': 'dex',
  'disguise': 'cha',
  'escape artist': 'dex',
  'fly': 'dex',
  'handle animal': 'cha',
  'heal': 'wis',
  'intimidate': 'cha',
  'knowledge': 'int',
  'linguistics': 'int',
  'perception': 'wis',
  'perform': 'cha',
  'profession': 'wis',
  'ride': 'dex',
  'sense motive': 'wis',
  'sleight of hand': 'dex',
  'spellcraft': 'int',
  'stealth': 'dex',
  'survival': 'wis',
  'swim': 'str',
  'use magic device': 'cha',
};

const generateSubSkills = (specialties: readonly string[], baseAbility: string): SkillObj =>
  specialties.reduce<SkillObj>((acc, subName) => {
    acc[subName] = {
      name: subName,
      ranks: 0,
      value: 0,
      classSkill: false,
      baseAbility,
    };
    return acc;
  }, {});

const generateSkill = (skills: SkillObj, name: string): SkillObj => {
  const baseAbility = skillAbilityMap[name];
  const isFamily = isSkillFamily(name);
  skills[name] = {
    name,
    ranks: 0,
    value: 0,
    classSkill: false,
    baseAbility,
    ...(isFamily
      ? {
          subSkills:
            name === 'knowledge'
              ? generateSubSkills(KNOWLEDGE_SPECIALTIES, baseAbility)
              : {},
        }
      : {}),
  };
  return skills;
};

export const getSkillList = (skills?: string[]): SkillObj =>
  (skills ? skills : Object.keys(skillAbilityMap)).reduce<SkillObj>(generateSkill, {});


