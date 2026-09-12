import {Character} from "../utils/character.class";
import {v4} from 'uuid';

export const sizes = [ 'Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];

// bonus types dropped from touch AC, everything else (size, dex, deflection, ...) applies normally
export const touchAcIgnoredBonusTypes = ['armor', 'shield', 'natural', 'natural armor'];
// bonus types dropped from flat-footed AC
export const flatFootedAcIgnoredBonusTypes = ['dodge'];
// a flat-footed character keeps no dex bonus to its AC, a dex penalty however still applies to it
// the dex modifier of the character itself is added by the sheet, these are the typed adjustments of it
export const dexBonusTypes = ['dex', 'dexterity'];

export type Size = 'Fine'| 'Diminutive'| 'Tiny'| 'Small'| 'Medium'| 'Large'| 'Large'| 'Huge'| 'Gargantuan'| 'Colossal';
export type Alignment = 'LG'|'NG'|'CG'|'LN'|'N'|'CN'|'LE'|'NE'|'CE';

export interface Charges {
  total: number;
  current: number;
  label?: string;
};

export class Feature {
  id: string = v4();
  name?: string = 'A New Feature';
  description?: string = 'A new Feature';
  adjustments: Adjustments = {ac:1};
  active?: boolean | undefined;
  charges?: Charges;
  constructor(feature?: Partial<Feature>) {
    if (feature) Object.assign(this, feature);
  }
}

// an adjustment can carry a bonus type, bonuses of the same type do not stack and some of them are
// dropped from the derived ACs, see touchAcIgnoredBonusTypes / flatFootedAcIgnoredBonusTypes
export interface TypedAdjustment {
  value: number|string;
  type?: string;
}

export interface Adjustments extends Omit<Partial<Character>, "cmd"|"ac"|"touchAc"|"flatFootedAc"> {
  [adjust:string]: any,
  cmd?: number|string,
  ac?: number|string|TypedAdjustment,
  touchAc?: number|string|TypedAdjustment,
  flatFootedAc?: number|string|TypedAdjustment,
}

export interface Race {
  name: string;
  subtype: string;
  features: Feature[];
}

export interface Saves {
  fort: number;
  ref: number;
  will: number;
  conditional: string;
}

export interface Speed {
  land?: number;
  fly?: number;
  swim?: number;
}

export interface Level {
  class: string
  features: Feature[]
}

export interface SpellLevel {
  perDay: number;
  spells: Spell[];
}

export interface Spell {
  name: string;
}

export interface AbilityScores {
  [key: string]: number
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface Skill {
  name: string;
  ranks: number;
  value: number;
  baseAbility: string;
  classSkill: boolean;
  subSkills?: SkillObj
}

export interface SkillObj {
  [name: string]: Skill
}

