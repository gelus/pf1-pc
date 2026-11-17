import {TestBed} from '@angular/core/testing';
import {ApplyCharacterService} from '../apply-character.service';
import {Character} from '../utils/character.class';
import {AI_PROVIDER, AiChatService, maxToolRounds} from './ai-chat.service';
import {AiError, AiInput, AiProvider, AiSessionOptions, AiTurn} from './ai-provider';

// an AI that answers with the turns it is given, in order, and keeps what it was sent
class FakeProvider implements AiProvider {
  name = 'fake';
  sent: AiInput[] = [];
  sessions: AiSessionOptions[] = [];
  constructor(public turns: (AiTurn | Error)[]) {}
  startSession(options: AiSessionOptions) {
    this.sessions.push(options);
    return {
      send: async (input: AiInput): Promise<AiTurn> => {
        this.sent.push(input);
        const turn = this.turns.shift() ?? {text: 'done', toolCalls: []};
        if (turn instanceof Error) throw turn;
        return turn;
      },
    };
  }
}

describe('AiChatService', () => {
  let provider: FakeProvider | null;
  let chat: AiChatService;
  let character: ApplyCharacterService;

  const setUp = (turns: (AiTurn | Error)[] | null) => {
    provider = turns ? new FakeProvider(turns) : null;
    TestBed.configureTestingModule({providers: [{provide: AI_PROVIDER, useValue: () => provider}]});
    character = TestBed.inject(ApplyCharacterService);
    const char = new Character();
    char.name = 'Seoni';
    char.abilityScores.dex = 14;
    character.initializeCharacter(char);
    chat = TestBed.inject(AiChatService);
  };

  it('sends what the player asks and shows the answer', async () => {
    setUp([{text: 'Hello Seoni.', toolCalls: []}]);
    await chat.send('  hi  ');
    expect(provider!.sent).toEqual([{kind: 'text', text: 'hi'}]);
    expect(chat.messages()).toEqual([{role: 'player', text: 'hi'}, {role: 'ai', text: 'Hello Seoni.'}]);
    expect(chat.busy()).toBeFalse();
  });

  it('runs the tools the AI asks for against the character and sends their results back', async () => {
    setUp([
      {text: '', toolCalls: [{id: '1', name: 'explain_stat', args: {stat: 'ac'}}, {name: 'get_character_summary', args: {}}]},
      {text: 'Your AC is 12: 10 base and +2 from Dex.', toolCalls: []},
    ]);
    await chat.send('why is my ac 12?');
    const results = provider!.sent[1] as Extract<AiInput, {kind: 'toolResults'}>;
    expect(results.kind).toBe('toolResults');
    expect(results.results.map(r => r.call.name)).toEqual(['explain_stat', 'get_character_summary']);
    expect((results.results[0].result as any).total).toBe(12);
    expect((results.results[1].result as any).name).toBe('Seoni');
    expect(chat.messages().map(m => m.role)).toEqual(['player', 'tool', 'tool', 'ai']);
    expect(chat.messages()[1].text).toBe('looking up ac');
  });

  it('gives the AI the system prompt and the tools when the conversation starts, once', async () => {
    setUp([{text: 'a', toolCalls: []}, {text: 'b', toolCalls: []}]);
    await chat.send('one');
    await chat.send('two');
    expect(provider!.sessions.length).toBe(1);
    expect(provider!.sessions[0].system).toContain('Pathfinder 1st edition');
    expect(provider!.sessions[0].tools.map(t => t.name)).toContain('explain_stat');
  });

  it('gives up on an answer that keeps calling tools', async () => {
    const lookup: AiTurn = {text: '', toolCalls: [{name: 'get_character_summary', args: {}}]};
    setUp(Array.from({length: maxToolRounds + 5}, () => lookup));
    await chat.send('loop');
    expect(provider!.sent.length).toBe(maxToolRounds + 1);
    expect(chat.messages().at(-1)).toEqual({role: 'error', text: jasmine.stringMatching(/kept looking things up/) as any});
  });

  it('shows what went wrong and starts a new session with the next message', async () => {
    setUp([new AiError('the free quota of the AI is used up for now, try again later'), {text: 'back', toolCalls: []}]);
    await chat.send('one');
    expect(chat.messages().at(-1)).toEqual({role: 'error', text: 'the free quota of the AI is used up for now, try again later'});
    await chat.send('two');
    expect(provider!.sessions.length).toBe(2);
    expect(chat.messages().at(-1)).toEqual({role: 'ai', text: 'back'});
  });

  it('says the AI is not set up when there is no provider', async () => {
    setUp(null);
    expect(chat.available()).toBeFalse();
    await chat.send('hello?');
    expect(chat.messages().at(-1)!.role).toBe('error');
    expect(chat.messages().at(-1)!.text).toContain('ai-config.ts');
  });

  it('starts over for another character', async () => {
    setUp([{text: 'a', toolCalls: []}, {text: 'b', toolCalls: []}]);
    await chat.send('one');
    const other = new Character();
    other.name = 'Kyra';
    character.initializeCharacter(other);
    await chat.send('two');
    expect(provider!.sessions.length).toBe(2);
    expect(chat.messages()).toEqual([{role: 'player', text: 'two'}, {role: 'ai', text: 'b'}]);
  });

  it('does not send while it waits for an answer', async () => {
    setUp([{text: 'a', toolCalls: []}]);
    const first = chat.send('one');
    await chat.send('two');
    await first;
    expect(provider!.sent).toEqual([{kind: 'text', text: 'one'}]);
  });
});
