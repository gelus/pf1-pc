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
  role: 'player' | 'ai' | 'tool' | 'error';
  text: string;
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
  'You can only read the character for now, not change it: when the player asks for a change, say what they would',
  'change on the sheet.',
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
      let input: AiInput = {kind: 'text', text: question};
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
          this.add({role: 'tool', text: tool ? tool.label(call.args) : call.name});
          return {call, result: runAiTool(call.name, call.args, {character: this.character})};
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

  private add(message: ChatMessage): void {
    this.messages.update(messages => [...messages, message]);
  }
}
