import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { ConditionsService } from '../conditions.service';
import { Feature } from '../interfaces/character.interface';
import { abilityModifier } from '../ability-mod.pipe';

describe('ability damage and drain', () => {
  let service: ApplyCharacterService;

  const apply = (char: Character): Character => {
    service.initializeCharacter(char);
    return service.applied();
  };
  const conditionNames = (): string[] => service.ruleConditions().map(c => c.name || '');

  // a 2nd level fighter: 10 + 6 hp from its hit dice
  const fighter = (): Character => {
    const char = new Character();
    char.classLevels = [
      new ClassLevel({name: 'Fighter', level: 1, hitDice: 10}),
      new ClassLevel({name: 'Fighter', level: 2, hitDice: 10, rolledHp: 6}),
    ];
    char.abilityScores = {str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8};
    return char;
  };

  const template = (name: string): Feature => ({...TestBed.inject(ConditionsService).list.find(c => c.name === name)!});
  const paralyzed = () => template('Paralyzed');
  const helpless = () => template('Helpless');

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('lowers the score by its drain', () => {
    const char = fighter();
    char.abilityDrain = {str: 3};
    expect(apply(char).abilityScores.str).toBe(13);
    expect(service.adjustmentsMap['abilityScores.str'].map(e => e.origin)).toEqual(['Str drain (3)']);
  });

  it('leaves the score alone and gives -1 to the modifier for every 2 points of damage, an odd point does nothing', () => {
    const char = fighter();
    char.abilityDamage = {str: 3, dex: 1, wis: 4};
    char.feats.push(new Feature({name: 'Strong', adjustments: {cmb: '{mod:abilityScores.str}'}}));
    const applied = apply(char);
    expect(applied.abilityScores.str).toBe(16);
    expect(applied.abilityScores.dex).toBe(14);
    expect(applied.abilityScores.wis).toBe(12);
    expect(service.adjustmentsMap['abilityScores.str']).toBeUndefined();
    expect(abilityModifier(applied, 'str')).toBe(2);
    expect(abilityModifier(applied, 'dex')).toBe(2);
    expect(abilityModifier(applied, 'wis')).toBe(-1);
    // the modifier reaches everything taking it, formulas included
    expect(applied.cmb).toBe(2);
  });

  it('keeps the undamaged score for what takes the score, carrying capacity', () => {
    const char = fighter();
    const undamaged = apply(char).carryingCapacity;
    const damaged = fighter();
    damaged.abilityDamage = {str: 6};
    expect(apply(damaged).carryingCapacity).toEqual(undamaged);
  });

  it('takes the damage penalty after the cap of a max dex bonus', () => {
    // Dex 18 gives +4, capped at +3, 2 points of damage take 1 off the capped bonus
    const char = {abilityScores: {dex: 18}, abilityDamage: {dex: 2}};
    expect(abilityModifier(char, 'dex', 3)).toBe(2);
    expect(abilityModifier(char, 'dex')).toBe(3);
  });

  it('adds up damage and drain on one ability: the drain lowers the score, the damage the modifier', () => {
    const char = fighter();
    char.abilityDamage = {cha: 2};
    char.abilityDrain = {cha: 2};
    const applied = apply(char);
    expect(applied.abilityScores.cha).toBe(6);
    expect(abilityModifier(applied, 'cha')).toBe(-3);
  });

  it('lowers max hp through the Con modifier', () => {
    // 16 from the hit dice, Con 14 gives +2 a level
    expect(apply(fighter()).hp).toBe(20);
    // Con 12 for its modifier, +1
    const damaged = fighter();
    damaged.abilityDamage = {con: 2};
    expect(apply(damaged).hp).toBe(18);
    const drained = fighter();
    // Con 9, -1
    drained.abilityDrain = {con: 5};
    expect(apply(drained).hp).toBe(14);
  });

  it('keeps the raw scores, damage and drain apart', () => {
    const char = fighter();
    char.abilityDamage = {str: 4};
    apply(char);
    expect(service.raw().abilityScores.str).toBe(16);
    expect(service.raw().abilityDamage).toEqual({str: 4});
  });

  it('knocks the character unconscious when the damage equals the score, helpless with it', () => {
    const char = fighter();
    char.abilityDamage = {int: 10};
    const applied = apply(char);
    expect(conditionNames()).toEqual(['Unconscious']);
    expect(service.ruleConditions()[0].reason).toBe('Int damage 10 ≥ Int 10');
    expect(applied.abilityScores.dex).toBe(0);

    const lessDamaged = fighter();
    lessDamaged.abilityDamage = {int: 9};
    apply(lessDamaged);
    expect(conditionNames()).toEqual([]);
  });

  it('kills the character when the Con damage equals the Con score', () => {
    const char = fighter();
    char.abilityDamage = {con: 14};
    apply(char);
    expect(conditionNames()).toContain('Dead');
    expect(conditionNames()).not.toContain('Unconscious');
  });

  it('compares the damage with the drained score', () => {
    const char = fighter();
    char.abilityDamage = {wis: 6};
    char.abilityDrain = {wis: 6};
    apply(char);
    expect(conditionNames()).toEqual(['Unconscious']);
  });

  it('puts a character drained to 0 under what a score of 0 does', () => {
    const drainedTo0 = (ability: 'str' | 'dex' | 'con' | 'cha'): string[] => {
      const char = fighter();
      char.abilityDrain = {[ability]: char.abilityScores[ability]};
      apply(char);
      return conditionNames();
    };
    expect(drainedTo0('str')).toEqual(['Unconscious']);
    // immobile but not unconscious
    expect(drainedTo0('dex')).toEqual(['Helpless']);
    expect(drainedTo0('con')).toContain('Dead');
    expect(drainedTo0('cha')).toEqual(['Unconscious']);
  });

  it('leaves a score at 0 for other reasons to its condition', () => {
    const char = fighter();
    char.conditions.push(paralyzed());
    const applied = apply(char);
    expect(applied.abilityScores.str).toBe(0);
    expect(conditionNames()).toEqual([]);
  });

  describe('under a condition giving an effective score of 0', () => {
    it('compares the damage of a paralyzed character with its actual score', () => {
      const char = fighter();
      char.conditions.push(paralyzed());
      char.abilityDamage = {str: 1, dex: 2};
      const applied = apply(char);
      expect(conditionNames()).toEqual([]);
      // the condition still makes its Str and Dex 0, everything taking them takes that
      expect(applied.abilityScores.str).toBe(0);
      expect(applied.abilityScores.dex).toBe(0);
      expect(abilityModifier(applied, 'dex')).toBe(-6);
    });

    it('still knocks a paralyzed character out when the damage reaches its actual score', () => {
      const char = fighter();
      char.conditions.push(paralyzed());
      char.abilityDamage = {str: 16};
      apply(char);
      expect(conditionNames()).toEqual(['Unconscious']);
      expect(service.ruleConditions()[0].reason).toBe('Str damage 16 ≥ Str 16');
    });

    it('takes the adjustments that are not a condition\'s into the actual score', () => {
      const char = fighter();
      char.conditions.push(paralyzed());
      char.abilityDrain = {str: 2};
      char.feats.push(new Feature({name: 'Bull belt', adjustments: {'abilityScores.str': {value: 4, type: 'enhancement'}}}));
      // 16 - 2 + 4 = 18
      char.abilityDamage = {str: 17};
      apply(char);
      expect(conditionNames()).toEqual([]);
      char.abilityDamage = {str: 18};
      apply({...char});
      expect(conditionNames()).toEqual(['Unconscious']);
    });

    it('does not take a helpless character\'s Dex of 0 for drain to 0', () => {
      const char = fighter();
      char.conditions.push(helpless());
      char.abilityDrain = {dex: 2};
      expect(apply(char).abilityScores.dex).toBe(0);
      expect(conditionNames()).toEqual([]);
    });
  });

  it('knocks a Str 10 character with 10 Str damage unconscious', () => {
    const char = fighter();
    char.abilityScores.str = 10;
    char.abilityDamage = {str: 10};
    apply(char);
    expect(conditionNames()).toEqual(['Unconscious']);
  });

  it('makes a character drained to Dex 0 helpless, and its Dex 0 then applies', () => {
    const char = fighter();
    char.abilityDrain = {dex: 14};
    const applied = apply(char);
    expect(conditionNames()).toEqual(['Helpless']);
    expect(applied.abilityScores.dex).toBe(0);
  });
});
