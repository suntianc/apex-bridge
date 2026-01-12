/**
 * 自适应触发配置
 *
 * P2: 自适应触发策略配置
 * 用于智能判断何时触发上下文压缩
 */

export interface AdaptiveTriggerConfig {
  /** Token 百分比阈值，触发压缩的 token 比例 (默认 0.7 = 70%) */
  tokenThresholdRatio: number;

  /** 消息数阈值，触发压缩的消息数 (默认 50) */
  messageCountThreshold: number;

  /** 预估增长阈值，预估下轮触发比例 (默认 0.85 = 85%) */
  growthRateThreshold: number;

  /** 严重溢出历史累积，严重溢出多少次后强制压缩 (默认 2) */
  severeOverflowHistoryThreshold: number;
}

export const DEFAULT_ADAPTIVE_TRIGGER_CONFIG: Required<AdaptiveTriggerConfig> = {
  tokenThresholdRatio: 0.7,
  messageCountThreshold: 50,
  growthRateThreshold: 0.85,
  severeOverflowHistoryThreshold: 2,
};
