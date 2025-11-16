/**
 * Validation Middleware - JSON Schema 验证中间件
 * 
 * 提供全面的输入验证功能，支持：
 * - JSON Schema 验证
 * - 自定义验证器
 * - 验证结果缓存
 * - 清晰的错误消息
 */

import { Request, Response, NextFunction } from 'express';
import Ajv, { ValidateFunction, ErrorObject, Options as AjvOptions } from 'ajv';
import addFormats from 'ajv-formats';
import { logger } from '../../utils/logger';

export interface ValidationSchema {
  body?: object;
  query?: object;
  params?: object;
  headers?: object;
}

export interface ValidationOptions {
  /**
   * 是否移除未定义的属性
   */
  removeAdditional?: boolean;
  /**
   * 是否使用默认值
   */
  useDefaults?: boolean;
  /**
   * 是否严格类型检查
   */
  strict?: boolean;
  /**
   * 自定义错误消息格式化函数
   */
  formatError?: (error: ErrorObject) => string;
  /**
   * 是否在验证失败时继续处理（仅记录日志）
   */
  continueOnError?: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
  schemaPath?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * 验证器缓存
 */
class ValidatorCache {
  private cache: Map<string, ValidateFunction> = new Map();
  private ajv: Ajv;

  constructor(options?: AjvOptions) {
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      validateFormats: true,
      removeAdditional: false,
      useDefaults: true,
      coerceTypes: true,
      ...options
    });

    // 添加格式验证支持
    addFormats(this.ajv);

    // 添加自定义格式
    this.ajv.addFormat('non-empty-string', {
      type: 'string',
      validate: (value: string) => value.trim().length > 0
    });

