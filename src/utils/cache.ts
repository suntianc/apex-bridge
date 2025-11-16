/**
 * 统一缓存工具类
 * 提供TTL、自动失效、LRU等功能的智能缓存
 */

import { logger } from './logger';

/**
 * 缓存项接口
 */
interface CacheItem<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  /** 默认TTL（毫秒），0表示永不过期 */
  defaultTTL?: number;
  /** 最大缓存项数量（LRU淘汰） */
  maxSize?: number;
  /** 是否启用统计 */
  enableStats?: boolean;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  size: number;
  hitRate: number;
}

/**
 * 统一缓存类
 * 支持TTL、LRU淘汰、统计信息
 */
export class Cache<T = any> {
  private cache: Map<string, CacheItem<T>>;
  private config: Required<CacheConfig>;
  private stats: CacheStats;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: CacheConfig = {}) {
    this.config = {
      defaultTTL: config.defaultTTL ?? 0, // 0表示永不过期
      maxSize: config.maxSize ?? 1000,
      enableStats: config.enableStats ?? true
    };

    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: 0,
      hitRate: 0
    };

    // 如果启用TTL，启动定期清理
    if (this.config.defaultTTL > 0) {
      this.startCleanup();
    }
  }

  /**
   * 获取缓存值
   */
  get(key: string): T | undefined {
    const item = this.cache.get(key);

    if (!item) {
      if (this.config.enableStats) {
        this.stats.misses++;
        this.updateHitRate();
      }
      return undefined;
    }

    // 检查是否过期
    if (this.config.defaultTTL > 0 && item.expiresAt < Date.now()) {
      this.cache.delete(key);
      if (this.config.enableStats) {
        this.stats.misses++;
        this.stats.evictions++;
        this.updateStats();
      }
      return undefined;
    }

    // 更新访问统计
    item.accessCount++;
    item.lastAccessedAt = Date.now();

    if (this.config.enableStats) {
      this.stats.hits++;
      this.updateHitRate();
    }

    return item.value;
  }

  /**
   * 设置缓存值
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const itemTTL = ttl ?? this.config.defaultTTL;
    const expiresAt = itemTTL > 0 ? now + itemTTL : Number.MAX_SAFE_INTEGER;

    // 检查是否需要LRU淘汰
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const item: CacheItem<T> = {
      value,
      expiresAt,
      createdAt: now,
      accessCount: 0,
      lastAccessedAt: now
    };

    this.cache.set(key, item);

    if (this.config.enableStats) {
      this.stats.sets++;
      this.updateStats();
    }
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted && this.config.enableStats) {
      this.stats.deletes++;
      this.updateStats();
    }
    return deleted;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    
    if (this.config.enableStats) {
      this.stats.evictions += size;
      this.updateStats();
    }
  }

  /**
   * 检查key是否存在且未过期
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) {
      return false;
    }

    // 检查是否过期
    if (this.config.defaultTTL > 0 && item.expiresAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    // 清理过期项
    this.cleanupExpired();
    return this.cache.size;
  }

  /**
   * 获取所有keys
   */
  keys(): string[] {
    this.cleanupExpired();
    return Array.from(this.cache.keys());
  }

  /**
   * 获取统计信息
   */
  getStats(): CacheStats {
    this.cleanupExpired();
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: 0,
      hitRate: 0
    };
  }

  /**
   * 清理过期项（LRU淘汰）
   */
  private evictLRU(): void {
    if (this.cache.size === 0) {
      return;
    }

    // 找到最少访问的项
    let lruKey: string | null = null;
    let minAccessCount = Infinity;
    let oldestAccess = Infinity;

    for (const [key, item] of this.cache.entries()) {
      // 优先淘汰访问次数最少的，如果相同则淘汰最久未访问的
      if (item.accessCount < minAccessCount || 
          (item.accessCount === minAccessCount && item.lastAccessedAt < oldestAccess)) {
        minAccessCount = item.accessCount;
        oldestAccess = item.lastAccessedAt;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      if (this.config.enableStats) {
        this.stats.evictions++;
      }
    }
  }

  /**
   * 清理所有过期项
   */
  private cleanupExpired(): void {
    if (this.config.defaultTTL === 0) {
      return; // 永不过期，无需清理
    }

    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt < now) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0 && this.config.enableStats) {
      this.stats.evictions += cleaned;
      this.updateStats();
    }
  }

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    // 每5分钟清理一次过期项
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000);
  }

  /**
   * 停止定期清理
   */
  public stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * 更新命中率
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * 更新统计信息
   */
  private updateStats(): void {
    this.stats.size = this.cache.size;
    this.updateHitRate();
  }

  /**
   * 销毁缓存（清理资源）
   */
  destroy(): void {
    this.stopCleanup();
    this.clear();
  }
}

/**
 * 创建带TTL的缓存
 */
export function createCache<T = any>(ttl: number, maxSize?: number): Cache<T> {
  return new Cache<T>({
    defaultTTL: ttl,
    maxSize: maxSize || 1000,
    enableStats: true
  });
}

/**
 * 创建无过期时间的缓存
 */
export function createPermanentCache<T = any>(maxSize?: number): Cache<T> {
  return new Cache<T>({
    defaultTTL: 0,
    maxSize: maxSize || 1000,
    enableStats: true
  });
}

