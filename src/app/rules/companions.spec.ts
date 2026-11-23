import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { CLASS_PRESETS, classLevelFromPreset } from './class-presets';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { companionLine, companionWarnings, masterCopyOf } from './companions';
import { checkCreatedCharacter } from '../ai/character-check';
import { creationOpener, getCreationStep } from '../ai/creation-script';
import { characterSummary } from '../ai/character-reader';
import { ls } from '../utils/localstorage.util';

// a cohort (the Leadership feat): a character of its own, at least two levels below its leader, told and never refused
describe('companions: the cohort', () => {
  let service: ApplyCharacterService;
  const fighter = (levels: number): ClassLevel[] => {
    const preset = CLASS_PRESETS.find(p => p.name === 'Fighter')!;
    return Array.from({length: levels}, (_, i) => new ClassLevel({...classLevelFromPreset(preset, i + 1, i === 0), rolledHp: 6}));
  };
  const leader = (): Character => Object.assign(new Character(), {name: 'Aldric', classLevels: fighter(7)});
  const cohort = (levels: number): Character => {
    const master = leader();
    return Object.assign(new Character(), {name: 'Bren', classLevels: fighter(levels),
      master: {masterId: master.id, kind: 'cohort', copy: masterCopyOf(master, master)}});
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('is at least two levels below its leader, as a warning', () => {
    expect(companionWarnings(cohort(5))).toEqual([]);
    expect(companionWarnings(cohort(6))).toEqual(['a cohort is at least 2 levels below its leader: Bren is level 6, Aldric level 7']);
    service.initializeCharacter(cohort(6));
    const check = checkCreatedCharacter(service);
    expect(check.warnings).toContain('a cohort is at least 2 levels below its leader: Bren is level 6, Aldric level 7');
    expect(check.errors.join(' ')).not.toContain('cohort');
  });

  it('tells the AI what it is building, from the first message and step', () => {
    const blank = cohort(0);
    service.initializeCharacter(blank);
    expect(companionLine(blank)).toBe('the cohort of Aldric (level 7)');
    expect(creationOpener(service)).toContain("We're building Bren, the cohort of Aldric (level 7).");
    const step = getCreationStep(service, {playerTurns: 1}) as any;
    expect(step.companion).toContain('at least 2 levels below its leader');
  });

  it('is listed in its leader\'s summary, and says whose it is in its own', () => {
    const master = leader();
    const bren = cohort(5);
    master.companions = [bren.id];
    ls.setItem('character-' + bren.id, bren);
    service.initializeCharacter(master);
    expect((characterSummary(service) as any).companions).toEqual(['Bren (cohort, level 5)']);
    service.initializeCharacter(bren);
    expect((characterSummary(service) as any).companionOf).toBe('the cohort of Aldric (level 7)');
    ls.removeItem('character-' + bren.id);
  });
});
