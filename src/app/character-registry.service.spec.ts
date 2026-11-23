import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from './apply-character.service';
import { CharacterRegistry } from './character-registry.service';
import { CLASS_PRESETS, classLevelFromPreset } from './rules/class-presets';
import { Character } from './utils/character.class';
import { ls } from './utils/localstorage.util';

// several characters at once: the open sheet's and the others shown, each with its own undo history, and a master's
// companions keeping their copy of it fresh
describe('CharacterRegistry', () => {
  let registry: CharacterRegistry;
  let open: ApplyCharacterService;
  const saved: string[] = [];
  const save = (character: Character): string => {
    ls.setItem('character-' + character.id, character);
    saved.push(character.id);
    return character.id;
  };
  const druid = (): Character => {
    const char = new Character();
    char.name = 'Moss';
    const preset = CLASS_PRESETS.find(p => p.name === 'Druid')!;
    char.classLevels = [1, 2, 3].map(n => ({...classLevelFromPreset(preset, n, n === 1), rolledHp: 5}) as any);
    char.skills = {...char.skills, survival: {...char.skills['survival'], ranks: 3}};
    return char;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    registry = TestBed.inject(CharacterRegistry);
    open = TestBed.inject(ApplyCharacterService);
  });
  afterEach(() => saved.splice(0).forEach(id => ls.removeItem('character-' + id)));

  it('creates a companion linked to its master, with a copy of what it reads from it', () => {
    const masterId = save(druid());
    registry.openCharacter(masterId);
    const id = registry.createCompanion(masterId, 'animal companion', 'Fang')!;
    saved.push(id);
    expect(open.raw().companions).toEqual([id]);
    const fang = registry.serviceFor(id)!;
    expect(fang.raw().name).toBe('Fang');
    expect(fang.raw().master).toEqual(jasmine.objectContaining({masterId, kind: 'animal companion'}));
    expect(fang.raw().master!.copy).toEqual(jasmine.objectContaining({name: 'Moss', level: 3, classes: {Druid: 3}, bab: 2,
      baseSaves: {fort: 3, ref: 1, will: 3}, skillRanks: {survival: 3}}));
    expect(registry.companionsOf(open.raw()).map(s => s.raw().name)).toEqual(['Fang']);
  });

  it('refreshes the companion\'s copy when the master changes, as no step of its undo history', () => {
    const masterId = save(druid());
    registry.openCharacter(masterId);
    const id = registry.createCompanion(masterId, 'familiar', 'Hoot')!;
    saved.push(id);
    const hoot = registry.serviceFor(id)!;
    open.update({skills: {...open.raw().skills, perception: {...open.raw().skills['perception'], ranks: 2}}});
    TestBed.flushEffects();
    expect(hoot.raw().master!.copy!.skillRanks['perception']).toBe(2);
    expect(hoot.history.canUndo()).toBeFalse();
  });

  it('keeps the undo history of each character, going to a companion and back', () => {
    const masterId = save(druid());
    registry.openCharacter(masterId);
    const id = registry.createCompanion(masterId, 'animal companion', 'Fang')!;
    saved.push(id);
    open.labelled('rename', () => open.update({name: 'Moss the Green'}));
    // the companion's hit points changed from its pop-out, while the master is open
    registry.serviceFor(id)!.labelled('hurt', () => registry.serviceFor(id)!.update({damageTaken: 3}));
    registry.openCharacter(id);
    expect(open.raw().id).toBe(id);
    expect(open.history.undoLabel()).toBe('hurt');
    registry.openCharacter(masterId);
    expect(open.raw().name).toBe('Moss the Green');
    expect(open.history.undoLabel()).toBe('rename');
  });
});
