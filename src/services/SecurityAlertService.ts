/**
 * SecurityAlertService - 安全告警服务
 * 监控安全事件并触发告警
 */

import { logger } from '../utils/logger';
import { securityStatsCollector, SecurityStats } from './SecurityStatsService';

export interface SecurityAlert {
  id: string;
  type: 'rate_limit' | 'suspicious_request' | 'race_condition' | 'validation_failure' | 'error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, any>;
  timestamp: number;
  acknowledged: boolean;
}

export interface SecurityAlertConfig {
  enabled: boolean;
  thresholds: {
    rateLimitBlockRate?: number; // 限流阻止率阈值（百分比）
    suspiciousRequestCount?: number; // 可疑请求数量阈值（每分钟）
    raceConditionCount?: number; // 竞态条件检测数量阈值（每小时）
    validationFailureRate?: number; // 验证失败率阈值（百分比）
    errorCount?: number; // 错误数量阈值（每分钟）
  };
  alertInterval?: number; // 告警间隔（毫秒），避免重复告警
  notificationChannels?: string[]; // 通知渠道（如：log, email, webhook）
}

const DEFAULT_ALERT_CONFIG: SecurityAlertConfig = {
  enabled: true,
  thresholds: {
    rateLimitBlockRate: 10, // 10% 的请求被阻止
    suspiciousRequestCount: 10, // 每分钟 10 个可疑请求
    raceConditionCount: 5, // 每小时 5 个竞态条件
    validationFailureRate: 5, // 5% 的验证失败
    errorCount: 20 // 每分钟 20 个错误
  },
  alertInterval: 60000, // 1 分钟
  notificationChannels: ['log']
};

class SecurityAlertService {
  private static instance: SecurityAlertService;
  private config: SecurityAlertConfig;
  private alerts: SecurityAlert[] = [];
  private lastAlertTimes: Map<string, number> = new Map();
  private alertListeners: Array<(alert: SecurityAlert) => void> = [];

  private constructor(config?: Partial<SecurityAlertConfig>) {
    this.config = {
      ...DEFAULT_ALERT_CONFIG,
      ...config
    };

    // 定期检查安全状态
    if (this.config.enabled) {
      setInterval(() => {
        this.checkSecurityStatus();
      }, 30000); // 每30秒检查一次
    }
  }

  public static getInstance(config?: Partial<SecurityAlertConfig>): SecurityAlertService {
    if (!SecurityAlertService.instance) {
      SecurityAlertService.instance = new SecurityAlertService(config);
    }
    return SecurityAlertService.instance;
  }

