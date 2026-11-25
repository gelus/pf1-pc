import {Character} from "../utils/character.class";
import type {FormRules} from "../rules/forms";
import type {Metamagic} from "../rules/metamagic";
import {MeleeAttack, RangeAttack} from "../utils/attack.class";
import {v4} from 'uuid';

export const sizes = [ 'Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];

// bonus types dropped from touch AC, everything else (size, dex, deflection, ...) applies normally
// a companion's table raising its natural armor ("natural armor increase": an animal companion's, an eidolon's armor
// bonus) stacks with the natural armor of its creature, and is natural armor all the same
export const touchAcIgnoredBonusTypes = ['armor', 'shield', 'natural', 'natural armor', 'natural armor increase'];
// bonus types dropped from flat-footed AC
export const flatFootedAcIgnoredBonusTypes = ['dodge'];
// a flat-footed character keeps no dex bonus to its AC, a dex penalty however still applies to it
// the dex modifier of the character itself is added by the sheet, these are the typed adjustments of it
export const dexBonusTypes = ['dex', 'dexterity'];

// bonuses of the same type do not stack, only the highest applies (core rulebook, chapter 8, bonus types, and the
// glossary). the exceptions:
//  untyped bonuses (no type) stack with everything
//  dodge bonuses stack with all other dodge bonuses (dodge, fighting defensively and total defense all add up)
//  circumstance bonuses stack with each other, unless they arise from essentially the same source
// a penalty has no type in the rules, a typed adjustment below 0 still follows its type
export const stackingBonusTypes = ['dodge'];
export const sameSourceBonusTypes = ['circumstance'];

// the key the bonuses that do not stack with each other share: only the highest bonus of a key applies. undefined
// for a bonus that stacks with any other (untyped, dodge). a circumstance bonus is keyed by its origin, the feature
// giving it, so two circumstance bonuses from one feature do not stack while those from two features do
export const bonusStackingKey = (type: string | undefined, origin?: string): string | undefined => {
  const key = (type || '').trim().toLowerCase();
  if (!key || stackingBonusTypes.includes(key)) return undefined;
  if (sameSourceBonusTypes.includes(key)) return `${key} from ${(origin || '').trim().toLowerCase()}`;
  return key;
};

// the bonuses of one type that reach one number from different paths, which do not stack either: a morale bonus on
// every save (savingThrowBonus) and one on Will (saves.will) give Will the larger of the two only, while Fortitude and
// Reflex keep the first. the engine settles the bonuses of one path (bonusStackingKey); a number made of several paths
// (a save, a skill, an attack) is settled where it is added up, with this. the losers, each kept and shown crossed out
export const notStacking = <T extends {type?: string, origin?: string, overwritten?: boolean}>(
  bonuses: T[], valueOf: (bonus: T) => number,
): Set<T> => {
  const best = new Map<string, T>();
  const losers = new Set<T>();
  for (const bonus of bonuses) {
    if (bonus.overwritten) continue;
    const key = bonusStackingKey(bonus.type, bonus.origin);
    if (!key) continue;
    const held = best.get(key);
    if (!held) best.set(key, bonus);
    else if (valueOf(bonus) > valueOf(held)) {
      losers.add(held);
      best.set(key, bonus);
    } else losers.add(bonus);
  }
  return losers;
};

export type Size = 'Fine'| 'Diminutive'| 'Tiny'| 'Small'| 'Medium'| 'Large'| 'Large'| 'Huge'| 'Gargantuan'| 'Colossal';
export type Alignment = 'LG'|'NG'|'CG'|'LN'|'N'|'CN'|'LE'|'NE'|'CE';

// how often the charges of a feature come back: once a day (rage, channel energy, a ring's 3/day), once an encounter,
// or never by themselves (a wand's charges, a potion). a rest refills daily and per-encounter charges, see rules/rest.ts
export type ChargesPer = 'day' | 'encounter' | 'none';
export const CHARGES_PER: ChargesPer[] = ['day', 'encounter', 'none'];

export interface Charges {
  total: number;
  current: number;
  label?: string;
  // left out on charges saved before it: they go by their label then, see chargesPer
  per?: ChargesPer;
};

// how often the charges come back: per when it is set, otherwise what the label says ("rages per day", "3/day",
// "per encounter"), and never for charges whose label says neither, so a rest never refills what it does not know of
export const chargesPer = (charges: Charges | undefined): ChargesPer => {
  if (!charges) return 'none';
  if (charges.per && CHARGES_PER.includes(charges.per)) return charges.per;
  const label = (charges.label || '').toLowerCase();
  if (/\bday\b|\bdays\b|\bdaily\b|\/\s*day/.test(label)) return 'day';
  if (/encounter|combat/.test(label)) return 'encounter';
  return 'none';
};

// the section of the sheet a feature is listed in (special attacks, defensive abilities, special qualities), or none.
// a race or class feature without it is listed in the special qualities, unless an entry in its adjustments lists it
export const SHOWN_IN = ['specialAttack', 'defensiveAbilities', 'specialQuality', 'hidden'] as const;
export type ShownIn = typeof SHOWN_IN[number];

export class Feature {
  id: string = v4();
  name?: string = 'A New Feature';
  description?: string = 'A new Feature';
  adjustments: Adjustments = {ac:1};
  active?: boolean | undefined;
  charges?: Charges;
  // where the sheet lists it, see SHOWN_IN
  shownIn?: ShownIn;
  // an alternate racial trait (ARG): the standard racial traits of its race it replaces, as the race's page names them
  // ("Hatred", "Defensive Training"). the race leaves those out, see ai/page-facts.ts
  replaces?: string[];
  // a feat's prerequisites as its page lists them ("Str 13, Power Attack"), see rules/prerequisites.ts
  prerequisites?: string;
  // the library entry it was copied from ("racial-trait/dwarf/minesight"), see library/: the copy keeps all it needs
  libraryId?: string;
  // a form the character changes into (a condition: beast shape, wild shape), and what the form does, see rules/forms.ts
  form?: FormRules;
  // the level it applies from: a companion's own level (an animal companion growing at 4th or 7th), else the
  // character level. left out, always
  atLevel?: number;
  // the points it costs from a pool (an eidolon's evolution: claws 1, flight 2), see rules/eidolon.rule.ts
  cost?: number;
  // a metamagic feat: the spell levels it adds to a spell's slot, see rules/metamagic.ts
  metamagic?: Metamagic;
  // a condition a rule gave (see RuleModule): where it comes from ("from hit points") and why ("-3 hp")
  source?: string;
  reason?: string;
  constructor(feature?: Partial<Feature>) {
    if (feature) Object.assign(this, feature);
  }
}

// how an adjustment combines with the value it adjusts, see AdjustmentModes
//  add: adds to the value (the default, what an adjustment without a mode does)
//  set: replaces the base value, adjustments that add still add on top of it. the last set wins
//  min: caps the value, it can not end up higher than this. the lowest cap wins
//  max: floors the value, it can not end up lower than this. the highest floor wins
//  raise: raises the cap the mins leave by its value (a fighter's armor training: the max Dex bonus its armor allows,
//    +1), every raise on the value adding up. with no cap it does nothing
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
export type AdjustmentMode = 'add'|'set'|'min'|'max'|'raise';
export const adjustmentModes: AdjustmentMode[] = ['add', 'set', 'min', 'max', 'raise'];

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

// damage reduction keyed by what overcomes it ('magic', 'cold iron or silver', 'good and silver', ...), '-' when
// nothing does: {'-': 10, magic: 5} is DR 10/—, 5/magic. features give it like energy resistance,
// 'damageReduction.magic': 5. a bypass cannot hold a dot, paths are split at them. see rules/defenses.ts
export type DamageReduction = {[bypass: string]: number};

// the energies of the rules, positive and negative energy among them (a dhampir resists negative energy)
export const energyTypes = ['acid', 'cold', 'electricity', 'fire', 'sonic', 'negative', 'positive'] as const;
export type EnergyType = typeof energyTypes[number];
export type EnergyResistance = {[energy in EnergyType]?: number};

// damage and drain to an ability score, kept apart from the score itself: damage heals, drain does not
export type AbilityDamage = {[ability: string]: number};

export type AdvancementTrack = 'slow' | 'medium' | 'fast';

// the combat options the character is using right now, the rules decide what they do (see src/app/rules)
export interface CombatOptions {
  powerAttack: boolean;
  deadlyAim: boolean;
  twoWeaponFighting: boolean;
  fightingDefensively: boolean;
  totalDefense: boolean;
  combatExpertise: boolean;
}

export type CombatOption = keyof CombatOptions;
// the options anyone can use, the others need a feature granting them: a feat adjusts
// availableCombatOptions.<option> to true (Power Attack gives availableCombatOptions.powerAttack: true)
export const alwaysAvailableCombatOptions: CombatOption[] = ['fightingDefensively', 'totalDefense'];
export const combatOptionLabels: {[option in CombatOption]: string} = {
  powerAttack: 'Power Attack',
  deadlyAim: 'Deadly Aim',
  twoWeaponFighting: 'Two-Weapon Fighting',
  fightingDefensively: 'Fighting Defensively',
  totalDefense: 'Total Defense',
  combatExpertise: 'Combat Expertise',
};

export interface DenyDexBonus {
  ac: boolean;
  cmd: boolean;
}

type AdjustableCharacterFields = {
  [K in keyof Omit<
    Character,
    'carriedWeight'|'carryingCapacity'|'load'|'cmd'|'ac'|'touchAc'|'flatFootedAc'|'specialAttack'|'defensiveAbilities'|'specialQuality'|'feats'|'conditions'|'melee'|'ranged'|'immunities'|'senses'
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
  // a text of senses ("darkvision 60 ft., scent") is read into them, see rules/senses.ts
  senses?: string|{[sense: string]: number}|TypedAdjustment,
  feats?: Partial<Feature>|Partial<Feature>[],
  conditions?: Partial<Feature>|Partial<Feature>[],
  melee?: Partial<MeleeAttack>|Partial<MeleeAttack>[],
  ranged?: Partial<RangeAttack>|Partial<RangeAttack>[],
  // features add to the list below one entry or several at once
  immunities?: string|string[]|TypedAdjustment,
}

export interface Race {
  name: string;
  subtype: string;
  features: Feature[];
  // quadrupeds carry more than bipeds of their size
  quadruped?: boolean;
  // the alternate favored class bonuses its page lists, picked on a favored class level instead of +1 hp or +1 skill
  // rank (ClassLevel.favoredClassOption), see rules/favored-class.rule.ts
  favoredClassOptions?: FavoredClassOption[];
  // the library entry it was taken from ("race/dwarf"), with the alternate racial traits and picks it was taken with
  libraryId?: string;
}

// an alternate favored class bonus of a race ("Wizard: add +1/4 to the wizard's caster level when casting necromancy
// spells"): the class it is for, its text, and what one pick of it adjusts. a number is what one pick adds, fractions
// included ("spells.wizard.casterLevel[necromancy]": 0.25): the picks add up and the total is rounded down, as the
// rules have it. an option that changes no number is told in its description and listed on the sheet
// a pick a rule leaves to the player, named in its adjustments as {choice:<id>} ("energyResistance.{choice:energy}")
export interface PickChoice {
  id: string;
  label: string;
  // the picks allowed, when fewer than every one of its kind
  options?: string[];
}

export interface FavoredClassOption {
  id: string;
  class: string;
  name?: string;
  description: string;
  adjustments: Adjustments;
  // what each level picking it picks as well (the energy a gnome shifter's resistance is against): the picks of each
  // level are on the level (ClassLevel.favoredClassChoices), and the levels with the same picks add up together
  choices?: PickChoice[];
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
  climb?: number;
  burrow?: number;
}

// how well a creature flies (Core Rulebook, Fly skill): its Fly checks take the modifier of its maneuverability
export const FLY_MANEUVERABILITY: {[maneuverability: string]: number} = {clumsy: -8, poor: -4, average: 0, good: 4, perfect: 8};

export interface Level {
  class: string
  features: Feature[]
}

// a spell prepared into a slot by a prepared caster (cleric, druid, wizard, ...), the same spell can be prepared
// several times, each instance is one slot. slot 'extra' is the domain slot of a cleric or the school slot of a
// specialist wizard (see SpellLevel.extraSlot). cast marks the instance as used until the caster rests
export interface PreparedSpell {
  name: string;
  slot?: 'regular' | 'extra';
  cast?: boolean;
  // prepared with metamagic (rules/metamagic.ts): the feats, by name, and the spell's own level, below the slot's
  metamagic?: string[];
  level?: number;
}

// the extra slot of a spell level: a cleric's domain slot (domain spells only) or a specialist wizard's school slot
// (spells of the specialty school only), see rules/spellcasting.ts
export interface ExtraSlot extends Charges {
  kind: 'domain' | 'school';
}

export interface SpellLevel {
  perDay: Charges;
  // the spells known (spontaneous casters), in the spellbook or on the list (prepared casters) at this level
  spells: Spell[];
  // the spells prepared at this level (prepared casters), kept on the raw caster
  prepared?: PreparedSpell[];
  // the slots used that no raw source of charges held (a class caster's slots are worked out by the rules, so what
  // was spent is counted here), kept on the raw caster and taken off perDay.current by the rules
  used?: number;
  // the uses of the extra slot spent, kept on the raw caster
  extraUsed?: number;
  // worked out by the rules (rules/spellcasting.ts) on the applied character, never saved:
  // spells per day of the class table, and the bonus spells of the casting ability
  base?: number;
  bonus?: number;
  // the most spells a spontaneous caster knows at this level (its class table)
  known?: number;
  // 0-level spells (cantrips, orisons) of a class caster are cast at will, a prepared caster still prepares perDay.total
  atWill?: boolean;
  extraSlot?: ExtraSlot;
  // the save DC of a spell of this level: 10 + spell level + casting ability modifier + the caster's dcBonus
  dc?: number;
}

export interface Spell {
  name: string;
  school: string;
  subSchool?: string;
  descriptors?: string[];
  // the domain a domain spell belongs to, what a cleric can prepare in a domain slot
  domain?: string;
  castingTime: string;
  components: string[];
  range: string;
  target: string;
  duration: string;
  savingThrow: string;
  spellResistance: boolean;
  description: string;
  adjustments?: Adjustments;
  // worked out by the rules on the applied character: the level DC plus the spellSchoolDcBonus of its school
  dc?: number;
  // a spell-like ability's own uses ("dancing lights 1/day, ghost sound 1/day": each has its own), spent as it is cast
  // and refilled by a rest. one without uses and on a level without uses per day is used at will
  uses?: Charges;
}

export type CastingType = 'prepared' | 'spontaneous';
export const spellTables = ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'wizard'] as const;
export type SpellTable = typeof spellTables[number];
// one row of a spells per day (or spells known) table, the entries of one class level from spell level 0 on up: a
// number, or null for a '—' (no spells of that level yet, not even bonus spells)
export type SpellRow = (number | null)[];

// what makes a class a spellcaster, given on its class levels (ClassLevel.spellcasting, see class-presets.ts)
// its caster is spells.<origin>, worked out by rules/spellcasting.ts from the levels in the class
export interface ClassSpellcasting {
  origin: string;
  ability: string;
  type: CastingType;
  arcane: boolean;
  // the spells per day (and spells known) table of the Core Rulebook the class uses, when it shares one (an oracle
  // has the sorcerer's, a witch the wizard's)
  table?: SpellTable;
  // the rows of its own spells per day and spells known tables, one per class level from 1st, for a class with a
  // table of its own (a magus, an inquisitor): its page's table as it lists it, see rules/spell-tables.ts
  perDay?: SpellRow[];
  known?: SpellRow[];
  // added to the class level for the caster level (paladin and ranger: -3)
  casterLevelOffset?: number;
  // added to the spells per day of its table at each spell level from 1st, never below 0 (an archetype whose spells per
  // day are one fewer at each level: -1). a level its table gives a 0 still gets its bonus spells
  perDayChange?: number;
  // a cleric gets one domain slot per spell level it can cast, from 1st on up
  domainSlots?: boolean;
  // a wizard that picks a specialty school (CasterType.school) gets one school slot per spell level from 1st on up
  specialistSchool?: boolean;
  // the armor (by Item.proficiency: 'light', 'medium', 'heavy', 'shield') whose arcane spell failure does not apply
  // to the spells of the class (bard: light)
  ignoreArmorSpellFailure?: string[];
}

export interface CasterType {
  name: string;
  ability: string;
  casterLevel: number;
  // Concentration stores the caster-level portion. The casting ability modifier
  // is added by stat-display so both parts retain their adjustment tooltips.
  concentration: number;
  spells: SpellLevel[];
  // added to the save DC of every spell of the caster, features adjust spells.<origin>.dcBonus
  dcBonus?: number;
  // a class caster (from ClassSpellcasting), set by the rules. classTable is the Core Rulebook table it shares, or
  // 'own' for a class with a table of its own
  casting?: CastingType;
  arcane?: boolean;
  classTable?: SpellTable | 'own';
  classLevel?: number;
  domainSlots?: boolean;
  specialistSchool?: boolean;
  ignoreArmorSpellFailure?: string[];
  // the choices of the caster, kept on the raw caster: a cleric's domains, a wizard's specialty and opposition schools
  domains?: string[];
  school?: string;
  oppositionSchools?: string[];
  // worked out by the rules on the applied character: the highest spell level the casting ability allows (score - 10)
  // and the arcane spell failure chance the caster's spells with a somatic component have
  maxSpellLevel?: number;
  arcaneSpellFailure?: number;
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
