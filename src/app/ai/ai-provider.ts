// what the app needs from an AI, whichever one runs it: a chat session that takes text or the results of the tools it
// asked for, and answers with text and the tools it wants called. the tools themselves (ai-tools.ts) and the loop
// running them (ai-chat.service.ts) know nothing of the provider, an adapter (gemini-firebase.provider.ts) turns this
// into the calls of one provider, so another one is a new adapter

// the parameters of a tool, a JSON schema object (the subset every provider takes: types, descriptions, enums,
// required)
export interface AiSchema {
  type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description?: string;
  properties?: {[name: string]: AiSchema};
  required?: string[];
  items?: AiSchema;
  enum?: string[];
}

export interface AiToolDeclaration {
  name: string;
  description: string;
  parameters?: AiSchema & {type: 'object'};
}

export interface AiToolCall {
  // the id the provider gave the call, sent back with its result when it has one
  id?: string;
  name: string;
  args: {[name: string]: unknown};
}

export type AiInput =
  | {kind: 'text', text: string}
  | {kind: 'toolResults', results: {call: AiToolCall, result: object}[]};

export interface AiTurn {
  text: string;
  toolCalls: AiToolCall[];
}

export interface AiSession {
  send(input: AiInput): Promise<AiTurn>;
}

export interface AiSessionOptions {
  system: string;
  tools: AiToolDeclaration[];
  // what the provider is doing while the player waits (waiting out a rate limit), for the chat to show
  onStatus?: (text: string) => void;
  // the conversation so far, for a session started again after one failed: what the player and the AI said
  history?: {role: 'player' | 'ai', text: string}[];
}

// reading web pages, apart from the chat: a provider may not read pages in a request that also calls tools (Gemini's
// URL context can not), so the lookup tool asks for it as a request of its own
export interface AiPageRequest {
  // what to do with the pages, the pages are listed after it
  instructions: string;
  urls: string[];
}

export interface AiPageResult {
  text: string;
  // the pages the provider read, and whether it could
  pages: {url: string, read: boolean}[];
}

export interface AiProvider {
  // names the provider in the chat ("Gemini via Firebase")
  name: string;
  startSession(options: AiSessionOptions): AiSession;
  // reads public web pages, when the provider can
  readPages?(request: AiPageRequest): Promise<AiPageResult>;
}

// an AI call that failed in a way the player should hear about (not set up, out of quota, blocked, ...)
export class AiError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
  }
}
