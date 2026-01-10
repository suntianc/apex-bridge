/**
 * PruneStrategy - 修剪压缩策略
 *
 * 移除相似/重复内容的短消息，合并连续的用户短消息，保留信息密度高的消息
 */

import { Message } from "../../../types";
import { TokenEstimator } from "../TokenEstimator";
import {
  IContextCompressionStrategy,
  CompressionResult,
  CompressionStrategyConfig,
} from "./IContextCompressionStrategy";

/**
 * 修剪策略配置
 */
export interface PruneStrategyConfig extends CompressionStrategyConfig {
  /** 相似度阈值（0-1），低于此值认为是相似消息 */
  similarityThreshold?: number;
  /** 短消息长度阈值（字符数），低于此值认为是短消息 */
  shortMessageThreshold?: number;
  /** 是否合并连续的用户短消息 */
  mergeConsecutiveUserMessages?: boolean;
}

/**
 * 消息相似度信息
 */
interface MessageSimilarityInfo {
  index: number;
  message: Message;
  tokens: number;
  isShort: boolean;
  contentLength: number;
  shouldRemove: boolean;
  removalReason?: string;
}

/**
 * 修剪压缩策略
 *
 * 策略说明：
 * - 移除与前一条消息高度相似的内容
 * - 合并连续的用户短消息
 * - 保留信息密度高的消息
 * - 适用于保留关键信息的场景
 */
export class PruneStrategy implements IContextCompressionStrategy {
  /**
   * 默认配置
   */
  private readonly defaultConfig: Required<PruneStrategyConfig> = {
    maxTokens: 8000,
    preserveSystemMessage: true,
    minMessageCount: 1,
    similarityThreshold: 0.7,
    shortMessageThreshold: 50,
    mergeConsecutiveUserMessages: true,
  };

  getName(): string {
    return "prune";
  }

