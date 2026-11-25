import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { CLASS_PRESETS, classLevelFromPreset } from '../rules/class-presets';
import { masterCopyOf } from '../rules/companions';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { setAbilityScores, setCharacterDetails, setRace } from './creation';
import { CreationConversation, completeCreationStep, completedBy, creationOpener, getCreationStep } from './creation-script';
import { setCompanion, setCompanionClasses } from '../party/companion-actions';
import { createFeature } from './builders';
import { characterSummary } from './character-reader';

// a familiar created with the AI: its own script (the creature, its master's classes, its details), not a character's
describe('creating a familiar', () => {
  let service: ApplyCharacterService;
  let conversation: CreationConversation;
  const familiar = (): Character => {
    const preset = CLASS_PRESETS.find(p => p.name === 'Wizard')!;
    const master = Object.assign(new Character(), {name: 'Ezren', classLevels: [1, 2, 3].map(n =>
      new ClassLevel({...classLevelFromPreset(preset, n, n === 1), rolledHp: 4}))});
    return Object.assign(new Character(), {name: 'Whiskers', master: {masterId: master.id, kind: 'familiar', copy: masterCopyOf(master, master)}});
  };
  const cat = () => setRace(service, {name: 'Cat', subtype: 'Animal', based_on: 'own knowledge', features: JSON.stringify([
    {name: 'Cat', adjustments: {size: {value: 2, mode: 'set'}, 'speed.land': {value: 30, mode: 'set'}, senses: 'low-light vision, scent'}},
  ])}) as any;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(familiar());
    conversation = {playerTurns: 1, playerMessages: ['a cat']};
  });

  it('opens on the creature, saying whose familiar it is', () => {
    expect(creationOpener(service)).toContain("We're building Whiskers, the familiar of Ezren (level 3).");
    expect(creationOpener(service)).toContain('Which creature is the familiar?');
    const step = getCreationStep(service, conversation) as any;
    expect(step.step).toBe('creature');
    expect(service.raw().creation).toEqual(jasmine.objectContaining({script: 'familiar', step: 'creature'}));
  });

  it('takes a creature\'s own scores and stats, with no language or racial modifier', () => {
    expect(setAbilityScores(service, {scores: '{"str": 3, "dex": 15, "con": 8, "int": 2, "wis": 12, "cha": 7}', method: 'rolled'}).done).toBeDefined();
    expect(cat().done).toContain('race Cat');
  });

  it('goes from the creature to its master\'s classes, its name, and ends', () => {
    getCreationStep(service, conversation);
    const done = String(cat().done);
    const toClasses = completedBy(service, conversation, 'creature', 'set_race', {}, done) as any;
    expect(toClasses.next.step).toBe('grants');
    // the player answers its question
    conversation.playerTurns++;
    conversation.playerMessages!.push('from my wizard levels');
    expect(setCompanionClasses(service, ['wizard']).done).toContain('master class level 3');
    expect(setCompanionClasses(service, ['Bard']).error).toContain('has no Bard levels');
    const toName = completedBy(service, conversation, 'grants', 'set_companion', {}, 'Wizard') as any;
    expect(toName.next.step).toBe('familiar-details');
    setCharacterDetails(service, {name: 'Mr. Whiskers'});
    const end = completeCreationStep(service, conversation, {step: 'familiar-details', decisions: 'Mr. Whiskers'}, true) as any;
    expect(end.done).toContain('Mr. Whiskers is created');
    expect(service.raw().creation).toBeUndefined();
  });
});

