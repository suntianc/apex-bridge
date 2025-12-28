/**
 * MessageSyncService - 消息同步服务
 * Phase 2: Context Compression System
 *
 * 职责：
 * - 在完整历史层和有效上下文层之间同步消息
 * - 处理新消息的添加和上下文更新
 * - 触发上下文管理检查
 */

import { logger } from '../utils/logger';
import { ContextStorageService } from './ContextStorageService';
import { ContextManager } from '../context/ContextManager';
import { ConversationHistoryService, type ConversationMessage } from './ConversationHistoryService';
import { SessionManager } from './SessionManager';
import { Message } from '../types';

export class MessageSyncService {
  private contextStorageService: ContextStorageService;
  private contextManager: ContextManager;
  private historyService: ConversationHistoryService;

  constructor(
    contextStorageService: ContextStorageService,
    contextManager: ContextManager,
    sessionManager: SessionManager
  ) {
    this.contextStorageService = contextStorageService;
    this.contextManager = contextManager;
    this.historyService = ConversationHistoryService.getInstance();
    logger.debug('[MessageSyncService] Initialized');
  }

  /**
   * 添加新消息到对话（自动同步到两个存储层）
   */
  async addMessage(
    conversationId: string,
    message: Message,
    sessionId?: string
  ): Promise<void> {
    try {
      // 1. 保存到完整历史层
      await this.historyService.saveMessages(conversationId, [message]);
      logger.debug(`[MessageSyncService] Saved message to history layer: ${conversationId}`);

      // 2. 如果有会话，更新有效上下文层
      if (sessionId) {
        await this.updateEffectiveContext(conversationId, sessionId, message);
      }

      logger.debug(`[MessageSyncService] Message synced successfully for conversation: ${conversationId}`);
    } catch (error: any) {
      logger.error(`[MessageSyncService] Failed to add message: ${error.message}`);
      throw error;
    }
  }

  /**
   * 批量添加消息
   */
  async addMessages(
    conversationId: string,
    messages: Message[],
    sessionId?: string
  ): Promise<void> {
    try {
      // 1. 保存到完整历史层
      await this.historyService.saveMessages(conversationId, messages);
      logger.debug(`[MessageSyncService] Saved ${messages.length} messages to history layer: ${conversationId}`);

      // 2. 如果有会话，更新有效上下文层
      if (sessionId) {
        await this.updateEffectiveContextForBatch(conversationId, sessionId, messages);
      }

      logger.debug(`[MessageSyncService] Messages synced successfully for conversation: ${conversationId}`);
    } catch (error: any) {
      logger.error(`[MessageSyncService] Failed to add messages: ${error.message}`);
      throw error;
    }
  }