    this.ajv.addFormat('safe-string', {
      type: 'string',
      validate: (value: string) => {
        // 防止路径遍历
        if (value.includes('..') || value.includes('~')) {
          return false;
        }
        // 防止命令注入
        if (/[&|`$(){}[\];<>]/.test(value)) {
          return false;
        }
        return true;
      }
    });
  }

  /**
   * 获取或编译验证器
   */
  getValidator(schema: object, options?: ValidationOptions): ValidateFunction {
    const key = JSON.stringify(schema);
    
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // 创建新的 AJV 实例用于此验证器（如果选项不同）
    const ajvOptions: AjvOptions = {
      allErrors: true,
      strict: options?.strict ?? false,
      validateFormats: true,
      removeAdditional: options?.removeAdditional ?? false,
      useDefaults: options?.useDefaults ?? true,
      coerceTypes: true
    };
    
    const ajvInstance = options?.removeAdditional !== undefined
      ? new Ajv(ajvOptions)
      : this.ajv;

    if (ajvInstance !== this.ajv) {
      addFormats(ajvInstance);
    }

    const validate = ajvInstance.compile(schema);
    this.cache.set(key, validate);
    
    return validate;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 添加自定义关键字
   */
  addKeyword(keyword: string, definition: any): void {
    this.ajv.addKeyword(keyword, definition);
  }

  /**
   * 添加自定义格式
   */
  addFormat(name: string, format: any): void {
    this.ajv.addFormat(name, format);
  }
}

// 全局验证器缓存实例
const validatorCache = new ValidatorCache();

/**
 * 格式化验证错误
 */
function formatValidationError(error: ErrorObject, options?: ValidationOptions): ValidationError {
  const field = error.instancePath || error.params?.missingProperty || 'root';
  let message = error.message || 'Validation failed';

  // 使用自定义格式化函数
  if (options?.formatError) {
    message = options.formatError(error);
  } else {
    // 默认格式化
    if (error.params) {
      if (error.keyword === 'required') {
        message = `字段 ${field} 是必需的`;
      } else if (error.keyword === 'type') {
        message = `字段 ${field} 必须是 ${error.params.type} 类型`;
      } else if (error.keyword === 'format') {
        message = `字段 ${field} 格式无效：${error.message}`;
      } else if (error.keyword === 'pattern') {
        message = `字段 ${field} 格式不符合要求`;
      } else if (error.keyword === 'minLength') {
        message = `字段 ${field} 长度不能少于 ${error.params.limit} 个字符`;
      } else if (error.keyword === 'maxLength') {
        message = `字段 ${field} 长度不能超过 ${error.params.limit} 个字符`;
      } else if (error.keyword === 'minimum') {
        message = `字段 ${field} 值不能小于 ${error.params.limit}`;
      } else if (error.keyword === 'maximum') {
        message = `字段 ${field} 值不能大于 ${error.params.limit}`;
      } else if (error.keyword === 'minItems') {
        message = `字段 ${field} 至少需要 ${error.params.limit} 个项目`;
      } else if (error.keyword === 'maxItems') {
        message = `字段 ${field} 最多只能有 ${error.params.limit} 个项目`;
      }
    }
  }

  return {
    field: field.replace(/^\//, ''), // 移除前导斜杠
    message,
    value: error.data,
    schemaPath: error.schemaPath
  };
}

/**
 * 验证请求数据
 */
function validateData(
  data: any,
  schema: object,
  dataType: 'body' | 'query' | 'params' | 'headers',
  options?: ValidationOptions
): ValidationResult {
  try {
    const validate = validatorCache.getValidator(schema, options);
    const valid = validate(data);

    if (!valid) {
      const errors = (validate.errors || []).map(error =>
        formatValidationError(error, options)
      );

      return {
        valid: false,
        errors
      };
    }

    return {
      valid: true,
      errors: []
    };
  } catch (error: any) {
    logger.error(`[Validation] 验证 ${dataType} 时发生错误:`, error);
    return {
      valid: false,
      errors: [
        {
          field: dataType,
          message: `验证 ${dataType} 时发生内部错误: ${error.message}`
        }
      ]
    };
  }
}

/**
 * 创建验证中间件
 */
export function createValidationMiddleware(
  schema: ValidationSchema,
  options?: ValidationOptions
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const allErrors: ValidationError[] = [];

      // 验证请求体
      if (schema.body) {
        const result = validateData(req.body, schema.body, 'body', options);
        if (!result.valid) {
          allErrors.push(...result.errors);
        } else {
          // 验证成功后，更新请求体（应用默认值等）
          if (options?.useDefaults) {
            const validate = validatorCache.getValidator(schema.body, options);
            validate(req.body); // 这会应用默认值
          }
        }
      }

      // 验证查询参数
      if (schema.query) {
        const result = validateData(req.query, schema.query, 'query', options);
        if (!result.valid) {
          allErrors.push(...result.errors);
        }
      }

      // 验证路径参数
      if (schema.params) {
        const result = validateData(req.params, schema.params, 'params', options);
        if (!result.valid) {
          allErrors.push(...result.errors);
        }
      }

      // 验证请求头
      if (schema.headers) {
        const result = validateData(req.headers, schema.headers, 'headers', options);
        if (!result.valid) {
          allErrors.push(...result.errors);
        }
      }

      // 如果有验证错误
      if (allErrors.length > 0) {
        // 记录统计
        try {
          const { securityStatsCollector } = require('../../services/SecurityStatsService');
          const firstError = allErrors[0];
          securityStatsCollector.recordValidation(false, firstError?.message || 'validation_failed');
        } catch (e) {
          // 忽略统计收集错误
        }

        if (options?.continueOnError) {
          logger.warn('[Validation] 验证失败，但继续处理:', {
            path: req.path,
            method: req.method,
            errors: allErrors
          });
          return next();
        }

        logger.debug('[Validation] 验证失败:', {
          path: req.path,
          method: req.method,
          errors: allErrors
        });

        res.status(400).json({
          error: {
            message: '请求验证失败',
            type: 'validation_error',
            code: 'validation_failed',
            errors: allErrors
          }
        });
        return;
      }

      // 验证通过，继续处理
      // 记录统计
      try {
        const { securityStatsCollector } = require('../../services/SecurityStatsService');
        securityStatsCollector.recordValidation(true);
      } catch (e) {
        // 忽略统计收集错误
      }
      next();
    } catch (error: any) {
      logger.error('[Validation] 验证中间件执行异常:', error);
      
      if (options?.continueOnError) {
        return next();
      }

      res.status(500).json({
        error: {
          message: '验证过程中发生内部错误',
          type: 'internal_error',
          code: 'validation_internal_error'
        }
      });
    }
  };
}

/**
 * 验证请求体
 */
export function validateBody(schema: object, options?: ValidationOptions) {
  return createValidationMiddleware({ body: schema }, options);
}

/**
 * 验证查询参数
 */
export function validateQuery(schema: object, options?: ValidationOptions) {
  return createValidationMiddleware({ query: schema }, options);
}

/**
 * 验证路径参数
 */
export function validateParams(schema: object, options?: ValidationOptions) {
  return createValidationMiddleware({ params: schema }, options);
}

/**
 * 验证请求头
 */
export function validateHeaders(schema: object, options?: ValidationOptions) {
  return createValidationMiddleware({ headers: schema }, options);
}

/**
 * 添加自定义关键字
 */
export function addCustomKeyword(keyword: string, definition: any): void {
  validatorCache.addKeyword(keyword, definition);
}

/**
 * 添加自定义格式
 */
export function addCustomFormat(name: string, format: any): void {
  validatorCache.addFormat(name, format);
}

/**
 * 清除验证器缓存
 */
export function clearValidatorCache(): void {
  validatorCache.clearCache();
}

/**
 * 导出验证器缓存（用于测试）
 */
export function getValidatorCache(): ValidatorCache {
  return validatorCache;
}
