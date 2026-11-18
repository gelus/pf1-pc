import {Injectable, InjectionToken, computed, inject, signal} from '@angular/core';
import {ApplyCharacterService} from '../apply-character.service';
import {aiConfig} from './ai-config';
import {AiError, AiInput, AiProvider, AiSession, AiToolCall} from './ai-provider';
import {AiMode, aiModeOf, aiTools, aiToolsFor, runAiTool} from './ai-tools';
import {AiAuthService} from './ai-auth.service';
import {CreationConversation, creationGate, creationOpener} from './creation-script';
import {GeminiFirebaseProvider} from './gemini-firebase.provider';

// the chat with the AI on the sheet: it sends what the player writes, runs the tools the AI asks for against the
// character and sends their results back, until the AI answers. one conversation per character, it starts over when
// another character is opened

export interface ChatMessage {
  role: 'player' | 'ai' | 'tool' | 'action' | 'source' | 'error';
  text: string;
  // an action: the step of the undo history it made, and whether the chat's undo took it back
  stepId?: number;
  undone?: boolean;
}

// gives the provider to talk to, null when none is set up (see ai-config.ts). a spec gives a fake one
export const AI_PROVIDER = new InjectionToken<() => AiProvider | null>('AI_PROVIDER', {
  providedIn: 'root',
  factory: () => () => {
    const config = aiConfig();
    return config ? new GeminiFirebaseProvider(config) : null;
  },
});

// the most rounds of tool calls one answer takes before the chat gives up on it (a level up reads, builds and checks)
export const maxToolRounds = 16;

// what the AI is told at the start of a conversation: the core in every mode, then what the mode needs (see
// aiModeOf). it is sent again with every request, so it is kept short
const corePrompt = [
  'You are the companion of a Pathfinder 1st edition player, inside their character sheet app: you answer questions',
  'about their character and the rules, and change the character with your tools.',
  '',
  'The app works out every number with its own rules engine, from the features of the character (class levels, race,',
  'feats, items, conditions). Never work a number out yourself: read it with the tools, and when you explain one, name',
  'the features it comes from as the tools give them. When a tool gives an error, fix the call and try again, or say',
  'what you could not find.',
  '',
  'Rules questions are Pathfinder 1st edition (not 2nd edition, not D&D); say when a ruling is up to the GM. For a',
  'specific feat, spell or item, read it with look_up_rules and answer from its text, and say when you are not sure.',
  '',
  'To add something (a feat, trait, item, a buff or condition the rules do not have): look it up first when it is a',
  'published rule (look_up_rules), read get_adjustment_reference once, then create_feature or create_item with',
  'source_url. Every number the rules give goes in adjustments; a bonus that applies only sometimes (one maneuver, one',
  'weapon, vs. fear) is a variant like cmb[grapple], never the plain path. When the lookup finds nothing, ask for a',
  'link; build from your own knowledge only when the player says to go ahead without one. Never mark something looked',
  'up that you did not read. When a check refuses it, fix the problems and call again, then say what it adjusts.',
  'Change or remove what the character has with edit_feature, edit_item, remove_feature and remove_item when asked;',
  'read it first (get_feature, get_item) so you keep what should stay.',
  '',
  'Class features from a class page go in add_class_level: each with its numbers as adjustments (formulas of the class',
  'level, {level.slayer}, when they grow), shown through a specialAttack, defensiveAbilities or specialQuality entry;',
  'one the player switches on (studied target, a stance) has "active": false on that entry. A class feature that is a',
  'choice (a rage power, a bloodline, a bonus feat) is asked for first, then looked up.',
  '',
  'Each round of tool calls is a request against a per-minute limit: call the tools you need together in one round,',
  'and do not call a tool again for what it already gave you.',
  '',
  'Keep answers short, the player is often in the middle of a game. Plain text with short lists, no tables.',
];

const creationPrompt = [
  '',
  'The character has no class levels: it is being created by a script of steps (the Core Rulebook\'s). Call',
  'get_creation_step and do one step at a time: ask its questions, suggesting answers from what the player said so far',
  'and why, then stop and wait; never make a choice for the player. Once they answered, make the step\'s changes and',
  'complete_creation_step with what they decided, which gives the next step: ask its questions in the same message.',
  'Price point buys with price_point_buy, never yourself.',
];

