import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { Character } from '../utils/character.class';
import { validateAdjustments } from './adjustment-schema';
import { parseSenses, sensesText } from './senses';
import { characterSummary } from '../ai/character-reader';

// senses as data: each with its range, the longest of a sense counting, a text of them read into them
describe('senses', () => {
  let service: ApplyCharacterService;
  const apply = (char: Character) => { service.initializeCharacter(char); return service.applied(); };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('reads a text of senses and writes them back', () => {
    expect(parseSenses('low-light vision, darkvision 60 ft., scent; Tremorsense 30 feet')).toEqual(
      {'low-light vision': 0, darkvision: 60, scent: 0, tremorsense: 30});
    expect(sensesText({darkvision: 60, 'low-light vision': 0})).toBe('darkvision 60 ft., low-light vision');
  });

  it('keeps the longest range of a sense, never the sum, from paths and from text', () => {
    const char = new Character();
    char.race.features = [new Feature({name: 'Darkvision', adjustments: {senses: 'darkvision 60 ft.'}})];
    char.feats = [new Feature({name: 'Goggles of Night', adjustments: {'senses.darkvision': 120, 'senses.low-light vision': 0} as any})];
    const applied = apply(char);
    expect(applied.senses).toEqual({darkvision: 120, 'low-light vision': 0});
    expect((service.adjustmentsMap['senses.darkvision'] || []).map(e => e.origin)).toEqual(['Darkvision', 'Goggles of Night']);
    expect((characterSummary(service) as any).senses).toBe('darkvision 120 ft., low-light vision');
  });

  it('loads a character saved with its senses as text', () => {
    const old = Object.assign(new Character(), {senses: 'low-light vision'}) as any;
    service.initializeCharacter(old);
    expect(service.raw().senses).toEqual({'low-light vision': 0});
  });

  it('is a path the validator takes, and tells how to write a sense', () => {
    expect(validateAdjustments({'senses.darkvision': 60, 'senses.scent': 0, senses: 'blindsense 30 ft.'})).toEqual([]);
    expect(validateAdjustments({darkvision: 60}).map(p => p.message).join(' ')).toContain('"senses.darkvision": 60');
  });
});
