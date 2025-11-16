import {
  SkillsMetricsCollector,
  SkillsExecutionManager,
  SkillsLoader,
  MemoryManager,
  SkillsCache
} from './index';
import logger from '../../utils/logger';
import type {
  ExecutionStats,
  MemoryStats,
  MemoryPressureLevel
} from '../../types';

/**
 * 监控指标
 */
export interface MonitoringMetrics {
  timestamp: number;
  execution: ExecutionStats;
  memory: MemoryStats;
  cache: {
    metadata: { hits: number; misses: number; hitRate: number };
    content: { hits: number; misses: number; hitRate: number };
    resources: { hits: number; misses: number; hitRate: number };
  };
  system: {
    uptime: number;
    cpuUsage?: number;
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
      external: number;
    };
  };
}

/**
 * 健康状态
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  checks: {
    execution: { status: 'ok' | 'warning' | 'error'; message: string };
    memory: { status: 'ok' | 'warning' | 'error'; message: string };
    cache: { status: 'ok' | 'warning' | 'error'; message: string };
    system: { status: 'ok' | 'warning' | 'error'; message: string };
  };
  issues: string[];
}

/**
 * 告警配置
 */
export interface AlertConfig {
  enabled: boolean;
  executionErrorRateThreshold: number; // 错误率阈值 (0-1)
  executionTimeThreshold: number; // 执行时间阈值 (ms)
  memoryPressureThreshold: number; // 内存压力阈值 (0-1)
  cacheHitRateThreshold: number; // 缓存命中率阈值 (0-1)
  alertInterval: number; // 告警间隔 (ms)
}

/**
 * 告警
 */
export interface Alert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: number;
  metric: string;
  value: number;
  threshold: number;
  resolved: boolean;
  resolvedAt?: number;
}

/**
 * 生产环境监控系统
 */
export class ProductionMonitor {
  private readonly executionManager: SkillsExecutionManager;
  private readonly skillsLoader: SkillsLoader;
  private readonly memoryManager: MemoryManager;
  private readonly config: Required<AlertConfig>;

  private monitoringTimer?: NodeJS.Timeout;
  private isMonitoring = false;
  private alerts: Map<string, Alert> = new Map();
  private metricsHistory: MonitoringMetrics[] = [];
  private readonly maxHistorySize = 1000;
  private readonly startTime = Date.now();

  constructor(
    executionManager: SkillsExecutionManager,
    skillsLoader: SkillsLoader,
    memoryManager: MemoryManager,
    config: Partial<AlertConfig> = {}
  ) {
    this.executionManager = executionManager;
    this.skillsLoader = skillsLoader;
    this.memoryManager = memoryManager;

    this.config = {
      enabled: true,
      executionErrorRateThreshold: 0.1, // 10%
      executionTimeThreshold: 500, // 500ms
      memoryPressureThreshold: 0.85, // 85%
      cacheHitRateThreshold: 0.7, // 70%
      alertInterval: 60 * 1000, // 1分钟
      ...config
    };
  }

  /**
   * 开始监控
   */
  start(interval: number = 30 * 1000): void {
    if (this.isMonitoring) {
      logger.warn('[ProductionMonitor] 监控已在运行');
      return;
    }

    this.isMonitoring = true;
    logger.info('[ProductionMonitor] 开始生产环境监控');

    // 立即执行一次
    this.collectMetrics();

    // 定期收集指标
    this.monitoringTimer = setInterval(() => {
      this.collectMetrics();
      this.checkAlerts();
    }, interval);
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    logger.info('[ProductionMonitor] 停止监控');
  }

  /**
   * 收集监控指标
   */
  collectMetrics(): MonitoringMetrics {
    const executionStats = this.executionManager.getExecutionStats();
    const memoryStats = this.memoryManager.getStats();
    const cache = this.skillsLoader.getCache();
    const cacheStats = cache ? cache.getStats() : {
      metadata: { hits: 0, misses: 0, size: 0, capacity: 0 },
      content: { hits: 0, misses: 0, size: 0, capacity: 0 },
      resources: { hits: 0, misses: 0, size: 0, capacity: 0 }
    };

    const metrics: MonitoringMetrics = {
      timestamp: Date.now(),
      execution: executionStats,
      memory: memoryStats.currentStats,
      cache: {
        metadata: {
          hits: cacheStats.metadata.hits,
          misses: cacheStats.metadata.misses,
          hitRate: this.calculateHitRate(cacheStats.metadata.hits, cacheStats.metadata.misses)
        },
        content: {
          hits: cacheStats.content.hits,
          misses: cacheStats.content.misses,
          hitRate: this.calculateHitRate(cacheStats.content.hits, cacheStats.content.misses)
        },
        resources: {
          hits: cacheStats.resources.hits,
          misses: cacheStats.resources.misses,
          hitRate: this.calculateHitRate(cacheStats.resources.hits, cacheStats.resources.misses)
        }
      },
      system: {
        uptime: Date.now() - this.startTime,
        memoryUsage: {
          heapUsed: memoryStats.currentStats.heapUsed,
          heapTotal: memoryStats.currentStats.heapTotal,
          rss: memoryStats.currentStats.rss,
          external: memoryStats.currentStats.external
        }
      }
    };

    // 保存到历史记录
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }

