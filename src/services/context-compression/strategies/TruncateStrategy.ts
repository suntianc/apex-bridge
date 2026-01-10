/**
 * TruncateStrategy - 截断压缩策略
 *
 * 从消息列表的开头截断，保留最新的消息
 */

import { Message } from "../../../types";
import { TokenEstimator } from "../TokenEstimator";
import {
  IContextCompressionStrategy,
  CompressionResult,
  CompressionStrategyConfig,
} from "./IContextCompressionStrategy";

/**
 * 截断策略配置
 */
export interface TruncateStrategyConfig extends CompressionStrategyConfig {
  /** 截断方向：'head' 从开头截断，'tail' 从结尾截断 */
  direction?: "head" | "tail";
}

/**
 * 截断压缩策略
 *
 * 策略说明：
 * - 从头部截断消息，保留最新的消息
 * - 适用于大多数场景，简单可靠
 * - 保留对话的连续性
 */
export class TruncateStrategy implements IContextCompressionStrategy {
  /**
   * 默认配置
   */
  private readonly defaultConfig: Required<TruncateStrategyConfig> = {
    maxTokens: 8000,
    preserveSystemMessage: true,
    minMessageCount: 1,
    direction: "head",
  };

  getName(): string {
    return "truncate";
  }

  async compress(
    messages: Message[],
    config: CompressionStrategyConfig
  ): Promise<CompressionResult> {
    const finalConfig = { ...this.defaultConfig, ...config } as Required<TruncateStrategyConfig>;

    // 原始 Token 计数
    const originalTokens = TokenEstimator.countMessages(messages);

    if (messages.length === 0) {
      return {
        messages: [],
        originalTokens: 0,
        compactedTokens: 0,
        removedCount: 0,
        hasSummary: false,
      };
    }

    // 如果未超限，直接返回
    if (originalTokens <= finalConfig.maxTokens) {
      return {
        messages: [...messages],
        originalTokens,
        compactedTokens: originalTokens,
        removedCount: 0,
        hasSummary: false,
      };
    }

    // 分离系统消息
    let systemMessages: Message[] = [];
    let otherMessages: Message[] = [];

    if (finalConfig.preserveSystemMessage) {
      const systemIndex = messages.findIndex((m) => m.role === "system");
      if (systemIndex >= 0) {
        systemMessages = [messages[systemIndex]];
        otherMessages = messages.filter((_, i) => i !== systemIndex);
      } else {
        otherMessages = [...messages];
      }
    } else {
      otherMessages = [...messages];
    }

    // 截断其他消息
    let truncatedMessages: Message[];
    let removedCount = 0;

    if (finalConfig.direction === "tail") {
      // 从尾部截断（保留开头的消息）
      const result = TokenEstimator.keepRecentMessages(otherMessages, finalConfig.maxTokens);
      truncatedMessages = result.messages;
      removedCount = result.removedIds.length;
    } else {
      // 从头部截断（保留最新的消息）- 默认行为
      const keptResult = TokenEstimator.keepRecentMessages(otherMessages, finalConfig.maxTokens);
      truncatedMessages = keptResult.messages;
      removedCount = keptResult.removedIds.length;
    }

    // 确保至少保留最小消息数
    const totalMessages = systemMessages.length + truncatedMessages.length;
    if (totalMessages < finalConfig.minMessageCount && otherMessages.length > totalMessages) {
      // 需要保留更多消息
      const additionalNeeded = finalConfig.minMessageCount - totalMessages;
      const availableMessages = otherMessages.filter((msg) => !truncatedMessages.includes(msg));

      const toAdd = availableMessages.slice(-additionalNeeded);
      truncatedMessages = [...toAdd, ...truncatedMessages];
      removedCount = Math.max(0, removedCount - toAdd.length);
    }

    // 组合消息
    const finalMessages = finalConfig.preserveSystemMessage
      ? [...systemMessages, ...truncatedMessages]
      : truncatedMessages;

    // 计算压缩后的 Token 数
    const compactedTokens = TokenEstimator.countMessages(finalMessages);

    return {
      messages: finalMessages,
      originalTokens,
      compactedTokens,
      removedCount,
      hasSummary: false,
    };
  }

  needsCompression(messages: Message[], maxTokens: number): boolean {
    const currentTokens = TokenEstimator.countMessages(messages);
    return currentTokens > maxTokens;
  }
}
