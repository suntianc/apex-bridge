/**
 * Request parsing utilities
 * Unified helpers for parsing request parameters (query, path, body)
 */

import { Request, Response } from "express";
import { badRequest } from "./http-response";

/**
 * Query string parsed object type from Express
 */
type ParsedQueryValue = string | string[] | undefined;

/**
 * Normalize a string | string[] value to a single string
 * Express can return arrays for params/query/headers in certain routing scenarios
 */
/* eslint-disable no-redeclare -- TypeScript function overloads are intentional */
export function toString(value: string | string[] | undefined): string | undefined;
export function toString(value: any): string | undefined;
export function toString(value: string | string[] | undefined | any): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

/**
 * Parse integer from string with default fallback
 */
export function parseIntParam(value: string | undefined, defaultValue: number): number {
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse integer ID from request path parameter
 */
export function parseIdParam(req: Request, paramName: string): number | null {
  const value = toString(req.params[paramName]);
  if (!value) {
    return null;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Parse integer ID from request path parameter with default
 */
export function parseIdParamWithDefault(
  req: Request,
  paramName: string,
  defaultValue: number
): number {
  const value = toString(req.params[paramName]);
  return parseIntParam(value, defaultValue);
}

/**
 * Parse pagination parameters from query string
 */
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export function parsePaginationParams(
  req: Request,
  defaults: Partial<PaginationParams> = {}
): PaginationParams {
  const defaultPage = defaults.page ?? 1;
  const defaultLimit = defaults.limit ?? 50;

  const page = parseIntParam(req.query.page as string | undefined, defaultPage);
  const limit = parseIntParam(req.query.limit as string | undefined, defaultLimit);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Parse limit and offset from query string
 */
export interface LimitOffsetParams {
  limit: number;
  offset: number;
}

export function parseLimitOffsetParams(
  req: Request,
  defaultLimit: number = 100,
  defaultOffset: number = 0
): LimitOffsetParams {
  const limit = parseIntParam(req.query.limit as string | undefined, defaultLimit);
  const offset = parseIntParam(req.query.offset as string | undefined, defaultOffset);
  return { limit, offset };
}

/**
 * Parse boolean from string
 */
export function parseBooleanParam(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === "true" || value === "1";
}

/**
 * Parse array from comma-separated string
 */
export function parseArrayParam(value: string | undefined, defaultValue: string[] = []): string[] {
  if (!value || typeof value !== "string") {
    return defaultValue;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Parse filter options from query string
 */
export interface FilterOptions {
  search?: string;
  tags?: string[];
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export function parseFilterOptions(req: Request): FilterOptions {
  return {
    search: req.query.search as string | undefined,
    tags: parseArrayParam(req.query.tags as string | undefined),
    status: req.query.status as string | undefined,
    sortBy: req.query.sortBy as string | undefined,
    sortOrder: parseSortOrder(req.query.sortOrder as string | undefined),
  };
}

/**
 * Parse sort order
 */
export function parseSortOrder(
  value: string | undefined,
  defaultValue: "asc" | "desc" = "desc"
): "asc" | "desc" {
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === "asc" ? "asc" : "desc";
}

/**
 * Validate required parameters
 */
export function validateRequiredParams(req: Request, params: string[], res: Response): boolean {
  const missing: string[] = [];

  for (const param of params) {
    const value = req.params[param] ?? req.query[param] ?? req.body[param];
    if (value === undefined || value === null || value === "") {
      missing.push(param);
    }
  }

  if (missing.length > 0) {
    badRequest(res, `Missing required parameters: ${missing.join(", ")}`, {
      code: "MISSING_PARAMS",
    });
    return false;
  }

  return true;
}

/**
 * Extract provider ID and model ID from request
 */
export function extractProviderAndModelIds(req: Request): {
  providerId: number | null;
  modelId: number | null;
} {
  return {
    providerId: parseIdParam(req, "providerId"),
    modelId: parseIdParam(req, "modelId"),
  };
}

/**
 * Extract provider ID from request with default
 */
export function extractProviderId(req: Request, defaultValue: number = 1): number {
  return parseIdParamWithDefault(req, "providerId", defaultValue);
}

/**
 * Extract model ID from request with default
 */
export function extractModelId(req: Request, defaultValue: number = 1): number {
  return parseIdParamWithDefault(req, "modelId", defaultValue);
}
