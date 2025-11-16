import { EventEmitter } from 'events';
import {
  EpisodicMemoryDiagnostics,
  EpisodicMemoryEvent,
  EpisodicMemoryOptions,
  EpisodicMemoryQuery,
  EpisodicMemoryResult,
  EpisodicMemorySummary,
  EpisodicTimelineDiagnostics
} from '../../types/memory';
import { EpisodicMemoryStore } from './stores/EpisodicMemoryStore';
import logger from '../../utils/logger';

export interface EpisodicMemorySearchResponse {
  events: EpisodicMemoryResult[];
  diagnostics?: EpisodicMemoryDiagnostics;
}

export interface EpisodicMemoryService {
  /**
   * 写入情景记忆事件
   */
  recordEvent(
    event: EpisodicMemoryEvent,
    options?: Partial<EpisodicMemoryOptions>
  ): Promise<EpisodicMemoryResult>;

  /**
   * 查询最近 N 条事件
   */
  getRecentEvents(
    userId: string,
    options?: {
      personaId?: string;
      householdId?: string;
      limit?: number;
      eventTypes?: Array<EpisodicMemoryEvent['eventType']>;
    }
  ): Promise<EpisodicMemoryResult[]>;

  /**
   * 按时间窗口检索
   */
  queryWindow(
    query: EpisodicMemoryQuery,
    options?: Partial<EpisodicMemoryOptions>
  ): Promise<EpisodicMemorySearchResponse>;

  /**
   * 对时间范围做关键信息汇总
   */
  summarizeRange(
    query: EpisodicMemoryQuery,
    options?: Partial<EpisodicMemoryOptions>
  ): Promise<EpisodicMemorySummary>;
}

export class DefaultEpisodicMemoryService implements EpisodicMemoryService {
  constructor(
    private readonly store: EpisodicMemoryStore,
    private readonly baseOptions: EpisodicMemoryOptions,
    private readonly events?: EventEmitter
  ) {}

  async recordEvent(
    event: EpisodicMemoryEvent,
    options?: Partial<EpisodicMemoryOptions>
  ): Promise<EpisodicMemoryResult> {
    try {
      const resolved = this.resolveOptions(options);
      this.validateEvent(event);

      const result = await this.store.append(event);
      const diagnostics = await this.getTimelineDiagnostics();

      this.emit('memory:episodic:saved', {
        event: result,
        segmentId: diagnostics?.segmentId,
        segmentCount: diagnostics?.segmentCount,
        retentionMs: diagnostics?.retentionMs ?? resolved.retentionMs,
        timelineLagMs: Math.max(0, Date.now() - result.timestamp),
        storeType: diagnostics?.storeType ?? 'unknown'
      });

      if (resolved.retentionMs && typeof (this.store as any).pruneExpired === 'function') {
        const cutoff = Date.now() - resolved.retentionMs;
        const pruned: EpisodicMemoryResult[] =
          (await (this.store as any).pruneExpired(cutoff)) ?? [];
        if (pruned.length > 0) {
          this.emit('memory:episodic:pruned', {
            events: pruned.map((expired) => ({
              id: expired.id,
              userId: expired.userId,
              personaId: expired.personaId,
              timestamp: expired.timestamp,
              content: expired.content
            })),
            segmentId: diagnostics?.segmentId,
            retentionMs: diagnostics?.retentionMs ?? resolved.retentionMs
          });
        }
      }

      return result;
    } catch (error: any) {
      this.emitWarning('Failed to record episodic event', error);
      throw error;
    }
  }

  getRecentEvents(
    userId: string,
    options?: {
      personaId?: string;
      householdId?: string;
      limit?: number;
      eventTypes?: Array<EpisodicMemoryEvent['eventType']>;
    }
  ): Promise<EpisodicMemoryResult[]> {
    return this.store.getRecent(userId, options);
  }

