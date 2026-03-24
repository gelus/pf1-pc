import { Skill, SkillObj } from '../interfaces/character.interface';

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

const subSkillLists: {[key:string]:string[]} = {
  'craft': ['woodwork', 'spagheti'],
  'professions': ['sailor', 'carpenter'],
}

const generateSkill = (skills:SkillObj, name: string): SkillObj => {
  skills[name] = {
    name,
    ranks: 0,
    value: 0,
    classSkill: false,
    baseAbility: skillAbilityMap[name],
    ...(subSkillLists[name]? {subSkills: getSkillList(subSkillLists[name])}: {})
  }
  return skills;
};

export const getSkillList = (skills?: string[]): SkillObj => (skills ? skills : Object.keys(skillAbilityMap)).reduce<SkillObj>(generateSkill, {})

