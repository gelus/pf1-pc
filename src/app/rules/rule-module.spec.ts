import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';
import { RuleModule, ruleFeature } from './rule-module';

describe('rule modules', () => {
  let service: ApplyCharacterService;

  const apply = (char: Character, modules: RuleModule[]): Character => {
    service.ruleModules = modules;
    service.initializeCharacter(char);
    return service.applied();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('applies base features like any other feature, with the rule as the origin in the adjustments map', () => {
    const applied = apply(new Character(), [{
      name: 'test',
      base: () => [ruleFeature('Fighter (BAB)', {bab: 3})],
    }]);
    expect(applied.bab).toBe(3);
    expect(service.adjustmentsMap['bab'].map(e => e.origin)).toEqual(['Fighter (BAB)']);
  });

  it('resolves base sets together with the other features', () => {
    const char = new Character();
    char.feats.push(new Feature({name: 'Bonus', adjustments: {bab: 1}}));
    const applied = apply(char, [{
      name: 'test',
      base: () => [ruleFeature('Base', {bab: {value: 5, mode: 'set'}})],
    }]);
    expect(applied.bab).toBe(6);
  });

  it('runs final after the sets, so it sees the final values of the character', () => {
    const char = new Character();
    char.race.features.push(new Feature({name: 'Large', adjustments: {size: {value: 5, mode: 'set'}}}));
    let seenSize: number | undefined;
    const applied = apply(char, [{
      name: 'test',
      final: (_raw, appliedChar) => {
        seenSize = appliedChar.size;
        return [ruleFeature('Size', {ac: appliedChar.size === 5 ? -1 : 0})];
      },
    }]);
    expect(seenSize).toBe(5);
    expect(applied.ac).toBe(9);
    // an ac adjustment adjusts the derived acs as well
    expect(applied.touchAc).toBe(9);
  });

  it('resolves the formulas, sets and bounds of final features right away', () => {
    const char = new Character();
    char.abilityScores.str = 14;
    const applied = apply(char, [{
      name: 'test',
      final: () => [
        ruleFeature('Formula', {cmb: '{mod:abilityScores.str}'}),
        ruleFeature('Set', {init: {value: 4, mode: 'set'}}),
        ruleFeature('Cap', {bab: {value: -1, mode: 'min'}}),
        ruleFeature('Selector', {'skills.@str.value': 2}),
      ],
    }]);
    expect(applied.cmb).toBe(2);
    expect(applied.init).toBe(4);
    expect(applied.bab).toBe(-1);
    expect(applied.skills['climb'].value).toBe(2);
  });

  it('puts the character under the conditions a rule gives, taking the template of a condition given by name', () => {
    const applied = apply(new Character(), [{
      name: 'test',
      conditions: () => [new Feature({name: 'Shaken', adjustments: {}})],
    }]);
    // shaken: -2 on attack rolls, saves, skill and ability checks
    expect(applied.attackRollBonus).toBe(-2);
    expect(applied.savingThrowBonus).toBe(-2);
  });

  it('resolves rule conditions with the others, the more severe condition wins', () => {
    const char = new Character();
    char.conditions.push(new Feature({name: 'Frightened', adjustments: {}}));
    const applied = apply(char, [{
      name: 'test',
      conditions: () => [new Feature({name: 'Shaken', adjustments: {}})],
    }]);
    expect(service.adjustmentsMap['attackRollBonus']?.map(e => e.origin)).not.toContain('Shaken');
    expect(applied).toBeTruthy();
  });

  it('works the character out again under the final conditions, from the start', () => {
    const char = new Character();
    char.abilityScores.dex = 14;
    char.feats.push(new Feature({name: 'Big', adjustments: {bab: 4}}));
    const seenBab: number[] = [];
    const applied = apply(char, [{
      name: 'test',
      finalConditions: (_raw, appliedChar) => {
        seenBab.push(appliedChar.bab);
        return appliedChar.bab >= 4 ? [new Feature({name: 'Unconscious', adjustments: {}})] : [];
      },
    }]);
    // read once, on the character worked out without them
    expect(seenBab).toEqual([4]);
    // unconscious includes helpless, whose dex of 0 reaches everything taking the dex modifier
    expect(applied.abilityScores.dex).toBe(0);
    expect(service.adjustmentsMap['abilityScores.dex'].map(e => e.origin)).toContain('Helpless');
  });

  it('resolves final conditions with the other conditions', () => {
    const char = new Character();
    char.conditions.push(new Feature({name: 'Frightened', adjustments: {attackRollBonus: -2}}));
    apply(char, [{
      name: 'test',
      finalConditions: () => [new Feature({name: 'Shaken', adjustments: {}})],
    }]);
    expect(service.adjustmentsMap['attackRollBonus'].map(e => e.origin)).toEqual(['Frightened']);
    // the rule condition is suppressed like a raw one would be
    expect(service.ruleConditions().map(c => c.name)).toEqual(['Shaken']);
    expect(service.isRuleConditionSuppressed(0)).toBeTrue();
  });

  it('tells which rule conditions are suppressed, and which are not', () => {
    apply(new Character(), [{
      name: 'test',
      conditions: () => [new Feature({name: 'Fatigued', adjustments: {}})],
      finalConditions: () => [new Feature({name: 'Exhausted', adjustments: {}}), new Feature({name: 'Dazzled', adjustments: {}})],
    }]);
    expect(service.ruleConditions().map(c => c.name)).toEqual(['Fatigued', 'Exhausted', 'Dazzled']);
    expect([0, 1, 2].map(i => service.isRuleConditionSuppressed(i))).toEqual([true, false, false]);
  });

  it('says which rule a condition comes from unless the rule says so, keeping the template and the reason', () => {
    apply(new Character(), [{
      name: 'test',
      finalConditions: () => [
        new Feature({name: 'Dazzled', description: 'bright light', adjustments: {}}),
        new Feature({name: 'Shaken', description: 'scared', source: 'from a spell', adjustments: {}}),
      ],
    }]);
    const [dazzled, shaken] = service.ruleConditions();
    expect(dazzled.source).toBe('from test');
    expect(dazzled.reason).toBe('bright light');
    expect(dazzled.description).toContain('A dazzled creature takes a –1 penalty');
    expect(dazzled.adjustments['attackRollBonus']).toBe(-1);
    expect(shaken.source).toBe('from a spell');
    expect(shaken.reason).toBe('scared');
  });

  it('gives the late hooks what adjusted the character so far', () => {
    const char = new Character();
    char.feats.push(new Feature({name: 'Resist Fire', adjustments: {'energyResistance.fire': 5}}));
    let origins: string[] = [];
    apply(char, [{
      name: 'test',
      finalize: (_raw, _applied, context) => {
        origins = context.adjustmentsMap['energyResistance.fire'].map(e => e.origin);
      },
    }]);
    expect(origins).toEqual(['Resist Fire']);
  });

  it('runs finalize last, on the applied character', () => {
    const applied = apply(new Character(), [{
      name: 'test',
      base: () => [ruleFeature('Base', {bab: 6})],
      finalize: (_raw, appliedChar) => { appliedChar.senses = `bab ${appliedChar.bab}`; },
    }]);
    expect(applied.senses).toBe('bab 6');
  });

  it('skips a module that throws and keeps applying the others', () => {
    spyOn(console, 'error');
    const applied = apply(new Character(), [
      {name: 'broken', base: () => { throw new Error('boom'); }},
      {name: 'working', base: () => [ruleFeature('Working', {bab: 1})]},
    ]);
    expect(applied.bab).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });

  it('never changes the raw character', () => {
    const char = new Character();
    apply(char, [{name: 'test', base: () => [ruleFeature('Base', {bab: 2})]}]);
    expect(service.raw().bab).toBe(0);
  });

  it('gives characters saved before the new fields their defaults', () => {
    const char = new Character() as any;
    delete char.combatOptions;
    delete char.damageReduction;
    delete char.traits;
    const applied = apply(char, []);
    expect(applied.combatOptions.powerAttack).toBeFalse();
    expect(applied.damageReduction).toEqual({});
    expect(applied.traits).toEqual([]);
  });

  it('applies traits and drawbacks like feats', () => {
    const char = new Character();
    char.traits.push(new Feature({name: 'Reactionary', adjustments: {init: {value: 2, type: 'trait'}}}));
    char.drawbacks.push(new Feature({name: 'Paranoid', adjustments: {'skills.diplomacy.value': -2}}));
    const applied = apply(char, []);
    expect(applied.init).toBe(2);
    expect(applied.skills['diplomacy'].value).toBe(-2);
  });
});
