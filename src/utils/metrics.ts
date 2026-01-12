/**
 * 性能指标收集工具
 *
 * 提供关键性能指标的收集和记录功能
 */

import { logger } from "./logger";

/**
 * 指标类型
 */
export type MetricType = "counter" | "gauge" | "histogram" | "timer";

/**
 * 指标接口
 */
export interface Metric {
  name: string;
  type: MetricType;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

/**
 * 性能指标收集器
 */
export class MetricsCollector {
  private static instance: MetricsCollector | null = null;
  private metrics: Map<string, Metric[]> = new Map();
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.NODE_ENV === "production";
  }

  /**
   * 获取单例实例
   */
  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * 记录指标
   */
  record(name: string, value: number, type: MetricType, labels?: Record<string, string>): void {
    if (!this.enabled) {
      return;
    }

    const metric: Metric = {
      name,
      type,
      value,
      labels,
      timestamp: Date.now(),
    };

    const key = this.getKey(name, labels);
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    this.metrics.get(key)!.push(metric);

    logger.debug(`[Metrics] Recorded ${name}: ${value}`);
  }

  /**
   * 增加计数器
   */
  increment(name: string, labels?: Record<string, string>): void {
    this.record(name, 1, "counter", labels);
  }

  /**
   * 设置仪表值
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.record(name, value, "gauge", labels);
  }

  /**
   * 记录直方图值
   */
  histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.record(name, value, "histogram", labels);
  }

  /**
   * 记录计时器值（毫秒）
   */
  timer(name: string, duration: number, labels?: Record<string, string>): void {
    this.record(name, duration, "timer", labels);
  }

  /**
   * 获取指标
   */
  getMetrics(name?: string, labels?: Record<string, string>): Metric[] {
    if (name) {
      const key = this.getKey(name, labels);
      return this.metrics.get(key) || [];
    }
    const allMetrics: Metric[] = [];
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics);
    }
    return allMetrics;
  }

  /**
   * 清除所有指标
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * 获取指标键
   */
  private getKey(name: string, labels?: Record<string, string>): string {
    if (!labels) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return `${name}{${labelStr}}`;
  }
}

/**
 * 上下文压缩指标收集器
 */
export class ContextCompressionMetrics {
  private static instance: ContextCompressionMetrics | null = null;
  private compressionCount = 0;
  private successCount = 0;
  private failureCount = 0;
  private totalOriginalTokens = 0;
  private totalCompressedTokens = 0;
  private totalSavings = 0;

  constructor() {
    // 私有构造函数
  }

  static getInstance(): ContextCompressionMetrics {
    if (!ContextCompressionMetrics.instance) {
      ContextCompressionMetrics.instance = new ContextCompressionMetrics();
    }
    return ContextCompressionMetrics.instance;
  }

  /**
   * 记录压缩结果
   */
  recordCompression(success: boolean, originalTokens: number, compressedTokens: number): void {
    this.compressionCount++;
    if (success) {
      this.successCount++;
    } else {
      this.failureCount++;
    }

    this.totalOriginalTokens += originalTokens;
    this.totalCompressedTokens += compressedTokens;
    this.totalSavings += originalTokens - compressedTokens;
  }

  /**
   * 获取压缩统计
   */
  getStats(): {
    total: number;
    success: number;
    failure: number;
    successRate: number;
    avgSavingsRatio: number;
  } {
    const successRate = this.compressionCount > 0 ? this.successCount / this.compressionCount : 0;
    const avgSavingsRatio =
      this.totalOriginalTokens > 0 ? this.totalSavings / this.totalOriginalTokens : 0;

    return {
      total: this.compressionCount,
      success: this.successCount,
      failure: this.failureCount,
      successRate,
      avgSavingsRatio,
    };
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.compressionCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.totalOriginalTokens = 0;
    this.totalCompressedTokens = 0;
    this.totalSavings = 0;
  }
}

/**
 * 工具检索指标收集器
 */
export class ToolRetrievalMetrics {
  private static instance: ToolRetrievalMetrics | null = null;
  private retrievalCount = 0;
  private totalLatency = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor() {
    // 私有构造函数
  }

  static getInstance(): ToolRetrievalMetrics {
    if (!ToolRetrievalMetrics.instance) {
      ToolRetrievalMetrics.instance = new ToolRetrievalMetrics();
    }
    return ToolRetrievalMetrics.instance;
  }

  /**
   * 记录检索
   */
  recordRetrieval(latencyMs: number, cacheHit: boolean): void {
    this.retrievalCount++;
    this.totalLatency += latencyMs;

    if (cacheHit) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
  }

  /**
   * 获取检索统计
   */
  getStats(): {
    total: number;
    avgLatency: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
  } {
    const cacheHitRate = this.retrievalCount > 0 ? this.cacheHits / this.retrievalCount : 0;
    const avgLatency = this.retrievalCount > 0 ? this.totalLatency / this.retrievalCount : 0;

    return {
      total: this.retrievalCount,
      avgLatency,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate,
    };
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.retrievalCount = 0;
    this.totalLatency = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}

/**
 * 导出便捷函数
 */
export const metrics = MetricsCollector.getInstance();
export const compressionMetrics = ContextCompressionMetrics.getInstance();
export const retrievalMetrics = ToolRetrievalMetrics.getInstance();
