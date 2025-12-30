/**
 * SessionCoordinator - 会话协调器
 *
 * 负责会话生命周期管理和对话历史协调
 */

import type { SessionManager } from '../SessionManager';
import type { ConversationHistoryService, ConversationMessage } from '../ConversationHistoryService';
import type { Message, SessionInfo, SessionCreateOptions } from './types';
import { logger } from '../../utils/logger';
import { parseAggregatedContent } from '../../api/utils/stream-parser';

/**
 * 会话协调器接口
 */
export interface ISessionCoordinator {
  /**
   * 获取或创建会话
   * @param agentId Agent ID
   * @param userId 用户ID
   * @param conversationId 对话ID
   * @returns 会话ID
   */
  getOrCreate(
    agentId: string | undefined,
    userId: string | undefined,
    conversationId: string
  ): Promise<string | null>;

  /**
   * 保存对话历史
   * @param conversationId 对话ID
   * @param messages 消息数组
   * @param aiContent AI回复内容
   * @param thinkingProcess 思考过程
   * @param isReAct 是否为ReAct模式
   */
  saveConversationHistory(
    conversationId: string,
    messages: Message[],
    aiContent: string,
    thinkingProcess?: string[],
    isReAct?: boolean
  ): Promise<void>;

  /**
   * 获取对话历史
   * @param conversationId 对话ID
   * @param limit 限制数量
   * @param offset 偏移量
   * @returns 消息数组
   */
  getConversationHistory(
    conversationId: string,
    limit?: number,
    offset?: number
  ): Promise<Message[]>;

  /**
   * 获取对话消息数量
   * @param conversationId 对话ID
   * @returns 消息数量
   */
  getMessageCount(conversationId: string): Promise<number>;

  /**
   * 获取对话最后一条消息
   * @param conversationId 对话ID
   * @returns 最后一条消息
   */
  getLastMessage(conversationId: string): Promise<ConversationMessage | null>;

  /**
   * 结束会话
   * @param conversationId 对话ID
   */
  endSession(conversationId: string): Promise<void>;

  /**
   * 获取所有有对话历史的会话ID
   * @returns 会话ID列表
   */
  getAllConversationsWithHistory(): Promise<string[]>;

  /**
   * 更新会话元数据
   * @param sessionId 会话ID
   * @param usage 使用统计
   */
  updateMetadata(
    sessionId: string,
    usage: { total_tokens: number; prompt_tokens: number; completion_tokens: number }
  ): Promise<void>;

  /**
   * 获取会话数量
   * @returns 会话数量
   */
  getSessionCount(): number;
}

/**
 * 会话协调器实现
 */
export class SessionCoordinator implements ISessionCoordinator {
  private readonly sessionManager: SessionManager;
  private readonly conversationHistoryService: ConversationHistoryService;

  constructor(
    sessionManager: SessionManager,
    conversationHistoryService: ConversationHistoryService
  ) {
    this.sessionManager = sessionManager;
    this.conversationHistoryService = conversationHistoryService;
  }

  /**
   * 获取或创建会话
   */
  async getOrCreate(
    agentId: string | undefined,
    userId: string | undefined,
    conversationId: string
  ): Promise<string | null> {
    return this.sessionManager.getOrCreate(agentId, userId, conversationId);
  }

