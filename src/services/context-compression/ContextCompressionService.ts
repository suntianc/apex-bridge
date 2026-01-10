/**
 * ContextCompressionService - 上下文压缩服务
 *
 * 提供统一的上下文压缩入口，支持多种压缩策略
 */

import { Message, ChatOptions } from "../../types";
import { TokenEstimator } from "./TokenEstimator";
import {
  IContextCompressionStrategy,
  CompressionResult,
  CompressionStrategyConfig,
} from "./strategies";
import { TruncateStrategy } from "./strategies/TruncateStrategy";
import { PruneStrategy } from "./strategies/PruneStrategy";
import { SummaryStrategy } from "./strategies/SummaryStrategy";
import { HybridStrategy } from "./strategies/HybridStrategy";
import { logger } from "../../utils/logger";

/**
 * 压缩策略类型
 */
export type CompressionStrategyType = "truncate" | "prune" | "summary" | "hybrid";

/**
 * OpenCode压缩决策配置
 *
 * 提供OpenCode风格的智能压缩决策机制：
 * - 缓存/输出考虑
 * - 受保护的修剪（保护工具输出）
 * - 严重溢出时的AI摘要生成
 * - 策略回退机制
 */
export interface OpenCodeCompactionConfig {
  /** 是否启用自动压缩（默认: true） */
  auto?: boolean;
  /** 是否启用受保护修剪（默认: true） */
  prune?: boolean;
  /** 溢出检测阈值（Tokens，默认: 4000） */
  overflowThreshold?: number;
  /** 是否保护关键工具输出（默认: true） */
  protectTools?: boolean;
  /** 严重溢出时是否生成摘要（默认: true） */
  summaryOnSevere?: boolean;
  /** 严重溢出阈值（上下文比例，默认: 0.8） */
  severeThreshold?: number;
}

/**
 * 上下文压缩配置
 */
export interface ContextCompressionConfig {
  /** 是否启用上下文压缩 */
  enabled?: boolean;
  /** 压缩策略 */
  strategy?: CompressionStrategyType;
  /** 模型上下文限制 */
  contextLimit?: number;
  /** 输出保留空间（Tokens） */
  outputReserve?: number;
  /** 是否保留系统消息 */
  preserveSystemMessage?: boolean;
  /** 最小保留消息数 */
  minMessageCount?: number;
  /** OpenCode压缩决策配置 */
  openCodeConfig?: OpenCodeCompactionConfig;
}

/**
 * 压缩统计信息
 */
export interface CompressionStats {
  /** 原始消息数 */
  originalMessageCount: number;
  /** 压缩后消息数 */
  compactedMessageCount: number;
  /** 原始 Token 数 */
  originalTokens: number;
  /** 压缩后 Token 数 */
  compactedTokens: number;
  /** 节省的 Token 数 */
  savedTokens: number;
  /** 节省比例 */
  savingsRatio: number;
  /** 使用的策略 */
  strategy: string;
  /** 是否执行了压缩 */
  wasCompressed: boolean;
  /** OpenCode决策信息 */
  openCodeDecision?: {
    /** 是否检测到溢出 */
    overflowDetected: boolean;
    /** 使用的压缩类型 */
    compactionType: "none" | "prune" | "summary" | "strategy" | "hybrid";
    /** 溢出严重程度 */
    severity: "none" | "warning" | "severe";
    /** 被保护的消息数 */
    protectedCount: number;
    /** 工具输出保护信息 */
    toolProtection?: {
      protectedTools: number;
      protectedOutputs: number;
    };
  };
}

/**
 * 上下文压缩服务
 *
 * 功能：
 * - 提供统一的压缩入口
 * - 管理压缩策略
 * - 记录压缩统计
 */
export class ContextCompressionService {
  /**
   * 策略实例缓存
   */
  private strategyCache: Map<string, IContextCompressionStrategy> = new Map();

  /**
   * OpenCode压缩决策默认配置
   */
  private readonly openCodeDefaultConfig: Required<OpenCodeCompactionConfig> = {
    auto: true,
    prune: true,
    overflowThreshold: 4000,
    protectTools: true,
    summaryOnSevere: true,
    severeThreshold: 0.8,
  };

