/**
 * 错误分类工具类
 *
 * 用于将原始错误自动分类为 8 种 ErrorType
 * 支持基于错误码、HTTP 状态码、关键词等多种识别方式
 */

import { ErrorType } from "../types/trajectory";

export const ERROR_CODES = {
  TOOL_NOT_FOUND: "TOOL_NOT_FOUND",
  TOOL_EXECUTION_FAILED: "TOOL_EXECUTION_FAILED",
  TOOL_CALL_FAILED: "TOOL_CALL_FAILED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  VECTOR_DB_ERROR: "VECTOR_DB_ERROR",
  SKILL_NOT_FOUND: "SKILL_NOT_FOUND",
  SKILL_INSTALL_FAILED: "SKILL_INSTALL_FAILED",
  SKILL_INVALID_STRUCTURE: "SKILL_INVALID_STRUCTURE",
  SKILL_ALREADY_EXISTS: "SKILL_ALREADY_EXISTS",
  MCP_SERVER_ERROR: "MCP_SERVER_ERROR",
  MCP_TOOL_NOT_FOUND: "MCP_TOOL_NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * 错误分类器
 */
export class ErrorClassifier {
  /**
   * 错误分类核心逻辑
   * @param error 原始错误对象
   * @returns 分类后的错误类型
   */
  static classifyError(error: any): ErrorType {
    // 处理 null/undefined
    if (error == null) {
      return ErrorType.UNKNOWN;
    }

    // 1. 基于错误码分类（最精确）
    if (error.code) {
      const errorCode = String(error.code).toUpperCase();
      switch (errorCode) {
        case "ECONNREFUSED":
        case "ETIMEDOUT":
        case "ENOTFOUND":
        case "ECONNRESET":
        case "EHOSTUNREACH":
          return ErrorType.NETWORK_ERROR;
        case "ENOMEM":
        case "EMFILE":
        case "ENFILE":
          return ErrorType.RESOURCE_EXHAUSTED;
      }
    }

    // 2. 基于 HTTP 状态码（较精确）
    const statusCode = error.status || error.statusCode;
    if (statusCode !== undefined) {
      const status = Number(statusCode);
      switch (status) {
        case 429:
          return ErrorType.RATE_LIMIT;
        case 403:
          return ErrorType.PERMISSION_DENIED;
        case 400:
        case 422:
          return ErrorType.INVALID_INPUT;
        case 401:
          return ErrorType.PERMISSION_DENIED;
        case 404:
          return ErrorType.INVALID_INPUT;
        case 500:
        case 502:
        case 503:
        case 504:
          return ErrorType.NETWORK_ERROR;
      }
    }

    // 3. 业务逻辑错误（自定义错误类型）- 在关键词检查之前
    if (
      error.name === "BusinessError" ||
      error.name === "ValidationError" ||
      error.name === "LogicError"
    ) {
      return ErrorType.LOGIC_ERROR;
    }

    // 4. 基于错误消息关键词（按优先级排序）
    const message = (error.message || error.toString() || "").toLowerCase();

    // 4.1 资源耗尽相关（具体关键词）
    if (
      message.includes("out of memory") ||
      message.includes("heap") ||
      message.includes("allocation failed") ||
      /disk\s+(is\s+)?full/.test(message) || // 匹配 "disk full" 或 "disk is full"
      message.includes("quota exceeded") ||
      message.includes("out of space")
    ) {
      return ErrorType.RESOURCE_EXHAUSTED;
    }

    // 4.2 速率限制相关
    if (message.includes("rate limit") || message.includes("too many requests")) {
      return ErrorType.RATE_LIMIT;
    }

    // 4.3 超时相关
    if (message.includes("timeout") || message.includes("timed out")) {
      return ErrorType.TIMEOUT;
    }

    // 4.4 权限相关
    if (
      message.includes("permission") ||
      message.includes("forbidden") ||
      message.includes("unauthorized") ||
      message.includes("access denied") ||
      message.includes("insufficient privileges")
    ) {
      return ErrorType.PERMISSION_DENIED;
    }

    // 4.5 网络相关
    if (
      message.includes("connection") ||
      message.includes("network") ||
      message.includes("refused") ||
      message.includes("unreachable") ||
      message.includes("dns")
    ) {
      return ErrorType.NETWORK_ERROR;
    }

    // 4.6 输入参数相关（放在最后，避免与业务逻辑冲突）
    if (
      message.includes("invalid") ||
      message.includes("validation") ||
      message.includes("required") ||
      message.includes("missing") ||
      message.includes("bad request") ||
      message.includes("malformed")
    ) {
      return ErrorType.INVALID_INPUT;
    }

    // 4.7 超时相关（补充）
    if (message.includes("exceeded") && !message.includes("rate limit")) {
      return ErrorType.TIMEOUT;
    }

    // 5. 默认未知
    return ErrorType.UNKNOWN;
  }

  /**
   * 估算 Token 数量
   * 简单估算：英文约 4 字符 = 1 token，中文约 2 字符 = 1 token
   * @param text 输入文本
   * @returns 估算的 Token 数量
   */
  static estimateTokens(text: string): number {
    if (!text || typeof text !== "string") {
      return 0;
    }

    // 匹配英文字符（包括数字和空格）
    const englishChars = (text.match(/[a-zA-Z0-9\s]/g) || []).length;

    // 匹配中文字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;

    // 估算：英文 4 字符/token，中文 2 字符/token
    return Math.ceil(englishChars / 4) + Math.ceil(chineseChars / 2);
  }

  /**
   * 获取错误类型的详细描述
   * @param errorType 错误类型
   * @returns 错误类型描述
   */
  static getErrorTypeDescription(errorType: ErrorType): string {
    switch (errorType) {
      case ErrorType.NETWORK_ERROR:
        return "网络连接失败或服务器无响应";
      case ErrorType.TIMEOUT:
        return "请求超时";
      case ErrorType.RATE_LIMIT:
        return "API 速率限制";
      case ErrorType.INVALID_INPUT:
        return "输入参数错误";
      case ErrorType.LOGIC_ERROR:
        return "业务逻辑错误";
      case ErrorType.RESOURCE_EXHAUSTED:
        return "资源耗尽（内存/磁盘等）";
      case ErrorType.PERMISSION_DENIED:
        return "权限不足";
      case ErrorType.UNKNOWN:
        return "未知错误";
      default:
        return "未知错误类型";
    }
  }

  /**
   * 获取错误类型的自动修复建议
   * @param errorType 错误类型
   * @returns 修复建议
   */
  static getErrorTypeSuggestion(errorType: ErrorType): string {
    switch (errorType) {
      case ErrorType.NETWORK_ERROR:
        return "检查网络连接和服务可用性，考虑添加重试机制";
      case ErrorType.TIMEOUT:
        return "将数据分批处理，每批不超过 100 条，或增加超时时间";
      case ErrorType.RATE_LIMIT:
        return "添加速率限制器，间隔至少 1 秒，或使用队列控制并发";
      case ErrorType.INVALID_INPUT:
        return "增加输入校验逻辑，确保参数格式正确";
      case ErrorType.LOGIC_ERROR:
        return "检查业务逻辑前置条件，确保数据完整性";
      case ErrorType.RESOURCE_EXHAUSTED:
        return "使用流式处理或分块读取，释放不需要的资源";
      case ErrorType.PERMISSION_DENIED:
        return "检查 API Key 或权限配置，确保有足够权限";
      case ErrorType.UNKNOWN:
        return "记录详细日志，人工分析根本原因";
      default:
        return "未知错误类型，建议检查日志";
    }
  }

  /**
   * 统一错误处理函数
   * @param error 原始错误对象
   * @param context 错误上下文信息
   * @param defaultCode 默认错误码
   * @returns 统一格式的错误信息对象
   */
  static handleError(
    error: any,
    context: string,
    defaultCode: ErrorCode = ERROR_CODES.INTERNAL_ERROR
  ): {
    code: ErrorCode;
    type: ErrorType;
    message: string;
    suggestion: string;
    context: string;
    timestamp: number;
  } {
    const errorType = this.classifyError(error);
    const message = error?.message || String(error);

    return {
      code: defaultCode,
      type: errorType,
      message,
      suggestion: this.getErrorTypeSuggestion(errorType),
      context,
      timestamp: Date.now(),
    };
  }
}
