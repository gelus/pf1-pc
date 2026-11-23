import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from './apply-character.service';
import example from './example-character.json';
import { Feature } from './interfaces/character.interface';
import { retrainQuote } from './rules/retraining';
import { dependentsOf, unqualifiedFeats } from './rules/prerequisites';
import {
  payGold, removeLastClassLevel, retrainAbilityIncrease, retrainArchetype, retrainClassLevel, retrainFeature,
  retrainHitPoints, retrainLanguage, retrainSkillRanks, retrainable,
} from './retraining';
import { addClassLevel } from './ai/level-up';
import { retrain } from './ai/retrain';
import { ClassLevel } from './utils/classlevel.class';

// retraining by the Ultimate Campaign rules, on the example barbarian (level 1, Str 18, Bloody Vengeance)
describe('retraining', () => {
  let service: ApplyCharacterService;
  const level = (n: number, className = 'Barbarian') => {
    for (let i = service.raw().classLevels.length; i < n; i++) {
      // a class's 1st level gives its features, "none" here
      const first = !service.raw().classLevels.some(l => l.name === className);
      addClassLevel(service, {class_name: className, rolled_hp: 6, features: first ? 'none' : '[]', ...(i + 1 === 4 ? {ability_increase: 'str'} : {})});
    }
  };
  const feat = (name: string, prerequisites?: string) =>
    new Feature({name, description: name, adjustments: {init: 1} as Feature['adjustments'], ...(prerequisites ? {prerequisites} : {})});

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(JSON.parse(JSON.stringify(example)));
  });

  it('takes days and 10 gp a day for each character level', () => {
    level(4);
    expect(retrainQuote(service.raw(), 'feat')).toEqual(jasmine.objectContaining({days: 5, cost: 200}));
    expect(retrainQuote(service.raw(), 'archetype', {features: 2}).days).toBe(10);
    expect(retrainQuote(service.raw(), 'class level').days).toBe(7);
    expect(retrainQuote(service.raw(), 'class level', {synergy: true}).days).toBe(5);
    expect(retrainQuote(service.raw(), 'spells known', {spellLevel: 0}).days).toBe(1);
    expect(retrainQuote(service.raw(), 'hit points', {noTrainer: true}).days).toBe(6);
  });

  it('trades a feat in its place, telling what needed it and what no longer qualifies', () => {
    service.update({feats: [feat('Power Attack', 'Str 13, base attack bonus +1'), feat('Cleave', 'Power Attack')]});
    const old = retrainable(service.raw(), 'feat', 'Power Attack')!;
    expect(dependentsOf(service.applied(), old)).toEqual(['Cleave']);
    const done = retrainFeature(service, 'feat', old, feat('Toughness'));
    expect(done.done).toBe('retrained Power Attack into Toughness');
    expect(service.raw().feats.map(f => f.name)).toEqual(['Toughness', 'Cleave']);
    expect(done.warnings!.join(' ')).toContain('Cleave has Power Attack as a prerequisite');
    expect(done.warnings!.join(' ')).toContain('Cleave: Power Attack (the character does not have it)');
    expect(done.quote!.cost).toBe(50);
    expect(service.history.undoLabel()).toBe('retrain Power Attack into Toughness');
  });

  it('moves an ability increase, skill ranks, and gives a hit point and a language', () => {
    level(4);
    expect(retrainAbilityIncrease(service, 4, 'con').done).toContain('from str to con');
    expect(retrainAbilityIncrease(service, 3, 'con').error).toContain('no ability increase');
    service.update({skills: {...service.raw().skills, climb: {...service.raw().skills['climb'], ranks: 3}}});
    const moved = retrainSkillRanks(service, [{from: 'climb', to: 'perception', ranks: 2}]);
    expect(moved.done).toContain('2 from climb to perception');
    // Int 7: one rank in a retraining, the rest is told
    expect(moved.warnings!.join(' ')).toContain('up to 1');
    expect(retrainHitPoints(service).done).toContain('+1 hit point at level 2');
    expect(retrainLanguage(service, 'Giant').done).toBe('learned Giant');
  });

  it('retrains the highest level of a class into another, the ability increases staying at their levels', () => {
    level(3);
    level(4, 'Fighter');
    expect(service.raw().classLevels.map(l => l.abilityIncrease)[3]).toBe('str');
    const done = retrainClassLevel(service, 'Barbarian', () => addClassLevel(service, {class_name: 'Fighter', rolled_hp: 8, features: '[]'}));
    expect(done.error).toBeUndefined();
    expect(done.done).toBe('retrained Barbarian 3 into Fighter 2');
    expect(service.raw().classLevels.map(l => `${l.name} ${l.level}`)).toEqual(['Barbarian 1', 'Barbarian 2', 'Fighter 1', 'Fighter 2']);
    expect(service.raw().classLevels.map(l => l.abilityIncrease)[3]).toBe('str');
    // a new level refused leaves the character as it was
    const before = JSON.stringify(service.raw().classLevels);
    expect(retrainClassLevel(service, 'Fighter', () => ({error: 'no'})).error).toBe('no');
    expect(JSON.stringify(service.raw().classLevels)).toBe(before);
    expect(removeLastClassLevel(service).done).toContain('the character is level 3');
  });

  it('takes an archetype after the class features it replaces were gained, and gives it up', () => {
    level(2);
    service.update({classLevels: service.raw().classLevels.map((l, i) => i === 1
      ? new ClassLevel({...l, features: [new Feature({name: 'Uncanny Dodge', description: 'not flat-footed', adjustments: {}})]}) : l)});
    const done = retrainArchetype(service, 'Barbarian', {take: [{name: 'Invulnerable Rager', replaces: ['Uncanny Dodge']}],
      remove: ['Uncanny Dodge'], add: [{classLevel: 2, feature: new Feature({name: 'Invulnerability', adjustments: {'damageReduction.-': 1}})}]});
    expect(done.quote!.days).toBe(5);
    expect(service.raw().classLevels[0].archetypes![0].name).toBe('Invulnerable Rager');
    expect(service.raw().classLevels[1].features.map(f => f.name)).toEqual(['Invulnerability']);
    retrainArchetype(service, 'Barbarian', {giveUp: ['Invulnerable Rager'], remove: ['Invulnerability']});
    expect(service.raw().classLevels[0].archetypes).toBeUndefined();
  });

  it('pays the gold only when asked, and tells what the purse lacks', () => {
    service.update({wealth: {pp: 0, gp: 100, sp: 0, cp: 0}});
    expect(payGold(service, 250, 'a feat').error).toContain('the purse has 100 gp');
    expect(payGold(service, 50, 'a feat').done).toContain('50 gp left');
    expect(service.raw().wealth.gp).toBe(50);
  });

  it('is the AI\'s retrain tool, which gives the gold to pay and never refuses for the rules', () => {
    service.update({feats: [feat('Power Attack', 'Str 13'), feat('Cleave', 'Power Attack')]});
    const result = retrain(service, {kind: 'feat', name: 'Power Attack', new_name: 'Iron Will', description: '+2 on Will saves',
      adjustments: '{"saves.will": 2}', prerequisites: 'none', based_on: 'own knowledge'}) as any;
    expect(result.done).toBe('retrained Power Attack into Iron Will');
    expect(result.pay).toEqual({gp: 50, what: 'retraining Power Attack'});
    expect(result.tell).toContain('5 days of training and 50 gp');
    expect(result.warnings.join(' ')).toContain('Cleave has Power Attack as a prerequisite');
    expect(unqualifiedFeats(service.applied())[0]).toContain('Cleave');
    expect((retrain(service, {kind: 'feat', quote_only: true}) as any).quote.days).toBe(5);
  });
});