// an animal companion created with the AI: its creature with its growth, its master's classes with the class
// feature's offset, its choices
describe('creating an animal companion', () => {
  let service: ApplyCharacterService;
  const conversation: CreationConversation = {playerTurns: 1, playerMessages: ['a wolf']};
  const companionOf = (className: string, levels: number): Character => {
    const preset = CLASS_PRESETS.find(p => p.name === className)!;
    const master = Object.assign(new Character(), {name: 'Harsk', classLevels: Array.from({length: levels}, (_, i) =>
      new ClassLevel({...classLevelFromPreset(preset, i + 1, i === 0), rolledHp: 6}))});
    return Object.assign(new Character(), {name: 'Fang', master: {masterId: master.id, kind: 'animal companion', copy: masterCopyOf(master, master)}});
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('runs its own script, and a mount runs it too', () => {
    service.initializeCharacter(companionOf('Ranger', 7));
    expect((getCreationStep(service, conversation) as any).step).toBe('creature');
    expect(service.raw().creation!.script).toBe('animal companion');
    const mount = companionOf('Paladin', 5);
    mount.master!.kind = 'mount';
    service.initializeCharacter(mount);
    expect((getCreationStep(service, {playerTurns: 1}) as any).guide).toContain('animal companion list');
  });

  it('takes its growth as a trait from its level, and its master\'s classes with the class feature\'s offset', () => {
    service.initializeCharacter(companionOf('Ranger', 7));
    setAbilityScores(service, {scores: '{"str": 13, "dex": 15, "con": 15, "int": 2, "wis": 12, "cha": 6}', method: 'rolled'});
    expect((setRace(service, {name: 'Wolf', subtype: 'Animal', based_on: 'own knowledge', features: JSON.stringify([
      {name: 'Wolf', adjustments: {size: {value: 4, mode: 'set'}, 'speed.land': {value: 50, mode: 'set'}}},
      {name: '7th-level advancement', atLevel: 7, description: 'Large, bite 1d8, Str +2', adjustments: {size: {value: 5, mode: 'set'}, 'abilityScores.str': 2}},
    ])}) as any).done).toBeDefined();
    expect(service.raw().race.features[1].atLevel).toBe(7);
    // a ranger 7's companion is an effective druid 4: not yet Large
    expect(setCompanion(service, {classes: ['Ranger'], levelOffset: -3, increases: ['str']}).done).toContain('its own level 4');
    expect(service.applied().size).toBe(4);
    expect(service.applied().bab).toBe(3);
    expect(setCompanion(service, {increases: ['might']}).error).toContain('increases are abilities');
  });
});

// an eidolon created with the AI: its base form, its summoner and good saves, its evolutions with their costs
describe('creating an eidolon', () => {
  let service: ApplyCharacterService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    const summoner = Object.assign(new Character(), {name: 'Balazar', classLevels: [1, 2, 3, 4, 5].map(n =>
      new ClassLevel({name: 'Summoner', level: n, hitDice: 8, babProgression: 'threeQuarters', goodSaves: ['will'], skillRanks: 2, rolledHp: 5}))});
    service.initializeCharacter(Object.assign(new Character(), {name: 'Crimson',
      master: {masterId: summoner.id, kind: 'eidolon', classes: ['Summoner'], copy: masterCopyOf(summoner, summoner)}}));
  });

  it('runs its own script, from its base form', () => {
    const step = getCreationStep(service, {playerTurns: 1}) as any;
    expect(service.raw().creation!.script).toBe('eidolon');
    expect(step.title).toBe('Base form');
  });

  it('takes its summoner, good saves and evolutions with their costs', () => {
    expect(setCompanion(service, {goodSaves: ['Fortitude', 'will'], unchained: true}).done).toBeDefined();
    expect(service.raw().master).toEqual(jasmine.objectContaining({goodSaves: ['fort', 'will'], unchained: true}));
    const done = createFeature(service, {list: 'race.features', name: 'Improved Damage (Claws)', cost: 1,
      description: 'its claws deal damage one step higher', description_only: 'judged at the table: a damage die step', adjustments: '{}', based_on: 'own knowledge'}) as any;
    expect(done.done).toContain('Improved Damage');
    expect(service.raw().race.features[0].cost).toBe(1);
    expect((characterSummary(service) as any).evolutions).toEqual(jasmine.objectContaining({spent: 1, pool: 4, mostAttacks: 4}));
  });
});
