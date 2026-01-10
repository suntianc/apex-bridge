/**
 * Sanitization Middleware - 简化输入清理中间件
 *
 * 提供基本的输入清理功能，防止常见的注入攻击
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../../utils/logger";

/**
 * 基本清理选项
 */
export interface SanitizationOptions {
  skipFields?: string[];
}

/**
 * 移除HTML标签
 */
function removeHtmlTags(input: string): string {
  if (!input || typeof input !== "string") {
    return input;
  }
  return input.replace(/<[^>]*>/g, "");
}

/**
 * 防止SQL注入和命令注入
 */
function preventInjections(input: string): string {
  if (!input || typeof input !== "string") {
    return input;
  }

  // 移除危险字符
  return input
    .replace(/['";\\]/g, "") // SQL注入
    .replace(/[&|`$(){}[\];<>]/g, "") // 命令注入
    .replace(/\.\./g, "") // 路径遍历
    .replace(/--.*$/gm, "") // SQL注释
    .replace(/\/\*[\s\S]*?\*\//g, ""); // 多行注释
}

/**
 * 清理字符串
 */
function sanitizeString(value: string, options?: SanitizationOptions): string {
  if (!value || typeof value !== "string") {
    return value;
  }

  // 基础清理
  let sanitized = removeHtmlTags(value);
  sanitized = preventInjections(sanitized);

  // 限制长度，防止过长输入
  return sanitized.substring(0, 10000);
}

/**
 * 递归清理对象
 */
function sanitizeObject(obj: any, options?: SanitizationOptions, fieldPath: string = ""): any {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item, index) => sanitizeObject(item, options, `${fieldPath}[${index}]`));
  }

  const sanitized: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const currentPath = fieldPath ? `${fieldPath}.${key}` : key;
      const value = obj[key];

      // 检查是否需要跳过敏感字段
      if (options?.skipFields?.includes(key) || options?.skipFields?.includes(currentPath)) {
        sanitized[key] = value;
      } else if (typeof value === "string") {
        sanitized[key] = sanitizeString(value, options);
      } else if (typeof value === "object") {
        sanitized[key] = sanitizeObject(value, options, currentPath);
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}

/**
 * 创建简化清理中间件
 */
export function createSanitizationMiddleware(
  options?: SanitizationOptions
): (req: Request, res: Response, next: NextFunction) => void {
  const defaultOptions: SanitizationOptions = {
    skipFields: ["password", "token", "secret", "key"],
  };

  const sanitizationOptions = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // 清理请求体
      if (req.body) {
        req.body = sanitizeObject(req.body, sanitizationOptions, "body");
      }

      // 清理查询参数
      if (req.query) {
        req.query = sanitizeObject(req.query, sanitizationOptions, "query");
      }

      // 清理路径参数
      if (req.params) {
        req.params = sanitizeObject(req.params, sanitizationOptions, "params");
      }

      next();
    } catch (error) {
      logger.error("Error in sanitization middleware:", error);
      next();
    }
  };
}

/**
 * 默认清理中间件
 */
export const sanitizationMiddleware = createSanitizationMiddleware();
