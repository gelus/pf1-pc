import { Skill, SkillObj } from '../interfaces/character.interface';

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

// the skills that can only be used trained, with at least one rank in them (core rulebook, chapter 4, table 4-2: skill
// summary, the "untrained" column). a family stands for every skill of it: each knowledge and each profession is
// trained only. anyone can still try any other skill untrained
export const TRAINED_ONLY_SKILLS = [
  'disable device',
  'handle animal',
  'knowledge',
  'linguistics',
  'profession',
  'sleight of hand',
  'spellcraft',
  'use magic device',
] as const;

// whether a skill can only be used trained, name is the skill or, for a skill of a family (knowledge (arcana)), the
// family
export const isTrainedOnly = (name: string): boolean =>
  (TRAINED_ONLY_SKILLS as readonly string[]).includes(name.trim().toLowerCase());

// whether the character can use a skill at all: a trained only skill needs a rank, see isTrainedOnly. name is the
// skill or its family, skill holds its ranks
export const canUseSkill = (name: string, skill: Pick<Skill, 'ranks'> | undefined): boolean =>
  !isTrainedOnly(name) || (Number(skill?.ranks) || 0) > 0;

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


