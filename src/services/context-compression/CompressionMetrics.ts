/**
 * 压缩指标收集
 *
 * P3: 指标收集接口
 * 用于追踪和统计上下文压缩的性能和效果
 */

export interface CompressionMetrics {
  /** 总请求数 */
  totalRequests: number;

  /** 执行压缩的请求数 */
  compressedRequests: number;

  /** 平均节省比例 */
  averageSavingsRatio: number;

  /** 触发原因统计 */
  triggerReasons: Record<string, number>;

  /** 平均延迟 (ms) */
  averageLatency: number;

  /** 策略分布统计 */
  strategyDistribution: Record<string, number>;

  /** 最后更新时间 */
  lastUpdated: Date;
}

export const INITIAL_COMPRESSION_METRICS: CompressionMetrics = {
  totalRequests: 0,
  compressedRequests: 0,
  averageSavingsRatio: 0,
  triggerReasons: {},
  averageLatency: 0,
  strategyDistribution: {},
  lastUpdated: new Date(),
};
