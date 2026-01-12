/**
 * SemanticCache - Semantic Query Caching Service
 *
 * Provides LRU caching with semantic similarity matching for repeated queries.
 * Avoids redundant embedding API calls and database queries.
 */

import LRUCache from "lru-cache";
import { createHash } from "crypto";
import { logger } from "../../utils/logger";
import type { EmbeddingVector } from "../tool-retrieval/types";

/**
 * Semantic cache configuration
 */
export interface SemanticCacheConfig {
  similarityThreshold: number;
  maxItems: number;
  ttlMs: number;
  persistToDisk: boolean;
  exactMatchThreshold?: number;
}

/**
 * Default configuration
 */
export const DEFAULT_SEMANTIC_CACHE_CONFIG: SemanticCacheConfig = {
  similarityThreshold: 0.95,
  maxItems: 10000,
  ttlMs: 3600000,
  persistToDisk: false,
  exactMatchThreshold: 0.99,
};

/**
 * Cached query entry
 */
export interface CachedQuery {
  query: string;
  embedding: number[];
  result: unknown;
  cachedAt: number;
  accessCount: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  exactMatches: number;
  similarMatches: number;
  averageSimilarity: number;
}

/**
 * Semantic search result
 */
export interface SemanticSearchResult {
  cachedQuery: CachedQuery;
  similarity: number;
  isExactMatch: boolean;
}

/**
 * SemanticCache implementation
 */
export class SemanticCache {
  private lruCache: LRUCache<string, CachedQuery>;
  private config: SemanticCacheConfig;
  private embeddingService: {
    generateForText: (text: string) => Promise<EmbeddingVector>;
  } | null;
  private stats: {
    hits: number;
    misses: number;
    exactMatches: number;
    similarMatches: number;
    totalSimilarity: number;
  };

  constructor(
    config?: Partial<SemanticCacheConfig>,
    embeddingService?: { generateForText: (text: string) => Promise<EmbeddingVector> }
  ) {
    this.config = { ...DEFAULT_SEMANTIC_CACHE_CONFIG, ...config };
    this.embeddingService = embeddingService || null;
    this.stats = {
      hits: 0,
      misses: 0,
      exactMatches: 0,
      similarMatches: 0,
      totalSimilarity: 0,
    };

    this.lruCache = new LRUCache<string, CachedQuery>({
      max: this.config.maxItems,
      ttl: this.config.ttlMs,
      updateAgeOnGet: true,
    });

    logger.info("[SemanticCache] Initialized with config:", {
      similarityThreshold: this.config.similarityThreshold,
      maxItems: this.config.maxItems,
      ttlMs: this.config.ttlMs,
    });
  }

  setEmbeddingService(service: {
    generateForText: (text: string) => Promise<EmbeddingVector>;
  }): void {
    this.embeddingService = service;
  }

