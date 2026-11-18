import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { AI_PROVIDER, AiChatService } from './ai-chat.service';
import { AiTurn } from './ai-provider';
import { setAbilityScores, setCharacterDetails, setRace } from './creation';
import {
  CREATION_STEPS, CreationConversation, completeCreationStep, creationGate, creationOpener, getCreationStep, pricePointBuy,
} from './creation-script';
import { addClassLevel } from './level-up';

describe('creation script', () => {
  let service: ApplyCharacterService;
  let conversation: CreationConversation;
  const step = () => service.raw().creation?.step;
  const answer = () => { conversation.playerTurns++; };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(new Character());
    conversation = {playerTurns: 1};
  });

  it('follows the Core Rulebook\'s steps', () => {
    expect(CREATION_STEPS.map(s => s.id)).toEqual(
      ['concept', 'ability-scores', 'race', 'class', 'skills', 'feats', 'traits', 'equipment', 'spells', 'details', 'review']);
  });

  it('starts at the concept with its questions, which the first message may answer', () => {
    const first = getCreationStep(service, conversation) as any;
    expect(first.step).toBe('concept');
    expect(first.ask.length).toBe(3);
    expect(completeCreationStep(service, conversation, {step: 'concept', decisions: ''}).error).toContain('decisions');
    const done = completeCreationStep(service, conversation, {step: 'concept', decisions: 'a human monk, 20 point buy'}) as any;
    expect(done.done).toBe('The concept done');
    expect(done.next.step).toBe('ability-scores');
    expect(done.next.decidedSoFar).toEqual({concept: 'a human monk, 20 point buy'});
  });

  it('holds a step\'s changes back until the player answered its questions', () => {
    getCreationStep(service, conversation);
    completeCreationStep(service, conversation, {step: 'concept', decisions: 'a monk'});
    // the ability scores were just asked about: the AI may not set them in the same breath
    expect(creationGate(service.raw().creation, 'set_ability_scores', conversation)).toContain('wait for their answer');
    answer();
    expect(creationGate(service.raw().creation, 'set_ability_scores', conversation)).toBeUndefined();
    // a tool of a later step is refused, one no step owns (a lookup, a play action) is not
    expect(creationGate(service.raw().creation, 'add_class_level', conversation)).toContain('belongs to "Class"');
    expect(creationGate(service.raw().creation, 'take_damage', conversation)).toBeUndefined();
    expect(creationGate(undefined, 'add_class_level', conversation)).toBeUndefined();
  });

  it('completes a step only once it is done, and goes on to the next', () => {
    getCreationStep(service, conversation);
    completeCreationStep(service, conversation, {step: 'concept', decisions: 'a monk'});
    answer();
    expect(completeCreationStep(service, conversation, {step: 'ability-scores', decisions: 'str high'}).error)
      .toBe('"Ability scores" is not done: set the ability scores');
    setAbilityScores(service, {scores: '{"str": 16, "dex": 14, "con": 12, "int": 10, "wis": 15, "cha": 7}', method: 'point buy 20'});
    expect(completeCreationStep(service, conversation, {step: 'race', decisions: 'x'}).error).toContain('not race');
    expect((completeCreationStep(service, conversation, {step: 'ability-scores', decisions: 'str 16, wis 15'}) as any).next.step).toBe('race');
    expect(step()).toBe('race');
    service.undo();
    expect(step()).toBe('ability-scores');
  });

  it('skips the starting spells of a character that casts none, and ends after the review', () => {
    service.update({creation: {step: 'equipment', decisions: {}}});
    addClassLevel(service, {class_name: 'Fighter', features: '[]'});
    getCreationStep(service, conversation);
    answer();
    expect((completeCreationStep(service, conversation, {step: 'equipment', decisions: 'a kit'}) as any).next.step).toBe('details');
    service.update({creation: {step: 'review', decisions: {}}});
    getCreationStep(service, conversation);
    answer();
    expect(completeCreationStep(service, conversation, {step: 'review', decisions: 'all good'}).done).toBe('Review done: the character is created');
    expect(service.raw().creation).toBeUndefined();
  });

  it('goes past the steps the sheet already has, filling in their decisions from it', () => {
    setAbilityScores(service, {scores: '{"str": 16, "dex": 14, "con": 12, "int": 10, "wis": 15, "cha": 7}', method: 'point buy 20'});
    setRace(service, {name: 'Dwarf', based_on: 'own knowledge', features: '[{"name": "Dwarf racial stats", "adjustments": {"abilityScores.con": 2}}]'});
    setCharacterDetails(service, {name: 'Thora'});
    expect(creationOpener(service)).toBe('What kind of character are we building?\n\nAlready on the sheet, I\'ll go past these:\n'
      + '- Ability scores: str 16, dex 14, con 12, int 10, wis 15, cha 7\n- Race: Dwarf (Dwarf racial stats)\n'
      + '- Description and personality: Thora, N');
    getCreationStep(service, conversation);
    const done = completeCreationStep(service, conversation, {step: 'concept', decisions: 'a dwarf monk'}) as any;
    expect(done.done).toBe('The concept done, Ability scores, Race already on the sheet');
    expect(done.next.step).toBe('class');
    expect(done.next.decidedSoFar.race).toBe('already on the sheet: Dwarf (Dwarf racial stats)');
  });

  it('opens a creation left midway where it was', () => {
    service.update({creation: {step: 'skills', decisions: {}}});
    expect(creationOpener(service)).toBe('Let\'s go on creating the character: we\'re at Skills. Ready?');
  });

  it('prices a point buy', () => {
    expect(pricePointBuy({scores: '{"str": 18, "dex": 14, "con": 12, "int": 10, "wis": 14, "cha": 7}'}))
      .toEqual(jasmine.objectContaining({total: 17 + 5 + 2 + 0 + 5 - 4}));
    expect((pricePointBuy({scores: '{"str": 20}'}) as any).error).toContain('between 7 and 18');
    const priced = pricePointBuy({scores: '{"str": 16, "dex": 14, "con": 12, "int": 10, "wis": 14, "cha": 7}', budget: 20}) as any;
    expect([priced.total, priced.left, priced.fits]).toEqual([18, 2, false]);
    expect(priced.nextStep.str).toEqual({up: 3, down: 3});
  });

  it('keeps when a step was first asked, so reading it again does not undo the player\'s answer', () => {
    getCreationStep(service, conversation);
    completeCreationStep(service, conversation, {step: 'concept', decisions: 'a monk'});
    answer();
    getCreationStep(service, conversation);
    expect(creationGate(service.raw().creation, 'set_ability_scores', conversation)).toBeUndefined();
  });
});

