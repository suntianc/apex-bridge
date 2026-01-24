/**
 * Error handling utilities
 * Shared helpers for error processing and type checking across the codebase
 */

import { logger } from "@/utils/logger";

/**
 * Format error to string message
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

/**
 * Format error with stack trace for debugging
 */
export function formatErrorWithStack(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack || ""}`;
  }
  return formatErrorMessage(error);
}

/**
 * Format error response data for logging
 * Extracts data from common error response structures (Axios, fetch, etc.)
 */
export function formatErrorData(error: unknown): string {
  if (!error || typeof error !== "object") {
    return formatErrorMessage(error);
  }

  const err = error as Record<string, unknown>;

  // Handle axios-style error.response.data
  if (err.response && typeof err.response === "object") {
    const response = err.response as Record<string, unknown>;
    if (response.data && typeof response.data === "object") {
      return JSON.stringify(response.data, null, 2);
    }
  }

  // Handle fetch-style error.response
  if (err.response && typeof err.response === "string") {
    try {
      const parsed = JSON.parse(err.response);
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      logger.debug(`[error-utils] Failed to parse error response JSON`, error);
      return err.response;
    }
  }

  // Handle direct data property
  if (err.data && typeof err.data === "object") {
    return JSON.stringify(err.data, null, 2);
  }

  // Fallback to string representation
  return formatErrorMessage(error);
}

/**
 * Check if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Check if value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/**
 * Check if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * Check if value is a function
 */
export function isFunction(value: unknown): value is Function {
  return typeof value === "function";
}

/**
 * Check if value is an object (not null, not array)
 */
export function isObject<T extends Record<string, unknown>>(value: unknown): value is T {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Check if value is an array
 */
export function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Check if value is null or undefined
 */
export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value: unknown): boolean {
  if (isNil(value)) {
    return true;
  }
  if (isString(value) && value === "") {
    return true;
  }
  if (isArray(value) && value.length === 0) {
    return true;
  }
  if (isObject(value) && Object.keys(value).length === 0) {
    return true;
  }
  return false;
}

/**
 * Check if value is a promise
 */
export function isPromise(value: unknown): value is Promise<unknown> {
  return isObject(value) && isFunction((value as { then?: Function }).then);
}

/**
 * Safe wrapper for functions that might throw
 */
export function safeCall<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  ...args: Args
): T | null {
  try {
    return fn(...args);
  } catch (error) {
    logger.debug(`[error-utils] safeCall failed`, error);
    return null;
  }
}

/**
 * Async safe wrapper for promises
 */
export async function safeAsync<T>(
  promise: Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await promise;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

/**
 * Create a rejected promise with formatted error
 */
export function rejectWithError(error: unknown): Promise<never> {
  return Promise.reject(new Error(formatErrorMessage(error)));
}

/**
 * Extract error code from error if available
 */
export function getErrorCode(error: unknown): string | null {
  if (isObject(error) && "code" in error) {
    return (error as { code: string }).code || null;
  }
  return null;
}

/**
 * Check if error is a specific type by error code
 */
export function isErrorWithCode(error: unknown, code: string): boolean {
  return getErrorCode(error) === code;
}

/**
 * Normalize value to array (if not already)
 */
export function toArray<T>(value: T | T[]): T[] {
  if (isArray(value)) {
    return value;
  }
  return [value];
}

/**
 * Get nested property safely
 */
export function getNestedValue<T>(
  obj: Record<string, unknown>,
  path: string,
  defaultValue?: T
): T | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (isObject(current) && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return defaultValue;
    }
  }

  return current as T;
}

/**
 * Deep clone object (simple version for JSON-compatible objects)
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Merge objects deeply
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  if (sources.length === 0) {
    return target;
  }

  const source = sources.shift();
  if (!source) {
    return target;
  }

  for (const key of Object.keys(source)) {
    if (isObject(source[key]) && isObject(target[key])) {
      (target as Record<string, unknown>)[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else if (source[key] !== undefined) {
      (target as Record<string, unknown>)[key] = source[key];
    }
  }

  return deepMerge(target, ...sources);
}

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function execution
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Measure execution time of a function
 */
export function measureTime<T>(fn: () => T): { result: T; duration: number } {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  return { result, duration };
}

/**
 * Async version of measureTime
 */
export async function measureAsyncTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}

/**
 * 将 Error 对象转换为可序列化的普通对象
 * @param error - 错误对象
 * @returns 可序列化的普通对象
 */
export function errorToPlainObject(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const result: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if (error.stack) {
      result.stack = error.stack;
    }
    if ("cause" in error) {
      result.cause = error.cause;
    }
    return result;
  }

  if (typeof error === "object" && error !== null) {
    return { ...error };
  }

  return { value: String(error) };
}
