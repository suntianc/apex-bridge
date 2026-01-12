/**
 * 统一错误处理中间件
 * 提供便捷的错误处理封装，确保错误处理一致性
 */

import { logger } from "./logger";
import { ErrorClassifier, ERROR_CODES } from "./error-classifier";
import { ErrorType } from "../types/trajectory";

export interface ErrorHandlerOptions {
  context: string;
  defaultCode?: keyof typeof ERROR_CODES;
  rethrow?: boolean;
  logger?: typeof logger;
}

export interface HandledError {
  code: string;
  type: ErrorType;
  message: string;
  suggestion: string;
  context: string;
  timestamp: number;
  originalError?: unknown;
}

export function createErrorHandler<T = unknown>(
  options: ErrorHandlerOptions
): (promise: Promise<T>) => Promise<T> {
  const { context, defaultCode = "INTERNAL_ERROR", rethrow = true, logger: customLogger } = options;

  return function errorMiddleware(promise: Promise<T>): Promise<T> {
    return promise.catch((error) => {
      const errorInfo = ErrorClassifier.handleError(
        error,
        context,
        ERROR_CODES[defaultCode as keyof typeof ERROR_CODES] || ERROR_CODES.INTERNAL_ERROR
      );

      const log = customLogger || logger;
      log.error(`[${context}] Error:`, {
        code: errorInfo.code,
        type: ErrorType[errorInfo.type],
        message: errorInfo.message,
        suggestion: errorInfo.suggestion,
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (rethrow) {
        const wrappedError = new Error(errorInfo.message);
        (wrappedError as any).code = errorInfo.code;
        (wrappedError as any).type = errorInfo.type;
        (wrappedError as any).suggestion = errorInfo.suggestion;
        (wrappedError as any).context = context;
        (wrappedError as any).handledError = errorInfo;
        throw wrappedError;
      }

      return errorInfo as unknown as T;
    });
  };
}

export function handleErrorSync<T>(
  fn: () => T,
  context: string,
  defaultCode: keyof typeof ERROR_CODES = "INTERNAL_ERROR"
): T {
  try {
    return fn();
  } catch (error) {
    const errorInfo = ErrorClassifier.handleError(
      error,
      context,
      ERROR_CODES[defaultCode] || ERROR_CODES.INTERNAL_ERROR
    );

    logger.error(`[${context}] Error:`, {
      code: errorInfo.code,
      type: ErrorType[errorInfo.type],
      message: errorInfo.message,
      suggestion: errorInfo.suggestion,
    });

    const wrappedError = new Error(errorInfo.message);
    (wrappedError as any).code = errorInfo.code;
    (wrappedError as any).handledError = errorInfo;
    throw wrappedError;
  }
}

export const handleMCPError = createErrorHandler({ context: "MCP" });
export const handleToolError = createErrorHandler({ context: "Tool" });
export const handleSkillError = createErrorHandler({ context: "Skill" });
export const handleVectorError = createErrorHandler({
  context: "VectorDB",
  defaultCode: "VECTOR_DB_ERROR",
});
export const handleLLMError = createErrorHandler({ context: "LLM", defaultCode: "INTERNAL_ERROR" });
