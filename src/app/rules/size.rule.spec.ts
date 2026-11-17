import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';
import { SIZE_MODIFIED_PATHS, sizeRule } from './size.rule';

describe('size rule', () => {
  let service: ApplyCharacterService;

  const characterOfSize = (size: number): Character => {
    const char = new Character();
    char.race.features.push(new Feature({name: 'racial-stats', adjustments: {size: {value: size, mode: 'set'}}}));
    return char;
  };

  const apply = (char: Character): Character => {
    service.ruleModules = [sizeRule];
    service.initializeCharacter(char);
    return service.applied();
  };

  const stats = (char: Character) => ({
    ac: char.ac,
    touchAc: char.touchAc,
    flatFootedAc: char.flatFootedAc,
    attackRollBonus: char.attackRollBonus,
    cmb: char.cmb,
    cmd: char.cmd,
    fly: char.skills['fly'].value,
    stealth: char.skills['stealth'].value,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  // size: [size modifier, special size modifier, fly, stealth]
  const modifiers: [number, string, number, number, number, number][] = [
    [0, 'Fine', 8, -8, 8, 16],
    [1, 'Diminutive', 4, -4, 6, 12],
    [2, 'Tiny', 2, -2, 4, 8],
    [3, 'Small', 1, -1, 2, 4],
    [5, 'Large', -1, 1, -2, -4],
    [6, 'Huge', -2, 2, -4, -8],
    [7, 'Gargantuan', -4, 4, -6, -12],
    [8, 'Colossal', -8, 8, -8, -16],
  ];
  for (const [size, name, mod, special, fly, stealth] of modifiers) {
    it(`gives a ${name} character its size modifiers`, () => {
      const applied = apply(characterOfSize(size));
      expect(stats(applied)).toEqual({
        ac: 10 + mod,
        touchAc: 10 + mod,
        flatFootedAc: 10 + mod,
        attackRollBonus: mod,
        cmb: special,
        cmd: special,
        fly,
        stealth,
      });
      for (const path of ['ac', 'touchAc', 'flatFootedAc', 'attackRollBonus', 'cmb', 'cmd', 'skills.fly.value', 'skills.stealth.value']) {
        expect(service.adjustmentsMap[path].map(e => [e.origin, e.type])).toEqual([[`Size (${name})`, 'size']]);
      }
    });
  }

  it('gives a medium character no size modifiers at all', () => {
    const applied = apply(characterOfSize(4));
    expect(stats(applied)).toEqual({
      ac: 10, touchAc: 10, flatFootedAc: 10, attackRollBonus: 0, cmb: 0, cmd: 0, fly: 0, stealth: 0,
    });
    const origins = Object.values(service.adjustmentsMap).flat().map(e => e.origin);
    expect(origins.filter(o => o.startsWith('Size'))).toEqual([]);
  });

  it('takes the final size, after enlarge person and the like changed it', () => {
    const char = characterOfSize(4);
    char.conditions.push(new Feature({name: 'Enlarge Person', adjustments: {size: 1}}));
    const applied = apply(char);
    expect(applied.size).toBe(5);
    expect(stats(applied)).toEqual({
      ac: 9, touchAc: 9, flatFootedAc: 9, attackRollBonus: -1, cmb: 1, cmd: 1, fly: -2, stealth: -4,
    });
    expect(service.adjustmentsMap['ac'].map(e => e.origin)).toEqual(['Size (Large)']);
  });

  it('takes a small character shrunk by reduce person down to tiny', () => {
    const char = characterOfSize(3);
    char.conditions.push(new Feature({name: 'Reduce Person', adjustments: {size: -1}}));
    const applied = apply(char);
    expect(applied.ac).toBe(12);
    expect(applied.cmd).toBe(-2);
    expect(applied.skills['stealth'].value).toBe(8);
  });

  it('treats a size beyond colossal as colossal and one below fine as fine', () => {
    const huge = characterOfSize(8);
    huge.feats.push(new Feature({name: 'Even Bigger', adjustments: {size: 2}}));
    expect(apply(huge).ac).toBe(2);
    expect(service.adjustmentsMap['ac'].map(e => e.origin)).toEqual(['Size (Colossal)']);

    expect(apply(characterOfSize(-3)).ac).toBe(18);
    expect(service.adjustmentsMap['ac'].map(e => e.origin)).toEqual(['Size (Fine)']);
  });

  it('adds to the other bonuses of a stat, size modifiers are a type of their own', () => {
    const char = characterOfSize(3);
    char.feats.push(new Feature({name: 'Dodge', adjustments: {ac: {value: 1, type: 'dodge'}}}));
    char.feats.push(new Feature({name: 'Armor', adjustments: {ac: {value: 4, type: 'armor'}}}));
    char.feats.push(new Feature({name: 'Sneaky', adjustments: {'skills.stealth.value': 2, cmb: 1}}));
    const applied = apply(char);
    // 10 + 1 dodge + 4 armor + 1 size
    expect(applied.ac).toBe(16);
    // no armor
    expect(applied.touchAc).toBe(12);
    // no dodge
    expect(applied.flatFootedAc).toBe(15);
    expect(applied.skills['stealth'].value).toBe(6);
    expect(applied.cmb).toBe(0);
  });

  it('does not add up with a size modifier written into a feature by hand', () => {
    const char = characterOfSize(3);
    char.race.features.push(new Feature({name: 'Small', adjustments: {
      ac: {value: 1, type: 'size'}, attackRollBonus: {value: 1, type: 'size'}, 'skills.stealth.value': {value: 4, type: 'size'},
    }}));
    const applied = apply(char);
    expect(applied.ac).toBe(11);
    expect(applied.touchAc).toBe(11);
    expect(applied.flatFootedAc).toBe(11);
    expect(applied.attackRollBonus).toBe(1);
    expect(applied.skills['stealth'].value).toBe(4);
    // one of the two is crossed out in the tooltips
    expect(service.adjustmentsMap['ac'].map(e => [e.origin, e.overwritten])).toEqual([['Small', true], ['Size (Small)', false]]);
  });

  describe('owns the size type on the stats it adjusts', () => {
    const staleSmall = () => new Feature({name: 'Small race', adjustments: {
      ac: {value: 1, type: 'size'},
      attackRollBonus: {value: 1, type: 'size'},
      cmb: {value: -1, type: 'size'},
      cmd: {value: -1, type: 'size'},
      'skills.fly.value': {value: 2, type: 'size'},
      'skills.stealth.value': {value: 4, type: 'size'},
    }});
    const crossedOut = (path: string) => service.adjustmentsMap[path].map(e => [e.origin, e.overwritten]);

    it('crosses out a stale +1 from small on a character enlarged to large, the -1 applies', () => {
      const char = characterOfSize(3);
      char.race.features.push(staleSmall());
      char.conditions.push(new Feature({name: 'Enlarge Person', adjustments: {size: 2}}));
      const applied = apply(char);
      expect(applied.size).toBe(5);
      expect(stats(applied)).toEqual({
        ac: 9, touchAc: 9, flatFootedAc: 9, attackRollBonus: -1, cmb: 1, cmd: 1, fly: -2, stealth: -4,
      });
      for (const path of SIZE_MODIFIED_PATHS) {
        expect(crossedOut(path)).toEqual([['Small race', true], ['Size (Large)', false]]);
      }
    });

    it('crosses out a stale size bonus larger than the modifier of the final size', () => {
      const char = characterOfSize(3);
      char.race.features.push(new Feature({name: 'Tiny once', adjustments: {ac: {value: 2, type: 'size'}}}));
      const applied = apply(char);
      expect(applied.ac).toBe(11);
      expect(crossedOut('ac')).toEqual([['Tiny once', true], ['Size (Small)', false]]);
    });

    it('crosses out a stale size bonus on a medium character, which gets no size modifier', () => {
      const char = characterOfSize(4);
      char.race.features.push(staleSmall());
      const applied = apply(char);
      expect(stats(applied)).toEqual({
        ac: 10, touchAc: 10, flatFootedAc: 10, attackRollBonus: 0, cmb: 0, cmd: 0, fly: 0, stealth: 0,
      });
      for (const path of SIZE_MODIFIED_PATHS) {
        expect(crossedOut(path)).toEqual([['Small race', true]]);
      }
    });

    it('crosses out every stale size bonus, also those that already lost to another', () => {
      const char = characterOfSize(5);
      char.feats.push(new Feature({name: 'Old A', adjustments: {ac: {value: 1, type: 'Size'}}}));
      char.feats.push(new Feature({name: 'Old B', adjustments: {ac: {value: 2, type: 'size'}}}));
      const applied = apply(char);
      expect(applied.ac).toBe(9);
      expect(applied.touchAc).toBe(9);
      expect(applied.flatFootedAc).toBe(9);
      expect(crossedOut('ac')).toEqual([['Old A', true], ['Old B', true], ['Size (Large)', false]]);
    });

    it('keeps the other bonuses and the untyped modifiers of those stats', () => {
      const char = characterOfSize(5);
      char.feats.push(new Feature({name: 'Stale', adjustments: {ac: {value: 1, type: 'size'}}}));
      char.feats.push(new Feature({name: 'Ring', adjustments: {ac: {value: 2, type: 'deflection'}}}));
      char.feats.push(new Feature({name: 'Hand-entered', adjustments: {ac: 1}}));
      const applied = apply(char);
      // 10 + 2 deflection + 1 untyped - 1 size
      expect(applied.ac).toBe(12);
      expect(crossedOut('ac')).toEqual([['Stale', true], ['Ring', false], ['Hand-entered', false], ['Size (Large)', false]]);
    });

    it('leaves size bonuses to other stats alone', () => {
      const char = characterOfSize(4);
      char.abilityScores.str = 10;
      char.conditions.push(new Feature({name: 'Enlarge Person', adjustments: {
        size: 1, 'abilityScores.str': {value: 2, type: 'size'},
      }}));
      const applied = apply(char);
      expect(applied.abilityScores.str).toBe(12);
      expect(service.adjustmentsMap['abilityScores.str'].map(e => e.overwritten)).toEqual([false]);
      expect(applied.ac).toBe(9);
    });
  });
});
