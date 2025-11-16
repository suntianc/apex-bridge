import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
  SemanticMemoryDiagnostics,
  SemanticMemoryQuery,
  SemanticMemoryRecord,
  SemanticMemoryResult
} from '../../types/memory';
import { SemanticMemoryStore } from './stores/SemanticMemoryStore';
import logger from '../../utils/logger';

/**
 * 语义记忆服务配置
 */
export interface SemanticMemoryOptions {
  /** 嵌入向量维度，默认沿用向量化器配置 */
  embeddingDimensions: number;
  /** 默认 topK（未指定时使用），默认 3 */
  defaultTopK?: number;
  /** 允许的最大 topK，防止过大查询，默认 10 */
  maxTopK?: number;
  /** 最低相似度，默认 0.7 */
  minSimilarity?: number;
  /** 底层存储实现名称（如 hnswlib、in-memory） */
  storeName?: string;
  /** 是否在事件总线中广播 memory:semantic:* 事件 */
  enableEvents?: boolean;
  /** 记录保留时长（毫秒），用于后台清理 */
  retentionMs?: number;
}

/**
 * 语义记忆检索响应
 */
export interface SemanticMemorySearchResponse {
  results: SemanticMemoryResult[];
  diagnostics?: SemanticMemoryDiagnostics;
}

/**
 * 语义记忆服务接口
 */
export interface SemanticMemoryService {
  /**
   * 保存语义记忆
   */
  saveSemantic(
    record: SemanticMemoryRecord,
    options?: Partial<SemanticMemoryOptions>
  ): Promise<SemanticMemoryResult>;

  /**
   * 根据ID回溯语义记忆
   */
  recallSemantic(
    id: string,
    options?: Partial<SemanticMemoryOptions>
  ): Promise<SemanticMemoryResult | null>;

  /**
   * 相似度搜索
   */
  searchSimilar(
    query: SemanticMemoryQuery,
    options?: Partial<SemanticMemoryOptions>
  ): Promise<SemanticMemorySearchResponse>;

  deleteSemanticByContent(
    userId: string,
    personaId: string | undefined,
    content: string
  ): Promise<void>;
}

export class DefaultSemanticMemoryService implements SemanticMemoryService {
  private readonly dedupeIndex = new Map<string, string>();

  constructor(
    private readonly store: SemanticMemoryStore,
    private readonly baseOptions: SemanticMemoryOptions,
    private readonly events?: EventEmitter
  ) {
    if (!baseOptions.embeddingDimensions || baseOptions.embeddingDimensions <= 0) {
      throw new Error('SemanticMemoryOptions.embeddingDimensions must be a positive number');
    }
  }

  async saveSemantic(
    record: SemanticMemoryRecord,
    options?: Partial<SemanticMemoryOptions>
  ): Promise<SemanticMemoryResult> {
    const resolved = this.resolveOptions(options);
    this.validateRecord(record, resolved);

    const normalized = this.normalizeRecord(record);
    const dedupeKey = this.buildDedupeKey(normalized);

    const existingId = this.dedupeIndex.get(dedupeKey);
    if (existingId) {
      const existing = await this.store.getById(existingId);
      if (existing) {
        return existing;
      }
    }

    const saved = await this.store.save(normalized);
    this.dedupeIndex.set(dedupeKey, saved.id);
    this.emit('memory:semantic:saved', { record: saved });
    return saved;
  }

  recallSemantic(
    id: string,
    _options?: Partial<SemanticMemoryOptions>
  ): Promise<SemanticMemoryResult | null> {
    return this.store.getById(id);
  }

  async searchSimilar(
    query: SemanticMemoryQuery,
    options?: Partial<SemanticMemoryOptions>
  ): Promise<SemanticMemorySearchResponse> {
    const resolved = this.resolveOptions(options);
    const start = Date.now();
    const topK = Math.max(
      1,
      Math.min(query.topK ?? resolved.defaultTopK ?? 3, resolved.maxTopK ?? 10)
    );
    const minSimilarity = query.minSimilarity ?? resolved.minSimilarity ?? 0.7;

    const candidates = await this.store.search(query);
    const diagnostics: SemanticMemoryDiagnostics = {
      totalCandidates: candidates.length,
      filteredByContext: 0,
      filteredByThreshold: 0,
      returned: 0
    };

    const contextMatches = candidates.filter((record) => this.matchesContext(record, query));
    diagnostics.filteredByContext = diagnostics.totalCandidates - contextMatches.length;

    const thresholdMatches = contextMatches.filter(
      (record) => (record.similarity ?? 0) >= minSimilarity
    );
    diagnostics.filteredByThreshold = contextMatches.length - thresholdMatches.length;

    const limited = thresholdMatches
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      .slice(0, topK);

    diagnostics.returned = limited.length;
    diagnostics.durationMs = Date.now() - start;

    return {
      results: limited,
      diagnostics: query.includeDiagnostics ? diagnostics : undefined
    };
  }

