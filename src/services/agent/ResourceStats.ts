/**
 * ResourceStats - 资源统计服务
 *
 * 提供资源使用统计、性能指标收集和监控功能
 */

import { logger } from "../../utils/logger";

/**
 * 资源统计接口
 */
export interface ResourceStats {
  provider: string;
  model: string;
  totalResources: number;
  availableResources: number;
  inUseResources: number;
  queuedRequests: number;
  averageWaitTime: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
}

/**
 * 资源指标接口
 */
export interface ResourceMetrics {
  timestamp: Date;
  provider: string;
  model: string;
  concurrentConnections: number;
  requestRate: number;
  errorRate: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  throughput: number;
  availability: number;
}

/**
 * 时间序列数据点
 */
export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
}

/**
 * 性能趋势
 */
export interface PerformanceTrend {
  provider: string;
  model: string;
  period: "1h" | "24h" | "7d" | "30d";
  requestCount: TimeSeriesDataPoint[];
  latencyP50: TimeSeriesDataPoint[];
  latencyP95: TimeSeriesDataPoint[];
  errorRate: TimeSeriesDataPoint[];
  throughput: TimeSeriesDataPoint[];
}

/**
 * 健康状态
 */
export interface HealthStatus {
  provider: string;
  model: string;
  status: "healthy" | "degraded" | "unhealthy";
  score: number;
  issues: string[];
  lastChecked: Date;
}

/**
 * 统计汇总
 */
export interface StatsSummary {
  totalProviders: number;
  totalModels: number;
  totalResources: number;
  totalRequests: number;
  averageLatency: number;
  averageErrorRate: number;
  averageAvailability: number;
  topProviders: { provider: string; requests: number }[];
  recentAlerts: string[];
}

/**
 * 告警规则
 */
export interface AlertRule {
  id: string;
  name: string;
  condition: "error_rate" | "latency" | "availability" | "queue_depth";
  threshold: number;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
  provider?: string;
  model?: string;
}

/**
 * 告警
 */
export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: "info" | "warning" | "critical";
  message: string;
  provider: string;
  model?: string;
  currentValue: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
}

/**
 * 资源统计服务
 */
export class ResourceStatsService {
  private metricsHistory: Map<string, ResourceMetrics[]> = new Map();
  private requestHistory: Map<string, { timestamp: Date; latency: number; success: boolean }[]> =
    new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private readonly metricsRetention = 86400000; // 24小时
  private readonly metricsInterval = 1000;
  private collectionTimer?: NodeJS.Timeout;

  constructor() {
    this.initializeDefaultAlertRules();
    this.startMetricsCollection();
    logger.info("[ResourceStats] Resource statistics service initialized");
  }

  /**
   * 记录请求完成
   */
  public recordRequest(provider: string, model: string, latency: number, success: boolean): void {
    const key = `${provider}:${model}`;
    let history = this.requestHistory.get(key);
    if (!history) {
      history = [];
      this.requestHistory.set(key, history);
    }

    history.push({
      timestamp: new Date(),
      latency,
      success,
    });

    // 限制历史记录数量
    if (history.length > 10000) {
      history.shift();
    }
  }

  /**
   * 记录指标
   */
  public recordMetrics(metrics: ResourceMetrics): void {
    const key = `${metrics.provider}:${metrics.model}`;
    let history = this.metricsHistory.get(key);
    if (!history) {
      history = [];
      this.metricsHistory.set(key, history);
    }

    history.push(metrics);

    // 清理过期指标
    const cutoff = Date.now() - this.metricsRetention;
    while (history.length > 0 && history[0].timestamp.getTime() < cutoff) {
      history.shift();
    }

    // 检查告警规则
    this.checkAlerts(metrics);
  }

  /**
   * 获取资源统计
   */
  public getResourceStats(provider: string, model?: string): ResourceStats {
    if (model) {
      return this.calculateStats(provider, model);
    }

    // 聚合所有模型
    const allStats: ResourceStats[] = [];
    for (const [key] of this.requestHistory.entries()) {
      const [p, m] = key.split(":");
      if (p === provider) {
        allStats.push(this.calculateStats(p, m));
      }
    }

    if (allStats.length === 0) {
      return {
        provider,
        model: "",
        totalResources: 0,
        availableResources: 0,
        inUseResources: 0,
        queuedRequests: 0,
        averageWaitTime: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
      };
    }

    return this.aggregateStats(provider, allStats);
  }