  /**
   * 更新有效上下文层（单个消息）
   */
  private async updateEffectiveContext(
    conversationId: string,
    sessionId: string,
    newMessage: Message
  ): Promise<void> {
    try {
      // 获取当前有效上下文
      const currentContext = await this.contextStorageService.getEffectiveContext(sessionId);
      const effectiveMessages = currentContext?.messages || [];

      // 添加新消息到有效上下文
      const updatedMessages = [...effectiveMessages, newMessage];

      // 检查是否需要触发上下文管理
      const shouldTriggerManagement = this.shouldTriggerContextManagement(
        updatedMessages,
        effectiveMessages.length
      );

      if (shouldTriggerManagement) {
        logger.debug(`[MessageSyncService] Triggering context management for session: ${sessionId}`);
        await this.triggerContextManagement(sessionId, conversationId, updatedMessages);
      } else {
        // 直接更新有效上下文
        const tokenCount = this.estimateTokenCount(updatedMessages);
        await this.contextStorageService.saveEffectiveContext(
          sessionId,
          conversationId,
          updatedMessages,
          tokenCount,
          updatedMessages.length
        );
        logger.debug(`[MessageSyncService] Updated effective context (no management needed)`);
      }
    } catch (error: any) {
      logger.warn(`[MessageSyncService] Failed to update effective context: ${error.message}`);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 更新有效上下文层（批量消息）
   */
  private async updateEffectiveContextForBatch(
    conversationId: string,
    sessionId: string,
    newMessages: Message[]
  ): Promise<void> {
    try {
      // 获取当前有效上下文
      const currentContext = await this.contextStorageService.getEffectiveContext(sessionId);
      const effectiveMessages = currentContext?.messages || [];

      // 添加新消息到有效上下文
      const updatedMessages = [...effectiveMessages, ...newMessages];

      // 检查是否需要触发上下文管理
      const shouldTriggerManagement = this.shouldTriggerContextManagement(
        updatedMessages,
        effectiveMessages.length + newMessages.length
      );

      if (shouldTriggerManagement) {
        logger.debug(`[MessageSyncService] Triggering context management for batch update, session: ${sessionId}`);
        await this.triggerContextManagement(sessionId, conversationId, updatedMessages);
      } else {
        // 直接更新有效上下文
        const tokenCount = this.estimateTokenCount(updatedMessages);
        await this.contextStorageService.saveEffectiveContext(
          sessionId,
          conversationId,
          updatedMessages,
          tokenCount,
          updatedMessages.length
        );
        logger.debug(`[MessageSyncService] Updated effective context for batch (no management needed)`);
      }
    } catch (error: any) {
      logger.warn(`[MessageSyncService] Failed to update effective context for batch: ${error.message}`);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 判断是否应该触发上下文管理
   */
  private shouldTriggerContextManagement(messages: Message[], messageCount: number): boolean {
    // 触发条件：
    // 1. 消息数量超过阈值（默认50条）
    // 2. Token数量超过阈值
    // 3. 每10条消息强制触发一次（检查点机制）

    const maxMessagesThreshold = 50;
    const tokenCount = this.estimateTokenCount(messages);
    const maxTokensThreshold = 6000;

    const shouldTriggerByCount = messageCount > maxMessagesThreshold;
    const shouldTriggerByTokens = tokenCount > maxTokensThreshold;
    const shouldTriggerByInterval = messageCount % 10 === 0;

    return shouldTriggerByCount || shouldTriggerByTokens || shouldTriggerByInterval;
  }

  /**
   * 触发上下文管理
   */
  private async triggerContextManagement(
    sessionId: string,
    conversationId: string,
    messages: Message[]
  ): Promise<void> {
    try {
      // 调用ContextManager进行上下文管理
      const contextResult = await this.contextManager.manageContext(
        sessionId,
        messages,
        {
          force: true,
          createCheckpoint: true
        }
      );

      if (contextResult.managed) {
        logger.info(`[MessageSyncService] Context management applied: ${contextResult.action.type}`);
      }
    } catch (error: any) {
      logger.error(`[MessageSyncService] Context management failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 强制同步会话的有效上下文
   */
  async forceSyncEffectiveContext(
    sessionId: string,
    conversationId: string
  ): Promise<void> {
    try {
      // 获取完整历史
      const fullHistory = await this.historyService.getMessages(conversationId, 1000, 0);

      // 触发上下文管理
      await this.triggerContextManagement(sessionId, conversationId, fullHistory);

      logger.info(`[MessageSyncService] Force synced effective context for session: ${sessionId}`);
    } catch (error: any) {
      logger.error(`[MessageSyncService] Force sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取消息同步状态
   */
  async getSyncStatus(conversationId: string, sessionId: string): Promise<{
    hasEffectiveContext: boolean;
    historyMessageCount: number;
    effectiveMessageCount: number;
    lastSyncTime?: number;
    syncLag: number;
  }> {
    try {
      // 获取完整历史消息数
      const historyMessageCount = await this.historyService.getMessageCount(conversationId);

      // 获取有效上下文
      const effectiveContext = await this.contextStorageService.getEffectiveContext(sessionId);
      const effectiveMessageCount = effectiveContext?.messageCount || 0;

      // 计算同步延迟
      const lastSyncTime = effectiveContext ? Date.now() - (effectiveContext as any).updatedAt : undefined;
      const syncLag = lastSyncTime || 0;

      return {
        hasEffectiveContext: !!effectiveContext,
        historyMessageCount,
        effectiveMessageCount,
        lastSyncTime,
        syncLag
      };
    } catch (error: any) {
      logger.error(`[MessageSyncService] Failed to get sync status: ${error.message}`);
      return {
        hasEffectiveContext: false,
        historyMessageCount: 0,
        effectiveMessageCount: 0,
        syncLag: 0
      };
    }
  }

  /**
   * 验证数据一致性
   */
  async validateDataConsistency(conversationId: string, sessionId: string): Promise<{
    isConsistent: boolean;
    issues: string[];
    historyCount: number;
    effectiveCount: number;
  }> {
    const issues: string[] = [];

    try {
      // 获取消息数量
      const historyCount = await this.historyService.getMessageCount(conversationId);
      const effectiveContext = await this.contextStorageService.getEffectiveContext(sessionId);
      const effectiveCount = effectiveContext?.messageCount || 0;

      // 检查一致性
      if (effectiveCount > historyCount) {
        issues.push(`Effective context has more messages (${effectiveCount}) than history (${historyCount})`);
      }

      // 检查时间戳
      if (effectiveContext) {
        const effectiveMessages = effectiveContext.messages;
        const lastEffectiveMessage = effectiveMessages[effectiveMessages.length - 1];

        if (lastEffectiveMessage) {
          const lastHistoryMessage = await this.historyService.getLastMessage(conversationId);

          if (lastHistoryMessage && lastEffectiveMessage.content !== this.formatMessageContent(lastHistoryMessage.content)) {
            issues.push('Last message in effective context does not match history');
          }
        }
      }

      return {
        isConsistent: issues.length === 0,
        issues,
        historyCount,
        effectiveCount
      };
    } catch (error: any) {
      logger.error(`[MessageSyncService] Consistency validation failed: ${error.message}`);
      return {
        isConsistent: false,
        issues: [`Validation error: ${error.message}`],
        historyCount: 0,
        effectiveCount: 0
      };
    }
  }

  /**
   * 清理过期数据
   */
  async cleanupExpiredData(): Promise<{
    expiredCheckpoints: number;
    oldMarks: number;
  }> {
    try {
      // 清理过期的检查点
      const expiredCheckpoints = await this.contextStorageService.cleanupExpiredCheckpoints();

      // TODO: 清理过期的消息标记
      const oldMarks = 0;

      logger.info(`[MessageSyncService] Cleanup completed: ${expiredCheckpoints} checkpoints, ${oldMarks} marks`);
      return { expiredCheckpoints, oldMarks };
    } catch (error: any) {
      logger.error(`[MessageSyncService] Cleanup failed: ${error.message}`);
      throw error;
    }
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
   * 格式化消息内容
   */
  private formatMessageContent(content: string | any[]): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const part of content) {
        if (part.type === 'text' && part.text) {
          parts.push(part.text);
        }
      }
      return parts.join(' ');
    }

    return JSON.stringify(content);
  }
}
