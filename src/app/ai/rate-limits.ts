// staying inside the free tier of the Gemini API: its limits are per model, on requests and tokens per minute and
// requests per day (Gemini API, rate limits). a level up or a creation makes many requests in a row, each sending the
// whole conversation, so it runs into the per minute limits. each model has limits of its own, so a limited request
// goes on with the next model at once, and only waits the time the error gives once all of them are limited.
// nothing here costs anything: a limit reached on the free tier is an error, not a charge

// the most a request waits for a limit to clear, and how many times it goes through the models
export const MAX_WAIT_SECONDS = 60;
export const TRIES_PER_MODEL = 3;

// how long to wait before sending again, undefined when the error is not a rate limit
export const rateLimitWait = (error: unknown): number | undefined => {
  const message = `${(error as {message?: string})?.message ?? error}`;
  if (!/\b429\b|quota|resource.?exhausted|rate.?limit/i.test(message)) return undefined;
  const asked = /retry in ([\d.]+)\s*s/i.exec(message) || /"retryDelay":\s*"([\d.]+)s"/.exec(message);
  return Math.min(MAX_WAIT_SECONDS, Math.max(1, Math.ceil(asked ? Number(asked[1]) : 20)));
};

// a model the project can not use (retired, renamed, or not one that calls functions): the next one is tried
export const isUnavailableModel = (error: unknown): boolean =>
  /\b404\b|not found|is not supported|unsupported model|no longer available/i.test(`${(error as {message?: string})?.message ?? error}`);

export interface RetryHooks {
  // says what is going on while it waits or changes model ("waiting 20s for the per minute limit")
  onStatus?: (text: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// runs a request with the first model, and on a limit at once with the next (each model has limits of its own),
// waiting only once every model is limited, then going through them again, TRIES_PER_MODEL times in all. a model
// that is not available is left out. run gets the model to use and whether it changed since the last call (a chat
// moves its history over then)
export const withRateLimits = async <T>(
  models: string[], run: (model: string, switched: boolean) => Promise<T>, hooks: RetryHooks = {},
): Promise<T> => {
  const sleep = hooks.sleep ?? pause;
  const available = [...models];
  let lastError: unknown;
  let last: string | undefined;
  for (let round = 0; round < TRIES_PER_MODEL && available.length; round++) {
    let shortest = MAX_WAIT_SECONDS;
    for (let i = 0; i < available.length;) {
      const model = available[i];
      const switched = last !== undefined && last !== model;
      last = model;
      try {
        return await run(model, switched);
      } catch (e) {
        if (isUnavailableModel(e) && available.length > 1) {
          lastError ??= e;
          available.splice(i, 1);
          hooks.onStatus?.(`${model} is not available, going on with ${available[i] ?? available[0]}`);
          continue;
        }
        const wait = rateLimitWait(e);
        if (wait === undefined) throw e;
        lastError = e;
        shortest = Math.min(shortest, wait);
        i++;
        if (i < available.length) hooks.onStatus?.(`the limit of ${model} is reached, going on with ${available[i]}`);
      }
    }
    if (round + 1 < TRIES_PER_MODEL) {
      hooks.onStatus?.(`waiting ${shortest}s for the AI's per-minute limit`);
      await sleep(shortest * 1000);
    }
  }
  throw lastError;
};

// the conversation a chat sends again with every request, kept small: the results of tools (a rules page, the
// reference, the summary) stay in it once read, and make each later request larger until the limit of tokens per
// minute is reached. older results larger than this are cut down to a note, the latest turns stay whole: the latest
// call, its result and the call before, enough for the AI to fix a refused call with the page it just read. what was
// cut can be read again (a rules page looked up again comes from the lookup cache, with no request of its own)
export const KEEP_LATEST_TURNS = 3;
export const MAX_OLD_RESULT_CHARS = 800;

// where to read again what a tool gave, when it is not that tool: a creation step completed gave the next step,
// which get_creation_step gives again
const READ_AGAIN_WITH: {[tool: string]: string} = {complete_creation_step: 'get_creation_step'};

interface FunctionResponsePart {
  functionResponse: {name: string, response: object, id?: string};
}
interface HistoryTurn {
  role: string;
  parts: unknown[];
}

const isFunctionResponse = (part: unknown): part is FunctionResponsePart =>
  !!part && typeof part === 'object' && 'functionResponse' in part;

// the history with the old large tool results replaced by a note, and whether anything was cut
export const compactHistory = <T extends HistoryTurn>(history: T[]): {history: T[], cut: boolean} => {
  let cut = false;
  const keepFrom = Math.max(0, history.length - KEEP_LATEST_TURNS);
  const compacted = history.map((turn, index) => {
    if (index >= keepFrom) return turn;
    const parts = turn.parts.map(part => {
      if (!isFunctionResponse(part)) return part;
      const size = JSON.stringify(part.functionResponse.response ?? {}).length;
      if (size <= MAX_OLD_RESULT_CHARS) return part;
      cut = true;
      return {...part, functionResponse: {...part.functionResponse,
        response: {earlier: `read earlier (${size} characters), left out to keep requests small: call ${READ_AGAIN_WITH[part.functionResponse.name] ?? part.functionResponse.name} again if you need it`}}};
    });
    return {...turn, parts};
  });
  return {history: compacted, cut};
};
