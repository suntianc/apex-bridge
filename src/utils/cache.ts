/**
 * 统一缓存工具类
 * 提供TTL、自动失效、LRU等功能的智能缓存
 */

import { logger } from "./logger";

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
      enableStats: config.enableStats ?? true,
    };

    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: 0,
      hitRate: 0,
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
      lastAccessedAt: now,
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
   * ⚡️ 优化：不再触发全量清理，保证 O(1) 性能
   * 过期项会在 get/has 时惰性删除，或由定期清理任务处理
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 获取所有keys
   * ⚡️ 优化：不再触发全量清理，保证 O(1) 性能
   * 过期项会在 get/has 时惰性删除，或由定期清理任务处理
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取统计信息
   * ⚡️ 优化：不再触发全量清理，保证 O(1) 性能
   * 过期项会在 get/has 时惰性删除，或由定期清理任务处理
   */
  getStats(): CacheStats {
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
      hitRate: 0,
    };
  }

  /**
   * 清理过期项（LFU淘汰 - Least Frequently Used）
   * ⚠️ 性能说明：此方法使用 O(N) 复杂度遍历整个缓存
   * 适合中小规模缓存（< 1000 项）且需要按访问频率淘汰的场景
   * 如果需要 O(1) 性能，可改用纯 LRU 实现（基于 Map 插入顺序）
   */
  private evictLRU(): void {
    if (this.cache.size === 0) {
      return;
    }

    // 找到最少访问的项（LFU 算法）
    let lruKey: string | null = null;
    let minAccessCount = Infinity;
    let oldestAccess = Infinity;

    // O(N) 遍历：优先淘汰访问次数最少的，如果相同则淘汰最久未访问的
    for (const [key, item] of this.cache.entries()) {
      if (
        item.accessCount < minAccessCount ||
        (item.accessCount === minAccessCount && item.lastAccessedAt < oldestAccess)
      ) {
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
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpired();
      },
      5 * 60 * 1000
    );

    // ✅ 关键修复：不阻止进程退出
    // 允许进程在没有其他任务时自动退出，避免定时器阻止 Node.js 进程退出
    if (this.cleanupInterval && typeof this.cleanupInterval.unref === "function") {
      this.cleanupInterval.unref();
    }
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
    enableStats: true,
  });
}

/**
 * 创建无过期时间的缓存
 */
export function createPermanentCache<T = any>(maxSize?: number): Cache<T> {
  return new Cache<T>({
    defaultTTL: 0,
    maxSize: maxSize || 1000,
    enableStats: true,
  });
}

// ========== ACE服务专用缓存工具 ==========

import { EventEmitter } from "events";

/**
 * Simple async lock for concurrency control
 * Prevents race conditions in async operations
 */
export class AsyncLock {
  private locks = new Map<string, Promise<void>>();

  /**
   * Acquire lock and execute callback
   */
  async withLock<T>(key: string, callback: () => Promise<T>): Promise<T> {
    // Wait for existing lock
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    // Create new lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(key, lockPromise);

    try {
      return await callback();
    } finally {
      this.locks.delete(key);
      releaseLock!();
    }
  }

  /**
   * Check if a key is currently locked
   */
  isLocked(key: string): boolean {
    return this.locks.has(key);
  }

  /**
   * Clear all locks
   */
  clear(): void {
    this.locks.clear();
  }
}

/**
 * Read-Write Lock for concurrent read access with exclusive write
 */
export class ReadWriteLock {
  private readers = 0;
  private writers = 0;
  private pendingWriters = 0;
  private events = new EventEmitter();

  async acquireRead(): Promise<() => void> {
    // Wait if there's a writer or pending writer
    while (this.writers > 0 || this.pendingWriters > 0) {
      await new Promise<void>((resolve) => {
        this.events.once("readReady", resolve);
      });
    }

    this.readers++;

    return () => {
      this.readers--;
      if (this.readers === 0) {
        this.events.emit("writeReady");
      }
    };
  }

  async acquireWrite(): Promise<() => void> {
    this.pendingWriters++;

    // Wait for all readers and writers to finish
    while (this.readers > 0 || this.writers > 0) {
      await new Promise<void>((resolve) => {
        this.events.once("writeReady", resolve);
      });
    }

    this.pendingWriters--;
    this.writers++;

    return () => {
      this.writers--;
      this.events.emit("readReady");
      this.events.emit("writeReady");
    };
  }

  /**
   * Execute callback with read lock
   */
  async withReadLock<T>(callback: () => Promise<T>): Promise<T> {
    const release = await this.acquireRead();
    try {
      return await callback();
    } finally {
      release();
    }
  }

  /**
   * Execute callback with write lock
   */
  async withWriteLock<T>(callback: () => Promise<T>): Promise<T> {
    const release = await this.acquireWrite();
    try {
      return await callback();
    } finally {
      release();
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.events.removeAllListeners();
  }
}

/**
 * Event listener tracker for preventing memory leaks
 * Tracks listeners and provides cleanup functionality
 */
export class EventListenerTracker {
  private listeners: Array<{
    emitter: EventEmitter;
    event: string;
    listener: (...args: unknown[]) => void;
  }> = [];

  /**
   * Add a tracked listener
   */
  addListener(emitter: EventEmitter, event: string, listener: (...args: unknown[]) => void): void {
    emitter.on(event, listener);
    this.listeners.push({ emitter, event, listener });
  }

  /**
   * Add a tracked once listener
   */
  addOnceListener(
    emitter: EventEmitter,
    event: string,
    listener: (...args: unknown[]) => void
  ): void {
    const wrappedListener = (...args: unknown[]) => {
      // Remove from tracking after execution
      const idx = this.listeners.findIndex(
        (l) => l.emitter === emitter && l.event === event && l.listener === wrappedListener
      );
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
      listener(...args);
    };

    emitter.once(event, wrappedListener);
    this.listeners.push({ emitter, event, listener: wrappedListener });
  }

  /**
   * Remove all tracked listeners
   */
  removeAll(): void {
    for (const { emitter, event, listener } of this.listeners) {
      emitter.removeListener(event, listener);
    }
    this.listeners = [];
  }

  /**
   * Get number of tracked listeners
   */
  size(): number {
    return this.listeners.length;
  }
}

/**
 * LRU Map - 简化版LRU缓存，基于Map插入顺序
 * 适用于需要O(1)性能的场景
 */
export class LRUMap<K, V> {
  private cache = new Map<K, V>();

  constructor(private maxSize: number = 1000) {
    if (maxSize <= 0) {
      throw new Error("LRU map maxSize must be positive");
    }
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else {
      // Evict if at capacity
      while (this.cache.size >= this.maxSize) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) {
          this.cache.delete(oldest);
        } else {
          break;
        }
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  values(): IterableIterator<V> {
    return this.cache.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  forEach(callback: (value: V, key: K) => void): void {
    this.cache.forEach(callback);
  }
}
