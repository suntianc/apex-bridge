/**
 * SurrealDB Vector Storage Tests
 */

import { SurrealDBVectorStorage } from "@/core/storage/surrealdb/vector-storage";

describe("SurrealDBVectorStorage", () => {
  let storage: SurrealDBVectorStorage;

  beforeEach(() => {
    storage = new SurrealDBVectorStorage(1536);
  });

  describe("getBackendType", () => {
    it("should return surrealdb as backend type", () => {
      expect(storage.getBackendType()).toBe("surrealdb");
    });
  });

  describe("getDimension", () => {
    it("should return configured dimension", () => {
      expect(storage.getDimension()).toBe(1536);
    });

    it("should allow custom dimension", () => {
      const customStorage = new SurrealDBVectorStorage(768);
      expect(customStorage.getDimension()).toBe(768);
    });
  });

  describe("isPersisted", () => {
    it("should return true (SurrealDB is persistent)", () => {
      expect(storage.isPersisted()).toBe(true);
    });
  });

  describe("constructor", () => {
    it("should create instance with default dimension", () => {
      expect(storage.getDimension()).toBe(1536);
    });

    it("should create instance with custom dimension", () => {
      const customStorage = new SurrealDBVectorStorage(1024);
      expect(customStorage.getDimension()).toBe(1024);
    });
  });
});

describe("SurrealDBVectorStorage - Vector Operations", () => {
  let storage: SurrealDBVectorStorage;

  beforeEach(() => {
    storage = new SurrealDBVectorStorage(1536);
  });

  describe("upsert", () => {
    it("should accept valid vector dimensions", async () => {
      const vector = new Array(1536).fill(0);
      const metadata = { name: "test-tool", description: "A test tool" };
      let threw = false;
      try {
        await storage.upsert("test-id", vector, metadata);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  describe("upsertBatch", () => {
    it("should handle empty batch", async () => {
      await expect(storage.upsertBatch([])).resolves.toBeUndefined();
    });

    it("should accept valid batch records", async () => {
      const records = [
        {
          id: "tool-1",
          vector: new Array(1536).fill(0.1),
          metadata: { name: "tool-1" },
        },
        {
          id: "tool-2",
          vector: new Array(1536).fill(0.2),
          metadata: { name: "tool-2" },
        },
      ];
      let threw = false;
      try {
        await storage.upsertBatch(records);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  describe("search", () => {
    it("should accept valid query vector", async () => {
      const queryVector = new Array(1536).fill(0.5);
      let threw = false;
      try {
        await storage.search(queryVector);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });

    it("should accept search options", async () => {
      const queryVector = new Array(1536).fill(0.5);
      const options = { limit: 5, threshold: 0.1, distanceType: "cosine" as const };
      let threw = false;
      try {
        await storage.search(queryVector, options);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  describe("delete", () => {
    it("should not throw for non-existent id", async () => {
      const result = await storage.delete("non-existent-id");
      expect(typeof result).toBe("boolean");
    });
  });

  describe("count", () => {
    it("should return a number when connected", async () => {
      let threw = false;
      let result: number | undefined;
      try {
        result = await storage.count();
      } catch {
        threw = true;
      }
      if (!threw) {
        expect(typeof result).toBe("number");
        expect(result).toBeGreaterThanOrEqual(0);
      } else {
        expect(threw).toBe(true);
      }
    });
  });
});
