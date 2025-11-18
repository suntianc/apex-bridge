/**
 * Audit Logger Middleware - 简化审计日志中间件
 *
 * 记录API访问日志
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

export interface AuditLogEvent {
  timestamp: number;
  path: string;
  method: string;
  statusCode: number;
  ip: string;
  userAgent?: string;
  apiKeyId?: string;
  duration?: number;
}

/**
 * 简化的审计日志中间件
 */
export function createAuditLoggerMiddleware(): (req: Request, res: Response, next: NextFunction) => void {
  const startTime = Date.now();

  return (req: Request, res: Response, next: NextFunction) => {
    // 跳过静态资源和健康检查
    const skipPaths = ['/health', '/metrics', '/favicon.ico', '/vite.svg'];
    if (skipPaths.includes(req.path) || /\.(svg|ico|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot)$/i.test(req.path)) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'];
    const auth = res.locals.auth as any;
    const apiKeyId = auth?.apiKeyId;

    // 监听响应完成
    res.on('finish', () => {
      const auditEvent: AuditLogEvent = {
        timestamp: Date.now(),
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        ip,
        userAgent,
        apiKeyId,
        duration: Date.now() - startTime
      };

      // 记录访问日志
      if (res.statusCode >= 400) {
        logger.warn(`⚠️ API Access Failed: ${req.method} ${req.path}`, auditEvent);
      } else {
        logger.info(`✅ API Access Success: ${req.method} ${req.path}`, auditEvent);
      }
    });

    next();
  };
}

/**
 * 默认审计日志中间件
 */
export const auditLoggerMiddleware = createAuditLoggerMiddleware();