const playPrompt = [
  '',
  'During play, change the character with the play actions when the player says what happened (damage, healing,',
  'conditions, a feature turned on or off, uses spent, combat options, spells cast, rest), at once without asking: each',
  'shows in the chat with an undo. Use only the numbers the player gives (they roll and take off damage reduction); ask',
  'for a missing one. After acting, say in a few words what changed from what the action gave back (hp 16 -> 4), never',
  'more. Rules the app does not track (rounds of rage, durations) are up to the player.',
  '',
  'Leveling up, one step at a time: get_level_up_status; the class (ask unless they said); the hit die roll (ask, the',
  'player rolls); look the class up (kind class, focus on that level) and add_class_level with that level\'s class',
  'features, favored class bonus and ability increase. Change features with fixed numbers that grow (edit_feature);',
  'then ask where the skill ranks go (set_skill_ranks), and for a new feat suggest a few the character qualifies for,',
  'look the chosen one up and add it. End with get_level_up_status to show nothing is left.',
];

export const systemPromptFor = (mode: AiMode): string =>
  [...corePrompt, ...(mode === 'creation' ? creationPrompt : playPrompt)].join('\n');

@Injectable({providedIn: 'root'})
export class AiChatService {
  private character = inject(ApplyCharacterService);
  private providerFactory = inject(AI_PROVIDER);

  readonly auth = inject(AiAuthService);
  readonly messages = signal<ChatMessage[]>([]);
  readonly busy = signal(false);
  private session?: AiSession;
  // the mode the session's tools and instructions are for, see aiModeOf
  private sessionMode?: AiMode;
  // the player's messages and the creation step last asked, see creation-script.ts
  private conversation: CreationConversation = {playerTurns: 0};
  private provider?: AiProvider | null;
  private characterId?: string;

  // whether there is an AI to talk to, the chat explains how to set one up when there is not
  readonly available = computed(() => {
    this.messages();
    return !!this.currentProvider();
  });

  // the AI answers signed in players only, and no one is: the chat offers to sign in. it starts listening to who is
  // signed in the first time it asks
  readonly signInNeeded = computed(() => {
    this.messages();
    if (!this.currentProvider()?.requiresSignIn) return false;
    void this.auth.start();
    return !this.auth.player();
  });

  private currentProvider(): AiProvider | null {
    if (this.provider === undefined) this.provider = this.providerFactory();
    return this.provider;
  }

  // starts the conversation over, with the provider as it is set up now
  reset(): void {
    this.session = undefined;
    this.sessionMode = undefined;
    this.provider = undefined;
    this.characterId = undefined;
    this.pendingNotes = [];
    this.conversation = {playerTurns: 0};
    this.messages.set([]);
  }

  // the conversation is about one character: another one starts it over
  private forCurrentCharacter(): void {
    const id = this.character.raw().id;
    if (this.characterId !== id) {
      this.reset();
      this.characterId = id;
    }
  }

  // opens the creation of a character with no class levels: the app asks the first question itself (no request to
  // the AI), with what the sheet already has, and the player's answer goes on from there. nothing when the chat
  // already has a conversation or the character has class levels
  startCreation(): void {
    this.forCurrentCharacter();
    if (this.messages().length || (this.character.raw().classLevels || []).length) return;
    this.add({role: 'ai', text: creationOpener(this.character)});
    // the opener asks the concept's question: the player's answer to it counts
    const step = this.character.raw().creation?.step ?? 'concept';
    if (step === 'concept') this.conversation.asked = {step, turn: this.conversation.playerTurns};
  }