  public updateConfig(config: Partial<SecurityAlertConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  public getConfig(): SecurityAlertConfig {
    return { ...this.config };
  }

  public getAlerts(limit: number = 100): SecurityAlert[] {
    return this.alerts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  public acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  public addListener(listener: (alert: SecurityAlert) => void): void {
    this.alertListeners.push(listener);
  }

  public removeListener(listener: (alert: SecurityAlert) => void): void {
    const index = this.alertListeners.indexOf(listener);
    if (index > -1) {
      this.alertListeners.splice(index, 1);
    }
  }

  private checkSecurityStatus(): void {
    if (!this.config.enabled) {
      return;
    }

    try {
      const stats = securityStatsCollector.getStats();
      this.checkRateLimitAlerts(stats);
      this.checkSuspiciousRequestAlerts(stats);
      this.checkRaceConditionAlerts(stats);
      this.checkValidationAlerts(stats);
      this.checkErrorAlerts(stats);
    } catch (error: any) {
      logger.error('[SecurityAlert] Failed to check security status:', error);
    }
  }

  private checkRateLimitAlerts(stats: SecurityStats): void {
    const threshold = this.config.thresholds.rateLimitBlockRate;
    if (!threshold) return;

    const blockRate = stats.rateLimit.totalRequests > 0
      ? (stats.rateLimit.blockedRequests / stats.rateLimit.totalRequests) * 100
      : 0;

    if (blockRate >= threshold) {
      this.triggerAlert({
        type: 'rate_limit',
        severity: blockRate >= 50 ? 'critical' : blockRate >= 25 ? 'high' : 'medium',
        message: `限流阻止率过高: ${blockRate.toFixed(2)}% (阈值: ${threshold}%)`,
        details: {
          blockRate: blockRate.toFixed(2),
          threshold,
          totalRequests: stats.rateLimit.totalRequests,
          blockedRequests: stats.rateLimit.blockedRequests,
          topBlockedRules: stats.rateLimit.topBlockedRules.slice(0, 5)
        }
      });
    }
  }

  private checkSuspiciousRequestAlerts(stats: SecurityStats): void {
    const threshold = this.config.thresholds.suspiciousRequestCount;
    if (!threshold) return;

    // 这里简化处理，实际应该按时间窗口统计
    if (stats.securityEvents.suspiciousRequests >= threshold) {
      this.triggerAlert({
        type: 'suspicious_request',
        severity: stats.securityEvents.suspiciousRequests >= threshold * 3 ? 'critical' : 'high',
        message: `检测到大量可疑请求: ${stats.securityEvents.suspiciousRequests} 个`,
        details: {
          count: stats.securityEvents.suspiciousRequests,
          threshold
        }
      });
    }
  }

  private checkRaceConditionAlerts(stats: SecurityStats): void {
    const threshold = this.config.thresholds.raceConditionCount;
    if (!threshold) return;

    // 这里简化处理，实际应该按时间窗口统计
    if (stats.raceConditions.totalDetections >= threshold) {
      this.triggerAlert({
        type: 'race_condition',
        severity: stats.raceConditions.totalDetections >= threshold * 2 ? 'high' : 'medium',
        message: `检测到竞态条件: ${stats.raceConditions.totalDetections} 次`,
        details: {
          totalDetections: stats.raceConditions.totalDetections,
          activeResources: stats.raceConditions.activeResources,
          topResources: stats.raceConditions.topResources.slice(0, 5),
          lastDetection: stats.raceConditions.lastDetection
        }
      });
    }
  }

  private checkValidationAlerts(stats: SecurityStats): void {
    const threshold = this.config.thresholds.validationFailureRate;
    if (!threshold) return;

    const failureRate = stats.validation.totalValidated > 0
      ? (stats.validation.totalRejected / stats.validation.totalValidated) * 100
      : 0;

    if (failureRate >= threshold) {
      this.triggerAlert({
        type: 'validation_failure',
        severity: failureRate >= 20 ? 'high' : 'medium',
        message: `验证失败率过高: ${failureRate.toFixed(2)}% (阈值: ${threshold}%)`,
        details: {
          failureRate: failureRate.toFixed(2),
          threshold,
          totalValidated: stats.validation.totalValidated,
          totalRejected: stats.validation.totalRejected,
          topReasons: stats.validation.rejectionReasons.slice(0, 5)
        }
      });
    }
  }

  private checkErrorAlerts(stats: SecurityStats): void {
    const threshold = this.config.thresholds.errorCount;
    if (!threshold) return;

    // 这里简化处理，实际应该按时间窗口统计
    if (stats.securityEvents.errors >= threshold) {
      this.triggerAlert({
        type: 'error',
        severity: stats.securityEvents.errors >= threshold * 3 ? 'critical' : 'high',
        message: `检测到大量错误: ${stats.securityEvents.errors} 个`,
        details: {
          count: stats.securityEvents.errors,
          threshold
        }
      });
    }
  }

  private triggerAlert(alertData: {
    type: SecurityAlert['type'];
    severity: SecurityAlert['severity'];
    message: string;
    details: Record<string, any>;
  }): void {
    const alertKey = `${alertData.type}_${alertData.severity}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey) || 0;
    const now = Date.now();

    // 检查告警间隔
    if (now - lastAlertTime < (this.config.alertInterval || 60000)) {
      return; // 在告警间隔内，不重复告警
    }

    const alert: SecurityAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      ...alertData,
      timestamp: now,
      acknowledged: false
    };

    this.alerts.push(alert);
    this.lastAlertTimes.set(alertKey, now);

    // 限制告警历史数量
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }

    // 发送通知
    this.sendNotification(alert);

    // 触发监听器
    this.alertListeners.forEach(listener => {
      try {
        listener(alert);
      } catch (error: any) {
        logger.error('[SecurityAlert] Listener error:', error);
      }
    });
  }

  private sendNotification(alert: SecurityAlert): void {
    const channels = this.config.notificationChannels || ['log'];
    const severityEmoji = {
      low: 'ℹ️',
      medium: '⚠️',
      high: '🚨',
      critical: '🔴'
    }[alert.severity];

    if (channels.includes('log')) {
      const logLevel = alert.severity === 'critical' || alert.severity === 'high' ? 'error' : 'warn';
      logger[logLevel](`${severityEmoji} [SecurityAlert] ${alert.message}`, alert.details);
    }

    // 未来可以添加其他通知渠道：
    // - email
    // - webhook
    // - SMS
    // - Slack/Discord
  }

  public resetStats(): void {
    this.alerts = [];
    this.lastAlertTimes.clear();
  }
}

export const securityAlertService = SecurityAlertService.getInstance();

