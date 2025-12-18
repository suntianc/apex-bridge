/**
 * SimilarityService - 标签相似度计算与管理服务
 *
 * 负责计算和管理类型标签之间的相似度关系，包括：
 * - 基于关键词的相似度计算（Jaccard相似度、关键词相似度）
 * - 共现次数统计和管理
 * - 相似度矩阵的更新和维护
 * - 缓存机制优化性能（TTL 5分钟）
 *
 * 依赖 TypeVocabularyService 获取标签关键词信息
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';
import { PathService } from './PathService';
import { TypeVocabularyService } from './TypeVocabularyService';
import {
  TypeSimilarity,
  TypeVocabulary
} from '../core/playbook/types';

/**
 * 缓存项接口
 */
interface CacheItem<T> {
  data: T;
  timestamp: number;
}

/**
 * SimilarityService 单例
 * 管理标签相似度计算和相似度矩阵维护
 */
export class SimilarityService {
  private static instance: SimilarityService;
  private db: Database.Database;
  private dbPath: string;
  private vocabularyService: TypeVocabularyService;

  // 缓存配置
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟
  private similarityCache: Map<string, CacheItem<number>> = new Map();
  private similarTagsCache: Map<string, CacheItem<TypeSimilarity[]>> = new Map();
  private allTagsCache: CacheItem<TypeVocabulary[]> | null = null;

  private constructor() {
    const pathService = PathService.getInstance();
    const dataDir = pathService.getDataDir();

    // 确保数据目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, 'playbook.db');
    this.db = new Database(this.dbPath);

    // 启用 WAL 模式提升性能
    this.db.pragma('journal_mode = WAL');
    // 启用外键约束
    this.db.pragma('foreign_keys = ON');

    this.vocabularyService = TypeVocabularyService.getInstance();

    this.initializeDatabase();
    logger.debug(`SimilarityService initialized (database: ${this.dbPath})`);
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): SimilarityService {
    if (!SimilarityService.instance) {
      SimilarityService.instance = new SimilarityService();
    }
    return SimilarityService.instance;
  }

  /**
   * 初始化数据库表结构
   * 注意：表结构已在 TypeVocabularyService 中创建
   * 这里只负责索引和初始化检查
   */
  private initializeDatabase(): void {
    // 验证 type_similarity_matrix 表是否存在
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='type_similarity_matrix'
    `).get();

    if (!tableExists) {
      throw new Error('type_similarity_matrix table not found. Please ensure TypeVocabularyService is initialized first.');
    }

    // 确保索引存在
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_similarity_score ON type_similarity_matrix(similarity_score DESC);
      CREATE INDEX IF NOT EXISTS idx_similarity_tags ON type_similarity_matrix(tag1, tag2);
      CREATE INDEX IF NOT EXISTS idx_similarity_tag1 ON type_similarity_matrix(tag1);
      CREATE INDEX IF NOT EXISTS idx_similarity_tag2 ON type_similarity_matrix(tag2);
    `);

