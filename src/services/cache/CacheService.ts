/**
 * CacheService - Redis 缓存服务
 *
 * 提供工具检索结果缓存、LLM 配置缓存等功能
 */

import { createClient, RedisClientType } from "redis";
import { logger } from "../../utils/logger";
import { metricsService } from "../monitoring/MetricsService";
import { ConfigService } from "../../services/ConfigService";

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
}

class CacheService {
  private static instance: CacheService;
  private client: RedisClientType | null = null;
  private isConnected = false;
  private connectPromise: Promise<void> | null = null;
  private readonly defaultTTL = 300; // 5 minutes

  private constructor() {}

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * 初始化 Redis 连接
   */
  async initialize(): Promise<void> {
    // 检查缓存是否启用
    const configService = ConfigService.getInstance();
    const fullConfig = configService.getFullConfig();
    const redisConfig = fullConfig.redis;

    // 如果 Redis 未配置或显式禁用，跳过初始化
    if (!redisConfig || redisConfig.enabled === false) {
      logger.info("[CacheService] Cache is disabled, skipping Redis initialization");
      this.isConnected = false;
      this.client = null;
      return;
    }

    if (this.client && this.isConnected) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    const redisHost = redisConfig.host || "localhost";
    const redisPort = redisConfig.port || 6379;
    const redisPassword = redisConfig.password || undefined;
    const redisDb = redisConfig.db ?? 0;

    const redisUrl = redisPassword
      ? `redis://:${redisPassword}@${redisHost}:${redisPort}/${redisDb}`
      : `redis://${redisHost}:${redisPort}/${redisDb}`;

    this.connectPromise = (async () => {
      try {
        this.client = createClient({ url: redisUrl });

        this.client.on("error", (err) => {
          logger.error("[CacheService] Redis client error:", err);
          this.isConnected = false;
        });

        this.client.on("connect", () => {
          logger.info("[CacheService] Redis client connected");
          this.isConnected = true;
        });

        this.client.on("reconnecting", () => {
          logger.warn("[CacheService] Redis client reconnecting");
        });

        await this.client.connect();
        this.isConnected = true;
        logger.info("[CacheService] Redis initialized successfully");
      } catch (error) {
        logger.error("[CacheService] Failed to connect to Redis:", error);
        this.isConnected = false;
        this.client = null;
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  /**
   * 检查缓存是否可用
   */
  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * 获取缓存值
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const value = await this.client!.get(key);
      if (value === null) {
        metricsService.recordCacheMiss();
        return null;
      }

      metricsService.recordCacheHit();
      const entry: CacheEntry = JSON.parse(value);
      return entry.data as T;
    } catch (error) {
      logger.error(`[CacheService] Get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * 设置缓存值
   */
  async set<T>(key: string, value: T, ttl: number = this.defaultTTL): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const entry: CacheEntry = {
        data: value,
        timestamp: Date.now(),
        ttl,
      };
      await this.client!.setEx(key, ttl, JSON.stringify(entry));
      return true;
    } catch (error) {
      logger.error(`[CacheService] Set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * 删除缓存值
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.client!.del(key);
      return true;
    } catch (error) {
      logger.error(`[CacheService] Delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * 按模式批量删除缓存
   */
  async deleteByPattern(pattern: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const keys = await this.client!.keys(pattern);
      if (keys.length > 0) {
        await this.client!.del(keys);
      }
      return true;
    } catch (error) {
      logger.error(`[CacheService] DeleteByPattern error for pattern ${pattern}:`, error);
      return false;
    }
  }

  /**
   * 获取工具缓存键
   */
  getToolCacheKey(query: string, userId?: string): string {
    const normalizedQuery = query.toLowerCase().trim();
    return userId ? `tools:${userId}:${normalizedQuery}` : `tools:global:${normalizedQuery}`;
  }

  /**
   * 缓存工具检索结果
   */
  async cacheToolResults(
    query: string,
    results: unknown[],
    userId?: string,
    ttl: number = 600
  ): Promise<boolean> {
    const key = this.getToolCacheKey(query, userId);
    return this.set(key, results, ttl);
  }

  /**
   * 获取缓存的工具检索结果
   */
  async getCachedToolResults(query: string, userId?: string): Promise<unknown[] | null> {
    const key = this.getToolCacheKey(query, userId);
    return this.get<unknown[]>(key);
  }

  /**
   * 清理工具缓存
   */
  async clearToolCache(userId?: string): Promise<boolean> {
    const pattern = userId ? `tools:${userId}:*` : "tools:*";
    return this.deleteByPattern(pattern);
  }

  /**
   * 关闭 Redis 连接
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      this.connectPromise = null;
      logger.info("[CacheService] Redis connection closed");
    }
  }
}

export const cacheService = CacheService.getInstance();
export { CacheService };
