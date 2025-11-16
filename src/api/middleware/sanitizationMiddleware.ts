/**
 * Sanitization Middleware - 输入清理中间件
 * 
 * 提供输入清理功能，防止 XSS 和注入攻击
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

/**
 * 清理选项
 */
export interface SanitizationOptions {
  /**
   * 是否清理请求体
   */
  sanitizeBody?: boolean;
  /**
   * 是否清理查询参数
   */
  sanitizeQuery?: boolean;
  /**
   * 是否清理路径参数
   */
  sanitizeParams?: boolean;
  /**
   * 是否清理请求头
   */
  sanitizeHeaders?: boolean;
  /**
   * 是否允许 HTML 标签（如果为 false，则移除所有 HTML 标签）
   */
  allowHtml?: boolean;
  /**
   * 允许的 HTML 标签列表（如果 allowHtml 为 true）
   */
  allowedHtmlTags?: string[];
  /**
   * 是否防止 SQL 注入
   */
  preventSqlInjection?: boolean;
  /**
   * 是否防止命令注入
   */
  preventCommandInjection?: boolean;
  /**
   * 是否防止路径遍历
   */
  preventPathTraversal?: boolean;
  /**
   * 需要跳过的字段（不进行清理）
   */
  skipFields?: string[];
}

/**
 * 清理字符串中的 HTML 标签
 */
function sanitizeHtml(input: string, options?: SanitizationOptions): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  // 如果允许 HTML，只移除危险的标签和属性
  if (options?.allowHtml && options.allowedHtmlTags) {
    // 简单的标签清理（移除不在白名单中的标签）
    // 注意：这是一个简化实现，生产环境建议使用 DOMPurify
    const allowedTags = options.allowedHtmlTags.join('|');
    const regex = new RegExp(`<(?!\\/?(${allowedTags})\\s*\\/?)[^>]+>`, 'gi');
    return input.replace(regex, '');
  }

  // 移除所有 HTML 标签
  return input.replace(/<[^>]*>/g, '');
}

/**
 * 防止 SQL 注入
 */
function sanitizeSql(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  // 移除 SQL 特殊字符
  // 注意：这不是完整的 SQL 注入防护，应该使用参数化查询
  // 移除单引号、双引号、分号和反斜杠
  // 移除 SQL 注释（-- 和 /* */）
  let sanitized = input.replace(/['";\\]/g, '');
  // 移除 SQL 注释（-- 开头的注释）
  sanitized = sanitized.replace(/--.*$/gm, '');
  // 移除多行注释（/* */）
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');
  return sanitized;
}

/**
 * 防止命令注入
 */
function sanitizeCommand(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  // 移除 shell 特殊字符（不包括 -，因为它是正常的命令行参数）
  // 移除 & | ` $ ( ) { } [ ] ; < >
  return input.replace(/[&|`$(){}[\];<>]/g, '');
}

/**
 * 防止路径遍历
 */
function sanitizePath(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  // 移除路径遍历字符
  // 移除 .. 和 ~，但要保留单个点（用于相对路径）
  let sanitized = input.replace(/\.\./g, '');
  sanitized = sanitized.replace(/~/g, '');
  // 清理多个连续的斜杠（保留开头和结尾的斜杠）
  if (sanitized.startsWith('/')) {
    sanitized = '/' + sanitized.replace(/\/+/g, '/').replace(/^\/+/, '');
  } else {
    sanitized = sanitized.replace(/\/+/g, '/');
  }
  return sanitized;
}

/**
 * 清理字符串
 */
function sanitizeString(
  value: string,
  options?: SanitizationOptions,
  fieldPath: string = ''
): string {
  if (!value || typeof value !== 'string') {
    return value;
  }

  // 检查是否需要跳过此字段
  // 支持完整路径匹配（如 'body.password'）或字段名匹配（如 'password'）
  if (options?.skipFields) {
    const fieldName = fieldPath.split('.').pop() || fieldPath;
    if (options.skipFields.includes(fieldPath) || options.skipFields.includes(fieldName)) {
      return value;
    }
  }

  let sanitized = value;

  // 清理 HTML
  sanitized = sanitizeHtml(sanitized, options);

  // 防止 SQL 注入
  if (options?.preventSqlInjection) {
    sanitized = sanitizeSql(sanitized);
  }

  // 防止命令注入
  if (options?.preventCommandInjection) {
    sanitized = sanitizeCommand(sanitized);
  }

  // 防止路径遍历
  if (options?.preventPathTraversal) {
    sanitized = sanitizePath(sanitized);
  }

  return sanitized;
}

/**
 * 清理对象
 */
function sanitizeObject(
  obj: any,
  options?: SanitizationOptions,
  fieldPath: string = ''
): void {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  // 处理数组
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const currentPath = fieldPath ? `${fieldPath}[${i}]` : `[${i}]`;
      if (typeof obj[i] === 'string') {
        obj[i] = sanitizeString(obj[i], options, currentPath);
      } else if (typeof obj[i] === 'object' && obj[i] !== null) {
        sanitizeObject(obj[i], options, currentPath);
      }
    }
    return;
  }

  // 处理普通对象
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      continue;
    }

    const currentPath = fieldPath ? `${fieldPath}.${key}` : key;
    const value = obj[key];

    if (typeof value === 'string') {
      obj[key] = sanitizeString(value, options, currentPath);
    } else if (typeof value === 'object' && value !== null) {
      sanitizeObject(value, options, currentPath);
    }
  }
}

/**
 * 创建清理中间件
 */
export function createSanitizationMiddleware(
  options?: SanitizationOptions
) {
  const defaultOptions: SanitizationOptions = {
    sanitizeBody: true,
    sanitizeQuery: true,
    sanitizeParams: true,
    sanitizeHeaders: false,
    allowHtml: false,
    allowedHtmlTags: [],
    preventSqlInjection: true,
    preventCommandInjection: true,
    preventPathTraversal: true,
    skipFields: [],
    ...options
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // 清理请求体
      if (defaultOptions.sanitizeBody && req.body && typeof req.body === 'object') {
        sanitizeObject(req.body, defaultOptions, 'body');
      }

      // 清理查询参数
      if (defaultOptions.sanitizeQuery && req.query && typeof req.query === 'object') {
        sanitizeObject(req.query, defaultOptions, 'query');
      }

      // 清理路径参数
      if (defaultOptions.sanitizeParams && req.params && typeof req.params === 'object') {
        sanitizeObject(req.params, defaultOptions, 'params');
      }

      // 清理请求头（通常不需要清理，但可以清理特定头部）
      if (defaultOptions.sanitizeHeaders && req.headers) {
        // 只清理字符串类型的头部
        for (const key in req.headers) {
          if (typeof req.headers[key] === 'string') {
            req.headers[key] = sanitizeString(
              req.headers[key] as string,
              defaultOptions,
              `headers.${key}`
            );
          }
        }
      }

      next();
    } catch (error: any) {
      logger.error('[Sanitization] 清理中间件执行异常:', error);
      // 清理失败时继续处理（不阻止请求）
      next();
    }
  };
}

/**
 * 默认清理中间件
 */
export const sanitizationMiddleware = createSanitizationMiddleware();

/**
 * 清理字符串（工具函数）
 */
export function sanitizeStringValue(
  value: string,
  options?: SanitizationOptions
): string {
  return sanitizeString(value, options);
}

/**
 * 清理对象（工具函数）
 */
export function sanitizeObjectValue(
  obj: any,
  options?: SanitizationOptions
): any {
  const cloned = JSON.parse(JSON.stringify(obj));
  sanitizeObject(cloned, options);
  return cloned;
}
