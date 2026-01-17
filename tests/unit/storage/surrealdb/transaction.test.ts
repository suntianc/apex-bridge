import { SurrealDBClient } from "@/core/storage/surrealdb/client";
import { SurrealDBError, SurrealDBErrorCode } from "@/utils/surreal-error";

describe("SurrealDBClient - Transaction", () => {
  let client: SurrealDBClient;

  beforeEach(async () => {
    client = SurrealDBClient.getInstance();
    await client.disconnect();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe("transaction state", () => {
    it("should track transaction depth", () => {
      expect((client as any).transactionDepth).toBe(0);
    });
  });

  describe("beginTransaction", () => {
    it("should throw error when already in transaction", async () => {
      (client as any).transactionDepth = 1;

      await expect(client.beginTransaction()).rejects.toThrow(SurrealDBError);
      await expect(client.beginTransaction()).rejects.toMatchObject({
        code: SurrealDBErrorCode.NESTED_TRANSACTION,
      });
    });
  });

  describe("commitTransaction", () => {
    it("should throw error when no active transaction", async () => {
      (client as any).transactionDepth = 0;

      await expect(client.commitTransaction()).rejects.toThrow(SurrealDBError);
      await expect(client.commitTransaction()).rejects.toMatchObject({
        code: SurrealDBErrorCode.TRANSACTION_FAILED,
      });
    });

    it("should throw error when transaction depth is not 1", async () => {
      (client as any).transactionDepth = 2;

      await expect(client.commitTransaction()).rejects.toThrow(SurrealDBError);
      await expect(client.commitTransaction()).rejects.toMatchObject({
        code: SurrealDBErrorCode.TRANSACTION_FAILED,
      });
    });
  });

  describe("rollbackTransaction", () => {
    it("should do nothing when no active transaction", async () => {
      (client as any).transactionDepth = 0;

      await client.rollbackTransaction();

      expect((client as any).transactionDepth).toBe(0);
    });

    it("should reset transaction depth after rollback", async () => {
      (client as any).transactionDepth = 1;

      await client.rollbackTransaction();

      expect((client as any).transactionDepth).toBe(0);
    });
  });

  describe("withTransaction", () => {
    it("should execute function within transaction", async () => {
      const querySpy = jest.spyOn(client as any, "query");
      querySpy.mockResolvedValue(undefined);

      const result = await client.withTransaction(async () => {
        return "success";
      });

      expect(result).toBe("success");
      expect(querySpy).toHaveBeenCalledWith("BEGIN TRANSACTION");
      expect(querySpy).toHaveBeenCalledWith("COMMIT TRANSACTION");
    });

    it("should rollback on error", async () => {
      const querySpy = jest.spyOn(client as any, "query");
      querySpy.mockResolvedValue(undefined);

      await expect(
        client.withTransaction(async () => {
          throw new Error("Test error");
        })
      ).rejects.toThrow("Test error");

      expect(querySpy).toHaveBeenCalledWith("CANCEL TRANSACTION");
    });

    it("should reset transaction depth on error", async () => {
      const querySpy = jest.spyOn(client as any, "query");
      querySpy.mockResolvedValue(undefined);

      try {
        await client.withTransaction(async () => {
          throw new Error("Test error");
        });
      } catch (e) {}

      expect((client as any).transactionDepth).toBe(0);
    });
  });

  describe("error mapping", () => {
    it("should map connection errors", () => {
      const error = new Error("not connected to database");
      const mapped = (client as any).mapToSurrealDBError(error, "connect");

      expect(mapped.code).toBe(SurrealDBErrorCode.NOT_CONNECTED);
    });

    it("should map timeout errors", () => {
      const error = new Error("query timed out");
      const mapped = (client as any).mapToSurrealDBError(error, "query");

      expect(mapped.code).toBe(SurrealDBErrorCode.CONNECTION_TIMEOUT);
    });

    it("should map already exists errors", () => {
      const error = new Error("record already exists");
      const mapped = (client as any).mapToSurrealDBError(error, "create");

      expect(mapped.code).toBe(SurrealDBErrorCode.RECORD_ALREADY_EXISTS);
    });

    it("should map not found errors", () => {
      const error = new Error("Record not found");
      const mapped = (client as any).mapToSurrealDBError(error, "select");

      expect(mapped.code).toBe(SurrealDBErrorCode.RECORD_NOT_FOUND);
    });

    it("should preserve SurrealDBError", () => {
      const original = new SurrealDBError(
        SurrealDBErrorCode.QUERY_FAILED,
        "Original error",
        "query"
      );
      const mapped = (client as any).mapToSurrealDBError(original, "operation");

      expect(mapped).toBe(original);
    });
  });

  describe("extractOperation", () => {
    it("should extract SELECT operation", () => {
      expect((client as any).extractOperation("SELECT * FROM test")).toBe("select");
    });

    it("should extract CREATE operation", () => {
      expect((client as any).extractOperation("CREATE test SET value = 1")).toBe("create");
    });

    it("should extract UPDATE operation", () => {
      expect((client as any).extractOperation("UPDATE test SET value = 2")).toBe("update");
    });

    it("should extract DELETE operation", () => {
      expect((client as any).extractOperation("DELETE FROM test WHERE id = 1")).toBe("delete");
    });

    it("should extract BEGIN operation", () => {
      expect((client as any).extractOperation("BEGIN TRANSACTION")).toBe("beginTransaction");
    });

    it("should extract COMMIT operation", () => {
      expect((client as any).extractOperation("COMMIT TRANSACTION")).toBe("commitTransaction");
    });

    it("should extract CANCEL operation", () => {
      expect((client as any).extractOperation("CANCEL TRANSACTION")).toBe("rollbackTransaction");
    });

    it("should return query for unknown operations", () => {
      expect((client as any).extractOperation("SHOW TABLES")).toBe("query");
    });
  });
});
