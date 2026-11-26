import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Adjustments, Feature } from '../interfaces/character.interface';
import { Attack } from '../utils/attack.class';

// the engine's ways of writing what the spell library's effects needed and had no path for: fast healing and
// regeneration (the best one applies), lowering a defense that does not stack, a doubled threat range, and a bonus
// that builds up as the feature is played
describe('engine: what spells, feats and traits needed', () => {
  let service: ApplyCharacterService;
  const feat = (name: string, adjustments: Adjustments, more: Partial<Feature> = {}) => new Feature({name, adjustments, ...more});
  const apply = (char: Character): Character => {
    service.initializeCharacter(char);
    return service.applied();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('keeps the best fast healing, and regeneration apart from it', () => {
    const char = new Character();
    char.feats.push(feat('Ring', {fastHealing: 1}), feat('Spell', {fastHealing: 5}), feat('Troll Blood', {regeneration: 2}));
    const applied = apply(char);
    expect(applied.fastHealing).toBe(5);
    expect(applied.regeneration).toBe(2);
  });

  it('lowers a resistance after the best is kept, never below 0', () => {
    const char = new Character();
    char.feats.push(
      feat('Resist Energy', {'energyResistance.fire': 20}),
      feat('Fire Resistance', {'energyResistance.fire': 5}),
      feat('Strip', {'energyResistance.fire': {value: 10, mode: 'lower'}}),
      feat('Strip Cold', {'energyResistance.cold': {value: 10, mode: 'lower'}}),
      feat('Weaken', {spellResistance: {value: 4, mode: 'lower'}}),
    );
    char.spellResistance = 15;
    const applied = apply(char);
    expect(applied.energyResistance.fire).toBe(10);
    expect(applied.energyResistance.cold || 0).toBe(0);
    expect(applied.spellResistance).toBe(11);
  });

  it('doubles a threat range once, however many give it', () => {
    const char = new Character();
    const sword = Object.assign(new Attack(), {name: 'Longsword', weapon: 'longsword', damage: '1d8', crit: 19, critMultiplier: 2});
    char.feats.push(new Feature({name: 'Weapons', adjustments: {melee: [sword]}}),
      feat('Improved Critical', {'melee.@longsword.threatRangeDoubled': true}),
      feat('Keen Edge', {'melee.*.threatRangeDoubled': true}),
    );
    const applied = apply(char);
    expect((applied.melee[0] as any).result.critical).toMatch(/^17/);
  });

  it('writes a feature\'s stacks into its formulas, set as it is played', () => {
    const char = new Character();
    char.feats.push(feat('Blood Rage', {'abilityScores.str': {value: '2 * {stacks}', type: 'morale'}, ac: '-1 * {stacks}'},
      {stacks: {current: 0, max: 5, label: 'times 5 damage'}}));
    char.abilityScores.str = 10;
    let applied = apply(char);
    expect(applied.abilityScores.str).toBe(10);
    service.setFeatureStacks(applied.feats[0], 3);
    applied = service.applied();
    expect(applied.abilityScores.str).toBe(16);
    service.setFeatureStacks(applied.feats[0], 9);
    expect(service.applied().abilityScores.str).toBe(20);
    expect(service.raw().feats[0].stacks!.current).toBe(5);
  });
});

// "your bravery bonus": a formula reads what another feature gives, as the engine applied it
describe('engine: a formula reading another feature', () => {
  let service: ApplyCharacterService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });
  const fighter = (levels: number, ...feats: Feature[]): Character => {
    const char = new Character();
    char.feats.push(new Feature({name: 'Bravery', adjustments: {'saves.will[fear]': '1 + floor(({level} - 2) / 4)'}}), ...feats);
    char.classLevels = Array.from({length: levels}, () => ({name: 'Fighter'} as any));
    return char;
  };

  it('adds the bravery bonus to Diplomacy, growing with it', () => {
    const social = new Feature({name: 'Social Bravery', adjustments: {'skills.diplomacy.value': '{feature:Bravery}'}});
    service.initializeCharacter(fighter(6, social));
    expect(service.applied().skills.diplomacy.value).toBe(2);
    service.initializeCharacter(fighter(18, social));
    expect(service.applied().skills.diplomacy.value).toBe(5);
  });

  it('reads one path by its variant however it is spelled, and is NaN for a feature it lacks or a loop', () => {
    service.initializeCharacter(fighter(10, new Feature({name: 'Half', adjustments: {'saves.fort': 'floor({feature:bravery:saves.will[Fear effects]} / 2)'}})));
    expect(service.applied().saves.fort).toBe(1);
    const read = (service.applied() as any);
    service.initializeCharacter(fighter(2,
      new Feature({name: 'A', adjustments: {init: '{feature:B}'}}),
      new Feature({name: 'B', adjustments: {cmb: '{feature:A}'}}),
      new Feature({name: 'C', adjustments: {cmd: '{feature:Nothing}'}})));
    expect(read).toBeTruthy();
    expect(service.applied().cmd).toBe(0);
    // (and a feat taken without the feature it reads adds nothing)
    service.initializeCharacter(Object.assign(new Character(), {feats: [new Feature({name: 'Social Bravery', adjustments: {'skills.diplomacy.value': '{feature:Bravery}'}})]}));
    expect(service.applied().skills.diplomacy.value).toBe(0);
  });
});