  async findSimilar(query: string): Promise<SemanticSearchResult | null> {
    try {
      const queryEmbedding = await this._generateEmbedding(query);
      if (!queryEmbedding) {
        this.stats.misses++;
        return null;
      }

      let bestMatch: { entry: CachedQuery; similarity: number } | null = null;
      let bestSimilarity = 0;

      this.lruCache.forEach((entry: CachedQuery) => {
        if (this._isExactMatch(query, entry.query)) {
          entry.accessCount++;
          this.stats.hits++;
          this.stats.exactMatches++;
          this.stats.totalSimilarity += 1;

          bestMatch = { entry, similarity: 1 };
          bestSimilarity = 1;
        } else if (bestSimilarity < 1) {
          const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);

          if (similarity >= this.config.similarityThreshold && similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = { entry, similarity };
          }
        }
      });

      if (bestMatch) {
        if (bestSimilarity === 1) {
          logger.debug(`[SemanticCache] Cache exact match: query="${query.substring(0, 50)}..."`);
          return {
            cachedQuery: bestMatch.entry,
            similarity: 1,
            isExactMatch: true,
          };
        }

        bestMatch.entry.accessCount++;
        this.stats.hits++;
        this.stats.similarMatches++;
        this.stats.totalSimilarity += bestSimilarity;

        logger.debug(
          `[SemanticCache] Cache hit: similarity=${bestSimilarity.toFixed(4)}, query="${query.substring(0, 50)}..."`
        );

        return {
          cachedQuery: bestMatch.entry,
          similarity: bestSimilarity,
          isExactMatch: false,
        };
      }

      this.stats.misses++;
      return null;
    } catch (error) {
      logger.error("[SemanticCache] Error finding similar query:", error);
      this.stats.misses++;
      return null;
    }
  }

  async store(query: string, result: unknown): Promise<void> {
    try {
      const embedding = await this._generateEmbedding(query);
      if (!embedding) {
        logger.warn("[SemanticCache] Could not generate embedding for query, not caching");
        return;
      }

      const normalizedQuery = this._normalizeQuery(query);
      const entry: CachedQuery = {
        query: normalizedQuery,
        embedding,
        result,
        cachedAt: Date.now(),
        accessCount: 0,
      };

      this.lruCache.set(this._generateCacheKey(query), entry);

      logger.debug(`[SemanticCache] Cached query: "${query.substring(0, 50)}..."`);
    } catch (error) {
      logger.error("[SemanticCache] Error caching query:", error);
    }
  }

  get(query: string): { result: unknown; cachedAt: number } | null {
    const entry = this.lruCache.get(this._generateCacheKey(query));
    if (entry) {
      entry.accessCount++;
      this.stats.hits++;
      this.stats.exactMatches++;
      return {
        result: entry.result,
        cachedAt: entry.cachedAt,
      };
    }
    this.stats.misses++;
    return null;
  }

  has(query: string): boolean {
    return this.lruCache.has(this._generateCacheKey(query));
  }

  invalidate(query: string): boolean {
    const key = this._generateCacheKey(query);
    if (this.lruCache.has(key)) {
      this.lruCache.del(key);
      return true;
    }
    return false;
  }

  clear(): void {
    this.lruCache.reset();
    this.stats = {
      hits: 0,
      misses: 0,
      exactMatches: 0,
      similarMatches: 0,
      totalSimilarity: 0,
    };
    logger.info("[SemanticCache] Cache cleared");
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;
    const avgSimilarity = this.stats.hits > 0 ? this.stats.totalSimilarity / this.stats.hits : 0;

    return {
      size: this.lruCache.itemCount,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      exactMatches: this.stats.exactMatches,
      similarMatches: this.stats.similarMatches,
      averageSimilarity: avgSimilarity,
    };
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  private _isExactMatch(a: string, b: string): boolean {
    const normalizedA = this._normalizeQuery(a);
    const normalizedB = this._normalizeQuery(b);
    return normalizedA === normalizedB;
  }

  /**
   * Generate a consistent cache key using MD5 hash
   * This ensures unique keys for semantically identical queries
   */
  private _generateCacheKey(query: string): string {
    const normalized = this._normalizeQuery(query);
    return createHash("md5").update(normalized).digest("hex");
  }

  /**
   * Normalize query for consistent comparison
   */
  private _normalizeQuery(query: string): string {
    return query.trim().toLowerCase();
  }

  private async _generateEmbedding(query: string): Promise<number[] | null> {
    if (!this.embeddingService) {
      logger.warn("[SemanticCache] No embedding service configured");
      return null;
    }

    try {
      const vector = await this.embeddingService.generateForText(query);
      return vector.values;
    } catch (error) {
      logger.error("[SemanticCache] Error generating embedding:", error);
      return null;
    }
  }

  getConfig(): SemanticCacheConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<SemanticCacheConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info("[SemanticCache] Configuration updated:", config);
  }

  getMemoryUsage(): { itemCount: number; approximateBytes: number } {
    let totalBytes = 0;

    this.lruCache.forEach((entry: CachedQuery) => {
      totalBytes += entry.query.length * 2;
      totalBytes += entry.embedding.length * 8;
      totalBytes += JSON.stringify(entry.result).length * 2;
    });

    return {
      itemCount: this.lruCache.itemCount,
      approximateBytes: totalBytes,
    };
  }
}
