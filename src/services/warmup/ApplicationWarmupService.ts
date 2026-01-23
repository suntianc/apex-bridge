/**
 * ApplicationWarmupService - 应用启动预热服务
 *
 * 提供完整的应用预热功能：
 * - 数据库连接预热
 * - 向量索引预热加载
 * - 嵌入缓存预热
 * - 搜索缓存预热
 *
 * 预期效果：首次查询延迟从 500-1000ms 降低到 50-100ms
 */

import { logger } from "../../utils/logger";
import { IndexPrewarmService } from "./IndexPrewarmService";
import { CacheWarmupManager } from "./CacheWarmupManager";
import { LLMConfigService } from "../LLMConfigService";

/**
 * 预热配置
 */
export interface WarmupConfig {
  enabled: boolean;
  timeoutMs: number;
  databaseWarmup: {
    enabled: boolean;
    priority: string[];
  };
  indexWarmup: {
    enabled: boolean;
    queryCount: number;
  };
  embeddingCacheWarmup: {
    enabled: boolean;
    sampleCount: number;
  };
  searchCacheWarmup: {
    enabled: boolean;
    queryCount: number;
  };
}

/**
 * 预热状态
 */
export interface WarmupStatus {
  isComplete: boolean;
  startTime: Date | null;
  endTime: Date | null;
  totalDuration: number;
  phases: {
    database: { status: string; duration: number };
    index: { status: string; duration: number };
    embedding: { status: string; duration: number };
    search: { status: string; duration: number };
  };
  errors: string[];
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: WarmupConfig = {
  enabled: true,
  timeoutMs: 30000,
  databaseWarmup: {
    enabled: true,
    priority: ["surrealdb"],
  },
  indexWarmup: {
    enabled: true,
    queryCount: 100,
  },
  embeddingCacheWarmup: {
    enabled: true,
    sampleCount: 100,
  },
  searchCacheWarmup: {
    enabled: true,
    queryCount: 100,
  },
};

/**
 * ApplicationWarmupService - 应用启动预热管理
 */
export class ApplicationWarmupService {
  private config: WarmupConfig;
  private status: WarmupStatus;
  private indexPrewarmService: IndexPrewarmService;
  private cacheWarmupManager: CacheWarmupManager;
  private isRunning = false;

  constructor(config?: Partial<WarmupConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.status = {
      isComplete: false,
      startTime: null,
      endTime: null,
      totalDuration: 0,
      phases: {
        database: { status: "pending", duration: 0 },
        index: { status: "pending", duration: 0 },
        embedding: { status: "pending", duration: 0 },
        search: { status: "pending", duration: 0 },
      },
      errors: [],
    };
    this.indexPrewarmService = new IndexPrewarmService();
    this.cacheWarmupManager = new CacheWarmupManager();

    logger.info("[ApplicationWarmupService] Initialized with config:", {
      enabled: this.config.enabled,
      timeoutMs: this.config.timeoutMs,
    });
  }

  /**
   * 执行完整预热流程
   */
  async warmup(): Promise<WarmupStatus> {
    if (!this.config.enabled) {
      logger.info("[ApplicationWarmupService] Warmup disabled, skipping");
      this.status.isComplete = true;
      this.status.startTime = new Date();
      this.status.endTime = new Date();
      return this.status;
    }

    if (this.isRunning) {
      logger.warn("[ApplicationWarmupService] Warmup already in progress");
      return this.status;
    }

    this.isRunning = true;
    this.status.startTime = new Date();

    try {
      logger.info("[ApplicationWarmupService] Starting application warmup...");

      // 设置超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Warmup timeout")), this.config.timeoutMs);
      });

      const warmupPromise = this.executeWarmup();

      await Promise.race([warmupPromise, timeoutPromise]);

      this.status.isComplete = true;
      logger.info("[ApplicationWarmupService] Warmup completed successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.status.errors.push(errorMessage);
      logger.error("[ApplicationWarmupService] Warmup failed:", error);
    } finally {
      this.status.endTime = new Date();
      this.status.totalDuration = this.status.endTime.getTime() - this.status.startTime!.getTime();
      this.isRunning = false;
    }

