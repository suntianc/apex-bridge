/**
 * HTTP Response utilities
 * Unified helpers for common HTTP response patterns across controllers
 */

import { Response } from "express";
import { logger } from "./logger";
import { formatErrorMessage } from "./error-utils";

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
  message: string = "Service temporarily unavailable"
): void {
  res.status(503).json({
    error: {
      message,
      type: "server_error",
      code: "SERVICE_UNAVAILABLE",
    },
  });
}

/**
 * Send 201 Created response
 */
export function created<T>(res: Response, data: T): void {
  res.status(201).json({
    data,
    success: true,
  });
}

/**
 * Send 200 OK response
 */
export function ok<T>(res: Response, data: T): void {
  res.status(200).json({
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
 * Handle error with automatic status code detection based on error message
 * Returns true if error was handled, false if it should be handled by caller
 */
export function handleErrorWithAutoDetection(
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
