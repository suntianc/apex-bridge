/**
 * ApexBridge 统一错误类型定义
 *
 * 提供标准化的错误码、错误类和工具函数
 * 错误码格式: ERR_{MODULE}_{ACTION}
 */

import { ErrorType } from "./trajectory";

/**
 * 错误码枚举
 * 格式: ERR_{MODULE}_{ACTION}
 */
export enum ErrorCode {
  // ========== Tool 相关错误 ==========
  /** 工具执行超时 */
  ERR_TOOL_EXECUTE_TIMEOUT = "ERR_TOOL_EXECUTE_TIMEOUT",
  /** 工具未找到 */
  ERR_TOOL_NOT_FOUND = "ERR_TOOL_NOT_FOUND",
  /** 工具执行失败 */
  ERR_TOOL_EXECUTE_FAILED = "ERR_TOOL_EXECUTE_FAILED",
  /** 工具注册失败 */
  ERR_TOOL_REGISTER_FAILED = "ERR_TOOL_REGISTER_FAILED",
  /** 工具注销失败 */
  ERR_TOOL_UNREGISTER_FAILED = "ERR_TOOL_UNREGISTER_FAILED",

  // ========== LLM 相关错误 ==========
  /** LLM API 错误 */
  ERR_LLM_API_ERROR = "ERR_LLM_API_ERROR",
  /** LLM 模型未配置 */
  ERR_LLM_MODEL_NOT_CONFIGURED = "ERR_LLM_MODEL_NOT_CONFIGURED",
  /** LLM 请求超时 */
  ERR_LLM_REQUEST_TIMEOUT = "ERR_LLM_REQUEST_TIMEOUT",
  /** LLM 速率限制 */
  ERR_LLM_RATE_LIMIT = "ERR_LLM_RATE_LIMIT",

  // ========== Database 相关错误 ==========
  /** 数据库连接失败 */
  ERR_DB_CONNECTION_FAILED = "ERR_DB_CONNECTION_FAILED",
  /** 数据库查询错误 */
  ERR_DB_QUERY_FAILED = "ERR_DB_QUERY_FAILED",
  /** 数据库迁移错误 */
  ERR_DB_MIGRATION_FAILED = "ERR_DB_MIGRATION_FAILED",

  // ========== MCP 相关错误 ==========
  /** MCP 服务器连接失败 */
  ERR_MCP_SERVER_CONNECTION_FAILED = "ERR_MCP_SERVER_CONNECTION_FAILED",
  /** MCP 工具调用失败 */
  ERR_MCP_TOOL_CALL_FAILED = "ERR_MCP_TOOL_CALL_FAILED",
  /** MCP 服务器已存在 */
  ERR_MCP_SERVER_EXISTS = "ERR_MCP_SERVER_EXISTS",

  // ========== Authentication 相关错误 ==========
  /** 未授权访问 */
  ERR_AUTH_UNAUTHORIZED = "ERR_AUTH_UNAUTHORIZED",
  /** 认证失败 */
  ERR_AUTH_FAILED = "ERR_AUTH_FAILED",
  /** 权限不足 */
  ERR_AUTH_FORBIDDEN = "ERR_AUTH_FORBIDDEN",

  // ========== Validation 相关错误 ==========
  /** 输入参数错误 */
  ERR_VALIDATION_INVALID_INPUT = "ERR_VALIDATION_INVALID_INPUT",
  /** 请求参数缺失 */
  ERR_VALIDATION_MISSING_PARAM = "ERR_VALIDATION_MISSING_PARAM",
  /** 请求格式错误 */
  ERR_VALIDATION_MALFORMED_REQUEST = "ERR_VALIDATION_MALFORMED_REQUEST",

  // ========== Internal 相关错误 ==========
  /** 内部服务器错误 */
  ERR_INTERNAL_SERVER_ERROR = "ERR_INTERNAL_SERVER_ERROR",
  /** 配置错误 */
  ERR_INTERNAL_CONFIG_ERROR = "ERR_INTERNAL_CONFIG_ERROR",
  /** 状态错误 */
  ERR_INTERNAL_STATE_ERROR = "ERR_INTERNAL_STATE_ERROR",

