/**
 * 统一错误处理工具
 * 标准化错误响应格式和错误码
 */

/**
 * 错误码枚举
 */
export enum ErrorCode {
  // 通用错误 (1000-1999)
  INTERNAL_ERROR = "INTERNAL_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  FORBIDDEN = "FORBIDDEN",

  // 认证错误 (2000-2999)
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  INVALID_TOKEN = "INVALID_TOKEN",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  MISSING_AUTHORIZATION = "MISSING_AUTHORIZATION",

  // 配置错误 (3000-3999)
  CONFIG_ERROR = "CONFIG_ERROR",
  MISSING_CONFIG = "MISSING_CONFIG",
  INVALID_CONFIG = "INVALID_CONFIG",

  // 请求错误 (4000-4999)
  BAD_REQUEST = "BAD_REQUEST",
  INVALID_PARAMETER = "INVALID_PARAMETER",
  MISSING_PARAMETER = "MISSING_PARAMETER",

  // 服务错误 (5000-5999)
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  TIMEOUT = "TIMEOUT",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

  // 插件错误 (6000-6999)
  PLUGIN_ERROR = "PLUGIN_ERROR",
  PLUGIN_NOT_FOUND = "PLUGIN_NOT_FOUND",
  PLUGIN_EXECUTION_FAILED = "PLUGIN_EXECUTION_FAILED",

  // LLM错误 (7000-7999)
  LLM_ERROR = "LLM_ERROR",
  LLM_TIMEOUT = "LLM_TIMEOUT",
  LLM_QUOTA_EXCEEDED = "LLM_QUOTA_EXCEEDED",
  LLM_INVALID_RESPONSE = "LLM_INVALID_RESPONSE",
}

/**
 * 错误详情类型
 */
export interface ErrorDetails {
  /** 错误字段 (验证错误时使用) */
  field?: string;
  /** 错误值 */
  value?: unknown;
  /** 约束条件 */
  constraint?: string;
  /** 额外信息 */
  [key: string]: unknown;
}

/**
 * 统一错误类
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly type: string;
  public readonly details?: ErrorDetails;
  public readonly timestamp: number;

  constructor(
    message: string,
    statusCode: number = 500,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    details?: ErrorDetails
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.type = this.getErrorType(statusCode);
    this.details = details;
    this.timestamp = Date.now();

    // 保持堆栈跟踪
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * 根据状态码获取错误类型
   */
  private getErrorType(statusCode: number): string {
    if (statusCode >= 400 && statusCode < 500) {
      return "client_error";
    } else if (statusCode >= 500) {
      return "server_error";
    }
    return "unknown_error";
  }

  /**
   * 转换为JSON格式（用于响应）
   */
  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code,
        type: this.type,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * 创建常用错误的工厂函数
 */
export const createError = {
  /**
   * 内部服务器错误
   */
  internal: (message: string = "Internal server error", details?: ErrorDetails) =>
    new AppError(message, 500, ErrorCode.INTERNAL_ERROR, details),

  /**
   * 未授权错误
   */
  unauthorized: (message: string = "Unauthorized", details?: ErrorDetails) =>
    new AppError(message, 401, ErrorCode.UNAUTHORIZED, details),

  /**
   * 禁止访问错误
   */
  forbidden: (message: string = "Forbidden", details?: ErrorDetails) =>
    new AppError(message, 403, ErrorCode.FORBIDDEN, details),

  /**
   * 未找到错误
   */
  notFound: (message: string = "Resource not found", details?: ErrorDetails) =>
    new AppError(message, 404, ErrorCode.NOT_FOUND, details),

  /**
   * 请求错误
   */
  badRequest: (message: string = "Bad request", details?: ErrorDetails) =>
    new AppError(message, 400, ErrorCode.BAD_REQUEST, details),

  /**
   * 验证错误
   */
  validation: (message: string = "Validation error", details?: ErrorDetails) =>
    new AppError(message, 400, ErrorCode.VALIDATION_ERROR, details),

  /**
   * 认证错误
   */
  authentication: (message: string = "Authentication failed", details?: ErrorDetails) =>
    new AppError(message, 401, ErrorCode.AUTHENTICATION_ERROR, details),

  /**
   * Token过期错误
   */
  tokenExpired: (message: string = "Token expired", details?: ErrorDetails) =>
    new AppError(message, 401, ErrorCode.TOKEN_EXPIRED, details),

  /**
   * 配置错误
   */
  config: (message: string = "Configuration error", details?: ErrorDetails) =>
    new AppError(message, 500, ErrorCode.CONFIG_ERROR, details),

  /**
   * 服务不可用错误
   */
  serviceUnavailable: (message: string = "Service unavailable", details?: ErrorDetails) =>
    new AppError(message, 503, ErrorCode.SERVICE_UNAVAILABLE, details),

  /**
   * 超时错误
   */
  timeout: (message: string = "Request timeout", details?: ErrorDetails) =>
    new AppError(message, 408, ErrorCode.TIMEOUT, details),
};

/**
 * 判断是否为AppError实例
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * 将任何错误转换为AppError
 */
export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  // 如果是已知的HTTP错误
  if (error && typeof error === "object" && "statusCode" in error) {
    const err = error as {
      message?: string;
      statusCode: number;
      code?: ErrorCode;
      details?: ErrorDetails;
    };
    return new AppError(
      err.message || "Unknown error",
      err.statusCode,
      err.code || ErrorCode.INTERNAL_ERROR,
      err.details
    );
  }

  // 默认内部错误
  const err = error as { message?: string };
  return createError.internal(err?.message || "Unknown error", undefined);
}
