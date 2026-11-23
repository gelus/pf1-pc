import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Spell } from '../interfaces/character.interface';
import { CLASS_PRESETS, classLevelFromPreset } from './class-presets';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { Item } from '../utils/item.class';
import { rechargeStaff, useSpellItem } from '../spell-items';
import { createItem } from '../ai/builders';

// wands, scrolls, staves and potions: charges spent or the item used up, the item's caster level and DC, a staff's
// wielder's when higher, Use Magic Device and caster level checks told
describe('items that cast', () => {
  let service: ApplyCharacterService;
  const spell = (name: string, extra: object = {}) => ({name, school: 'evocation', components: ['V', 'S'], savingThrow: 'Reflex half', description: name, ...extra}) as unknown as Spell;
  const wizard = (levels: number): Character => {
    const preset = CLASS_PRESETS.find(p => p.name === 'Wizard')!;
    const char = Object.assign(new Character(), {name: 'Ezren', classLevels: Array.from({length: levels}, (_, i) =>
      new ClassLevel({...classLevelFromPreset(preset, i + 1, i === 0), rolledHp: 4}))});
    char.abilityScores = {...char.abilityScores, int: 20};
    return char;
  };
  const item = (name: string, casts: Item['casts'], quantity = 1) => Object.assign(new Item(), {id: name, name, quantity, casts});

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('spends a wand\'s charge, at its own caster level and DC', () => {
    const char = wizard(5);
    char.inventory = [item('Wand of Fireball', {kind: 'wand', spells: [{spell: spell('Fireball'), level: 3, casterLevel: 5}], charges: {total: 50, current: 12, per: 'none'}})];
    service.initializeCharacter(char);
    service.saveSpell('spells', 'wizard', 3, spell('Fireball'));
    const used = useSpellItem(service, 'Wand of Fireball');
    // 10 + 3 + the least Int modifier for a 3rd-level spell (+1)
    expect(used.dc).toBe(14);
    expect(used.casterLevel).toBe(5);
    expect(used.notes).toBeUndefined();
    expect(service.raw().inventory[0].casts!.charges!.current).toBe(11);
    expect(service.history.undoLabel()).toBe('use Wand of Fireball: Fireball');
  });

  it('uses a staff at its wielder\'s caster level and ability when higher, its spells at their cost, and recharges it', () => {
    const char = wizard(9);
    char.inventory = [item('Staff of Fire', {kind: 'staff', charges: {total: 10, current: 3, per: 'none'}, spells: [
      {spell: spell('Burning Hands'), level: 1, casterLevel: 8}, {spell: spell('Wall of Fire'), level: 4, casterLevel: 8, charges: 3}]})];
    service.initializeCharacter(char);
    const used = useSpellItem(service, 'Staff of Fire', 'Wall of Fire');
    expect(used.casterLevel).toBe(9);
    // 10 + 4 + the wizard's Int modifier (+5)
    expect(used.dc).toBe(19);
    expect(service.raw().inventory[0].casts!.charges!.current).toBe(0);
    expect(useSpellItem(service, 'Staff of Fire', 'Burning Hands').error).toContain('has 0 charges');
    expect(rechargeStaff(service, 'Staff of Fire', 'wizard', 4).done).toContain('1/10');
  });

  it('uses up a scroll, telling of Use Magic Device and a caster level check', () => {
    const char = wizard(3);
    char.inventory = [item('Scroll of Haste', {kind: 'scroll', spells: [{spell: spell('Haste'), level: 3, casterLevel: 5}]}, 2)];
    service.initializeCharacter(char);
    let used = useSpellItem(service, 'Scroll of Haste');
    expect(used.notes!.join(' ')).toContain('Use Magic Device check (DC 25)');
    service.saveSpell('spells', 'wizard', 1, spell('Haste'));
    used = useSpellItem(service, 'Scroll of Haste');
    expect(used.notes!.join(' ')).toContain('caster level check, DC 6');
    // the last one used, it is gone
    expect(service.raw().inventory.length).toBe(0);
  });

  it('drinks a potion, its spell on the character', () => {
    const char = wizard(1);
    char.inventory = [item('Potion of Bull\'s Strength', {kind: 'potion', spells: [{spell: spell('Bull\'s Strength', {adjustments: {'abilityScores.str': {value: 4, type: 'enhancement'}}}), level: 2, casterLevel: 3}]})];
    service.initializeCharacter(char);
    useSpellItem(service, 'Potion of Bull\'s Strength', undefined, {onSelf: true});
    expect(service.applied().abilityScores.str).toBe(14);
    expect(service.raw().inventory.length).toBe(0);
  });

  it('is built by the AI from what it casts', () => {
    service.initializeCharacter(wizard(1));
    const done = createItem(service, {name: 'Wand of Magic Missile', type: 'other', features: '[]', cost_gp: 750, based_on: 'own knowledge',
      casts: JSON.stringify({kind: 'wand', charges: 50, charges_left: 20, spells: [{name: 'Magic Missile', level: 1, caster_level: 1,
        school: 'evocation', components: 'V, S', saving_throw: 'none', spell_resistance: 'yes', description: '1d4+1 force'}]})}) as any;
    expect(done.done).toBeDefined();
    const wand = service.raw().inventory[0];
    expect(wand.casts!.kind).toBe('wand');
    expect(wand.casts!.charges).toEqual(jasmine.objectContaining({total: 50, current: 20}));
    expect(wand.casts!.spells[0]).toEqual(jasmine.objectContaining({level: 1, casterLevel: 1}));
  });
});