  /**
   * 默认配置
   */
  private readonly defaultConfig: Required<ContextCompressionConfig> = {
    enabled: true,
    strategy: "truncate",
    contextLimit: 8000,
    outputReserve: 4000,
    preserveSystemMessage: true,
    minMessageCount: 1,
    openCodeConfig: this.openCodeDefaultConfig,
  };

  /**
   * 绝对最小 Token 限制
   * 即使压缩失败也不能超过此限制
   */
  private readonly ABSOLUTE_MIN_TOKENS = 1000;

  constructor() {
    logger.debug("[ContextCompressionService] Initialized");
  }

  /**
   * 压缩消息用于 LLM 调用（OpenCode决策机制版本）
   *
   * 新的压缩决策流程：
   * 1. OpenCode风格的溢出检测（考虑缓存/输出）
   * 2. 受保护的修剪（保护工具输出）
   * 3. 严重溢出时的AI摘要生成
   * 4. 策略回退（使用原有的4种策略）
   *
   * @param messages 原始消息列表
   * @param modelContextLimit 模型上下文限制
   * @param options ChatOptions（包含压缩配置）
   * @returns 压缩结果和统计信息
   */
  async compress(
    messages: Message[],
    modelContextLimit: number,
    options?: ChatOptions
  ): Promise<{ messages: Message[]; stats: CompressionStats }> {
    // 1. 解析配置
    const config = this.parseConfig(options, modelContextLimit);
    const openCodeConfig = config.openCodeConfig;

    // 2. 快速检查：是否需要压缩
    const currentTokens = TokenEstimator.countMessages(messages);
    const usableLimit = config.contextLimit - config.outputReserve;

    if (!config.enabled || currentTokens <= usableLimit) {
      return {
        messages: [...messages],
        stats: this.buildStats(messages, currentTokens, currentTokens, config.strategy, false, {
          overflowDetected: false,
          compactionType: "none",
          severity: "none",
          protectedCount: 0,
        }),
      };
    }

    // 3. OpenCode风格的溢出检测
    const overflowResult = this.isOverflowOpenCode(messages, modelContextLimit, openCodeConfig);

    // 初始化决策信息
    const openCodeDecision = {
      overflowDetected: overflowResult.isOverflow,
      compactionType: "none" as "none" | "prune" | "summary" | "strategy" | "hybrid",
      severity: overflowResult.severity,
      protectedCount: 0,
      toolProtection: {
        protectedTools: 0,
        protectedOutputs: 0,
      },
    };

    let resultMessages: Message[] = [...messages];
    let compactionType: "none" | "prune" | "summary" | "strategy" | "hybrid" = "none";

    try {
      // 4. 受保护的修剪（如果启用）
      if (openCodeConfig.auto && openCodeConfig.prune && overflowResult.isOverflow) {
        const pruneResult = await this.protectedPrune(messages, usableLimit, openCodeConfig);

        if (TokenEstimator.countMessages(pruneResult.messages) <= usableLimit) {
          resultMessages = pruneResult.messages;
          openCodeDecision.protectedCount = pruneResult.protectedCount;
          openCodeDecision.toolProtection = pruneResult.toolProtection;
          compactionType = "prune";

          logger.debug(
            `[ContextCompressionService] Protected prune: removed ${pruneResult.removedCount} messages, protected ${pruneResult.protectedCount} messages`
          );
        }
      }

      // 5. 严重溢出时的AI摘要生成
      if (
        compactionType === "none" &&
        openCodeConfig.auto &&
        openCodeConfig.summaryOnSevere &&
        overflowResult.severity === "severe"
      ) {
        const summaryResult = await this.openCodeSummary(messages, usableLimit, openCodeConfig);

        if (TokenEstimator.countMessages(summaryResult.messages) <= usableLimit) {
          resultMessages = summaryResult.messages;
          compactionType = "summary";

          logger.debug(
            `[ContextCompressionService] OpenCode summary: replaced ${summaryResult.replacedCount} messages with summary (${summaryResult.summaryTokenCount} tokens)`
          );
        }
      }

      // 6. 策略回退（如果OpenCode机制未能解决问题）
      if (compactionType === "none") {
        const strategy = this.getStrategy(config.strategy);
        const compressionConfig: CompressionStrategyConfig = {
          maxTokens: usableLimit,
          preserveSystemMessage: config.preserveSystemMessage,
          minMessageCount: config.minMessageCount,
        };

        const strategyResult = await strategy.compress(resultMessages, compressionConfig);
        resultMessages = strategyResult.messages;
        compactionType = "strategy";

        logger.debug(
          `[ContextCompressionService] Strategy fallback (${config.strategy}): removed ${strategyResult.removedCount} messages`
        );
      }

      openCodeDecision.compactionType = compactionType;
    } catch (error) {
      logger.error(`[ContextCompressionService] Error in OpenCode compression: ${error}`);

      // 回退到标准策略
      const strategy = this.getStrategy(config.strategy);
      const compressionConfig: CompressionStrategyConfig = {
        maxTokens: usableLimit,
        preserveSystemMessage: config.preserveSystemMessage,
        minMessageCount: config.minMessageCount,
      };

      const strategyResult = await strategy.compress(messages, compressionConfig);
      resultMessages = strategyResult.messages;
      compactionType = "strategy";
      openCodeDecision.compactionType = "strategy";
    }

    // 7. 边界兜底：确保不超过绝对最小限制
    const finalMessages = this.applyAbsoluteLimit(resultMessages, this.ABSOLUTE_MIN_TOKENS);

    // 8. 记录日志
    logger.debug(
      `[ContextCompressionService] OpenCode compression completed: ${currentTokens} -> ${TokenEstimator.countMessages(finalMessages)} tokens, ` +
        `compaction type: ${openCodeDecision.compactionType}, severity: ${openCodeDecision.severity}`
    );

    // 9. 构建统计信息
    const finalTokens = TokenEstimator.countMessages(finalMessages);
    const stats = this.buildStats(
      messages,
      currentTokens,
      finalTokens,
      config.strategy,
      true,
      openCodeDecision
    );

    return {
      messages: finalMessages,
      stats,
    };
  }

