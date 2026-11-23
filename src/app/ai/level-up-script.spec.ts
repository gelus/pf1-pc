import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import example from '../example-character.json';
import { checkLeveledCharacter } from './character-check';
import { CreationConversation, completeCreationStep, completedBy, creationGate, getLevelUpStep } from './creation-script';
import { LEVEL_UP_STEPS } from './level-up-script';
import { addClassLevel, setSkillRanks } from './level-up';
import { aiToolsFor } from './ai-tools';

// leveling the example barbarian (level 1, two skill ranks a level) up with the AI, step by step
describe('level up script', () => {
  let service: ApplyCharacterService;
  let conversation: CreationConversation;
  const answer = (said: string) => {
    conversation.playerTurns++;
    (conversation.playerMessages ??= []).push(said);
  };
  const progress = () => service.raw().levelUp;
  const barbarian2 = () => addClassLevel(service, {
    class_name: 'Barbarian', rolled_hp: 9, based_on: 'player description',
    features: '[{"name": "Uncanny Dodge", "gained_at": 2, "description": "not caught flat-footed", "adjustments": {"defensiveAbilities": {"name": "Uncanny Dodge"}}}]',
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(JSON.parse(JSON.stringify(example)));
    conversation = {playerTurns: 1, playerMessages: ['level me up']};
  });

  it('has the steps of advancing a character, offered in play only', () => {
    expect(LEVEL_UP_STEPS.map(s => s.id)).toEqual(['level-class', 'level-ability', 'level-skills', 'level-feats', 'level-spells', 'level-review']);
    expect(aiToolsFor('play').map(t => t.name)).toContain('get_level_up_step');
    expect(aiToolsFor('creation').map(t => t.name)).not.toContain('get_level_up_step');
  });

  it('starts at the class level, from the level the character is at', () => {
    const first = getLevelUpStep(service, conversation) as any;
    expect(first.step).toBe('level-class');
    expect(first.level).toBe('1 -> 2');
    expect(progress()).toEqual(jasmine.objectContaining({script: 'level-up', step: 'level-class', fromLevel: 1}));
    // a character not yet created is created first
    service.update({levelUp: undefined, creation: {step: 'race', decisions: {}}});
    expect((getLevelUpStep(service, conversation) as any).error).toContain('being created');
  });

  it('holds the level back until the player answered, and adds one level only', () => {
    getLevelUpStep(service, conversation);
    expect(creationGate(progress(), 'add_class_level', conversation, {}, service)).toContain('has not answered "Class level"');
    answer('barbarian again, I rolled a 9');
    expect(creationGate(progress(), 'add_class_level', conversation, {}, service)).toBeUndefined();
    // a later step's tool waits for its step
    expect(creationGate(progress(), 'create_feature', conversation, {}, service)).toContain('create_feature is for "Feat"');
    expect(completeCreationStep(service, conversation, {step: 'level-class', decisions: 'barbarian'}).error).toContain('add the class level');
    expect(barbarian2().done).toContain('Barbarian 2');
    expect(creationGate(progress(), 'add_class_level', conversation, {}, service)).toContain('added its level already');
  });

  it('goes past the steps a level does not need, and ends once the app\'s check passes', () => {
    getLevelUpStep(service, conversation);
    answer('barbarian, rolled a 9');
    const done = String(barbarian2().done);
    // the class level completes its step: a 2nd level gives no ability increase and no feat
    const completed = completedBy(service, conversation, 'level-class', 'add_class_level', {}, done) as any;
    expect(completed.next.step).toBe('level-skills');
    expect(completed.next.appRequires.join(' ')).toContain('skill rank');
    answer('put them in climb and acrobatics');
    // its ranks are left: the step holds
    expect(completeCreationStep(service, conversation, {step: 'level-skills', decisions: 'climb'}).error).toContain('skill ranks are left');
    expect(setSkillRanks(service, {ranks: '{"climb": 1, "acrobatics": 2}'}).done).toBeDefined();
    const end = completeCreationStep(service, conversation, {step: 'level-skills', decisions: 'climb and acrobatics'}) as any;
    expect(end.done).toContain('the character is level 2');
    expect(end.now).toContain('get_character_summary');
    expect(progress()).toBeUndefined();
  });

  it('tells what was wrong before the level up rather than holding it open', () => {
    // a class level without its hit die roll, from before the level up
    const levels = service.raw().classLevels;
    service.update({classLevels: [...levels, {...levels[0], level: 2, rolledHp: 0, features: []}]});
    const known = checkLeveledCharacter(service).errors;
    expect(known.join(' ')).toContain('Barbarian 2 has no hit die roll');
    const check = checkLeveledCharacter(service, known);
    expect(check.errors).toEqual([]);
    expect(check.warnings.join(' ')).toContain('Barbarian 2 has no hit die roll');
  });
});
