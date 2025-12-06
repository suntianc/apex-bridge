/**
 * ChatStrategy - 聊天处理策略接口
 * 定义所有聊天处理策略的契约
 */

import type { Message, ChatOptions } from '../types';

/**
 * 策略执行结果接口
 */
export interface ChatResult {
  content: string;
  usage?: any;
  iterations?: number;
  thinkingProcess?: string;
  rawThinkingProcess?: string[];  // 原始思考过程（供ChatService统一存储）
}

/**
 * 聊天处理策略接口
 * 支持同步和异步/流式两种模式
 */
export interface ChatStrategy {
  /**
   * 执行聊天处理
   * @param messages 消息数组
   * @param options 聊天选项
   * @returns 结果（Promise for 单轮，AsyncGenerator for 流式）
   */
  execute(messages: Message[], options: ChatOptions): Promise<ChatResult> | AsyncGenerator<any>;

  /**
   * 流式执行聊天处理
   * @param messages 消息数组
   * @param options 聊天选项
   * @param abortSignal 中断信号
   * @returns 流式结果
   */
  stream(messages: Message[], options: ChatOptions, abortSignal?: AbortSignal): AsyncIterableIterator<any>;

  /**
   * 检查策略是否支持给定的选项
   * @param options 聊天选项
   * @returns true if 支持
   */
  supports(options: ChatOptions): boolean;

  /**
   * 策略名称（用于调试和日志）
   */
  getName(): string;
}