  async compress(
    messages: Message[],
    config: CompressionStrategyConfig
  ): Promise<CompressionResult> {
    const finalConfig = { ...this.defaultConfig, ...config } as Required<PruneStrategyConfig>;

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
        otherMessages = messages.filter((_, i) => i !== systemIndex);
      } else {
        otherMessages = [...messages];
      }
    } else {
      otherMessages = [...messages];
    }

    const prunedMessages = this.pruneMessages(otherMessages, finalConfig);
    let removedCount = otherMessages.length - prunedMessages.length;

    const totalMessages = systemMessages.length + prunedMessages.length;
    if (totalMessages < finalConfig.minMessageCount && otherMessages.length > totalMessages) {
      const additionalNeeded = finalConfig.minMessageCount - totalMessages;
      const availableMessages = otherMessages.filter((msg) => !prunedMessages.includes(msg));
      const toAdd = availableMessages.slice(-additionalNeeded);
      prunedMessages.unshift(...toAdd);
      removedCount = Math.max(0, removedCount - toAdd.length);
    }

    const finalMessages = finalConfig.preserveSystemMessage
      ? [...systemMessages, ...prunedMessages]
      : prunedMessages;

    const compactedTokens = TokenEstimator.countMessages(finalMessages);

    return {
      messages: finalMessages,
      originalTokens,
      compactedTokens,
      removedCount,
      hasSummary: false,
    };
  }

  /**
   * 修剪消息列表
   */
  private pruneMessages(messages: Message[], config: Required<PruneStrategyConfig>): Message[] {
    if (messages.length === 0) {
      return [];
    }

    const messagesWithInfo = this.analyzeMessages(messages, config);
    const result: Message[] = [];
    let consecutiveUserShortMessages: Message[] = [];

    for (let i = 0; i < messagesWithInfo.length; i++) {
      const current = messagesWithInfo[i];
      const previous = i > 0 ? messagesWithInfo[i - 1] : null;

      if (current.shouldRemove) {
        continue;
      }

      if (config.mergeConsecutiveUserMessages) {
        if (current.message.role === "user" && current.isShort) {
          consecutiveUserShortMessages.push(current.message);

          const nextMsg = i + 1 < messagesWithInfo.length ? messagesWithInfo[i + 1] : null;
          const isEndOfUserShortMessages =
            !nextMsg || nextMsg.message.role !== "user" || !nextMsg.isShort;

          if (isEndOfUserShortMessages && consecutiveUserShortMessages.length > 1) {
            const merged = this.mergeUserMessages(consecutiveUserShortMessages);
            if (merged) {
              result.push(merged);
            }
            consecutiveUserShortMessages = [];
          }
          continue;
        } else if (consecutiveUserShortMessages.length > 0) {
          const merged = this.mergeUserMessages(consecutiveUserShortMessages);
          if (merged) {
            result.push(merged);
          }
          consecutiveUserShortMessages = [];
        }
      }

      if (previous && !previous.shouldRemove && previous.message.role !== "system") {
        if (this.shouldRemoveSimilar(current, previous, config)) {
          continue;
        }
      }

      result.push(current.message);
    }

    if (consecutiveUserShortMessages.length > 0) {
      const merged = this.mergeUserMessages(consecutiveUserShortMessages);
      if (merged) {
        result.push(merged);
      }
    }

    return result;
  }

  /**
   * 分析消息信息
   */
  private analyzeMessages(
    messages: Message[],
    config: Required<PruneStrategyConfig>
  ): MessageSimilarityInfo[] {
    return messages.map((msg, index) => {
      const tokens = TokenEstimator.estimateMessage(msg).tokens;
      const contentLength = this.getMessageContentLength(msg);
      const isShort = contentLength < config.shortMessageThreshold;

      let shouldRemove = false;
      let removalReason: string | undefined;

      if (msg.role === "system") {
        shouldRemove = false;
      } else if (isShort && tokens < 10) {
        shouldRemove = true;
        removalReason = "very_short";
      }

      return {
        index,
        message: msg,
        tokens,
        isShort,
        contentLength,
        shouldRemove,
        removalReason,
      };
    });
  }

  /**
   * 获取消息内容长度
   */
  private getMessageContentLength(message: Message): number {
    if (typeof message.content === "string") {
      return message.content.length;
    }
    if (Array.isArray(message.content)) {
      return message.content.reduce((sum, part) => {
        if (part.type === "text" && part.text) {
          return sum + part.text.length;
        }
        return sum;
      }, 0);
    }
    return 0;
  }

  /**
   * 判断是否应该移除相似消息
   */
  private shouldRemoveSimilar(
    current: MessageSimilarityInfo,
    previous: MessageSimilarityInfo,
    config: Required<PruneStrategyConfig>
  ): boolean {
    if (current.message.role === previous.message.role) {
      return false;
    }

    if (current.isShort && previous.isShort) {
      const similarity = this.calculateSimilarity(current.contentLength, previous.contentLength);
      if (similarity > config.similarityThreshold) {
        return true;
      }
    }

    if (current.isShort && current.tokens < 20 && previous.tokens > current.tokens * 3) {
      return true;
    }

    return false;
  }

  /**
   * 计算内容相似度（基于长度的简化相似度计算）
   */
  private calculateSimilarity(len1: number, len2: number): number {
    if (len1 === 0 && len2 === 0) {
      return 1;
    }
    const maxLen = Math.max(len1, len2);
    const minLen = Math.min(len1, len2);
    return minLen / maxLen;
  }

  /**
   * 合并用户短消息
   */
  private mergeUserMessages(messages: Message[]): Message | null {
    if (messages.length === 0) {
      return null;
    }

    const combinedContent = messages
      .map((msg) => {
        const content = typeof msg.content === "string" ? msg.content : "";
        return content.trim();
      })
      .filter((c) => c.length > 0)
      .join("\n---\n");

    if (combinedContent.length === 0) {
      return null;
    }

    return {
      role: "user",
      content: combinedContent,
    };
  }

  needsCompression(messages: Message[], maxTokens: number): boolean {
    const currentTokens = TokenEstimator.countMessages(messages);
    return currentTokens > maxTokens;
  }
}
