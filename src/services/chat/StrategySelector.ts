/**
 * StrategySelector - 策略选择器
 * 负责根据聊天选项选择合适的策略
 */

import { ChatOptions } from "../../types";
import { logger } from "../../utils/logger";
import type { ChatStrategy } from "../../strategies/ChatStrategy";

export class StrategySelector {
  private strategyMap: Map<string, ChatStrategy> = new Map();

  constructor(strategies: ChatStrategy[]) {
    for (const strategy of strategies) {
      this.strategyMap.set(strategy.getName(), strategy);
    }
    logger.debug(`[StrategySelector] Initialized with ${this.strategyMap.size} strategies`);
  }

  /**
   * 根据选项选择合适的策略
   * 优先使用 ReActStrategy（深度思考），如果没有则报错
   */
  select(options: ChatOptions): ChatStrategy {
    // 优先使用 ReActStrategy（深度思考模式）
    const reactStrategy = this.strategyMap.get("ReActStrategy");
    if (reactStrategy && reactStrategy.supports(options)) {
      logger.debug(`[StrategySelector] Selected strategy: ${reactStrategy.getName()}`);
      return reactStrategy;
    }

    // 如果 ReActStrategy 不支持，尝试其他策略
    for (const strategy of this.strategyMap.values()) {
      if (strategy.getName() === "ReActStrategy") continue; // 已检查
      if (strategy.supports(options)) {
        logger.debug(`[StrategySelector] Selected strategy: ${strategy.getName()}`);
        return strategy;
      }
    }

    // 没有可用策略，抛出错误（不再回退到单轮策略）
    throw new Error(
      "No suitable chat strategy found. ReActStrategy requires selfThinking.enabled=true"
    );
  }

  /**
   * 获取所有可用策略名称
   */
  getStrategyNames(): string[] {
    return Array.from(this.strategyMap.keys());
  }

  /**
   * 根据名称获取策略
   */
  getStrategy(name: string): ChatStrategy | undefined {
    return this.strategyMap.get(name);
  }

  /**
   * 检查策略是否支持给定选项
   */
  supports(name: string, options: ChatOptions): boolean {
    const strategy = this.strategyMap.get(name);
    return strategy ? strategy.supports(options) : false;
  }
}
