/**
 * MetricsService - 监控指标收集服务
 *
 * 收集和暴露应用性能指标，用于监控和告警
 */

import os from "os";
import { EventEmitter } from "events";

interface RequestMetric {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  success: boolean;
}

interface MetricSnapshot {
  timestamp: string;
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    percentage: number;
  };
  requests: {
    total: number;
    successful: number;
    failed: number;
    active: number;
    rate: number;
  };
  errors: {
    total: number;
    rate: number;
    byCode: Record<string, number>;
  };
  latency: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
}

class MetricsService extends EventEmitter {
  private static instance: MetricsService;
  private requestMetrics: RequestMetric[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  private activeRequests = 0;
  private totalRequests = 0;
  private errorCount = 0;
  private startTime = Date.now();
  private maxMetricsSize = 10000;
  private errorByCode: Record<string, number> = {};

  private constructor() {
    super();
    this.startCleanupInterval();
  }

  static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  /**
   * 记录请求指标
   */
  recordRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number
  ): void {
    const success = statusCode >= 200 && statusCode < 400;
    const metric: RequestMetric = {
      timestamp: Date.now(),
      method,
      path,
      statusCode,
      duration,
      success,
    };

    this.requestMetrics.push(metric);
    this.totalRequests++;
    this.activeRequests++;

    if (!success) {
      this.errorCount++;
      const codeStr = statusCode.toString();
      this.errorByCode[codeStr] = (this.errorByCode[codeStr] || 0) + 1;
    }

    // 限制指标数组大小
    if (this.requestMetrics.length > this.maxMetricsSize) {
      this.requestMetrics = this.requestMetrics.slice(-this.maxMetricsSize);
    }
  }

  /**
   * 完成请求（减少活动请求计数）
   */
  completeRequest(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  /**
   * 记录缓存命中
   */
  recordCacheHit(): void {
    this.cacheHits++;
  }

  /**
   * 记录缓存未命中
   */
  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  /**
   * 获取当前指标快照
   */
  getSnapshot(): MetricSnapshot {
    const now = Date.now();
    const uptime = (now - this.startTime) / 1000;

    // 计算最近5分钟的请求指标
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const recentMetrics = this.requestMetrics.filter((m) => m.timestamp > fiveMinutesAgo);

    // 计算请求率（每分钟）
    const requestRate = recentMetrics.length / 5;

    // 计算错误率
    const errorRate = recentMetrics.length > 0 ? this.errorCount / this.totalRequests : 0;

    // 计算延迟百分位
    const latencies = recentMetrics
      .filter((m) => m.duration > 0)
      .map((m) => m.duration)
      .sort((a, b) => a - b);

    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const p50 = this.percentile(latencies, 50);
    const p95 = this.percentile(latencies, 95);
    const p99 = this.percentile(latencies, 99);

    // 内存使用
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const memPercentage = (memUsage.heapUsed / totalMem) * 100;

    // 缓存命中率
    const totalCacheOps = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCacheOps > 0 ? this.cacheHits / totalCacheOps : 0;

    return {
      timestamp: new Date().toISOString(),
      uptime,
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        percentage: memPercentage,
      },
      requests: {
        total: this.totalRequests,
        successful: this.totalRequests - this.errorCount,
        failed: this.errorCount,
        active: this.activeRequests,
        rate: requestRate,
      },
      errors: {
        total: this.errorCount,
        rate: errorRate,
        byCode: { ...this.errorByCode },
      },
      latency: {
        avg: avgLatency,
        p50,
        p95,
        p99,
      },
      cache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate: cacheHitRate,
      },
    };
  }

  /**
   * 计算百分位数
   */
  private percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)] || 0;
  }

  /**
   * 定期清理旧指标
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      this.requestMetrics = this.requestMetrics.filter((m) => m.timestamp > oneHourAgo);
    }, 10 * 60 * 1000); // 每10分钟清理一次
  }

  /**
   * 重置指标（用于测试）
   */
  reset(): void {
    this.requestMetrics = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.activeRequests = 0;
    this.totalRequests = 0;
    this.errorCount = 0;
    this.errorByCode = {};
    this.startTime = Date.now();
  }
}

export const metricsService = MetricsService.getInstance();
export type { RequestMetric, MetricSnapshot };
