import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { CLASS_PRESETS, classLevelFromPreset } from './class-presets';
import { companionLevel, companionWarnings, masterCopyOf, owedCompanionIncreases } from './companions';
import { availableFeats } from './class-progression';
import { skillRankBudget } from '../characterPipes/remaining-ranks.pipe';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { explainStat } from '../ai/character-reader';

// an animal companion by its effective druid level: a druid 4's wolf, a ranger 6's (ranger level - 3)
describe('animal companion rule', () => {
  let service: ApplyCharacterService;
  const master = (className: string, levels: number): Character => {
    const preset = CLASS_PRESETS.find(p => p.name === className)!;
    return Object.assign(new Character(), {name: 'Lini', classLevels: Array.from({length: levels}, (_, i) =>
      new ClassLevel({...classLevelFromPreset(preset, i + 1, i === 0), rolledHp: 5}))});
  };
  const wolf = (of: Character, link: object = {}): Character => {
    const char = Object.assign(new Character(), {name: 'Fang',
      master: {masterId: of.id, kind: 'animal companion', classes: [of.classLevels[0].name], copy: masterCopyOf(of, of), ...link}});
    char.abilityScores = {str: 13, dex: 15, con: 15, int: 2, wis: 12, cha: 6} as any;
    char.race.features = [
      new Feature({name: 'Wolf', adjustments: {size: {value: 4, mode: 'set'}, 'speed.land': {value: 50, mode: 'set'}, ac: {value: 2, type: 'natural armor'}} as any}),
      // its growth, from 4th level in this spec
      new Feature({name: 'Wolf, 4th-level advancement', atLevel: 4, adjustments: {size: {value: 5, mode: 'set'}, 'abilityScores.str': 2} as any}),
    ];
    return char;
  };
  const total = (stat: string) => (explainStat(service, stat) as any).total;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('has the Hit Dice, attack bonus, saves, hit points, skills and feats of its level', () => {
    service.initializeCharacter(wolf(master('Druid', 4), {increases: ['str']}));
    const applied = service.applied();
    expect(companionLevel(service.raw().master)).toBe(4);
    expect(applied.bab).toBe(3);
    // good Fort and Ref, poor Will, of 4 HD, with its Con 15, Dex 15 + 1, Wis 12
    expect(total('saves.fort')).toBe(4 + 2);
    expect(total('saves.ref')).toBe(4 + 3);
    expect(total('saves.will')).toBe(1 + 1);
    // 4 HD of d8 on average (18) with its Con +2 a HD
    expect(applied.hp).toBe(18 + 8);
    expect(skillRankBudget(applied).available).toBe(4);
    expect(availableFeats(applied)).toBe(2);
  });

  it('grows with its level: natural armor, Str and Dex, its 4th-level advancement, its abilities', () => {
    service.initializeCharacter(wolf(master('Druid', 3)));
    let applied = service.applied();
    expect(applied.size).toBe(4);
    expect(applied.abilityScores.str).toBe(14);
    expect(applied.defensiveAbilities.map(f => f.name)).toEqual(['Evasion']);
    service.initializeCharacter(wolf(master('Druid', 4), {increases: ['str']}));
    applied = service.applied();
    // Large from 4th, Str 13 + 1 (its level) + 2 (its advancement) + 1 (its increase)
    expect(applied.size).toBe(5);
    expect(applied.abilityScores.str).toBe(17);
    expect(applied.specialQuality.map(f => f.name)).toContain('Bonus Tricks (2)');
  });

  it('takes its effective druid level from its master class level and the offset of the class feature', () => {
    service.initializeCharacter(wolf(master('Ranger', 6), {levelOffset: -3}));
    expect(companionLevel(service.raw().master)).toBe(3);
    expect(service.applied().bab).toBe(2);
  });

  it('owes an ability score increase from 4th level until it is picked', () => {
    const fang = wolf(master('Druid', 4));
    expect(owedCompanionIncreases(fang)).toBe(1);
    expect(companionWarnings(fang).join(' ')).toContain('ability score increase');
  });
});
