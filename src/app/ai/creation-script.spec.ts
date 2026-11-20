import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { AI_PROVIDER, AiChatService } from './ai-chat.service';
import { AiTurn } from './ai-provider';
import { setAbilityScores, setCharacterDetails, setRace } from './creation';
import {
  CREATION_STEPS, CreationConversation, completeCreationStep, completedBy, suggestionLookup, creationGate, creationOpener, getCreationStep, pricePointBuy,
} from './creation-script';
import { addClassLevel } from './level-up';
import { createFeature } from './builders';
import { Item } from '../utils/item.class';

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
    expect(creationGate(service.raw().creation, 'set_ability_scores', conversation)).toContain('has not answered "Ability scores"');
    answer();
    expect(creationGate(service.raw().creation, 'set_ability_scores', conversation)).toBeUndefined();
    // a tool of a later step is refused, one no step owns (a lookup, a play action) is not
    expect(creationGate(service.raw().creation, 'add_class_level', conversation)).toContain('add_class_level is for "Class"');
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

  it('skips the starting spells of a character that casts none, and ends when the review is reached', () => {
    service.update({creation: {step: 'equipment', decisions: {}}});
    addClassLevel(service, {class_name: 'Fighter', features: 'none'});
    getCreationStep(service, conversation);
    answer();
    expect((completeCreationStep(service, conversation, {step: 'equipment', decisions: 'a kit'}) as any).next.step).toBe('details');
    setCharacterDetails(service, {name: 'Thora'});
    answer();
    // the review needs no completing, which the AI forgot: the character is created once it is shown
    const done = completeCreationStep(service, conversation, {step: 'details', decisions: 'Thora'}) as any;
    expect(done.done).toBe('Description and personality done: the character is created');
    expect(done.now).toContain('get_character_summary');
    expect(service.raw().creation).toBeUndefined();
    expect(completeCreationStep(service, conversation, {step: 'review', decisions: 'all good'})).toEqual({note: 'the creation is over already: nothing to complete'});
  });

  it('takes an answer the player gave before its step was asked, when the AI quotes it', () => {
    conversation.playerMessages = ['A dwarf fighter, grumpy. Name him Borin Ironbrow, lawful neutral',
      'str 16, dex 12, con 16, int 10, wis 12, cha 7', 'we rolled 16 12 16 10 12 7'];
    getCreationStep(service, conversation);
    completeCreationStep(service, conversation, {step: 'concept', decisions: 'a dwarf fighter'});
    const gate = (tool: string, quote?: string) => creationGate(service.raw().creation, tool, conversation, quote ? {player_answer: quote} : {});
    expect(gate('set_ability_scores')).toContain('player_answer');
    // a step not reached yet, answered in the player's words
    expect(gate('set_race', 'A dwarf')).toBeUndefined();
    expect(gate('set_character_details', 'Borin Ironbrow, Lawful Neutral')).toBeUndefined();
    // words the player never wrote are not an answer
    expect(gate('set_race', 'an elf wizard')).toContain('is for "Race"');
    // the player's words, but not an answer to the step: the concept quoted for every step
    expect(gate('set_race', 'grumpy')).toContain('is for "Race"');
    expect(completeCreationStep(service, conversation, {step: 'ability_scores', decisions: 'x', player_answer: '20 point buy'}).error)
      .toContain('has not answered');
    // which scores were rolled is not where each goes
    expect(completeCreationStep(service, conversation, {step: 'ability_scores', decisions: 'x', player_answer: 'we rolled 16 12 16 10 12 7'}).error)
      .toContain('has not answered');
    expect(completeCreationStep(service, conversation, {step: 'ability_scores', decisions: 'x', player_answer: 'str 16, dex 12, con 16, int 10, wis 12, cha 7'}).error)
      .toBe('"Ability scores" is not done: set the ability scores');
    // feats and gear are chosen from the suggestions, never early; edits are the player's corrections
    service.update({creation: {step: 'equipment', decisions: {}}});
    expect(gate('create_item', 'A dwarf fighter')).toContain('has not answered "Equipment"');
    expect(gate('remove_feature')).toBeUndefined();
    // the latest message answers the step it has the shape of, without a quote
    conversation.playerMessages!.push('Seraphine Vale, chaotic good, no deity');
    service.update({creation: {step: 'details', decisions: {}}});
    expect(gate('set_character_details')).toBeUndefined();
  });

  it('asks how the table makes ability scores before going past the concept', () => {
    conversation.playerMessages = ['a dwarf fighter'];
    getCreationStep(service, conversation);
    answer();
    expect(completeCreationStep(service, conversation, {step: 'concept', decisions: 'a dwarf fighter, 15 point buy'}).error)
      .toContain('how the table makes ability scores');
    conversation.playerMessages.push('we roll, no traits');
    expect(completeCreationStep(service, conversation, {step: 'concept', decisions: 'a dwarf fighter, rolled'}).done).toBe('The concept done');
  });

  it('completes a step its one change finished, and says so when the AI completes it again', () => {
    service.update({creation: {step: 'ability-scores', decisions: {concept: 'a monk, 20 point buy'}}});
    getCreationStep(service, conversation);
    answer();
    const args = {scores: '{"str": 16, "dex": 14, "con": 12, "int": 10, "wis": 15, "cha": 7}', method: 'point buy 20'};
    const done = String(setAbilityScores(service, args).done);
    const completed = completedBy(service, conversation, 'ability-scores', 'set_ability_scores', args, done) as any;
    expect(completed.done).toBe('Ability scores done');
    expect(completed.next.step).toBe('race');
    expect(service.raw().creation!.decisions['ability-scores']).toBe(done);
    expect(completeCreationStep(service, conversation, {step: 'ability-scores', decisions: 'x'}))
      .toEqual({note: '"Ability scores" is done already: go on with "Race"'});
    // a change of a step that goes on (a feat of several) completes nothing
    expect(completedBy(service, conversation, 'race', 'set_ability_scores', args, done)).toBeUndefined();
  });

  it('goes past the traits when the concept says the table uses none', () => {
    service.update({creation: {step: 'feats', decisions: {concept: 'a sorcerer, rolled stats, no traits at our table'}}});
    addClassLevel(service, {class_name: 'Fighter', features: 'none'});
    getCreationStep(service, conversation);
    answer();
    createFeature(service, {list: 'feats', name: 'Toughness', adjustments: '{"hp": "max(3, {level})"}', based_on: 'own knowledge'});
    expect((completeCreationStep(service, conversation, {step: 'feats', decisions: 'Toughness'}) as any).next.step).toBe('equipment');
  });

  it('holds the favored class bonus back until the player chose it', () => {
    conversation.playerMessages = ['a human slayer, 15 point buy', 'just Common'];
    service.update({creation: {step: 'class', decisions: {}}});
    getCreationStep(service, conversation);
    answer();
    expect(creationGate(service.raw().creation, 'add_class_level', conversation, {class_name: 'Slayer', favored_class_bonus: 'skill'}))
      .toContain('+1 hit point or +1 skill rank');
    conversation.playerMessages.push('+1 skill rank');
    expect(creationGate(service.raw().creation, 'add_class_level', conversation, {class_name: 'Slayer', favored_class_bonus: 'skill'})).toBeUndefined();
  });

  it('suggests feats and traits without looking them up, and looks up the ones the player picks', () => {
    conversation.playerMessages = ['a human archer'];
    service.update({creation: {step: 'feats', decisions: {}}});
    getCreationStep(service, conversation);
    const lookup = (name: string) => suggestionLookup(service.raw().creation, conversation, {name, kind: 'feat'});
    expect((lookup('Point-Blank Shot') as any).note).toContain('suggest feats from what you know');
    conversation.playerMessages.push('Point-Blank Shot please');
    expect(lookup('Point-Blank Shot')).toBeUndefined();
    // a weapon is looked up whenever
    expect(suggestionLookup(service.raw().creation, conversation, {name: 'Longbow', kind: 'weapon'})).toBeUndefined();
  });

  it('does not take a message answering another step as the answer to the one asked', () => {
    conversation.playerMessages = ['a dwarf slayer'];
    service.update({creation: {step: 'traits', decisions: {}}});
    getCreationStep(service, conversation);
    answer();
    conversation.playerMessages.push('Thrain Giantsbane, lawful good, worships Torag. 80 years');
    expect(creationGate(service.raw().creation, 'create_feature', conversation)).toContain('has not answered "Traits"');
    // the details it does answer
    expect(creationGate(service.raw().creation, 'set_character_details', conversation)).toBeUndefined();
    conversation.playerMessages.push('Sounds good, those two');
    expect(creationGate(service.raw().creation, 'create_feature', conversation)).toBeUndefined();
  });

  it('says the step was just given instead of giving it again', () => {
    getCreationStep(service, conversation);
    completeCreationStep(service, conversation, {step: 'concept', decisions: 'a monk'});
    expect((getCreationStep(service, conversation) as any).note).toContain('given in this turn already');
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
    expect(creationOpener(service)).toBe('Let\'s go on creating the character: we\'re at Skills.\n\n'
      + '- Where do your skill ranks go? (suggest class skills that fit the concept, with how many ranks there are)');
  });

  it('does not price rolled scores', () => {
    service.update({creation: {step: 'ability-scores', decisions: {concept: 'a sorcerer, rolled stats 17 15 14 12 10 8'}}});
    expect((pricePointBuy({scores: '{"str": 8}'}, service) as any).error).toContain('rolls its ability scores');
    expect(setAbilityScores(service, {scores: '{"str": 8, "dex": 15, "con": 14, "int": 10, "wis": 12, "cha": 17}', method: 'point buy 25'}).error)
      .toContain('method "rolled"');
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

  it('holds a flexible race\'s +2 back until the player picked the ability', () => {
    conversation.playerMessages = ['a half-orc barbarian, 15 point buy'];
    service.update({creation: {step: 'race', decisions: {}}});
    getCreationStep(service, conversation);
    answer();
    conversation.playerMessages.push('half-orc it is');
    expect(creationGate(service.raw().creation, 'set_race', conversation, {name: 'Half-Orc'})).toContain('+2');
    // an elf has no choice to make
    expect(creationGate(service.raw().creation, 'set_race', conversation, {name: 'Elf'})).toBeUndefined();
    answer();
    conversation.playerMessages.push('Strength');
    expect(creationGate(service.raw().creation, 'set_race', conversation, {name: 'Half-Orc'})).toBeUndefined();
  });

  it('takes the race the player named in an earlier message once the +2 is said', () => {
    conversation.playerMessages = ['a human cleric, 20 point buy'];
    service.update({creation: {step: 'race', decisions: {}}});
    getCreationStep(service, conversation);
    conversation.playerMessages.push('That spread is fine. Put the +2 in Wisdom.');
    expect(creationGate(service.raw().creation, 'set_race', conversation, {name: 'Human'})).toBeUndefined();
  });

  it('takes a request for suggestions as no pick yet', () => {
    conversation.playerMessages = ['a human cleric'];
    service.update({creation: {step: 'traits', decisions: {}}});
    getCreationStep(service, conversation);
    answer();
    conversation.playerMessages.push('Suggest two traits for her');
    expect(creationGate(service.raw().creation, 'create_feature', conversation)).toContain('asked for suggestions');
    answer();
    conversation.playerMessages.push('Sounds good, go with those');
    expect(creationGate(service.raw().creation, 'create_feature', conversation)).toBeUndefined();
  });

  it('completes the step the AI left when the player goes on to a later one, once it has something', () => {
    service.update({creation: {step: 'traits', decisions: {concept: 'a fighter'}}});
    getCreationStep(service, conversation);
    answer();
    const details = {name: 'Amara'};
    setCharacterDetails(service, details);
    // no traits taken: the step was not done, it stays
    expect(completedBy(service, conversation, 'traits', 'set_character_details', details, 'named Amara')).toBeUndefined();
    expect(step()).toBe('traits');
    service.update({creation: {step: 'equipment', decisions: {concept: 'a fighter'}}, inventory: [Object.assign(new Item(), {name: 'Rope'})]});
    const gone = completedBy(service, conversation, 'equipment', 'set_character_details', details, 'named Amara') as any;
    expect(gone.done).toContain('Equipment done');
    expect(service.raw().creation).toBeUndefined();
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
    expect(refused.results[0].result.error).toContain('has not answered "Ability scores"');
    expect(character.raw().abilityScores.str).toBe(10);
    await chat.send('looks good');
    expect(character.raw().abilityScores.str).toBe(16);
  });
});
