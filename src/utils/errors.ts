/**
 * 统一错误处理工具
 * 标准化错误响应格式和错误码
 *
 * @deprecated 请使用 src/types/errors.ts 中的 AppError 和 ErrorCode
 * 此文件保留用于向后兼容
 */

import { AppError, ErrorCode } from "../types/errors";

export {
  AppError,
  ErrorCode,
  isAppError,
  normalizeError,
  getStatusCodeForErrorCode,
} from "../types/errors";

// 旧版错误码别名（用于向后兼容）
// 使用方法: import { OLDErrorCode } from '../../utils/errors'
export const OLDErrorCode = {
  INTERNAL_ERROR: "ERR_INTERNAL_SERVER_ERROR" as const,
  VALIDATION_ERROR: "ERR_VALIDATION_INVALID_INPUT" as const,
  NOT_FOUND: "ERR_TOOL_NOT_FOUND" as const,
  FORBIDDEN: "ERR_AUTH_FORBIDDEN" as const,
  AUTHENTICATION_ERROR: "ERR_AUTH_FAILED" as const,
  UNAUTHORIZED: "ERR_AUTH_UNAUTHORIZED" as const,
  TOKEN_EXPIRED: "ERR_AUTH_FAILED" as const,
  INVALID_TOKEN: "ERR_AUTH_FAILED" as const,
  INVALID_CREDENTIALS: "ERR_AUTH_FAILED" as const,
  MISSING_AUTHORIZATION: "ERR_AUTH_UNAUTHORIZED" as const,
  CONFIG_ERROR: "ERR_INTERNAL_CONFIG_ERROR" as const,
  MISSING_CONFIG: "ERR_INTERNAL_CONFIG_ERROR" as const,
  INVALID_CONFIG: "ERR_INTERNAL_CONFIG_ERROR" as const,
  BAD_REQUEST: "ERR_VALIDATION_INVALID_INPUT" as const,
  INVALID_PARAMETER: "ERR_VALIDATION_INVALID_INPUT" as const,
  MISSING_PARAMETER: "ERR_VALIDATION_MISSING_PARAM" as const,
  SERVICE_UNAVAILABLE: "ERR_INTERNAL_SERVER_ERROR" as const,
  TIMEOUT: "ERR_TOOL_EXECUTE_TIMEOUT" as const,
  RATE_LIMIT_EXCEEDED: "ERR_LLM_RATE_LIMIT" as const,
  PLUGIN_ERROR: "ERR_INTERNAL_SERVER_ERROR" as const,
  PLUGIN_NOT_FOUND: "ERR_TOOL_NOT_FOUND" as const,
  PLUGIN_EXECUTION_FAILED: "ERR_TOOL_EXECUTE_FAILED" as const,
  LLM_ERROR: "ERR_LLM_API_ERROR" as const,
  LLM_TIMEOUT: "ERR_LLM_REQUEST_TIMEOUT" as const,
  LLM_QUOTA_EXCEEDED: "ERR_LLM_RATE_LIMIT" as const,
  LLM_INVALID_RESPONSE: "ERR_LLM_API_ERROR" as const,
} as const;

// 向后兼容的工厂函数
export const createError = {
  internal: (message: string = "Internal server error", details?: unknown) =>
    new AppError(ErrorCode.ERR_INTERNAL_SERVER_ERROR, message, 500, details),
  unauthorized: (message: string = "Unauthorized", details?: unknown) =>
    new AppError(ErrorCode.ERR_AUTH_UNAUTHORIZED, message, 401, details),
  forbidden: (message: string = "Forbidden", details?: unknown) =>
    new AppError(ErrorCode.ERR_AUTH_FORBIDDEN, message, 403, details),
  notFound: (message: string = "Resource not found", details?: unknown) =>
    new AppError(ErrorCode.ERR_TOOL_NOT_FOUND, message, 404, details),
  badRequest: (message: string = "Bad request", details?: unknown) =>
    new AppError(ErrorCode.ERR_VALIDATION_INVALID_INPUT, message, 400, details),
  validation: (message: string = "Validation error", details?: unknown) =>
    new AppError(ErrorCode.ERR_VALIDATION_INVALID_INPUT, message, 400, details),
  authentication: (message: string = "Authentication failed", details?: unknown) =>
    new AppError(ErrorCode.ERR_AUTH_FAILED, message, 401, details),
  tokenExpired: (message: string = "Token expired", details?: unknown) =>
    new AppError(ErrorCode.ERR_AUTH_FAILED, message, 401, details),
  config: (message: string = "Configuration error", details?: unknown) =>
    new AppError(ErrorCode.ERR_INTERNAL_CONFIG_ERROR, message, 500, details),
  serviceUnavailable: (message: string = "Service unavailable", details?: unknown) =>
    new AppError(ErrorCode.ERR_INTERNAL_SERVER_ERROR, message, 503, details),
  timeout: (message: string = "Request timeout", details?: unknown) =>
    new AppError(ErrorCode.ERR_TOOL_EXECUTE_TIMEOUT, message, 504, details),
};
