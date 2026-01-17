import {
  SurrealDBError,
  SurrealDBErrorCode,
  isSurrealDBError,
  getErrorCode,
  wrapSurrealDBError,
} from "@/utils/surreal-error";

describe("SurrealDBError", () => {
  describe("constructor", () => {
    it("should create error with all properties", () => {
      const error = new SurrealDBError(
        SurrealDBErrorCode.QUERY_FAILED,
        "Query execution failed",
        "query",
        { sql: "SELECT * FROM test" }
      );

      expect(error.code).toBe("SDB_QUERY_001");
      expect(error.message).toBe("[SDB_QUERY_001] Query execution failed");
      expect(error.operation).toBe("query");
      expect(error.details).toEqual({ sql: "SELECT * FROM test" });
      expect(error.name).toBe("SurrealDBError");
    });

    it("should create error without details", () => {
      const error = new SurrealDBError(
        SurrealDBErrorCode.CONNECTION_FAILED,
        "Connection failed",
        "connect"
      );

      expect(error.code).toBe("SDB_CONN_001");
      expect(error.details).toBeUndefined();
    });
  });

  describe("isSurrealDBError", () => {
    it("should return true for SurrealDBError", () => {
      const error = new SurrealDBError(
        SurrealDBErrorCode.CONNECTION_FAILED,
        "Connection failed",
        "connect"
      );
      expect(isSurrealDBError(error)).toBe(true);
    });

    it("should return false for other errors", () => {
      expect(isSurrealDBError(new Error("regular error"))).toBe(false);
    });

    it("should return false for null", () => {
      expect(isSurrealDBError(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isSurrealDBError(undefined)).toBe(false);
    });

    it("should return false for strings", () => {
      expect(isSurrealDBError("error message")).toBe(false);
    });
  });

  describe("getErrorCode", () => {
    it("should return code for SurrealDBError", () => {
      const error = new SurrealDBError(SurrealDBErrorCode.SELECT_FAILED, "Select failed", "select");
      expect(getErrorCode(error)).toBe("SDB_QUERY_002");
    });

    it("should return UNKNOWN for other errors", () => {
      expect(getErrorCode(new Error("test"))).toBe("UNKNOWN");
    });

    it("should return UNKNOWN for non-error values", () => {
      expect(getErrorCode(null)).toBe("UNKNOWN");
      expect(getErrorCode("string error")).toBe("UNKNOWN");
    });
  });

  describe("wrapSurrealDBError", () => {
    it("should return original error if already SurrealDBError", () => {
      const original = new SurrealDBError(
        SurrealDBErrorCode.QUERY_FAILED,
        "Original error",
        "query"
      );
      const wrapped = wrapSurrealDBError(original, "operation", SurrealDBErrorCode.SELECT_FAILED);
      expect(wrapped).toBe(original);
    });

    it("should wrap regular error with new SurrealDBError", () => {
      const original = new Error("Database error");
      const wrapped = wrapSurrealDBError(original, "select", SurrealDBErrorCode.SELECT_FAILED, {
        table: "users",
      });

      expect(isSurrealDBError(wrapped)).toBe(true);
      expect(wrapped.code).toBe(SurrealDBErrorCode.SELECT_FAILED);
      expect(wrapped.operation).toBe("select");
      expect(wrapped.details).toEqual({ table: "users" });
    });

    it("should wrap string error", () => {
      const wrapped = wrapSurrealDBError("Unknown error", "query", SurrealDBErrorCode.QUERY_FAILED);
      expect(wrapped.message).toBe("[SDB_QUERY_001] Unknown error");
    });
  });
});

describe("SurrealDBErrorCode", () => {
  it("should have all expected connection error codes", () => {
    expect(SurrealDBErrorCode.CONNECTION_FAILED).toBe("SDB_CONN_001");
    expect(SurrealDBErrorCode.CONNECTION_TIMEOUT).toBe("SDB_CONN_002");
    expect(SurrealDBErrorCode.ALREADY_CONNECTED).toBe("SDB_CONN_003");
    expect(SurrealDBErrorCode.NOT_CONNECTED).toBe("SDB_CONN_004");
  });

  it("should have all expected query error codes", () => {
    expect(SurrealDBErrorCode.QUERY_FAILED).toBe("SDB_QUERY_001");
    expect(SurrealDBErrorCode.SELECT_FAILED).toBe("SDB_QUERY_002");
    expect(SurrealDBErrorCode.CREATE_FAILED).toBe("SDB_QUERY_003");
    expect(SurrealDBErrorCode.UPDATE_FAILED).toBe("SDB_QUERY_004");
    expect(SurrealDBErrorCode.DELETE_FAILED).toBe("SDB_QUERY_005");
  });

  it("should have all expected transaction error codes", () => {
    expect(SurrealDBErrorCode.TRANSACTION_FAILED).toBe("SDB_TXN_001");
    expect(SurrealDBErrorCode.TRANSACTION_TIMEOUT).toBe("SDB_TXN_002");
    expect(SurrealDBErrorCode.NESTED_TRANSACTION).toBe("SDB_TXN_003");
  });

  it("should have all expected record error codes", () => {
    expect(SurrealDBErrorCode.RECORD_NOT_FOUND).toBe("SDB_REC_001");
    expect(SurrealDBErrorCode.RECORD_ALREADY_EXISTS).toBe("SDB_REC_002");
  });

  it("should have all expected argument error codes", () => {
    expect(SurrealDBErrorCode.INVALID_PARAMETER).toBe("SDB_ARG_001");
    expect(SurrealDBErrorCode.INVALID_VECTOR_DIMENSION).toBe("SDB_ARG_002");
  });

  it("should have all expected internal error codes", () => {
    expect(SurrealDBErrorCode.INTERNAL_ERROR).toBe("SDB_INT_001");
    expect(SurrealDBErrorCode.UNKNOWN_ERROR).toBe("SDB_INT_002");
  });
});
