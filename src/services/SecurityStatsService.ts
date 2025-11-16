/**
 * SecurityStatsService - 安全统计服务
 * 收集和提供安全相关的统计数据
 */

import { RaceDetector } from '../utils/RaceDetector';
import { ConfigService } from './ConfigService';
import { logger } from '../utils/logger';

export interface SecurityStats {
  rateLimit: {
    enabled: boolean;
    provider: 'auto' | 'redis' | 'memory';
    totalRequests: number;
    blockedRequests: number;
    topBlockedRules: Array<{
      ruleId: string;
      ruleName: string;
      blockedCount: number;
    }>;
    topBlockedIdentities: Array<{
      strategy: string;
      value: string;
      blockedCount: number;
    }>;
  };
  raceConditions: {
    totalDetections: number;
    activeResources: number;
    topResources: Array<{
      resourceId: string;
      detectionCount: number;
    }>;
    lastDetection?: {
      resourceId: string;
      operationId: string;
      timestamp: number;
    };
  };
  validation: {
    totalValidated: number;
    totalRejected: number;
    rejectionReasons: Array<{
      reason: string;
      count: number;
    }>;
  };
  securityEvents: {
    suspiciousRequests: number;
    auditLogs: number;
    errors: number;
  };
}

class SecurityStatsCollector {
  private static instance: SecurityStatsCollector;
  
  // 限流统计
  private rateLimitStats = {
    totalRequests: 0,
    blockedRequests: 0,
    ruleBlockedCounts: new Map<string, number>(),
    identityBlockedCounts: new Map<string, number>()
  };

  // 验证统计
  private validationStats = {
    totalValidated: 0,
    totalRejected: 0,
    rejectionReasons: new Map<string, number>()
  };

  // 安全事件统计
  private securityEventStats = {
    suspiciousRequests: 0,
    auditLogs: 0,
    errors: 0
  };

  private constructor() {
    // 定期清理统计数据（每小时）
    setInterval(() => {
      this.resetHourlyStats();
    }, 3600000);
  }

  public static getInstance(): SecurityStatsCollector {
    if (!SecurityStatsCollector.instance) {
      SecurityStatsCollector.instance = new SecurityStatsCollector();
    }
    return SecurityStatsCollector.instance;
  }

  public recordRateLimitRequest(blocked: boolean, ruleId?: string, identity?: string): void {
    this.rateLimitStats.totalRequests++;
    if (blocked) {
      this.rateLimitStats.blockedRequests++;
      if (ruleId) {
        const current = this.rateLimitStats.ruleBlockedCounts.get(ruleId) || 0;
        this.rateLimitStats.ruleBlockedCounts.set(ruleId, current + 1);
      }
      if (identity) {
        const current = this.rateLimitStats.identityBlockedCounts.get(identity) || 0;
        this.rateLimitStats.identityBlockedCounts.set(identity, current + 1);
      }
    }
  }

  public recordValidation(valid: boolean, reason?: string): void {
    this.validationStats.totalValidated++;
    if (!valid) {
      this.validationStats.totalRejected++;
      if (reason) {
        const current = this.validationStats.rejectionReasons.get(reason) || 0;
        this.validationStats.rejectionReasons.set(reason, current + 1);
      }
    }
  }

  public recordSecurityEvent(type: 'suspicious' | 'audit' | 'error'): void {
    switch (type) {
      case 'suspicious':
        this.securityEventStats.suspiciousRequests++;
        break;
      case 'audit':
        this.securityEventStats.auditLogs++;
        break;
      case 'error':
        this.securityEventStats.errors++;
        break;
    }
  }

  public getStats(): SecurityStats {
    const configService = ConfigService.getInstance();
    const config = configService.readConfig();
    const rateLimitConfig = config.security?.rateLimit;
    const raceDetector = RaceDetector.getInstance();
    const raceStats = raceDetector.getStats();

    // 获取限流规则名称映射
    const ruleNameMap = new Map<string, string>();
    if (rateLimitConfig?.rules) {
      rateLimitConfig.rules.forEach(rule => {
        ruleNameMap.set(rule.id, rule.name || rule.id);
      });
    }

    // 构建被阻止规则统计
    const topBlockedRules = Array.from(this.rateLimitStats.ruleBlockedCounts.entries())
      .map(([ruleId, count]) => ({
        ruleId,
        ruleName: ruleNameMap.get(ruleId) || ruleId,
        blockedCount: count
      }))
      .sort((a, b) => b.blockedCount - a.blockedCount)
      .slice(0, 10);

    // 构建被阻止身份统计
    const topBlockedIdentities = Array.from(this.rateLimitStats.identityBlockedCounts.entries())
      .map(([identity, count]) => {
        const [strategy, value] = identity.split(':', 2);
        return {
          strategy: strategy || 'unknown',
          value: value || identity,
          blockedCount: count
        };
      })
      .sort((a, b) => b.blockedCount - a.blockedCount)
      .slice(0, 10);

    // 构建竞态条件资源统计
    const topResources = Array.from(raceStats.resources.entries())
      .map(([resourceId, count]) => ({
        resourceId,
        detectionCount: count
      }))
      .sort((a, b) => b.detectionCount - a.detectionCount)
      .slice(0, 10);

    // 构建验证拒绝原因统计
    const rejectionReasons = Array.from(this.validationStats.rejectionReasons.entries())
      .map(([reason, count]) => ({
        reason,
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      rateLimit: {
        enabled: rateLimitConfig?.enabled !== false,
        provider: rateLimitConfig?.provider === 'redis' || rateLimitConfig?.provider === 'memory'
          ? rateLimitConfig.provider
          : 'auto',
        totalRequests: this.rateLimitStats.totalRequests,
        blockedRequests: this.rateLimitStats.blockedRequests,
        topBlockedRules,
        topBlockedIdentities
      },
      raceConditions: {
        totalDetections: raceStats.totalDetections,
        activeResources: raceStats.resources.size,
        topResources,
        lastDetection: raceStats.lastDetection ? {
          resourceId: raceStats.lastDetection.resourceId,
          operationId: raceStats.lastDetection.operationId,
          timestamp: raceStats.lastDetection.timestamp
        } : undefined
      },
      validation: {
        totalValidated: this.validationStats.totalValidated,
        totalRejected: this.validationStats.totalRejected,
        rejectionReasons
      },
      securityEvents: {
        suspiciousRequests: this.securityEventStats.suspiciousRequests,
        auditLogs: this.securityEventStats.auditLogs,
        errors: this.securityEventStats.errors
      }
    };
  }

  private resetHourlyStats(): void {
    // 保留部分统计数据，只重置计数器
    logger.debug('[SecurityStats] Resetting hourly statistics');
  }

  public resetAllStats(): void {
    this.rateLimitStats = {
      totalRequests: 0,
      blockedRequests: 0,
      ruleBlockedCounts: new Map(),
      identityBlockedCounts: new Map()
    };
    this.validationStats = {
      totalValidated: 0,
      totalRejected: 0,
      rejectionReasons: new Map()
    };
    this.securityEventStats = {
      suspiciousRequests: 0,
      auditLogs: 0,
      errors: 0
    };
    logger.info('[SecurityStats] All statistics reset');
  }
}

export const securityStatsCollector = SecurityStatsCollector.getInstance();

