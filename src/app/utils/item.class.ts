import {Feature, Size} from '../interfaces/character.interface';

export type itemType = 'weapon' | 'armor' | 'other';
export type damageType = 'B'|'P'|'S';

export type CoinType = 'pp' | 'gp' | 'sp' | 'cp';
export type Slot = 'head' | 'headband' |  'eyes' | 'shoulders' | 'neck' | 'chest' | 'body' | 'armor' | 'belt' | 'wrists' | 'hands' | 'ring' | 'feet' | 'held' | 'slotless';

export class Purse {
  pp = 0;
  gp = 0;
  sp = 0;
  cp = 0
}

export class Item {
  name: string = 'New Item';
  type: string = 'other';
  cost: Purse = new Purse();
  description: string = '';
  features: Feature[] = [];
  weight: number = 0;
  quantity: number = 1;
  equipped: boolean = false;
  slot: Slot = 'slotless';
}

export class Gear extends Item {
  proficiency: string = '';
  size: Size = 'Medium';
}

export class Weapon extends Gear {
  override name: string = 'New Weapon';
  category: string = '';
  damage: string = '';
  criticalRange: number = 0;
  criticalMultiplier: number = 2;
  range: number = 0;
  damageType: damageType = 'B';
  special: string[] = [];
  override slot: Slot = 'held';
}

export class Armor extends Gear {
  override name: string = 'New Armor';
  armorBonus: number = 0;
  maxDexBonus: number = 0;
  armorCheckPenalty: number = 0;
  arcaneSpellFailureChance: number = 0;
  speed: number[] = [];
  override slot: Slot = 'armor';
}
