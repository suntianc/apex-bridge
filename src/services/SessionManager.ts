/**
 * SessionManager - 会话生命周期管理（简化版，无ACE依赖）
 * 职责：会话的创建、验证、更新、归档
 */

import { ConversationHistoryService } from "./ConversationHistoryService";
import { logger } from "../utils/logger";

/**
 * 会话元数据接口
 */
export interface SessionMetadata {
  /** Agent ID */
  agentId?: string;
  /** 用户 ID */
  userId?: string;
  /** 对话 ID */
  conversationId?: string;
  /** 创建时间 */
  createdAt?: number;
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

export class SessionManager {
  // conversationId -> sessionId 映射
  private sessionMap = new Map<string, string>();
  // sessionId -> metadata 缓存
  private metadataCache = new Map<string, SessionMetadata>();
  // pendingPromises 用于防止竞态条件：conversationId -> 创建会话的 Promise
  private pendingPromises = new Map<string, Promise<string>>();

  constructor(private historyService: ConversationHistoryService) {}

  /**
   * 获取或创建会话（并发安全版本）
   * 使用 Promise 锁确保同一 conversationId 的并发请求等待同一创建操作
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
      logger.debug("[SessionManager] No conversationId provided, processing without session");
      return null;
    }

    // 2. 检查是否有正在进行的创建操作（防止竞态条件）
    const existingPromise = this.pendingPromises.get(conversationId);
    if (existingPromise) {
      // 如果已有请求正在创建此会话，等待它完成
      logger.debug(`[SessionManager] Waiting for existing session creation: ${conversationId}`);
      return existingPromise;
    }

    // 3. 检查是否已存在会话映射
    const existingSessionId = this.sessionMap.get(conversationId);
    if (existingSessionId) {
      logger.debug(
        `[SessionManager] Reused existing session: ${existingSessionId} for conversation: ${conversationId}`
      );
      return existingSessionId;
    }

    // 4. 创建新会话（使用 conversationId 作为 sessionId）
    const sessionId = conversationId;

    // 5. 初始化元数据
    const metadata: SessionMetadata = {
      agentId,
      userId,
      conversationId,
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
      messageCount: 0,
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    // 6. 使用 Promise 锁确保原子性
    const creationPromise = (async () => {
      // 双重检查（防止在异步等待期间已被其他请求创建）
      const cachedSessionId = this.sessionMap.get(conversationId);
      if (cachedSessionId) {
        logger.debug(`[SessionManager] Session created by concurrent request: ${conversationId}`);
        return cachedSessionId;
      }

      // 保存映射和元数据
      this.sessionMap.set(conversationId, sessionId);
      this.metadataCache.set(sessionId, metadata);

      logger.info(
        `[SessionManager] Created new session: ${sessionId} for conversation: ${conversationId}`
      );
      return sessionId;
    })();

    // 7. 注册 Promise 并在完成后清理
    this.pendingPromises.set(conversationId, creationPromise);
    creationPromise.finally(() => {
      this.pendingPromises.delete(conversationId);
    });

    return creationPromise;
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
    const metadata = this.metadataCache.get(sessionId);
    if (!metadata) {
      logger.warn(`[SessionManager] No metadata found for session: ${sessionId}`);
      return;
    }

    try {
      // 更新元数据
      metadata.lastMessageAt = Date.now();
      metadata.messageCount = (metadata.messageCount || 0) + 1;

      // 更新 Token 统计
      if (usage) {
        const totalTokens = usage.total_tokens || 0;
        const inputTokens = usage.prompt_tokens || 0;
        const outputTokens = usage.completion_tokens || 0;

        metadata.totalTokens = (metadata.totalTokens || 0) + totalTokens;
        metadata.totalInputTokens = (metadata.totalInputTokens || 0) + inputTokens;
        metadata.totalOutputTokens = (metadata.totalOutputTokens || 0) + outputTokens;
      }

      logger.debug(`[SessionManager] Updated metadata for session: ${sessionId}`);
    } catch (error: any) {
      logger.warn(`[SessionManager] Failed to update session metadata: ${error.message}`);
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

    // 删除对话消息历史
    try {
      await this.historyService.deleteMessages(conversationId);
      logger.info(`[SessionManager] Deleted conversation history for: ${conversationId}`);
    } catch (error: any) {
      logger.error(`[SessionManager] Failed to delete conversation history: ${error.message}`);
    }

    // 移除缓存和映射
    this.metadataCache.delete(sessionId);
    this.sessionMap.delete(conversationId);
    logger.info(
      `[SessionManager] Archived session: ${sessionId} for conversation: ${conversationId}`
    );
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
    conversationIds.forEach((id) => {
      const sessionId = this.sessionMap.get(id);
      if (sessionId) {
        this.metadataCache.delete(sessionId);
      }
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
