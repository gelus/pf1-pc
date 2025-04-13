import { Skill, SkillObj } from '../interfaces/character.interface';

const subSkillLists = ['craft', 'profession'];

const skillAbilityMap: {[name:string]: string} = {
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
  'knowledge (arcana)': 'int',
  'knowledge (dungeoneering)': 'int',
  'knowledge (engineering)': 'int',
  'knowledge (geography)': 'int',
  'knowledge (history)': 'int',
  'knowledge (local)': 'int',
  'knowledge (nature)': 'int',
  'knowledge (nobility)': 'int',
  'knowledge (planes)': 'int',
  'knowledge (religion)': 'int',
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
}

const generateSkill = (skills:SkillObj, name: string): SkillObj => {
  skills[name] = {
    name,
    ranks: 0,
    value: 0,
    classSkill: false,
    baseAbility: skillAbilityMap[name],
    ...(subSkillLists.includes(name)? {subSkills: {} as SkillObj}: {})
  }
  return skills;
};

export const getSkillList = (): SkillObj => Object.keys(skillAbilityMap).reduce<SkillObj>(generateSkill, {})

