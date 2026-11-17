import { Feature } from '../interfaces/character.interface';
import { Armor, Item, Shield, Weapon } from './item.class';
import {
  armorProficiencyFor, handsFor, isArmor, isShield, itemAcBonus, itemAdds, itemMaxDex, itemsToUnequip,
} from './equipment.util';

describe('equipment util', () => {
  const held = (name: string, extra: any = {}): Item =>
    Object.assign(new Item(), {name, slot: 'held', equipped: true, ...extra});
  const shield = (name: string, shieldCategory: string): Item =>
    Object.assign(new Shield(), {name, shieldCategory, equipped: true});

  it('tells shields and armor apart', () => {
    expect(isShield(new Shield())).toBeTrue();
    expect(isArmor(new Shield())).toBeFalse();
    expect(isArmor(new Armor())).toBeTrue();
    expect(isShield(new Armor())).toBeFalse();
    expect(isShield({...new Item(), type: 'Shield'} as Item)).toBeTrue();
    expect(isArmor(new Item())).toBeFalse();
  });

  it('names the proficiency armor and shields take', () => {
    expect(armorProficiencyFor(Object.assign(new Armor(), {armorCategory: 'medium'}))).toBe('medium');
    expect(armorProficiencyFor(shield('Buckler', 'buckler'))).toBe('shield');
    expect(armorProficiencyFor(shield('Heavy', 'heavy'))).toBe('shield');
    expect(armorProficiencyFor(shield('Tower', 'tower'))).toBe('tower shield');
    expect(armorProficiencyFor(new Item())).toBeUndefined();
  });

  it('reads what an item adds, its ac bonus and its dex cap', () => {
    const item = Object.assign(new Armor(), {features: [
      new Feature({adjustments: {ac: {value: 6, type: 'armor'}, armorCheckPenalty: -5, maxDexBonus: {value: 2, mode: 'min'}}}),
      new Feature({adjustments: {armorCheckPenalty: {value: -1}}}),
      new Feature({active: false, adjustments: {armorCheckPenalty: -10}}),
      new Feature({adjustments: {armorCheckPenalty: {value: -1, mode: 'max'}}}),
    ]});
    expect(itemAdds(item, 'armorCheckPenalty')).toBe(-6);
    expect(itemAcBonus(item)).toBe(6);
    expect(itemMaxDex(item)).toBe(2);
    expect(itemMaxDex(new Shield())).toBeUndefined();
  });

  describe('hands', () => {
    it('takes one hand for a held item, none for a buckler or an item not held', () => {
      expect(handsFor(held('Wand'))).toBe(1);
      expect(handsFor(new Weapon())).toBe(1);
      expect(handsFor(shield('Heavy', 'heavy'))).toBe(1);
      expect(handsFor(shield('Buckler', 'buckler'))).toBe(0);
      expect(handsFor(new Armor())).toBe(0);
    });

    it('takes two for a two-handed weapon, however the weapon tells it', () => {
      expect(handsFor(Object.assign(new Weapon(), {hands: 2}))).toBe(2);
      expect(handsFor(Object.assign(new Weapon(), {twoHanded: true}))).toBe(2);
      expect(handsFor(Object.assign(new Weapon(), {handedness: 'two-handed'}))).toBe(2);
      expect(handsFor(Object.assign(new Weapon(), {category: 'Two-Handed Melee'}))).toBe(2);
      expect(handsFor(held('Greatsword', {hands: 2}))).toBe(2);
      const greataxe = Object.assign(new Weapon(), {features: [new Feature({adjustments: {melee: {name: 'Greataxe', hand: 'two-handed'}}})]});
      expect(handsFor(greataxe)).toBe(2);
      // the item's own hands win
      expect(handsFor(Object.assign(new Weapon(), {hands: 1, handedness: 'two-handed'}))).toBe(1);
    });
  });

  describe('slot limits', () => {
    it('frees hands from the items listed first', () => {
      const sword = held('Longsword');
      const dagger = held('Dagger');
      const greatsword = held('Greatsword', {hands: 2});
      expect(itemsToUnequip(greatsword, [sword, dagger, greatsword])).toEqual([sword, dagger]);
      const heavy = shield('Heavy Shield', 'heavy');
      expect(itemsToUnequip(heavy, [sword, dagger, heavy])).toEqual([sword]);
      expect(itemsToUnequip(sword, [greatsword, sword])).toEqual([greatsword]);
    });

    it('leaves a buckler and what fits alone', () => {
      const sword = held('Longsword');
      const greatsword = held('Greatsword', {hands: 2});
      const buckler = shield('Buckler', 'buckler');
      expect(itemsToUnequip(buckler, [greatsword, buckler])).toEqual([]);
      expect(itemsToUnequip(sword, [buckler, sword])).toEqual([]);
      const torch = held('Torch');
      expect(itemsToUnequip(torch, [sword, buckler, torch])).toEqual([]);
    });

    it('fits two rings and one item in any other slot, slotless items unlimited', () => {
      const ring = (name: string) => Object.assign(new Item(), {name, slot: 'ring', equipped: true});
      const [a, b, c] = [ring('A'), ring('B'), ring('C')];
      expect(itemsToUnequip(b, [a, b])).toEqual([]);
      expect(itemsToUnequip(c, [a, b, c])).toEqual([a]);
      const plate = Object.assign(new Armor(), {equipped: true});
      const leather = Object.assign(new Armor(), {equipped: true});
      expect(itemsToUnequip(leather, [plate, leather])).toEqual([plate]);
      const stone = (name: string) => Object.assign(new Item(), {name, slot: 'slotless', equipped: true});
      const stones = [stone('1'), stone('2'), stone('3')];
      expect(itemsToUnequip(stones[2], stones)).toEqual([]);
    });
  });
});
