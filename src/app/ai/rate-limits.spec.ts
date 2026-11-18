import {MAX_WAIT_SECONDS, rateLimitWait, withRateLimits} from './rate-limits';

describe('rate limits', () => {
  const limit = (seconds?: number) =>
    new Error(`[429 Too Many Requests] You exceeded your current quota.${seconds ? ` Please retry in ${seconds}s.` : ''}`);

  it('knows a rate limit and how long it asks to wait', () => {
    expect(rateLimitWait(limit(12.4))).toBe(13);
    expect(rateLimitWait(limit())).toBe(20);
    expect(rateLimitWait(limit(600))).toBe(MAX_WAIT_SECONDS);
    expect(rateLimitWait(new Error('API key not valid'))).toBeUndefined();
  });

  it('waits out a per-minute limit and sends again, saying so', async () => {
    const waits: number[] = [];
    const status: string[] = [];
    let calls = 0;
    const result = await withRateLimits(['main'], async model => {
      if (++calls < 3) throw limit(5);
      return `answer from ${model}`;
    }, {sleep: async ms => { waits.push(ms); }, onStatus: text => status.push(text)});
    expect(result).toBe('answer from main');
    expect(waits).toEqual([5000, 5000]);
    expect(status).toEqual(['waiting 5s for the AI\'s per-minute limit', 'waiting 5s for the AI\'s per-minute limit']);
  });

  it('goes on with the next model when one stays limited, and says it switched', async () => {
    const tried: [string, boolean][] = [];
    const status: string[] = [];
    const result = await withRateLimits(['main', 'fallback'], async (model, switched) => {
      tried.push([model, switched]);
      if (model === 'main') throw limit(1);
      return 'ok';
    }, {sleep: async () => {}, onStatus: text => status.push(text)});
    expect(result).toBe('ok');
    expect(tried).toEqual([['main', false], ['main', false], ['main', false], ['fallback', true]]);
    expect(status.at(-1)).toBe('the limit of main is reached, going on with fallback');
  });

  it('gives up with the limit once every model is limited, and never retries other errors', async () => {
    await expectAsync(withRateLimits(['a', 'b'], async () => { throw limit(1); }, {sleep: async () => {}})).toBeRejectedWithError(/429/);
    let calls = 0;
    await expectAsync(withRateLimits(['a', 'b'], async () => { calls++; throw new Error('API key not valid'); })).toBeRejectedWithError(/API key/);
    expect(calls).toBe(1);
  });
});