  /**
   * 检查消息是否需要压缩
   */
  needsCompression(messages: Message[], modelContextLimit: number, options?: ChatOptions): boolean {
    const config = this.parseConfig(options, modelContextLimit);

    if (!config.enabled) {
      return false;
    }

    const strategy = this.getStrategy(config.strategy);
    const usableLimit = config.contextLimit - config.outputReserve;

    return strategy.needsCompression(messages, usableLimit);
  }

  /**
   * 获取可用的压缩策略列表
   */
  getAvailableStrategies(): CompressionStrategyType[] {
    return ["truncate", "prune", "summary", "hybrid"];
  }

  /**
   * OpenCode风格的溢出检测
   *
   * 考虑缓存和输出空间进行溢出检测
   *
   * @param messages 消息列表
   * @param modelContextLimit 模型上下文限制
   * @param openCodeConfig OpenCode配置
   * @returns 溢出检测结果
   */
  isOverflowOpenCode(
    messages: Message[],
    modelContextLimit: number,
    openCodeConfig?: OpenCodeCompactionConfig
  ): {
    isOverflow: boolean;
    currentTokens: number;
    usableLimit: number;
    overflowAmount: number;
    severity: "none" | "warning" | "severe";
    cacheConsideration: number;
  } {
    const config = openCodeConfig ?? this.openCodeDefaultConfig;
    const currentTokens = TokenEstimator.countMessages(messages);
    const usableLimit = modelContextLimit - config.overflowThreshold;
    const overflowAmount = Math.max(0, currentTokens - usableLimit);

    // 计算严重程度
    let severity: "none" | "warning" | "severe" = "none";
    if (overflowAmount > 0) {
      const overflowRatio = overflowAmount / usableLimit;
      if (overflowRatio > config.severeThreshold) {
        severity = "severe";
      } else {
        severity = "warning";
      }
    }

    // 缓存考虑（预留空间用于缓存输出）
    const cacheConsideration = config.overflowThreshold;

    return {
      isOverflow: currentTokens > usableLimit,
      currentTokens,
      usableLimit,
      overflowAmount,
      severity,
      cacheConsideration,
    };
  }

