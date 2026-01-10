/**
 * 上下文压缩策略接口
 *
 * 定义上下文压缩的通用接口
 */

import { Message } from "../../../types";

/**
 * 压缩结果
 */
export interface CompressionResult {
  /** 压缩后的消息 */
  messages: Message[];
  /** 原始 Token 数 */
  originalTokens: number;
  /** 压缩后 Token 数 */
  compactedTokens: number;
  /** 被移除的消息数 */
  removedCount: number;
  /** 是否有摘要生成 */
  hasSummary: boolean;
}

/**
 * 压缩策略配置
 */
export interface CompressionStrategyConfig {
  /** 最大 Token 数 */
  maxTokens: number;
  /** 是否保留系统消息 */
  preserveSystemMessage?: boolean;
  /** 保留消息的最小数量 */
  minMessageCount?: number;
}

/**
 * 上下文压缩策略接口
 */
export interface IContextCompressionStrategy {
  /**
   * 获取策略名称
   */
  getName(): string;

  /**
   * 执行压缩
   *
   * @param messages 原始消息列表
   * @param config 压缩配置
   * @returns 压缩结果
   */
  compress(messages: Message[], config: CompressionStrategyConfig): Promise<CompressionResult>;

  /**
   * 检查是否需要压缩
   *
   * @param messages 消息列表
   * @param maxTokens 最大 Token 数
   * @returns 是否需要压缩
   */
  needsCompression(messages: Message[], maxTokens: number): boolean;
}
