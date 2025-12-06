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

    // ✅ ChaService会统一保存历史，策略层只返回数据
    return {
      content: aiContent,
      usage: llmResponse.usage
    };
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
