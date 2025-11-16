/**
 * Audit Logger Middleware - 审计日志中间件
 * 
 * 记录关键操作的审计日志，包括配置更改、节点操作、认证事件等
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

export interface AuditLogEvent {
  timestamp: number;
  eventType: 'config_update' | 'node_register' | 'node_update' | 'node_unregister' | 'auth_login' | 'auth_logout' | 'auth_failed' | 'api_key_create' | 'api_key_delete' | 'personality_create' | 'personality_update' | 'personality_delete';
  userId?: string;
  apiKeyId?: string;
  ip: string;
  userAgent?: string;
  path: string;
  method: string;
  resourceId?: string;
  resourceType?: string;
  action: string;
  result: 'success' | 'failure';
  error?: string;
  metadata?: Record<string, any>;
}

export interface AuditLoggerConfig {
  enabled: boolean;
  logLevel?: 'info' | 'warn' | 'error';
  logSuccessfulOperations?: boolean;
  logFailedOperations?: boolean;
  excludePaths?: string[];
}

/**
 * 创建审计日志中间件
 * @param config 审计日志配置
 * @returns Express 中间件
 */
export function createAuditLoggerMiddleware(config?: Partial<AuditLoggerConfig>): (req: Request, res: Response, next: NextFunction) => void {
  const defaultConfig: AuditLoggerConfig = {
    enabled: true,
    logLevel: 'info',
    logSuccessfulOperations: true,
    logFailedOperations: true,
    excludePaths: ['/health', '/metrics', '/favicon.ico', '/vite.svg']
  };

  const auditConfig: AuditLoggerConfig = {
    ...defaultConfig,
    ...config
  };

  // 如果禁用，返回空中间件
  if (!auditConfig.enabled) {
    return (req: Request, res: Response, next: NextFunction) => {
      next();
    };
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // 跳过排除的路径
    if (auditConfig.excludePaths?.some(path => req.path === path || req.path.startsWith(path))) {
      return next();
    }

    // 检测关键操作
    const isCriticalOperation = detectCriticalOperation(req);

    // 如果不是关键操作，跳过审计日志
    if (!isCriticalOperation) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'];
    const auth = res.locals.auth as any;
    const userId = auth?.userId;
    const apiKeyId = auth?.apiKeyId;

    // 监听响应完成
    res.on('finish', () => {
      const eventType = detectEventType(req);
      const resourceId = extractResourceId(req);
      const resourceType = detectResourceType(req);
      const action = detectAction(req);
      const result: 'success' | 'failure' = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';
      const error = result === 'failure' ? res.statusMessage : undefined;

      // 构建审计日志事件
      const auditEvent: AuditLogEvent = {
        timestamp: Date.now(),
        eventType,
        userId,
        apiKeyId,
        ip,
        userAgent,
        path: req.path,
        method: req.method,
        resourceId,
        resourceType,
        action,
        result,
        error,
        metadata: {
          statusCode: res.statusCode,
          requestBody: sanitizeRequestBody(req.body),
          requestQuery: req.query,
          requestParams: req.params
        }
      };

      // 记录审计日志
      if (result === 'success' && auditConfig.logSuccessfulOperations) {
        logger.info('✅ Audit log: Operation succeeded', auditEvent);
        
        // 记录统计
        try {
          const { securityStatsCollector } = require('../../services/SecurityStatsService');
          securityStatsCollector.recordSecurityEvent('audit');
        } catch (e) {
          // 忽略统计收集错误
        }
      } else if (result === 'failure' && auditConfig.logFailedOperations) {
        logger.warn('⚠️ Audit log: Operation failed', auditEvent);
        
        // 记录统计
        try {
          const { securityStatsCollector } = require('../../services/SecurityStatsService');
          securityStatsCollector.recordSecurityEvent('error');
        } catch (e) {
          // 忽略统计收集错误
        }
      }
    });

    next();
  };
}

/**
 * 检测关键操作
 */
