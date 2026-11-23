import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { CLASS_PRESETS, classLevelFromPreset } from './class-presets';
import { masterCopyOf } from './companions';
import { levelUpAvailable } from './experience';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { explainStat } from '../ai/character-reader';

// a familiar, from its master's copy and its master class level: a wizard 5's cat
describe('familiar rule', () => {
  let service: ApplyCharacterService;
  const wizard = (levels: number): Character => {
    const preset = CLASS_PRESETS.find(p => p.name === 'Wizard')!;
    const char = Object.assign(new Character(), {name: 'Ezren', classLevels: Array.from({length: levels}, (_, i) =>
      new ClassLevel({...classLevelFromPreset(preset, i + 1, i === 0), rolledHp: 4}))});
    char.abilityScores = {...char.abilityScores, con: 12};
    char.skills = {...char.skills, perception: {...char.skills['perception'], ranks: 3}, stealth: {...char.skills['stealth'], ranks: 1}};
    return char;
  };
  const cat = (master: Character, classes = ['Wizard']): Character => {
    service.initializeCharacter(master);
    const char = Object.assign(new Character(), {name: 'Whiskers',
      master: {masterId: master.id, kind: 'familiar', classes, copy: masterCopyOf(master, service.applied())}});
    char.abilityScores = {str: 3, dex: 15, con: 8, int: 2, wis: 12, cha: 7} as any;
    char.race.features = [new Feature({name: 'Cat', adjustments: {size: {value: 2, mode: 'set'}, 'speed.land': {value: 30, mode: 'set'},
      'skills.stealth.value': {value: 4, type: 'racial'}} as any})];
    char.skills = {...char.skills, stealth: {...char.skills['stealth'], ranks: 1}};
    return char;
  };
  const total = (stat: string) => (explainStat(service, stat) as any).total;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('takes half its master\'s hit points, its base attack bonus and its better base saves', () => {
    const master = wizard(5);
    service.initializeCharacter(master);
    const masterHp = service.applied().hp;
    service.initializeCharacter(cat(master));
    const applied = service.applied();
    expect(applied.hp).toBe(Math.floor(masterHp / 2));
    expect(applied.bab).toBe(2);
    // the wizard's base saves (+1, +1, +4) with the cat's own abilities
    expect(total('saves.will')).toBe(4 + 1);
    expect(total('saves.ref')).toBe(1 + 2);
  });

  it('uses its master\'s skill ranks where better, with its class skills', () => {
    service.initializeCharacter(cat(wizard(5)));
    const perception = explainStat(service, 'perception') as any;
    // 3 of the master's ranks, +3 a class skill, +1 Wis
    expect(perception.total).toBe(3 + 3 + 1);
    expect(perception.lines.map((l: any) => l.source)).toContain("Ezren's skill ranks");
    // its own rank in Stealth is as good as its master's: its own counts
    expect((explainStat(service, 'stealth') as any).lines.some((l: any) => l.source === "Ezren's skill ranks")).toBeFalse();
  });

  it('gains natural armor, Int and abilities by master class level, the levels of every class that grants it', () => {
    service.initializeCharacter(cat(wizard(5)));
    let applied = service.applied();
    expect(applied.abilityScores.int).toBe(8);
    expect((service.adjustmentsMap['ac'] || []).find(e => e.type === 'natural armor increase')!.value).toBe(3);
    // its creature (its race, Cat) is listed with them
    expect(applied.specialQuality.map(f => f.name)).toEqual(['Alertness', 'Share Spells', 'Empathic Link', 'Speak with Master', 'Cat']);
    expect(applied.defensiveAbilities.map(f => f.name)).toEqual(['Improved Evasion']);
    expect(applied.specialAttack.map(f => f.name)).toEqual(['Deliver Touch Spells']);
    // no class counted: nothing of the table, which a warning says
    service.initializeCharacter(cat(wizard(5), []));
    applied = service.applied();
    expect(applied.specialQuality.map(f => f.name)).toEqual(['Cat']);
  });

  it('never has a level up of its own', () => {
    const familiar = cat(wizard(1));
    expect(levelUpAvailable(familiar)).toBeFalse();
  });
});
