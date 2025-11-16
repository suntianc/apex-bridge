import path from 'path';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import {
  EpisodicMemoryEvent,
  EpisodicMemoryQuery,
  EpisodicMemoryResult,
  EpisodicTimelineDiagnostics
} from '../../../types/memory';
import { EpisodicMemoryStore } from './EpisodicMemoryStore';

export interface TimeSeriesEpisodicStoreOptions {
  baseDir?: string;
  segmentSize?: number;
  retentionMs?: number;
}

export class TimeSeriesEpisodicStore implements EpisodicMemoryStore {
  private readonly baseDir: string;
  private readonly segmentSize: number;
  private readonly retentionMs?: number;
  private events: EpisodicMemoryResult[] = [];
  private currentSegmentPath: string | null = null;
  private currentSegmentCount = 0;
  private segmentCounter = 0;
  private currentSegmentId: string | null = null;
  private readonly segmentFiles = new Set<string>();
  private ready: Promise<void>;

  constructor(options: TimeSeriesEpisodicStoreOptions = {}) {
    this.baseDir =
      options.baseDir ?? path.resolve(process.cwd(), 'workDir/episodic-timeline');
    this.segmentSize = options.segmentSize ?? 500;
    this.retentionMs = options.retentionMs;
    this.ready = this.bootstrap();
  }

  async append(event: EpisodicMemoryEvent): Promise<EpisodicMemoryResult> {
    await this.ready;
    const stored: EpisodicMemoryResult = {
      id: event.id ?? randomUUID(),
      ...event
    };
    this.events.push(stored);
    this.events.sort((a, b) => a.timestamp - b.timestamp);
    await this.persistEvent(stored);
    if (this.retentionMs) {
      await this.pruneExpiredEvents(Date.now() - this.retentionMs);
    }
    return stored;
  }

  async list(query: EpisodicMemoryQuery, limit?: number): Promise<EpisodicMemoryResult[]> {
    await this.ready;
    const filtered = this.events.filter((event) => this.matchesQuery(event, query));
    return limit ? filtered.slice(-limit) : filtered;
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
    await this.ready;
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
    await this.ready;
    const before = this.events.length;
    this.events = this.events.filter((event) => event.id !== id);
    if (this.events.length !== before) {
      await this.rewriteSegments();
    }
  }

  async getTimelineDiagnostics(): Promise<EpisodicTimelineDiagnostics> {
    await this.ready;
    const latest = this.events.length ? this.events[this.events.length - 1].timestamp : undefined;
    return {
      segmentId: this.currentSegmentId ?? undefined,
      segmentCount: this.segmentFiles.size || (this.currentSegmentId ? 1 : 0),
      retentionMs: this.retentionMs,
      latestTimestamp: latest,
      storeType: 'time-series'
    };
  }

  async pruneExpired(cutoffTimestamp: number): Promise<EpisodicMemoryResult[]> {
    await this.ready;
    if (!this.retentionMs || !Number.isFinite(cutoffTimestamp)) {
      return [];
    }
    return this.pruneExpiredEvents(cutoffTimestamp);
  }

