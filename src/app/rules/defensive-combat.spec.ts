import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { CombatOptions, Feature } from '../interfaces/character.interface';
import {
  DEFENSIVE_COMBAT_OPTIONS, defensiveCombatOptionSummary, defensiveCombatRule, excludedCombatOptions,
} from './defensive-combat';

describe('defensive combat rule', () => {
  let service: ApplyCharacterService;

  const apply = (options: Partial<CombatOptions>, mutate: (char: Character) => void = () => {}): Character => {
    const char = new Character();
    char.combatOptions = {...char.combatOptions, ...options};
    mutate(char);
    service.ruleModules = [defensiveCombatRule];
    service.initializeCharacter(char);
    return service.applied();
  };

  const acrobaticsRanks = (ranks: number) => (char: Character) => char.skills['acrobatics'].ranks = ranks;
  const stats = (char: Character) => ({
    ac: char.ac, touchAc: char.touchAc, flatFootedAc: char.flatFootedAc, attackRollBonus: char.attackRollBonus,
  });

  beforeEach(() => {
    service = TestBed.inject(ApplyCharacterService);
  });

  it('changes nothing with no option on', () => {
    expect(stats(apply({}))).toEqual({ac: 10, touchAc: 10, flatFootedAc: 10, attackRollBonus: 0});
  });

  it('gives -4 on attack rolls and a +2 dodge bonus to AC fighting defensively, lost when flat-footed', () => {
    expect(stats(apply({fightingDefensively: true}))).toEqual({ac: 12, touchAc: 12, flatFootedAc: 10, attackRollBonus: -4});
    const dodge = service.adjustmentsMap['ac'].find(e => e.origin === 'Fighting Defensively')!;
    expect([dodge.value, dodge.type]).toEqual([2, 'dodge']);
  });

  it('gives +3 instead fighting defensively with 3 ranks in acrobatics, not with 2', () => {
    expect(apply({fightingDefensively: true}, acrobaticsRanks(2)).ac).toBe(12);
    expect(apply({fightingDefensively: true}, acrobaticsRanks(3)).ac).toBe(13);
  });

  it('gives a +4 dodge bonus to AC with total defense, +6 with 3 ranks in acrobatics, and no attack penalty', () => {
    expect(stats(apply({totalDefense: true}))).toEqual({ac: 14, touchAc: 14, flatFootedAc: 10, attackRollBonus: 0});
    expect(apply({totalDefense: true}, acrobaticsRanks(5)).ac).toBe(16);
  });

  it('counts acrobatics ranks a feature gives', () => {
    const applied = apply({totalDefense: true}, char =>
      char.feats.push(new Feature({name: 'Headband', active: true, adjustments: {'skills.acrobatics.ranks': 3}})));
    expect(applied.ac).toBe(16);
  });

  it('stacks with the other dodge bonuses of the character', () => {
    const applied = apply({fightingDefensively: true}, char =>
      char.feats.push(new Feature({name: 'Dodge', active: true, adjustments: {ac: {value: 1, type: 'dodge'}}})));
    expect(applied.ac).toBe(13);
    expect(service.adjustmentsMap['ac'].some(e => e.overwritten)).toBeFalse();
  });

  it('applies only total defense when both are on', () => {
    expect(stats(apply({fightingDefensively: true, totalDefense: true})))
      .toEqual({ac: 14, touchAc: 14, flatFootedAc: 10, attackRollBonus: 0});
  });

  it('makes fighting defensively and total defense exclude each other', () => {
    expect(excludedCombatOptions('fightingDefensively')).toEqual(['totalDefense']);
    expect(excludedCombatOptions('totalDefense')).toEqual(['fightingDefensively']);
    expect(excludedCombatOptions('powerAttack')).toEqual([]);
  });

  it('sums up what an option does', () => {
    const char = new Character();
    expect(defensiveCombatOptionSummary(char, 'fightingDefensively')).toBe('-4 attack, +2 dodge AC');
    char.skills['acrobatics'].ranks = 3;
    expect(defensiveCombatOptionSummary(char, 'totalDefense'))
      .toBe('+6 dodge AC, no attacks, not even attacks of opportunity');
    expect(defensiveCombatOptionSummary(char, 'powerAttack')).toBeUndefined();
  });

  it('keeps the acrobatics bonus as data', () => {
    expect(DEFENSIVE_COMBAT_OPTIONS.map(o => o.skillRanksBonus))
      .toEqual([{skill: 'acrobatics', ranks: 3, dodge: 3}, {skill: 'acrobatics', ranks: 3, dodge: 6}]);
  });
});