  async deleteSemanticByContent(
    userId: string,
    personaId: string | undefined,
    content: string
  ): Promise<void> {
    const dedupeKey = this.buildDedupeKey({ userId, personaId, content });
    const recordId = this.dedupeIndex.get(dedupeKey);
    if (!recordId) {
      return;
    }
    if (typeof (this.store as any).delete === 'function') {
      await (this.store as any).delete(recordId);
      this.dedupeIndex.delete(dedupeKey);
      this.emit('memory:semantic:pruned', {
        id: recordId,
        userId,
        personaId
      });
    }
  }

  private resolveOptions(overrides?: Partial<SemanticMemoryOptions>): SemanticMemoryOptions {
    return {
      ...this.baseOptions,
      defaultTopK: overrides?.defaultTopK ?? this.baseOptions.defaultTopK ?? 3,
      maxTopK: overrides?.maxTopK ?? this.baseOptions.maxTopK ?? 10,
      minSimilarity: overrides?.minSimilarity ?? this.baseOptions.minSimilarity ?? 0.7,
      storeName: overrides?.storeName ?? this.baseOptions.storeName ?? 'in-memory',
      enableEvents: overrides?.enableEvents ?? this.baseOptions.enableEvents ?? false,
      retentionMs: overrides?.retentionMs ?? this.baseOptions.retentionMs
    };
  }

  private validateRecord(record: SemanticMemoryRecord, options: SemanticMemoryOptions): void {
    if (!record.userId) {
      throw new Error('SemanticMemoryRecord.userId is required');
    }
    if (!record.embedding || record.embedding.length === 0) {
      throw new Error('SemanticMemoryRecord.embedding is required');
    }
    if (record.embedding.length !== options.embeddingDimensions) {
      logger.warn(
        `[SemanticMemoryService] embedding dimension mismatch: expected ${options.embeddingDimensions}, received ${record.embedding.length}`
      );
    }
  }

  private normalizeRecord(record: SemanticMemoryRecord): SemanticMemoryRecord {
    const now = Date.now();
    return {
      ...record,
      id: record.id ?? randomUUID(),
      createdAt: record.createdAt ?? now,
      updatedAt: now,
      summary: record.summary ?? this.buildSummary(record.content),
      content: record.content.trim(),
      embedding: record.embedding.slice()
    };
  }

  private buildSummary(content: string): string {
    return content.length > 120 ? `${content.slice(0, 117)}...` : content;
  }

  private buildDedupeKey(record: Pick<SemanticMemoryRecord, 'userId' | 'personaId' | 'content'>): string {
    const persona = record.personaId ?? '~default';
    return `${record.userId}::${persona}::${record.content}`;
  }

  private matchesContext(record: SemanticMemoryResult, query: SemanticMemoryQuery): boolean {
    if (query.userId && record.userId !== query.userId) {
      return false;
    }
    if (query.householdId && record.householdId !== query.householdId) {
      return false;
    }
    if (query.personaId && record.personaId !== query.personaId) {
      return false;
    }
    if (query.timeWindow) {
      const timestamp = record.createdAt ?? 0;
      const { from, to, lastDays } = query.timeWindow;
      if (typeof from === 'number' && timestamp < from) {
        return false;
      }
      if (typeof to === 'number' && timestamp > to) {
        return false;
      }
      if (typeof lastDays === 'number') {
        const windowStart = Date.now() - lastDays * 24 * 60 * 60 * 1000;
        if (timestamp < windowStart) {
          return false;
        }
      }
    }
    return true;
  }

  private emit(event: string, payload: any): void {
    if (this.baseOptions.enableEvents && this.events) {
      this.events.emit(event, payload);
    }
  }
}

