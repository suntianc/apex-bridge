/**
 * TokenEstimator - Token 估算工具
 *
 * 提供消息和文本的 Token 数量估算功能
 *
 * 估算规则：
 * - 平均 4 个字符 ≈ 1 Token（适用于英文）
 * - 中文约 1-2 字符/Token
 * - 消息角色标记额外 +4 Tokens
 */

import { Message, ContentPart } from "../../types";

/**
 * Token 估算结果
 */
export interface TokenEstimationResult {
  /** 估算的 Token 数量 */
  tokens: number;
  /** 字符数量 */
  characters: number;
  /** 消息角色（如果是消息估算） */
  role?: string;
}

/**
 * 消息保留结果
 */
export interface KeepRecentResult {
  /** 保留的消息列表 */
  messages: Message[];
  /** 原始 Token 数 */
  originalTokens: number;
  /** 压缩后 Token 数 */
  compactedTokens: number;
  /** 被移除的消息 ID 列表 */
  removedIds: string[];
}

/**
 * Token 估算器
 */
export class TokenEstimator {
  /**
   * 默认字符/Toke 比率
   * 参考: OpenAI 估算方式，平均 4 字符/token
   */
  private static readonly CHARS_PER_TOKEN = 4;

  /**
   * 角色标记的开销（Tokens）
   * 格式: "<|im_start|>{role}<|im_end|>\n"
   */
  private static readonly ROLE_TOKEN_OVERHEAD = 4;

  /**
   * 估算文本的 Token 数量
   *
   * @param text 输入文本
   * @returns 估算结果
   */
  static estimateText(text: string): TokenEstimationResult {
    if (!text || typeof text !== "string") {
      return { tokens: 0, characters: 0 };
    }

    const characters = text.length;
    const tokens = this.calculateTokens(characters);

    return { tokens, characters };
  }

  /**
   * 估算 ContentPart 的 Token 数量
   *
   * @param part ContentPart
   * @returns 估算结果
   */
  static estimateContentPart(part: ContentPart): TokenEstimationResult {
    if (part.type === "text" && part.text) {
      return this.estimateText(part.text);
    }

    if (part.type === "image_url") {
      // 图片 URL 估算
      const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url || "";
      const characters = url.length;
      const tokens = Math.ceil(characters / this.CHARS_PER_TOKEN) + 10; // +10 考虑 JSON 开销

      return { tokens, characters };
    }

    return { tokens: 0, characters: 0 };
  }

  /**
   * 估算单条消息的 Token 数量
   *
   * @param message Message 对象
   * @returns 估算结果
   */
  static estimateMessage(message: Message): TokenEstimationResult {
    if (!message) {
      return { tokens: 0, characters: 0, role: undefined };
    }

    let totalTokens = this.ROLE_TOKEN_OVERHEAD; // 角色标记开销
    let totalCharacters = 0;

    if (typeof message.content === "string") {
      // 纯文本消息
      const result = this.estimateText(message.content);
      totalTokens += result.tokens;
      totalCharacters += result.characters;
    } else if (Array.isArray(message.content)) {
      // 多模态消息（包含文本和图片）
      for (const part of message.content) {
        const result = this.estimateContentPart(part);
        totalTokens += result.tokens;
        totalCharacters += result.characters;
      }
    }

    return {
      tokens: totalTokens,
      characters: totalCharacters,
      role: message.role,
    };
  }

  /**
   * 估算多条消息的 Token 数量
   *
   * @param messages Message 数组
   * @returns 总 Token 数
   */
  static countMessages(messages: Message[]): number {
    if (!messages || messages.length === 0) {
      return 0;
    }

    return messages.reduce((sum, msg) => {
      const result = this.estimateMessage(msg);
      return sum + result.tokens;
    }, 0);
  }

  /**
   * 保留最近的 N 条消息（在 Token 限制内）
   *
   * 从后向前遍历，保留最新的消息，直到 Token 达到限制
   *
   * @param messages 消息列表
   * @param maxTokens 最大 Token 数
   * @returns 保留结果
   */
  static keepRecentMessages(messages: Message[], maxTokens: number): KeepRecentResult {
    if (!messages || messages.length === 0) {
      return {
        messages: [],
        originalTokens: 0,
        compactedTokens: 0,
        removedIds: [],
      };
    }

    const originalTokens = this.countMessages(messages);
    const kept: Message[] = [];
    const removedIds: string[] = [];

    // 从后向前遍历，保留最新的消息
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = this.estimateMessage(msg).tokens;
      const currentTokens = this.countMessages(kept);

      if (currentTokens + msgTokens <= maxTokens) {
        // 可以保留，将消息插入到开头
        kept.unshift(msg);
      } else {
        // 不能保留，记录被移除的消息 ID
        const msgId = (msg as any).id || `msg_${i}`;
        removedIds.push(msgId);
      }
    }

    return {
      messages: kept,
      originalTokens,
      compactedTokens: this.countMessages(kept),
      removedIds,
    };
  }

  /**
   * 估算对话历史的 Token 使用情况
   *
   * @param messages 消息列表
   * @param systemPrompt 系统提示词
   * @returns 总 Token 数
   */
  static countConversation(messages: Message[], systemPrompt?: string): number {
    let total = this.countMessages(messages);

    if (systemPrompt) {
      total += this.estimateText(systemPrompt).tokens;
    }

    return total;
  }

  /**
   * 计算字符对应的 Token 数量
   *
   * @param characters 字符数
   * @returns Token 数
   */
  private static calculateTokens(characters: number): number {
    if (characters <= 0) {
      return 0;
    }
    // 使用 ceil 确保不会低估 Token 数量
    return Math.ceil(characters / this.CHARS_PER_TOKEN);
  }

  /**
   * 估算压缩后可以节省的 Token 数量
   *
   * @param originalMessages 原始消息
   * @param maxTokens 最大 Token 数
   * @returns 可节省的 Token 数量估算
   */
  static estimateSavings(originalMessages: Message[], maxTokens: number): number {
    const original = this.countMessages(originalMessages);

    if (original <= maxTokens) {
      return 0;
    }

    return original - maxTokens;
  }

  /**
   * 计算消息是否可以容纳在限制内
   *
   * @param message 单条消息
   * @param maxTokens 最大 Token 数
   * @returns 是否可以容纳
   */
  static canFitMessage(message: Message, maxTokens: number): boolean {
    const tokens = this.estimateMessage(message).tokens;
    return tokens <= maxTokens;
  }

  /**
   * 估算需要保留多少条消息才能在限制内
   *
   * @param messages 消息列表
   * @param maxTokens 最大 Token 数
   * @returns 需要保留的消息数量
   */
  static countNeededMessages(messages: Message[], maxTokens: number): number {
    const result = this.keepRecentMessages(messages, maxTokens);
    return result.messages.length;
  }
}
