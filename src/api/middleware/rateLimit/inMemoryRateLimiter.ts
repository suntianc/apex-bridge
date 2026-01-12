import {
  RateLimiter,
  RateLimiterContext,
  RateLimiterHitResult,
  RateLimiterMode,
  RateLimiterRuleState,
} from "./types";

export interface InMemoryRateLimiterOptions {
  defaultMode?: RateLimiterMode;
  defaultBurstMultiplier?: number;
  now?: () => number;
}

interface SlidingStateEntry {
  timestamps: number[];
}

interface FixedWindowStateEntry {
  windowStart: number;
  count: number;
}

const DEFAULT_MODE: RateLimiterMode = "sliding";

/**
 * 内存版限流器，实现滑动窗口与固定窗口两种算法，并支持突发流量放宽。
 * 设计目标：
 * - 滑动窗口：记录窗口内每次命中时间戳，保证限流的平滑性与准确性
 * - 固定窗口：对 windowMs 对齐分片计数，满足简单场景
 * - Burst：通过 burstMultiplier 扩大有效上限，允许短时突发流量
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly now: () => number;
  private readonly defaultMode: RateLimiterMode;
  private readonly defaultBurstMultiplier: number;

  private readonly slidingState = new Map<string, Map<string, SlidingStateEntry>>();
  private readonly fixedState = new Map<string, Map<string, FixedWindowStateEntry>>();

  constructor(options?: InMemoryRateLimiterOptions) {
    this.now = options?.now ?? (() => Date.now());
    this.defaultMode = options?.defaultMode ?? DEFAULT_MODE;
    this.defaultBurstMultiplier = Math.max(options?.defaultBurstMultiplier ?? 1, 1);
  }

  async hit(key: string, rule: RateLimiterRuleState): Promise<RateLimiterHitResult> {
    const mode = rule.mode ?? this.defaultMode;
    if (mode === "fixed") {
      return this.hitFixedWindow(key, rule);
    }
    return this.hitSlidingWindow(key, rule);
  }

  async undo(context: RateLimiterContext): Promise<void> {
    if (context.mode === "fixed") {
      this.undoFixedWindow(context);
    } else {
      this.undoSlidingWindow(context);
    }
  }

  private hitSlidingWindow(key: string, rule: RateLimiterRuleState): RateLimiterHitResult {
    const burstMultiplier = Math.max(rule.burstMultiplier ?? this.defaultBurstMultiplier, 1);
    const limit = Math.max(Math.floor(rule.maxRequests * burstMultiplier), rule.maxRequests);
    const now = this.now();
    const windowStartThreshold = now - rule.windowMs;

    const ruleBuckets = this.ensureSlidingRule(rule.id);
    const entry = this.ensureSlidingEntry(ruleBuckets, key);
    const timestamps = entry.timestamps;

    // 清理过期时间戳（按顺序存储，O(n) 最坏，但 n 一般 <= limit）
    while (timestamps.length > 0 && timestamps[0] <= windowStartThreshold) {
      timestamps.shift();
    }

    if (timestamps.length >= limit) {
      const earliest = timestamps[0];
      const resetAt = earliest + rule.windowMs;
      return {
        allowed: false,
        limit,
        remaining: 0,
        reset: resetAt,
      };
    }

    timestamps.push(now);
    const remaining = Math.max(limit - timestamps.length, 0);
    const firstTimestamp = timestamps[0] ?? now;
    const resetAt = firstTimestamp + rule.windowMs;

    return {
      allowed: true,
      limit,
      remaining,
      reset: resetAt,
      context: {
        ruleId: rule.id,
        key,
        mode: "sliding",
        timestamp: now,
      },
    };
  }

  private hitFixedWindow(key: string, rule: RateLimiterRuleState): RateLimiterHitResult {
    const burstMultiplier = Math.max(rule.burstMultiplier ?? this.defaultBurstMultiplier, 1);
    const limit = Math.max(Math.floor(rule.maxRequests * burstMultiplier), rule.maxRequests);
    const now = this.now();
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;

    const ruleBuckets = this.ensureFixedRule(rule.id);
    const entry = this.ensureFixedEntry(ruleBuckets, key);

    if (entry.windowStart !== windowStart) {
      entry.windowStart = windowStart;
      entry.count = 0;
    }

    if (entry.count >= limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        reset: entry.windowStart + rule.windowMs,
      };
    }

    entry.count += 1;
    const remaining = Math.max(limit - entry.count, 0);

    return {
      allowed: true,
      limit,
      remaining,
      reset: entry.windowStart + rule.windowMs,
      context: {
        ruleId: rule.id,
        key,
        mode: "fixed",
        timestamp: now,
        windowStart: entry.windowStart,
      },
    };
  }

  private undoSlidingWindow(context: RateLimiterContext): void {
    const ruleBuckets = this.slidingState.get(context.ruleId);
    if (!ruleBuckets) {
      return;
    }
    const entry = ruleBuckets.get(context.key);
    if (!entry) {
      return;
    }

    const index = entry.timestamps.lastIndexOf(context.timestamp);
    if (index >= 0) {
      entry.timestamps.splice(index, 1);
    }

    if (entry.timestamps.length === 0) {
      ruleBuckets.delete(context.key);
    }
    if (ruleBuckets.size === 0) {
      this.slidingState.delete(context.ruleId);
    }
  }

  private undoFixedWindow(context: RateLimiterContext): void {
    const ruleBuckets = this.fixedState.get(context.ruleId);
    if (!ruleBuckets) {
      return;
    }
    const entry = ruleBuckets.get(context.key);
    if (!entry) {
      return;
    }
    if (entry.windowStart !== context.windowStart || entry.count === 0) {
      return;
    }

    entry.count = Math.max(entry.count - 1, 0);
    if (entry.count === 0) {
      ruleBuckets.delete(context.key);
    }
    if (ruleBuckets.size === 0) {
      this.fixedState.delete(context.ruleId);
    }
  }

  private ensureSlidingRule(ruleId: string): Map<string, SlidingStateEntry> {
    let ruleBuckets = this.slidingState.get(ruleId);
    if (!ruleBuckets) {
      ruleBuckets = new Map<string, SlidingStateEntry>();
      this.slidingState.set(ruleId, ruleBuckets);
    }
    return ruleBuckets;
  }

  private ensureSlidingEntry(
    buckets: Map<string, SlidingStateEntry>,
    key: string
  ): SlidingStateEntry {
    let entry = buckets.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      buckets.set(key, entry);
    }
    return entry;
  }

  private ensureFixedRule(ruleId: string): Map<string, FixedWindowStateEntry> {
    let ruleBuckets = this.fixedState.get(ruleId);
    if (!ruleBuckets) {
      ruleBuckets = new Map<string, FixedWindowStateEntry>();
      this.fixedState.set(ruleId, ruleBuckets);
    }
    return ruleBuckets;
  }

  private ensureFixedEntry(
    buckets: Map<string, FixedWindowStateEntry>,
    key: string
  ): FixedWindowStateEntry {
    let entry = buckets.get(key);
    if (!entry) {
      entry = { windowStart: 0, count: 0 };
      buckets.set(key, entry);
    }
    return entry;
  }
}
