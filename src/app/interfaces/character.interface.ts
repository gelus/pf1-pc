import {Character} from "../utils/character.class";
import {v4} from 'uuid';

export const sizes = [ 'Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];
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

export interface Adjustments extends Omit<Partial<Character>, "cmd"> {
  [adjust:string]: any,
  cmd?: number|string,
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
  subSkills?: {[name: string]: Skill}
}

export interface SkillObj {
  [name: string]: Skill
}

