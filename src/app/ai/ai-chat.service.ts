import {Injectable, InjectionToken, computed, inject, signal} from '@angular/core';
import {ApplyCharacterService} from '../apply-character.service';
import {aiConfig} from './ai-config';
import {AiError, AiInput, AiProvider, AiSession} from './ai-provider';
import {aiTools, runAiTool} from './ai-tools';
import {GeminiFirebaseProvider} from './gemini-firebase.provider';

// the chat with the AI on the sheet: it sends what the player writes, runs the tools the AI asks for against the
// character and sends their results back, until the AI answers. one conversation per character, it starts over when
// another character is opened

export interface ChatMessage {
  role: 'player' | 'ai' | 'tool' | 'action' | 'error';
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

// the most rounds of tool calls one answer takes before the chat gives up on it
export const maxToolRounds = 8;

export const systemPrompt = [
  'You are the companion of a Pathfinder 1st edition player, inside their character sheet app. You answer questions',
  'about their character and the rules, and help during play.',
  '',
  'The app works out every number of the character with its own rules engine, from the features of the character',
  '(class levels, race, feats, items, conditions). Never work a number out yourself: read it with the tools, which',
  'give the numbers the sheet shows and where each one comes from. When you explain a number, name the features it',
  'comes from, the way the tools give them. If a tool gives an error, fix the call (a stat name, an attack name) and',
  'try again, or say what you could not find.',
  '',
  'For rules questions, answer from Pathfinder 1st edition (not 2nd edition, not D&D), and say when a ruling is up to',
  'the GM. You can not look rules up yet, so say which rule you mean so the player can check it on aonprd.com or',
  'd20pfsrd.com, and say when you are not sure.',
  '',
  'During play, change the character with the play actions when the player says what happened: damage taken,',
  'healing, conditions, rage or another feature turned on or off, uses of a feature spent, combat options, spells',
  'cast, rest. Do it at once, without asking first: each action shows in the chat with an undo. Only use the numbers',
  'the player gives (they roll the dice, take off damage reduction and so on); when a number you need is missing, ask',
  'for it. After acting, say in a few words what changed, from what the action gave back (hp 16 -> 4, now',
  'disabled), and only that: never say something changed (slots or uses restored) unless the result says so.',
  'Rules the app does not track (rounds of rage, durations) are up to the player: say when they matter.',
  '',
  'Bigger changes (adding feats, items or class levels, editing features) are not yours to make yet: say what the',
  'player would change on the sheet.',
  '',
  'Keep answers short, the player is often in the middle of a game. Use plain text with short lists, no tables.',
].join('\n');

@Injectable({providedIn: 'root'})
export class AiChatService {
  private character = inject(ApplyCharacterService);
  private providerFactory = inject(AI_PROVIDER);

  readonly messages = signal<ChatMessage[]>([]);
  readonly busy = signal(false);
  private session?: AiSession;
  private provider?: AiProvider | null;
  private characterId?: string;

  // whether there is an AI to talk to, the chat explains how to set one up when there is not
  readonly available = computed(() => {
    this.messages();
    return !!this.currentProvider();
  });

  private currentProvider(): AiProvider | null {
    if (this.provider === undefined) this.provider = this.providerFactory();
    return this.provider;
  }

  // starts the conversation over, with the provider as it is set up now
  reset(): void {
    this.session = undefined;
    this.provider = undefined;
    this.characterId = undefined;
    this.pendingNotes = [];
    this.messages.set([]);
  }

  async send(text: string): Promise<void> {
    const question = text.trim();
    if (!question || this.busy()) return;
    const id = this.character.raw().id;
    if (this.characterId !== id) {
      this.reset();
      this.characterId = id;
    }
    const provider = this.currentProvider();
    this.add({role: 'player', text: question});
    if (!provider) {
      this.add({role: 'error', text: 'The AI is not set up yet, see src/app/ai/ai-config.ts'});
      return;
    }
    this.busy.set(true);
    try {
      this.session ??= provider.startSession({system: systemPrompt, tools: aiTools});
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
        const results = turn.toolCalls.map(call => {
          const tool = aiTools.find(t => t.name === call.name);
          const stepBefore = this.character.history.lastStepId();
          const result = runAiTool(call.name, call.args, {character: this.character});
          const done = (result as {done?: unknown}).done;
          const stepId = this.character.history.lastStepId();
          if (tool?.changes && typeof done === 'string') {
            // undo_last_change makes no step of its own, its message has nothing to undo
            this.add({role: 'action', text: done, ...(stepId !== stepBefore && stepId !== undefined && call.name !== 'undo_last_change' ? {stepId} : {})});
          } else {
            this.add({role: 'tool', text: tool ? tool.label(call.args) : call.name});
          }
          return {call, result};
        });
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