  /**
   * 获取性能趋势
   */
  public getPerformanceTrend(
    provider: string,
    model: string,
    period: "1h" | "24h" | "7d" | "30d" = "24h"
  ): PerformanceTrend {
    const key = `${provider}:${model}`;
    const history = this.requestHistory.get(key) ?? [];
    const now = Date.now();
    let duration: number;

    switch (period) {
      case "1h":
        duration = 3600000;
        break;
      case "24h":
        duration = 86400000;
        break;
      case "7d":
        duration = 604800000;
        break;
      case "30d":
        duration = 2592000000;
        break;
    }

    const cutoff = new Date(now - duration);
    const filtered = history.filter((r) => r.timestamp >= cutoff);

    // 按时间窗口聚合
    const windows = this.createTimeWindows(duration, period);
    const requestCount: TimeSeriesDataPoint[] = [];
    const latencyP50: TimeSeriesDataPoint[] = [];
    const latencyP95: TimeSeriesDataPoint[] = [];
    const errorRate: TimeSeriesDataPoint[] = [];
    const throughput: TimeSeriesDataPoint[] = [];

    for (const window of windows) {
      const windowData = filtered.filter(
        (r) => r.timestamp >= window.start && r.timestamp < window.end
      );

      if (windowData.length === 0) {
        requestCount.push({ timestamp: window.start, value: 0 });
        latencyP50.push({ timestamp: window.start, value: 0 });
        latencyP95.push({ timestamp: window.start, value: 0 });
        errorRate.push({ timestamp: window.start, value: 0 });
        throughput.push({ timestamp: window.start, value: 0 });
        continue;
      }

      const latencies = windowData.map((r) => r.latency).sort((a, b) => a - b);
      const successes = windowData.filter((r) => r.success).length;

      requestCount.push({
        timestamp: window.start,
        value: windowData.length,
      });

      latencyP50.push({
        timestamp: window.start,
        value: this.percentile(latencies, 50),
      });

      latencyP95.push({
        timestamp: window.start,
        value: this.percentile(latencies, 95),
      });

      errorRate.push({
        timestamp: window.start,
        value: ((windowData.length - successes) / windowData.length) * 100,
      });

      throughput.push({
        timestamp: window.start,
        value: windowData.length / (duration / 1000), // 每秒请求数
      });
    }

    return {
      provider,
      model,
      period,
      requestCount,
      latencyP50,
      latencyP95,
      errorRate,
      throughput,
    };
  }

  /**
   * 获取健康状态
   */
  public getHealthStatus(provider: string, model?: string): HealthStatus {
    const stats = this.getResourceStats(provider, model);
    const modelStr = model ?? "all";
    const key = `${provider}:${modelStr}`;

    const history = this.requestHistory.get(key) ?? [];
    const recentHistory = history.filter(
      (r) => Date.now() - r.timestamp.getTime() < 300000 // 最近5分钟
    );

    const issues: string[] = [];
    let score = 100;

    // 计算错误率
    const errorRate =
      recentHistory.length > 0
        ? (recentHistory.filter((r) => !r.success).length / recentHistory.length) * 100
        : 0;

    if (errorRate > 10) {
      issues.push(`High error rate: ${errorRate.toFixed(2)}%`);
      score -= 30;
    } else if (errorRate > 5) {
      issues.push(`Elevated error rate: ${errorRate.toFixed(2)}%`);
      score -= 15;
    }

    // 计算延迟
    const latencies = recentHistory.map((r) => r.latency).sort((a, b) => a - b);
    if (latencies.length > 0) {
      const p95 = this.percentile(latencies, 95);
      if (p95 > 10000) {
        issues.push(`High latency P95: ${p95}ms`);
        score -= 20;
      } else if (p95 > 5000) {
        issues.push(`Elevated latency P95: ${p95}ms`);
        score -= 10;
      }
    }

    // 检查可用资源
    if (model && stats.totalResources > 0) {
      const utilization = (stats.inUseResources / stats.totalResources) * 100;
      if (utilization > 90) {
        issues.push(`High resource utilization: ${utilization.toFixed(1)}%`);
        score -= 15;
      }
    }

    let status: "healthy" | "degraded" | "unhealthy";
    if (score >= 80) {
      status = "healthy";
    } else if (score >= 50) {
      status = "degraded";
    } else {
      status = "unhealthy";
    }

    return {
      provider,
      model: model ?? undefined,
      status,
      score: Math.max(0, score),
      issues,
      lastChecked: new Date(),
    };
  }

