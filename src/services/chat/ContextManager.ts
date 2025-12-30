/**
 * ContextManager - 上下文管理器（包装器）
 *
 * 包装核心上下文管理器，提供聊天服务专用的上下文管理接口
 */

import type { ContextManager as CoreContextManager } from '../../context/ContextManager';
import type { ContextStorageService } from '../ContextStorageService';
import type { Message, ChatOptions, ContextInfo, ContextUpdate, ContextManageOptions } from './types';
import { logger } from '../../utils/logger';

/**
 * 上下文管理器接口
 */
export interface IChatContextManager {
  /**
   * 管理上下文
   * @param sessionId 会话ID
   * @param messages 消息数组
   * @param options 选项
   * @returns 上下文信息
   */
  manage(
    sessionId: string,
    messages: Message[],
    options?: ContextManageOptions
  ): Promise<ContextInfo>;

  /**
   * 强制压缩上下文
   * @param sessionId 会话ID
   * @param messages 消息数组
   * @param threshold 阈值
   * @returns 上下文信息
   */
  forceCompact(
    sessionId: string,
    messages: Message[],
    threshold?: number
  ): Promise<ContextInfo>;

  /**
   * 创建检查点
   * @param conversationId 对话ID
   * @param messages 消息数组
   * @param reason 原因
   * @returns 检查点ID
   */
  createCheckpoint(
    conversationId: string,
    messages: Message[],
    reason?: string
  ): Promise<string>;

  /**
   * 恢复到检查点
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 上下文信息
   */
  rollbackToCheckpoint(
    sessionId: string,
    checkpointId: string
  ): Promise<ContextInfo>;

  /**
   * 获取上下文状态
   * @param sessionId 会话ID
   * @returns 状态信息
   */
  getContextStatus(sessionId: string): Promise<{
    hasEffectiveContext: boolean;
    tokenCount: number;
    messageCount: number;
    lastAction?: {
      type: string;
      tokensBefore: number;
      tokensAfter: number;
      reason?: string;
    };
  }>;

  /**
   * 获取检查点列表
   * @param conversationId 对话ID
   * @returns 检查点列表
   */
  getCheckpoints(conversationId: string): Promise<unknown[]>;

  /**
   * 获取上下文统计
   * @param sessionId 会话ID
   * @returns 统计信息
   */
  getContextStats(sessionId: string): Promise<unknown>;
}

/**
 * 上下文管理器实现
 * 包装核心上下文管理器，提供聊天服务专用接口
 */
export class ChatContextManager implements IChatContextManager {
  private readonly coreContextManager: CoreContextManager;
  private readonly contextStorageService: ContextStorageService;

  constructor(
    coreContextManager: CoreContextManager,
    contextStorageService: ContextStorageService
  ) {
    this.coreContextManager = coreContextManager;
    this.contextStorageService = contextStorageService;
  }

  /**
   * 管理上下文
   */
  async manage(
    sessionId: string,
    messages: Message[],
    options: ContextManageOptions = {}
  ): Promise<ContextInfo> {
    try {
      const result = await this.coreContextManager.manageContext(
        sessionId,
        messages,
        {
          force: options.force || false,
          createCheckpoint: options.createCheckpoint || false
        }
      );

      return {
        sessionId,
        messageHistory: result.effectiveMessages,
        systemPrompt: this.extractSystemPrompt(result.effectiveMessages),
        variables: {},
        managed: result.managed,
        action: {
          type: result.action.type,
          tokensBefore: result.action.tokensBefore,
          tokensAfter: result.action.tokensAfter
        },
        effectiveMessages: result.effectiveMessages
      };
    } catch (error) {
      logger.warn(`[ChatContextManager] Context management failed: ${(error as Error).message}`);
      // 返回原始消息，不进行管理
      return {
        sessionId,
        messageHistory: messages,
        systemPrompt: this.extractSystemPrompt(messages),
        variables: {},
        managed: false
      };
    }
  }

