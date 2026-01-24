/**
 * CacheWarmupManager - 缓存预热管理器
 *
 * 负责预热各种缓存：
 * - 嵌入缓存
 * - 搜索结果缓存
 */

import { logger } from "../../utils/logger";
import { EmbeddingGenerator } from "../tool-retrieval/EmbeddingGenerator";
import { getToolRetrievalService } from "../tool-retrieval/ToolRetrievalService";
import { ToolRetrievalConfig, EmbeddingConfig } from "../tool-retrieval/types";

/**
 * 嵌入缓存预热配置
 */
export interface EmbeddingCacheWarmupConfig {
  sampleCount: number;
  timeoutMs: number;
}

/**
 * 搜索缓存预热配置
 */
export interface SearchCacheWarmupConfig {
  queryCount: number;
  timeoutMs: number;
}

/**
 * 预热结果
 */
export interface CacheWarmupResult {
  success: boolean;
  itemsWarmed: number;
  errors: string[];
  duration: number;
}

/**
 * 预热查询样例
 */
const SAMPLE_SEARCH_QUERIES = [
  "file operations",
  "text processing",
  "data analysis",
  "api calls",
  "database queries",
  "user authentication",
  "error handling",
  "logging",
  "configuration",
  "testing",
];

/**
 * CacheWarmupManager - 缓存预热管理
 */
export class CacheWarmupManager {
  private embeddingConfig: EmbeddingConfig | null = null;
  private embeddingGenerator: EmbeddingGenerator | null = null;
  private toolRetrievalService: ReturnType<typeof getToolRetrievalService> | null = null;

  constructor() {
    logger.info("[CacheWarmupManager] Initialized");
  }

  /**
   * 预热嵌入缓存
   */
  async warmupEmbeddingCache(
    options?: Partial<EmbeddingCacheWarmupConfig>
  ): Promise<CacheWarmupResult> {
    const config = {
      sampleCount: options?.sampleCount || 50,
      timeoutMs: options?.timeoutMs || 30000,
    };

    const startTime = Date.now();
    const errors: string[] = [];
    let itemsWarmed = 0;

    try {
      logger.info(
        `[CacheWarmupManager] Starting embedding cache warmup with ${config.sampleCount} samples...`
      );

      // 初始化 EmbeddingGenerator
      if (!this.embeddingGenerator) {
        const embeddingConfig: EmbeddingConfig = {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
        };
        this.embeddingGenerator = new EmbeddingGenerator(embeddingConfig);
      }

      // 生成预热文本
      const warmupTexts = this.generateWarmupTexts(config.sampleCount);

      // 分批生成嵌入
      const batchSize = 10;
      for (let i = 0; i < warmupTexts.length; i += batchSize) {
        const batch = warmupTexts.slice(i, i + batchSize);

        try {
          const result = await this.generateBatchWithTimeout(batch, config.timeoutMs);
          if (result) {
            itemsWarmed += batch.length;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          errors.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${errorMessage}`);
        }
      }

      logger.info(
        `[CacheWarmupManager] Embedding cache warmup completed: ${itemsWarmed} items warmed, ${errors.length} failures`
      );

      return {
        success: errors.length === 0,
        itemsWarmed,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error("[CacheWarmupManager] Embedding cache warmup failed:", error);

      return {
        success: false,
        itemsWarmed,
        errors: [error instanceof Error ? error.message : "Unknown error"],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 预热搜索缓存
   */
  async warmupSearchCache(options?: Partial<SearchCacheWarmupConfig>): Promise<CacheWarmupResult> {
    const config = {
      queryCount: options?.queryCount || 50,
      timeoutMs: options?.timeoutMs || 5000,
    };

    const startTime = Date.now();
    const errors: string[] = [];
    let itemsWarmed = 0;

    try {
      logger.info(
        `[CacheWarmupManager] Starting search cache warmup with ${config.queryCount} queries...`
      );

      // 初始化 ToolRetrievalService
      if (!this.toolRetrievalService) {
        const retrievalConfig: ToolRetrievalConfig = {
          vectorDbPath: "./.data/vector-store",
          model: "nomic-embed-text:latest",
          dimensions: 768,
          similarityThreshold: 0.4,
          maxResults: 10,
          cacheSize: 1000,
        };
        this.toolRetrievalService = getToolRetrievalService(retrievalConfig);
        await this.toolRetrievalService.initialize();
      }

      // 生成预热查询
      const queries = this.generateWarmupQueries(config.queryCount);

      // 执行预热查询
      for (const query of queries) {
        try {
          const result = await this.executeSearchWithTimeout(
            this.toolRetrievalService,
            query,
            config.timeoutMs
          );
          if (result) {
            itemsWarmed++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          errors.push(`Query "${query.substring(0, 30)}..." failed: ${errorMessage}`);
        }
      }

      logger.info(
        `[CacheWarmupManager] Search cache warmup completed: ${itemsWarmed} queries warmed, ${errors.length} failures`
      );

      return {
        success: errors.length === 0,
        itemsWarmed,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error("[CacheWarmupManager] Search cache warmup failed:", error);

      return {
        success: false,
        itemsWarmed,
        errors: [error instanceof Error ? error.message : "Unknown error"],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 生成预热文本
   */
  private generateWarmupTexts(count: number): string[] {
    const texts: string[] = [];
    const categories = [
      "function",
      "tool",
      "skill",
      "api",
      "service",
      "module",
      "utility",
      "handler",
      "manager",
      "service",
    ];

    for (let i = 0; i < count; i++) {
      const category = categories[i % categories.length];
      const name = `${category}-${i}`;
      const description = `This is a ${category} that provides ${category} functionality for the system`;
      const tags = [category, "warmup", "sample"];

      texts.push(`${name} ${description} ${tags.join(" ")}`);
    }

    return texts;
  }

  /**
   * 生成预热查询
   */
  private generateWarmupQueries(count: number): string[] {
    const queries: string[] = [];

    for (let i = 0; i < count; i++) {
      const baseQuery = SAMPLE_SEARCH_QUERIES[i % SAMPLE_SEARCH_QUERIES.length];
      queries.push(`${baseQuery} ${i}`);
    }

    return queries;
  }

  /**
   * 批量生成嵌入（带超时）
   */
  private async generateBatchWithTimeout(texts: string[], timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn(`[CacheWarmupManager] Batch generation timeout for ${texts.length} texts`);
        resolve(false);
      }, timeoutMs);

      if (this.embeddingGenerator) {
        this.embeddingGenerator
          .generateBatch(texts)
          .then(() => {
            clearTimeout(timeout);
            resolve(true);
          })
          .catch((error) => {
            logger.warn(`[CacheWarmupManager] Embedding generation failed during warmup`, error);
            clearTimeout(timeout);
            resolve(false);
          });
      } else {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  /**
   * 执行搜索（带超时）
   */
  private async executeSearchWithTimeout(
    service: ReturnType<typeof getToolRetrievalService>,
    query: string,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn(
          `[CacheWarmupManager] Search timeout for query: "${query.substring(0, 30)}..."`
        );
        resolve(false);
      }, timeoutMs);

      service
        .findRelevantSkills(query, 5)
        .then(() => {
          clearTimeout(timeout);
          resolve(true);
        })
        .catch((error) => {
          logger.warn(
            `[CacheWarmupManager] Search failed during warmup for query: "${query.substring(0, 30)}..."`,
            error
          );
          clearTimeout(timeout);
          resolve(false);
        });
    });
  }
}
