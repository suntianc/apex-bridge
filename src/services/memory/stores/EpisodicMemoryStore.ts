import {
  EpisodicMemoryEvent,
  EpisodicMemoryQuery,
  EpisodicMemoryResult,
  EpisodicTimelineDiagnostics
} from '../../../types/memory';

export interface EpisodicMemoryStore {
  append(event: EpisodicMemoryEvent): Promise<EpisodicMemoryResult>;
  list(query: EpisodicMemoryQuery, limit?: number): Promise<EpisodicMemoryResult[]>;
  getRecent(
    userId: string,
    options?: {
      personaId?: string;
      householdId?: string;
      limit?: number;
      eventTypes?: Array<EpisodicMemoryEvent['eventType']>;
    }
  ): Promise<EpisodicMemoryResult[]>;
  delete?(id: string): Promise<void>;
  getTimelineDiagnostics?(): Promise<EpisodicTimelineDiagnostics> | EpisodicTimelineDiagnostics;
  pruneExpired?(cutoffTimestamp: number): Promise<EpisodicMemoryResult[]>;
}

