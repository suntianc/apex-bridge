/**
 * SingleRoundStrategy - 单轮聊天处理策略
 * 处理单次LLM调用，不启用ReAct思考循环
 */

import type { Message, ChatOptions } from '../types';
import type { ChatStrategy, ChatResult } from './ChatStrategy';
import type { LLMManager } from '../core/LLMManager';
import type { VariableResolver } from '../services/VariableResolver';
import type { AceIntegrator } from '../services/AceIntegrator';
import type { ConversationHistoryService } from '../services/ConversationHistoryService';
import { logger } from '../utils/logger';

export class SingleRoundStrategy implements ChatStrategy {
  constructor(
    private llmManager: LLMManager,
    private variableResolver: VariableResolver,
    private aceIntegrator: AceIntegrator,
    private historyService: ConversationHistoryService
  ) {}

  getName(): string {
    return 'SingleRoundStrategy';
  }

  /**
   * 检查是否支持该选项（不支持selfThinking）
   */
  supports(options: ChatOptions): boolean {
    return !options.selfThinking?.enabled;
  }

  /**
   * 执行单轮聊天处理
   */
  async execute(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    logger.debug(`[${this.getName()}] Processing ${messages.length} messages`);

    let processedMessages = messages;

    // 1. 变量替换
    processedMessages = await this.variableResolver.resolve(processedMessages);

    // 2. 消息预处理（移除对插件系统依赖，直接使用变量解析后的消息）
    const preprocessedMessages = processedMessages;

    // 3. 调用LLM
    const llmResponse = await this.llmManager.chat(preprocessedMessages, options);
    const aiContent = llmResponse.choices[0]?.message?.content || '';

    logger.debug(`[${this.getName()}] LLM Response: ${aiContent.substring(0, 200)}...`);

    // 4. 更新会话活动时间和元数据（如果有会话）
    const sessionId = options.sessionId;
    if (sessionId && this.aceIntegrator.isEnabled()) {
      // 异步更新，不阻塞响应
      this.aceIntegrator.updateSessionActivity(sessionId).catch(err => {
        logger.warn(`[${this.getName()}] Failed to update session activity: ${err.message}`);
      });

      // 更新会话元数据（消息计数、Token使用量）
      // 注意：这里需要SessionManager，但为了避免循环依赖，由ChatService调用
      // 此处的updateSessionMetadata调用被移除，由ChatService在调用后处理
    }

    // 5. ACE Integration: 保存轨迹（单轮处理）
    if (sessionId && this.aceIntegrator.isEnabled()) {
      await this.aceIntegrator.saveTrajectory({
        requestId: options.requestId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sessionId: sessionId,
        messages: messages,
        finalContent: aiContent,
        isReAct: false
      });
    }

    // 6. 保存对话消息历史
    const conversationId = options.conversationId as string | undefined;
    if (conversationId) {
      try {
        await this.saveConversationHistory(conversationId, messages, aiContent);
      } catch (err: any) {
        logger.warn(`[${this.getName()}] Failed to save conversation history: ${err.message}`);
      }
    }

    return {
      content: aiContent,
      usage: llmResponse.usage
    };
  }

  /**
   * 保存对话历史
   */
  private async saveConversationHistory(
    conversationId: string,
    messages: Message[],
    aiContent: string
  ): Promise<void> {
    // 检查是否是新对话
    const count = await this.historyService.getMessageCount(conversationId);
    const messagesToSave: Message[] = [];

    if (count === 0) {
      // 新对话：保存所有请求消息（通常包含 System 和 第一条 User）
      // 过滤掉可能存在的 assistant 消息
      messagesToSave.push(...messages.filter(m => m.role !== 'assistant'));
    } else {
      // 已有对话：只保存最后一条消息（通常是新的 User 消息）
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role !== 'assistant') {
        messagesToSave.push(lastMessage);
      }
    }

    // 添加 AI 回复
    messagesToSave.push({
      role: 'assistant',
      content: aiContent
    });

    await this.historyService.saveMessages(conversationId, messagesToSave);
    logger.debug(`[${this.getName()}] Saved ${messagesToSave.length} messages to history`);
  }

  /**
   * 创建流式迭代器（流式版本）
   */
  async *stream(
    messages: Message[],
    options: ChatOptions,
    abortSignal?: AbortSignal
  ): AsyncIterableIterator<string> {
    logger.debug(`[${this.getName()}] Streaming ${messages.length} messages`);

    let processedMessages = messages;

    // 1. 变量替换
    processedMessages = await this.variableResolver.resolve(processedMessages);

    // 2. 流式调用LLM
    const stream = this.llmManager.streamChat(processedMessages, options, abortSignal);

    for await (const chunk of stream) {
      // 检查中断
      if (abortSignal?.aborted) {
        logger.debug(`[${this.getName()}] Stream aborted`);
        return;
      }

      yield chunk;
    }
  }
}
