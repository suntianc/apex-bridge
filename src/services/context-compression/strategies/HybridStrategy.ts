/**
 * HybridStrategy - 混合压缩策略
 *
 * 组合 truncate + prune，先修剪再截断，保留更多上下文信息
 */

import { Message } from "../../../types";
import { TokenEstimator } from "../TokenEstimator";
import {
  IContextCompressionStrategy,
  CompressionResult,
  CompressionStrategyConfig,
} from "./IContextCompressionStrategy";
import { TruncateStrategy } from "./TruncateStrategy";
import { PruneStrategy } from "./PruneStrategy";

/**
 * 混合策略配置
 */
export interface HybridStrategyConfig extends CompressionStrategyConfig {
  /** 是否先修剪再截断（false 则先截断再修剪） */
  pruneFirst?: boolean;
  /** 修剪策略的配置 */
  pruneConfig?: {
    similarityThreshold?: number;
    shortMessageThreshold?: number;
    mergeConsecutiveUserMessages?: boolean;
  };
  /** 截断策略的配置 */
  truncateConfig?: {
    direction?: "head" | "tail";
  };
}

/**
 * 混合压缩策略
 *
 * 策略说明：
 * - 组合 truncate + prune 的优点
 * - 先修剪相似/短消息，再截断超出限制的内容
 * - 保留更多上下文信息
 * - 适用于需要平衡信息保留和 Token 限制的场景
 */
export class HybridStrategy implements IContextCompressionStrategy {
  /**
   * 默认配置
   */
  private readonly defaultConfig: Required<HybridStrategyConfig> = {
    maxTokens: 8000,
    preserveSystemMessage: true,
    minMessageCount: 1,
    pruneFirst: true,
    pruneConfig: {
      similarityThreshold: 0.7,
      shortMessageThreshold: 50,
      mergeConsecutiveUserMessages: true,
    },
    truncateConfig: {
      direction: "head",
    },
  };

  private readonly pruneStrategy: PruneStrategy;
  private readonly truncateStrategy: TruncateStrategy;

  constructor() {
    this.pruneStrategy = new PruneStrategy();
    this.truncateStrategy = new TruncateStrategy();
  }

  getName(): string {
    return "hybrid";
  }

  async compress(
    messages: Message[],
    config: CompressionStrategyConfig
  ): Promise<CompressionResult> {
    const finalConfig = { ...this.defaultConfig, ...config } as Required<HybridStrategyConfig>;

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

    let result: CompressionResult;

    if (finalConfig.pruneFirst) {
      result = await this.pruneThenTruncate(messages, finalConfig);
    } else {
      result = await this.truncateThenPrune(messages, finalConfig);
    }

    return result;
  }

  /**
   * 先修剪再截断
   */
  private async pruneThenTruncate(
    messages: Message[],
    config: Required<HybridStrategyConfig>
  ): Promise<CompressionResult> {
    const originalTokens = TokenEstimator.countMessages(messages);

    const pruneConfig: CompressionStrategyConfig = {
      maxTokens: config.maxTokens,
      preserveSystemMessage: config.preserveSystemMessage,
      minMessageCount: config.minMessageCount,
    };

    const pruneResult = await this.pruneStrategy.compress(messages, pruneConfig);

    if (pruneResult.compactedTokens <= config.maxTokens) {
      return pruneResult;
    }

    const truncateConfig: CompressionStrategyConfig = {
      maxTokens: config.maxTokens,
      preserveSystemMessage: config.preserveSystemMessage,
      minMessageCount: config.minMessageCount,
    };

    const truncateResult = await this.truncateStrategy.compress(
      pruneResult.messages,
      truncateConfig
    );

    return {
      messages: truncateResult.messages,
      originalTokens,
      compactedTokens: truncateResult.compactedTokens,
      removedCount: pruneResult.removedCount + truncateResult.removedCount,
      hasSummary: false,
    };
  }

  /**
   * 先截断再修剪
   */
  private async truncateThenPrune(
    messages: Message[],
    config: Required<HybridStrategyConfig>
  ): Promise<CompressionResult> {
    const originalTokens = TokenEstimator.countMessages(messages);

    const truncateConfig: CompressionStrategyConfig = {
      maxTokens: config.maxTokens,
      preserveSystemMessage: config.preserveSystemMessage,
      minMessageCount: config.minMessageCount,
    };

    const truncateResult = await this.truncateStrategy.compress(messages, truncateConfig);

    const pruneConfig: CompressionStrategyConfig = {
      maxTokens: config.maxTokens,
      preserveSystemMessage: config.preserveSystemMessage,
      minMessageCount: config.minMessageCount,
    };

    const pruneResult = await this.pruneStrategy.compress(truncateResult.messages, pruneConfig);

    return {
      messages: pruneResult.messages,
      originalTokens,
      compactedTokens: pruneResult.compactedTokens,
      removedCount: truncateResult.removedCount + pruneResult.removedCount,
      hasSummary: false,
    };
  }

  needsCompression(messages: Message[], maxTokens: number): boolean {
    const currentTokens = TokenEstimator.countMessages(messages);
    return currentTokens > maxTokens;
  }
}
