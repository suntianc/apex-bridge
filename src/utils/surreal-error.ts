/**
 * SurrealDB Standardized Error Handling Module
 *
 * Provides consistent error codes, types, and utilities for all SurrealDB operations.
 */

export enum SurrealDBErrorCode {
  CONNECTION_FAILED = "SDB_CONN_001",
  CONNECTION_TIMEOUT = "SDB_CONN_002",
  ALREADY_CONNECTED = "SDB_CONN_003",
  NOT_CONNECTED = "SDB_CONN_004",

  QUERY_FAILED = "SDB_QUERY_001",
  SELECT_FAILED = "SDB_QUERY_002",
  CREATE_FAILED = "SDB_QUERY_003",
  UPDATE_FAILED = "SDB_QUERY_004",
  DELETE_FAILED = "SDB_QUERY_005",

  TRANSACTION_FAILED = "SDB_TXN_001",
  TRANSACTION_TIMEOUT = "SDB_TXN_002",
  NESTED_TRANSACTION = "SDB_TXN_003",

  RECORD_NOT_FOUND = "SDB_REC_001",
  RECORD_ALREADY_EXISTS = "SDB_REC_002",

  INVALID_PARAMETER = "SDB_ARG_001",
  INVALID_VECTOR_DIMENSION = "SDB_ARG_002",

  INTERNAL_ERROR = "SDB_INT_001",
  UNKNOWN_ERROR = "SDB_INT_002",
}

export class SurrealDBError extends Error {
  constructor(
    public code: SurrealDBErrorCode,
    message: string,
    public operation: string,
    public details?: unknown
  ) {
    super(`[${code}] ${message}`);
    this.name = "SurrealDBError";
  }
}

export function isSurrealDBError(error: unknown): error is SurrealDBError {
  return error instanceof SurrealDBError;
}

export function getErrorCode(error: unknown): string {
  if (isSurrealDBError(error)) {
    return error.code;
  }
  return "UNKNOWN";
}

export function wrapSurrealDBError(
  error: unknown,
  operation: string,
  code: SurrealDBErrorCode,
  details?: unknown
): SurrealDBError {
  if (isSurrealDBError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new SurrealDBError(code, message, operation, details);
}

// ============================================================================
// Error Pattern Matching (统一错误映射)
// ============================================================================

const SURREALDB_ERROR_PATTERNS: Array<{
  pattern: RegExp;
  code: SurrealDBErrorCode;
}> = [
  { pattern: /not connected/i, code: SurrealDBErrorCode.NOT_CONNECTED },
  { pattern: /timeout|timed out/i, code: SurrealDBErrorCode.CONNECTION_TIMEOUT },
  { pattern: /already exists|already registered/i, code: SurrealDBErrorCode.RECORD_ALREADY_EXISTS },
  { pattern: /not found|record not found|no such/i, code: SurrealDBErrorCode.RECORD_NOT_FOUND },
  { pattern: /connection failed/i, code: SurrealDBErrorCode.CONNECTION_FAILED },
];

const SURREALDB_CONFLICT_PATTERNS = [
  /read or write conflict/i,
  /can be retried/i,
  /failed to commit transaction/i,
];

/**
 * 判断 SurrealDB 错误是否可重试（读写冲突类错误）
 */
export function isSurrealDBConflictRetryable(error: unknown): boolean {
  if (isSurrealDBError(error)) {
    // 事务失败错误通常可重试
    if (error.code === SurrealDBErrorCode.TRANSACTION_FAILED) {
      return true;
    }
    // QUERY_FAILED 需要检查消息
    if (error.code === SurrealDBErrorCode.QUERY_FAILED) {
      const lowerMessage = error.message.toLowerCase();
      return SURREALDB_CONFLICT_PATTERNS.some((pattern) => pattern.test(lowerMessage));
    }
    return false;
  }

  // 非 SurrealDBError，检查消息
  const message = error instanceof Error ? error.message : String(error);
  return SURREALDB_CONFLICT_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * 通用错误映射函数（统一错误字符串匹配逻辑）
 */
export function mapToSurrealDBError(
  error: unknown,
  operation: string,
  details?: unknown
): SurrealDBError {
  if (isSurrealDBError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // 按优先级匹配模式
  for (const { pattern, code } of SURREALDB_ERROR_PATTERNS) {
    if (pattern.test(lowerMessage)) {
      return wrapSurrealDBError(error, operation, code, details);
    }
  }

  return wrapSurrealDBError(error, operation, SurrealDBErrorCode.QUERY_FAILED, details);
}
