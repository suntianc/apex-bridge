/**
 * ContextStorageService - 分层存储管理服务
 * Phase 1: Context Management Infrastructure
 *
 * 实现双层存储架构：
 * - Layer 1: 完整历史层 (conversation_messages) - 用于前端展示
 * - Layer 2: 有效上下文层 (context_sessions) - 用于API调用
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';
import { PathService } from './PathService';
import { ConversationHistoryService, type ConversationMessage } from './ConversationHistoryService';
import {
  ContextSession,
  ContextCheckpoint,
  MessageMark,
  ContextStatistics,
  ContextSessionRow,
  ContextCheckpointRow,
  MessageMarkRow
} from '../context/types';
import { Message } from '../types';

export class ContextStorageService {
  private static instance: ContextStorageService;
  private contextDb: Database.Database;
  private contextDbPath: string;
  private historyService: ConversationHistoryService;

  private constructor() {
    const pathService = PathService.getInstance();
    const dataDir = pathService.getDataDir();

    // 确保数据目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 使用单独的数据库文件存储上下文数据
    this.contextDbPath = path.join(dataDir, 'context_management.db');
    this.contextDb = new Database(this.contextDbPath);

    // 启用 WAL 模式提升性能
    this.contextDb.pragma('journal_mode = WAL');
    this.contextDb.pragma('foreign_keys = ON');

    // 获取对话历史服务实例
    this.historyService = ConversationHistoryService.getInstance();

    // 初始化数据库表结构
    this.initializeDatabase();
    logger.debug(`[ContextStorageService] Initialized (database: ${this.contextDbPath})`);
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ContextStorageService {
    if (!ContextStorageService.instance) {
      ContextStorageService.instance = new ContextStorageService();
    }
    return ContextStorageService.instance;
  }

  /**
   * 初始化数据库表结构
   */
  private initializeDatabase(): void {
    this.contextDb.exec(`
      -- 上下文会话表：存储压缩后的有效上下文
      CREATE TABLE IF NOT EXISTS context_sessions (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        effective_messages TEXT NOT NULL, -- JSON: 压缩后的有效消息
        token_count INTEGER NOT NULL DEFAULT 0,
        message_count INTEGER NOT NULL DEFAULT 0,
        compression_summary TEXT,         -- JSON: 摘要消息列表
        compressed_message_ids TEXT,      -- JSON: 被压缩的消息ID数组
        last_action TEXT,                 -- JSON: 最后一次上下文操作
        config_overrides TEXT,            -- JSON: 配置覆盖
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- 上下文检查点表：用于会话回滚
      CREATE TABLE IF NOT EXISTS context_checkpoints (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        messages TEXT NOT NULL,           -- JSON: 检查点时的消息快照
        token_count INTEGER NOT NULL,
        message_count INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      );

      -- 消息标记表：标记被压缩/截断的消息
      CREATE TABLE IF NOT EXISTS message_marks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        conversation_id TEXT NOT NULL,
        mark_type TEXT NOT NULL,
        action_id TEXT,
        created_at INTEGER NOT NULL,
        metadata TEXT,                    -- JSON: 额外元数据
        FOREIGN KEY (message_id) REFERENCES conversation_messages(id)
      );

      -- 创建索引提升查询性能
      CREATE INDEX IF NOT EXISTS idx_context_session_id ON context_sessions(id);
      CREATE INDEX IF NOT EXISTS idx_context_conversation ON context_sessions(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_context_updated ON context_sessions(updated_at);

      CREATE INDEX IF NOT EXISTS idx_checkpoint_conversation ON context_checkpoints(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_checkpoint_created ON context_checkpoints(created_at);

      CREATE INDEX IF NOT EXISTS idx_marks_conversation ON message_marks(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_marks_message ON message_marks(message_id);
      CREATE INDEX IF NOT EXISTS idx_marks_type ON message_marks(mark_type);
    `);

    logger.debug('[ContextStorageService] ✅ Database tables initialized');
  }

  /**
   * 保存消息到完整历史层（代理到ConversationHistoryService）
   */
  async saveToHistory(
    conversationId: string,
    messages: Message[]
  ): Promise<void> {
    await this.historyService.saveMessages(conversationId, messages);
  }

  /**
   * 保存有效上下文到上下文层
   */
  async saveEffectiveContext(
    sessionId: string,
    conversationId: string,
    effectiveMessages: Message[],
    tokenCount: number,
    messageCount: number,
    compressionSummary?: string,
    compressedMessageIds: number[] = [],
    lastAction?: any
  ): Promise<void> {
    try {
      const now = Date.now();
      const stmt = this.contextDb.prepare(`
        INSERT OR REPLACE INTO context_sessions
        (id, conversation_id, effective_messages, token_count, message_count,
         compression_summary, compressed_message_ids, last_action, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        sessionId,
        conversationId,
        JSON.stringify(effectiveMessages),
        tokenCount,
        messageCount,
        compressionSummary || null,
        JSON.stringify(compressedMessageIds),
        lastAction ? JSON.stringify(lastAction) : null,
        now,
        now
      );

      logger.debug(`[ContextStorageService] Saved effective context for session: ${sessionId}`);
    } catch (error: any) {
      logger.error(`[ContextStorageService] Failed to save effective context: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取有效上下文 (API调用使用)
   */
  async getEffectiveContext(sessionId: string): Promise<{
    messages: Message[];
    tokenCount: number;
    messageCount: number;
    lastAction?: any;
  } | null> {
    try {
      const stmt = this.contextDb.prepare(`
        SELECT effective_messages, token_count, message_count, last_action
        FROM context_sessions
        WHERE id = ?
      `);

      const row = stmt.get(sessionId) as ContextSessionRow | undefined;
      if (!row) {
        return null;
      }

      return {
        messages: JSON.parse(row.effective_messages),
        tokenCount: row.token_count,
        messageCount: row.message_count,
        lastAction: row.last_action ? JSON.parse(row.last_action) : undefined
      };
    } catch (error: any) {
      logger.error(`[ContextStorageService] Failed to get effective context: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取完整历史 (前端展示使用)
   */
  async getFullHistory(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    messages: ConversationMessage[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const [messages, total] = await Promise.all([
        this.historyService.getMessages(conversationId, limit, offset),
        this.historyService.getMessageCount(conversationId)
      ]);

      return {
        messages,
        total,
        hasMore: offset + messages.length < total
      };
    } catch (error: any) {
      logger.error(`[ContextStorageService] Failed to get full history: ${error.message}`);
      throw error;
    }
  }

  /**
   * 创建检查点
   */
  async createCheckpoint(
    conversationId: string,
    messages: Message[],
    tokenCount: number,
    reason: string
  ): Promise<string> {
    try {
      const checkpointId = `cp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = Date.now();

      const stmt = this.contextDb.prepare(`
        INSERT INTO context_checkpoints
        (id, conversation_id, messages, token_count, message_count, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        checkpointId,
        conversationId,
        JSON.stringify(messages),
        tokenCount,
        messages.length,
        reason,
        now
      );

      logger.debug(`[ContextStorageService] Created checkpoint: ${checkpointId} for conversation: ${conversationId}`);
      return checkpointId;
    } catch (error: any) {
      logger.error(`[ContextStorageService] Failed to create checkpoint: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取检查点列表
   */
  async getCheckpoints(conversationId: string): Promise<ContextCheckpoint[]> {
    try {
      const stmt = this.contextDb.prepare(`
        SELECT id, conversation_id, messages, token_count, message_count, reason, created_at, expires_at
        FROM context_checkpoints
        WHERE conversation_id = ?
        ORDER BY created_at DESC
      `);

      const rows = stmt.all(conversationId) as ContextCheckpointRow[];
      return rows.map(row => ({
        id: row.id,
        conversationId: row.conversation_id,
        messages: JSON.parse(row.messages),
        tokenCount: row.token_count,
        messageCount: row.message_count,
        reason: row.reason,
        createdAt: row.created_at,
        expiresAt: row.expires_at || undefined
      }));
    } catch (error: any) {
      logger.error(`[ContextStorageService] Failed to get checkpoints: ${error.message}`);
      throw error;
    }
  }

  /**
   * 恢复到检查点
   */
  async restoreFromCheckpoint(checkpointId: string): Promise<{
    conversationId: string;
    messages: Message[];
    tokenCount: number;
  } | null> {
    try {
      const stmt = this.contextDb.prepare(`
        SELECT conversation_id, messages, token_count
        FROM context_checkpoints
        WHERE id = ?
      `);

      const row = stmt.get(checkpointId) as ContextCheckpointRow | undefined;
      if (!row) {
        return null;
      }

      return {
        conversationId: row.conversation_id,
        messages: JSON.parse(row.messages),
        tokenCount: row.token_count
      };
    } catch (error: any) {
      logger.error(`[ContextStorageService] Failed to restore checkpoint: ${error.message}`);
      throw error;
    }
  }

  /**
   * 标记消息
   */
  async markMessage(
    messageId: number,
    conversationId: string,
    markType: string,
    actionId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const stmt = this.contextDb.prepare(`
        INSERT INTO message_marks
        (message_id, conversation_id, mark_type, action_id, created_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        messageId,
        conversationId,
        markType,
        actionId || null,
        Date.now(),
        metadata ? JSON.stringify(metadata) : null
      );

      logger.debug(`[ContextStorageService] Marked message ${messageId} as ${markType}`);
    } catch (error: any) {
      logger.error(`[ContextStorageService] Failed to mark message: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取消息标记
   */
  async getMessageMarks(conversationId: string): Promise<MessageMark[]> {
    try {
      const stmt = this.contextDb.prepare(`
        SELECT message_id, conversation_id, mark_type, action_id, created_at, metadata
        FROM message_marks
        WHERE conversation_id = ?
        ORDER BY created_at ASC
      `);

      const rows = stmt.all(conversationId) as MessageMarkRow[];
      return rows.map(row => ({
        messageId: row.message_id,
        conversationId: row.conversation_id,
        markType: row.mark_type as any,
        actionId: row.action_id || undefined,
        createdAt: row.created_at,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
      }));
    } catch (error: any) {
      logger.error(`[ContextStorageService] Failed to get message marks: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取会话的上下文统计
   */
  async getContextStats(sessionId: string): Promise<{
    totalMessages: number;
    effectiveMessages: number;
    compressionRatio: number;
    tokensSaved: number;
    checkpointsCount: number;
  }> {
    try {
      // 获取完整历史的消息数
      const contextRow = this.contextDb.prepare(`
        SELECT token_count, message_count, compression_summary
        FROM context_sessions
        WHERE id = ?
      `).get(sessionId) as any;

      if (!contextRow) {
        return {
          totalMessages: 0,
          effectiveMessages: 0,
          compressionRatio: 0,
          tokensSaved: 0,
          checkpointsCount: 0
        };
      }

      // 获取conversationId
      const conversationIdRow = this.contextDb.prepare(`
        SELECT conversation_id
        FROM context_sessions
        WHERE id = ?
      `).get(sessionId) as any;

      const conversationId = conversationIdRow?.conversation_id;
      const totalMessages = conversationId
        ? await this.historyService.getMessageCount(conversationId)
        : 0;

      // 获取检查点数量
      const checkpointCountRow = this.contextDb.prepare(`
        SELECT COUNT(*) as count
        FROM context_checkpoints
        WHERE conversation_id = ?
      `).get(conversationId) as any;

      const checkpointsCount = checkpointCountRow?.count || 0;

      // 计算压缩比例
      const compressionSummary = contextRow.compression_summary
        ? JSON.parse(contextRow.compression_summary)
        : [];
      const effectiveMessages = contextRow.message_count;
      const compressionRatio = totalMessages > 0
        ? (totalMessages - effectiveMessages) / totalMessages
        : 0;

      return {
        totalMessages,
        effectiveMessages,
        compressionRatio,
        tokensSaved: 0, // 需要通过token计算得出
        checkpointsCount
      };
    } catch (error: any) {
      logger.error(`[ContextStorageService] Failed to get context stats: ${error.message}`);
      return {
        totalMessages: 0,
        effectiveMessages: 0,
        compressionRatio: 0,
        tokensSaved: 0,
        checkpointsCount: 0
      };
    }
  }

  /**
   * 删除会话的所有上下文数据
   */
  async deleteContextData(sessionId: string): Promise<void> {
    try {
      // 获取conversationId
      const row = this.contextDb.prepare(`
        SELECT conversation_id FROM context_sessions WHERE id = ?
      `).get(sessionId) as any;

      const conversationId = row?.conversation_id;

      // 删除上下文会话
      this.contextDb.prepare(`DELETE FROM context_sessions WHERE id = ?`).run(sessionId);

      // 删除相关检查点
      if (conversationId) {
        this.contextDb.prepare(`DELETE FROM context_checkpoints WHERE conversation_id = ?`).run(conversationId);
        this.contextDb.prepare(`DELETE FROM message_marks WHERE conversation_id = ?`).run(conversationId);
      }

      logger.info(`[ContextStorageService] Deleted context data for session: ${sessionId}`);
    } catch (error: any) {
      logger.error(`[ContextStorageService] Failed to delete context data: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取所有会话的统计信息
   */
  getStatistics(): ContextStatistics {
    try {
      const totalConversations = this.contextDb.prepare(`
        SELECT COUNT(DISTINCT conversation_id) as count
        FROM context_sessions
      `).get() as any;

      const totalActions = this.contextDb.prepare(`
        SELECT COUNT(*) as count FROM context_sessions
        WHERE last_action IS NOT NULL
      `).get() as any;

      const averageTokenCount = this.contextDb.prepare(`
        SELECT AVG(token_count) as avg FROM context_sessions
      `).get() as any;

      const averageMessageCount = this.contextDb.prepare(`
        SELECT AVG(message_count) as avg FROM context_sessions
      `).get() as any;

      const totalCheckpoints = this.contextDb.prepare(`
        SELECT COUNT(*) as count FROM context_checkpoints
      `).get() as any;

      return {
        totalConversations: totalConversations?.count || 0,
        totalActions: totalActions?.count || 0,
        actionsByType: {
          prune: 0,
          compact: 0,
          truncate: 0,
          restore: 0,
          checkpoint: 0,
          none: 0
        },
        averageTokenCount: Math.round(averageTokenCount?.avg || 0),
        averageMessageCount: Math.round(averageMessageCount?.avg || 0),
        totalCheckpoints: totalCheckpoints?.count || 0,
        cacheHitRate: 0 // 需要缓存统计
      };
    } catch (error: any) {
      logger.error(`[ContextStorageService] Failed to get statistics: ${error.message}`);
      return {
        totalConversations: 0,
        totalActions: 0,
        actionsByType: {
          prune: 0,
          compact: 0,
          truncate: 0,
          restore: 0,
          checkpoint: 0,
          none: 0
        },
        averageTokenCount: 0,
        averageMessageCount: 0,
        totalCheckpoints: 0,
        cacheHitRate: 0
      };
    }
  }

  /**
   * 清理过期的检查点
   */
  async cleanupExpiredCheckpoints(): Promise<number> {
    try {
      const now = Date.now();
      const stmt = this.contextDb.prepare(`
        DELETE FROM context_checkpoints
        WHERE expires_at IS NOT NULL AND expires_at < ?
      `);

      const result = stmt.run(now);
      const deletedCount = result.changes;

      if (deletedCount > 0) {
        logger.info(`[ContextStorageService] Cleaned up ${deletedCount} expired checkpoints`);
      }

      return deletedCount;
    } catch (error: any) {
      logger.error(`[ContextStorageService] Failed to cleanup expired checkpoints: ${error.message}`);
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.contextDb.close();
    logger.info('[ContextStorageService] ✅ Database closed');
  }
}