  /**
   * 获取统计汇总
   */
  public getStatsSummary(): StatsSummary {
    const providers = new Set<string>();
    const totalRequestsList: number[] = [];
    const avgLatencies: number[] = [];
    const avgErrorRates: number[] = [];
    const availabilities: number[] = [];

    for (const [key] of this.requestHistory.entries()) {
      const [provider] = key.split(":");
      providers.add(provider);

      const history = this.requestHistory.get(key) ?? [];
      if (history.length === 0) {
        continue;
      }

      const successes = history.filter((r) => r.success).length;
      totalRequestsList.push(history.length);
      avgLatencies.push(history.reduce((sum, r) => sum + r.latency, 0) / history.length);
      avgErrorRates.push(((history.length - successes) / history.length) * 100);
      availabilities.push((successes / history.length) * 100);
    }

    // 获取活跃告警
    const recentAlerts: string[] = [];
    for (const alert of this.activeAlerts.values()) {
      if (
        !alert.acknowledged &&
        Date.now() - alert.timestamp.getTime() < 3600000 // 最近1小时
      ) {
        recentAlerts.push(alert.message);
      }
    }

    // 获取前5个提供商
    const providerRequests = new Map<string, number>();
    for (const [key, history] of this.requestHistory.entries()) {
      const [provider] = key.split(":");
      providerRequests.set(provider, (providerRequests.get(provider) ?? 0) + history.length);
    }
    const topProviders = Array.from(providerRequests.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([provider, requests]) => ({ provider, requests }));

    return {
      totalProviders: providers.size,
      totalModels: this.requestHistory.size,
      totalResources: 0, // 需要从外部注入
      totalRequests: totalRequestsList.reduce((a, b) => a + b, 0),
      averageLatency:
        avgLatencies.length > 0 ? avgLatencies.reduce((a, b) => a + b, 0) / avgLatencies.length : 0,
      averageErrorRate:
        avgErrorRates.length > 0
          ? avgErrorRates.reduce((a, b) => a + b, 0) / avgErrorRates.length
          : 0,
      averageAvailability:
        availabilities.length > 0
          ? availabilities.reduce((a, b) => a + b, 0) / availabilities.length
          : 100,
      topProviders,
      recentAlerts: recentAlerts.slice(0, 10),
    };
  }

