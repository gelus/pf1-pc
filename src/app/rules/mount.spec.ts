import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { CLASS_PRESETS, classLevelFromPreset } from './class-presets';
import { masterCopyOf } from './companions';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { evaluateVal } from '../utils/object.util';
import { createFeature } from '../ai/builders';
import { getCreationStep } from '../ai/creation-script';

// a mount: an animal companion at its class's level, with what that class feature adds to it or takes away, from its
// text (a paladin's at 11th and 15th, a cavalier's without share spells), never coded by class
describe('mounts', () => {
  let service: ApplyCharacterService;
  const mountOf = (className: string, levels: number, link: object = {}): Character => {
    const preset = CLASS_PRESETS.find(p => p.name === className)!;
    const master = Object.assign(new Character(), {name: 'Seelah', classLevels: Array.from({length: levels}, (_, i) =>
      new ClassLevel({...classLevelFromPreset(preset, i + 1, i === 0), rolledHp: 7}))});
    const horse = Object.assign(new Character(), {name: 'Glory',
      master: {masterId: master.id, kind: 'mount', classes: [className], copy: masterCopyOf(master, master), ...link}});
    horse.abilityScores = {...horse.abilityScores, int: 2};
    horse.race.features = [
      new Feature({name: 'Horse', adjustments: {size: {value: 5, mode: 'set'}, 'speed.land': {value: 50, mode: 'set'}} as any}),
      // what a paladin's divine bond gives its mount, as the AI writes it from the class feature
      new Feature({name: 'Intelligent', adjustments: {'abilityScores.int': {value: 6, mode: 'max'}} as any}),
      new Feature({name: 'Spell Resistance', atLevel: 15, shownIn: 'defensiveAbilities', adjustments: {spellResistance: {value: '{level} + 11', mode: 'max'}} as any}),
    ];
    return horse;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('has its own level as {level} in its formulas, and its class\'s abilities from their level', () => {
    const glory = mountOf('Paladin', 15);
    expect(evaluateVal('{level} + 11', glory)).toBe(26);
    service.initializeCharacter(glory);
    expect(service.applied().spellResistance).toBe(26);
    expect(service.applied().abilityScores.int).toBe(6);
    service.initializeCharacter(mountOf('Paladin', 14));
    expect(service.applied().spellResistance).toBeFalsy();
  });

  it('leaves out what its class feature takes away', () => {
    // any class granting a mount that takes share spells away (a cavalier's): the fighter preset stands in for it
    service.initializeCharacter(mountOf('Fighter', 4, {without: ['Share Spells']}));
    const names = service.applied().specialQuality.map(f => f.name);
    expect(names).toContain('Link');
    expect(names).not.toContain('Share Spells');
  });

  it('is made by its own script, its class\'s abilities added as its traits', () => {
    service.initializeCharacter(mountOf('Paladin', 5));
    service.update({creation: undefined});
    const steps = (getCreationStep(service, {playerTurns: 1}) as any);
    expect(service.raw().creation!.script).toBe('mount');
    expect(steps.step).toBe('creature');
    const added = createFeature(service, {list: 'race.features', name: 'Celestial', at_level: 11, shown_in: 'specialQuality',
      description: 'the celestial template: darkvision, DR, resistances, smite evil', adjustments: '{"senses": "darkvision 60 ft."}',
      based_on: 'own knowledge'}) as any;
    expect(added.done).toContain('racial trait Celestial');
    const celestial = service.raw().race.features.find(f => f.name === 'Celestial')!;
    expect(celestial.atLevel).toBe(11);
    expect(celestial.shownIn).toBe('specialQuality');
  });
});
