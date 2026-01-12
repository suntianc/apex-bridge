/**
 * DisclosureManager - Result Disclosure Management
 *
 * Phase 1d: 披露管理器实现
 * Handles three-tier disclosure mechanism: METADATA, CONTENT, RESOURCES
 *
 * Phase 2: 三层披露机制增强
 * - DisclosureDecisionManager: 阈值决策层
 * - DisclosureCache: 专用缓存层（TTL+LRU）
 * - DisclosureMetrics: 性能指标采集
 */

import { logger } from "../../utils/logger";
import {
  DisclosureLevel,
  DisclosureStrategy,
  DisclosureContent,
  DisclosureOptions,
  HybridRetrievalError,
  HybridRetrievalErrorCode,
} from "../../types/enhanced-skill";
import { UnifiedRetrievalResult } from "../../types/enhanced-skill";

// ==================== Phase 2: New Interfaces ====================

/**
 * 决策输入
 */
export interface DisclosureDecisionInput {
  result: UnifiedRetrievalResult;
  score: number;
  maxTokens: number;
}

/**
 * 决策输出
 */
export interface DisclosureDecisionOutput {
  level: DisclosureLevel;
  reason: "always" | "threshold" | "tokenBudget";
}

/**
 * 决策管理器接口
 */
export interface IDisclosureDecisionManager {
  decide(input: DisclosureDecisionInput): DisclosureDecisionOutput;
}

/**
 * 缓存键
 */
export interface DisclosureCacheKey {
  id: string;
  level: DisclosureLevel;
  version?: string;
  hash?: string;
}

/**
 * 缓存接口
 */
export interface IDisclosureCache {
  get(key: DisclosureCacheKey): DisclosureContent | null;
  set(key: DisclosureCacheKey, value: DisclosureContent, ttlMs?: number): void;
  invalidate(id: string): void;
  stats(): { size: number; hits: number; misses: number };
  dispose(): Promise<void>;
}

/**
 * 性能指标
 */
export interface DisclosureMetrics {
  l1Ms: number;
  l2Ms: number;
  l3Ms: number;
  cacheHit: boolean;
  disclosureLevel: DisclosureLevel;
}

/**
 * Phase 2 增强配置
 */
export interface DisclosureManagerConfigV2 extends DisclosureManagerConfig {
  enabled: boolean;
  thresholds: { l2: number; l3: number };
  l1MaxTokens: number;
  l2MaxTokens: number;
  cache: {
    enabled: boolean;
    l1TtlMs: number;
    l2TtlMs: number;
    maxSize: number;
    cleanupIntervalMs: number;
  };
  parallelLoad: { enabled: boolean; maxConcurrency: number };
  metrics: { enabled: boolean; sampleRate: number };
}

// ==================== Phase 2: Decision Manager Implementation ====================

/**
 * 决策管理器实现
 * 基于阈值和 Token 预算自动选择披露级别
 */
export class DisclosureDecisionManager implements IDisclosureDecisionManager {
  private readonly config: DisclosureManagerConfigV2["thresholds"];

  constructor(config: DisclosureManagerConfigV2["thresholds"]) {
    this.config = config;
  }

  /**
   * 决策方法
   */
  decide(input: DisclosureDecisionInput): DisclosureDecisionOutput {
    const { score, maxTokens } = input;

    // L1: 始终 - Token 预算极低时
    if (maxTokens < 500) {
      return { level: DisclosureLevel.METADATA, reason: "always" };
    }

    // L3: 阈值触发 - score >= 0.85 (先检查最高阈值)
    if (score >= this.config.l3) {
      return { level: DisclosureLevel.RESOURCES, reason: "threshold" };
    }

    // L2: 阈值触发 - score >= 0.7
    if (score >= this.config.l2) {
      return { level: DisclosureLevel.CONTENT, reason: "threshold" };
    }

    // 回退: 自适应 Token 预算
    return { level: DisclosureLevel.CONTENT, reason: "tokenBudget" };
  }
}

// ==================== Phase 2: Cache Implementation ====================

/**
 * 披露缓存实现
 * 支持 TTL 过期和 LRU 淘汰
 */
