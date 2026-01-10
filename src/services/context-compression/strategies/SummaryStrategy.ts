/**
 * SummaryStrategy - 摘要压缩策略
 *
 * 用 AI 摘要替换旧消息，保留最近 N 条消息原文，旧消息用一句话摘要替代
 */

import { Message } from "../../../types";
import { TokenEstimator } from "../TokenEstimator";
import {
  IContextCompressionStrategy,
  CompressionResult,
  CompressionStrategyConfig,
} from "./IContextCompressionStrategy";

/**
 * 摘要策略配置
 */
export interface SummaryStrategyConfig extends CompressionStrategyConfig {
  /** 保留最近消息的数量（原文） */
  preserveRecent?: number;
  /** 摘要生成器函数 */
  summaryGenerator?: (messages: Message[]) => Promise<string>;
  /** 每个摘要的最大 Token 数 */
  maxSummaryTokens?: number;
}

/**
 * 摘要压缩策略
 *
 * 策略说明：
 * - 保留最近的 N 条消息原文
 * - 旧消息用一句话摘要替代
 * - 适用于需要保留对话历史概要的场景
 * - 需要提供 LLM 生成摘要
 */
export class SummaryStrategy implements IContextCompressionStrategy {
  /**
   * 默认配置
   */
  private readonly defaultConfig: Required<SummaryStrategyConfig> = {
    maxTokens: 8000,
    preserveSystemMessage: true,
    minMessageCount: 1,
    preserveRecent: 5,
    summaryGenerator: async (msgs: Message[]) => {
      return this.defaultSummary(msgs);
    },
    maxSummaryTokens: 200,
  };

  getName(): string {
    return "summary";
  }

  async compress(
    messages: Message[],
    config: CompressionStrategyConfig
  ): Promise<CompressionResult> {
    const finalConfig = { ...this.defaultConfig, ...config } as Required<SummaryStrategyConfig>;

    const originalTokens = TokenEstimator.countMessages(messages);

    if (messages.length === 0) {
      return {
        messages: [],
        originalTokens: 0,
        compactedTokens: 0,
        removedCount: 0,
        hasSummary: true,
      };
    }

    if (originalTokens <= finalConfig.maxTokens) {
      return {
        messages: [...messages],
        originalTokens,
        compactedTokens: originalTokens,
        removedCount: 0,
        hasSummary: false,
      };
    }

    let systemMessages: Message[] = [];
    let otherMessages: Message[] = [];

    if (finalConfig.preserveSystemMessage) {
      const systemIndex = messages.findIndex((m) => m.role === "system");
      if (systemIndex >= 0) {
        systemMessages = [messages[systemIndex]];
        otherMessages = messages.filter((_, idx) => idx !== systemIndex);
      } else {
        otherMessages = [...messages];
      }
    } else {
      otherMessages = [...messages];
    }

    const systemTokens = TokenEstimator.countMessages(systemMessages);
    const availableForRecent = finalConfig.maxTokens - systemTokens;

    if (availableForRecent <= 0) {
      const finalMessages = systemMessages.slice(0, 1);
      const compactedTokens = TokenEstimator.countMessages(finalMessages);
      return {
        messages: finalMessages,
        originalTokens,
        compactedTokens,
        removedCount: messages.length - finalMessages.length,
        hasSummary: true,
      };
    }

    const recentMessages = this.getRecentMessages(otherMessages, availableForRecent);
    const recentCount = recentMessages.length;
    const oldMessages = otherMessages.slice(0, otherMessages.length - recentCount);

    let summaryMessage: Message | null = null;
    let summaryTokens = 0;

    if (oldMessages.length > 0 && finalConfig.summaryGenerator) {
      const summaryText = await finalConfig.summaryGenerator(oldMessages);
      summaryMessage = {
        role: "system",
        content: `[对话历史摘要] ${summaryText}`,
        name: "context_summary",
      };
      summaryTokens = TokenEstimator.estimateMessage(summaryMessage).tokens;

      if (summaryTokens > finalConfig.maxSummaryTokens) {
        const truncatedSummary = this.truncateText(summaryText, finalConfig.maxSummaryTokens * 4);
        summaryMessage = {
          role: "system",
          content: `[对话历史摘要] ${truncatedSummary}`,
          name: "context_summary",
        };
        summaryTokens = TokenEstimator.estimateMessage(summaryMessage).tokens;
      }
    }

    const finalMessages: Message[] = [];
    if (finalConfig.preserveSystemMessage && systemMessages.length > 0) {
      finalMessages.push(systemMessages[0]);
    }
    if (summaryMessage) {
      finalMessages.push(summaryMessage);
    }
    finalMessages.push(...recentMessages);

    const totalMessages = finalMessages.length;
    if (totalMessages < finalConfig.minMessageCount && otherMessages.length > totalMessages) {
      const additionalNeeded = finalConfig.minMessageCount - totalMessages;
      const availableFromOld = oldMessages.slice(-additionalNeeded);
      finalMessages.splice(finalConfig.preserveSystemMessage ? 2 : 1, 0, ...availableFromOld);
    }

    const compactedTokens = TokenEstimator.countMessages(finalMessages);
    const removedCount = oldMessages.length;

    return {
      messages: finalMessages,
      originalTokens,
      compactedTokens,
      removedCount,
      hasSummary: true,
    };
  }

  /**
   * 获取在 Token 限制内的最近消息
   */
  private getRecentMessages(messages: Message[], maxTokens: number): Message[] {
    const result = TokenEstimator.keepRecentMessages(messages, maxTokens);
    return result.messages;
  }

  /**
   * 截断文本
   */
  private truncateText(text: string, maxCharacters: number): string {
    if (text.length <= maxCharacters) {
      return text;
    }
    return text.substring(0, maxCharacters - 3) + "...";
  }

  /**
   * 默认摘要生成（基于消息内容的简单摘要）
   */
  private async defaultSummary(messages: Message[]): Promise<string> {
    if (messages.length === 0) {
      return "无历史对话";
    }

    const userMessages = messages.filter((m) => m.role === "user");
    const assistantMessages = messages.filter((m) => m.role === "assistant");

    const userTopics = userMessages.map((m) => {
      const content = typeof m.content === "string" ? m.content : "";
      return content.substring(0, 50);
    });

    const summaryParts: string[] = [];

    if (userTopics.length > 0) {
      const topicCount = Math.min(3, userTopics.length);
      const topics = userTopics.slice(0, topicCount).join("; ");
      summaryParts.push(`讨论了 ${topicCount} 个主题: ${topics}`);
    }

    if (assistantMessages.length > 0) {
      summaryParts.push(`进行了 ${assistantMessages.length} 轮对话`);
    }

    return summaryParts.join("，") || "有若干对话记录";
  }

  needsCompression(messages: Message[], maxTokens: number): boolean {
    const currentTokens = TokenEstimator.countMessages(messages);
    return currentTokens > maxTokens;
  }
}
