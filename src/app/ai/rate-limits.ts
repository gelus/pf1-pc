// staying inside the free tier of the Gemini API: its limits are per model, on requests and tokens per minute and
// requests per day (Gemini API, rate limits). a level up or a creation makes many requests in a row, each sending the
// whole conversation, so it runs into the per minute limits: those clear within seconds, so the request waits the
// time the error gives and is sent again. when it still fails (the daily limit), the next model takes over, each
// model having limits of its own. nothing here costs anything: a limit reached on the free tier is an error, not a
// charge

// the most a request waits for a limit to clear, and how often it tries one model before the next
export const MAX_WAIT_SECONDS = 60;
export const TRIES_PER_MODEL = 3;

// how long to wait before sending again, undefined when the error is not a rate limit
export const rateLimitWait = (error: unknown): number | undefined => {
  const message = `${(error as {message?: string})?.message ?? error}`;
  if (!/\b429\b|quota|resource.?exhausted|rate.?limit/i.test(message)) return undefined;
  const asked = /retry in ([\d.]+)\s*s/i.exec(message) || /"retryDelay":\s*"([\d.]+)s"/.exec(message);
  return Math.min(MAX_WAIT_SECONDS, Math.max(1, Math.ceil(asked ? Number(asked[1]) : 20)));
};

export interface RetryHooks {
  // says what is going on while it waits or changes model ("waiting 20s for the per minute limit")
  onStatus?: (text: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// runs a request with the first model, waiting out rate limits, then with the next models in turn. run gets the
// model to use and whether it changed since the last call (a chat moves its history over then)
export const withRateLimits = async <T>(
  models: string[], run: (model: string, switched: boolean) => Promise<T>, hooks: RetryHooks = {},
): Promise<T> => {
  const sleep = hooks.sleep ?? pause;
  let lastError: unknown;
  for (let m = 0; m < models.length; m++) {
    for (let attempt = 0; attempt < TRIES_PER_MODEL; attempt++) {
      try {
        return await run(models[m], m > 0 && attempt === 0);
      } catch (e) {
        const wait = rateLimitWait(e);
        if (wait === undefined) throw e;
        lastError = e;
        if (attempt === TRIES_PER_MODEL - 1) break;
        hooks.onStatus?.(`waiting ${wait}s for the AI's per-minute limit`);
        await sleep(wait * 1000);
      }
    }
    if (m + 1 < models.length) hooks.onStatus?.(`the limit of ${models[m]} is reached, going on with ${models[m + 1]}`);
  }
  throw lastError;
};

// the conversation a chat sends again with every request, kept small: the results of tools (a rules page, the
// reference, the summary) stay in it once read, and make each later request larger until the limit of tokens per
// minute is reached. older results larger than this are cut down to a note, the latest turns stay whole
export const KEEP_LATEST_TURNS = 4;
export const MAX_OLD_RESULT_CHARS = 1200;

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
        response: {earlier: `read earlier (${size} characters), left out to keep requests small: call ${part.functionResponse.name} again if you need it`}}};
    });
    return {...turn, parts};
  });
  return {history: compacted, cut};
};
