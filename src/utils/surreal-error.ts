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