function detectCriticalOperation(req: Request): boolean {
  const criticalPaths = [
    '/api/admin/config',
    '/api/admin/nodes',
    '/api/admin/personalities',
    '/api/admin/auth',
    '/api/setup/complete'
  ];

  return criticalPaths.some(path => req.path.startsWith(path));
}

/**
 * 检测事件类型
 */
function detectEventType(req: Request): AuditLogEvent['eventType'] {
  const path = req.path;
  const method = req.method;

  // 配置更新
  if (path.startsWith('/api/admin/config')) {
    if (method === 'PUT' || method === 'POST') {
      return 'config_update';
    }
  }

  // 节点操作
  if (path.startsWith('/api/admin/nodes')) {
    if (method === 'POST') {
      return 'node_register';
    } else if (method === 'PUT') {
      return 'node_update';
    } else if (method === 'DELETE') {
      return 'node_unregister';
    }
  }

  // 认证操作
  if (path.startsWith('/api/admin/auth')) {
    if (path.includes('/login')) {
      return 'auth_login';
    } else if (path.includes('/logout')) {
      return 'auth_logout';
    } else if (path.includes('/api-keys')) {
      if (method === 'POST') {
        return 'api_key_create';
      } else if (method === 'DELETE') {
        return 'api_key_delete';
      }
    }
  }

  // 人格操作
  if (path.startsWith('/api/admin/personalities')) {
    if (method === 'POST') {
      return 'personality_create';
    } else if (method === 'PUT') {
      return 'personality_update';
    } else if (method === 'DELETE') {
      return 'personality_delete';
    }
  }

  // 默认返回配置更新
  return 'config_update';
}

/**
 * 提取资源ID
 */
function extractResourceId(req: Request): string | undefined {
  // 从路径参数中提取
  if (req.params.id) {
    return req.params.id;
  }
  if (req.params.nodeId) {
    return req.params.nodeId;
  }

  // 从请求体中提取
  if (req.body && req.body.id) {
    return req.body.id;
  }

  return undefined;
}

/**
 * 检测资源类型
 */
function detectResourceType(req: Request): string | undefined {
  if (req.path.startsWith('/api/admin/config')) {
    return 'config';
  }
  if (req.path.startsWith('/api/admin/nodes')) {
    return 'node';
  }
  if (req.path.startsWith('/api/admin/personalities')) {
    return 'personality';
  }
  if (req.path.startsWith('/api/admin/auth')) {
    return 'auth';
  }

  return undefined;
}

/**
 * 检测操作
 */
function detectAction(req: Request): string {
  const method = req.method;
  const path = req.path;

  if (method === 'POST') {
    if (path.includes('/login')) {
      return 'login';
    } else if (path.includes('/logout')) {
      return 'logout';
    } else {
      return 'create';
    }
  } else if (method === 'PUT') {
    return 'update';
  } else if (method === 'DELETE') {
    return 'delete';
  } else if (method === 'GET') {
    return 'read';
  }

  return method.toLowerCase();
}

/**
 * 清理请求体（移除敏感信息）
 */
function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'apiKey', 'vcpKey', 'token', 'secret', 'key'];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  }

  return sanitized;
}

/**
 * 默认审计日志中间件（使用默认配置）
 */
export const auditLoggerMiddleware = createAuditLoggerMiddleware();

/**
 * 记录审计日志事件（手动调用）
 */
export function logAuditEvent(event: Partial<AuditLogEvent>): void {
  const auditEvent: AuditLogEvent = {
    timestamp: Date.now(),
    eventType: event.eventType || 'config_update',
    userId: event.userId,
    apiKeyId: event.apiKeyId,
    ip: event.ip || 'unknown',
    userAgent: event.userAgent,
    path: event.path || '',
    method: event.method || 'GET',
    resourceId: event.resourceId,
    resourceType: event.resourceType,
    action: event.action || 'unknown',
    result: event.result || 'success',
    error: event.error,
    metadata: event.metadata
  };

  if (auditEvent.result === 'success') {
    logger.info('✅ Audit log: Operation succeeded', auditEvent);
  } else {
    logger.warn('⚠️ Audit log: Operation failed', auditEvent);
  }
}