  // ========== Vector Search 相关错误 ==========
  /** 向量数据库连接失败 */
  ERR_VECTOR_DB_CONNECTION_FAILED = "ERR_VECTOR_DB_CONNECTION_FAILED",
  /** 向量索引错误 */
  ERR_VECTOR_INDEX_ERROR = "ERR_VECTOR_INDEX_ERROR",
  /** 嵌入模型错误 */
  ERR_EMBEDDING_MODEL_ERROR = "ERR_EMBEDDING_MODEL_ERROR",
}

/**
 * 应用错误类
 * 提供标准化的错误响应格式
 */
export class AppError extends Error {
  /**
   * @param code - 错误码
   * @param message - 错误消息
   * @param statusCode - HTTP 状态码 (默认 500)
   * @param details - 错误详情
   */
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    // 确保 Error 堆栈被正确捕获
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * 转换为 JSON 格式
   */
  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      error: {
        code: this.code,
        message: this.message,
      },
    };

    if (this.statusCode) {
      (json.error as Record<string, unknown>).statusCode = this.statusCode;
    }

    if (this.details) {
      (json.error as Record<string, unknown>).details = this.details;
    }

    return json;
  }

  /**
   * 获取 HTTP 状态码
   */
  getStatusCode(): number {
    return this.statusCode;
  }

  /**
   * 转换为 ErrorType (用于 trajectory 追踪)
   */
  toErrorType(): ErrorType {
    // 根据错误码映射到 ErrorType
    if (this.code.includes("TIMEOUT")) {
      return ErrorType.TIMEOUT;
    }
    if (this.code.includes("RATE_LIMIT")) {
      return ErrorType.RATE_LIMIT;
    }
    if (this.code.includes("PERMISSION") || this.code.includes("AUTH")) {
      return ErrorType.PERMISSION_DENIED;
    }
    if (this.code.includes("INVALID") || this.code.includes("VALIDATION")) {
      return ErrorType.INVALID_INPUT;
    }
    if (this.code.includes("NETWORK") || this.code.includes("CONNECTION")) {
      return ErrorType.NETWORK_ERROR;
    }
    if (
      this.code.includes("RESOURCE") ||
      this.code.includes("MEMORY") ||
      this.code.includes("DISK")
    ) {
      return ErrorType.RESOURCE_EXHAUSTED;
    }
    return ErrorType.UNKNOWN;
  }
}

/**
 * 函数式结果类型
 * 用于安全的错误处理
 */
export type Result<T> = { success: true; data: T } | { success: false; error: AppError };

/**
 * 错误创建工具函数
 */

// ========== Tool 错误 ==========

/**
 * 创建工具执行超时错误
 */
export function toolExecuteTimeout(toolName: string, timeout: number): AppError {
  return new AppError(
    ErrorCode.ERR_TOOL_EXECUTE_TIMEOUT,
    `Tool execution timeout: ${toolName} exceeded ${timeout}ms`,
    504,
    { toolName, timeout }
  );
}

/**
 * 创建工具未找到错误
 */
export function toolNotFound(toolName: string): AppError {
  return new AppError(ErrorCode.ERR_TOOL_NOT_FOUND, `Tool not found: ${toolName}`, 404, {
    toolName,
  });
}

/**
 * 创建工具执行失败错误
 */
export function toolExecuteFailed(toolName: string, reason: string): AppError {
  return new AppError(
    ErrorCode.ERR_TOOL_EXECUTE_FAILED,
    `Tool execution failed: ${toolName} - ${reason}`,
    500,
    { toolName, reason }
  );
}

// ========== LLM 错误 ==========

/**
 * 创建 LLM API 错误
 */
export function llmApiError(provider: string, message: string): AppError {
  return new AppError(ErrorCode.ERR_LLM_API_ERROR, `LLM API error (${provider}): ${message}`, 502, {
    provider,
    message,
  });
}

/**
 * 创建 LLM 模型未配置错误
 */
export function llmModelNotConfigured(modelType: string): AppError {
  return new AppError(
    ErrorCode.ERR_LLM_MODEL_NOT_CONFIGURED,
    `LLM model not configured for type: ${modelType}`,
    500,
    { modelType }
  );
}

