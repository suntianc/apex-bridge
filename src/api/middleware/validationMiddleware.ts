/**
 * Validation Middleware - 简化验证中间件
 *
 * 基于 AJV 的 JSON Schema 验证，支持自定义格式
 */

import { Request, Response, NextFunction } from "express";
import Ajv, { ErrorObject, AnySchemaObject, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { logger } from "../../utils/logger";

/**
 * 验证中间件选项
 */
export interface ValidationOptions {
  /** 验证目标: 'body' | 'query' | 'params' */
  target?: "body" | "query" | "params";
}

/**
 * 验证模式定义
 */
export interface ValidationSchema {
  body?: AnySchemaObject;
  query?: AnySchemaObject;
  params?: AnySchemaObject;
}

/**
 * 自定义格式注册表
 */
const customFormats = new Map<string, (data: string) => boolean>();

// 创建 AJV 实例
const ajv = new Ajv({
  allErrors: true,
  removeAdditional: true,
  useDefaults: true,
  coerceTypes: true,
});

// 添加格式支持
addFormats(ajv);

/**
 * 格式化验证错误
 */
function formatValidationErrors(errors: ErrorObject[]): string[] {
  if (!errors || errors.length === 0) {
    return [];
  }

  return errors.map((error) => {
    const field = error.instancePath || error.schemaPath || "unknown";
    const message = error.message || "Validation failed";

    switch (error.keyword) {
      case "required":
        return `${field} 缺少必需字段: ${error.params.missingProperty}`;
      case "type":
        return `${field} 类型错误，期望 ${error.params.type}`;
      case "enum":
        return `${field} 值无效，可选值: ${error.params.allowedValues?.join(", ")}`;
      case "format":
        return `${field} 格式错误: ${error.params.format}`;
      case "minimum":
        return `${field} 值太小，最小值: ${error.params.limit}`;
      case "maximum":
        return `${field} 值太大，最大值: ${error.params.limit}`;
      case "minLength":
        return `${field} 长度太短，最小长度: ${error.params.limit}`;
      case "maxLength":
        return `${field} 长度太长，最大长度: ${error.params.limit}`;
      case "pattern":
        return `${field} 格式不匹配模式: ${error.params.pattern}`;
      default:
        return `${field}: ${message}`;
    }
  });
}

/**
 * 创建验证中间件
 */
export function createValidationMiddleware(
  schema: ValidationSchema,
  options: ValidationOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const finalOptions: ValidationOptions = {
    target: "body",
    ...options,
  };

  // 编译验证函数
  const validateFunctions: Record<string, ValidateFunction> = {};

  if (schema.body) {
    validateFunctions.body = ajv.compile(schema.body);
  }
  if (schema.query) {
    validateFunctions.query = ajv.compile(schema.query);
  }
  if (schema.params) {
    validateFunctions.params = ajv.compile(schema.params);
  }

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validateFunction = validateFunctions[finalOptions.target || "body"];

      // 如果没有定义验证模式，跳过验证
      if (!validateFunction) {
        next();
        return;
      }

      // 根据目标选择验证数据
      let data: unknown;
      switch (finalOptions.target) {
        case "body":
          data = req.body;
          break;
        case "query":
          data = req.query;
          break;
        case "params":
          data = req.params;
          break;
        default:
          res.status(500).json({
            error: "Validation Error",
            message: "Invalid validation target",
          });
          return;
      }

      // 执行验证
      const isValid = validateFunction(data);

      if (!isValid) {
        const errors = formatValidationErrors(validateFunction.errors || []);
        res.status(400).json({
          error: "Validation Error",
          message: "请求参数验证失败",
          details: errors,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error("Validation middleware error:", error);
      res.status(500).json({
        error: "Validation Error",
        message: "验证过程中发生错误",
      });
    }
  };
}

/**
 * 添加自定义格式
 */
export function addCustomFormat(
  name: string,
  format: { validate: (data: string) => boolean }
): void {
  customFormats.set(name, format.validate);
  ajv.addFormat(name, format.validate);
}
