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
   */
  select(options: ChatOptions): ChatStrategy {
    // 遍历所有策略，找到第一个支持的
    for (const strategy of this.strategyMap.values()) {
      if (strategy.supports(options)) {
        logger.debug(`[StrategySelector] Selected strategy: ${strategy.getName()}`);
        return strategy;
      }
    }

    // 默认使用单轮策略
    const defaultStrategy = this.strategyMap.get("SingleRoundStrategy");
    if (!defaultStrategy) {
      throw new Error("No suitable chat strategy found");
    }
    return defaultStrategy;
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
