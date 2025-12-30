/**
 * MemoryManager - 内存管理器
 *
 * 职责：
 * 1. TTL 缓存管理（战略上下文、世界模型更新等）
 * 2. 定期清理过期数据
 * 3. 缓存统计和信息提供
 *
 * 设计要点：
 * - 使用现有 Cache 工具类
 * - 提供统一的缓存接口
 * - 支持定期自动清理
 */

import { Cache, createCache } from '../../utils/cache';
import { logger } from '../../utils/logger';
import type { CleanupStats, CacheEntry, CacheStats } from './types';

/**
 * 内存管理器接口
 */
export interface IMemoryManager {
  /**
   * 获取缓存条目
   */
  get<T>(key: string): Promise<CacheEntry<T> | null>;

  /**
   * 设置缓存条目
   */
  set<T>(key: string, value: T, ttl: number): Promise<void>;

  /**
   * 删除缓存条目
   */
  delete(key: string): Promise<void>;

  /**
   * 检查键是否存在
   */
  has(key: string): boolean;

  /**
   * 获取缓存大小
   */
  size(): number;

  /**
   * 清理过期条目
   */
  cleanup(): Promise<CleanupStats>;

  /**
   * 启动定期清理任务
   */
  startPeriodicCleanup(): void;

  /**
   * 停止定期清理任务
   */
  stopPeriodicCleanup(): void;

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats;

  /**
   * 销毁管理器
   */
  destroy(): void;
}

/**
 * 内存管理器实现
 */
export class MemoryManager implements IMemoryManager {
  /** 缓存实例 */
  private readonly cache: Map<string, CacheEntry<unknown>>;

  /** 默认 TTL（毫秒） */
  private readonly defaultTTL: number;

  /** 最大缓存条目数 */
  private readonly maxEntries: number;

  /** 定期清理定时器 */
  private cleanupInterval: NodeJS.Timeout | null = null;

  /** 清理间隔（毫秒） */
  private readonly cleanupIntervalMs: number;

  /** 缓存统计 */
  private stats: {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
  };

  /**
   * 构造函数
   *
   * @param defaultTTL 默认 TTL（毫秒）
   * @param maxEntries 最大缓存条目数
   * @param cleanupIntervalMs 清理间隔（毫秒）
   */
  constructor(
    defaultTTL: number = 30 * 24 * 60 * 60 * 1000, // 30天
    maxEntries: number = 1000,
    cleanupIntervalMs: number = 60 * 60 * 1000 // 1小时
  ) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    this.maxEntries = maxEntries;
    this.cleanupIntervalMs = cleanupIntervalMs;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };

    logger.info(`[MemoryManager] Initialized with TTL: ${defaultTTL}ms, maxEntries: ${maxEntries}`);
  }

  /**
   * 获取缓存条目
   */
  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.deletes++;
      return null;
    }

    // 更新访问统计
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    this.stats.hits++;

    return entry as CacheEntry<T>;
  }

  /**
   * 设置缓存条目
   */
  async set<T>(key: string, value: T, ttl: number = this.defaultTTL): Promise<void> {
    // 检查是否需要 LRU 淘汰
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.evictLRU();
    }

    const now = Date.now();
    const entry: CacheEntry<T> = {
      data: value,
      createdAt: now,
      expiresAt: now + ttl,
      accessCount: 0,
      lastAccessedAt: now
    };

    this.cache.set(key, entry);
    this.stats.sets++;
  }

  /**
   * 删除缓存条目
   */
  async delete(key: string): Promise<void> {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
  }

  /**
   * 检查键是否存在且未过期
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // 检查是否过期
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 清理过期条目
   */
  async cleanup(): Promise<CleanupStats> {
    const startTime = Date.now();
    const beforeSize = this.cache.size;
    let cleanedCount = 0;

    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    const duration = Date.now() - startTime;
    const afterSize = this.cache.size;

    if (cleanedCount > 0) {
      logger.info(`[MemoryManager] Cleaned up ${cleanedCount} expired entries in ${duration}ms`);
    }

    return {
      cleanedAt: new Date(),
      removedCount: cleanedCount,
      currentSize: afterSize,
      duration
    };
  }

  /**
   * 启动定期清理任务
   */
  startPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(error => {
        logger.error('[MemoryManager] Cleanup failed:', error);
      });
    }, this.cleanupIntervalMs);

    // 不阻止进程退出
    if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }

    logger.info(`[MemoryManager] Started periodic cleanup every ${this.cleanupIntervalMs}ms`);
  }

  /**
   * 停止定期清理任务
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[MemoryManager] Stopped periodic cleanup');
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;

    return {
      size: this.cache.size,
      maxSize: this.maxEntries,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0
    };
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.stopPeriodicCleanup();
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };

    logger.info('[MemoryManager] Destroyed and cleaned up all resources');
  }

  /**
   * LRU 淘汰 - 淘汰访问次数最少的条目
   */
  private evictLRU(): void {
    if (this.cache.size === 0) {
      return;
    }

    let lruKey: string | null = null;
    let minAccessCount = Infinity;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < minAccessCount ||
          (entry.accessCount === minAccessCount && entry.lastAccessedAt < oldestAccess)) {
        minAccessCount = entry.accessCount;
        oldestAccess = entry.lastAccessedAt;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.deletes++;
      logger.debug(`[MemoryManager] Evicted LRU entry: ${lruKey}`);
    }
  }
}

/**
 * 创建默认内存管理器
 */
export function createMemoryManager(
  ttl?: number,
  maxEntries?: number,
  cleanupInterval?: number
): MemoryManager {
  return new MemoryManager(ttl, maxEntries, cleanupInterval);
}
