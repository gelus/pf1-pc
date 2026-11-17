import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { Character } from './character.class';
import { CharacterHistory, MAX_STEPS, MERGE_WITHIN_MS } from './character-history';

describe('CharacterHistory', () => {
  let time: number;
  let history: CharacterHistory;
  const named = (name: string): Character => Object.assign(new Character(), {id: 'same-character', name});

  beforeEach(() => {
    time = 0;
    history = new CharacterHistory(() => time);
    history.reset(named('A'));
  });

  it('undoes to the character as it was before each change, and redoes', () => {
    history.record(named('B'), 'rename');
    time += MERGE_WITHIN_MS;
    history.record(named('C'), 'rename again');
    expect(history.undoLabel()).toBe('rename again');
    expect(history.undo(named('C'))!.name).toBe('B');
    expect(history.undo(named('B'))!.name).toBe('A');
    expect(history.canUndo()).toBeFalse();
    expect(history.undo(named('A'))).toBeUndefined();
    expect(history.redoLabel()).toBe('rename');
    expect(history.redo(named('A'))!.name).toBe('B');
    expect(history.redo(named('B'))!.name).toBe('C');
    expect(history.canRedo()).toBeFalse();
  });

  it('keeps no step for a change that changes nothing', () => {
    expect(history.record(named('A'))).toBeFalse();
    expect(history.canUndo()).toBeFalse();
  });

  it('makes quick unlabelled changes one step, labelled ones and slow ones a step each', () => {
    history.record(named('Ab'));
    time += 100;
    history.record(named('Abc'));
    expect(history.undo(named('Abc'))!.name).toBe('A');

    history.reset(named('A'));
    history.record(named('B'));
    time += MERGE_WITHIN_MS;
    history.record(named('C'));
    expect(history.undo(named('C'))!.name).toBe('B');

    history.reset(named('A'));
    history.record(named('B'), 'one');
    time += 1;
    history.record(named('C'), 'two');
    expect(history.undo(named('C'))!.name).toBe('B');
  });

  it('forgets what was undone once something else changes', () => {
    history.record(named('B'), 'rename');
    history.undo(named('B'));
    history.record(named('Z'), 'other');
    expect(history.canRedo()).toBeFalse();
    expect(history.undo(named('Z'))!.name).toBe('A');
  });

  it('keeps a copy, not the character: changing it in place later does not change the step', () => {
    const char = named('B');
    history.record(char, 'rename');
    time += MERGE_WITHIN_MS;
    char.name = 'C';
    history.record(char, 'rename again');
    expect(history.undo(char)!.name).toBe('B');
  });

  it(`keeps the last ${MAX_STEPS} steps`, () => {
    for (let i = 1; i <= MAX_STEPS + 5; i++) history.record(named(`n${i}`), `step ${i}`);
    let undone = 0;
    let current: Character = named(`n${MAX_STEPS + 5}`);
    for (let next = history.undo(current); next; next = history.undo(current)) { current = next; undone++; }
    expect(undone).toBe(MAX_STEPS);
    expect(current.name).toBe('n5');
  });
});

describe('ApplyCharacterService undo history', () => {
  let service: ApplyCharacterService;

  const character = (): Character => {
    const char = new Character();
    char.name = 'Nairabrab';
    return char;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.ruleModules = [];
    service.initializeCharacter(character());
  });

  it('records what the sheet changes in place and saves with update()', () => {
    service.raw().name = 'Grokk';
    service.update();
    expect(service.history.canUndo()).toBeTrue();
    expect(service.undo()).toBe('the last change');
    expect(service.raw().name).toBe('Nairabrab');
    expect(service.redo()).toBe('the last change');
    expect(service.raw().name).toBe('Grokk');
  });

  it('undoes an action that saves twice as one named step', () => {
    service.labelled('rage', () => {
      service.raw().conditions.push(new Feature({name: 'Raging'}));
      service.update();
      service.update({experience: 100});
    });
    expect(service.history.undoLabel()).toBe('rage');
    service.undo();
    expect(service.raw().conditions.length).toBe(0);
    expect(service.raw().experience).toBe(0);
    expect(service.history.canUndo()).toBeFalse();
  });

  it('names adding and removing a feature', () => {
    service.consumeFeature({feature: new Feature({name: 'Power Attack'}), destination: 'feats'});
    expect(service.history.undoLabel()).toBe('add Power Attack');
    service.removeFeature(service.raw().feats, service.raw().feats[0]);
    expect(service.history.undoLabel()).toBe('remove Power Attack');
    service.undo();
    expect(service.raw().feats.map(f => f.name)).toEqual(['Power Attack']);
  });

  it('does not make an action that changes nothing a step, nor fold its changes into the step before', () => {
    service.update({experience: 50});
    service.labelled('nothing, then something', () => {
      service.update();
      service.update({experience: 75});
    });
    expect(service.history.undoLabel()).toBe('nothing, then something');
    service.undo();
    expect(service.raw().experience).toBe(50);
  });

  it('starts over when another character is opened', () => {
    service.update({experience: 10});
    service.initializeCharacter(character());
    expect(service.history.canUndo()).toBeFalse();
    expect(service.undo()).toBeUndefined();
  });
});