  /**
   * 受保护的修剪
   *
   * 智能移除消息，同时保护工具输出等关键内容
   *
   * @param messages 消息列表
   * @param maxTokens 最大Token数
   * @param openCodeConfig OpenCode配置
   * @returns 修剪结果
   */
  async protectedPrune(
    messages: Message[],
    maxTokens: number,
    openCodeConfig?: OpenCodeCompactionConfig
  ): Promise<{
    messages: Message[];
    removedCount: number;
    protectedCount: number;
    toolProtection: {
      protectedTools: number;
      protectedOutputs: number;
    };
  }> {
    const config = openCodeConfig ?? this.openCodeDefaultConfig;

    if (!config.prune || !config.protectTools) {
      // 如果禁用保护修剪，使用标准的truncate策略
      const result = TokenEstimator.keepRecentMessages(messages, maxTokens);
      return {
        messages: result.messages,
        removedCount: messages.length - result.messages.length,
        protectedCount: 0,
        toolProtection: {
          protectedTools: 0,
          protectedOutputs: 0,
        },
      };
    }

    const currentTokens = TokenEstimator.countMessages(messages);

    if (currentTokens <= maxTokens) {
      return {
        messages: [...messages],
        removedCount: 0,
        protectedCount: 0,
        toolProtection: {
          protectedTools: 0,
          protectedOutputs: 0,
        },
      };
    }

    // 识别并保护工具输出消息
    const protectedMessages: Message[] = [];
    const removableMessages: Message[] = [];
    let protectedTools = 0;
    let protectedOutputs = 0;

    for (const msg of messages) {
      const isToolOutput = this.isToolOutputMessage(msg);
      const isToolCall = this.isToolCallMessage(msg);

      if (isToolOutput || isToolCall) {
        protectedMessages.push(msg);
        if (isToolCall) {
          protectedTools++;
        } else {
          protectedOutputs++;
        }
      } else {
        removableMessages.push(msg);
      }
    }

    // 从后向前遍历可移除消息，保护最新内容
    const keptMessages: Message[] = [...protectedMessages];
    let removedCount = 0;

    for (let i = removableMessages.length - 1; i >= 0; i--) {
      const msg = removableMessages[i];
      const msgTokens = TokenEstimator.estimateMessage(msg).tokens;
      const currentKeptTokens = TokenEstimator.countMessages(keptMessages);

      if (currentKeptTokens + msgTokens <= maxTokens) {
        keptMessages.unshift(msg);
      } else {
        removedCount++;
      }
    }

    // 如果仍然超出限制，截断可移除消息
    const finalMessages = TokenEstimator.keepRecentMessages(keptMessages, maxTokens);
    const finalRemovedCount = removedCount + (keptMessages.length - finalMessages.messages.length);

    return {
      messages: finalMessages.messages,
      removedCount: finalRemovedCount,
      protectedCount: protectedMessages.length,
      toolProtection: {
        protectedTools,
        protectedOutputs,
      },
    };
  }

