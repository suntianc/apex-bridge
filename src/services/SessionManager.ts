/**
 * SessionManager - 会话生命周期管理
 * 职责：会话的创建、验证、更新、归档
 */

import { AceService } from './AceService';

/**
 * 会话扩展元数据接口
 */
export interface SessionExtendedMetadata {
  /** Agent ID */
  agentId?: string;
  /** 用户 ID */
  userId?: string;
  /** 对话 ID */
  conversationId?: string;
  /** 创建时间 */
  createdAt?: number;
  /** 来源 */
  source?: string;
  /** 最后一条消息时间 */
  lastMessageAt?: number;
  /** 消息计数 */
  messageCount?: number;
  /** 累计 Token 使用量 */
  totalTokens?: number;
  /** 累计输入 Token */
  totalInputTokens?: number;
  /** 累计输出 Token */
  totalOutputTokens?: number;
}
import { ConversationHistoryService } from './ConversationHistoryService';
import { logger } from '../utils/logger';

export class SessionManager {
  // conversationId -> sessionId 映射
  private sessionMap = new Map<string, string>();

  constructor(
    private aceService: AceService,
    private historyService: ConversationHistoryService
  ) {}

  /**
   * 获取或创建会话
   * @param agentId Agent ID（可选）
   * @param userId 用户ID（可选）
   * @param conversationId 对话ID（必需）
   * @returns sessionId 或 null
   */
  async getOrCreate(
    agentId: string | undefined,
    userId: string | undefined,
    conversationId: string
  ): Promise<string | null> {
    // 1. 如果没有 conversationId，无法创建会话
    if (!conversationId) {
      logger.debug('[SessionManager] No conversationId provided, processing without session');
      return null;
    }

    // 2. 检查是否已存在会话映射
    let sessionId = this.sessionMap.get(conversationId);

    if (sessionId) {
      // 3. 验证会话是否仍然存在且有效
      const engine = this.aceService.getEngine();
      if (engine) {
        try {
          const session = await engine.getSessionState(sessionId);
          if (session && session.status === 'active') {
            // 更新会话活动时间
            await engine.updateSessionActivity(sessionId).catch(err => {
              logger.warn(`[SessionManager] Failed to update session activity: ${err.message}`);
            });
            return sessionId;
          } else {
            // 会话已失效或被归档，移除映射
            this.sessionMap.delete(conversationId);
            logger.debug(`[SessionManager] Session ${sessionId} is no longer active, removed from map`);
          }
        } catch (error: any) {
          logger.warn(`[SessionManager] Failed to verify session: ${error.message}`);
          // 验证失败，移除映射并重新创建
          this.sessionMap.delete(conversationId);
          sessionId = null;
        }
      }
    }

    // 4. 如果内存中没有，直接使用 conversationId 作为 sessionId
    if (!sessionId) {
      sessionId = conversationId;
    }

    const engine = this.aceService.getEngine();
    if (!engine) {
      logger.warn('[SessionManager] ACE Engine not initialized, cannot create session');
      return null;
    }

    // 5. 先检查数据库中是否已存在该 session（防止 UNIQUE constraint 错误）
    try {
      const existingSession = await engine.getSessionState(sessionId);
      if (existingSession) {
        // 会话已存在，更新映射关系并返回
        this.sessionMap.set(conversationId, sessionId);

        // 更新会话活动时间
        await engine.updateSessionActivity(sessionId).catch(err => {
          logger.warn(`[SessionManager] Failed to update session activity: ${err.message}`);
        });

        logger.debug(`[SessionManager] Reused existing session: ${sessionId} for conversation: ${conversationId}`);
        return sessionId;
      }
    } catch (error: any) {
      // 如果查询失败（可能是 session 不存在），继续创建流程
      logger.debug(`[SessionManager] Session ${sessionId} not found in database, will create new one`);
    }

    // 6. 创建新会话（数据库中不存在）
    try {
      // 初始化扩展元数据
      const metadata: SessionExtendedMetadata = {
        agentId,
        userId,
        conversationId,
        createdAt: Date.now(),
        source: 'frontend',
        lastMessageAt: Date.now(),
        messageCount: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0
      };

      await engine.createSession(sessionId, metadata);

      // 7. 保存映射关系
      this.sessionMap.set(conversationId, sessionId);

      logger.info(`[SessionManager] Created new session: ${sessionId} for conversation: ${conversationId}`);
    } catch (error: any) {
      // 如果创建失败（可能是并发创建导致的 UNIQUE constraint），再次尝试获取
      if (error.message && error.message.includes('UNIQUE constraint')) {
        logger.warn(`[SessionManager] Session ${sessionId} already exists (concurrent creation), reusing it`);
        try {
          const existingSession = await engine.getSessionState(sessionId);
          if (existingSession) {
            this.sessionMap.set(conversationId, sessionId);
            await engine.updateSessionActivity(sessionId).catch(() => { });
            return sessionId;
          }
        } catch (retryError: any) {
          logger.error(`[SessionManager] Failed to get session after UNIQUE constraint error: ${retryError.message}`);
        }
      }
      logger.error(`[SessionManager] Failed to create session: ${error.message}`);
      return null;
    }

    return sessionId;
  }

