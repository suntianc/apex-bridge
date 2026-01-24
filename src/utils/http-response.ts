/**
 * HTTP Response utilities
 * Unified helpers for common HTTP response patterns across controllers
 *
 * @version v2.0 - API response format optimized
 * - Removed redundant 'success' field (HTTP status already indicates success)
 * - Added sendOk()/sendCreated() for cleaner responses
 * - Old functions (ok/created) marked @deprecated
 */
/* eslint-disable no-restricted-syntax -- This file IS the http-response utility */

import { Response } from "express";
import { logger } from "./logger";
import { formatErrorMessage } from "./error-utils";
import {
  isAppError,
  getErrorCode,
  getHttpStatus,
  getStatusCodeForErrorCode,
  getErrorTypeString,
  getErrorTypeFromStatus,
} from "../types/errors";

// ============================================================================
// v2.0 API Response Functions (Recommended)
// ============================================================================

/**
 * Send 200 OK response (v2.0 API - no success field)
 * Use this instead of ok() for cleaner, more RESTful responses
 *
 * @example
 * sendOk(res, { users: [...], total: 100 });
 * // Returns: { users: [...], total: 100 }
 */
export function sendOk<T>(res: Response, data: T): void {
  res.status(200).json(data);
}

/**
 * Send 201 Created response (v2.0 API - no success field)
 * Use this instead of created() for cleaner, more RESTful responses
 *
 * @example
 * sendCreated(res, { id: 123, created: "2026-01-24" });
 * // Returns: { id: 123, created: "2026-01-24" }
 */
export function sendCreated<T>(res: Response, data: T): void {
  res.status(201).json(data);
}

/**
 * Standard error response format (OpenAI-compatible)
 */
export interface ErrorResponse {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

/**
 * Simple error response format
 */
export interface SimpleErrorResponse {
  error: string;
  message: string;
}

/**
 * Standard success response format
 */
export interface SuccessResponse<T = unknown> {
  data: T;
  success?: boolean;
}

/**
 * Send 400 Bad Request response
 */
export function badRequest(
  res: Response,
  message: string,
  details?: Record<string, unknown>
): void {
  res.status(400).json({
    error: {
      message,
      type: "invalid_request",
      ...details,
    },
  });
}

/**
 * Send 401 Unauthorized response
 */
export function unauthorized(res: Response, message: string = "Unauthorized"): void {
  res.status(401).json({
    error: {
      message,
      type: "authentication_error",
      code: "UNAUTHORIZED",
    },
  });
}

/**
 * Send 403 Forbidden response
 */
export function forbidden(res: Response, message: string = "Forbidden"): void {
  res.status(403).json({
    error: {
      message,
      type: "permission_denied",
      code: "FORBIDDEN",
    },
  });
}

/**
 * Send 404 Not Found response
 */
export function notFound(res: Response, message: string = "Resource not found"): void {
  res.status(404).json({
    error: {
      message,
      type: "invalid_request",
      code: "NOT_FOUND",
    },
  });
}

/**
 * Send 409 Conflict response (resource already exists)
 */
export function conflict(res: Response, message: string = "Resource already exists"): void {
  res.status(409).json({
    error: {
      message,
      type: "invalid_request",
      code: "RESOURCE_CONFLICT",
    },
  });
}

/**
 * Send 422 Unprocessable Entity response (validation error)
 */
export function unprocessableEntity(
  res: Response,
  message: string = "Validation failed",
  details?: Record<string, unknown>
): void {
  res.status(422).json({
    error: {
      message,
      type: "invalid_request",
      code: "VALIDATION_ERROR",
      ...details,
    },
  });
}

/**
 * Send 429 Too Many Requests response (rate limit exceeded)
 */
export function tooManyRequests(
  res: Response,
  message: string = "Too many requests",
  retryAfter?: number
): void {
  const response: Record<string, unknown> = {
    error: {
      message,
      type: "rate_limit_error",
      code: "RATE_LIMIT_EXCEEDED",
    },
  };
  if (retryAfter !== undefined) {
    response.retryAfter = retryAfter;
  }
  res.status(429).json(response);
}

/**
 * Send 500 Internal Server Error response
 */
export function serverError(res: Response, error: unknown, context?: string): void {
  const errorMessage = formatErrorMessage(error);
  const message = context ? `${context}: ${errorMessage}` : errorMessage;

  logger.error(`Server error: ${message}`);

  res.status(500).json({
    error: {
      message,
      type: "server_error",
      code: "INTERNAL_ERROR",
    },
  });
}

/**
 * Send 503 Service Unavailable response
 */
export function serviceUnavailable(
  res: Response,
  message: string = "Service temporarily unavailable",
  type: string = "server_error",
  code: string = "SERVICE_UNAVAILABLE"
): void {
  res.status(503).json({
    error: {
      message,
      type,
      code,
    },
  });
}

// ============================================================================
// Legacy Response Functions (Deprecated - to be removed in v2.0)
// ============================================================================

/**
 * @deprecated Use sendOk() instead - will be removed in v2.0
 * Reason: success field is redundant (HTTP status already indicates success)
 *
 * @example
 * // Legacy usage (avoid):
 * ok(res, { data: result, success: true });
 *
 * // Recommended (v2.0):
 * sendOk(res, result);
 */
export function ok<T>(res: Response, data: T): void {
  res.status(200).json({
    data,
    success: true,
  });
}

/**
 * @deprecated Use sendCreated() instead - will be removed in v2.0
 * Reason: success field is redundant (HTTP status already indicates success)
 *
 * @example
 * // Legacy usage (avoid):
 * created(res, { data: result, success: true });
 *
 * // Recommended (v2.0):
 * sendCreated(res, result);
 */
export function created<T>(res: Response, data: T): void {
  res.status(201).json({
    data,
    success: true,
  });
}

/**
 * Send 204 No Content response
 */
export function noContent(res: Response): void {
  res.status(204).send();
}

/**
 * Enhanced error handler with type-safe error detection
 * Priority: AppError > ErrorCode > HTTP Status > String matching (fallback)
 *
 * @param res - Express Response object
 * @param error - The error to handle
 * @param action - Context for logging
 * @returns true if error was handled, false if caller should handle
 */
export function handleErrorWithAutoDetection(
  res: Response,
  error: unknown,
  action: string
): boolean {
  // Priority 1: AppError type check (most reliable)
  if (isAppError(error)) {
    const statusCode = error.getStatusCode();
    res.status(statusCode).json({
      error: {
        message: error.message,
        type: getErrorTypeString(error.code),
        code: error.code,
      },
    });
    return true;
  }

  // Priority 2: Extract ErrorCode
  const errorCode = getErrorCode(error);
  if (errorCode) {
    const statusCode = getStatusCodeForErrorCode(errorCode);
    res.status(statusCode).json({
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: getErrorTypeString(errorCode),
        code: errorCode,
      },
    });
    return true;
  }

