import {v4} from 'uuid';
import {Feature, Size} from '../interfaces/character.interface';
import {MeleeAttack} from './attack.class';

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
  id: string = v4();
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
  special: string[] = [];
  override slot: Slot = 'held';
  override features: Feature[] = [new Feature({
    adjustments: { meleeAttack: new MeleeAttack() }
  })]
}

export class Armor extends Gear {
  override name: string = 'New Armor';
  speed: number[] = [];
  override slot: Slot = 'armor';
  override features: Feature[] = [new Feature({
    adjustments: {
      ac:0,
      maxDexBonus: 0,
      armorCheckPenalty: 0,
      arcaneSpellFailureChance: 0,
    }
  })]
}
