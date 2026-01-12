/**
 * Security Logger Middleware - 简化安全日志中间件
 *
 * 记录安全相关事件和错误
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../../utils/logger";

export interface SecurityLogEvent {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  ip: string;
  userAgent?: string;
  apiKey?: string;
  suspicious?: boolean;
  suspiciousReason?: string;
}

/**
 * 创建简化安全日志中间件
 */
export function createSecurityLoggerMiddleware(): (
  req: Request,
  res: Response,
  next: NextFunction
) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // 跳过静态资源和健康检查
    const skipPaths = ["/health", "/metrics", "/favicon.ico", "/vite.svg"];
    if (
      skipPaths.includes(req.path) ||
      /\.(svg|ico|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot)$/i.test(req.path)
    ) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const userAgent = req.headers["user-agent"];
    const apiKey = req.headers["x-api-key"];

    // 监听响应完成
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const suspiciousReason = detectSuspiciousActivity(req);

      const securityEvent: SecurityLogEvent = {
        timestamp: Date.now(),
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        duration,
        ip,
        userAgent,
        apiKey: apiKey ? "present" : "absent",
        suspicious: !!suspiciousReason,
        suspiciousReason,
      };

      // 记录安全事件
      if (res.statusCode === 429) {
        logger.warn("🚫 Rate limit exceeded", securityEvent);
      } else if (securityEvent.suspicious) {
        logger.warn("⚠️ Suspicious request detected", securityEvent);
      } else if (res.statusCode >= 500) {
        logger.error("❌ Server error", securityEvent);
      } else if (res.statusCode >= 400) {
        logger.warn("⚠️ Client error", securityEvent);
      }
    });

    next();
  };
}

/**
 * 检测可疑活动
 */
function detectSuspiciousActivity(req: Request): string | undefined {
  const suspiciousPatterns = [
    { pattern: /<script/i, reason: "Possible XSS attempt" },
    { pattern: /union.*select/i, reason: "Possible SQL injection" },
    { pattern: /\.\.[\\/]/i, reason: "Possible path traversal" },
    { pattern: /eval\s*\(/i, reason: "Possible code injection" },
    { pattern: /javascript:/i, reason: "Possible script injection" },
  ];

  const requestString = JSON.stringify({
    path: req.path,
    method: req.method,
    headers: req.headers,
    query: req.query,
  });

  for (const { pattern, reason } of suspiciousPatterns) {
    if (pattern.test(requestString)) {
      return reason;
    }
  }

  return undefined;
}

/**
 * 默认安全日志中间件
 */
export const securityLoggerMiddleware = createSecurityLoggerMiddleware();
