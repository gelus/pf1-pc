import {Feature, Size} from '../interfaces/character.interface';

export type itemType = 'weapon' | 'armor' | 'other';
export type damageType = 'B'|'P'|'S';

export class Item {
  name: string = 'new Item';
  type: string = 'other';
  cost: number = 0;
  equipable: boolean = false;
  description: string = '';
  features: Feature[] = [];
  weight: number = 0;
  quantity: number = 1;
}

export class Gear extends Item {
  proficiency: string = '';
  override equipable = true;
  size: Size = 'Medium';
}

export class Weapon extends Gear {
  category: string = '';
  damage: string = '';
  criticalRange: number = 0;
  criticalMultiplier: number = 2;
  range: number = 0;
  damageType: damageType = 'B';
  special: string[] = [];
}

export class Armor extends Gear {
  armorBonus: number = 0;
  maxDexBonus: number = 0;
  armorCheckPenalty: number = 0;
  arcaneSpellFailureChance: number = 0;
  speed: number[] = [];
}