  /**
   * 生成OpenCode风格的摘要
   *
   * 当发生严重溢出时，使用AI生成摘要替代旧消息
   *
   * @param messages 消息列表
   * @param maxTokens 最大Token数
   * @param openCodeConfig OpenCode配置
   * @returns 摘要结果
   */
  async openCodeSummary(
    messages: Message[],
    maxTokens: number,
    openCodeConfig?: OpenCodeCompactionConfig
  ): Promise<{
    messages: Message[];
    summaryTokenCount: number;
    originalCount: number;
    replacedCount: number;
  }> {
    const config = openCodeConfig ?? this.openCodeDefaultConfig;

    if (!config.summaryOnSevere) {
      // 如果禁用摘要，使用标准策略
      const result = TokenEstimator.keepRecentMessages(messages, maxTokens);
      return {
        messages: result.messages,
        summaryTokenCount: 0,
        originalCount: messages.length,
        replacedCount: 0,
      };
    }

    // 保留系统消息和最近的N条消息
    const systemMessage = messages.find((msg) => msg.role === "system");
    const recentMessages: Message[] = [];
    const oldMessages: Message[] = [];

    // 找到系统消息的位置
    let systemIndex = -1;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === "system" && systemIndex === -1) {
        systemIndex = i;
      }
    }

    // 分离新消息和旧消息
    const keepRecentCount = 5; // 保留最近5条消息
    let recentCount = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      if (recentCount < keepRecentCount) {
        recentMessages.unshift(messages[i]);
        recentCount++;
      } else {
        // 如果是系统消息之前的消息，加入旧消息列表
        if (systemIndex === -1 || i < systemIndex) {
          oldMessages.unshift(messages[i]);
        } else if (systemIndex !== -1 && i === systemIndex) {
          // 系统消息单独处理
        }
      }
    }

    // 生成摘要
    const summaryText = this.generateSummaryText(oldMessages);
    const summaryTokens = TokenEstimator.estimateText(summaryText).tokens;

    // 确保摘要不会超出限制
    const availableTokens =
      maxTokens -
      TokenEstimator.countMessages(recentMessages) -
      (systemMessage ? TokenEstimator.estimateMessage(systemMessage).tokens : 0);

    if (summaryTokens > availableTokens) {
      // 摘要太长，截断它
      const truncatedSummary = this.truncateText(
        summaryText,
        availableTokens * this.openCodeDefaultConfig.severeThreshold
      );
      return {
        messages: systemMessage ? [systemMessage, ...recentMessages] : recentMessages,
        summaryTokenCount: TokenEstimator.estimateText(truncatedSummary).tokens,
        originalCount: messages.length,
        replacedCount: oldMessages.length,
      };
    }

    // 创建摘要消息
    const summaryMessage: Message = {
      role: "assistant",
      content: `[对话历史摘要] ${summaryText}`,
    };

    return {
      messages: systemMessage
        ? [systemMessage, summaryMessage, ...recentMessages]
        : [summaryMessage, ...recentMessages],
      summaryTokenCount: summaryTokens,
      originalCount: messages.length,
      replacedCount: oldMessages.length,
    };
  }

  /**
   * 检测消息是否为工具调用消息
   */
  private isToolCallMessage(message: Message): boolean {
    if (typeof message.content === "string") {
      const content = message.content;
      // 检查常见的工具调用标记
      const toolCallPatterns = [
        /<tool_action\s+type=["']?skill["']?/i,
        /<tool_action\s+type=["']?mcp["']?/i,
        /function\s+call/i,
        /工具调用/i,
      ];

      return toolCallPatterns.some((pattern) => pattern.test(content));
    }
    return false;
  }

  /**
   * 检测消息是否为工具输出消息
   */
  private isToolOutputMessage(message: Message): boolean {
    if (typeof message.content === "string") {
      const content = message.content;
      // 检查常见的工具输出标记
      const toolOutputPatterns = [
        /<tool_action\s+result/i,
        /工具输出/i,
        /执行结果/i,
        /\[工具调用结束\]/i,
        /<observation>/i,
      ];

      return toolOutputPatterns.some((pattern) => pattern.test(content));
    }
    return false;
  }

  /**
   * 生成对话摘要文本
   */
  private generateSummaryText(messages: Message[]): string {
    if (messages.length === 0) {
      return "无早期对话记录";
    }

    // 统计对话信息
    const userMessages = messages.filter((m) => m.role === "user");
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const toolCalls = messages.filter((m) => this.isToolCallMessage(m));

    // 提取用户请求的主要话题
    const topics: string[] = [];
    for (const msg of userMessages.slice(0, 3)) {
      // 提取消息中的关键内容（取前50个字符）
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const truncated = content.substring(0, 50);
      if (truncated) {
        topics.push(truncated);
      }
    }

    return `对话共 ${messages.length} 条消息，其中用户消息 ${userMessages.length} 条，助手消息 ${assistantMessages.length} 条，工具调用 ${toolCalls.length} 次。主要讨论话题：${topics.join("; ")}...`;
  }

  /**
   * 截断文本以适应Token限制
   */
  private truncateText(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4; // 估算：4字符/token
    if (text.length <= maxChars) {
      return text;
    }
    return text.substring(0, maxChars - 3) + "...";
  }

  /**
   * 解析OpenCode配置
   *
   * @param config 原始配置
   * @returns 标准化后的配置
   */
  parseOpenCodeConfig(config?: OpenCodeCompactionConfig): Required<OpenCodeCompactionConfig> {
    return {
      auto: config?.auto ?? this.openCodeDefaultConfig.auto,
      prune: config?.prune ?? this.openCodeDefaultConfig.prune,
      overflowThreshold: config?.overflowThreshold ?? this.openCodeDefaultConfig.overflowThreshold,
      protectTools: config?.protectTools ?? this.openCodeDefaultConfig.protectTools,
      summaryOnSevere: config?.summaryOnSevere ?? this.openCodeDefaultConfig.summaryOnSevere,
      severeThreshold: config?.severeThreshold ?? this.openCodeDefaultConfig.severeThreshold,
    };
  }

  /**
   * 解析配置
   */
  private parseConfig(
    options: ChatOptions | undefined,
    modelContextLimit: number
  ): Required<ContextCompressionConfig> {
    // 从 ChatOptions 中提取压缩配置
    const compressionConfig = options?.contextCompression;

    return {
      enabled: compressionConfig?.enabled ?? this.defaultConfig.enabled,
      strategy:
        (compressionConfig?.strategy as CompressionStrategyType) ?? this.defaultConfig.strategy,
      contextLimit: modelContextLimit,
      outputReserve: compressionConfig?.outputReserve ?? this.defaultConfig.outputReserve,
      preserveSystemMessage:
        compressionConfig?.preserveSystemMessage ?? this.defaultConfig.preserveSystemMessage,
      minMessageCount: compressionConfig?.minMessageCount ?? this.defaultConfig.minMessageCount,
      openCodeConfig: this.parseOpenCodeConfig(compressionConfig?.openCodeConfig),
    };
  }

  /**
   * 获取策略实例（带缓存）
   */
  private getStrategy(type: CompressionStrategyType): IContextCompressionStrategy {
    let strategy = this.strategyCache.get(type);

    if (!strategy) {
      switch (type) {
        case "truncate":
          strategy = new TruncateStrategy();
          break;
        case "prune":
          strategy = new PruneStrategy();
          break;
        case "summary":
          strategy = new SummaryStrategy();
          break;
        case "hybrid":
          strategy = new HybridStrategy();
          break;
        default:
          logger.warn(`[ContextCompressionService] Unknown strategy '${type}', using 'truncate'`);
          strategy = new TruncateStrategy();
      }
      this.strategyCache.set(type, strategy);
    }

    return strategy;
  }

  /**
   * 应用绝对限制兜底
   */
  private applyAbsoluteLimit(messages: Message[], maxTokens: number): Message[] {
    if (maxTokens <= 0) {
      return [];
    }

    const result = TokenEstimator.keepRecentMessages(messages, maxTokens);
    return result.messages;
  }

  /**
   * 构建压缩统计信息
   */
  private buildStats(
    messages: Message[],
    originalTokens: number,
    compactedTokens: number,
    strategy: string,
    wasCompressed: boolean,
    openCodeDecision?: {
      overflowDetected: boolean;
      compactionType: "none" | "prune" | "summary" | "strategy" | "hybrid";
      severity: "none" | "warning" | "severe";
      protectedCount: number;
      toolProtection?: {
        protectedTools: number;
        protectedOutputs: number;
      };
    }
  ): CompressionStats {
    const savedTokens = originalTokens - compactedTokens;
    const savingsRatio = originalTokens > 0 ? savedTokens / originalTokens : 0;

    return {
      originalMessageCount: messages.length,
      compactedMessageCount: messages.length,
      originalTokens,
      compactedTokens,
      savedTokens,
      savingsRatio,
      strategy,
      wasCompressed,
      openCodeDecision,
    };
  }
}

/**
 * 压缩服务单例
 */
let serviceInstance: ContextCompressionService | null = null;

export function getContextCompressionService(): ContextCompressionService {
  if (!serviceInstance) {
    serviceInstance = new ContextCompressionService();
  }
  return serviceInstance;
}