  // Priority 3: Extract HTTP status code directly
  const httpStatus = getHttpStatus(error);
  if (httpStatus !== null) {
    res.status(httpStatus).json({
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: getErrorTypeFromStatus(httpStatus),
        code: `HTTP_${httpStatus}`,
      },
    });
    return true;
  }

  // Priority 4: String matching (legacy fallback)
  return legacyHandleErrorWithAutoDetection(res, error, action);
}

/**
 * Legacy string-matching error detection (kept as fallback)
 */
function legacyHandleErrorWithAutoDetection(
  res: Response,
  error: unknown,
  action: string
): boolean {
  const msg = formatErrorMessage(error).toLowerCase();

  if (msg.includes("not found") || msg.includes("does not exist")) {
    notFound(res, formatErrorMessage(error));
    return true;
  }

  if (msg.includes("already exists") || msg.includes("duplicate")) {
    conflict(res, formatErrorMessage(error));
    return true;
  }

  if (msg.includes("required") || msg.includes("invalid") || msg.includes("validation")) {
    badRequest(res, formatErrorMessage(error));
    return true;
  }

  if (msg.includes("unauthorized") || msg.includes("authentication")) {
    unauthorized(res, formatErrorMessage(error));
    return true;
  }

  if (msg.includes("forbidden") || msg.includes("permission")) {
    forbidden(res, formatErrorMessage(error));
    return true;
  }

  serverError(res, error, action);
  return true;
}

/**
 * Handle async error with try-catch wrapper
 * Automatically sends appropriate error response
 */
export async function withErrorHandler<T>(
  res: Response,
  action: string,
  handler: () => Promise<T>
): Promise<T | null> {
  try {
    return await handler();
  } catch (error) {
    handleErrorWithAutoDetection(res, error, action);
    return null;
  }
}

/**
 * Handle sync error with try-catch wrapper
 */
export function withErrorHandlerSync<T>(res: Response, action: string, handler: () => T): T | null {
  try {
    return handler();
  } catch (error) {
    handleErrorWithAutoDetection(res, error, action);
    return null;
  }
}

export function dynamicStatus(res: Response, status: number, data: Record<string, unknown>): void {
  res.status(status).json(data);
}
