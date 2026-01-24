/**
 * ApexBridge API Response Types
 * Unified response types for v2.0 API
 *
 * This file provides standardized types for API responses,
 * replacing scattered definitions across common.ts and errors.ts
 *
 * @version v2.0 - Response format optimized
 * - Removed redundant 'success' field
 * - Unified Result type with discriminated union
 */

import { AppError } from "./errors";

/**
 * Generic operation result using discriminated union
 * Provides better TypeScript inference than legacy Result<T>
 *
 * @example
 * const result: Result<User> = { success: true, data: user };
 * if (result.success) {
 *   console.log(result.data); // TypeScript knows this is User
 * }
 */
export type Result<T> = { success: true; data: T } | { success: false; error: AppError };

/**
 * Paginated response type
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * API response wrapper (optional - for consistency)
 * Note: For v2.0, we recommend returning data directly without wrapper
 */
export interface ApiResponse<T> {
  data: T;
  timestamp?: string;
}

/**
 * List response wrapper for consistency
 */
export interface ListResponse<T> {
  items: T[];
  total: number;
}

/**
 * Create a successful result
 */
export function successResult<T>(data: T): Result<T> {
  return { success: true, data };
}

/**
 * Create a failed result
 */
export function failureResult<T>(error: AppError): Result<T> {
  return { success: false, error };
}

/**
 * Create a paginated response
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  return {
    items,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

/**
 * Create a list response
 */
export function listResponse<T>(items: T[], total: number): ListResponse<T> {
  return { items, total };
}