  async send(text: string): Promise<void> {
    const question = text.trim();
    if (!question || this.busy()) return;
    this.forCurrentCharacter();
    const provider = this.currentProvider();
    this.add({role: 'player', text: question});
    this.conversation.playerTurns++;
    if (!provider) {
      this.add({role: 'error', text: 'The AI is not set up yet, see src/app/ai/ai-config.ts'});
      return;
    }
    if (provider.requiresSignIn) {
      await this.auth.start();
      if (!this.auth.player()) {
        this.add({role: 'error', text: 'Sign in to use the AI: it is for the players the owner of the app added.'});
        return;
      }
    }
    this.busy.set(true);
    try {
      // a session started again after one failed goes on from what was said, not from nothing
      const said: {role: 'player' | 'ai', text: string}[] = [];
      // a conversation the app opened (startCreation) begins with the AI's question, Gemini's history with the player
      if (this.messages()[0]?.role === 'ai') said.push({role: 'player', text: '[the player asked to create a character with the AI]'});
      for (const m of this.messages().slice(0, -1)) {
        if (m.role === 'player') said.push({role: 'player', text: m.text});
        else if (m.role === 'ai') said.push({role: 'ai', text: m.text});
        // what the app did goes on the player's side, as context: written as the AI's, the AI copies it instead of acting
        else if (m.role === 'action') said.push({role: 'player', text: `[the app had done: ${m.text}${m.undone ? ', then the player undid it' : ''}]`});
      }
      // the tools and instructions of the mode the character is in now: a creation that ended goes on as play. a
      // session that can not change them is started again from what was said
      const mode = aiModeOf(this.character.raw());
      const setup = {system: systemPromptFor(mode), tools: aiToolsFor(mode)};
      if (this.session && this.sessionMode !== mode) {
        if (this.session.update) this.session.update(setup);
        else this.session = undefined;
      }
      this.sessionMode = mode;
      this.session ??= provider.startSession({
        ...setup, history: said,
        // waiting out a rate limit shows, so a slow answer does not look stuck
        onStatus: text => this.add({role: 'tool', text}),
      });
      const notes = this.pendingNotes.splice(0);
      let input: AiInput = {kind: 'text', text: notes.length ? `${notes.join('\n')}\n\n${question}` : question};
      for (let round = 0; ; round++) {
        const turn = await this.session.send(input);
        if (turn.text.trim()) this.add({role: 'ai', text: turn.text.trim()});
        if (!turn.toolCalls.length) break;
        if (round >= maxToolRounds) {
          this.add({role: 'error', text: 'The AI kept looking things up without answering, ask again in other words'});
          break;
        }
        // one after the other: an action reads the character as the one before it left it
        const results: {call: AiToolCall, result: object}[] = [];
        for (const call of turn.toolCalls) {
          const tool = aiTools.find(t => t.name === call.name);
          const stepBefore = this.character.history.lastStepId();
          // a character being created goes step by step: the creation holds back changes the player did not answer for
          const raw = this.character.raw();
          const progress = raw.creation ?? ((raw.classLevels || []).length ? undefined : {step: 'concept', decisions: {}});
          const held = tool?.changes ? creationGate(progress, call.name, this.conversation) : undefined;
          const result = held ? {error: held}
            : await runAiTool(call.name, call.args, {character: this.character, provider, conversation: this.conversation});
          const done = (result as {done?: unknown}).done;
          const stepId = this.character.history.lastStepId();
          const found = result as {found?: boolean, url?: string};
          if (call.name === 'look_up_rules' && found.found && found.url) {
            this.add({role: 'source', text: found.url});
          } else if (tool?.changes && typeof done === 'string') {
            // undo_last_change makes no step of its own, its message has nothing to undo
            this.add({role: 'action', text: done, ...(stepId !== stepBefore && stepId !== undefined && call.name !== 'undo_last_change' ? {stepId} : {})});
          } else {
            this.add({role: 'tool', text: tool ? tool.label(call.args) : call.name});
          }
          results.push({call, result});
        }
        input = {kind: 'toolResults', results};
      }
    } catch (e) {
      // a session that failed midway can not take the results it was waiting for, the next message starts a new one
      this.session = undefined;
      this.add({role: 'error', text: e instanceof AiError ? e.message : `Something went wrong: ${(e as Error).message}`});
    } finally {
      this.busy.set(false);
    }
  }

  // whether the chat can still undo the action of a message: it is the last change to the character
  canUndo(message: ChatMessage): boolean {
    return message.stepId !== undefined && !message.undone && this.character.history.lastStepId() === message.stepId;
  }

  undo(message: ChatMessage): void {
    if (!this.canUndo(message)) return;
    this.character.undo();
    this.messages.update(messages => messages.map(m => m === message ? {...m, undone: true} : m));
    // the AI read the character before the undo, it hears of it with the next message
    this.pendingNotes.push(`(the player undid: ${message.text})`);
  }

  private pendingNotes: string[] = [];

  private add(message: ChatMessage): void {
    this.messages.update(messages => [...messages, message]);
  }
}
