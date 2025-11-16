import { randomUUID } from 'crypto';
import {
  EpisodicMemoryEvent,
  EpisodicMemoryQuery,
  EpisodicMemoryResult,
  EpisodicTimelineDiagnostics
} from '../../../types/memory';
import { EpisodicMemoryStore } from './EpisodicMemoryStore';

export class InMemoryEpisodicStore implements EpisodicMemoryStore {
  private events: EpisodicMemoryResult[] = [];

  async append(event: EpisodicMemoryEvent): Promise<EpisodicMemoryResult> {
    const stored: EpisodicMemoryResult = {
      id: event.id ?? randomUUID(),
      ...event
    };
    this.events.push(stored);
    // 保持按 timestamp 升序，便于后续窗口过滤
    this.events.sort((a, b) => a.timestamp - b.timestamp);
    return stored;
  }

  async list(query: EpisodicMemoryQuery, limit?: number): Promise<EpisodicMemoryResult[]> {
    const filtered = this.events.filter((event) => this.matchesQuery(event, query));
    return filtered.slice(-1 * (limit ?? filtered.length));
  }

  async getRecent(
    userId: string,
    options?: {
      personaId?: string;
      householdId?: string;
      limit?: number;
      eventTypes?: Array<EpisodicMemoryEvent['eventType']>;
    }
  ): Promise<EpisodicMemoryResult[]> {
    const filtered = this.events.filter((event) => {
      if (event.userId !== userId) {
        return false;
      }
      if (options?.personaId && event.personaId !== options.personaId) {
        return false;
      }
      if (options?.householdId && event.householdId !== options.householdId) {
        return false;
      }
      if (options?.eventTypes && options.eventTypes.length > 0) {
        return options.eventTypes.includes(event.eventType);
      }
      return true;
    });
    const limit = options?.limit ?? 10;
    return filtered.slice(-limit).reverse();
  }

  async delete(id: string): Promise<void> {
    this.events = this.events.filter((event) => event.id !== id);
  }

  async getTimelineDiagnostics(): Promise<EpisodicTimelineDiagnostics> {
    const latest = this.events.length ? this.events[this.events.length - 1].timestamp : undefined;
    return {
      segmentId: 'in-memory',
      segmentCount: 1,
      latestTimestamp: latest,
      storeType: 'in-memory'
    };
  }

  async pruneExpired(cutoffTimestamp: number): Promise<EpisodicMemoryResult[]> {
    if (!Number.isFinite(cutoffTimestamp)) {
      return [];
    }
    const expired: EpisodicMemoryResult[] = [];
    const retained: EpisodicMemoryResult[] = [];
    for (const event of this.events) {
      if (event.timestamp < cutoffTimestamp) {
        expired.push(event);
      } else {
        retained.push(event);
      }
    }
    if (expired.length > 0) {
      this.events = retained;
    }
    return expired;
  }

  private matchesQuery(event: EpisodicMemoryResult, query: EpisodicMemoryQuery): boolean {
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
    if (query.window) {
      const { from, to, lastDays } = query.window;
      const timestamp = event.timestamp;
      if (typeof from === 'number' && timestamp < from) {
        return false;
      }
      if (typeof to === 'number' && timestamp > to) {
        return false;
      }
      if (typeof lastDays === 'number') {
        const minTime = Date.now() - lastDays * 24 * 60 * 60 * 1000;
        if (timestamp < minTime) {
          return false;
        }
      }
    }
    return true;
  }
}