export class DisclosureCache implements IDisclosureCache {
  private readonly cache: Map<string, { value: DisclosureContent; expiresAt: number }>;
  private readonly config: DisclosureManagerConfigV2["cache"];
  private hits: number = 0;
  private misses: number = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: DisclosureManagerConfigV2["cache"]) {
    this.config = config;
    this.cache = new Map();

    // 定期清理过期项
    if (config.cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), config.cleanupIntervalMs);
    }
  }

  /**
   * 获取缓存
   */
  get(key: DisclosureCacheKey): DisclosureContent | null {
    if (!this.config.enabled) {
      return null;
    }

    const cacheKey = this.generateKey(key);
    const item = this.cache.get(cacheKey);

    if (!item) {
      this.misses++;
      return null;
    }

    if (Date.now() > item.expiresAt) {
      this.cache.delete(cacheKey);
      this.misses++;
      return null;
    }

    // 更新访问时间戳以支持 LRU
    item.expiresAt = Date.now() + this.config.l1TtlMs;

    this.hits++;
    return item.value;
  }

  /**
   * 设置缓存
   */
  set(key: DisclosureCacheKey, value: DisclosureContent, ttlMs?: number): void {
    if (!this.config.enabled) {
      return;
    }

    const cacheKey = this.generateKey(key);
    const ttl = ttlMs || this.config.l1TtlMs;

    // LRU 淘汰
    if (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }

    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * 使缓存失效
   */
  invalidate(id: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${id}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 获取缓存统计
   */
  stats(): { size: number; hits: number; misses: number } {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
    };
  }

  /**
   * 生成缓存键
   */
  private generateKey(key: DisclosureCacheKey): string {
    return `${key.id}:${key.level}:${key.hash || "default"}`;
  }

  /**
   * 淘汰最旧的缓存项
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, item] of this.cache) {
      if (item.expiresAt < oldestTime) {
        oldestTime = item.expiresAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 清理过期缓存项
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Dispose of resources - stop cleanup timer and clear cache
   */
  async dispose(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }
}

/**
 * Disclosure manager interface
 */
export interface IDisclosureManager {
  applyDisclosure(
    results: UnifiedRetrievalResult[],
    level: DisclosureLevel
  ): UnifiedRetrievalResult[];
  applyAdaptiveDisclosure(
    results: UnifiedRetrievalResult[],
    maxTokens: number
  ): UnifiedRetrievalResult[];
  getDisclosureContent(result: UnifiedRetrievalResult, level: DisclosureLevel): DisclosureContent;
}

/**
 * Disclosure manager configuration
 */
export interface DisclosureManagerConfig {
  /** Disclosure strategy */
  strategy: DisclosureStrategy;
  /** Max tokens for adaptive disclosure */
  adaptiveMaxTokens: number;
  /** Prefer metadata below token threshold */
  preferMetadataBelow: number;
}

/**
 * Default disclosure manager configuration
 */
export const DEFAULT_DISCLOSURE_CONFIG: DisclosureManagerConfig = {
  strategy: DisclosureStrategy.METADATA,
  adaptiveMaxTokens: 3000,
  preferMetadataBelow: 500,
};

/**
 * Default Phase 2 disclosure manager configuration
 */
export const DEFAULT_DISCLOSURE_CONFIG_V2: DisclosureManagerConfigV2 = {
  ...DEFAULT_DISCLOSURE_CONFIG,
  enabled: true,
  thresholds: { l2: 0.7, l3: 0.85 },
  l1MaxTokens: 120,
  l2MaxTokens: 5000,
  cache: {
    enabled: true,
    maxSize: 2000,
    l1TtlMs: 300000,
    l2TtlMs: 300000,
    cleanupIntervalMs: 300000,
  },
  parallelLoad: { enabled: true, maxConcurrency: 8 },
  metrics: { enabled: true, sampleRate: 1.0 },
};

/**
 * DisclosureManager implementation
 * Manages three-tier disclosure mechanism
 */
export class DisclosureManager implements IDisclosureManager {
  private readonly _logger = logger;
  private readonly config: DisclosureManagerConfig;

  constructor(config?: Partial<DisclosureManagerConfig>) {
    this.config = { ...DEFAULT_DISCLOSURE_CONFIG, ...config };
    this._logger.info("[DisclosureManager] Initialized with config:", {
      strategy: this.config.strategy,
      adaptiveMaxTokens: this.config.adaptiveMaxTokens,
      preferMetadataBelow: this.config.preferMetadataBelow,
    });
  }

  /**
   * Apply disclosure level to results
   */
  applyDisclosure(
    results: UnifiedRetrievalResult[],
    level: DisclosureLevel
  ): UnifiedRetrievalResult[] {
    try {
      this._logger.debug(`[DisclosureManager] Applying disclosure level: ${level}`, {
        resultCount: results.length,
      });

      return results.map((result) => ({
        ...result,
        disclosure: this.getDisclosureContent(result, level),
      }));
    } catch (error) {
      this._logger.error("[DisclosureManager] Failed to apply disclosure:", error);
      throw new HybridRetrievalError(
        `Disclosure application failed: ${this.formatError(error)}`,
        HybridRetrievalErrorCode.DISCLOSURE_ERROR
      );
    }
  }

