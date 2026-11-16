import {Alignment, Race, Feature, Saves, Speed, SpellCasting, AbilityScores, SkillObj, DenyDexBonus} from '../interfaces/character.interface';
import { Item, Purse } from './item.class';
import {v4} from 'uuid';
import {ls} from './localstorage.util';
import {ClassLevel} from './classlevel.class';
import {getSkillList} from './skilllist.class';
import {MeleeAttack, RangeAttack} from './attack.class';
import {CarryingCapacity, Load} from './encumbrance.util';

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
  specialQuality: Feature[] = [];
  inventory:Item[] = [];
  wealth = new Purse();
  // the highest dex bonus to ac the character can have, undefined when nothing caps it
  maxDexBonus?: number = undefined;
  armorCheckPenalty: number = 0;
  arcaneSpellFailureChance: number = 0;
  spellFailureChance: number = 0;
  denyDexBonus: DenyDexBonus = {ac: false, cmd: false};
  // added to the strength score for carrying capacity only (muleback cords, ...)
  carryingCapacityStrBonus: number = 0;
  // worked out from the inventory by the applied character, see applyEncumbrance
  carriedWeight: number = 0;
  carryingCapacity: CarryingCapacity = {light: 0, medium: 0, heavy: 0};
  load: Load = 'light';

  constructor(characterid?: string) {
    if (characterid) Object.assign(this, ls.getItem('character-'+characterid));
  }

}
