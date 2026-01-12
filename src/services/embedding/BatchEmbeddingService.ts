/**
 * BatchEmbeddingService - 批量嵌入生成服务
 *
 * 提供高性能的并行/批量嵌入生成，支持：
 * - 真正的批量 API 调用（不是顺序循环）
 * - 并发控制（避免超过 API 限制）
 * - 智能分批（基于 token 限制）
 * - 错误重试与恢复
 *
 * 预期性能提升：10-50x（相比顺序生成）
 */

import { logger } from "../../utils/logger";
import { EmbeddingConfig, EmbeddingVector } from "../tool-retrieval/types";

// LLMManager lazy import to avoid circular dependency
let llmManagerInstance: unknown = null;

/**
 * 批量嵌入配置
 */
export interface BatchEmbeddingConfig {
  /** 单批最大文本数 */
  batchSize: number;
  /** 最大并发数 */
  maxConcurrency: number;
  /** Token 限制（默认 7000，留 buffer） */
  tokenLimit: number;
  /** 重试次数 */
  maxRetries: number;
  /** 重试间隔（ms） */
  retryDelay: number;
  /** 是否启用智能分批 */
  smartBatching: boolean;
  /** 嵌入模型名称 */
  model?: string;
}

/**
 * 批量嵌入结果
 */
export interface BatchEmbeddingResult {
  embeddings: EmbeddingVector[];
  totalTime: number;
  batchesProcessed: number;
  successCount: number;
  errorCount: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: BatchEmbeddingConfig = {
  batchSize: 100,
  maxConcurrency: 10,
  tokenLimit: 7000,
  maxRetries: 3,
  retryDelay: 1000,
  smartBatching: true,
};

/**
 * BatchEmbeddingService - 高性能批量嵌入生成
 */
export class BatchEmbeddingService {
  private config: BatchEmbeddingConfig;
  private llmConfigService: unknown = null;
  private dimensionsCache: number | null = null;

  constructor(config?: Partial<BatchEmbeddingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info("[BatchEmbeddingService] Initialized with config:", {
      batchSize: this.config.batchSize,
      maxConcurrency: this.config.maxConcurrency,
      tokenLimit: this.config.tokenLimit,
      smartBatching: this.config.smartBatching,
    });
  }

  /**
   * 生成批量嵌入（并行+批量优化）
   */
  async generateBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();

    if (texts.length === 0) {
      return {
        embeddings: [],
        totalTime: 0,
        batchesProcessed: 0,
        successCount: 0,
        errorCount: 0,
      };
    }

    logger.debug(`[BatchEmbeddingService] Starting batch generation for ${texts.length} texts`);

    // 智能分批（基于 token 限制）
    const batches = this.config.smartBatching
      ? this.splitIntoTokenBatches(texts, this.config.tokenLimit)
      : this.splitIntoFixedBatches(texts, this.config.batchSize);

    const allEmbeddings: EmbeddingVector[] = [];
    let successCount = 0;
    let errorCount = 0;

    // 并发处理各批次（控制并发数）
    for (let i = 0; i < batches.length; i += this.config.maxConcurrency) {
      const concurrentBatches = batches.slice(i, i + this.config.maxConcurrency);

      const batchResults = await Promise.all(
        concurrentBatches.map((batch, batchIndex) =>
          this.processBatchWithRetry(batch, i + batchIndex)
        )
      );

      // 汇总结果
      for (const result of batchResults) {
        allEmbeddings.push(...result.embeddings);
        successCount += result.successCount;
        errorCount += result.errorCount;
      }

      logger.debug(
        `[BatchEmbeddingService] Processed ${Math.min(i + concurrentBatches.length, batches.length)}/${batches.length} batches`
      );
    }

    const totalTime = Date.now() - startTime;

    logger.info(
      `[BatchEmbeddingService] Batch generation completed: ${successCount} succeeded, ${errorCount} failed, ${totalTime}ms total`
    );

    return {
      embeddings: allEmbeddings,
      totalTime,
      batchesProcessed: batches.length,
      successCount,
      errorCount,
    };
  }

  /**
   * 生成单个嵌入（使用批量 API）
   */
  async generateSingle(text: string): Promise<EmbeddingVector> {
    const result = await this.generateBatch([text]);

    if (result.errorCount > 0 || result.embeddings.length === 0) {
      throw new Error("Failed to generate single embedding");
    }

    return result.embeddings[0];
  }

  /**
   * 并发生成多个嵌入（高并发场景）
   */
  async generateConcurrent(texts: string[], maxConcurrency?: number): Promise<EmbeddingVector[]> {
    const concurrency = maxConcurrency || this.config.maxConcurrency;
    const results: EmbeddingVector[] = [];

    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((text) => this.generateSingleWithRetry(text))
      );

      for (const result of batchResults) {
        if (result) {
          results.push(result);
        }
      }

