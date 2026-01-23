/**
 * ApexBridge (ABP-only) - 统一错误处理中间件
 * 标准化错误响应格式和错误码
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../../utils/logger";
import { AppError, normalizeError, isAppError } from "../../utils/errors";
import { dynamicStatus } from "../../utils/http-response";

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  // 标准化错误
  const error = normalizeError(err);

  // 记录错误
  logger.error("❌ Error caught by errorHandler:", {
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    path: req.path,
    method: req.method,
    ...(process.env.NODE_ENV === "development" && {
      stack: error.stack,
      details: error.details,
    }),
  });

  // 发送标准错误响应
  const response = error.toJSON() as { error: { stack?: string; details?: unknown } };

  // 开发环境下添加堆栈跟踪
  if (process.env.NODE_ENV === "development") {
    response.error.stack = error.stack;
    if (error.details) {
      response.error.details = error.details;
    }
  }

  dynamicStatus(res, error.statusCode, response);
}
