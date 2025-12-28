/**
 * EnhancedSessionManager - 增强的会话管理器
 * Phase 3: Enhanced Session Management
 *
 * 增强功能：
 * - 检查点机制（自动+手动）
 * - 会话回滚功能
 * - 会话状态管理增强
 * - 缓存策略
 * - 性能优化
 */

import { logger } from '../utils/logger';
import { SessionManager } from './SessionManager';
import { ContextStorageService } from './ContextStorageService';
import { ConversationHistoryService } from './ConversationHistoryService';
import { AceService } from './AceService';
import { ContextCheckpoint, ContextSession } from '../context/types';
import { Message } from '../types';

export interface SessionCheckpoint {
  id: string;
  conversationId: string;
  sessionId: string;
  timestamp: number;
  messageCount: number;
  tokenCount: number;
  summary: string;
  contextSnapshot: ContextSession | null;
  historySnapshot: Message[];
  metadata?: Record<string, any>;
}

export interface SessionMetrics {
  sessionId: string;
  conversationId: string;
  age: number; // 会话年龄（毫秒）
  messageCount: number;
  tokenCount: number;
  checkpointCount: number;
  lastActivity: number;
  compressionCount: number;
  status: 'active' | 'idle' | 'archived' | 'error';
  healthScore: number; // 0-100
}

export interface SessionCache {
  sessionId: string;
  effectiveContext: ContextSession | null;
  lastAccessed: number;
  accessCount: number;
  size: number; // 大小（字节）
}

export class EnhancedSessionManager {
  private sessionManager: SessionManager;
  private contextStorageService: ContextStorageService;
  private historyService: ConversationHistoryService;
  private aceService: AceService;

  // 缓存管理
  private sessionCache = new Map<string, SessionCache>();
  private readonly maxCacheSize: number = 1000;
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5分钟

  // 检查点管理
  private checkpointInterval: number;
  private maxCheckpoints: number;

  constructor(
    sessionManager: SessionManager,
    contextStorageService: ContextStorageService,
    historyService: ConversationHistoryService,
    aceService: AceService,
    options: {
      checkpointInterval?: number;
      maxCheckpoints?: number;
      maxCacheSize?: number;
      cacheTtlMs?: number;
    } = {}
  ) {
    this.sessionManager = sessionManager;
    this.contextStorageService = contextStorageService;
    this.historyService = historyService;
    this.aceService = aceService;

    this.checkpointInterval = options.checkpointInterval ?? 10;
    this.maxCheckpoints = options.maxCheckpoints ?? 50;
    this.maxCacheSize = options.maxCacheSize ?? 1000;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;

    // 启动缓存清理定时器
    this.startCacheCleanupTimer();

    logger.debug('[EnhancedSessionManager] Initialized with options:', options);
  }

  /**
   * 创建自动检查点
   */
  async createAutoCheckpoint(
    conversationId: string,
    sessionId?: string,
    reason: string = 'Auto checkpoint'
  ): Promise<string | null> {
    try {
      // 获取或创建会话
      const actualSessionId = sessionId || conversationId;

      // 检查是否需要创建检查点（基于消息数量）
      const messageCount = await this.historyService.getMessageCount(conversationId);
      if (messageCount % this.checkpointInterval !== 0) {
        return null; // 不需要创建检查点
      }

      // 创建检查点
      const checkpointId = await this.createCheckpoint(conversationId, actualSessionId, reason);
      logger.info(`[EnhancedSessionManager] Created auto checkpoint: ${checkpointId} for conversation: ${conversationId}`);

      return checkpointId;
    } catch (error: any) {
      logger.error(`[EnhancedSessionManager] Failed to create auto checkpoint: ${error.message}`);
      return null;
    }
  }