      logger.debug(
        `[BatchEmbeddingService] Concurrent progress: ${Math.min(i + concurrency, texts.length)}/${texts.length}`
      );
    }

    return results;
  }

  /**
   * 处理单个批次（使用 LLMManager.embed 批量 API）
   */
  private async processBatch(
    texts: string[]
  ): Promise<{ embeddings: EmbeddingVector[]; successCount: number; errorCount: number }> {
    try {
      // Lazy import LLMManager
      if (!llmManagerInstance) {
        const { LLMManager } = await import("../../core/LLMManager");
        llmManagerInstance = new LLMManager();
      }

      // 调用批量 API（LLMManager.embed 支持数组输入）
      const embeddings = await (
        llmManagerInstance as { embed(texts: string[]): Promise<number[][]> }
      ).embed(texts);

      if (!embeddings || embeddings.length === 0) {
        throw new Error("Empty embedding result from batch API");
      }

      // 转换为 EmbeddingVector 格式
      const vectors: EmbeddingVector[] = embeddings.map((vector, index) => ({
        values: vector,
        dimensions: vector.length,
        model: this.config.model || "unknown",
      }));

      return {
        embeddings: vectors,
        successCount: texts.length,
        errorCount: 0,
      };
    } catch (error) {
      logger.error(`[BatchEmbeddingService] Batch processing failed:`, error);
      return {
        embeddings: [],
        successCount: 0,
        errorCount: texts.length,
      };
    }
  }

  /**
   * 处理批次（带重试）
   */
  private async processBatchWithRetry(
    texts: string[],
    batchIndex: number
  ): Promise<{ embeddings: EmbeddingVector[]; successCount: number; errorCount: number }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.processBatch(texts);

        if (result.errorCount === 0) {
          return result;
        }

        // 部分失败，记录并继续
        if (attempt < this.config.maxRetries) {
          logger.warn(
            `[BatchEmbeddingService] Batch ${batchIndex} partial failure, attempt ${attempt + 1}/${this.config.maxRetries + 1}`
          );
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          logger.warn(
            `[BatchEmbeddingService] Batch ${batchIndex} failed, retrying in ${delay}ms...`,
            lastError.message
          );
          await this.sleep(delay);
        }
      }
    }

    logger.error(
      `[BatchEmbeddingService] Batch ${batchIndex} failed after all retries:`,
      lastError
    );

    return {
      embeddings: [],
      successCount: 0,
      errorCount: texts.length,
    };
  }

  /**
   * 生成单个嵌入（带重试）
   */
  private async generateSingleWithRetry(text: string): Promise<EmbeddingVector | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.processBatch([text]);

        if (result.embeddings.length > 0) {
          return result.embeddings[0];
        }
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    logger.error(`[BatchEmbeddingService] Single embedding failed after retries:`, lastError);
    return null;
  }

  /**
   * 智能分批（基于 token 限制）
   */
  private splitIntoTokenBatches(texts: string[], tokenLimit: number): string[][] {
    const batches: string[][] = [];
    let currentBatch: string[] = [];
    let currentTokens = 0;

    for (const text of texts) {
      const textTokens = this.estimateTokens(text);

      // 如果单个文本超过限制，强制添加并继续
      if (textTokens > tokenLimit && currentBatch.length > 0) {
        batches.push([...currentBatch]);
        currentBatch = [];
        currentTokens = 0;
      }

      // 如果当前批次加上此文本超过限制，开始新批次
      if (currentTokens + textTokens > tokenLimit && currentBatch.length > 0) {
        batches.push([...currentBatch]);
        currentBatch = [];
        currentTokens = 0;
      }

      currentBatch.push(text);
      currentTokens += textTokens;
    }

    // 添加最后一个批次
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    logger.debug(
      `[BatchEmbeddingService] Smart batching: ${texts.length} texts → ${batches.length} batches`
    );

    return batches;
  }

  /**
   * 固定大小分批
   */
  private splitIntoFixedBatches(texts: string[], batchSize: number): string[][] {
    const batches: string[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * 估算 token 数量（简单估算：4 字符 ≈ 1 token）
   */
  private estimateTokens(text: string): number {
    // 考虑中文字符（通常 1 字 ≈ 1 token）
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;

    // 中文按字计，英文按 4 字符 ≈ 1 token
    return chineseChars + Math.ceil(otherChars / 4);
  }

  /**
   * 休眠辅助函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取实际维度
   */
  async getActualDimensions(): Promise<number> {
    if (this.dimensionsCache !== null) {
      return this.dimensionsCache;
    }

    try {
      if (!this.llmConfigService) {
        const { LLMConfigService } = await import("../../services/LLMConfigService");
        this.llmConfigService = LLMConfigService.getInstance();
      }

      const embeddingModel = (
        this.llmConfigService as { getDefaultModel(type: string): unknown }
      ).getDefaultModel("embedding");

      if (embeddingModel && typeof embeddingModel === "object") {
        const modelConfig = (embeddingModel as { modelConfig?: { dimensions?: number } })
          .modelConfig;
        this.dimensionsCache = modelConfig?.dimensions || 1536;
        return this.dimensionsCache;
      }
    } catch (error) {
      logger.warn("[BatchEmbeddingService] Failed to get actual dimensions:", error);
    }

    return 1536; // 默认维度
  }

  /**
   * 获取服务统计
   */
  getStats(): {
    config: BatchEmbeddingConfig;
    dimensions: number | null;
  } {
    return {
      config: this.config,
      dimensions: this.dimensionsCache,
    };
  }
}

/**
 * 获取 LLMManager 实例（用于嵌入）
 */
export function getEmbeddingLLMManager(): unknown {
  return llmManagerInstance;
}

/**
 * 重置 LLMManager 实例（用于测试）
 */
export function resetEmbeddingLLMManager(): void {
  llmManagerInstance = null;
}
