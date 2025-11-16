import { RedisRateLimiter } from '../../../src/api/middleware/rateLimit/redisRateLimiter';
import { RateLimiterRuleState } from '../../../src/api/middleware/rateLimit/types';

type EvalArgs = {
  keys: string[];
  arguments: string[];
};

class MockRedisClient {
  private store = new Map<string, Array<{ score: number; value: string }>>();

  async eval(_script: string, options: EvalArgs): Promise<[number, number, number]> {
    const key = options.keys[0];
    const [nowStr, windowStartStr, limitStr, ttlStr, member] = options.arguments;
    const now = Number(nowStr);
    const windowStart = Number(windowStartStr);
    const limit = Number(limitStr);
    const ttl = Number(ttlStr);

    const values = this.store.get(key) ?? [];
    const filtered = values.filter((entry) => entry.score > windowStart);
    this.store.set(key, filtered);

    if (filtered.length >= limit) {
      const earliest = filtered[0];
      const reset = earliest ? earliest.score + ttl : now + ttl;
      return [0, filtered.length, reset];
    }

    filtered.push({ score: now, value: member });
    filtered.sort((a, b) => a.score - b.score);
    this.store.set(key, filtered);

    const earliest = filtered[0];
    const reset = earliest ? earliest.score + ttl : now + ttl;
    return [1, filtered.length, reset];
  }

  async zRem(key: string, value: string): Promise<number> {
    const values = this.store.get(key);
    if (!values) {
      return 0;
    }
    const initialLength = values.length;
    const filtered = values.filter((entry) => entry.value !== value);
    this.store.set(key, filtered);
    return initialLength - filtered.length;
  }
}

describe('RedisRateLimiter', () => {
  const createRule = (overrides: Partial<RateLimiterRuleState> = {}): RateLimiterRuleState => ({
    id: 'redis-rule',
    windowMs: 1_000,
    maxRequests: 3,
    mode: 'sliding',
    ...overrides
  });

  it('limits requests using sliding window semantics', async () => {
    const client = new MockRedisClient();
    let current = 0;
    const limiter = new RedisRateLimiter({
      client: client as any,
      keyPrefix: 'test',
      now: () => current
    });
    const rule = createRule();

    for (let i = 0; i < 3; i++) {
      const result = await limiter.hit('client', rule);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2 - i);
    }

    const blocked = await limiter.hit('client', rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);

    current += 1_001;
    const afterWindow = await limiter.hit('client', rule);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(2);
  });

  it('supports burst multiplier when allowed', async () => {
    const client = new MockRedisClient();
    const limiter = new RedisRateLimiter({
      client: client as any,
      keyPrefix: 'test',
      now: () => Date.now()
    });

    const rule = createRule({ burstMultiplier: 2, maxRequests: 2 });

    let result: Awaited<ReturnType<typeof limiter.hit>> | undefined;
    for (let i = 0; i < 4; i++) {
      result = await limiter.hit('client', rule);
    }

    expect(result?.allowed).toBe(true);
    expect(result?.limit).toBe(4);
    expect(result?.remaining).toBe(0);
  });

  it('undo removes the inserted member', async () => {
    const client = new MockRedisClient();
    const limiter = new RedisRateLimiter({
      client: client as any,
      keyPrefix: 'test',
      now: () => Date.now()
    });

    const rule = createRule();
    const hit = await limiter.hit('client', rule);
    expect(hit.allowed).toBe(true);
    expect(hit.context?.value).toBeDefined();

    await limiter.undo(hit.context!);

    for (let i = 0; i < rule.maxRequests; i++) {
      const result = await limiter.hit('client', rule);
      expect(result.allowed).toBe(true);
    }
  });
});


