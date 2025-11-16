import { InMemoryRateLimiter } from '../../../src/api/middleware/rateLimit/inMemoryRateLimiter';
import { RateLimiterRuleState } from '../../../src/api/middleware/rateLimit/types';

describe('InMemoryRateLimiter', () => {
  const createClock = () => {
    let current = 0;
    return {
      now: () => current,
      advanceBy: (ms: number) => {
        current += ms;
      }
    };
  };

  const createLimiter = (clock: ReturnType<typeof createClock>) =>
    new InMemoryRateLimiter({ now: clock.now });

  const hitTimes = async (
    limiter: InMemoryRateLimiter,
    key: string,
    rule: RateLimiterRuleState,
    times: number
  ) => {
    let lastResult;
    for (let i = 0; i < times; i++) {
      lastResult = await limiter.hit(key, rule);
    }
    return lastResult!;
  };

  it('enforces sliding window limits with rolling reset', async () => {
    const clock = createClock();
    const limiter = createLimiter(clock);
    const rule: RateLimiterRuleState = {
      id: 'sliding',
      windowMs: 1_000,
      maxRequests: 3,
      mode: 'sliding'
    };

    for (let i = 0; i < 3; i++) {
      const result = await limiter.hit('client', rule);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2 - i);
    }

    const blocked = await limiter.hit('client', rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);

    // Advance beyond window to release oldest entry
    clock.advanceBy(1_001);

    const afterWindow = await limiter.hit('client', rule);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(2);
  });

  it('supports burst multiplier for sliding mode', async () => {
    const clock = createClock();
    const limiter = createLimiter(clock);
    const rule: RateLimiterRuleState = {
      id: 'burst-sliding',
      windowMs: 2_000,
      maxRequests: 5,
      mode: 'sliding',
      burstMultiplier: 2
    };

    const result = await hitTimes(limiter, 'client', rule, 10);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(0);

    const blocked = await limiter.hit('client', rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limit).toBe(10);
  });

  it('resets counts per fixed window', async () => {
    const clock = createClock();
    const limiter = createLimiter(clock);
    const rule: RateLimiterRuleState = {
      id: 'fixed',
      windowMs: 1_000,
      maxRequests: 3,
      mode: 'fixed'
    };

    for (let i = 0; i < 3; i++) {
      const result = await limiter.hit('client', rule);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2 - i);
    }

    const blocked = await limiter.hit('client', rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reset).toBe(1_000);

    clock.advanceBy(1_000);

    const afterReset = await limiter.hit('client', rule);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(2);
  });

  it('can roll back hits using undo for both modes', async () => {
    const clock = createClock();
    const limiter = createLimiter(clock);
    const slidingRule: RateLimiterRuleState = {
      id: 'undo-sliding',
      windowMs: 1_000,
      maxRequests: 1,
      mode: 'sliding'
    };

    const slidingHit = await limiter.hit('client', slidingRule);
    expect(slidingHit.allowed).toBe(true);
    await limiter.undo(slidingHit.context!);
    const afterUndoSliding = await limiter.hit('client', slidingRule);
    expect(afterUndoSliding.allowed).toBe(true);

    const fixedRule: RateLimiterRuleState = {
      id: 'undo-fixed',
      windowMs: 1_000,
      maxRequests: 1,
      mode: 'fixed'
    };

    const fixedHit = await limiter.hit('client', fixedRule);
    expect(fixedHit.allowed).toBe(true);
    await limiter.undo(fixedHit.context!);
    const afterUndoFixed = await limiter.hit('client', fixedRule);
    expect(afterUndoFixed.allowed).toBe(true);
  });
});


