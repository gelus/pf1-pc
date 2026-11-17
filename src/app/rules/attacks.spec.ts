import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';
import { Attack } from '../utils/attack.class';
import { Item, Weapon } from '../utils/item.class';
import { attacksRule } from './attacks';
import { sizeRule } from './size.rule';
import { baseSizeOf, damageExpression, iterativeAttackCount, multipliedModifier, powerAttackSteps } from './attacks.util';

describe('attacks rule', () => {
  let service: ApplyCharacterService;

  const attack = (fields: Partial<Attack> = {}): Attack =>
    Object.assign(new Attack(), {name: 'Longsword', damage: '1d8', toHitAbility: 'str', damageAbility: 'str'}, fields);

  const character = (bab = 1, str = 10): Character => {
    const char = new Character();
    char.bab = bab;
    char.abilityScores.str = str;
    return char;
  };

  const withAttacks = (char: Character, melee: Attack[] = [], ranged: Attack[] = []): Character => {
    char.feats.push(new Feature({name: 'Weapons', adjustments: {
      ...(melee.length ? {melee} : {}), ...(ranged.length ? {ranged} : {}),
    }}));
    return char;
  };

  const apply = (char: Character, modules = [attacksRule]): Character => {
    service.ruleModules = modules;
    service.initializeCharacter(char);
    return service.applied();
  };

  const origins = (a: Attack, part: 'toHit' | 'damage') =>
    (part === 'toHit' ? a.result!.toHit.parts : a.result!.damage.parts).filter(p => !p.overwritten && p.value).map(p => [p.value, p.origin]);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('counts the iterative attacks of a base attack bonus', () => {
    expect([0, 5, 6, 10, 11, 15, 16, 20].map(iterativeAttackCount)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect([0, 3, 4, 7, 8, 12, 20].map(powerAttackSteps)).toEqual([1, 1, 2, 2, 3, 4, 6]);
    expect(multipliedModifier(5, 1.5)).toBe(7);
    expect(multipliedModifier(5, 0.5)).toBe(2);
    expect(multipliedModifier(-2, 1.5)).toBe(-2);
    expect(damageExpression('1d8', 3)).toBe('1d8+3');
    expect(damageExpression('1d8', -1)).toBe('1d8-1');
    expect(damageExpression('1d8', 0)).toBe('1d8');
  });

  it('gives a manufactured weapon its iterative attacks at -5 each, a natural attack none', () => {
    const applied = apply(withAttacks(character(16, 14), [attack(), attack({type: 'natural', name: 'Bite', count: 1})]));
    expect(applied.melee[0].result!.attackBonuses).toEqual([18, 13, 8, 3]);
    expect(applied.melee[0].result!.damage.expression).toBe('1d8+2');
    // with a manufactured weapon the bite is secondary: -5, 1/2 str
    expect(applied.melee[1].result!.attackBonuses).toEqual([13]);
    expect(applied.melee[1].result!.damage.expression).toBe('1d8+1');
  });

  it('adds 1 1/2 str two-handed, 1/2 in the off hand, and only 1 for a light weapon in two hands', () => {
    const applied = apply(withAttacks(character(1, 18), [
      attack({hand: 'two-handed'}),
      attack({hand: 'off'}),
      attack({hand: 'two-handed', light: true}),
    ]));
    expect(applied.melee.map(a => a.result!.damage.bonus)).toEqual([6, 2, 4]);
    expect(origins(applied.melee[0], 'damage')).toEqual([[6, 'str x1 1/2 (two-handed)']]);
  });

  it('applies a strength penalty in full whatever the hand', () => {
    const applied = apply(withAttacks(character(1, 6), [attack({hand: 'two-handed'}), attack({hand: 'off'})]));
    expect(applied.melee.map(a => a.result!.damage.bonus)).toEqual([-2, -2]);
  });

  describe('two-weapon fighting', () => {
    const twoWeapons = (light: boolean, bab = 1) => {
      const char = withAttacks(character(bab, 10), [attack(), attack({name: 'Short Sword', hand: 'off', light})]);
      char.combatOptions.twoWeaponFighting = true;
      return char;
    };

    it('makes the option available with an off-hand weapon', () => {
      const char = twoWeapons(false);
      char.combatOptions.twoWeaponFighting = false;
      expect(apply(char).availableCombatOptions.twoWeaponFighting).toBe(true);
      expect(apply(withAttacks(character(), [attack()])).availableCombatOptions.twoWeaponFighting).toBeUndefined();
    });

    it('gives -6/-10, and -4/-8 with a light off-hand weapon', () => {
      expect(apply(twoWeapons(false)).melee.map(a => a.result!.toHit.total)).toEqual([1 - 6, 1 - 10]);
      expect(apply(twoWeapons(true)).melee.map(a => a.result!.toHit.total)).toEqual([1 - 4, 1 - 8]);
    });

    it('takes no penalty while the option is off', () => {
      const char = twoWeapons(false);
      char.combatOptions.twoWeaponFighting = false;
      const applied = apply(char);
      expect(applied.melee.map(a => a.result!.toHit.total)).toEqual([1, 1]);
      expect(applied.melee[1].result!.notes).toContain('an off-hand attack is made with two-weapon fighting');
    });

    it('lessens the penalties by what the feats adjust, and gives the extra off-hand attacks', () => {
      const char = twoWeapons(true, 11);
      char.feats.push(new Feature({name: 'Two-Weapon Fighting', adjustments: {
        'twoWeaponFighting.primaryPenaltyReduction': 2, 'twoWeaponFighting.offHandPenaltyReduction': 6,
      }}));
      char.feats.push(new Feature({name: 'Improved Two-Weapon Fighting', adjustments: {'twoWeaponFighting.extraOffHandAttacks': 1}}));
      char.feats.push(new Feature({name: 'Greater Two-Weapon Fighting', adjustments: {'twoWeaponFighting.extraOffHandAttacks': 1}}));
      const applied = apply(char);
      expect(applied.melee[0].result!.attackBonuses).toEqual([9, 4, -1]);
      expect(applied.melee[1].result!.attackBonuses).toEqual([9, 4, -1]);
      expect(origins(applied.melee[1], 'toHit')).toEqual([
        [11, 'base attack bonus'],
        [-8, 'two-weapon fighting (off hand, light off-hand weapon)'],
        [6, 'Two-Weapon Fighting'],
      ]);
    });

    it('never turns the penalty into a bonus', () => {
      const char = twoWeapons(true);
      char.feats.push(new Feature({name: 'Too Much', adjustments: {'twoWeaponFighting.primaryPenaltyReduction': 9}}));
      expect(apply(char).melee[0].result!.toHit.total).toBe(1);
    });
  });

  describe('natural attacks', () => {
    it('adds 1 1/2 str to a single natural attack', () => {
      const applied = apply(withAttacks(character(1, 18), [attack({type: 'natural', name: 'Bite', damage: '1d6'})]));
      expect(applied.melee[0].result!.damage.expression).toBe('1d6+6');
      expect(applied.melee[0].result!.attackBonuses).toEqual([5]);
    });

    it('gives secondary attacks -5 and 1/2 str, and a roll per attack', () => {
      const applied = apply(withAttacks(character(1, 18), [
        attack({type: 'natural', name: 'Claw', damage: '1d4', count: 2}),
        attack({type: 'natural', name: 'Tail', damage: '1d6', secondary: true}),
      ]));
      expect(applied.melee[0].result!.attackBonuses).toEqual([5, 5]);
      expect(applied.melee[0].result!.damage.expression).toBe('1d4+4');
      expect(applied.melee[1].result!.attackBonuses).toEqual([0]);
      expect(applied.melee[1].result!.damage.expression).toBe('1d6+2');
    });
  });

  describe('power attack and deadly aim', () => {
    const powerful = (bab: number, melee: Attack[], ranged: Attack[] = []) => {
      const char = withAttacks(character(bab, 10), melee, ranged);
      char.feats.push(new Feature({name: 'Power Attack', adjustments: {'availableCombatOptions.powerAttack': true}}));
      char.feats.push(new Feature({name: 'Deadly Aim', adjustments: {'availableCombatOptions.deadlyAim': true}}));
      char.combatOptions.powerAttack = true;
      char.combatOptions.deadlyAim = true;
      return char;
    };

    it('takes -1 every 4 bab for +2 damage each, +50% two-handed and -50% off hand', () => {
      const applied = apply(powerful(4, [attack(), attack({hand: 'two-handed'}), attack({hand: 'off'})]));
      expect(applied.melee.map(a => a.result!.toHit.total)).toEqual([2, 2, 2]);
      expect(applied.melee.map(a => a.result!.damage.bonus)).toEqual([4, 6, 2]);
    });

    it('gives deadly aim to ranged attacks, and neither to touch attacks', () => {
      const applied = apply(powerful(8, [attack({touch: true})], [attack({name: 'Longbow', bow: 'bow', toHitAbility: 'dex'})]));
      expect(applied.melee[0].result!.toHit.total).toBe(8);
      expect(applied.ranged[0].result!.toHit.total).toBe(5);
      expect(applied.ranged[0].result!.damage.bonus).toBe(6);
    });

    it('does nothing when the character cannot use the option', () => {
      const char = withAttacks(character(4, 10), [attack()]);
      char.combatOptions.powerAttack = true;
      expect(apply(char).melee[0].result!.toHit.total).toBe(4);
    });
  });

  describe('proficiency', () => {
    const weaponItem = (name: string, proficiency: string): Weapon => {
      const item = new Weapon();
      item.name = name;
      item.proficiency = proficiency;
      item.equipped = true;
      item.features = [new Feature({name, adjustments: {melee: attack({name})}})];
      return item;
    };

    it('takes -4 with a weapon of a group the character is not proficient with', () => {
      const char = character(1, 10);
      char.inventory.push(weaponItem('Bastard Sword', 'exotic'), weaponItem('Club', 'simple'));
      char.proficiencies = {weapons: ['simple'], armor: []};
      const applied = apply(char);
      expect(applied.melee.map(a => a.itemId)).toEqual(char.inventory.map(i => i.id));
      expect(applied.melee.map(a => a.result!.toHit.total)).toEqual([-3, 1]);
    });

    it('is proficient with a weapon by name, however it is written', () => {
      const char = character(1, 10);
      char.inventory.push(weaponItem('Great Axe', 'martial'));
      char.proficiencies = {weapons: ['greataxe'], armor: []};
      expect(apply(char).melee[0].result!.toHit.total).toBe(1);
    });
  });

  it('gives the larger of masterwork and enhancement to hit, the enhancement to damage', () => {
    const char = withAttacks(character(1, 10), [attack({masterwork: true}), attack({masterwork: true, enhancement: 2})]);
    char.conditions.push(new Feature({name: 'Magic Weapon', adjustments: {'melee.*.toHitBonus': {value: 1, type: 'enhancement'}}}));
    const applied = apply(char);
    expect(applied.melee.map(a => a.result!.toHit.total)).toEqual([2, 3]);
    expect(applied.melee.map(a => a.result!.damage.bonus)).toEqual([0, 2]);
    expect(applied.melee[1].result!.toHit.parts.find(p => p.origin === 'Magic Weapon')!.overwritten).toBe(true);
  });

  it('limits strength to bows: a penalty only, a composite one up to its rating', () => {
    const bows = (str: number) => apply(withAttacks(character(1, str), [], [
      attack({name: 'Longbow', bow: 'bow', damageAbility: ''}),
      attack({name: 'Composite Longbow', bow: 'composite', compositeRating: 2}),
      attack({name: 'Sling'}),
      attack({name: 'Crossbow', damageAbility: ''}),
    ])).ranged;
    expect(bows(18).map(a => a.result!.damage.bonus)).toEqual([0, 2, 4, 0]);
    expect(bows(8).map(a => a.result!.damage.bonus)).toEqual([-1, -1, -1, 0]);
    // a composite bow with a rating above the str modifier takes -2
    expect(bows(12).map(a => a.result!.toHit.total)).toEqual([2, 0, 2, 2]);
  });

  it('scales the damage dice with the size the character changed to', () => {
    const char = withAttacks(character(1, 10), [attack({damage: '1d8'})]);
    char.race.features.push(new Feature({name: 'racial-stats', adjustments: {size: {value: 4, mode: 'set'}}}));
    char.conditions.push(new Feature({name: 'Enlarge Person', adjustments: {size: 1}}));
    const applied = apply(char, [sizeRule, attacksRule]);
    expect(applied.melee[0].result!.damage.dice).toBe('2d6');
    expect(applied.melee[0].result!.damage.baseDice).toBe('1d8');
    expect(applied.melee[0].result!.notes).toContain('1d8 at Medium, 2d6 at Large');
    // the size modifier is in the attack roll bonus
    expect(applied.melee[0].result!.toHit.total).toBe(0);
  });

  it('takes the race size as the base size, sets included', () => {
    const raw = new Character();
    raw.race.features = [new Feature({name: 'Small'})];
    const applied = Object.assign(new Character(), {size: 4});
    const entry = (origin: string, value: any, mode?: any) => ({adjusting: 'size', origin, value, type: '', overwritten: false, ...(mode ? {mode} : {})});
    expect(baseSizeOf(raw, applied, [entry('racial', 3, 'set'), entry('Enlarge', 1)])).toBe(3);
    expect(baseSizeOf(raw, Object.assign(new Character(), {size: 3}), [entry('Small', -1)])).toBe(3);
  });

  it('shows the range of thrown weapons and projectiles, thrown ones taking str', () => {
    const applied = apply(withAttacks(character(1, 14), [], [
      attack({name: 'Dagger', range: 10, thrown: true, damageAbility: ''}),
      attack({name: 'Longbow', range: 100, bow: 'bow'}),
    ]));
    expect(applied.ranged[0].result!.range).toEqual({increment: 10, maxIncrements: 5, maxRange: 50, kind: 'thrown'});
    expect(applied.ranged[0].result!.damage.bonus).toBe(2);
    expect(applied.ranged[1].result!.range).toEqual({increment: 100, maxIncrements: 10, maxRange: 1000, kind: 'projectile'});
  });

  it('tells how much ammunition is left', () => {
    const char = character();
    const arrows = Object.assign(new Item(), {name: 'Arrows', quantity: 3});
    const bolts = Object.assign(new Item(), {name: 'Bolts', quantity: 0});
    char.inventory.push(arrows, bolts);
    withAttacks(char, [], [attack({ammunitionId: arrows.id}), attack({ammunitionId: bolts.id}), attack({ammunitionId: 'gone'})]);
    const applied = apply(char);
    expect(applied.ranged[0].result!.ammunition).toEqual({itemId: arrows.id, name: 'Arrows', quantity: 3});
    expect(applied.ranged[1].result!.notes).toContain('out of ammunition');
    expect(applied.ranged[2].result!.notes).toContain('its ammunition is not in the inventory');
  });

  it('leaves the attacks in the features as they are', () => {
    const char = withAttacks(character(), [attack()]);
    apply(char);
    expect((char.feats[0].adjustments as any).melee[0].result).toBeUndefined();
  });
});
