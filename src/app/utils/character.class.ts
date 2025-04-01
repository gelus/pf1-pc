import {Alignment, Level, Race, Feature, Saves, Speed, Skill, SpellLevel, Attack, AbilityScores, SkillObj} from '../interfaces/character.interface';
import { Item } from './item.class';
import {v4} from 'uuid';
import {ls} from './localstorage.util';
import {ClassLevel} from './classlevel.class';
import {getSkillList} from './skilllist.class';

export class Character {

  id: string = v4();
  init: number = 0;
  classLevels: ClassLevel[] = [];
  name: string = "New Character";
  race: Race = {
    name: 'Human',
    subtype: 'Humanoid',
    features: [],
  };
  senses: string = '';
  alignment: Alignment = 'N';
  size: number = 4;
  ac: number = 10;
  hp: number = 0;
  saves: Saves = {fort: 0, ref: 0, will: 0, conditional: ''};
  defensiveAbilities: Feature[] = []
  immune: string = '';
  speed: Speed = {land: 30};
  melee: Attack[] = [];
  ranged: Attack[] = [];
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
  skills: SkillObj = getSkillList();
  languages: string|string[] = ['common'];
  specialQuality: Feature[] = [];
  inventory:Item[] = [];

  constructor(characterid?: string) {
    if (characterid) Object.assign(this, ls.getItem('character-'+characterid));
  }

}
