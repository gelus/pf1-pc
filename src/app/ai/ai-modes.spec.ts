import {TestBed} from '@angular/core/testing';
import {ApplyCharacterService} from '../apply-character.service';
import {Character} from '../utils/character.class';
import {ClassLevel} from '../utils/classlevel.class';
import {AI_PROVIDER, AiChatService, systemPromptFor} from './ai-chat.service';
import {AiProvider, AiSessionOptions} from './ai-provider';
import {CREATION_ONLY_TOOLS, PLAY_ONLY_TOOLS, aiModeOf, aiTools, aiToolsFor} from './ai-tools';

// every request sends the tools and instructions it offers: a character being created gets the creation's, one
// being played the play's, and a conversation going from one to the other changes them
describe('AI modes', () => {
  const names = (tools: {name: string}[]) => tools.map(t => t.name);

  it('creates a character with no class levels, or with the creation under way, and plays the others', () => {
    expect(aiModeOf({classLevels: []})).toBe('creation');
    expect(aiModeOf({classLevels: [{}], creation: {step: 'skills'}})).toBe('creation');
    expect(aiModeOf({classLevels: [{}]})).toBe('play');
  });

  it('offers the creation tools while creating and the play actions while playing, the rest in both', () => {
    const creation = names(aiToolsFor('creation'));
    const play = names(aiToolsFor('play'));
    for (const tool of PLAY_ONLY_TOOLS) expect(creation).not.toContain(tool);
    for (const tool of CREATION_ONLY_TOOLS) expect(play).not.toContain(tool);
    expect(play).toContain('take_damage');
    expect(creation).toContain('get_creation_step');
    for (const both of ['get_character_summary', 'look_up_rules', 'create_feature', 'create_item', 'edit_feature',
      'undo_last_change', 'add_class_level', 'set_skill_ranks', 'set_character_details']) {
      expect(creation).toContain(both);
      expect(play).toContain(both);
    }
    // every tool is offered in one mode at least
    expect(names(aiTools).filter(t => !creation.includes(t) && !play.includes(t))).toEqual([]);
  });

  it('tells the AI what the mode needs, the core in both', () => {
    const creation = systemPromptFor('creation');
    const play = systemPromptFor('play');
    for (const prompt of [creation, play]) expect(prompt).toContain('Pathfinder 1st edition');
    expect(creation).toContain('get_creation_step');
    expect(creation).not.toContain('During play');
    expect(play).toContain('During play');
    expect(play).toContain('get_level_up_step');
    expect(play).not.toContain('get_creation_step');
  });

  describe('in the chat', () => {
    let sessions: AiSessionOptions[];
    let updates: Pick<AiSessionOptions, 'system' | 'tools'>[];
    let character: ApplyCharacterService;
    let chat: AiChatService;

    const setUp = (canUpdate: boolean) => {
      sessions = [];
      updates = [];
      const provider: AiProvider = {
        name: 'fake',
        startSession: options => {
          sessions.push(options);
          return {
            send: async () => ({text: 'ok', toolCalls: []}),
            ...(canUpdate ? {update: (changes: Pick<AiSessionOptions, 'system' | 'tools'>) => { updates.push(changes); }} : {}),
          };
        },
      };
      TestBed.configureTestingModule({providers: [{provide: AI_PROVIDER, useValue: () => provider}]});
      character = TestBed.inject(ApplyCharacterService);
      character.initializeCharacter(new Character());
      chat = TestBed.inject(AiChatService);
    };
    const levelUp = () => character.update({classLevels: [new ClassLevel({name: 'Fighter', hitDice: 10})]});

    it('starts a creation with its tools, and changes the session\'s once the character is created', async () => {
      setUp(true);
      await chat.send('make me a fighter');
      expect(names(sessions[0].tools)).toContain('get_creation_step');
      expect(names(sessions[0].tools)).not.toContain('take_damage');
      levelUp();
      await chat.send('I take 5 damage');
      expect(sessions.length).toBe(1);
      expect(names(updates[0].tools)).toContain('take_damage');
      expect(updates[0].system).toContain('During play');
      // the mode is the same: nothing changes
      await chat.send('and 3 more');
      expect(updates.length).toBe(1);
    });

    it('starts a session that can not change its tools again, from what was said', async () => {
      setUp(false);
      await chat.send('make me a fighter');
      levelUp();
      await chat.send('I take 5 damage');
      expect(sessions.length).toBe(2);
      expect(names(sessions[1].tools)).toContain('take_damage');
      expect(sessions[1].history).toEqual([{role: 'player', text: 'make me a fighter'}, {role: 'ai', text: 'ok'}]);
    });
  });
});