  /**
   * 保存对话历史
   * 包含思考过程处理逻辑
   */
  async saveConversationHistory(
    conversationId: string,
    messages: Message[],
    aiContent: string,
    thinkingProcess?: string[],
    isReAct: boolean = false
  ): Promise<void> {
    try {
      // 1. 检查历史记录数量
      const count = await this.conversationHistoryService.getMessageCount(conversationId);
      const messagesToSave: Message[] = [];

      // 2. 准备要保存的消息
      if (count === 0) {
        // 新对话：保存所有非assistant、非system消息
        messagesToSave.push(...messages.filter(m =>
          m.role !== 'assistant' && m.role !== 'system'
        ));
      } else {
        // 已有对话：只保存最后一条非assistant、非system消息
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role !== 'assistant' && lastMessage.role !== 'system') {
          messagesToSave.push(lastMessage);
        }
      }

      // 3. 构建AI回复内容
      let assistantContent = aiContent;
      const parsed = parseAggregatedContent(assistantContent);

      if (isReAct) {
        const thinkingParts: string[] = [];
        if (thinkingProcess && thinkingProcess.length > 0) {
          const extractedThinking = this.extractThinkingContent(thinkingProcess);
          thinkingParts.push(`<thinking>${extractedThinking}</thinking>`);
        }
        thinkingParts.push(
          parsed.reasoning
            ? `<thinking>${parsed.reasoning}</thinking> ${parsed.content}`
            : parsed.content
        );
        assistantContent = thinkingParts.join(' ');
      } else {
        // 普通模式：解析特殊格式
        assistantContent = parsed.reasoning
          ? `<thinking>${parsed.reasoning}</thinking> ${parsed.content}`
          : parsed.content;
      }

      // 4. 添加AI回复
      messagesToSave.push({
        role: 'assistant',
        content: assistantContent
      } as Message);

      // 5. 保存到数据库
      await this.conversationHistoryService.saveMessages(conversationId, messagesToSave);
      logger.debug(`[SessionCoordinator] Saved ${messagesToSave.length} messages to history`);
    } catch (error) {
      logger.warn(`[SessionCoordinator] Failed to save conversation history: ${(error as Error).message}`);
    }
  }

  /**
   * 获取对话历史
   */
  async getConversationHistory(
    conversationId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<Message[]> {
    return this.conversationHistoryService.getMessages(conversationId, limit, offset);
  }

  /**
   * 获取对话消息数量
   */
  async getMessageCount(conversationId: string): Promise<number> {
    return this.conversationHistoryService.getMessageCount(conversationId);
  }

  /**
   * 获取对话最后一条消息
   */
  async getLastMessage(conversationId: string): Promise<ConversationMessage | null> {
    return this.conversationHistoryService.getLastMessage(conversationId);
  }

  /**
   * 结束会话
   */
  async endSession(conversationId: string): Promise<void> {
    await this.sessionManager.archive(conversationId);
  }

  /**
   * 获取所有有对话历史的会话ID
   */
  async getAllConversationsWithHistory(): Promise<string[]> {
    return this.conversationHistoryService.getAllConversationIds();
  }

  /**
   * 更新会话元数据
   */
  async updateMetadata(
    sessionId: string,
    usage: { total_tokens: number; prompt_tokens: number; completion_tokens: number }
  ): Promise<void> {
    await this.sessionManager.updateMetadata(sessionId, {
      total_tokens: usage.total_tokens,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens
    });
  }

  /**
   * 获取会话数量
   */
  getSessionCount(): number {
    return this.sessionManager.getSessionCount();
  }

  /**
   * 获取会话管理器实例
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * 获取对话历史服务实例
   */
  getConversationHistoryService(): ConversationHistoryService {
    return this.conversationHistoryService;
  }

  /**
   * 提取思考过程内容
   * 处理JSON格式的思考过程数据
   */
  private extractThinkingContent(thinkingProcess: string[]): string {
    const extracted: string[] = [];

    for (const chunk of thinkingProcess) {
      try {
        const cleaned = chunk.replace(/^data:\s*/, '').trim();
        if (cleaned && cleaned !== '[DONE]') {
          if (cleaned.includes('}{')) {
            // 处理多个JSON对象
            const jsonObjects = cleaned.split(/\}\{/);
            for (let i = 0; i < jsonObjects.length; i++) {
              let jsonStr = jsonObjects[i];
              if (i > 0) jsonStr = '{' + jsonStr;
              if (i < jsonObjects.length - 1) jsonStr = jsonStr + '}';
              if (jsonStr) {
                const parsed = JSON.parse(jsonStr);
                if (parsed.reasoning_content) {
                  extracted.push(parsed.reasoning_content);
                }
              }
            }
          } else {
            // 单个JSON对象
            const parsed = JSON.parse(cleaned);
            if (parsed.reasoning_content) {
              extracted.push(parsed.reasoning_content);
            }
          }
        }
      } catch {
        // 非JSON格式，直接添加
        extracted.push(chunk);
      }
    }

    return extracted.join('');
  }
}
