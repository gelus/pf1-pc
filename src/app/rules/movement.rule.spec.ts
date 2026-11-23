import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { Character } from '../utils/character.class';
import { explainStat } from '../ai/character-reader';
import { mechanicsProblems } from '../ai/mechanics';
import { validateAdjustments } from './adjustment-schema';
import { maneuverabilityOf } from './movement.rule';

// climb, swim, fly and burrow speeds, and what the rules attach to them
describe('movement rule', () => {
  let service: ApplyCharacterService;
  const apply = (...features: Feature[]): Character => {
    const char = new Character();
    char.race.features = [new Feature({name: 'Racial stats', adjustments: {'speed.land': {value: 30, mode: 'set'}}}), ...features];
    service.initializeCharacter(char);
    return service.applied();
  };
  const trait = (name: string, adjustments: any) => new Feature({name, adjustments});

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('gives a climb or swim speed its +8 racial bonus on the skill', () => {
    apply(trait('Climber', {'speed.climb': {value: 20, mode: 'set'}}));
    const climb = explainStat(service, 'climb') as any;
    expect(climb.stat).toBe('skills.climb.value');
    expect(climb.lines).toContain(jasmine.objectContaining({value: 8, source: 'climb speed', type: 'racial'}));
    expect((explainStat(service, 'climb speed') as any).total).toBe(20);
    expect((explainStat(service, 'swim') as any).lines.some((l: any) => l.source === 'swim speed')).toBeFalse();
    // a racial bonus of its own on Climb does not stack with it
    apply(trait('Climber', {'speed.climb': {value: 20, mode: 'set'}}), trait('Sure-Footed', {'skills.climb.value': {value: 2, type: 'racial'}}));
    expect((explainStat(service, 'climb') as any).total).toBe(8);
  });

  it('puts the best maneuverability of a fly speed on Fly checks', () => {
    expect(maneuverabilityOf({flyManeuverability: ' poor good'})).toBe('good');
    apply(trait('Wings', {'speed.fly': {value: 30, mode: 'set'}, flyManeuverability: 'poor'}), trait('Fly', {flyManeuverability: 'good'}));
    expect((explainStat(service, 'fly') as any).lines).toContain(jasmine.objectContaining({value: 4, source: 'good maneuverability'}));
    // no fly speed, no maneuverability
    apply(trait('Feather', {flyManeuverability: 'perfect'}));
    expect((explainStat(service, 'fly') as any).lines.some((l: any) => /maneuverability/.test(l.source))).toBeFalse();
  });

  it('is a path the validator takes, and the text check asks for', () => {
    expect(validateAdjustments({'speed.climb': 20, 'speed.burrow': 10, flyManeuverability: 'good'})).toEqual([]);
    const problems = mechanicsProblems([new Feature({name: 'Wings', description: 'You have a fly speed of 30 feet (average maneuverability).',
      adjustments: {'skills.fly.value': 2}})]).join(' ');
    expect(problems).toContain('its text gives a fly speed');
    expect(problems).toContain('flyManeuverability');
    expect(mechanicsProblems([new Feature({name: 'Climber', description: 'A climb speed of 20 ft.',
      adjustments: {'speed.climb': {value: 20, mode: 'set'}}})]).join(' ')).not.toContain('climb speed');
  });
});
