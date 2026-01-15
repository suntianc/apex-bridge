/**
 * Storage Adapter Utilities
 *
 * Common utilities for storage adapters including ID parsing and pagination validation.
 */

import { logger } from "../../utils/logger";

export interface ParsedStorageId {
  raw: string;
  numeric: number | null;
  string: string;
}

export function parseStorageId(id: string): ParsedStorageId {
  if (!id || typeof id !== "string") {
    const error = new Error(`Invalid storage ID: must be a non-empty string, got ${typeof id}`);
    logger.error("[Storage] Invalid ID:", { id, type: typeof id });
    throw error;
  }

  const trimmed = id.trim();
  if (trimmed.length === 0) {
    const error = new Error("Invalid storage ID: cannot be empty or whitespace only");
    logger.error("[Storage] Empty ID:", { id });
    throw error;
  }

  const numericValue = Number(trimmed);
  const isNumeric = !isNaN(numericValue) && isFinite(numericValue);

  return {
    raw: trimmed,
    numeric: isNumeric ? numericValue : null,
    string: trimmed,
  };
}

export function parseStorageIdAsNumber(id: string): number {
  const parsed = parseStorageId(id);
  if (parsed.numeric === null) {
    const error = new Error(`Invalid storage ID: "${id}" is not a valid number`);
    logger.error("[Storage] Non-numeric ID for numeric context:", { id });
    throw error;
  }
  return parsed.numeric;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginationValidationResult {
  limit: number;
  offset: number;
  wasClamped: boolean;
  warnings: string[];
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 10000;
const MAX_OFFSET = 100000;

export function validatePagination(options: {
  limit?: number;
  offset?: number;
  defaultLimit?: number;
}): PaginationValidationResult {
  const limit = options.limit ?? options.defaultLimit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  const warnings: string[] = [];
  let wasClamped = false;

  let validatedLimit = limit;
  let validatedOffset = offset;

  if (validatedLimit < 0) {
    validatedLimit = 0;
    warnings.push(`limit was negative (${limit}), set to 0`);
  } else if (validatedLimit > MAX_LIMIT) {
    validatedLimit = MAX_LIMIT;
    warnings.push(`limit exceeded maximum (${limit} > ${MAX_LIMIT}), clamped to ${MAX_LIMIT}`);
  }

  if (validatedOffset < 0) {
    validatedOffset = 0;
    warnings.push(`offset was negative (${offset}), set to 0`);
  } else if (validatedOffset > MAX_OFFSET) {
    validatedOffset = MAX_OFFSET;
    warnings.push(`offset exceeded maximum (${offset} > ${MAX_OFFSET}), clamped to ${MAX_OFFSET}`);
  }

  if (warnings.length > 0) {
    wasClamped = true;
    for (const warning of warnings) {
      logger.warn(`[Storage] Pagination validation: ${warning}`);
    }
  }

  return {
    limit: validatedLimit,
    offset: validatedOffset,
    wasClamped,
    warnings,
  };
}

export function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "''");
}
