import type {SpellItem} from '../rules/spell-items';
import {v4} from 'uuid';
import {Feature, Size} from '../interfaces/character.interface';
import {MeleeAttack} from './attack.class';

export type itemType = 'weapon' | 'armor' | 'shield' | 'other';
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
  // whether the character carries the item, items left behind (at camp, on the mule, ...) weigh nothing
  carried: boolean = true;
  slot: Slot = 'slotless';
  // how many hands the item takes while it is equipped in the held slot, a character has two (see handsFor in
  // utils/equipment.util.ts). left out, a held item takes one hand, a buckler none
  hands?: number;
  // the spells it casts: a wand, scroll, staff or potion (rules/spell-items.ts)
  casts?: SpellItem;
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
  // a weapon's attack is the melee (or ranged) adjustment of its feature, the engine marks it with the weapon's id so
  // the attacks rule knows its proficiency (see rules/attacks.ts). a melee weapon takes str to hit and to damage
  override features: Feature[] = [new Feature({
    adjustments: { melee: [Object.assign(new MeleeAttack(), {toHitAbility: 'str', damageAbility: 'str'})] }
  })]
}

// the armor proficiencies (applied.proficiencies.armor) are named after these, see armorProficiencyFor
export type ArmorCategory = 'light' | 'medium' | 'heavy';
export const ARMOR_CATEGORIES: ArmorCategory[] = ['light', 'medium', 'heavy'];

export class Armor extends Gear {
  override name: string = 'New Armor';
  speed: number[] = [];
  override slot: Slot = 'armor';
  // light, medium or heavy armor, what proficiency the wearer needs (see rules/armor-proficiency.ts)
  armorCategory: ArmorCategory = 'light';
  override features: Feature[] = [new Feature({
    adjustments: {
      ac: {value: 0, type: 'armor'},
      // armor that limits the dex bonus to ac caps it with a min adjustment, e.g.
      // maxDexBonus: {value: 3, mode: 'min'}, armor without one does not cap it at all
      // the check penalty is untyped (negative), so the penalties of armor and a shield add up
      armorCheckPenalty: 0,
      arcaneSpellFailureChance: 0,
    }
  })]
}

// a buckler is strapped to the forearm and leaves the hand free, the others take a hand. bucklers, light and heavy
// shields need shield proficiency, a tower shield tower shield proficiency
export type ShieldCategory = 'buckler' | 'light' | 'heavy' | 'tower';
export const SHIELD_CATEGORIES: ShieldCategory[] = ['buckler', 'light', 'heavy', 'tower'];

// a shield is held: it gives a shield bonus to ac (which a touch attack ignores and which does not stack with another
// shield bonus), a check penalty and an arcane spell failure chance that add to those of armor, and a tower shield
// caps the dex bonus like armor does (maxDexBonus: {value: 2, mode: 'min'})
export class Shield extends Gear {
  override name: string = 'New Shield';
  override type: string = 'shield';
  override slot: Slot = 'held';
  shieldCategory: ShieldCategory = 'light';
  override features: Feature[] = [new Feature({
    adjustments: {
      ac: {value: 1, type: 'shield'},
      armorCheckPenalty: -1,
      arcaneSpellFailureChance: 5,
    }
  })]
}
