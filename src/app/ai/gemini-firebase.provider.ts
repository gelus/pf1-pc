import type {ChatSession, FunctionDeclaration, ObjectSchemaRequest, Part} from 'firebase/ai';
import type {AiConfig} from './ai-config';
import {AiError, AiInput, AiPageRequest, AiPageResult, AiProvider, AiSession, AiSessionOptions, AiTurn} from './ai-provider';
import {withRateLimits} from './rate-limits';

// Gemini through Firebase AI Logic, from the browser. firebase is loaded the first time a message is sent, so it is not
// in the bundle of the sheet and never runs while rendering on the server
// the chat session of the SDK keeps the history (thought signatures included, which Gemini needs back with the
// results of the functions it called), this only turns the app's messages into its parts and back

const appName = 'pf1-ai';

type FirebaseModules = {
  app: typeof import('firebase/app'),
  ai: typeof import('firebase/ai'),
  appCheck: typeof import('firebase/app-check'),
};
let modules: Promise<FirebaseModules> | undefined;
const loadFirebase = (): Promise<FirebaseModules> => modules ??= Promise.all([
  import('firebase/app'), import('firebase/ai'), import('firebase/app-check'),
]).then(([app, ai, appCheck]) => ({app, ai, appCheck}));

// the firebase app of the chat, made once: App Check can only be started once per app, before its first call
const firebaseApp = ({app, appCheck}: FirebaseModules, config: AiConfig): import('firebase/app').FirebaseApp => {
  const existing = app.getApps().find(a => a.name === appName);
  if (existing) return existing;
  const created = app.initializeApp(config.firebase, appName);
  const {siteKey, debugToken} = config.appCheck;
  if (siteKey || debugToken) {
    // the SDK reads the debug token from here when App Check starts, it then skips reCAPTCHA
    if (debugToken) (self as {FIREBASE_APPCHECK_DEBUG_TOKEN?: string}).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    appCheck.initializeAppCheck(created, {
      provider: new appCheck.ReCaptchaEnterpriseProvider(siteKey || 'debug-token-only'),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return created;
};

export class GeminiFirebaseProvider implements AiProvider {
  readonly name: string;

  constructor(private readonly config: AiConfig) {
    this.name = `Gemini (${config.model}) via Firebase`;
  }

  startSession(options: AiSessionOptions): AiSession {
    return new GeminiFirebaseSession(this.config, options);
  }

  // Gemini's URL context tool reads the pages, it can not be used with function calling so this is a request of its
  // own (Firebase AI Logic, URL context: limitations). it reads at most 20 pages, public ones only
  async readPages({instructions, urls}: AiPageRequest): Promise<AiPageResult> {
    const modules = await loadFirebase();
    const {ai} = modules;
    const backend = ai.getAI(firebaseApp(modules, this.config), {backend: new ai.GoogleAIBackend()});
    let response;
    try {
      // the pages go through the fallback models first: the chat keeps the main model's limits
      response = await withRateLimits([...this.config.fallbackModels, this.config.model], async model =>
        (await ai.getGenerativeModel(backend, {model, tools: [{urlContext: {}}]})
          .generateContent(`${instructions}\n\n${urls.slice(0, 20).join('\n')}`)).response);
    } catch (e) {
      throw new AiError(describeError(e), e);
    }
    let text = '';
    try {
      text = response.text();
    } catch { /* no text: blocked, or nothing found */ }
    const read = response.candidates?.[0]?.urlContextMetadata?.urlMetadata || [];
    return {
      text,
      pages: read.map(page => ({url: page.retrievedUrl || '', read: page.urlRetrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS'})),
    };
  }
}

class GeminiFirebaseSession implements AiSession {
  private chat?: ChatSession;
  private chatModel?: string;

  constructor(
    private readonly config: AiConfig,
    private readonly options: AiSessionOptions,
  ) {}

  // the chat with a model; a chat moving to another model (a limit reached) takes its history along
  private async chatWith(modelName: string): Promise<ChatSession> {
    if (this.chat && this.chatModel === modelName) return this.chat;
    const history = this.chat ? await this.chat.getHistory() : undefined;
    const modules = await loadFirebase();
    const {ai} = modules;
    const model = ai.getGenerativeModel(ai.getAI(firebaseApp(modules, this.config), {backend: new ai.GoogleAIBackend()}), {
      model: modelName,
      systemInstruction: this.options.system,
      tools: this.options.tools.length ? [{
        functionDeclarations: this.options.tools.map((tool): FunctionDeclaration => ({
          name: tool.name,
          description: tool.description,
          ...(tool.parameters ? {parameters: tool.parameters as unknown as ObjectSchemaRequest} : {}),
        })),
      }] : undefined,
    });
    this.chat = model.startChat(history ? {history} : undefined);
    this.chatModel = modelName;
    return this.chat;
  }

  // the model the chat is on, the main one until it reaches a limit
  private get models(): string[] {
    const all = [this.config.model, ...this.config.fallbackModels];
    return all.slice(Math.max(0, all.indexOf(this.chatModel ?? this.config.model)));
  }

  async send(input: AiInput): Promise<AiTurn> {
    const request: string | Part[] = input.kind === 'text' ? input.text : input.results.map(({call, result}): Part => ({
      type: 'functionResponse',
      functionResponse: {...(call.id ? {id: call.id} : {}), name: call.name, response: result},
    }));
    let response;
    try {
      response = await withRateLimits(this.models, async model => (await (await this.chatWith(model)).sendMessage(request)).response,
        {onStatus: this.options.onStatus});
    } catch (e) {
      throw new AiError(describeError(e), e);
    }
    let text = '';
    try {
      text = response.text();
    } catch (e) {
      throw new AiError(`Gemini did not answer: ${(e as Error).message}`, e);
    }
    const toolCalls = (response.functionCalls() || []).map(call => ({
      ...(call.id ? {id: call.id} : {}),
      name: call.name,
      args: (call.args || {}) as {[name: string]: unknown},
    }));
    return {text, toolCalls};
  }
}

// what a player can do about a failed call
const describeError = (e: unknown): string => {
  const code = (e as {code?: string})?.code || '';
  const message = (e as Error)?.message || String(e);
  if (code.includes('api-not-enabled')) return 'Firebase AI Logic is not enabled for this project, turn it on in the Firebase console (AI Logic, Get started)';
  if (code.startsWith('appCheck/') || /App Check/i.test(message)) {
    return /debug/i.test(message) || /debug token/i.test(code)
      ? 'App Check did not accept the debug token of this browser, add it in the Firebase console (App Check, Apps, '
        + 'Manage debug tokens) or remove it with pf1.setAppCheckDebugToken(null)'
      : 'App Check could not prove this is the app: check the site key in ai-config.ts and that this domain is allowed '
        + 'on the Fraud Defense key. on localhost use a debug token (pf1.setAppCheckDebugToken)';
  }
  if (code.includes('no-api-key') || code.includes('no-app-id') || code.includes('no-project-id')) return `the firebase config is incomplete (${message})`;
  if (/403|PERMISSION_DENIED|serviceusage|does not have required permission/i.test(message)) {
    return 'the firebase project can not use AI Logic yet: in the Firebase console open AI Logic, Get started, pick '
      + 'the Gemini Developer API and give it a few minutes. if it is on, check that the API key is not restricted '
      + 'to other APIs (Google Cloud console, APIs and services, Credentials)';
  }
  if (/API_KEY_INVALID|API key not valid/i.test(message)) return 'the apiKey of the firebase config is not valid, copy the config of the web app from the Firebase console again';
  if (/quota|429|resource.?exhausted/i.test(message)) {
    return 'the AI\'s free limits are reached on every model, even after waiting: the per-minute ones clear within a minute, the daily ones at midnight Pacific time. Nothing is charged';
  }
  return message;
};
