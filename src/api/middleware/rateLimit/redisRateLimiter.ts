import type { RedisClientType } from 'redis';
import {
  RateLimiter,
  RateLimiterContext,
  RateLimiterHitResult,
  RateLimiterMode,
  RateLimiterRuleState
} from './types';

export interface RedisRateLimiterOptions {
  client: RedisClientType<any, any, any>;
  keyPrefix?: string;
  now?: () => number;
}

export class RedisRateLimiter implements RateLimiter {
  private readonly client: RedisClientType<any, any, any>;
  private readonly now: () => number;
  private readonly keyPrefix: string;

  private static readonly HIT_SCRIPT = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local windowStart = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local ttl = tonumber(ARGV[4])
    local member = ARGV[5]

    redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
    local currentCount = redis.call('ZCARD', key)

    if currentCount >= limit then
      local earliest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local resetAt = 0
      if earliest[2] then
        resetAt = tonumber(earliest[2]) + ttl
      end
      return {0, currentCount, resetAt}
    end

    redis.call('ZADD', key, now, member)
    redis.call('PEXPIRE', key, ttl)
    local newCount = currentCount + 1
    local earliest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local resetAt = 0
    if earliest[2] then
      resetAt = tonumber(earliest[2]) + ttl
    end
    return {1, newCount, resetAt}
  `;

  constructor(options: RedisRateLimiterOptions) {
    this.client = options.client;
    this.keyPrefix = options.keyPrefix ?? 'rate_limit';
    this.now = options.now ?? (() => Date.now());
  }

  public getClient(): RedisClientType<any, any, any> {
    return this.client;
  }

  public async hit(key: string, rule: RateLimiterRuleState): Promise<RateLimiterHitResult> {
    const mode: RateLimiterMode = rule.mode === 'fixed' ? 'fixed' : 'sliding';
    const burstMultiplier = Math.max(rule.burstMultiplier ?? 1, 1);
    const limit = Math.max(Math.floor(rule.maxRequests * burstMultiplier), rule.maxRequests);
    const now = this.now();
    const windowStart = now - rule.windowMs;
    const ttlMs = Math.max(rule.windowMs, 1000);
    const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;

    const redisKey = this.composeKey(rule.id, key);

    const response = (await this.client.eval(RedisRateLimiter.HIT_SCRIPT, {
      keys: [redisKey],
      arguments: [
        now.toString(10),
        windowStart.toString(10),
        limit.toString(10),
        ttlMs.toString(10),
        member
      ]
    })) as [number, number, number?] | null;

    if (!response) {
      throw new Error('Redis rate limiter returned null response');
    }

    const allowed = response[0] === 1;
    const count = typeof response[1] === 'number' ? response[1] : 0;
    const resetTimestamp = typeof response[2] === 'number' ? response[2] : now + rule.windowMs;

    if (!allowed) {
      return {
        allowed: false,
        limit,
        remaining: Math.max(limit - count, 0),
        reset: resetTimestamp
      };
    }

    const remaining = Math.max(limit - count, 0);

    return {
      allowed: true,
      limit,
      remaining,
      reset: resetTimestamp,
      context: {
        ruleId: rule.id,
        key,
        mode,
        timestamp: now,
        value: member
      }
    };
  }

  public async undo(context: RateLimiterContext): Promise<void> {
    if (!context.value) {
      return;
    }

    const redisKey = this.composeKey(context.ruleId, context.key);
    try {
      await this.client.zRem(redisKey, context.value);
    } catch {
      // Silent failure; fallback limiter will handle eventual consistency.
    }
  }

  private composeKey(ruleId: string, identifier: string): string {
    return `${this.keyPrefix}:${ruleId}:${identifier}`;
  }
}


