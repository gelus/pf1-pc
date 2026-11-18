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
