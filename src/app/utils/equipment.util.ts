import {Feature} from '../interfaces/character.interface';
import {ARMOR_CATEGORIES, ArmorCategory, Item, SHIELD_CATEGORIES, ShieldCategory, Slot} from './item.class';

// what armor and shields are, how many hands a held item takes and how many items fit a slot
// items are read as they are saved (plain json), so every field may be missing

export const isShield = (item: Item | undefined | null): boolean =>
  !!item && (String(item.type || '').toLowerCase() === 'shield' || 'shieldCategory' in item);

// armor is what is worn in the armor slot (or what has the fields of Armor), a shield is never armor
export const isArmor = (item: Item | undefined | null): boolean =>
  !!item && !isShield(item) && (item.slot === 'armor' || 'armorCategory' in item);

// the category of armor: armorCategory, or for armor saved before it had one its proficiency when that names a
// category. undefined when it can not be told
export const armorCategoryOf = (item: Item): ArmorCategory | undefined => {
  for (const value of [(item as any).armorCategory, (item as any).proficiency]) {
    const category = String(value ?? '').trim().toLowerCase();
    if ((ARMOR_CATEGORIES as string[]).includes(category)) return category as ArmorCategory;
  }
  return undefined;
};

export const shieldCategoryOf = (item: Item): ShieldCategory | undefined => {
  const category = String((item as any).shieldCategory ?? '').trim().toLowerCase().replace(/ shield$/, '');
  return (SHIELD_CATEGORIES as string[]).includes(category) ? category as ShieldCategory : undefined;
};

// the proficiency (as in applied.proficiencies.armor) wearing the armor or using the shield takes, undefined when
// the item is neither or its category is unknown. bucklers, light and heavy shields take shield proficiency
export const armorProficiencyFor = (item: Item): string | undefined => {
  if (isShield(item)) {
    const category = shieldCategoryOf(item) ?? 'light';
    return category === 'tower' ? 'tower shield' : 'shield';
  }
  if (isArmor(item)) return armorCategoryOf(item);
  return undefined;
};

const activeFeatures = (item: Item): Feature[] => (item.features || []).filter(f => f && f.active !== false);

// what the item's features add to a path (adjustments without a mode, numbers only), its own check penalty or spell
// failure chance
export const itemAdds = (item: Item, path: string): number =>
  activeFeatures(item).reduce((total, feature) => {
    const adj: any = feature.adjustments?.[path];
    if (adj === undefined || adj === null) return total;
    if (typeof adj === 'object') {
      if (adj.mode && adj.mode !== 'add') return total;
      return total + (Number(adj.value) || 0);
    }
    return total + (Number(adj) || 0);
  }, 0);

// the armor or shield bonus the item gives to ac
export const itemAcBonus = (item: Item): number =>
  activeFeatures(item).reduce((total, feature) => {
    const adj: any = feature.adjustments?.['ac'];
    if (adj && typeof adj === 'object' && (!adj.mode || adj.mode === 'add')) return total + (Number(adj.value) || 0);
    return typeof adj === 'number' ? total + adj : total;
  }, 0);

// the cap the item puts on the dex bonus to ac (its lowest maxDexBonus min adjustment), undefined when it puts none
export const itemMaxDex = (item: Item): number | undefined => {
  const caps = activeFeatures(item)
    .map(feature => feature.adjustments?.['maxDexBonus'] as any)
    .filter(adj => adj && typeof adj === 'object' && adj.mode === 'min' && !Number.isNaN(Number(adj.value)))
    .map(adj => Number(adj.value));
  return caps.length ? Math.min(...caps) : undefined;
};

// a field of a weapon (the attacks work owns Weapon) that tells it is wielded in two hands
const TWO_HANDED = /two[- ]?hand/i;
const weaponHandFields = ['handedness', 'wield', 'wielding', 'weaponType', 'use', 'proficiency', 'category'];

// whether one of the attacks the item gives is wielded in two hands (an attack's hand, see the attacks rule)
const hasTwoHandedAttack = (item: Item): boolean => activeFeatures(item).some(feature =>
  (['melee', 'ranged'] as const).some(kind => {
    const attacks = feature.adjustments?.[kind];
    return (Array.isArray(attacks) ? attacks : [attacks]).some((attack: any) => attack?.hand === 'two-handed');
  })
);

// the hands an item takes while it is held: a character has two
//  - a number of hands the item gives, its own hands field (Item.hands, or one a weapon gives) wins
//  - a weapon told to be two-handed (twoHanded: true, 'two-handed' in one of weaponHandFields, or an attack of it
//    with hand 'two-handed') takes two
//  - a buckler takes none, any other shield one
//  - anything else held (a light or one-handed weapon, a wand, a torch) takes one
// an item in any other slot takes none
export const handsFor = (item: Item): number => {
  if (item.slot !== 'held') return 0;
  const hands = Number((item as any).hands);
  if ((item as any).hands !== undefined && (item as any).hands !== null && (item as any).hands !== ''
    && Number.isFinite(hands)) return Math.max(0, hands);
  if ((item as any).twoHanded === true) return 2;
  if (weaponHandFields.some(field => TWO_HANDED.test(String((item as any)[field] ?? '')))) return 2;
  if (hasTwoHandedAttack(item)) return 2;
  if (isShield(item)) return shieldCategoryOf(item) === 'buckler' ? 0 : 1;
  return 1;
};

export const HANDS = 2;

// how many items fit a magic item slot (Core Rulebook, Magic Items: one item per slot, two rings), slotless items
// are not limited. held items are limited by hands instead, see handsFor
export const SLOT_LIMITS: {[slot in Slot]?: number} = {
  head: 1, headband: 1, eyes: 1, shoulders: 1, neck: 1, chest: 1, body: 1, armor: 1, belt: 1, wrists: 1, hands: 1,
  ring: 2, feet: 1,
};

// the items to unequip so item fits its slot (or the character's hands) along with what else is equipped
// the others are given up in the order they are listed in the inventory, the item added first goes first
// empty when it fits, or when it could never fit (an item taking more hands than there are is left alone)
export const itemsToUnequip = (item: Item, inventory: Item[]): Item[] => {
  const others = inventory.filter(other => other !== item && other.equipped && other.slot === item.slot);
  if (item.slot === 'held') {
    const need = handsFor(item);
    if (need > HANDS) return [];
    let used = others.reduce((total, other) => total + handsFor(other), 0);
    const freed: Item[] = [];
    for (const other of others) {
      if (used + need <= HANDS) break;
      if (!handsFor(other)) continue;
      used -= handsFor(other);
      freed.push(other);
    }
    return freed;
  }
  const limit = SLOT_LIMITS[item.slot];
  if (limit === undefined) return [];
  return others.slice(0, Math.max(0, others.length + 1 - limit));
};