    logger.debug('✅ Similarity matrix indices verified');
  }

  // =============================================================================
  // 1. 核心相似度计算方法
  // =============================================================================

  /**
   * 计算两个标签的相似度
   * 综合考虑关键词相似度和共现次数
   */
  public async calculateSimilarity(tag1: string, tag2: string): Promise<number> {
    try {
      // 检查缓存
      const cacheKey = this.getSimilarityCacheKey(tag1, tag2);
      const cached = this.getFromCache(this.similarityCache, cacheKey);
      if (cached !== null) {
        return cached;
      }

      // 规范化标签顺序（确保一致性）
      const [t1, t2] = tag1 < tag2 ? [tag1, tag2] : [tag2, tag1];

      // 首先检查数据库中是否已存在
      const existing = this.getSimilarityFromDB(t1, t2);
      if (existing) {
        // 更新缓存并返回
        this.setCache(this.similarityCache, cacheKey, existing.similarity_score);
        return existing.similarity_score;
      }

      // 计算新的相似度
      const similarity = await this.computeSimilarity(t1, t2);

      // 存储到数据库
      await this.updateSimilarity(t1, t2, similarity);

      logger.debug(`Calculated similarity between '${t1}' and '${t2}': ${similarity.toFixed(4)}`);
      return similarity;
    } catch (error) {
      logger.error(`Failed to calculate similarity between '${tag1}' and '${tag2}':`, error);
      throw error;
    }
  }

  /**
   * 获取标签的相似标签列表
   */
  public async getSimilarTags(tagName: string, threshold: number = 0.7): Promise<TypeSimilarity[]> {
    try {
      // 检查缓存
      const cacheKey = `${tagName}:${threshold}`;
      const cached = this.getFromCache(this.similarTagsCache, cacheKey);
      if (cached !== null) {
        return cached;
      }

      // 查询数据库
      const stmt = this.db.prepare(`
        SELECT tag1, tag2, similarity_score, co_occurrence_count, last_updated
        FROM type_similarity_matrix
        WHERE (tag1 = ? OR tag2 = ?) AND similarity_score >= ?
        ORDER BY similarity_score DESC
      `);

      const rows = stmt.all(tagName, tagName, threshold) as any[];

      const result = rows.map(row => this.mapRowToTypeSimilarity(row));

      // 缓存结果
      this.setCache(this.similarTagsCache, cacheKey, result);

      logger.debug(`Found ${result.length} similar tags for '${tagName}' (threshold: ${threshold})`);
      return result;
    } catch (error) {
      logger.error(`Failed to get similar tags for '${tagName}':`, error);
      throw error;
    }
  }

  /**
   * 更新相似度分数
   */
  public async updateSimilarity(tag1: string, tag2: string, score: number): Promise<void> {
    try {
      // 验证输入
      if (score < 0 || score > 1) {
        throw new Error('Similarity score must be in range [0, 1]');
      }

      if (tag1 === tag2) {
        throw new Error('Cannot calculate similarity between the same tag');
      }

      // 规范化标签顺序
      const [t1, t2] = tag1 < tag2 ? [tag1, tag2] : [tag2, tag1];
      const now = Date.now();

      // 使用 UPSERT 操作
      const stmt = this.db.prepare(`
        INSERT INTO type_similarity_matrix (tag1, tag2, similarity_score, co_occurrence_count, last_updated)
        VALUES (?, ?, ?, 0, ?)
        ON CONFLICT(tag1, tag2) DO UPDATE SET
          similarity_score = excluded.similarity_score,
          last_updated = excluded.last_updated
      `);

      stmt.run(t1, t2, score, now);

      // 清除相关缓存
      this.clearSimilarityCache(t1, t2);

      logger.debug(`Updated similarity for (${t1}, ${t2}): ${score}`);
    } catch (error) {
      logger.error(`Failed to update similarity for '${tag1}' and '${tag2}':`, error);
      throw error;
    }
  }

  /**
   * 增加共现次数
   */
  public async incrementCoOccurrence(tag1: string, tag2: string): Promise<void> {
    try {
      if (tag1 === tag2) {
        return; // 不计算同一标签的共现
      }

      // 规范化标签顺序
      const [t1, t2] = tag1 < tag2 ? [tag1, tag2] : [tag2, tag1];
      const now = Date.now();

      // 使用 UPSERT 操作增加共现次数
      const stmt = this.db.prepare(`
        INSERT INTO type_similarity_matrix (tag1, tag2, similarity_score, co_occurrence_count, last_updated)
        VALUES (?, ?, 0.0, 1, ?)
        ON CONFLICT(tag1, tag2) DO UPDATE SET
          co_occurrence_count = co_occurrence_count + 1,
          last_updated = excluded.last_updated
      `);

      const result = stmt.run(t1, t2, now);

      // 如果是新插入的记录，计算初始相似度
      if (result.changes > 0) {
        const similarity = await this.computeSimilarity(t1, t2);
        await this.updateSimilarity(t1, t2, similarity);
      }

      logger.debug(`Incremented co-occurrence for (${t1}, ${t2})`);
    } catch (error) {
      logger.error(`Failed to increment co-occurrence for '${tag1}' and '${tag2}':`, error);
      throw error;
    }
  }

  /**
   * 更新整个相似度矩阵
   * 重新计算所有标签对的相似度
   */
  public async updateSimilarityMatrix(): Promise<void> {
    try {
      logger.info('Starting similarity matrix update...');
      const startTime = Date.now();

      // 获取所有标签
      const allTags = await this.vocabularyService.getAllTags();
      const tagCount = allTags.length;

      if (tagCount < 2) {
        logger.info('Not enough tags to update similarity matrix');
        return;
      }

      // 使用事务处理批量更新
      const transaction = this.db.transaction(() => {
        let updated = 0;

        for (let i = 0; i < tagCount; i++) {
          for (let j = i + 1; j < tagCount; j++) {
            const tag1 = allTags[i];
            const tag2 = allTags[j];

            const similarity = this.calculateKeywordSimilarity(
              tag1.keywords,
              tag2.keywords
            );

            const now = Date.now();
            const stmt = this.db.prepare(`
              INSERT INTO type_similarity_matrix (tag1, tag2, similarity_score, co_occurrence_count, last_updated)
              VALUES (?, ?, ?, 0, ?)
              ON CONFLICT(tag1, tag2) DO UPDATE SET
                similarity_score = excluded.similarity_score,
                last_updated = excluded.last_updated
            `);

            stmt.run(tag1.tag_name, tag2.tag_name, similarity, now);
            updated++;
          }
        }

        return updated;
      });

      const updated = transaction();

      // 清除所有缓存
      this.clearAllCaches();

      const duration = Date.now() - startTime;
      logger.info(`✅ Similarity matrix updated: ${updated} pairs in ${duration}ms`);
    } catch (error) {
      logger.error('Failed to update similarity matrix:', error);
      throw error;
    }
  }

  // =============================================================================
  // 2. 辅助计算方法
  // =============================================================================

  /**
   * 计算 Jaccard 相似度
   * Jaccard(A, B) = |A ∩ B| / |A ∪ B|
   */
  public calculateJaccardSimilarity(set1: string[], set2: string[]): number {
    const s1 = new Set(set1.map(k => k.toLowerCase()));
    const s2 = new Set(set2.map(k => k.toLowerCase()));

    const intersection = new Set([...s1].filter(x => s2.has(x)));
    const union = new Set([...s1, ...s2]);

    if (union.size === 0) {
      return 0;
    }

    return intersection.size / union.size;
  }

  /**
   * 计算关键词相似度
   * 综合考虑 Jaccard 相似度和标签名称匹配
   */
  public calculateKeywordSimilarity(keywords1: string[], keywords2: string[]): number {
    if (!keywords1 || keywords1.length === 0 || !keywords2 || keywords2.length === 0) {
      return 0;
    }

    // Jaccard 相似度
    const jaccardSim = this.calculateJaccardSimilarity(keywords1, keywords2);

    // 额外的相似度指标（可选）
    // 例如：最长公共子序列、编辑距离等

    // 综合评分（可以根据需要调整权重）
    const finalScore = jaccardSim;

    // 确保分数在 [0, 1] 范围内
    return Math.max(0, Math.min(1, finalScore));
  }

  // =============================================================================
  // 3. 内部辅助方法
  // =============================================================================

  /**
   * 从数据库获取相似度记录
   */
  private getSimilarityFromDB(tag1: string, tag2: string): TypeSimilarity | null {
    const stmt = this.db.prepare(`
      SELECT tag1, tag2, similarity_score, co_occurrence_count, last_updated
      FROM type_similarity_matrix
      WHERE tag1 = ? AND tag2 = ?
    `);

    const row = stmt.get(tag1, tag2) as any;
    return row ? this.mapRowToTypeSimilarity(row) : null;
  }

  /**
   * 计算两个标签的相似度（内部方法）
   */
  private async computeSimilarity(tag1: string, tag2: string): Promise<number> {
    // 获取标签信息
    const tag1Data = await this.vocabularyService.getTag(tag1);
    const tag2Data = await this.vocabularyService.getTag(tag2);

    if (!tag1Data || !tag2Data) {
      throw new Error(`One or both tags not found: ${tag1}, ${tag2}`);
    }

    // 计算基础相似度
    let similarity = this.calculateKeywordSimilarity(tag1Data.keywords, tag2Data.keywords);

    // 考虑共现次数的加权（如果有的话）
    const similarityRecord = this.getSimilarityFromDB(tag1, tag2);
    if (similarityRecord && similarityRecord.co_occurrence_count > 0) {
      // 共现次数越多，相似度越高（但有上限）
      const coOccurrenceBoost = Math.min(
        0.2,
        Math.log(similarityRecord.co_occurrence_count + 1) * 0.05
      );
      similarity = Math.min(1, similarity + coOccurrenceBoost);
    }

    return similarity;
  }

  /**
   * 映射数据库行到 TypeSimilarity 对象
   */
  private mapRowToTypeSimilarity(row: any): TypeSimilarity {
    return {
      tag1: row.tag1,
      tag2: row.tag2,
      similarity_score: row.similarity_score,
      co_occurrence_count: row.co_occurrence_count,
      last_updated: row.last_updated
    };
  }

  // =============================================================================
  // 4. 缓存管理方法
  // =============================================================================

  /**
   * 从缓存获取数据
   */
  private getFromCache<T>(cache: Map<string, CacheItem<T>>, key: string): T | null {
    const item = cache.get(key);
    if (!item) {
      return null;
    }

    // 检查是否过期
    if (Date.now() - item.timestamp > this.CACHE_TTL) {
      cache.delete(key);
      return null;
    }

    return item.data;
  }

  /**
   * 设置缓存
   */
  private setCache<T>(cache: Map<string, CacheItem<T>>, key: string, data: T): void {
    cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 生成相似度缓存键
   */
  private getSimilarityCacheKey(tag1: string, tag2: string): string {
    const [t1, t2] = tag1 < tag2 ? [tag1, tag2] : [tag2, tag1];
    return `${t1}:${t2}`;
  }

  /**
   * 清除相似度相关缓存
   */
  private clearSimilarityCache(tag1: string, tag2: string): void {
    const key = this.getSimilarityCacheKey(tag1, tag2);
    this.similarityCache.delete(key);

    // 清除相关标签的相似标签缓存
    const patterns = [tag1, tag2];
    for (const pattern of patterns) {
      for (const cacheKey of this.similarTagsCache.keys()) {
        if (cacheKey.startsWith(pattern + ':')) {
          this.similarTagsCache.delete(cacheKey);
        }
      }
    }
  }

  /**
   * 清除所有缓存
   */
  private clearAllCaches(): void {
    this.similarityCache.clear();
    this.similarTagsCache.clear();
    this.allTagsCache = null;
    logger.debug('All caches cleared');
  }

  /**
   * 获取缓存统计信息
   */
  public getCacheStats(): {
    similarityCacheSize: number;
    similarTagsCacheSize: number;
    cacheTTL: number;
  } {
    return {
      similarityCacheSize: this.similarityCache.size,
      similarTagsCacheSize: this.similarTagsCache.size,
      cacheTTL: this.CACHE_TTL
    };
  }

  /**
   * 手动清除过期缓存
   */
  public clearExpiredCache(): void {
    const now = Date.now();
    let expiredCount = 0;

    // 清除相似度缓存
    for (const [key, item] of this.similarityCache.entries()) {
      if (now - item.timestamp > this.CACHE_TTL) {
        this.similarityCache.delete(key);
        expiredCount++;
      }
    }

    // 清除相似标签缓存
    for (const [key, item] of this.similarTagsCache.entries()) {
      if (now - item.timestamp > this.CACHE_TTL) {
        this.similarTagsCache.delete(key);
        expiredCount++;
      }
    }

    logger.debug(`Cleared ${expiredCount} expired cache entries`);
  }

  // =============================================================================
  // 5. 统计和查询方法
  // =============================================================================

  /**
   * 获取相似度矩阵统计信息
   */
  public getMatrixStats(): {
    totalPairs: number;
    avgSimilarity: number;
    minSimilarity: number;
    maxSimilarity: number;
    pairsAboveThreshold: (threshold: number) => number;
  } {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as totalPairs,
        AVG(similarity_score) as avgSimilarity,
        MIN(similarity_score) as minSimilarity,
        MAX(similarity_score) as maxSimilarity
      FROM type_similarity_matrix
    `).get() as any;

    return {
      totalPairs: stats.totalPairs || 0,
      avgSimilarity: stats.avgSimilarity || 0,
      minSimilarity: stats.minSimilarity || 0,
      maxSimilarity: stats.maxSimilarity || 0,
      pairsAboveThreshold: (threshold: number) => {
        const result = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM type_similarity_matrix
          WHERE similarity_score >= ?
        `).get(threshold) as any;
        return result.count || 0;
      }
    };
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    this.clearAllCaches();
    this.db.close();
    logger.debug('SimilarityService database connection closed');
  }
}
