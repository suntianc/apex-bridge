interface TTLCacheConfig {
  maxSize: number;
  ttl: number; // milliseconds
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  lastAccessed: number;
}

export class TTLCache<K, V> {
  private readonly config: TTLCacheConfig;
  private readonly store = new Map<K, CacheEntry<V>>();

  constructor(config: TTLCacheConfig) {
    if (config.maxSize <= 0) {
      throw new Error('TTLCache maxSize must be greater than 0');
    }
    if (config.ttl <= 0) {
      throw new Error('TTLCache ttl must be greater than 0');
    }
    this.config = config;
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }

    entry.lastAccessed = Date.now();
    return entry.value;
  }

  set(key: K, value: V): void {
    const now = Date.now();
    const expiresAt = now + this.config.ttl;

    if (this.store.size >= this.config.maxSize && !this.store.has(key)) {
      this.evictOldest();
    }

    this.store.set(key, {
      value,
      expiresAt,
      lastAccessed: now
    });
  }

  has(key: K): boolean {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    this.purgeExpired();
    return this.store.size;
  }

  entries(): Array<{ key: K; value: V }> {
    this.purgeExpired();
    return Array.from(this.store.entries()).map(([key, entry]) => ({
      key,
      value: entry.value
    }));
  }

  private isExpired(entry: CacheEntry<V>): boolean {
    return entry.expiresAt <= Date.now();
  }

  private evictOldest(): void {
    let oldestKey: K | undefined;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.store.entries()) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
        return;
      }
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.store.delete(oldestKey);
    }
  }

  private purgeExpired(): void {
    for (const [key, entry] of this.store.entries()) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
      }
    }
  }
}

