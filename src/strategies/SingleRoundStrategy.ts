/**
 * SingleRoundStrategy - 单轮聊天处理策略
 * 处理单次LLM调用，不启用ReAct思考循环
 */

import type { Message, ChatOptions } from '../types';
import type { ChatStrategy, ChatResult } from './ChatStrategy';
import type { LLMManager } from '../core/LLMManager';
import type { ConversationHistoryService } from '../services/ConversationHistoryService';
import { logger } from '../utils/logger';

export class SingleRoundStrategy implements ChatStrategy {
  constructor(
    private llmManager: LLMManager,
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
   * 注意：messages 已由 ChatService 完成变量替换
   */
  async execute(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    logger.debug(`[${this.getName()}] Processing ${messages.length} messages`);

    // 调用LLM
    const llmResponse = await this.llmManager.chat(messages, options);
    const aiContent = (llmResponse.choices[0]?.message?.content as string) || '';

    logger.debug(`[${this.getName()}] LLM Response: ${aiContent.substring(0, 200)}...`);

    // ChatService会统一保存历史，策略层只返回数据
    return {
      content: aiContent,
      usage: llmResponse.usage
    };
  }

  /**
   * 创建流式迭代器（流式版本）
   * 注意：messages 已由 ChatService 完成变量替换
   */
  async *stream(
    messages: Message[],
    options: ChatOptions,
    abortSignal?: AbortSignal
  ): AsyncIterableIterator<string> {
    logger.debug(`[${this.getName()}] Streaming ${messages.length} messages`);

    // 流式调用LLM
    const stream = this.llmManager.streamChat(messages, options, abortSignal);

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
