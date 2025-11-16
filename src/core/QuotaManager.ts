import { logger } from '../utils/logger';
import { LLMQuotaConfig } from '../types';

export type QuotaViolationCode =
  | 'requests_per_minute_exceeded'
  | 'token_quota_exceeded'
  | 'stream_concurrency_exceeded';

export interface QuotaDecision {
  allowed: boolean;
  code?: QuotaViolationCode;
  message?: string;
}

export interface CompleteRequestOptions {
  stream?: boolean;
  tokens?: number;
}

interface NodeQuotaState {
  requestTimestamps: number[];
  tokensToday: number;
  streamsInFlight: number;
  resetAt: number;
}

const DEFAULT_QUOTA_CONFIG: Required<LLMQuotaConfig> = {
  maxRequestsPerMinute: 30,
  maxTokensPerDay: 200_000,
  maxConcurrentStreams: 3,
  burstMultiplier: 2
};

const ONE_MINUTE_MS = 60_000;

export class QuotaManager {
  private config: Required<LLMQuotaConfig>;
  private readonly nodeStates = new Map<string, NodeQuotaState>();

  constructor(initialConfig?: LLMQuotaConfig) {
    this.config = this.normalizeConfig(initialConfig);
  }

  updateConfig(newConfig?: LLMQuotaConfig): void {
    this.config = this.normalizeConfig(newConfig);
  }

  consumeRequest(nodeId: string, options: { stream?: boolean } = {}): QuotaDecision {
    const state = this.getNodeState(nodeId);
    this.resetDailyIfNeeded(state);

    const now = Date.now();
    const windowLimit = Math.max(
      0,
      Math.floor(this.config.maxRequestsPerMinute * (options.stream ? this.config.burstMultiplier : 1))
    );

    if (windowLimit > 0) {
      this.pruneOldRequests(state, now);
      if (state.requestTimestamps.length >= windowLimit) {
        return {
          allowed: false,
          code: 'requests_per_minute_exceeded',
          message: `Exceeded ${windowLimit} requests per minute limit`
        };
      }
    }

    if (this.config.maxTokensPerDay > 0 && state.tokensToday >= this.config.maxTokensPerDay) {
      return {
        allowed: false,
        code: 'token_quota_exceeded',
        message: 'Daily token quota exceeded'
      };
    }

    if (options.stream && this.config.maxConcurrentStreams > 0 && state.streamsInFlight >= this.config.maxConcurrentStreams) {
      return {
        allowed: false,
        code: 'stream_concurrency_exceeded',
        message: 'Concurrent stream limit reached'
      };
    }

    state.requestTimestamps.push(now);
    if (options.stream) {
      state.streamsInFlight += 1;
    }

    return { allowed: true };
  }

  completeRequest(nodeId: string, options: CompleteRequestOptions = {}): void {
    const state = this.getNodeState(nodeId);
    this.resetDailyIfNeeded(state);

    if (options.stream && state.streamsInFlight > 0) {
      state.streamsInFlight -= 1;
    }

    if (typeof options.tokens === 'number' && options.tokens > 0) {
      state.tokensToday += options.tokens;
      if (this.config.maxTokensPerDay > 0 && state.tokensToday > this.config.maxTokensPerDay) {
        logger.warn(
          `[QuotaManager] Node ${nodeId} exceeded daily token quota (${state.tokensToday}/${this.config.maxTokensPerDay})`
        );
      }
    }
  }

  getState(nodeId: string): NodeQuotaState {
    return { ...this.getNodeState(nodeId), requestTimestamps: [...this.getNodeState(nodeId).requestTimestamps] };
  }

  private normalizeConfig(config?: LLMQuotaConfig): Required<LLMQuotaConfig> {
    return {
      maxRequestsPerMinute: config?.maxRequestsPerMinute ?? DEFAULT_QUOTA_CONFIG.maxRequestsPerMinute,
      maxTokensPerDay: config?.maxTokensPerDay ?? DEFAULT_QUOTA_CONFIG.maxTokensPerDay,
      maxConcurrentStreams: config?.maxConcurrentStreams ?? DEFAULT_QUOTA_CONFIG.maxConcurrentStreams,
      burstMultiplier: config?.burstMultiplier ?? DEFAULT_QUOTA_CONFIG.burstMultiplier
    };
  }

  private getNodeState(nodeId: string): NodeQuotaState {
    let state = this.nodeStates.get(nodeId);
    if (!state) {
      state = {
        requestTimestamps: [],
        tokensToday: 0,
        streamsInFlight: 0,
        resetAt: this.getNextResetTimestamp()
      };
      this.nodeStates.set(nodeId, state);
    }
    return state;
  }

  private pruneOldRequests(state: NodeQuotaState, now: number): void {
    state.requestTimestamps = state.requestTimestamps.filter((timestamp) => now - timestamp < ONE_MINUTE_MS);
  }

  private resetDailyIfNeeded(state: NodeQuotaState): void {
    const now = Date.now();
    if (now >= state.resetAt) {
      state.tokensToday = 0;
      state.resetAt = this.getNextResetTimestamp();
    }
  }

  private getNextResetTimestamp(): number {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return next.getTime();
  }
}

