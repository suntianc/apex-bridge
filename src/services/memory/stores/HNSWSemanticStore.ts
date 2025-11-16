import { promises as fs } from 'fs';
import * as path from 'path';
import { HierarchicalNSW } from 'hnswlib-node';
import {
  SemanticMemoryQuery,
  SemanticMemoryRecord,
  SemanticMemoryResult
} from '../../../types/memory';
import { SemanticMemoryStore } from './SemanticMemoryStore';
import logger from '../../../utils/logger';

export interface HNSWSemanticStoreOptions {
  workDir: string;
  dimensions: number;
  space?: 'cosine' | 'l2' | 'ip';
  maxElements?: number;
  efConstruction?: number;
  efSearch?: number;
  indexFileName?: string;
  metadataFileName?: string;
}

interface PersistedMetadata {
  nextLabel: number;
  entries: Array<{ label: number; record: SemanticMemoryResult }>;
}

export class HNSWSemanticStore implements SemanticMemoryStore {
  private readonly space: 'cosine' | 'l2' | 'ip';
  private readonly maxElements: number;
  private readonly efConstruction: number;
  private readonly efSearch: number;
  private readonly indexPath: string;
  private readonly metadataPath: string;

  private readonly ready: Promise<void>;
  private index!: HierarchicalNSW;
  private nextLabel = 0;
  private readonly labelToRecord = new Map<number, SemanticMemoryResult>();
  private readonly idToLabel = new Map<string, number>();

  constructor(private readonly options: HNSWSemanticStoreOptions) {
    this.space = options.space ?? 'cosine';
    this.maxElements = options.maxElements ?? 10_000;
    this.efConstruction = options.efConstruction ?? 200;
    this.efSearch = options.efSearch ?? 100;
    this.indexPath = path.join(options.workDir, options.indexFileName ?? 'semantic-memory.hnsw');
    this.metadataPath = path.join(
      options.workDir,
      options.metadataFileName ?? 'semantic-memory.metadata.json'
    );
    this.ready = this.initialize();
  }

  async save(record: SemanticMemoryRecord): Promise<SemanticMemoryResult> {
    await this.ready;
    const label = this.allocateLabel(record.id);
    const normalized: SemanticMemoryResult = {
      id: record.id!,
      userId: record.userId,
      householdId: record.householdId,
      personaId: record.personaId,
      content: record.content,
      summary: record.summary,
      metadata: record.metadata,
      similarity: 1,
      embedding: record.embedding,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };

    await this.ensureCapacity(label + 1);
    this.index.addPoint(record.embedding, label);
    this.labelToRecord.set(label, normalized);
    this.idToLabel.set(normalized.id, label);

    await this.persist();
    return normalized;
  }

  async getById(id: string): Promise<SemanticMemoryResult | null> {
    await this.ready;
    const label = this.idToLabel.get(id);
    if (label === undefined) {
      return null;
    }
    return this.labelToRecord.get(label) ?? null;
  }

  async search(query: SemanticMemoryQuery): Promise<SemanticMemoryResult[]> {
    await this.ready;
    const count = this.index.getCurrentCount();
    if (!count) {
      return [];
    }

    const topK = Math.max(1, Math.min(query.topK ?? 5, count));
    const result = this.index.searchKnn(query.vector, topK);
    return result.neighbors
      .map((label, idx) => {
        const stored = this.labelToRecord.get(label);
        if (!stored) {
          return null;
        }
        const distance = result.distances[idx];
        const similarity = 1 / (1 + distance);
        return { ...stored, similarity };
      })
      .filter((item): item is SemanticMemoryResult => item !== null);
  }

  async delete(id: string): Promise<void> {
    await this.ready;
    const label = this.idToLabel.get(id);
    if (label === undefined) {
      return;
    }
    this.labelToRecord.delete(label);
    this.idToLabel.delete(id);
    await this.persist();
  }

  private async initialize(): Promise<void> {
    await fs.mkdir(this.options.workDir, { recursive: true });
    await this.loadMetadata();
    await this.loadIndex();
  }

  private async loadMetadata(): Promise<void> {
    try {
      const raw = await fs.readFile(this.metadataPath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedMetadata;
      this.nextLabel = parsed.nextLabel;
      for (const entry of parsed.entries) {
        this.labelToRecord.set(entry.label, entry.record);
        this.idToLabel.set(entry.record.id, entry.label);
      }
    } catch {
      this.nextLabel = 0;
    }
  }

  private async loadIndex(): Promise<void> {
    const index = new HierarchicalNSW(this.space, this.options.dimensions);
    try {
      await fs.access(this.indexPath);
      await index.readIndex(this.indexPath);
      index.setEf(this.efSearch);
      logger.info('[HNSWSemanticStore] Loaded semantic index from disk');
    } catch {
      index.initIndex(this.maxElements, 16, this.efConstruction, this.efSearch);
      index.setEf(this.efSearch);
      logger.info('[HNSWSemanticStore] Initialized new semantic index');
    }
    this.index = index;
  }

  private allocateLabel(id?: string): number {
    if (id) {
      const existing = this.idToLabel.get(id);
      if (existing !== undefined) {
        return existing;
      }
    }
    const label = this.nextLabel;
    if (!id) {
      id = `semantic-${label}`;
    }
    this.nextLabel += 1;
    this.idToLabel.set(id, label);
    return label;
  }

  private async ensureCapacity(required: number): Promise<void> {
    const getMaxElements = (this.index as any).getMaxElements;
    const resizeIndex = (this.index as any).resizeIndex;
    if (typeof getMaxElements === 'function' && typeof resizeIndex === 'function') {
      const maxElements = getMaxElements.call(this.index);
      if (required > maxElements) {
        const newCapacity = Math.max(required + 256, Math.floor(maxElements * 1.5));
        resizeIndex.call(this.index, newCapacity);
        logger.info(`[HNSWSemanticStore] Resized index to ${newCapacity}`);
      }
    }
  }

  private async persist(): Promise<void> {
    const payload: PersistedMetadata = {
      nextLabel: this.nextLabel,
      entries: Array.from(this.labelToRecord.entries()).map(([label, record]) => ({
        label,
        record
      }))
    };
    await fs.writeFile(this.metadataPath, JSON.stringify(payload, null, 2));
    await this.index.writeIndex(this.indexPath);
  }
}