  /**
   * 创建手动检查点
   */
  async createCheckpoint(
    conversationId: string,
    sessionId?: string,
    reason: string = 'Manual checkpoint',
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const actualSessionId = sessionId || conversationId;

      // 获取当前会话状态
      const [historyMessages, contextSession] = await Promise.all([
        this.historyService.getMessages(conversationId, 1000, 0),
        this.contextStorageService.getEffectiveContext(actualSessionId)
      ]);

      const tokenCount = this.estimateTokenCount(historyMessages);
      const messageCount = historyMessages.length;

      // 生成检查点摘要
      const summary = this.generateCheckpointSummary(historyMessages, contextSession);

      // 创建检查点记录
      const checkpointId = await this.contextStorageService.createCheckpoint(
        conversationId,
        historyMessages,
        tokenCount,
        reason
      );

      // 缓存检查点信息
      const checkpoint: SessionCheckpoint = {
        id: checkpointId,
        conversationId,
        sessionId: actualSessionId,
        timestamp: Date.now(),
        messageCount,
        tokenCount,
        summary,
        contextSnapshot: contextSession ? {
          id: actualSessionId,
          conversationId: conversationId,
          effectiveMessages: contextSession.messages || [],
          tokenCount: contextSession.tokenCount || 0,
          messageCount: contextSession.messageCount || 0,
          compressionSummary: '',
          compressedMessageIds: [],
          lastAction: contextSession.lastAction || null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          configOverrides: null
        } as ContextSession : null,
        historySnapshot: historyMessages,
        metadata
      };

      this.cacheCheckpoint(checkpoint);

      // 清理旧检查点
      await this.cleanupOldCheckpoints(conversationId, actualSessionId);

      logger.info(`[EnhancedSessionManager] Created checkpoint: ${checkpointId} (${messageCount} messages, ${tokenCount} tokens)`);
      return checkpointId;
    } catch (error: any) {
      logger.error(`[EnhancedSessionManager] Failed to create checkpoint: ${error.message}`);
      throw error;
    }
  }

  /**
   * 恢复到检查点
   */
  async rollbackToCheckpoint(
    checkpointId: string,
    conversationId: string,
    sessionId?: string
  ): Promise<{
    success: boolean;
    messagesRestored: number;
    checkpointId: string;
  }> {
    try {
      const actualSessionId = sessionId || conversationId;

      // 获取检查点数据
      const checkpointData = await this.contextStorageService.restoreFromCheckpoint(checkpointId);
      if (!checkpointData) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }

      // 验证检查点是否属于指定的conversation
      if (checkpointData.conversationId !== conversationId) {
        throw new Error(`Checkpoint ${checkpointId} does not belong to conversation ${conversationId}`);
      }

      // 更新有效上下文
      await this.contextStorageService.saveEffectiveContext(
        actualSessionId,
        conversationId,
        checkpointData.messages,
        checkpointData.tokenCount,
        checkpointData.messages.length
      );

      // 清理超过该检查点之后的消息历史
      await this.historyService.deleteMessages(conversationId);
      await this.historyService.saveMessages(conversationId, checkpointData.messages);

      logger.info(`[EnhancedSessionManager] Rolled back to checkpoint: ${checkpointId}, restored ${checkpointData.messages.length} messages`);

      return {
        success: true,
        messagesRestored: checkpointData.messages.length,
        checkpointId
      };
    } catch (error: any) {
      logger.error(`[EnhancedSessionManager] Failed to rollback to checkpoint: ${error.message}`);
      return {
        success: false,
        messagesRestored: 0,
        checkpointId
      };
    }
  }

  /**
   * 获取会话的检查点列表
   */
  async getCheckpoints(conversationId: string): Promise<SessionCheckpoint[]> {
    try {
      const checkpoints = await this.contextStorageService.getCheckpoints(conversationId);

      // 转换为增强的检查点格式
      return checkpoints.map(cp => ({
        id: cp.id,
        conversationId: cp.conversationId,
        sessionId: conversationId, // 使用conversationId作为sessionId
        timestamp: cp.createdAt,
        messageCount: cp.messageCount,
        tokenCount: cp.tokenCount,
        summary: cp.reason,
        contextSnapshot: null,
        historySnapshot: cp.messages,
        metadata: {
          expiresAt: cp.expiresAt
        }
      }));
    } catch (error: any) {
      logger.error(`[EnhancedSessionManager] Failed to get checkpoints: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取会话指标
   */
  async getSessionMetrics(sessionId: string, conversationId?: string): Promise<SessionMetrics | null> {
    try {
      const actualConversationId = conversationId || sessionId;

      // 获取基本信息
      const [messageCount, lastMessage, contextStats] = await Promise.all([
        this.historyService.getMessageCount(actualConversationId),
        this.historyService.getLastMessage(actualConversationId),
        this.contextStorageService.getContextStats(sessionId)
      ]);

      // 获取ACE会话状态
      const aceSession = await this.getAceSessionState(sessionId);

      // 计算会话年龄
      const createdAt = aceSession?.metadata?.createdAt || Date.now();
      const age = Date.now() - createdAt;

      // 计算健康评分
      const healthScore = this.calculateHealthScore({
        messageCount,
        age,
        lastActivity: lastMessage?.created_at || Date.now(),
        compressionCount: Math.floor(messageCount / this.checkpointInterval),
        status: 'active'
      });

      return {
        sessionId,
        conversationId: actualConversationId,
        age,
        messageCount,
        tokenCount: Math.round(contextStats.totalMessages * 100), // 估算
        checkpointCount: contextStats.checkpointsCount,
        lastActivity: lastMessage?.created_at || Date.now(),
        compressionCount: Math.floor(messageCount / this.checkpointInterval),
        status: 'active',
        healthScore
      };
    } catch (error: any) {
      logger.error(`[EnhancedSessionManager] Failed to get session metrics: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取会话缓存状态
   */
  getCacheStatus(): {
    totalSessions: number;
    totalSize: number;
    hitRate: number;
    sessions: Array<{
      sessionId: string;
      lastAccessed: number;
      accessCount: number;
      size: number;
    }>;
  } {
    const sessions = Array.from(this.sessionCache.entries()).map(([sessionId, cache]) => ({
      sessionId,
      lastAccessed: cache.lastAccessed,
      accessCount: cache.accessCount,
      size: cache.size
    }));

    return {
      totalSessions: this.sessionCache.size,
      totalSize: sessions.reduce((sum, s) => sum + s.size, 0),
      hitRate: 0, // TODO: 实现命中率计算
      sessions
    };
  }

  /**
   * 预加载会话数据到缓存
   */
  async preloadSession(sessionId: string, conversationId?: string): Promise<void> {
    try {
      const actualConversationId = conversationId || sessionId;

      // 预加载有效上下文
      const context = await this.contextStorageService.getEffectiveContext(sessionId);
      if (context) {
        this.cacheSession(sessionId, context);
      }

      logger.debug(`[EnhancedSessionManager] Preloaded session: ${sessionId}`);
    } catch (error: any) {
      logger.warn(`[EnhancedSessionManager] Failed to preload session: ${error.message}`);
    }
  }

  /**
   * 清理会话缓存
   */
  cleanupSessionCache(sessionId?: string): void {
    if (sessionId) {
      this.sessionCache.delete(sessionId);
      logger.debug(`[EnhancedSessionManager] Cleaned cache for session: ${sessionId}`);
    } else {
      this.sessionCache.clear();
      logger.debug('[EnhancedSessionManager] Cleaned all session caches');
    }
  }

  /**
   * 获取健康的会话列表
   */
  async getHealthySessions(): Promise<SessionMetrics[]> {
    try {
      // TODO: 实现健康会话查询
      // 这里需要从数据库查询所有活跃会话
      return [];
    } catch (error: any) {
      logger.error(`[EnhancedSessionManager] Failed to get healthy sessions: ${error.message}`);
      return [];
    }
  }

  /**
   * 归档不活跃的会话
   */
  async archiveInactiveSessions(maxIdleTime: number = 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const healthySessions = await this.getHealthySessions();
      const now = Date.now();

      let archivedCount = 0;
      for (const session of healthySessions) {
        if (now - session.lastActivity > maxIdleTime) {
          await this.sessionManager.archive(session.conversationId);
          archivedCount++;
        }
      }

      logger.info(`[EnhancedSessionManager] Archived ${archivedCount} inactive sessions`);
      return archivedCount;
    } catch (error: any) {
      logger.error(`[EnhancedSessionManager] Failed to archive inactive sessions: ${error.message}`);
      return 0;
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 生成检查点摘要
   */
  private generateCheckpointSummary(
    messages: Message[],
    contextSession: any
  ): string {
    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;
    const systemMessages = messages.filter(m => m.role === 'system').length;

    let summary = `Checkpoint at ${new Date().toISOString()}: `;
    summary += `${userMessages} user messages, `;
    summary += `${assistantMessages} assistant messages`;
    if (systemMessages > 0) {
      summary += `, ${systemMessages} system messages`;
    }

    if (contextSession) {
      summary += `. Effective context: ${contextSession.messageCount} messages, ${contextSession.tokenCount} tokens`;
    }

    return summary;
  }

  /**
   * 缓存检查点
   */
  private cacheCheckpoint(checkpoint: SessionCheckpoint): void {
    // TODO: 实现检查点缓存
    // 可以将检查点存储在内存中以便快速访问
  }

  /**
   * 清理旧检查点
   */
  private async cleanupOldCheckpoints(conversationId: string, sessionId: string): Promise<void> {
    try {
      const checkpoints = await this.getCheckpoints(conversationId);

      if (checkpoints.length > this.maxCheckpoints) {
        // 删除最旧的检查点
        const checkpointsToDelete = checkpoints
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(this.maxCheckpoints);

        for (const checkpoint of checkpointsToDelete) {
          // TODO: 实现删除检查点的数据库操作
          logger.debug(`[EnhancedSessionManager] Would delete old checkpoint: ${checkpoint.id}`);
        }
      }
    } catch (error: any) {
      logger.warn(`[EnhancedSessionManager] Failed to cleanup old checkpoints: ${error.message}`);
    }
  }

  /**
   * 获取ACE会话状态
   */
  private async getAceSessionState(sessionId: string): Promise<any> {
    try {
      const engine = this.aceService.getEngine();
      if (engine) {
        return await engine.getSessionState(sessionId);
      }
      return null;
    } catch (error: any) {
      logger.warn(`[EnhancedSessionManager] Failed to get ACE session state: ${error.message}`);
      return null;
    }
  }

  /**
   * 计算健康评分
   */
  private calculateHealthScore(metrics: {
    messageCount: number;
    age: number;
    lastActivity: number;
    compressionCount: number;
    status: string;
  }): number {
    let score = 100;

    // 消息数量评分
    if (metrics.messageCount > 1000) score -= 10;
    if (metrics.messageCount > 5000) score -= 20;

    // 活跃度评分
    const idleTime = Date.now() - metrics.lastActivity;
    if (idleTime > 60 * 60 * 1000) score -= 10; // 1小时无活动
    if (idleTime > 24 * 60 * 60 * 1000) score -= 20; // 24小时无活动

    // 压缩次数评分
    if (metrics.compressionCount > 10) score -= 5;

    // 会话年龄评分
    if (metrics.age > 7 * 24 * 60 * 60 * 1000) score -= 10; // 7天

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 估算token数量
   */
  private estimateTokenCount(messages: Message[]): number {
    let totalChars = 0;

    for (const message of messages) {
      if (typeof message.content === 'string') {
        totalChars += message.content.length;
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text' && part.text) {
            totalChars += part.text.length;
          }
        }
      }
    }

    return Math.ceil(totalChars / 3);
  }

  /**
   * 缓存会话
   */
  private cacheSession(sessionId: string, context: any): void {
    const size = JSON.stringify(context).length;
    const cache: SessionCache = {
      sessionId,
      effectiveContext: context,
      lastAccessed: Date.now(),
      accessCount: 1,
      size
    };

    // 如果缓存已满，清理最旧的条目
    if (this.sessionCache.size >= this.maxCacheSize) {
      const oldestKey = this.getOldestCacheKey();
      if (oldestKey) {
        this.sessionCache.delete(oldestKey);
      }
    }

    this.sessionCache.set(sessionId, cache);
  }

  /**
   * 获取最旧的缓存键
   */
  private getOldestCacheKey(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, cache] of this.sessionCache.entries()) {
      if (cache.lastAccessed < oldestTime) {
        oldestTime = cache.lastAccessed;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * 启动缓存清理定时器
   */
  private startCacheCleanupTimer(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, cache] of this.sessionCache.entries()) {
        if (now - cache.lastAccessed > this.cacheTtlMs) {
          this.sessionCache.delete(key);
        }
      }
    }, this.cacheTtlMs);

    logger.debug('[EnhancedSessionManager] Cache cleanup timer started');
  }
}
