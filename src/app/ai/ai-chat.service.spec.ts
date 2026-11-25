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

  it('stops the AI pricing kit after kit in one answer', async () => {
    const price: AiTurn = {text: '', toolCalls: [{name: 'price_gear', args: {items: '[{"name": "Rope", "cost_gp": 1}]'}}]};
    setUp([price, price, price, price, {text: 'here is one', toolCalls: []}]);
    await chat.send('what should I buy');
    expect((provider!.sent[4] as any).results[0].result.error).toContain('stop');
    expect((provider!.sent[3] as any).results[0].result.total).toBe('1 gp');
  });

  it('shows why a change was refused, and stops the AI when the same change is refused for the same problems again', async () => {
    const bad: AiTurn = {text: '', toolCalls: [{name: 'add_condition', args: {name: 'sleepy'}}]};
    setUp([bad, bad, bad, bad, {text: 'I could not add it.', toolCalls: []}]);
    await chat.send('I am sleepy');
    const tools = chat.messages().filter(m => m.role === 'tool').map(m => m.text);
    expect(tools[0]).toContain(': refused, there is no condition "sleepy"');
    // three refusals for the same problem, the fourth try is stopped
    expect((provider!.sent[4] as any).results[0].result.error).toContain('for the same problems again this turn: stop calling it');
  });

  it('lets the AI go on while each refusal is for something new', async () => {
    const tries = ['sleepyish', 'tiredish', 'droopy', 'shaken'].map(name => ({text: '', toolCalls: [{name: 'add_condition', args: {name}}]}));
    setUp([...tries, {text: 'Shaken.', toolCalls: []}]);
    await chat.send('I am shaken');
    expect(character.raw().conditions.map(c => c.name)).toEqual(['Shaken']);
  });

  it('keeps a log of the conversation to export: what was asked, the calls, and their results', async () => {
    setUp([{text: '', toolCalls: [{name: 'add_condition', args: {name: 'sleepy'}}]}, {text: 'No such condition.', toolCalls: []}]);
    await chat.send('I am sleepy');
    const log = JSON.parse(chat.exportLog());
    expect(log.character.name).toBe('Seoni');
    expect(log.trace.map((e: any) => e.kind)).toEqual(['player', 'reply', 'tool', 'reply']);
    expect(log.trace[2]).toEqual(jasmine.objectContaining({name: 'add_condition', args: {name: 'sleepy'}, result: jasmine.objectContaining({error: 'there is no condition "sleepy"'})}));
    chat.reset();
    expect(JSON.parse(chat.exportLog()).trace).toEqual([]);
  });

  it('stops the lookups of a turn once one to suggest from is held', async () => {
    const lookup = (name: string): AiTurn => ({text: '', toolCalls: [{name: 'look_up_rules', args: {name, kind: 'feat'}}]});
    setUp([lookup('Power Attack'), lookup('Cleave'), {text: 'Power Attack or Cleave?', toolCalls: []}]);
    character.update({creation: {step: 'feats', decisions: {}}});
    await chat.send('which feat?');
    expect((provider!.sent[1] as any).results[0].result.error).toContain('call no more tools now');
    expect((provider!.sent[2] as any).results[0].result.error).toContain('no more lookups this turn');
  });

  it('sends the AI back once when it ends a turn with its creation step open', async () => {
    setUp([{text: 'Your barbarian is ready!', toolCalls: []}, {text: 'Before that: what is their name?', toolCalls: []}]);
    character.update({creation: {step: 'equipment', decisions: {}}});
    await chat.send('ok');
    expect(provider!.sent.length).toBe(2);
    expect((provider!.sent[1] as any).text).toContain('the step is not complete');
    expect(chat.messages().at(-1)!.text).toBe('Before that: what is their name?');
  });

  it('makes no more changes in a turn once told to wait for the player', async () => {
    const complete: AiTurn = {text: '', toolCalls: [{name: 'complete_creation_step', args: {step: 'concept', decisions: 'an elven brawler'}}]};
    setUp([complete, {text: '', toolCalls: [{name: 'get_creation_step', args: {}}]}, complete, {text: 'How does your table make scores?', toolCalls: []}]);
    character.update({creation: {step: 'concept', decisions: {}}});
    await chat.send('an elven brawler');
    expect((provider!.sent[1] as any).results[0].result.error).toContain('end your message');
    expect((provider!.sent[2] as any).results[0].result.error).toContain('the player has to answer first');
    expect((provider!.sent[3] as any).results[0].result.error).toContain('the player has to answer first');
  });

  describe('point buy in the chat', () => {
    const offer: AiTurn = {text: 'Here is a spread for your slayer:', toolCalls: [{name: 'offer_point_buy',
      args: {budget: 20, scores: '{"str": 18}', raise: 'str, dex', lower: 'int, cha'}}]};

    beforeEach(() => {
      setUp([offer, {text: 'Adjust it and confirm.', toolCalls: []}, {text: 'Set. Which race?', toolCalls: []}]);
      character.update({creation: {step: 'ability-scores', decisions: {concept: 'a slayer, 20 point buy'}}});
    });

    it('shows the AI\'s point buy to the player, who confirms it without the AI setting it', async () => {
      await chat.send('20 points, max str and dex, dump int and cha');
      const widget = chat.messages().find(m => m.role === 'pointBuy')!;
      // under the AI's message, the last thing of the answer
      expect(chat.messages().slice(-2).map(m => m.role)).toEqual(['ai', 'pointBuy']);
      expect(widget.pointBuy).toEqual({scores: {str: 18, dex: 16, con: 11, int: 7, wis: 10, cha: 7}, budget: 20});
      expect(character.raw().abilityScores.str).toBe(10);
      // the player moves a point and leaves one unspent
      const picked = {str: 18, dex: 16, con: 10, int: 7, wis: 10, cha: 7};
      expect(await chat.confirmPointBuy(widget, picked, 20)).toBeUndefined();
      expect(character.raw().abilityScores).toEqual(jasmine.objectContaining(picked));
      expect(character.raw().creation?.step).toBe('race');
      const confirmed = chat.messages().find(m => m.role === 'pointBuy')!;
      expect(confirmed.pointBuy!.confirmed).toBeTrue();
      expect(chat.messages().filter(m => m.role === 'action').map(m => m.text)).toEqual([
        'ability scores str 18, dex 16, con 10, int 7, wis 10, cha 7 (20-point buy)', jasmine.stringContaining('Ability scores done') as any]);
      const player = chat.messages().filter(m => m.role === 'player').at(-1)!;
      expect(player.text).toBe('Confirmed my 20-point buy: Str 18, Dex 16, Con 10, Int 7, Wis 10, Cha 7 (1 point left unspent).');
      expect((provider!.sent.at(-1) as any).text).toContain('the player confirmed the point buy');
      expect(chat.messages().at(-1)!.text).toBe('Set. Which race?');
      // the app's words for the player are not the player's: its "Str 18" does not put a human's +2 on Strength
      expect((chat as any).conversation.playerMessages.join(' ')).not.toContain('Confirmed');
    });

    it('keeps one message a turn when the app speaks for the player, so a step asked since is read from its turn', async () => {
      // (the confirmed point buy left the messages one behind the turns, and a human's "+2 in wis" after it went unread)
      await chat.send('20 points, max str and dex, dump int and cha');
      const widget = chat.messages().find(m => m.role === 'pointBuy')!;
      await chat.confirmPointBuy(widget, {str: 18, dex: 16, con: 10, int: 7, wis: 10, cha: 7}, 20);
      const conversation = (chat as any).conversation;
      expect(conversation.playerMessages.length).toBe(conversation.playerTurns);
    });

    it('refuses scores over the points, and the AI setting a point buy itself', async () => {
      await chat.send('20 points');
      const widget = chat.messages().find(m => m.role === 'pointBuy')!;
      expect(await chat.confirmPointBuy(widget, {str: 18, dex: 18, con: 10, int: 7, wis: 10, cha: 7}, 20)).toContain('more than 20');
      expect(character.raw().abilityScores.str).toBe(10);
      const run = await import('./ai-tools').then(m => m.runAiTool('set_ability_scores',
        {scores: '{"str": 18, "dex": 16, "con": 11, "int": 7, "wis": 10, "cha": 7}', method: 'point buy 20'}, {character}));
      expect((run as any).error).toContain('offer_point_buy');
    });
  });

  it('shows what went wrong and starts a new session with the next message', async () => {
    setUp([new AiError('the free quota of the AI is used up for now, try again later'), {text: 'back', toolCalls: []}]);
    await chat.send('one');
    expect(chat.messages().at(-1)).toEqual({role: 'error', text: 'the free quota of the AI is used up for now, try again later'});
    await chat.send('two');
    expect(provider!.sessions.length).toBe(2);
    expect(chat.messages().at(-1)).toEqual({role: 'ai', text: 'back'});
  });

  it('starts the new session from what was said, so the AI remembers the conversation', async () => {
    setUp([{text: 'Which ability gets the +2?', toolCalls: []}, new AiError('limits reached'), {text: 'ok', toolCalls: []}]);
    await chat.send('make me a human monk');
    await chat.send('strength');
    await chat.send('strength, I said');
    expect(provider!.sessions.length).toBe(2);
    expect(provider!.sessions[0].history).toEqual([]);
    expect(provider!.sessions[1].history).toEqual([
      {role: 'player', text: 'make me a human monk'}, {role: 'ai', text: 'Which ability gets the +2?'}, {role: 'player', text: 'strength'},
    ]);
  });

  it('opens a creation with its first question, which the AI hears of with the answer', async () => {
    setUp([{text: 'A monk then.', toolCalls: []}]);
    chat.startCreation();
    chat.startCreation();
    // the character here has a name and a dexterity already, the opener says so
    const opener = chat.messages()[0].text;
    expect(chat.messages().length).toBe(1);
    expect(opener).toMatch(/^What kind of character are we building\?\n\nAlready on the sheet.*\n- Ability scores: .*dex 14/);
    await chat.send('a human monk');
    expect(provider!.sessions[0].history).toEqual([
      {role: 'player', text: '[the player asked to create a character with the AI]'}, {role: 'ai', text: opener},
    ]);
  });

  it('goes on with a creation left midway, after its first class level, asking that step\'s questions', () => {
    setUp([]);
    character.update({creation: {step: 'equipment', decisions: {}}});
    chat.startCreation();
    expect(chat.messages()[0].text).toContain('we\'re at Equipment');
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
  describe('play actions', () => {
    const shaken = {text: '', toolCalls: [{name: 'add_condition', args: {name: 'shaken'}}]};

    it('shows what an action did with an undo, and the undo takes it back while it is the last change', async () => {
      setUp([shaken, {text: 'You are shaken: -2 on attacks, saves and checks.', toolCalls: []}]);
      await chat.send('I failed my save against the intimidate');
      const action = chat.messages().find(m => m.role === 'action')!;
      expect(action.text).toBe('the character is Shaken');
      expect(character.raw().conditions.map(c => c.name)).toEqual(['Shaken']);
      expect(chat.canUndo(action)).toBeTrue();
      chat.undo(action);
      expect(character.raw().conditions).toEqual([]);
      expect(chat.messages().find(m => m.role === 'action')!.undone).toBeTrue();
    });

    it('tells the AI what the player undid with the next message', async () => {
      setUp([shaken, {text: 'Shaken.', toolCalls: []}, {text: 'ok', toolCalls: []}]);
      await chat.send('I am shaken');
      chat.undo(chat.messages().find(m => m.role === 'action')!);
      await chat.send('never mind');
      expect(provider!.sent.at(-1)).toEqual({kind: 'text', text: '(the player undid: the character is Shaken)\n\nnever mind'});
    });

    it('offers no undo once something else changed after the action', async () => {
      setUp([shaken, {text: 'Shaken.', toolCalls: []}]);
      await chat.send('I am shaken');
      character.update({experience: 300});
      const action = chat.messages().find(m => m.role === 'action')!;
      expect(chat.canUndo(action)).toBeFalse();
      chat.undo(action);
      expect(character.raw().conditions.map(c => c.name)).toEqual(['Shaken']);
    });

    it('shows a failed action as a tool call, the AI gets the error to work with', async () => {
      setUp([{text: '', toolCalls: [{name: 'add_condition', args: {name: 'sleepy'}}]}, {text: 'There is no such condition.', toolCalls: []}]);
      await chat.send('I am sleepy');
      expect(chat.messages().some(m => m.role === 'action')).toBeFalse();
      const results = provider!.sent[1] as Extract<AiInput, {kind: 'toolResults'}>;
      expect((results.results[0].result as any).error).toBe('there is no condition "sleepy"');
      expect(character.history.canUndo()).toBeFalse();
    });
  });
});