    return metrics;
  }

  /**
   * 触发一次告警评估（用于测试或手动检测）
   */
  evaluateAlerts(): void {
    this.checkAlerts();
  }

  /**
   * 获取当前指标
   */
  getCurrentMetrics(): MonitoringMetrics | undefined {
    return this.metricsHistory.length > 0
      ? this.metricsHistory[this.metricsHistory.length - 1]
      : undefined;
  }

  /**
   * 获取指标历史
   */
  getMetricsHistory(limit: number = 100): MonitoringMetrics[] {
    return this.metricsHistory.slice(-limit);
  }

  /**
   * 检查健康状态
   */
  getHealthStatus(): HealthStatus {
    const metrics = this.getCurrentMetrics();
    if (!metrics) {
      return {
        status: 'unhealthy',
        timestamp: Date.now(),
        checks: {
          execution: { status: 'error', message: '无监控数据' },
          memory: { status: 'error', message: '无监控数据' },
          cache: { status: 'error', message: '无监控数据' },
          system: { status: 'error', message: '无监控数据' }
        },
        issues: ['无监控数据']
      };
    }

    const issues: string[] = [];
    const checks: HealthStatus['checks'] = {
      execution: this.checkExecutionHealth(metrics),
      memory: this.checkMemoryHealth(metrics),
      cache: this.checkCacheHealth(metrics),
      system: this.checkSystemHealth(metrics)
    };

    // 收集问题
    Object.values(checks).forEach(check => {
      if (check.status === 'error') {
        issues.push(check.message);
      }
    });

    // 确定整体状态
    const hasError = Object.values(checks).some(c => c.status === 'error');
    const hasWarning = Object.values(checks).some(c => c.status === 'warning');
    const status: HealthStatus['status'] = hasError ? 'unhealthy' : (hasWarning ? 'degraded' : 'healthy');

    return {
      status,
      timestamp: Date.now(),
      checks,
      issues
    };
  }

  /**
   * 检查告警
   */
  private checkAlerts(): void {
    if (!this.config.enabled) {
      return;
    }

    const metrics = this.getCurrentMetrics();
    if (!metrics) {
      return;
    }

    // 检查执行错误率
    const errorRate = metrics.execution.totalExecutions > 0
      ? metrics.execution.failedExecutions / metrics.execution.totalExecutions
      : 0;

    if (errorRate > this.config.executionErrorRateThreshold) {
      this.triggerAlert('execution-error-rate', 'error', {
        title: '执行错误率过高',
        message: `执行错误率: ${(errorRate * 100).toFixed(2)}%，超过阈值 ${(this.config.executionErrorRateThreshold * 100).toFixed(2)}%`,
        metric: 'execution.errorRate',
        value: errorRate,
        threshold: this.config.executionErrorRateThreshold
      });
    } else {
      this.resolveAlert('execution-error-rate');
    }

    // 检查执行时间
    if (metrics.execution.averageExecutionTime > this.config.executionTimeThreshold) {
      this.triggerAlert('execution-time', 'warning', {
        title: '执行时间过长',
        message: `平均执行时间: ${metrics.execution.averageExecutionTime.toFixed(2)}ms，超过阈值 ${this.config.executionTimeThreshold}ms`,
        metric: 'execution.averageTime',
        value: metrics.execution.averageExecutionTime,
        threshold: this.config.executionTimeThreshold
      });
    } else {
      this.resolveAlert('execution-time');
    }

    // 检查内存压力
    if (metrics.memory.memoryUsagePercent > this.config.memoryPressureThreshold) {
      this.triggerAlert('memory-pressure', 'warning', {
        title: '内存压力过高',
        message: `内存使用率: ${(metrics.memory.memoryUsagePercent * 100).toFixed(2)}%，超过阈值 ${(this.config.memoryPressureThreshold * 100).toFixed(2)}%`,
        metric: 'memory.usagePercent',
        value: metrics.memory.memoryUsagePercent,
        threshold: this.config.memoryPressureThreshold
      });
    } else {
      this.resolveAlert('memory-pressure');
    }

    // 检查缓存命中率
    const overallHitRate = (
      metrics.cache.metadata.hitRate +
      metrics.cache.content.hitRate +
      metrics.cache.resources.hitRate
    ) / 3;

    if (overallHitRate < this.config.cacheHitRateThreshold) {
      this.triggerAlert('cache-hit-rate', 'warning', {
        title: '缓存命中率过低',
        message: `平均缓存命中率: ${(overallHitRate * 100).toFixed(2)}%，低于阈值 ${(this.config.cacheHitRateThreshold * 100).toFixed(2)}%`,
        metric: 'cache.hitRate',
        value: overallHitRate,
        threshold: this.config.cacheHitRateThreshold
      });
    } else {
      this.resolveAlert('cache-hit-rate');
    }
  }

  /**
   * 触发告警
   */
  private triggerAlert(
    id: string,
    level: Alert['level'],
    details: {
      title: string;
      message: string;
      metric: string;
      value: number;
      threshold: number;
    }
  ): void {
    const existingAlert = this.alerts.get(id);
    const now = Date.now();

    // 如果告警已存在且未解决，检查是否需要更新
    if (existingAlert && !existingAlert.resolved) {
      // 如果距离上次告警时间太短，不重复告警
      if (now - existingAlert.timestamp < this.config.alertInterval) {
        return;
      }
      // 更新现有告警
      existingAlert.timestamp = now;
      existingAlert.message = details.message;
      existingAlert.value = details.value;
      return;
    }

    // 创建新告警
    const alert: Alert = {
      id,
      level,
      title: details.title,
      message: details.message,
      timestamp: now,
      metric: details.metric,
      value: details.value,
      threshold: details.threshold,
      resolved: false
    };

    this.alerts.set(id, alert);
    logger.warn(`[ProductionMonitor] 🚨 告警: ${alert.title} - ${alert.message}`);
  }

  /**
   * 解决告警
   */
  private resolveAlert(id: string): void {
    const alert = this.alerts.get(id);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      logger.info(`[ProductionMonitor] ✅ 告警已解决: ${alert.title}`);
    }
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolved);
  }

  /**
   * 获取所有告警
   */
  getAllAlerts(limit: number = 100): Alert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * 检查执行健康
   */
  private checkExecutionHealth(metrics: MonitoringMetrics): { status: 'ok' | 'warning' | 'error'; message: string } {
    const errorRate = metrics.execution.totalExecutions > 0
      ? metrics.execution.failedExecutions / metrics.execution.totalExecutions
      : 0;

    if (errorRate > 0.2) {
      return { status: 'error', message: `执行错误率过高: ${(errorRate * 100).toFixed(2)}%` };
    }
    if (errorRate > 0.1) {
      return { status: 'warning', message: `执行错误率: ${(errorRate * 100).toFixed(2)}%` };
    }
    if (metrics.execution.averageExecutionTime > 500) {
      return { status: 'warning', message: `平均执行时间较长: ${metrics.execution.averageExecutionTime.toFixed(2)}ms` };
    }

    return { status: 'ok', message: '执行正常' };
  }

  /**
   * 检查内存健康
   */
  private checkMemoryHealth(metrics: MonitoringMetrics): { status: 'ok' | 'warning' | 'error'; message: string } {
    const pressure = metrics.memory.memoryUsagePercent;

    if (pressure > 0.95) {
      return { status: 'error', message: `内存使用率严重: ${(pressure * 100).toFixed(2)}%` };
    }
    if (pressure > 0.85) {
      return { status: 'warning', message: `内存使用率较高: ${(pressure * 100).toFixed(2)}%` };
    }

    return { status: 'ok', message: '内存使用正常' };
  }

  /**
   * 检查缓存健康
   */
  private checkCacheHealth(metrics: MonitoringMetrics): { status: 'ok' | 'warning' | 'error'; message: string } {
    const overallHitRate = (
      metrics.cache.metadata.hitRate +
      metrics.cache.content.hitRate +
      metrics.cache.resources.hitRate
    ) / 3;

    if (overallHitRate < 0.5) {
      return { status: 'error', message: `缓存命中率过低: ${(overallHitRate * 100).toFixed(2)}%` };
    }
    if (overallHitRate < 0.7) {
      return { status: 'warning', message: `缓存命中率: ${(overallHitRate * 100).toFixed(2)}%` };
    }

    return { status: 'ok', message: `缓存命中率: ${(overallHitRate * 100).toFixed(2)}%` };
  }

  /**
   * 检查系统健康
   */
  private checkSystemHealth(metrics: MonitoringMetrics): { status: 'ok' | 'warning' | 'error'; message: string } {
    const uptimeHours = metrics.system.uptime / (1000 * 60 * 60);

    if (uptimeHours < 0.1) {
      return { status: 'warning', message: '系统刚启动' };
    }

    return { status: 'ok', message: `系统运行正常，运行时间: ${uptimeHours.toFixed(2)}小时` };
  }

  /**
   * 计算命中率
   */
  private calculateHitRate(hits: number, misses: number): number {
    const total = hits + misses;
    return total > 0 ? hits / total : 0;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AlertConfig>): void {
    Object.assign(this.config, config);
    logger.info('[ProductionMonitor] 配置已更新');
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<Required<AlertConfig>> {
    return { ...this.config };
  }
}