describe('creation script in the chat', () => {
  it('refuses the AI a change it makes in the same turn it was given the step\'s questions', async () => {
    const turns: AiTurn[] = [
      {text: '', toolCalls: [{name: 'get_creation_step', args: {}}]},
      {text: '', toolCalls: [{name: 'complete_creation_step', args: {step: 'concept', decisions: 'a monk, 20 point buy'}}]},
      {text: '', toolCalls: [{name: 'set_ability_scores', args: {scores: '{"str": 16, "dex": 14, "con": 12, "int": 10, "wis": 15, "cha": 7}', method: 'point buy 20'}}]},
      {text: 'Here is a spread, does it look right?', toolCalls: []},
      {text: '', toolCalls: [{name: 'set_ability_scores', args: {scores: '{"str": 16, "dex": 14, "con": 12, "int": 10, "wis": 15, "cha": 7}', method: 'point buy 20'}}]},
      {text: 'Set.', toolCalls: []},
    ];
    const sent: any[] = [];
    TestBed.configureTestingModule({providers: [{provide: AI_PROVIDER, useValue: () => ({
      name: 'fake', startSession: () => ({send: async (input: any) => { sent.push(input); return turns.shift()!; }}),
    })}]});
    const character = TestBed.inject(ApplyCharacterService);
    character.initializeCharacter(new Character());
    const chat = TestBed.inject(AiChatService);
    await chat.send('a human monk, 20 point buy, dump cha, max str');
    const refused = sent.find(input => input.kind === 'toolResults' && input.results[0].call.name === 'set_ability_scores');
    expect(refused.results[0].result.error).toContain('wait for their answer');
    expect(character.raw().abilityScores.str).toBe(10);
    await chat.send('looks good');
    expect(character.raw().abilityScores.str).toBe(16);
  });
});
