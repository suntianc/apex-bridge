export type RateLimiterMode = 'sliding' | 'fixed';

export interface RateLimiterRuleState {
  id: string;
  windowMs: number;
  maxRequests: number;
  mode?: RateLimiterMode;
  burstMultiplier?: number;
}

export interface RateLimiterContext {
  ruleId: string;
  key: string;
  timestamp: number;
  windowStart?: number;
  mode: RateLimiterMode;
  value?: string;
}

export interface RateLimiterHitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
  context?: RateLimiterContext;
}

export interface RateLimiter {
  hit(key: string, rule: RateLimiterRuleState): Promise<RateLimiterHitResult>;
  undo(context: RateLimiterContext): Promise<void>;
}