  /**
   * 添加告警规则
   */
  public addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    logger.info(`[ResourceStats] Added alert rule: ${rule.name}`);
  }

  /**
   * 移除告警规则
   */
  public removeAlertRule(ruleId: string): boolean {
    return this.alertRules.delete(ruleId);
  }

  /**
   * 获取告警规则
   */
  public getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * 获取活跃告警
   */
  public getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * 确认告警
   */
  public acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * 设置资源总数（用于统计）
   */
  public setTotalResources(count: number): void {
    // 可以在外部调用来更新总资源数
  }

  /**
   * 关闭统计服务
   */
  public shutdown(): void {
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
    }
    this.metricsHistory.clear();
    this.requestHistory.clear();
    this.activeAlerts.clear();
    logger.info("[ResourceStats] Resource statistics service shutdown complete");
  }

  /**
   * 初始化默认告警规则
   */
  private initializeDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: "high-error-rate",
        name: "High Error Rate",
        condition: "error_rate",
        threshold: 10,
        severity: "warning",
        enabled: true,
      },
      {
        id: "critical-error-rate",
        name: "Critical Error Rate",
        condition: "error_rate",
        threshold: 20,
        severity: "critical",
        enabled: true,
      },
      {
        id: "high-latency",
        name: "High Latency",
        condition: "latency",
        threshold: 10000,
        severity: "warning",
        enabled: true,
      },
      {
        id: "low-availability",
        name: "Low Availability",
        condition: "availability",
        threshold: 95,
        severity: "warning",
        enabled: true,
      },
      {
        id: "deep-queue",
        name: "Deep Queue",
        condition: "queue_depth",
        threshold: 100,
        severity: "info",
        enabled: true,
      },
    ];

    for (const rule of defaultRules) {
      this.alertRules.set(rule.id, rule);
    }
  }

  /**
   * 启动指标收集
   */
  private startMetricsCollection(): void {
    this.collectionTimer = setInterval(() => {
      this.collectMetrics();
    }, this.metricsInterval);
  }

  /**
   * 收集指标
   */
  private collectMetrics(): void {
    for (const [key, history] of this.requestHistory.entries()) {
      const [provider, model] = key.split(":");
      const recentHistory = history.filter(
        (r) => Date.now() - r.timestamp.getTime() < 60000 // 最近1分钟
      );

      if (recentHistory.length === 0) {
        continue;
      }

      const latencies = recentHistory.map((r) => r.latency).sort((a, b) => a - b);
      const successes = recentHistory.filter((r) => r.success).length;

      const metrics: ResourceMetrics = {
        timestamp: new Date(),
        provider,
        model,
        concurrentConnections: recentHistory.filter((r) => !r.success).length,
        requestRate: recentHistory.length / 60, // 每秒请求数
        errorRate: ((recentHistory.length - successes) / recentHistory.length) * 100,
        latencyP50: this.percentile(latencies, 50),
        latencyP95: this.percentile(latencies, 95),
        latencyP99: this.percentile(latencies, 99),
        throughput: recentHistory.length,
        availability: (successes / recentHistory.length) * 100,
      };

      this.recordMetrics(metrics);
    }
  }

  /**
   * 检查告警
   */
  private checkAlerts(metrics: ResourceMetrics): void {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) {
        continue;
      }

      if (rule.provider && rule.provider !== metrics.provider) {
        continue;
      }

      if (rule.model && rule.model !== metrics.model) {
        continue;
      }

      let triggered = false;
      let currentValue = 0;

      switch (rule.condition) {
        case "error_rate":
          currentValue = metrics.errorRate;
          triggered = currentValue > rule.threshold;
          break;
        case "latency":
          currentValue = metrics.latencyP95;
          triggered = currentValue > rule.threshold;
          break;
        case "availability":
          currentValue = metrics.availability;
          triggered = currentValue < rule.threshold;
          break;
        case "queue_depth":
          currentValue = metrics.throughput;
          triggered = currentValue > rule.threshold;
          break;
      }

      if (triggered) {
        this.createAlert(rule, metrics, currentValue);
      } else {
        this.clearAlert(rule.id, metrics.provider, metrics.model);
      }
    }
  }

  /**
   * 创建告警
   */
  private createAlert(rule: AlertRule, metrics: ResourceMetrics, currentValue: number): void {
    const alertKey = `${rule.id}:${metrics.provider}:${metrics.model ?? "all"}`;

    if (this.activeAlerts.has(alertKey)) {
      return; // 告警已存在
    }

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: `${rule.name}: ${metrics.provider}${metrics.model ? `:${metrics.model}` : ""} - Current: ${currentValue.toFixed(2)}, Threshold: ${rule.threshold}`,
      provider: metrics.provider,
      model: metrics.model,
      currentValue,
      threshold: rule.threshold,
      timestamp: new Date(),
      acknowledged: false,
    };

    this.activeAlerts.set(alertKey, alert);
    logger.warn(`[ResourceStats] Alert triggered: ${alert.message}`);
  }

  /**
   * 清除告警
   */
  private clearAlert(ruleId: string, provider: string, model?: string): void {
    const alertKey = `${ruleId}:${provider}:${model ?? "all"}`;
    this.activeAlerts.delete(alertKey);
  }

  /**
   * 计算统计
   */
  private calculateStats(provider: string, model: string): ResourceStats {
    const key = `${provider}:${model}`;
    const history = this.requestHistory.get(key) ?? [];

    const successful = history.filter((r) => r.success);
    const failed = history.filter((r) => !r.success);

    const latencies = history.map((r) => r.latency).sort((a, b) => a - b);

    return {
      provider,
      model,
      totalResources: 0, // 需要从外部注入
      availableResources: 0, // 需要从外部注入
      inUseResources: successful.length,
      queuedRequests: 0, // 需要从外部注入
      averageWaitTime: 0,
      totalRequests: history.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      averageResponseTime:
        latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    };
  }

  /**
   * 聚合统计
   */
  private aggregateStats(provider: string, stats: ResourceStats[]): ResourceStats {
    const totalRequests = stats.reduce((sum, s) => sum + s.totalRequests, 0);
    const successfulRequests = stats.reduce((sum, s) => sum + s.successfulRequests, 0);
    const failedRequests = stats.reduce((sum, s) => sum + s.failedRequests, 0);

    let avgResponseTime = 0;
    if (stats.length > 0) {
      avgResponseTime =
        stats.reduce((sum, s) => sum + s.averageResponseTime * s.totalRequests, 0) /
        (totalRequests || 1);
    }

    return {
      provider,
      model: "",
      totalResources: stats.reduce((sum, s) => sum + s.totalResources, 0),
      availableResources: stats.reduce((sum, s) => sum + s.availableResources, 0),
      inUseResources: stats.reduce((sum, s) => sum + s.inUseResources, 0),
      queuedRequests: stats.reduce((sum, s) => sum + s.queuedRequests, 0),
      averageWaitTime: 0,
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: avgResponseTime,
    };
  }

  /**
   * 创建时间窗口
   */
  private createTimeWindows(
    duration: number,
    period: "1h" | "24h" | "7d" | "30d"
  ): { start: Date; end: Date }[] {
    const windows: { start: Date; end: Date }[] = [];
    const now = new Date();
    let windowSize: number;

    switch (period) {
      case "1h":
        windowSize = 60000; // 1分钟
        break;
      case "24h":
        windowSize = 3600000; // 1小时
        break;
      case "7d":
        windowSize = 21600000; // 6小时
        break;
      case "30d":
        windowSize = 86400000; // 1天
        break;
    }

    let start = new Date(now.getTime() - duration);
    while (start < now) {
      const end = new Date(start.getTime() + windowSize);
      windows.push({ start, end });
      start = end;
    }

    return windows;
  }

  /**
   * 计算百分位数
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) {
      return 0;
    }

    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
  }
}

export default ResourceStats;