  /**
   * 更新会话元数据（消息计数、Token使用量等）
   * @param sessionId 会话ID
   * @param usage Token使用信息（可选）
   */
  async updateMetadata(
    sessionId: string,
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
  ): Promise<void> {
    const engine = this.aceService.getEngine();
    if (!engine) {
      return;
    }

    try {
      // 获取当前会话状态
      const session = await engine.getSessionState(sessionId);
      if (!session || !session.metadata) {
        return;
      }

      const currentMetadata = session.metadata as SessionExtendedMetadata;

      // 更新元数据
      const updates: Partial<SessionExtendedMetadata> = {
        lastMessageAt: Date.now(),
        messageCount: (currentMetadata.messageCount || 0) + 1
      };

      // 更新 Token 统计
      if (usage) {
        const totalTokens = usage.total_tokens || 0;
        const inputTokens = usage.prompt_tokens || 0;
        const outputTokens = usage.completion_tokens || 0;

        updates.totalTokens = (currentMetadata.totalTokens || 0) + totalTokens;
        updates.totalInputTokens = (currentMetadata.totalInputTokens || 0) + inputTokens;
        updates.totalOutputTokens = (currentMetadata.totalOutputTokens || 0) + outputTokens;
      }

      // 合并更新
      await engine.updateSessionMetadata(sessionId, updates);
    } catch (error: any) {
      logger.warn(`[SessionManager] Failed to update session metadata: ${error.message}`);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 归档会话（用户删除对话时调用）
   * @param conversationId 对话ID
   */
  async archive(conversationId: string): Promise<void> {
    const sessionId = this.sessionMap.get(conversationId);

    if (!sessionId) {
      logger.warn(`[SessionManager] No session found for conversation: ${conversationId}`);
      // 即使没有 sessionId，也尝试删除消息历史
      try {
        await this.historyService.deleteMessages(conversationId);
        logger.info(`[SessionManager] Deleted conversation history for: ${conversationId}`);
      } catch (error: any) {
        logger.warn(`[SessionManager] Failed to delete conversation history: ${error.message}`);
      }
      return;
    }

    const engine = this.aceService.getEngine();
    if (engine) {
      try {
        await engine.archiveSession(sessionId);
        logger.info(`[SessionManager] Archived session: ${sessionId} for conversation: ${conversationId}`);
      } catch (error: any) {
        logger.error(`[SessionManager] Failed to archive session: ${error.message}`);
      }
    }

    // 删除对话消息历史
    try {
      await this.historyService.deleteMessages(conversationId);
      logger.info(`[SessionManager] Deleted conversation history for: ${conversationId}`);
    } catch (error: any) {
      logger.error(`[SessionManager] Failed to delete conversation history: ${error.message}`);
    }

    // 移除映射
    this.sessionMap.delete(conversationId);
  }

  /**
   * 根据 conversationId 获取 sessionId
   * @param conversationId 对话ID
   * @returns sessionId 或 null
   */
  getSessionId(conversationId: string): string | null {
    return this.sessionMap.get(conversationId) || null;
  }

  /**
   * 批量移除会话映射（用于清理）
   * @param conversationIds 对话ID数组
   */
  removeSessionMappings(conversationIds: string[]): void {
    conversationIds.forEach(id => {
      this.sessionMap.delete(id);
      logger.debug(`[SessionManager] Removed session mapping for: ${id}`);
    });
  }

  /**
   * 获取所有会话映射（用于调试）
   * @returns 会话映射副本
   */
  getAllSessionMappings(): Map<string, string> {
    return new Map(this.sessionMap);
  }

  /**
   * 获取会话总数
   * @returns 会话数量
   */
  getSessionCount(): number {
    return this.sessionMap.size;
  }
}
