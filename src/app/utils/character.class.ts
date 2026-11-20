import {
  AbilityDamage, AdvancementTrack, Alignment, Race, Feature, Saves, Speed, SpellCasting, AbilityScores, SkillObj, DenyDexBonus,
  CombatOption, CombatOptions, DamageReduction, EnergyResistance,
} from '../interfaces/character.interface';
import { Item, Purse } from './item.class';
import {v4} from 'uuid';
import {ls} from './localstorage.util';
import {ClassLevel, Proficiencies} from './classlevel.class';
import {getSkillList} from './skilllist.class';
import {MeleeAttack, RangeAttack, TwoWeaponFighting, defaultTwoWeaponFighting} from './attack.class';
import {CarryingCapacity, Load} from './encumbrance.util';

export const defaultCombatOptions = (): CombatOptions => ({
  powerAttack: false,
  deadlyAim: false,
  twoWeaponFighting: false,
  fightingDefensively: false,
  totalDefense: false,
  combatExpertise: false,
});

export interface CreationProgress {
  step: string;
  // what the player decided at each step done, by step
  decisions: {[step: string]: string};
}

export class Character {

  id: string = v4();
  init: number = 0;
  classLevels: ClassLevel[] = [];
  name: string = "New Character";
  age: number = 0;
  height: number = 0;
  weight: number = 0;
  description: string = '';
  race: Race = {
    name: 'Human',
    subtype: 'Humanoid',
    features: [],
  };
  senses: string = '';
  alignment: Alignment = 'N';
  // an index into sizes, the racial size sets it, other adjustments (enlarge person, ...) add to it
  size: number = 4;
  ac: number|string = 10;
  touchAc: number|string = 10;
  flatFootedAc: number|string = 10;
  hp: number = 0;
  // the lethal damage the character took, healing takes it back off. undefined on characters saved before it, which
  // only kept their current hp, see damageTaken in rules/damage-taken.ts
  damageTaken?: number;
  // worked out by the applied character: its max hp less the damage it took
  currentHp: number = 0;
  tempHp: number = 0;
  currentTempHp: number = 0;
  saves: Saves = {fort: 0, ref: 0, will: 0, conditional: ''};
  defensiveAbilities: Feature[] = []
  immune: string = '';
  speed: Speed = {land: 0, swim: 0, fly: 0};
  melee: MeleeAttack[] = [];
  ranged: RangeAttack[] = [];
  specialAttack: Feature[] = [];
  spellLikeAbilities: SpellCasting = {};
  spells: SpellCasting = {};
  abilityScores: AbilityScores = {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  };
  bab:number = 0;
  cmb:number = 0;
  cmd:number = 0;
  attackRollBonus:number = 0;
  meleeAttackRollBonus:number = 0;
  rangedAttackRollBonus:number = 0;
  savingThrowBonus:number = 0;
  skillCheckBonus:number = 0;
  abilityCheckBonus:number = 0;
  feats: Feature[] = [];
  conditions: Feature[] = [];
  skills: SkillObj = getSkillList();
  languages: string|string[] = ['common'];
  // worked out by the applied character: how many languages it may know, see rules/languages.ts
  languagesAllowed: number = 0;
  specialQuality: Feature[] = [];
  inventory:Item[] = [];
  wealth = new Purse();
  // the highest dex bonus to ac the character can have, undefined when nothing caps it
  maxDexBonus?: number = undefined;
  armorCheckPenalty: number = 0;
  arcaneSpellFailureChance: number = 0;
  spellFailureChance: number = 0;
  // added to the save DC of the spells of a school (lower case), Spell Focus gives spellSchoolDcBonus.evocation: 1
  spellSchoolDcBonus: {[school: string]: number} = {};
  denyDexBonus: DenyDexBonus = {ac: false, cmd: false};
  // added to the strength score for carrying capacity only (muleback cords, ...)
  // armor and loads do not slow the character down (a dwarf's slow and steady), see applyArmorSpeed
  speedUnslowedByArmorAndLoad: boolean = false;
  carryingCapacityStrBonus: number = 0;
  // worked out from the inventory by the applied character, see applyEncumbrance
  carriedWeight: number = 0;
  carryingCapacity: CarryingCapacity = {light: 0, medium: 0, heavy: 0};
  load: Load = 'light';

  // advancement
  experience: number = 0;
  advancementTrack: AdvancementTrack = 'medium';
  // the classes whose levels give the favored class bonus (ClassLevel.favoredClassBonus)
  favoredClasses: string[] = [];
  // feats on top of the one every odd character level gives (the human racial feat, fighter bonus feats, ...)
  bonusFeats: number = 0;
  // skill ranks on top of those of the class levels, features adjust it (a human's Skilled: "{level}")
  bonusSkillRanks: number = 0;
  // creating the character with the AI: the step it is at and what the player decided at each one, see
  // ai/creation-script.ts. undefined for a character not created that way, or once it is done
  creation: CreationProgress | undefined = undefined;
  proficiencies: Proficiencies = {weapons: [], armor: []};

  // background
  deity: string = '';
  traits: Feature[] = [];
  drawbacks: Feature[] = [];
  // traits on top of the two every character gets and the one each drawback gives (additional traits, ...)
  bonusTraits: number = 0;

  // damage taken that is not hit point damage
  abilityDamage: AbilityDamage = {};
  abilityDrain: AbilityDamage = {};
  nonlethalDamage: number = 0;
  // a dying character (below 0 hp) that was stabilized, see rules/damage-taken.ts
  stable: boolean = false;

  // defenses, immune above is the old free text, immunities replaces it
  damageReduction: DamageReduction = {};
  energyResistance: EnergyResistance = {};
  spellResistance: number = 0;
  immunities: string[] = [];
  // the miss chance attacks against the character have, in percent
  concealment: number = 0;

  combatOptions: CombatOptions = defaultCombatOptions();
  // the combat options features made available, see alwaysAvailableCombatOptions
  availableCombatOptions: {[option in CombatOption]?: boolean} = {};
  // what lessens the penalties of fighting with two weapons, see rules/attacks.ts
  twoWeaponFighting: TwoWeaponFighting = defaultTwoWeaponFighting();

  constructor(characterid?: string) {
    if (characterid) Object.assign(this, ls.getItem('character-'+characterid));
  }

}
