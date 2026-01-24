/**
 * Common result types
 * Unified interfaces for operation results across the codebase
 */

/**
 * Validation result with errors and warnings
 */
export interface ValidationResult<T = unknown> {
  valid: boolean;
  data?: T;
  errors: string[];
  warnings?: string[];
}

/**
 * Pagination result
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Create a validation result
 */
export function createValidationResult<T>(
  valid: boolean,
  data?: T,
  errors: string[] = [],
  warnings: string[] = []
): ValidationResult<T> {
  return {
    valid,
    data,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Create a successful validation result
 */
export function validResult<T>(data: T, warnings: string[] = []): ValidationResult<T> {
  return createValidationResult(true, data, [], warnings);
}

/**
 * Create a failed validation result
 */
export function invalidResult<T>(errors: string[], warnings: string[] = []): ValidationResult<T> {
  return createValidationResult(false, undefined, errors, warnings);
}

/**
 * Create a paginated result
 */
export function paginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  return {
    items,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}
