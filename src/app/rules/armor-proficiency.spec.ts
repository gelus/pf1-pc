import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';
import { Armor, Item, Shield, ShieldCategory } from '../utils/item.class';
import { armorProficiencyRule } from './armor-proficiency';
import { RULE_MODULES } from './index';

describe('armor proficiency rule', () => {
  let service: ApplyCharacterService;

  const armor = (name: string, category: Armor['armorCategory'], adjustments: any, extra: Partial<Armor> = {}): Armor =>
    Object.assign(new Armor(), {
      name, armorCategory: category, equipped: true, weight: 0,
      features: [new Feature({name, active: true, adjustments})], ...extra,
    });
  const shield = (name: string, category: ShieldCategory, adjustments: any): Shield =>
    Object.assign(new Shield(), {
      name, shieldCategory: category, equipped: true, weight: 0,
      features: [new Feature({name, active: true, adjustments})],
    });
  const fullPlate = () => armor('Full Plate', 'heavy',
    {ac: {value: 9, type: 'armor'}, maxDexBonus: {value: 1, mode: 'min'}, armorCheckPenalty: -6, arcaneSpellFailureChance: 35});
  const heavyShield = () => shield('Heavy Steel Shield', 'heavy',
    {ac: {value: 2, type: 'shield'}, armorCheckPenalty: -2, arcaneSpellFailureChance: 15});
  const towerShield = () => shield('Tower Shield', 'tower',
    {ac: {value: 4, type: 'shield'}, maxDexBonus: {value: 2, mode: 'min'}, armorCheckPenalty: -10, arcaneSpellFailureChance: 50});

  const apply = (items: Item[], proficiencies: string[] = [], mutate: (char: Character) => void = () => {}): Character => {
    const char = new Character();
    char.proficiencies = {weapons: [], armor: proficiencies};
    char.inventory.push(...items);
    mutate(char);
    service.initializeCharacter(char);
    return service.applied();
  };
  const origins = (path: string) =>
    (service.adjustmentsMap[path] || []).filter(e => !e.overwritten).map(e => [e.origin, e.value]);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.ruleModules = [armorProficiencyRule];
  });

  it('is registered with the engine', () => {
    expect(RULE_MODULES).toContain(armorProficiencyRule);
  });

  it('does nothing for armor the character is proficient with', () => {
    const applied = apply([fullPlate()], ['light', 'medium', 'heavy']);
    expect(applied.attackRollBonus).toBe(0);
    expect(applied.armorCheckPenalty).toBe(-6);
  });

  it('applies the check penalty of nonproficient armor to attack rolls', () => {
    const applied = apply([fullPlate()], ['light', 'medium']);
    expect(applied.attackRollBonus).toBe(-6);
    expect(origins('attackRollBonus')).toEqual([['Nonproficient: Full Plate', -6]]);
    // the skills that involve moving (str and dex skills) already take the check penalty, it is not taken twice
    expect(applied.armorCheckPenalty).toBe(-6);
  });

  it('reads proficiencies case-insensitively and given by features', () => {
    expect(apply([fullPlate()], ['Heavy']).attackRollBonus).toBe(0);
    const applied = apply([fullPlate()], [], char =>
      char.feats.push(new Feature({name: 'Heavy Armor Proficiency', active: true, adjustments: {'proficiencies.armor': ['heavy']}})));
    expect(applied.attackRollBonus).toBe(0);
  });

  it('falls back to the proficiency field of armor saved without a category', () => {
    const old: any = fullPlate();
    delete old.armorCategory;
    old.proficiency = 'heavy';
    expect(apply([old], ['light']).attackRollBonus).toBe(-6);
    old.proficiency = '';
    // the category can not be told, so nothing is assumed
    expect(apply([old], ['light']).attackRollBonus).toBe(0);
  });

  it('ignores armor that is not equipped and armor without a check penalty', () => {
    const plate = fullPlate();
    plate.equipped = false;
    const padded = armor('Padded', 'light', {ac: {value: 1, type: 'armor'}, armorCheckPenalty: 0});
    expect(apply([plate, padded], []).attackRollBonus).toBe(0);
  });

  it('takes shield proficiency for bucklers, light and heavy shields', () => {
    expect(apply([heavyShield()], ['shield']).attackRollBonus).toBe(0);
    expect(apply([heavyShield()], ['tower shield']).attackRollBonus).toBe(-2);
    expect(origins('attackRollBonus')).toEqual([['Nonproficient: Heavy Steel Shield', -2]]);
    expect(apply([shield('Buckler', 'buckler', {ac: {value: 1, type: 'shield'}, armorCheckPenalty: -1})], []).attackRollBonus)
      .toBe(-1);
  });

  it('adds up the penalties of nonproficient armor and shield', () => {
    expect(apply([fullPlate(), heavyShield()], ['light']).attackRollBonus).toBe(-8);
  });

  it('always takes -2 on attack rolls with a tower shield, and its check penalty without proficiency', () => {
    expect(apply([towerShield()], ['shield', 'tower shield']).attackRollBonus).toBe(-2);
    expect(origins('attackRollBonus')).toEqual([['Tower Shield: Tower Shield', -2]]);
    expect(apply([towerShield()], ['shield']).attackRollBonus).toBe(-12);
  });

  it('reaches the attacks through the attack roll bonus', () => {
    expect(service.getInheritedBonusPaths('melee.*.toHitBonus', new Character())).toContain('attackRollBonus');
  });

  describe('shields in the engine', () => {
    it('gives a shield bonus to ac that touch ac ignores and flat-footed ac keeps', () => {
      const applied = apply([heavyShield()]);
      // on top of the base 10
      expect(applied.ac).toBe(12);
      expect(applied.touchAc).toBe(10);
      expect(applied.flatFootedAc).toBe(12);
    });

    it('stacks a shield bonus with armor but not with another shield bonus', () => {
      const applied = apply([fullPlate(), heavyShield(), shield('Light Wooden Shield', 'light', {ac: {value: 1, type: 'shield'}})]);
      expect(applied.ac).toBe(21);
    });

    it('adds up the check penalties and spell failure chances of armor and shield', () => {
      const applied = apply([fullPlate(), heavyShield()]);
      expect(applied.armorCheckPenalty).toBe(-8);
      expect(applied.arcaneSpellFailureChance).toBe(50);
    });

    it('caps the dex bonus with a tower shield, the lowest cap of armor and shield winning', () => {
      expect(apply([towerShield()]).maxDexBonus).toBe(2);
      expect(apply([fullPlate(), towerShield()]).maxDexBonus).toBe(1);
    });

    it('uses the worse of the summed check penalty and the load\'s', () => {
      const leather = armor('Leather', 'light', {ac: {value: 2, type: 'armor'}, armorCheckPenalty: -1});
      const lightShield = shield('Light Steel Shield', 'light', {ac: {value: 1, type: 'shield'}, armorCheckPenalty: -1});
      const pack = Object.assign(new Item(), {name: 'Pack', weight: 40});
      // a medium load (str 10): -3 beats -1 + -1
      expect(apply([leather, lightShield, pack]).armorCheckPenalty).toBe(-3);
      // and -6 + -2 beats it
      expect(apply([fullPlate(), heavyShield(), pack]).armorCheckPenalty).toBe(-8);
    });
  });
});