  /**
   * Apply adaptive disclosure based on token limit
   */
  applyAdaptiveDisclosure(
    results: UnifiedRetrievalResult[],
    maxTokens: number
  ): UnifiedRetrievalResult[] {
    try {
      this._logger.debug(
        `[DisclosureManager] Applying adaptive disclosure with maxTokens: ${maxTokens}`,
        {
          resultCount: results.length,
        }
      );

      // Calculate total tokens and determine appropriate disclosure level
      let totalTokens = 0;
      const tokenEstimates: number[] = [];

      for (const result of results) {
        const metadataTokens =
          this.estimateTokens(result.name) + this.estimateTokens(result.description);
        tokenEstimates.push(metadataTokens);
        totalTokens += metadataTokens;

        if (totalTokens > maxTokens) {
          break;
        }
      }

      // Apply appropriate disclosure level based on token budget
      if (totalTokens <= this.config.preferMetadataBelow) {
        return this.applyDisclosure(results, DisclosureLevel.METADATA);
      } else if (totalTokens <= maxTokens * 0.7) {
        return this.applyDisclosure(results, DisclosureLevel.CONTENT);
      } else {
        return this.applyDisclosure(results, DisclosureLevel.RESOURCES);
      }
    } catch (error) {
      this._logger.error("[DisclosureManager] Failed to apply adaptive disclosure:", error);
      throw new HybridRetrievalError(
        `Adaptive disclosure failed: ${this.formatError(error)}`,
        HybridRetrievalErrorCode.DISCLOSURE_ERROR
      );
    }
  }

  /**
   * Get disclosure content for a result
   */
  getDisclosureContent(result: UnifiedRetrievalResult, level: DisclosureLevel): DisclosureContent {
    const baseContent: DisclosureContent = {
      level,
      name: result.name,
      description: result.description,
      tokenCount: this.estimateTokens(result.name) + this.estimateTokens(result.description),
    };

    switch (level) {
      case DisclosureLevel.METADATA:
        return baseContent;

      case DisclosureLevel.CONTENT:
        return {
          ...baseContent,
          inputSchema: this.extractInputSchema(result),
          outputSchema: this.extractOutputSchema(result),
          examples: this.extractExamples(result),
          tokenCount:
            baseContent.tokenCount +
            this.estimateTokens(JSON.stringify(baseContent.inputSchema || {})),
        };

      case DisclosureLevel.RESOURCES:
        return {
          ...baseContent,
          inputSchema: this.extractInputSchema(result),
          outputSchema: this.extractOutputSchema(result),
          resources: this.extractResources(result),
          examples: this.extractExamples(result),
          tokenCount:
            baseContent.tokenCount +
            this.estimateTokens(JSON.stringify(baseContent.inputSchema || {})) +
            this.estimateTokens(JSON.stringify(baseContent.outputSchema || {})) +
            this.estimateTokens((baseContent.resources || []).join(", ")),
        };

      default:
        return baseContent;
    }
  }

  /**
   * Extract input schema from result metadata
   */
  private extractInputSchema(result: UnifiedRetrievalResult): Record<string, unknown> | undefined {
    if (result.metadata && typeof result.metadata === "object") {
      const metadata = result.metadata as Record<string, unknown>;
      if (metadata.inputSchema) {
        return metadata.inputSchema as Record<string, unknown>;
      }
      if (metadata.parameters) {
        return metadata.parameters as Record<string, unknown>;
      }
      if (metadata.input) {
        return metadata.input as Record<string, unknown>;
      }
    }
    return undefined;
  }

  /**
   * Extract output schema from result metadata
   */
  private extractOutputSchema(result: UnifiedRetrievalResult): Record<string, unknown> | undefined {
    if (result.metadata && typeof result.metadata === "object") {
      const metadata = result.metadata as Record<string, unknown>;
      if (metadata.outputSchema) {
        return metadata.outputSchema as Record<string, unknown>;
      }
      if (metadata.output) {
        return metadata.output as Record<string, unknown>;
      }
    }
    return undefined;
  }

  /**
   * Extract examples from result metadata
   */
  private extractExamples(result: UnifiedRetrievalResult): string[] {
    if (result.metadata && typeof result.metadata === "object") {
      const metadata = result.metadata as Record<string, unknown>;
      if (Array.isArray(metadata.examples)) {
        return metadata.examples as string[];
      }
      if (Array.isArray(metadata.example)) {
        return metadata.example as string[];
      }
    }
    return [];
  }

  /**
   * Extract resources from result metadata
   */
  private extractResources(result: UnifiedRetrievalResult): string[] {
    if (result.metadata && typeof result.metadata === "object") {
      const metadata = result.metadata as Record<string, unknown>;
      if (Array.isArray(metadata.resources)) {
        return metadata.resources as string[];
      }
      if (Array.isArray(metadata.relatedFiles)) {
        return metadata.relatedFiles as string[];
      }
      if (Array.isArray(metadata.dependencies)) {
        return metadata.dependencies as string[];
      }
      if (result.path) {
        return [result.path];
      }
    }
    return result.path ? [result.path] : [];
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English
    if (!text) {
      return 0;
    }
    return Math.ceil(text.length / 4);
  }

  /**
   * Format error message
   */
  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown error occurred in DisclosureManager";
  }
}
