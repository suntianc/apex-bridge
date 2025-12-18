/**
 * TypeVocabularyService - 类型词汇表数据访问服务
 *
 * 管理 Playbook 系统的动态类型标签，包括：
 * - 类型标签的创建、查询、更新、删除
 * - 置信度管理和 playbook 计数
 * - 高级搜索和批量操作
 * - 衰退标签管理
 *
 * 使用 SQLite 数据库存储，支持事务和数据一致性保证
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';
import { PathService } from './PathService';
import {
  TypeVocabulary,
  TypeVocabularyMetadata,
  InducedType
} from '../core/playbook/types';

/**
 * 类型词汇表数据访问服务
 */
export class TypeVocabularyService {
  private static instance: TypeVocabularyService;
  private db: Database.Database;
  private dbPath: string;

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

    this.initializeDatabase();
    logger.debug(`TypeVocabularyService initialized (database: ${this.dbPath})`);
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): TypeVocabularyService {
    if (!TypeVocabularyService.instance) {
      TypeVocabularyService.instance = new TypeVocabularyService();
    }
    return TypeVocabularyService.instance;
  }

  /**
   * 初始化数据库表结构
   */
  private initializeDatabase(): void {
    this.db.exec(`
      -- 类型词汇表
      CREATE TABLE IF NOT EXISTS type_vocabulary (
        tag_name TEXT PRIMARY KEY,
        keywords TEXT NOT NULL, -- JSON array
        confidence REAL NOT NULL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
        first_identified INTEGER NOT NULL,
        playbook_count INTEGER NOT NULL DEFAULT 0 CHECK (playbook_count >= 0),
        discovered_from TEXT NOT NULL CHECK (discovered_from IN ('historical_clustering', 'manual_creation', 'llm_suggestion')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT -- JSON object
      );

      -- 类型相似度矩阵
      CREATE TABLE IF NOT EXISTS type_similarity_matrix (
        tag1 TEXT NOT NULL,
        tag2 TEXT NOT NULL,
        similarity_score REAL NOT NULL CHECK (similarity_score >= 0.0 AND similarity_score <= 1.0),
        co_occurrence_count INTEGER NOT NULL DEFAULT 0 CHECK (co_occurrence_count >= 0),
        last_updated INTEGER NOT NULL,
        PRIMARY KEY (tag1, tag2),
        FOREIGN KEY (tag1) REFERENCES type_vocabulary(tag_name),
        FOREIGN KEY (tag2) REFERENCES type_vocabulary(tag_name)
      );

      -- 类型演进历史
      CREATE TABLE IF NOT EXISTS type_evolution_history (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL CHECK (event_type IN ('created', 'merged', 'deprecated', 'split', 'confidence_updated')),
        tag_name TEXT NOT NULL,
        previous_state TEXT, -- JSON
        new_state TEXT, -- JSON
        reason TEXT NOT NULL,
        triggered_by TEXT NOT NULL CHECK (triggered_by IN ('automatic', 'manual', 'llm_analysis')),
        created_at INTEGER NOT NULL,
        FOREIGN KEY (tag_name) REFERENCES type_vocabulary(tag_name)
      );

      -- Playbook-类型关联表
      CREATE TABLE IF NOT EXISTS playbook_type_assignments (
        playbook_id TEXT NOT NULL,
        tag_name TEXT NOT NULL,
        confidence REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
        assigned_method TEXT NOT NULL CHECK (assigned_method IN ('automatic', 'manual')),
        assigned_at INTEGER NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
        verified_at INTEGER,
        verified_by TEXT,
        PRIMARY KEY (playbook_id, tag_name),
        FOREIGN KEY (tag_name) REFERENCES type_vocabulary(tag_name)
      );

      -- 索引优化
      CREATE INDEX IF NOT EXISTS idx_type_vocabulary_confidence ON type_vocabulary(confidence DESC);
      CREATE INDEX IF NOT EXISTS idx_type_vocabulary_playbook_count ON type_vocabulary(playbook_count DESC);
      CREATE INDEX IF NOT EXISTS idx_type_vocabulary_created ON type_vocabulary(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_type_vocabulary_updated ON type_vocabulary(updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_similarity_score ON type_similarity_matrix(similarity_score DESC);
      CREATE INDEX IF NOT EXISTS idx_similarity_tags ON type_similarity_matrix(tag1, tag2);

      CREATE INDEX IF NOT EXISTS idx_evolution_tag ON type_evolution_history(tag_name);
      CREATE INDEX IF NOT EXISTS idx_evolution_date ON type_evolution_history(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_evolution_type ON type_evolution_history(event_type);

      CREATE INDEX IF NOT EXISTS idx_assignment_playbook ON playbook_type_assignments(playbook_id);
      CREATE INDEX IF NOT EXISTS idx_assignment_tag ON playbook_type_assignments(tag_name);
      CREATE INDEX IF NOT EXISTS idx_assignment_confidence ON playbook_type_assignments(confidence DESC);
    `);

    logger.debug('✅ Database schema initialized');
  }

  /**
   * 验证类型词汇表数据
   */
  private validateTypeVocabulary(tag: Partial<TypeVocabulary>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!tag.tag_name) {
      errors.push('tag_name is required');
    } else if (!/^[a-z0-9_]+$/i.test(tag.tag_name)) {
      errors.push('tag_name must be alphanumeric and underscore only');
    }

    if (!tag.keywords || !Array.isArray(tag.keywords) || tag.keywords.length === 0) {
      errors.push('keywords must be a non-empty array');
    }

    if (tag.confidence !== undefined && (tag.confidence < 0 || tag.confidence > 1)) {
      errors.push('confidence must be in [0, 1]');
    }

    if (!tag.discovered_from || !['historical_clustering', 'manual_creation', 'llm_suggestion'].includes(tag.discovered_from)) {
      errors.push('discovered_from must be one of: historical_clustering, manual_creation, llm_suggestion');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // =============================================================================
  // 1. 基础 CRUD 操作
  // =============================================================================

  /**
   * 创建新的类型标签
   */
  public async createTag(tag: Omit<TypeVocabulary, 'created_at' | 'updated_at'>): Promise<TypeVocabulary> {
    const validation = this.validateTypeVocabulary(tag);
    if (!validation.valid) {
      throw new Error(`Invalid tag data: ${validation.errors.join(', ')}`);
    }

    const now = Date.now();
    const newTag: TypeVocabulary = {
      ...tag,
      created_at: now,
      updated_at: now
    };

    const stmt = this.db.prepare(`
      INSERT INTO type_vocabulary (
        tag_name, keywords, confidence, first_identified, playbook_count,
        discovered_from, created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        newTag.tag_name,
        JSON.stringify(newTag.keywords),
        newTag.confidence,
        newTag.first_identified,
        newTag.playbook_count,
        newTag.discovered_from,
        newTag.created_at,
        newTag.updated_at,
        newTag.metadata ? JSON.stringify(newTag.metadata) : null
      );

      logger.info(`Created type tag: ${newTag.tag_name}`);
      return newTag;
    } catch (error: any) {
      // 检查唯一性约束错误（不同的 better-sqlite3 版本可能有不同的错误代码）
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
          error.code === 'SQLITE_CONSTRAINT' ||
          error.message?.includes('UNIQUE constraint failed')) {
        throw new Error(`Tag '${newTag.tag_name}' already exists`);
      }
      logger.error(`Failed to create tag '${newTag.tag_name}':`, error);
      throw error;
    }
  }

  /**
   * 获取单个类型标签
   */
  public async getTag(tagName: string): Promise<TypeVocabulary | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM type_vocabulary WHERE tag_name = ?
    `);

    try {
      const row = stmt.get(tagName) as any;
      if (!row) {
        return null;
      }

      return this.mapRowToTypeVocabulary(row);
    } catch (error) {
      logger.error(`Failed to get tag '${tagName}':`, error);
      throw error;
    }
  }

  /**
   * 获取所有类型标签
   */
  public async getAllTags(): Promise<TypeVocabulary[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM type_vocabulary ORDER BY confidence DESC, tag_name ASC
    `);

    try {
      const rows = stmt.all() as any[];
      return rows.map(row => this.mapRowToTypeVocabulary(row));
    } catch (error) {
      logger.error('Failed to get all tags:', error);
      throw error;
    }
  }

  /**
   * 根据置信度筛选标签
   */
  public async getTagsByConfidence(minConfidence: number): Promise<TypeVocabulary[]> {
    if (minConfidence < 0 || minConfidence > 1) {
      throw new Error('minConfidence must be in [0, 1]');
    }

    const stmt = this.db.prepare(`
      SELECT * FROM type_vocabulary
      WHERE confidence >= ?
      ORDER BY confidence DESC, tag_name ASC
    `);

    try {
      const rows = stmt.all(minConfidence) as any[];
      return rows.map(row => this.mapRowToTypeVocabulary(row));
    } catch (error) {
      logger.error('Failed to get tags by confidence:', error);
      throw error;
    }
  }

  /**
   * 更新标签置信度
   */
  public async updateConfidence(tagName: string, newConfidence: number): Promise<void> {
    if (newConfidence < 0 || newConfidence > 1) {
      throw new Error('newConfidence must be in [0, 1]');
    }

    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE type_vocabulary
      SET confidence = ?, updated_at = ?
      WHERE tag_name = ?
    `);

    try {
      const result = stmt.run(newConfidence, now, tagName);
      if (result.changes === 0) {
        throw new Error(`Tag '${tagName}' not found`);
      }

      // 记录演进历史
      await this.recordEvolutionEvent(
        tagName,
        'confidence_updated',
        { confidence: { old: undefined, new: newConfidence } },
        'manual',
        `Confidence updated to ${newConfidence}`
      );

      logger.info(`Updated confidence for tag '${tagName}': ${newConfidence}`);
    } catch (error) {
      logger.error(`Failed to update confidence for tag '${tagName}':`, error);
      throw error;
    }
  }

  /**
   * 更新 playbook 计数
   */
  public async updatePlaybookCount(tagName: string, count: number): Promise<void> {
    if (count < 0) {
      throw new Error('count must be non-negative');
    }

    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE type_vocabulary
      SET playbook_count = ?, updated_at = ?
      WHERE tag_name = ?
    `);

    try {
      const result = stmt.run(count, now, tagName);
      if (result.changes === 0) {
        throw new Error(`Tag '${tagName}' not found`);
      }

      logger.debug(`Updated playbook count for tag '${tagName}': ${count}`);
    } catch (error) {
      logger.error(`Failed to update playbook count for tag '${tagName}':`, error);
      throw error;
    }
  }

  /**
   * 标记标签为衰退状态
   */
  public async markAsDecaying(tagName: string): Promise<void> {
    const tag = await this.getTag(tagName);
    if (!tag) {
      throw new Error(`Tag '${tagName}' not found`);
    }

    const now = Date.now();
    const metadata = tag.metadata || {};
    const decayScore = Math.max(metadata.decay_score || 0, 0.8);

    const stmt = this.db.prepare(`
      UPDATE type_vocabulary
      SET metadata = ?, updated_at = ?
      WHERE tag_name = ?
    `);

    try {
      stmt.run(JSON.stringify({ ...metadata, decay_score: decayScore }), now, tagName);

      // 记录演进历史
      await this.recordEvolutionEvent(
        tagName,
        'deprecated',
        { metadata: { old: tag.metadata, new: { decay_score: decayScore } } },
        'automatic',
        `Tag marked as decaying (score: ${decayScore})`
      );

      logger.info(`Marked tag '${tagName}' as decaying`);
    } catch (error) {
      logger.error(`Failed to mark tag '${tagName}' as decaying:`, error);
      throw error;
    }
  }

  /**
   * 删除类型标签
   */
  public async deleteTag(tagName: string, throwOnNotFound: boolean = true): Promise<void> {
    const transaction = this.db.transaction(() => {
      // 先删除相关的 playbook 类型关联
      const deleteAssignmentsStmt = this.db.prepare(`
        DELETE FROM playbook_type_assignments WHERE tag_name = ?
      `);
      deleteAssignmentsStmt.run(tagName);

      // 删除相关的相似度矩阵记录
      const deleteSimilarityStmt1 = this.db.prepare(`
        DELETE FROM type_similarity_matrix WHERE tag1 = ?
      `);
      deleteSimilarityStmt1.run(tagName);

      const deleteSimilarityStmt2 = this.db.prepare(`
        DELETE FROM type_similarity_matrix WHERE tag2 = ?
      `);
      deleteSimilarityStmt2.run(tagName);

      // 删除相关的演进历史记录
      const deleteEvolutionStmt = this.db.prepare(`
        DELETE FROM type_evolution_history WHERE tag_name = ?
      `);
      deleteEvolutionStmt.run(tagName);

      // 最后删除标签本身
      const deleteTagStmt = this.db.prepare(`
        DELETE FROM type_vocabulary WHERE tag_name = ?
      `);
      const result = deleteTagStmt.run(tagName);

      if (result.changes === 0) {
        if (throwOnNotFound) {
          throw new Error(`Tag '${tagName}' not found`);
        } else {
          // 标签不存在，安静地返回（用于测试清理）
          logger.debug(`Tag '${tagName}' not found, skipping deletion`);
          return;
        }
      }

      logger.info(`Deleted type tag: ${tagName}`);
    });

    try {
      transaction();
    } catch (error) {
      logger.error(`Failed to delete tag '${tagName}':`, error);
      throw error;
    }
  }

  // =============================================================================
  // 2. 高级功能
  // =============================================================================

  /**
   * 根据关键词搜索标签
   */
  public async searchTagsByKeywords(keywords: string[]): Promise<TypeVocabulary[]> {
    if (!keywords || keywords.length === 0) {
      return [];
    }

    const stmt = this.db.prepare(`
      SELECT * FROM type_vocabulary
      WHERE keywords LIKE ?
      ORDER BY confidence DESC
    `);

    try {
      // 简单实现：使用 JSON 字符串包含搜索
      // 对于更复杂的搜索，建议使用 FTS5 扩展
      const searchPattern = `%${keywords[0]}%`;
      const rows = stmt.all(searchPattern) as any[];

      return rows
        .map(row => this.mapRowToTypeVocabulary(row))
        .filter(tag => {
          // 精确检查关键词匹配
          const tagKeywords = tag.keywords.map(k => k.toLowerCase());
          return keywords.some(keyword =>
            tagKeywords.some(tagKeyword =>
              tagKeyword.includes(keyword.toLowerCase())
            )
          );
        });
    } catch (error) {
      logger.error('Failed to search tags by keywords:', error);
      throw error;
    }
  }

  /**
   * 获取衰退标签
   */
  public async getDecayingTags(threshold: number = 0.7): Promise<TypeVocabulary[]> {
    if (threshold < 0 || threshold > 1) {
      throw new Error('threshold must be in [0, 1]');
    }

    const stmt = this.db.prepare(`
      SELECT * FROM type_vocabulary
      WHERE metadata IS NOT NULL
      ORDER BY confidence DESC
    `);

    try {
      const rows = stmt.all() as any[];
      return rows
        .map(row => this.mapRowToTypeVocabulary(row))
        .filter(tag => {
          const decayScore = tag.metadata?.decay_score || 0;
          return decayScore >= threshold;
        });
    } catch (error) {
      logger.error('Failed to get decaying tags:', error);
      throw error;
    }
  }

  /**
   * 批量创建标签
   */
  public async batchCreateTags(tags: InducedType[]): Promise<TypeVocabulary[]> {
    if (!tags || tags.length === 0) {
      return [];
    }

    const transaction = this.db.transaction((tagsToCreate: InducedType[]) => {
      const results: TypeVocabulary[] = [];
      const now = Date.now();

      for (const inducedType of tagsToCreate) {
        // 检查是否已存在
        const existingStmt = this.db.prepare(`SELECT tag_name FROM type_vocabulary WHERE tag_name = ?`);
        const existing = existingStmt.get(inducedType.tag_name);
        if (existing) {
          logger.debug(`Tag '${inducedType.tag_name}' already exists, skipping`);
          continue;
        }

        // 验证数据
        const tagData: Omit<TypeVocabulary, 'created_at' | 'updated_at'> = {
          tag_name: inducedType.tag_name,
          keywords: inducedType.keywords,
          confidence: inducedType.confidence,
          first_identified: inducedType.created_at,
          playbook_count: inducedType.sample_count,
          discovered_from: inducedType.discovered_from === 'llm_analysis' ? 'llm_suggestion' :
                           inducedType.discovered_from === 'manual' ? 'manual_creation' :
                           inducedType.discovered_from,
          metadata: {
            description: `Induced from ${inducedType.sample_count} playbooks`,
            usage_examples: inducedType.playbook_examples,
            decay_score: 0
          }
        };

        const validation = this.validateTypeVocabulary(tagData);
        if (!validation.valid) {
          throw new Error(`Invalid induced type '${inducedType.tag_name}': ${validation.errors.join(', ')}`);
        }

        // 创建标签
        const insertStmt = this.db.prepare(`
          INSERT INTO type_vocabulary (
            tag_name, keywords, confidence, first_identified, playbook_count,
            discovered_from, created_at, updated_at, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertStmt.run(
          tagData.tag_name,
          JSON.stringify(tagData.keywords),
          tagData.confidence,
          tagData.first_identified,
          tagData.playbook_count,
          tagData.discovered_from,
          now,
          now,
          JSON.stringify(tagData.metadata)
        );

        results.push({
          ...tagData,
          created_at: now,
          updated_at: now
        });

        logger.info(`Batch created type tag: ${inducedType.tag_name}`);
      }

      return results;
    });

    try {
      const results = transaction(tags);
      logger.info(`Batch created ${results.length} type tags`);
      return results;
    } catch (error) {
      logger.error('Failed to batch create tags:', error);
      throw error;
    }
  }

  // =============================================================================
  // 3. 辅助方法
  // =============================================================================

  /**
   * 将数据库行映射为 TypeVocabulary 对象
   */
  private mapRowToTypeVocabulary(row: any): TypeVocabulary {
    return {
      tag_name: row.tag_name,
      keywords: JSON.parse(row.keywords),
      confidence: row.confidence,
      first_identified: row.first_identified,
      playbook_count: row.playbook_count,
      discovered_from: row.discovered_from,
      created_at: row.created_at,
      updated_at: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  /**
   * 记录演进历史事件
   */
  private async recordEvolutionEvent(
    tagName: string,
    eventType: 'created' | 'merged' | 'deprecated' | 'split' | 'confidence_updated',
    stateChange: any,
    triggeredBy: 'automatic' | 'manual' | 'llm_analysis',
    reason: string
  ): Promise<void> {
    const id = `teh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO type_evolution_history (
        id, event_type, tag_name, previous_state, new_state,
        reason, triggered_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        id,
        eventType,
        tagName,
        stateChange.old ? JSON.stringify(stateChange.old) : null,
        stateChange.new ? JSON.stringify(stateChange.new) : null,
        reason,
        triggeredBy,
        now
      );
    } catch (error) {
      logger.error(`Failed to record evolution event for tag '${tagName}':`, error);
      // 不抛出错误，避免影响主要操作
    }
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      logger.debug('Database connection closed');
    }
  }

  /**
   * 获取数据库路径（用于调试）
   */
  public getDatabasePath(): string {
    return this.dbPath;
  }
}
