/**
 * Security Logger Middleware - 安全日志中间件
 * 
 * 记录安全相关事件，包括速率限制违规和可疑请求
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

export interface SecurityLogEvent {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  ip: string;
  userAgent?: string;
  apiKey?: string;
  userId?: string;
  rateLimited?: boolean;
  rateLimitRule?: string;
  rateLimitRemaining?: number;
  rateLimitLimit?: number;
  rateLimitReset?: number;
  error?: string;
  suspicious?: boolean;
  suspiciousReasons?: string[];
}

export interface SecurityLoggerConfig {
  enabled: boolean;
  logLevel?: 'info' | 'warn' | 'error' | 'debug';
  logRateLimitViolations?: boolean;
  logSuspiciousRequests?: boolean;
  suspiciousPatterns?: Array<{
    pattern: RegExp;
    reason: string;
  }>;
  excludePaths?: string[];
}

/**
 * 创建安全日志中间件
 * @param config 安全日志配置
 * @returns Express 中间件
 */
export function createSecurityLoggerMiddleware(config?: Partial<SecurityLoggerConfig>): (req: Request, res: Response, next: NextFunction) => void {
  const defaultConfig: SecurityLoggerConfig = {
    enabled: true,
    logLevel: 'info',
    logRateLimitViolations: true,
    logSuspiciousRequests: true,
    suspiciousPatterns: [
      {
        pattern: /(<script|javascript:|onerror=|onload=)/i,
        reason: 'Potential XSS attempt'
      },
      {
        pattern: /(union|select|insert|update|delete|drop|exec|execute)/i,
        reason: 'Potential SQL injection attempt'
      },
      {
        pattern: /(\.\.\/|\.\.\\|\.\.%2F|\.\.%5C)/i,
        reason: 'Potential path traversal attempt'
      },
      {
        pattern: /(bash|sh|cmd|powershell|python|perl)/i,
        reason: 'Potential command injection attempt'
      }
    ],
    excludePaths: ['/health', '/metrics', '/favicon.ico', '/vite.svg']
  };

  const securityConfig: SecurityLoggerConfig = {
    ...defaultConfig,
    ...config
  };

  // 如果禁用，返回空中间件
  if (!securityConfig.enabled) {
    return (req: Request, res: Response, next: NextFunction) => {
      next();
    };
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // 跳过排除的路径
    if (securityConfig.excludePaths?.some(path => req.path === path || req.path.startsWith(path))) {
      return next();
    }

    const startTime = Date.now();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'];
    const apiKey = req.headers.authorization ? 'present' : undefined;
    const userId = (res.locals.auth as any)?.userId;

    // 检测可疑请求
    const suspiciousReasons: string[] = [];
    if (securityConfig.logSuspiciousRequests && securityConfig.suspiciousPatterns) {
      const requestBody = JSON.stringify(req.body || {});
      const requestQuery = JSON.stringify(req.query || {});
      const requestParams = JSON.stringify(req.params || {});
      const requestPath = req.path;
      const fullRequest = `${requestPath} ${requestBody} ${requestQuery} ${requestParams}`;

      for (const { pattern, reason } of securityConfig.suspiciousPatterns) {
        if (pattern.test(fullRequest)) {
          suspiciousReasons.push(reason);
        }
      }
    }

    // 监听响应完成
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const rateLimited = (res.locals.rateLimited as boolean) || false;
      const rateLimitInfo = res.locals.rateLimit as any;

      // 构建安全日志事件
      const logEvent: SecurityLogEvent = {
        timestamp: Date.now(),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip,
        userAgent,
        apiKey,
        userId,
        rateLimited,
        rateLimitRule: rateLimitInfo?.ruleId,
        rateLimitRemaining: rateLimitInfo?.remaining,
        rateLimitLimit: rateLimitInfo?.limit,
        rateLimitReset: rateLimitInfo?.reset,
        suspicious: suspiciousReasons.length > 0,
        suspiciousReasons: suspiciousReasons.length > 0 ? suspiciousReasons : undefined
      };

      // 记录速率限制违规
      if (securityConfig.logRateLimitViolations && res.statusCode === 429) {
        logger.warn('🚨 Rate limit violation', {
          ip,
          path: req.path,
          method: req.method,
          apiKey: apiKey ? 'present' : 'absent',
          userId,
          ruleId: rateLimitInfo?.ruleId,
          limit: rateLimitInfo?.limit,
          remaining: rateLimitInfo?.remaining,
          reset: rateLimitInfo?.reset
        });
      }

      // 记录可疑请求
      if (securityConfig.logSuspiciousRequests && suspiciousReasons.length > 0) {
        logger.warn('⚠️ Suspicious request detected', {
          ip,
          path: req.path,
          method: req.method,
          userAgent,
          apiKey: apiKey ? 'present' : 'absent',
          userId,
          reasons: suspiciousReasons,
          statusCode: res.statusCode
        });

        // 记录统计
        try {
          const { securityStatsCollector } = require('../../services/SecurityStatsService');
          securityStatsCollector.recordSecurityEvent('suspicious');
        } catch (e) {
          // 忽略统计收集错误
        }
      }

      // 记录错误请求
      if (res.statusCode >= 400 && res.statusCode < 500) {
        logger.warn('⚠️ Client error', {
          ip,
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
          apiKey: apiKey ? 'present' : 'absent',
          userId,
          userAgent
        });
      }

      if (res.statusCode >= 500) {
        logger.error('❌ Server error', {
          ip,
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
          apiKey: apiKey ? 'present' : 'absent',
          userId,
          userAgent
        });

        // 记录统计
        try {
          const { securityStatsCollector } = require('../../services/SecurityStatsService');
          securityStatsCollector.recordSecurityEvent('error');
        } catch (e) {
          // 忽略统计收集错误
        }
      }

      // 根据配置的日志级别记录
      if (securityConfig.logLevel === 'debug') {
        logger.debug('📨 API request', logEvent);
      } else if (securityConfig.logLevel === 'info' && (res.statusCode < 400 || rateLimited)) {
        logger.info('📨 API request', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          ip,
          rateLimited,
          apiKey: apiKey ? 'present' : 'absent'
        });
      }
    });

    next();
  };
}

/**
 * 默认安全日志中间件（使用默认配置）
 */
export const securityLoggerMiddleware = createSecurityLoggerMiddleware();