    return this.status;
  }

  /**
   * 执行预热步骤
   */
  private async executeWarmup(): Promise<void> {
    if (this.config.databaseWarmup.enabled) {
      await this.warmupDatabase();
    }

    if (this.config.indexWarmup.enabled) {
      await this.warmupIndex();
    }

    if (this.config.embeddingCacheWarmup.enabled) {
      await this.warmupEmbeddingCache();
    }

    if (this.config.searchCacheWarmup.enabled) {
      await this.warmupSearchCache();
    }
  }

  /**
   * 数据库连接预热
   */
  private async warmupDatabase(): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info("[ApplicationWarmupService] Warming up database connections...");

      if (this.config.databaseWarmup.priority.includes("surrealdb")) {
        const llmConfigService = LLMConfigService.getInstance();
        const providers = await llmConfigService.listProviders();
        logger.debug(
          `[ApplicationWarmupService] SurrealDB connection warmed up (${providers.length} providers)`
        );
      }

      this.status.phases.database = {
        status: "complete",
        duration: Date.now() - startTime,
      };

      logger.info(
        `[ApplicationWarmupService] Database warmup completed in ${this.status.phases.database.duration}ms`
      );
    } catch (error) {
      this.status.phases.database = {
        status: "failed",
        duration: Date.now() - startTime,
      };
      throw error;
    }
  }

  /**
   * 向量索引预热
   */
  private async warmupIndex(): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info("[ApplicationWarmupService] Warming up vector indexes...");

      await this.indexPrewarmService.prewarm({
        queryCount: this.config.indexWarmup.queryCount,
      });

      this.status.phases.index = {
        status: "complete",
        duration: Date.now() - startTime,
      };

      logger.info(
        `[ApplicationWarmupService] Index warmup completed in ${this.status.phases.index.duration}ms`
      );
    } catch (error) {
      this.status.phases.index = {
        status: "failed",
        duration: Date.now() - startTime,
      };
      throw error;
    }
  }

  /**
   * 嵌入缓存预热
   */
  private async warmupEmbeddingCache(): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info("[ApplicationWarmupService] Warming up embedding cache...");

      await this.cacheWarmupManager.warmupEmbeddingCache({
        sampleCount: this.config.embeddingCacheWarmup.sampleCount,
      });

      this.status.phases.embedding = {
        status: "complete",
        duration: Date.now() - startTime,
      };

      logger.info(
        `[ApplicationWarmupService] Embedding cache warmup completed in ${this.status.phases.embedding.duration}ms`
      );
    } catch (error) {
      this.status.phases.embedding = {
        status: "failed",
        duration: Date.now() - startTime,
      };
      throw error;
    }
  }

  /**
   * 搜索缓存预热
   */
  private async warmupSearchCache(): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info("[ApplicationWarmupService] Warming up search cache...");

      await this.cacheWarmupManager.warmupSearchCache({
        queryCount: this.config.searchCacheWarmup.queryCount,
      });

      this.status.phases.search = {
        status: "complete",
        duration: Date.now() - startTime,
      };

      logger.info(
        `[ApplicationWarmupService] Search cache warmup completed in ${this.status.phases.search.duration}ms`
      );
    } catch (error) {
      this.status.phases.search = {
        status: "failed",
        duration: Date.now() - startTime,
      };
      throw error;
    }
  }

  /**
   * 获取预热状态
   */
  getStatus(): WarmupStatus {
    return { ...this.status };
  }

  /**
   * 检查是否完成预热
   */
  isReady(): boolean {
    return this.status.isComplete;
  }

  /**
   * 获取配置
   */
  getConfig(): WarmupConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<WarmupConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// 单例实例
let warmupServiceInstance: ApplicationWarmupService | null = null;

export function getWarmupService(): ApplicationWarmupService {
  if (!warmupServiceInstance) {
    warmupServiceInstance = new ApplicationWarmupService();
  }
  return warmupServiceInstance;
}

export function resetWarmupService(): void {
  warmupServiceInstance = null;
}
