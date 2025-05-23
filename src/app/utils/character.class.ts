import {Alignment, Race, Feature, Saves, Speed, SpellLevel, AbilityScores, SkillObj} from '../interfaces/character.interface';
import { Item, Purse } from './item.class';
import {v4} from 'uuid';
import {ls} from './localstorage.util';
import {ClassLevel} from './classlevel.class';
import {getSkillList} from './skilllist.class';
import {MeleeAttack, RangeAttack} from './attack.class';

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
  size: number = 0;
  ac: number = 10;
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
  spellLikeAbilities: SpellLevel[] = [];
  spells: SpellLevel[] = [];
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
  feats: Feature[] = [];
  conditions: Feature[] = [];
  skills: SkillObj = getSkillList();
  languages: string|string[] = ['common'];
  specialQuality: Feature[] = [];
  inventory:Item[] = [];
  wealth = new Purse();
  maxDexBonus: number = 0;
  armorCheckPenalty: number = 0;
  arcaneSpellFailureChance: number = 0;

  constructor(characterid?: string) {
    if (characterid) Object.assign(this, ls.getItem('character-'+characterid));
  }

}
