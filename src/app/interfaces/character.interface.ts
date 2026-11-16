import {Character} from "../utils/character.class";
import {MeleeAttack, RangeAttack} from "../utils/attack.class";
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

// how an adjustment combines with the value it adjusts, see AdjustmentModes
//  add: adds to the value (the default, what an adjustment without a mode does)
//  set: replaces the base value, adjustments that add still add on top of it. the last set wins
//  min: caps the value, it can not end up higher than this. the lowest cap wins
//  max: floors the value, it can not end up lower than this. the highest floor wins
//  a cap and a floor on one value bound it together, a floor above a cap wins: armor caps maxDexBonus with a min,
//  and an ability that keeps a dex bonus floors it with a max
// they are applied in this order: set, then add (with the bonus type stacking rules), then min and max,
// and only after those the steps that need the final value, like halving a speed
// adds are applied as the features come in, sets, mins and maxes are all resolved together in a finalize step after
// the last add (formulas and skill selectors included), so until that step a stat holds its base value and its adds
// modes work on any number of the character, including a field of every attack (melee.*.toHitBonus, bounding
// each attack on its own) and the numbers of a caster (casterLevel, concentration, spells.<n>.perDay.total/current)
// they do not reach what the sheet adds while displaying a stat (ability modifiers, skill ranks, the base 10 of
// cmd, ...), and conditional adjustments (variants, path[variant]) always add
export type AdjustmentMode = 'add'|'set'|'min'|'max';
export const adjustmentModes: AdjustmentMode[] = ['add', 'set', 'min', 'max'];

// an adjustment can carry a bonus type, bonuses of the same type do not stack and some of them are
// dropped from the derived ACs, see touchAcIgnoredBonusTypes / flatFootedAcIgnoredBonusTypes
// bonus types only matter to adjustments that add
export interface TypedAdjustment {
  value: number|string|boolean;
  type?: string;
  mode?: AdjustmentMode;
  if?: string|string[];
  unless?: string|string[];
}

export interface DenyDexBonus {
  ac: boolean;
  cmd: boolean;
}

type AdjustableCharacterFields = {
  [K in keyof Omit<
    Character,
    'carriedWeight'|'carryingCapacity'|'load'|'cmd'|'ac'|'touchAc'|'flatFootedAc'|'specialAttack'|'defensiveAbilities'|'specialQuality'|'feats'|'conditions'|'melee'|'ranged'
  >]?: Character[K] extends number
    ? number | string | TypedAdjustment
    : Character[K] | TypedAdjustment;
};

export interface Adjustments extends AdjustableCharacterFields {
  [adjust:string]: any,
  cmd?: number|string|TypedAdjustment,
  ac?: number|string|TypedAdjustment,
  touchAc?: number|string|TypedAdjustment,
  flatFootedAc?: number|string|TypedAdjustment,
  specialAttack?: Partial<Feature>|Partial<Feature>[],
  defensiveAbilities?: Partial<Feature>|Partial<Feature>[],
  specialQuality?: Partial<Feature>|Partial<Feature>[],
  feats?: Partial<Feature>|Partial<Feature>[],
  conditions?: Partial<Feature>|Partial<Feature>[],
  melee?: Partial<MeleeAttack>|Partial<MeleeAttack>[],
  ranged?: Partial<RangeAttack>|Partial<RangeAttack>[],
}

export interface Race {
  name: string;
  subtype: string;
  features: Feature[];
  // quadrupeds carry more than bipeds of their size
  quadruped?: boolean;
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
  perDay: Charges;
  spells: Spell[];
}

export interface Spell {
  name: string;
  school: string;
  subSchool?: string;
  descriptors?: string[];
  castingTime: string;
  components: string[];
  range: string;
  target: string;
  duration: string;
  savingThrow: string;
  spellResistance: boolean;
  description: string;
  adjustments?: Adjustments;
}

export interface CasterType {
  name: string;
  ability: string;
  casterLevel: number;
  // Concentration stores the caster-level portion. The casting ability modifier
  // is added by stat-display so both parts retain their adjustment tooltips.
  concentration: number;
  spells: SpellLevel[];
}

export interface SpellCasting {
  [origin: string]: CasterType;
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
