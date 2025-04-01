import {Character} from "../utils/character.class";

export const sizes = [ 'Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];
export type Size = 'Fine'| 'Diminutive'| 'Tiny'| 'Small'| 'Medium'| 'Large'| 'Large'| 'Huge'| 'Gargantuan'| 'Colossal';
export type Alignment = 'LG'|'NG'|'CG'|'LN'|'N'|'CN'|'LE'|'NE'|'CE';

export interface Feature {
  name: string;
  destination?: string;
  description?: string;
  adjustments: Adjustments;
}

export interface Adjustments extends Partial<Character> {
  [adjust:string]:any
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

export interface Attack {
  name: string;
  hit: number[];
  damage: string;
  crit: number;
  range: number;
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
  baseAbility: string;
  classSkill: boolean;
  subSkills?: {[name: string]: Skill}
}

export interface SkillObj {
  [name: string]: Skill
}

