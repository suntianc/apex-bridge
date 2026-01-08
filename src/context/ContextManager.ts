/**
 * ContextManager - 核心上下文管理器
 * Phase 1: Context Management Infrastructure
 *
 * 职责：
 * - 智能上下文管理（prune、compact、truncate）
 * - 上下文窗口动态调整
 * - 检查点机制
 * - Token使用优化
 */

import { logger } from '../utils/logger';
import { SessionManager } from '../services/SessionManager';
import { ContextStorageService } from '../services/ContextStorageService';
import { LLMManager } from '../core/LLMManager';
import { CompressionService } from './CompressionService';
import {
  ContextConfig,
  DEFAULT_CONTEXT_CONFIG,
  ContextActionType,
  ContextAction,
  ContextResult,
  ManageContextOptions,
  Message
} from './types';

export class ContextManager {
  private config: ContextConfig;
  private storageService: ContextStorageService;
  private compressionService: CompressionService;

  constructor(
    private sessionManager: SessionManager,
    private llmManager: LLMManager,
    config: Partial<ContextConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
    this.storageService = ContextStorageService.getInstance();
    this.compressionService = new CompressionService(this.llmManager, this.config);
    logger.debug('[ContextManager] Initialized with config:', this.config);
  }

  /**
   * 管理上下文：根据消息和配置决定是否进行上下文管理
   */
  async manageContext(
    sessionId: string,
    messages: Message[],
    options: ManageContextOptions = {}
  ): Promise<ContextResult> {
    const startTime = Date.now();

    try {
      // 获取当前会话状态
      const conversationId = this.sessionManager.getSessionId(sessionId) || sessionId;

      // 估算当前token数
      const tokenCount = this.estimateTokenCount(messages);

      // 检查是否需要上下文管理
      const shouldManage = options.force ||
        tokenCount > this.config.managementThreshold ||
        messages.length > this.config.maxMessages;

      if (!shouldManage) {
        return {
          managed: false,
          action: {
            type: 'none',
            tokensBefore: tokenCount,
            tokensAfter: tokenCount,
            timestamp: Date.now()
          },
          effectiveMessages: messages,
          tokenCount,
          messageCount: messages.length
        };
      }

      // 选择压缩策略
      const strategy = options.strategy || this.config.compressionStrategy;

      // 应用上下文管理策略
      let action: ContextAction;
      let managedMessages: Message[];

      switch (strategy) {
        case 'truncate':
          ({ action, managedMessages } = this.applyTruncation(messages, tokenCount));
          break;

        case 'compact':
          ({ action, managedMessages } = await this.applyCompression(messages, tokenCount, conversationId));
          break;

        case 'prune':
          ({ action, managedMessages } = this.applyPruning(messages, tokenCount));
          break;

        case 'hybrid':
          ({ action, managedMessages } = await this.applyHybridStrategy(messages, tokenCount, conversationId));
          break;

        default:
          throw new Error(`Unknown compression strategy: ${strategy}`);
      }

      // 如果启用了检查点，创建检查点
      if (this.config.autoCheckpoint && messages.length % this.config.checkpointInterval === 0) {
        await this.storageService.createCheckpoint(
          conversationId,
          messages,
          tokenCount,
          `Auto checkpoint before ${action.type}`
        );
      }

      // 保存有效上下文到存储层
      const managedTokenCount = this.estimateTokenCount(managedMessages);
      await this.storageService.saveEffectiveContext(
        sessionId,
        conversationId,
        managedMessages,
        managedTokenCount,
        managedMessages.length,
        action.summary,
        action.affectedMessageIds || [],
        action
      );

      const processingTime = Date.now() - startTime;
      logger.debug(`Context managed: ${action.type}`);

      return {
        managed: true,
        action,
        effectiveMessages: managedMessages,
        tokenCount: managedTokenCount,
        messageCount: managedMessages.length
      };

    } catch (error: any) {
      logger.error(`[ContextManager] Context management failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 截断策略：移除最旧的消息
   */
  private applyTruncation(messages: Message[], tokenCount: number): {
    action: ContextAction;
    managedMessages: Message[];
  } {
    const targetTokenCount = this.config.maxTokens;
    const targetMessageCount = this.config.maxMessages;

    // 保留最新的消息
    const messagesToKeep = Math.min(targetMessageCount, messages.length);
    const managedMessages = messages.slice(-messagesToKeep);

    const managedTokenCount = this.estimateTokenCount(managedMessages);
    const removedMessageIds = Array.from(
      { length: messages.length - messagesToKeep },
      (_, i) => i + 1
    );

    const action: ContextAction = {
      type: 'truncate',
      affectedMessageIds: removedMessageIds,
      tokensBefore: tokenCount,
      tokensAfter: managedTokenCount,
      timestamp: Date.now(),
      reason: `Truncated to ${messagesToKeep} messages`
    };

    logger.debug(`[ContextManager] Truncation: ${messages.length} -> ${managedMessages.length} messages`);
    return { action, managedMessages };
  }

  /**
   * 压缩策略：使用LLM生成摘要并保留关键信息
   */
  private async applyCompression(
    messages: Message[],
    tokenCount: number,
    conversationId: string
  ): Promise<{
    action: ContextAction;
    managedMessages: Message[];
  }> {
    try {
      // 使用CompressionService进行LLM压缩
      const targetTokenCount = Math.floor(this.config.maxTokens * 0.7); // 保留30%空间给摘要

      const compressionResult = await this.compressionService.compressContext({
        messages,
        targetTokenCount,
        preserveSystemMessages: true
      });

      const managedMessages = compressionResult.compressedMessages;
      const managedTokenCount = compressionResult.tokensAfter;
      const removedCount = compressionResult.metadata.removedMessageIds.length;

      const action: ContextAction = {
        type: 'compact',
        affectedMessageIds: compressionResult.metadata.removedMessageIds,
        summary: compressionResult.summary,
        tokensBefore: compressionResult.tokensBefore,
        tokensAfter: managedTokenCount,
        timestamp: Date.now(),
        reason: `LLM compression: ${removedCount} messages compressed (${(compressionResult.compressionRatio * 100).toFixed(1)}% reduction)`
      };

      logger.debug(`LLM Compression: ${messages.length} -> ${managedMessages.length}`);
      return { action, managedMessages };

    } catch (error: any) {
      logger.warn(`[ContextManager] LLM compression failed, using fallback: ${error.message}`);

      // 如果LLM压缩失败，回退到简单压缩
      const systemMessages = messages.filter(m => m.role === 'system');
      const recentMessages = messages.filter(m => m.role !== 'system').slice(-10);
      const managedMessages = [...systemMessages, ...recentMessages];

      const summary = this.generateSimpleSummary(messages);
      const managedTokenCount = this.estimateTokenCount(managedMessages);
      const removedCount = messages.length - managedMessages.length;

      const action: ContextAction = {
        type: 'compact',
        affectedMessageIds: removedCount > 0 ? Array.from({ length: removedCount }, (_, i) => i + 1) : [],
        summary,
        tokensBefore: tokenCount,
        tokensAfter: managedTokenCount,
        timestamp: Date.now(),
        reason: `Fallback compression: ${removedCount} messages compressed`
      };

      logger.debug(`[ContextManager] Fallback compression: ${messages.length} -> ${managedMessages.length} messages`);
      return { action, managedMessages };
    }
  }

  /**
   * 修剪策略：选择性移除不太重要的消息
   */
  private applyPruning(messages: Message[], tokenCount: number): {
    action: ContextAction;
    managedMessages: Message[];
  } {
    // 简单的修剪策略：保留系统消息、第一条和最后几条消息
    const systemMessages = messages.filter(m => m.role === 'system');
    const firstMessage = messages.length > 0 ? [messages[0]] : [];
    const lastMessages = messages.slice(-5);

    const managedMessages = [...systemMessages, ...firstMessage, ...lastMessages];
    const managedTokenCount = this.estimateTokenCount(managedMessages);
    const removedCount = messages.length - managedMessages.length;

    const action: ContextAction = {
      type: 'prune',
      affectedMessageIds: removedCount > 0 ? Array.from({ length: removedCount }, (_, i) => i + 1) : [],
      tokensBefore: tokenCount,
      tokensAfter: managedTokenCount,
      timestamp: Date.now(),
      reason: `Pruned ${removedCount} less important messages`
    };

    logger.debug(`[ContextManager] Pruning: ${messages.length} -> ${managedMessages.length} messages`);
    return { action, managedMessages };
  }

  /**
   * 混合策略：根据情况动态选择策略
   */
  private async applyHybridStrategy(
    messages: Message[],
    tokenCount: number,
    conversationId: string
  ): Promise<{
    action: ContextAction;
    managedMessages: Message[];
  }> {
    // 根据token使用率选择策略
    const tokenUsageRatio = tokenCount / this.config.maxTokens;

    if (tokenUsageRatio > 0.9) {
      // 超过90%使用率，使用压缩
      return this.applyCompression(messages, tokenCount, conversationId);
    } else if (tokenUsageRatio > 0.7) {
      // 70-90%使用率，使用修剪
      return this.applyPruning(messages, tokenCount);
    } else {
      // 低于70%使用率，使用截断
      return this.applyTruncation(messages, tokenCount);
    }
  }

  /**
   * 生成简单摘要（占位实现，Phase 2将使用LLM）
   */
  private generateSimpleSummary(messages: Message[]): string {
    if (messages.length === 0) return '';

    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    return `Conversation summary: ${userMessages.length} user messages, ${assistantMessages.length} assistant messages. Topics discussed: [Placeholder - LLM compression coming in Phase 2]`;
  }

  /**
   * 估算token数量（近似算法）
   */
  private estimateTokenCount(messages: Message[]): number {
    // 简单的token估算：1 token ≈ 4 characters (英文) 或 2 characters (中文)
    let totalChars = 0;

    for (const message of messages) {
      if (typeof message.content === 'string') {
        totalChars += message.content.length;
      } else if (Array.isArray(message.content)) {
        // 处理多模态内容
        for (const part of message.content) {
          if (part.type === 'text' && part.text) {
            totalChars += part.text.length;
          }
          // 忽略图片等非文本内容
        }
      }
    }

    // 简化的token估算
    return Math.ceil(totalChars / 4);
  }

  /**
   * 获取有效历史（过滤被压缩的消息）
   */
  getEffectiveHistory(messages: Message[]): Message[] {
    // 过滤掉被标记为压缩的消息
    // TODO: 从message_marks表获取标记信息
    return messages;
  }

  /**
   * 创建检查点
   */
  async createCheckpoint(
    conversationId: string,
    messages: Message[],
    reason: string = 'Manual checkpoint'
  ): Promise<string> {
    const tokenCount = this.estimateTokenCount(messages);
    return this.storageService.createCheckpoint(conversationId, messages, tokenCount, reason);
  }

  /**
   * 恢复到检查点
   */
  async rollbackToCheckpoint(
    sessionId: string,
    checkpointId: string
  ): Promise<ContextResult> {
    const checkpoint = await this.storageService.restoreFromCheckpoint(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    // 更新会话的有效上下文
    await this.storageService.saveEffectiveContext(
      sessionId,
      checkpoint.conversationId,
      checkpoint.messages,
      checkpoint.tokenCount,
      checkpoint.messages.length
    );

    const action: ContextAction = {
      type: 'restore',
      checkpointId,
      tokensBefore: 0,
      tokensAfter: checkpoint.tokenCount,
      timestamp: Date.now(),
      reason: `Restored from checkpoint ${checkpointId}`
    };

    return {
      managed: true,
      action,
      effectiveMessages: checkpoint.messages,
      tokenCount: checkpoint.tokenCount,
      messageCount: checkpoint.messages.length
    };
  }

  /**
   * 标记消息
   */
  async markMessage(
    messageId: number,
    conversationId: string,
    markType: 'compressed' | 'truncated' | 'pruned' | 'important' | 'pinned',
    actionId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.storageService.markMessage(messageId, conversationId, markType, actionId, metadata);
  }

  /**
   * 获取上下文状态
   */
  async getContextStatus(sessionId: string): Promise<{
    hasEffectiveContext: boolean;
    tokenCount: number;
    messageCount: number;
    lastAction?: ContextAction;
  }> {
    const context = await this.storageService.getEffectiveContext(sessionId);
    if (!context) {
      return {
        hasEffectiveContext: false,
        tokenCount: 0,
        messageCount: 0
      };
    }

    return {
      hasEffectiveContext: true,
      tokenCount: context.tokenCount,
      messageCount: context.messageCount,
      lastAction: context.lastAction
    };
  }

  /**
   * 强制压缩
   */
  async forceCompact(
    sessionId: string,
    messages: Message[],
    threshold?: number
  ): Promise<ContextResult> {
    const customThreshold = threshold || this.config.managementThreshold;
    const originalConfig = this.config.compressionStrategy;

    // 临时使用压缩策略
    this.config.compressionStrategy = 'compact';

    try {
      const result = await this.manageContext(sessionId, messages, {
        force: true,
        reason: 'Force compact'
      });

      return result;
    } finally {
      // 恢复原始配置
      this.config.compressionStrategy = originalConfig;
    }
  }

  /**
   * 获取配置
   */
  getConfig(): ContextConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.debug('ContextManager config updated');
  }
}