  async queryWindow(
    query: EpisodicMemoryQuery,
    options?: Partial<EpisodicMemoryOptions>
  ): Promise<EpisodicMemorySearchResponse> {
    const resolved = this.resolveOptions(options);
    const start = Date.now();
    const timeWindow = this.ensureWindow(query, resolved);
    const scanQuery: EpisodicMemoryQuery = {
      userId: query.userId,
      householdId: query.householdId
    };

    const events = await this.store.list(scanQuery);
    const diagnostics: EpisodicMemoryDiagnostics = {
      totalEvents: events.length,
      filteredByContext: 0,
      filteredByWindow: 0,
      returned: 0
    };

    const filteredByContext = events.filter((event) => this.matchesContext(event, query));
    diagnostics.filteredByContext = events.length - filteredByContext.length;

    const filteredByWindow = filteredByContext.filter((event) =>
      this.matchesWindow(event.timestamp, timeWindow)
    );
    diagnostics.filteredByWindow = filteredByContext.length - filteredByWindow.length;

    const result = filteredByWindow.sort((a, b) => b.timestamp - a.timestamp);
    diagnostics.returned = result.length;
    diagnostics.durationMs = Date.now() - start;

    return {
      events: result,
      diagnostics: query.includeDiagnostics ? diagnostics : undefined
    };
  }

  async summarizeRange(
    query: EpisodicMemoryQuery,
    options?: Partial<EpisodicMemoryOptions>
  ): Promise<EpisodicMemorySummary> {
    const response = await this.queryWindow(query, options);
    if (response.events.length === 0) {
      return {
        earliest: null,
        latest: null,
        eventTypes: {},
        total: 0
      };
    }

    const timestamps = response.events.map((event) => event.timestamp);
    const eventTypesCount = response.events.reduce<Record<string, number>>((acc, event) => {
      acc[event.eventType] = (acc[event.eventType] || 0) + 1;
      return acc;
    }, {});

    return {
      earliest: Math.min(...timestamps),
      latest: Math.max(...timestamps),
      eventTypes: eventTypesCount,
      total: response.events.length
    };
  }

  private resolveOptions(overrides?: Partial<EpisodicMemoryOptions>): EpisodicMemoryOptions {
    return {
      ...this.baseOptions,
      ...overrides
    };
  }

  private validateEvent(event: EpisodicMemoryEvent): void {
    if (!event.userId) {
      throw new Error('EpisodicMemoryEvent.userId is required');
    }
    if (!event.eventType) {
      throw new Error('EpisodicMemoryEvent.eventType is required');
    }
    if (typeof event.timestamp !== 'number') {
      throw new Error('EpisodicMemoryEvent.timestamp must be a number');
    }
  }

  private ensureWindow(
    query: EpisodicMemoryQuery,
    options: EpisodicMemoryOptions
  ): Required<EpisodicMemoryQuery>['window'] {
    if (query.window) {
      return query.window;
    }
    const defaultDays = options.defaultWindowDays ?? 30;
    return {
      lastDays: defaultDays
    };
  }

  private matchesContext(event: EpisodicMemoryResult, query: EpisodicMemoryQuery): boolean {
    if (query.userId && event.userId !== query.userId) {
      return false;
    }
    if (query.householdId && event.householdId !== query.householdId) {
      return false;
    }
    if (query.personaId && event.personaId !== query.personaId) {
      return false;
    }
    if (query.eventTypes && query.eventTypes.length > 0 && !query.eventTypes.includes(event.eventType)) {
      return false;
    }
    return true;
  }

  private matchesWindow(timestamp: number, window?: EpisodicMemoryQuery['window']): boolean {
    if (!window) {
      return true;
    }
    if (window.from && timestamp < window.from) {
      return false;
    }
    if (window.to && timestamp > window.to) {
      return false;
    }
    if (window.lastDays) {
      const min = Date.now() - window.lastDays * 24 * 60 * 60 * 1000;
      if (timestamp < min) {
        return false;
      }
    }
    return true;
  }

  private emit(eventName: string, payload: any): void {
    if (this.events) {
      this.events.emit(eventName, payload);
    }
  }

  private async getTimelineDiagnostics(): Promise<EpisodicTimelineDiagnostics | undefined> {
    const store = this.store as EpisodicMemoryStore & {
      getTimelineDiagnostics?: () =>
        | EpisodicTimelineDiagnostics
        | Promise<EpisodicTimelineDiagnostics>;
    };
    if (typeof store.getTimelineDiagnostics === 'function') {
      return store.getTimelineDiagnostics();
    }
    return undefined;
  }

  private emitWarning(message: string, error?: Error): void {
    logger.warn(`[EpisodicMemory] ${message}${error?.message ? `: ${error.message}` : ''}`);
    this.emit('memory:episodic:warning', {
      message,
      error: error?.message
    });
  }
}