  private async bootstrap(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const files = (await fs.readdir(this.baseDir))
      .filter((file) => file.startsWith('segment-') && file.endsWith('.jsonl'))
      .sort();

    for (const file of files) {
      const fullPath = path.join(this.baseDir, file);
       this.segmentFiles.add(file);
      const contents = await fs.readFile(fullPath, 'utf-8');
      const lines = contents.split('\n').filter((line) => line.trim().length > 0);
      for (const line of lines) {
        try {
          const parsed: EpisodicMemoryResult = JSON.parse(line);
          this.events.push(parsed);
        } catch (error) {
           
          console.warn(`[TimeSeriesEpisodicStore] Failed to parse line in ${file}`, error);
        }
      }
      this.segmentCounter = Math.max(this.segmentCounter, this.segmentNumberFromName(file));
      this.currentSegmentPath = fullPath;
      this.currentSegmentId = path.basename(fullPath);
      this.currentSegmentCount = lines.length;
    }

    if (!this.currentSegmentPath) {
      await this.rotateSegment();
    }

    this.events.sort((a, b) => a.timestamp - b.timestamp);
    if (this.retentionMs) {
      await this.pruneExpiredEvents(Date.now() - this.retentionMs);
    }
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
      const ts = event.timestamp;
      if (typeof from === 'number' && ts < from) {
        return false;
      }
      if (typeof to === 'number' && ts > to) {
        return false;
      }
      if (typeof lastDays === 'number') {
        const cutoff = Date.now() - lastDays * 24 * 60 * 60 * 1000;
        if (ts < cutoff) {
          return false;
        }
      }
    }
    return true;
  }

  private async persistEvent(event: EpisodicMemoryResult): Promise<void> {
    if (!this.currentSegmentPath) {
      await this.rotateSegment();
    }
    if (this.currentSegmentCount >= this.segmentSize) {
      await this.rotateSegment();
    }

    if (!event.metadata) {
      event.metadata = {};
    }
    event.metadata.timeline = {
      ...(event.metadata.timeline || {}),
      segmentId: this.currentSegmentId ?? undefined,
      offset: this.currentSegmentCount
    };

    await fs.appendFile(
      this.currentSegmentPath as string,
      `${JSON.stringify(event)}\n`,
      'utf-8'
    );
    this.currentSegmentCount += 1;
  }

  private async rotateSegment(): Promise<void> {
    this.segmentCounter += 1;
    const fileName = this.formatSegmentName(this.segmentCounter);
    this.currentSegmentPath = path.join(this.baseDir, fileName);
    await fs.writeFile(this.currentSegmentPath, '', 'utf-8');
    this.currentSegmentCount = 0;
    this.currentSegmentId = fileName;
    this.segmentFiles.add(fileName);
  }

  private formatSegmentName(counter: number): string {
    return `segment-${counter.toString().padStart(6, '0')}.jsonl`;
  }

  private segmentNumberFromName(name: string): number {
    const match = name.match(/segment-(\d+)\.jsonl/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private async pruneExpiredEvents(cutoffTimestamp: number): Promise<EpisodicMemoryResult[]> {
    if (!this.retentionMs) {
      return [];
    }
    const expired = this.events.filter((event) => event.timestamp < cutoffTimestamp);
    if (!expired.length) {
      return [];
    }
    this.events = this.events.filter((event) => event.timestamp >= cutoffTimestamp);
    await this.rewriteSegments();
    return expired;
  }

  private async rewriteSegments(): Promise<void> {
    // Remove existing segment files
    const files = await fs.readdir(this.baseDir);
    await Promise.all(
      files
        .filter((file) => file.startsWith('segment-') && file.endsWith('.jsonl'))
        .map((file) => fs.unlink(path.join(this.baseDir, file)))
    );

    this.segmentFiles.clear();
    this.segmentCounter = 0;
    this.currentSegmentPath = null;
    this.currentSegmentCount = 0;
    this.currentSegmentId = null;

    const chunks: EpisodicMemoryResult[][] = [];
    for (let i = 0; i < this.events.length; i += this.segmentSize) {
      chunks.push(this.events.slice(i, i + this.segmentSize));
    }

    for (const chunk of chunks) {
      await this.rotateSegment();
      if (!this.currentSegmentPath) {
        continue;
      }
      const payload = chunk.map((event) => JSON.stringify(event)).join('\n');
      await fs.writeFile(
        this.currentSegmentPath,
        payload.length > 0 ? `${payload}\n` : '',
        'utf-8'
      );
      this.currentSegmentCount = chunk.length;
    }

    if (!this.currentSegmentPath) {
      await this.rotateSegment();
    }
  }
}