  /**
   * 强制压缩上下文
   */
  async forceCompact(
    sessionId: string,
    messages: Message[],
    threshold?: number
  ): Promise<ContextInfo> {
    try {
      const result = await this.coreContextManager.forceCompact(
        sessionId,
        messages,
        threshold
      );

      return {
        sessionId,
        messageHistory: result.effectiveMessages,
        systemPrompt: this.extractSystemPrompt(result.effectiveMessages),
        variables: {},
        managed: result.managed,
        action: {
          type: result.action.type,
          tokensBefore: result.action.tokensBefore,
          tokensAfter: result.action.tokensAfter
        },
        effectiveMessages: result.effectiveMessages
      };
    } catch (error) {
      logger.warn(`[ChatContextManager] Force compact failed: ${(error as Error).message}`);
      return {
        sessionId,
        messageHistory: messages,
        systemPrompt: this.extractSystemPrompt(messages),
        variables: {},
        managed: false
      };
    }
  }

  /**
   * 创建检查点
   */
  async createCheckpoint(
    conversationId: string,
    messages: Message[],
    reason: string = 'Manual checkpoint'
  ): Promise<string> {
    return this.coreContextManager.createCheckpoint(conversationId, messages, reason);
  }

  /**
   * 恢复到检查点
   */
  async rollbackToCheckpoint(
    sessionId: string,
    checkpointId: string
  ): Promise<ContextInfo> {
    try {
      const result = await this.coreContextManager.rollbackToCheckpoint(
        sessionId,
        checkpointId
      );

      return {
        sessionId,
        messageHistory: result.effectiveMessages,
        systemPrompt: this.extractSystemPrompt(result.effectiveMessages),
        variables: {},
        managed: result.managed,
        action: {
          type: result.action.type,
          tokensBefore: result.action.tokensBefore,
          tokensAfter: result.action.tokensAfter
        },
        effectiveMessages: result.effectiveMessages
      };
    } catch (error) {
      logger.warn(`[ChatContextManager] Rollback to checkpoint failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 获取上下文状态
   */
  async getContextStatus(sessionId: string): Promise<{
    hasEffectiveContext: boolean;
    tokenCount: number;
    messageCount: number;
    lastAction?: {
      type: string;
      tokensBefore: number;
      tokensAfter: number;
      reason?: string;
    };
  }> {
    return this.coreContextManager.getContextStatus(sessionId);
  }

  /**
   * 获取检查点列表
   */
  async getCheckpoints(conversationId: string): Promise<unknown[]> {
    return this.contextStorageService.getCheckpoints(conversationId);
  }

  /**
   * 获取上下文统计
   */
  async getContextStats(sessionId: string): Promise<unknown> {
    return this.contextStorageService.getContextStats(sessionId);
  }

  /**
   * 获取核心上下文管理器实例
   */
  getCoreContextManager(): CoreContextManager {
    return this.coreContextManager;
  }

  /**
   * 提取系统提示词
   */
  private extractSystemPrompt(messages: Message[]): string {
    const systemMessage = messages.find(m => m.role === 'system');
    if (systemMessage) {
      return typeof systemMessage.content === 'string'
        ? systemMessage.content
        : '';
    }
    return '';
  }
}

/**
 * 创建上下文管理器
 * 如果核心上下文管理器不可用，返回禁用状态的管理器
 */
export function createChatContextManager(
  coreContextManager: CoreContextManager | null,
  contextStorageService: ContextStorageService | null
): IChatContextManager {
  if (coreContextManager && contextStorageService) {
    return new ChatContextManager(coreContextManager, contextStorageService);
  }

  // 返回禁用状态的上下文管理器
  return createDisabledContextManager();
}

/**
 * 创建禁用状态的上下文管理器
 */
function createDisabledContextManager(): IChatContextManager {
  return {
    async manage(sessionId: string, messages: Message[]): Promise<ContextInfo> {
      return {
        sessionId,
        messageHistory: messages,
        systemPrompt: '',
        variables: {},
        managed: false
      };
    },
    async forceCompact(sessionId: string, messages: Message[]): Promise<ContextInfo> {
      return {
        sessionId,
        messageHistory: messages,
        systemPrompt: '',
        variables: {},
        managed: false
      };
    },
    async createCheckpoint(): Promise<string> {
      return '';
    },
    async rollbackToCheckpoint(): Promise<ContextInfo> {
      throw new Error('Context manager not available');
    },
    async getContextStatus(): Promise<{
      hasEffectiveContext: false;
      tokenCount: 0;
      messageCount: 0;
    }> {
      return {
        hasEffectiveContext: false,
        tokenCount: 0,
        messageCount: 0
      };
    },
    async getCheckpoints(): Promise<unknown[]> {
      return [];
    },
    async getContextStats(): Promise<unknown> {
      return {};
    }
  };
}