// ========== Database 错误 ==========

/**
 * 创建数据库连接失败错误
 */
export function dbConnectionFailed(database: string, reason: string): AppError {
  return new AppError(
    ErrorCode.ERR_DB_CONNECTION_FAILED,
    `Database connection failed: ${database} - ${reason}`,
    503,
    { database, reason }
  );
}

/**
 * 创建数据库查询错误
 */
export function dbQueryFailed(query: string, reason: string): AppError {
  return new AppError(ErrorCode.ERR_DB_QUERY_FAILED, `Database query failed: ${reason}`, 500, {
    query: query.substring(0, 100),
    reason,
  });
}

// ========== MCP 错误 ==========

/**
 * 创建 MCP 服务器连接失败错误
 */
export function mcpServerConnectionFailed(serverId: string, reason: string): AppError {
  return new AppError(
    ErrorCode.ERR_MCP_SERVER_CONNECTION_FAILED,
    `MCP server connection failed: ${serverId} - ${reason}`,
    502,
    { serverId, reason }
  );
}

/**
 * 创建 MCP 工具调用失败错误
 */
export function mcpToolCallFailed(toolName: string, reason: string): AppError {
  return new AppError(
    ErrorCode.ERR_MCP_TOOL_CALL_FAILED,
    `MCP tool call failed: ${toolName} - ${reason}`,
    500,
    { toolName, reason }
  );
}

// ========== Validation 错误 ==========

/**
 * 创建输入参数错误
 */
export function validationInvalidInput(field: string, reason: string): AppError {
  return new AppError(
    ErrorCode.ERR_VALIDATION_INVALID_INPUT,
    `Invalid input for field '${field}': ${reason}`,
    400,
    { field, reason }
  );
}

/**
 * 创建请求参数缺失错误
 */
export function validationMissingParam(param: string): AppError {
  return new AppError(
    ErrorCode.ERR_VALIDATION_MISSING_PARAM,
    `Missing required parameter: ${param}`,
    400,
    { param }
  );
}

// ========== Internal 错误 ==========

/**
 * 创建内部配置错误
 */
export function internalConfigError(setting: string, reason: string): AppError {
  return new AppError(
    ErrorCode.ERR_INTERNAL_CONFIG_ERROR,
    `Configuration error for '${setting}': ${reason}`,
    500,
    { setting, reason }
  );
}

/**
 * 创建内部状态错误
 */
export function internalStateError(state: string, reason: string): AppError {
  return new AppError(
    ErrorCode.ERR_INTERNAL_STATE_ERROR,
    `State error in '${state}': ${reason}`,
    500,
    { state, reason }
  );
}

/**
 * 错误规范化函数
 * 将任意错误转换为 AppError
 */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(ErrorCode.ERR_INTERNAL_SERVER_ERROR, error.message, 500, {
      originalError: error.name,
    });
  }

  return new AppError(ErrorCode.ERR_INTERNAL_SERVER_ERROR, String(error) || "Unknown error", 500);
}

/**
 * 检查是否为 AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * 错误码到 HTTP 状态码的映射
 */
export function getStatusCodeForErrorCode(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.ERR_TOOL_NOT_FOUND:
    case ErrorCode.ERR_VALIDATION_MISSING_PARAM:
      return 404;
    case ErrorCode.ERR_VALIDATION_INVALID_INPUT:
    case ErrorCode.ERR_VALIDATION_MALFORMED_REQUEST:
      return 400;
    case ErrorCode.ERR_AUTH_UNAUTHORIZED:
      return 401;
    case ErrorCode.ERR_AUTH_FORBIDDEN:
      return 403;
    case ErrorCode.ERR_LLM_RATE_LIMIT:
      return 429;
    case ErrorCode.ERR_LLM_API_ERROR:
    case ErrorCode.ERR_MCP_SERVER_CONNECTION_FAILED:
    case ErrorCode.ERR_MCP_TOOL_CALL_FAILED:
    case ErrorCode.ERR_VECTOR_DB_CONNECTION_FAILED:
      return 502;
    default:
      return 500;
  }
}
