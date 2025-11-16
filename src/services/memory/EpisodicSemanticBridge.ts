import { EventEmitter } from 'events';
import { SemanticMemoryService } from './SemanticMemoryService';
import { EpisodicMemoryResult } from '../../types/memory';
import { logger } from '../../utils/logger';

export interface VectorizerConfig {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  dimensions?: number;
}

export interface EpisodicSemanticBridgeOptions {
  importanceThreshold?: number;
  allowedEventTypes?: string[];
  maxContentLength?: number;
  resumeLagThresholdMs?: number;
  ingestionEnabled?: boolean;
}

export interface SemanticEmbeddingProvider {
  generateEmbedding(text: string, context?: { userId: string; personaId?: string }): Promise<number[] | null>;
}

interface EpisodicSavedEventPayload {
  event: EpisodicMemoryResult;
  segmentId?: string;
  segmentCount?: number;
  retentionMs?: number;
  timelineLagMs?: number;
  storeType?: string;
}

interface EpisodicPrunedEventPayload {
  events: Array<Pick<EpisodicMemoryResult, 'id' | 'userId' | 'personaId' | 'timestamp' | 'content'>>;
  segmentId?: string;
  retentionMs?: number;
}

interface EpisodicWarningPayload {
  message: string;
  error?: string;
}

export class EpisodicSemanticBridge {
  private readonly importanceThreshold: number;
  private readonly allowedEventTypes: string[];
  private readonly maxContentLength: number;
  private readonly resumeLagThresholdMs: number;
  private ingestionPaused = false;
  private destroyed = false;

  constructor(
    private readonly eventBus: EventEmitter,
    private readonly semanticMemoryService: SemanticMemoryService,
    private readonly embeddingProvider: SemanticEmbeddingProvider,
    private readonly options: EpisodicSemanticBridgeOptions = {}
  ) {
    this.importanceThreshold = options.importanceThreshold ?? 0.6;
    this.allowedEventTypes = options.allowedEventTypes ?? ['task', 'reminder', 'conversation'];
    this.maxContentLength = options.maxContentLength ?? 512;
    this.resumeLagThresholdMs = options.resumeLagThresholdMs ?? 10_000;

    if (options.ingestionEnabled === false) {
      logger.warn('[EpisodicSemanticBridge] Ingestion disabled via configuration');
      return;
    }

    this.eventBus.on('memory:episodic:saved', this.handleSaved);
    this.eventBus.on('memory:episodic:pruned', this.handlePruned);
    this.eventBus.on('memory:episodic:warning', this.handleWarning);
    logger.info(`[EpisodicSemanticBridge] Bridge online (importance>=${this.importanceThreshold})`);
  }

  destroy(): void {
    this.destroyed = true;
    this.eventBus.off('memory:episodic:saved', this.handleSaved);
    this.eventBus.off('memory:episodic:pruned', this.handlePruned);
    this.eventBus.off('memory:episodic:warning', this.handleWarning);
  }

  private handleSaved = async (payload: EpisodicSavedEventPayload): Promise<void> => {
    if (this.destroyed || !payload?.event) {
      return;
    }

    if (this.ingestionPaused) {
      if (this.shouldResume(payload)) {
        this.ingestionPaused = false;
        logger.info('[EpisodicSemanticBridge] Resuming ingestion after healthy signal');
      } else {
        return;
      }
    }

    if (!this.shouldIngest(payload.event)) {
      return;
    }

    try {
      const content = this.normalizeContent(payload.event.content);
      if (!content) {
        return;
      }

      const embedding = await this.embeddingProvider.generateEmbedding(content, {
        userId: payload.event.userId,
        personaId: payload.event.personaId
      });

      if (!embedding) {
        logger.warn('[EpisodicSemanticBridge] Embedding provider unavailable, skipping ingestion');
        return;
      }

      await this.semanticMemoryService.saveSemantic({
        userId: payload.event.userId,
        personaId: payload.event.personaId,
        householdId: payload.event.householdId,
        content,
        summary: payload.event.context,
        embedding,
        importance: payload.event.importance,
        metadata: {
          source: 'episodic',
          episodicEventId: payload.event.id,
          eventType: payload.event.eventType,
          timeline: payload.segmentId
            ? { segmentId: payload.segmentId, segmentCount: payload.segmentCount }
            : undefined
        }
      });
    } catch (error: any) {
      logger.error('[EpisodicSemanticBridge] Failed to ingest episodic event into semantic store', error);
    }
  };

  private handlePruned = async (payload: EpisodicPrunedEventPayload): Promise<void> => {
    if (this.destroyed || !payload?.events?.length) {
      return;
    }
    for (const event of payload.events) {
      try {
        await this.semanticMemoryService.deleteSemanticByContent(event.userId, event.personaId, event.content ?? '');
      } catch (error: any) {
        logger.warn(`[EpisodicSemanticBridge] Failed to prune semantic memory for event ${event.id}: ${error?.message ?? error}`);
      }
    }
  };

  private handleWarning = (payload: EpisodicWarningPayload): void => {
    logger.warn(`[EpisodicSemanticBridge] Warning received from episodic timeline: ${payload?.message}`);
    this.ingestionPaused = true;
  };

  private shouldIngest(event: EpisodicMemoryResult): boolean {
    const importance = event.importance ?? 0;
    const importanceMatch = importance >= this.importanceThreshold;
    const typeMatch = this.allowedEventTypes.includes(event.eventType);
    return importanceMatch || typeMatch;
  }

  private shouldResume(payload: EpisodicSavedEventPayload): boolean {
    if (payload.timelineLagMs === undefined) {
      return false;
    }
    return payload.timelineLagMs <= this.resumeLagThresholdMs;
  }

  private normalizeContent(content: string): string {
    if (!content) {
      return '';
    }
    const trimmed = content.trim();
    if (trimmed.length <= this.maxContentLength) {
      return trimmed;
    }
    return `${trimmed.slice(0, this.maxContentLength)}...`;
  }
}

export class VectorizerEmbeddingProvider implements SemanticEmbeddingProvider {
  private endpoint?: string;

  constructor(private readonly config?: VectorizerConfig) {
    if (config?.baseURL) {
      const normalized = config.baseURL.replace(/\/+$/, '');
      this.endpoint = normalized.toLowerCase().endsWith('/embeddings')
        ? normalized
        : `${normalized}/embeddings`;
    }
  }

  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.config?.apiKey || !this.config?.model || !this.endpoint) {
      return null;
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          input: text,
          model: this.config.model
        }),
        signal: AbortSignal.timeout(15_000)
      });

      if (!response.ok) {
        logger.warn(`[VectorizerEmbeddingProvider] Embedding API returned ${response.status}`);
        return null;
      }

      const data = (await response.json()) as { data?: Array<{ embedding: number[] }> };
      const embedding = data?.data?.[0]?.embedding;
      return Array.isArray(embedding) ? embedding : null;
    } catch (error: any) {
      logger.warn(`[VectorizerEmbeddingProvider] Failed to call embedding API: ${error?.message ?? error}`);
      return null;
    }
  }
}

