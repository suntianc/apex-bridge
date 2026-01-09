/**
 * ToolErrorHandler - 工具执行错误处理器
 * 统一分类和处理工具执行错误
 */

import { logger } from "../../utils/logger";
import { ErrorClassifier } from "../../utils/error-classifier";
import type { ToolExecutionResult } from "./types";

interface ErrorContext {
  tool_name: string;
  input_params?: Record<string, any>;
  timestamp: number;
  execution_time_ms: number;
}

interface ErrorDetails {
  error_type: string;
  error_message: string;
  error_stack?: string;
  context?: ErrorContext;
}

export class ToolErrorHandler {
  /**
   * 包装执行函数，统一处理错误
   */
  async wrapExecution<T>(
    toolName: string,
    executor: () => Promise<T>,
    onSuccess?: (result: T) => ToolExecutionResult
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const result = await executor();

      if (onSuccess) {
        return onSuccess(result);
      }

      return this.createSuccessResult(toolName, result, startTime);
    } catch (error) {
      return this.handleError(error, toolName, startTime);
    }
  }

  /**
   * 处理错误并返回标准化的错误结果
   */
  handleError(error: unknown, toolName: string, startTime: number): ToolExecutionResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = ErrorClassifier.classifyError(error);

    const errorDetails: ErrorDetails = {
      error_type: errorType,
      error_message: errorMessage,
      error_stack: error instanceof Error ? error.stack : undefined,
      context: {
        tool_name: toolName,
        timestamp: Date.now(),
        execution_time_ms: Date.now() - startTime,
      },
    };

    logger.error(`[ToolErrorHandler] Tool execution failed: ${toolName}`, {
      error_type: errorType,
      error_message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      toolName,
      error: errorMessage,
      executionTime: Date.now() - startTime,
      error_details: errorDetails,
    };
  }

  /**
   * 创建成功结果
   */
  createSuccessResult(
    toolName: string,
    result: unknown,
    executionTime: number,
    inputParams?: Record<string, any>,
    metadata?: Record<string, any>
  ): ToolExecutionResult {
    const outputContent = String(result || "");
    const tokenCount = ErrorClassifier.estimateTokens(outputContent);

    return {
      success: true,
      toolName,
      result,
      executionTime,
      tool_details: {
        tool_name: toolName,
        input_params: inputParams || {},
        output_content: outputContent,
        output_metadata: {
          token_count: tokenCount,
          execution_time_ms: executionTime,
          ...metadata,
        },
      },
    };
  }

  /**
   * 创建失败结果（不带异常）
   */
  createFailureResult(
    toolName: string,
    errorMessage: string,
    executionTime: number,
    inputParams?: Record<string, any>
  ): ToolExecutionResult {
    const errorType = ErrorClassifier.classifyError(new Error(errorMessage));

    const errorDetails: ErrorDetails = {
      error_type: errorType,
      error_message: errorMessage,
      context: {
        tool_name: toolName,
        input_params: inputParams,
        timestamp: Date.now(),
        execution_time_ms: executionTime,
      },
    };

    return {
      success: false,
      toolName,
      error: errorMessage,
      executionTime,
      error_details: errorDetails,
    };
  }

  /**
   * 检查错误是否可重试
   */
  isRetryable(errorType: string): boolean {
    const retryableTypes = ["RATE_LIMIT", "TIMEOUT", "NETWORK_ERROR"];
    return retryableTypes.includes(errorType);
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(errorType: string): string {
    const messages: Record<string, string> = {
      RATE_LIMIT: "请求过于频繁，请稍后再试",
      TIMEOUT: "请求超时，请稍后再试",
      NETWORK_ERROR: "网络连接问题，请检查网络",
      VALIDATION_ERROR: "输入参数有误，请检查后重试",
      PERMISSION_DENIED: "没有执行此操作的权限",
      TOOL_NOT_FOUND: "指定的工具不存在",
      UNKNOWN_ERROR: "发生未知错误，请稍后重试",
    };
    return messages[errorType] || "操作失败，请稍后重试";
  }
}
