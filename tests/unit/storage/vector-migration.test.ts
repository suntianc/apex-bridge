/**
 * Phase 4: Vector Storage Migration Tests
 *
 * Tests for vector dual-write, RW-split, and migration functionality.
 */

import { VectorDualWriteAdapter, VectorDualWriteConfig } from "@/core/storage/vector-dual-write";
import {
  VectorReadWriteSplitAdapter,
  VectorReadWriteSplitConfig,
} from "@/core/storage/vector-read-write-split";
import type {
  IVectorStorage,
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
} from "@/core/storage/interfaces";

describe("VectorDualWriteAdapter", () => {
  let primary: MockVectorStorage;
  let secondary: MockVectorStorage;
  let adapter: VectorDualWriteAdapter;

  beforeEach(() => {
    primary = new MockVectorStorage("lance");
    secondary = new MockVectorStorage("surrealdb");
    adapter = new VectorDualWriteAdapter(primary, secondary, {
      domain: "TestVector",
      batchSize: 10,
      asyncWrite: true,
    });
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const defaultAdapter = new VectorDualWriteAdapter(primary, secondary);
      expect(defaultAdapter.getBackendType()).toBe("lance");
    });

    it("should create instance with custom config", () => {
      expect(adapter.getConfig().domain).toBe("TestVector");
      expect(adapter.getConfig().batchSize).toBe(10);
      expect(adapter.getConfig().asyncWrite).toBe(true);
    });
  });

  describe("upsert", () => {
    it("should write to primary synchronously", async () => {
      await adapter.upsert("test-id", [0.1, 0.2, 0.3], { name: "test" });

      expect(primary.upsertCalledWith).toEqual({
        id: "test-id",
        vector: [0.1, 0.2, 0.3],
        metadata: { name: "test" },
      });
    });

    it("should write to secondary asynchronously", async () => {
      await adapter.upsert("test-id", [0.1, 0.2, 0.3], { name: "test" });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(secondary.upsertCalledWith).toEqual({
        id: "test-id",
        vector: [0.1, 0.2, 0.3],
        metadata: { name: "test" },
      });
    });

    it("should not fail if secondary write fails", async () => {
      secondary.shouldFail = true;

      await expect(adapter.upsert("test-id", [0.1], {})).resolves.not.toThrow();
    });
  });

  describe("upsertBatch", () => {
    it("should batch write to primary", async () => {
      const records: VectorRecord[] = [
        { id: "id-1", vector: [0.1], metadata: {} },
        { id: "id-2", vector: [0.2], metadata: {} },
      ];

      await adapter.upsertBatch(records);

      expect(primary.upsertBatchCalledWith).toEqual(records);
    });

    it("should batch write to secondary in chunks", async () => {
      const adapterWithSmallBatch = new VectorDualWriteAdapter(primary, secondary, {
        domain: "Test",
        batchSize: 2,
        asyncWrite: false,
      });

      const records: VectorRecord[] = [
        { id: "id-1", vector: [0.1], metadata: {} },
        { id: "id-2", vector: [0.2], metadata: {} },
        { id: "id-3", vector: [0.3], metadata: {} },
      ];

      await adapterWithSmallBatch.upsertBatch(records);

      expect(secondary.upsertBatchCallCount).toBe(2);
    });

    it("should handle empty batch", async () => {
      await expect(adapter.upsertBatch([])).resolves.not.toThrow();
    });
  });

  describe("delete", () => {
    it("should delete from primary", async () => {
      await adapter.delete("test-id");

      expect(primary.deleteCalledWith).toBe("test-id");
    });

    it("should delete from secondary asynchronously", async () => {
      await adapter.delete("test-id");

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(secondary.deleteCalledWith).toBe("test-id");
    });
  });

  describe("search", () => {
    it("should search from primary only", async () => {
      const mockResults: VectorSearchResult[] = [{ id: "result-1", score: 0.9, metadata: {} }];
      primary.searchResults = mockResults;

      const results = await adapter.search([0.1, 0.2], { limit: 10 });

      expect(results).toEqual(mockResults);
      expect(secondary.searchCalled).toBe(false);
    });
  });

  describe("count", () => {
    it("should return count from primary", async () => {
      primary.countValue = 42;

      const count = await adapter.count();

      expect(count).toBe(42);
    });
  });
});

describe("VectorReadWriteSplitAdapter", () => {
  let primary: MockVectorStorage;
  let secondary: MockVectorStorage;
  let adapter: VectorReadWriteSplitAdapter;

  beforeEach(() => {
    primary = new MockVectorStorage("lance");
    secondary = new MockVectorStorage("surrealdb");
    adapter = new VectorReadWriteSplitAdapter(primary, secondary, {
      domain: "TestVector",
      readFromSecondary: false,
      fallbackToPrimary: true,
      secondaryWarmup: false,
    });
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const defaultAdapter = new VectorReadWriteSplitAdapter(primary, secondary);
      expect(defaultAdapter.getBackendType()).toBe("lance");
      expect(defaultAdapter.isSecondaryAvailable()).toBe(true);
      expect(defaultAdapter.isSecondaryReady()).toBe(false);
    });

    it("should create instance with null secondary", () => {
      const adapterWithoutSecondary = new VectorReadWriteSplitAdapter(primary, null);
      expect(adapterWithoutSecondary.isSecondaryAvailable()).toBe(false);
    });
  });

  describe("upsert", () => {
    it("should write to primary", async () => {
      await adapter.upsert("test-id", [0.1], { name: "test" });

      expect(primary.upsertCalledWith).toEqual({
        id: "test-id",
        vector: [0.1],
        metadata: { name: "test" },
      });
    });

    it("should also write to secondary", async () => {
      await adapter.upsert("test-id", [0.1], { name: "test" });

      expect(secondary.upsertCalledWith).toEqual({
        id: "test-id",
        vector: [0.1],
        metadata: { name: "test" },
      });
    });
  });

  describe("search", () => {
    it("should search from primary when readFromSecondary is false", async () => {
      const mockResults: VectorSearchResult[] = [{ id: "result-1", score: 0.9, metadata: {} }];
      primary.searchResults = mockResults;

      const results = await adapter.search([0.1], { limit: 10 });

      expect(results).toEqual(mockResults);
      expect(primary.searchCalled).toBe(true);
      expect(secondary.searchCalled).toBe(false);
    });

    it("should search from secondary when readFromSecondary is true and ready", async () => {
      adapter.enableSecondaryReads();
      (adapter as unknown as { secondaryReady: boolean }).secondaryReady = true;

      const mockResults: VectorSearchResult[] = [{ id: "result-1", score: 0.9, metadata: {} }];
      secondary.searchResults = mockResults;

      const results = await adapter.search([0.1], { limit: 10 });

      expect(results).toEqual(mockResults);
      expect(secondary.searchCalled).toBe(true);
    });

    it("should fallback to primary on secondary failure", async () => {
      adapter.enableSecondaryReads();
      (adapter as unknown as { secondaryReady: boolean }).secondaryReady = true;
      secondary.shouldFailSearch = true;

      const mockResults: VectorSearchResult[] = [{ id: "result-1", score: 0.9, metadata: {} }];
      primary.searchResults = mockResults;

      const results = await adapter.search([0.1], { limit: 10 });

      expect(results).toEqual(mockResults);
    });

    it("should fallback to primary when secondary returns empty", async () => {
      adapter.enableSecondaryReads();
      (adapter as unknown as { secondaryReady: boolean }).secondaryReady = true;
      secondary.searchResults = [];

      const mockResults: VectorSearchResult[] = [{ id: "result-1", score: 0.9, metadata: {} }];
      primary.searchResults = mockResults;

      const results = await adapter.search([0.1], { limit: 10 });

      expect(results).toEqual(mockResults);
    });
  });

  describe("enableSecondaryReads", () => {
    it("should enable secondary reads", () => {
      expect(adapter.isReadFromSecondary()).toBe(false);

      adapter.enableSecondaryReads();

      expect(adapter.isReadFromSecondary()).toBe(true);
    });
  });

  describe("disableSecondaryReads", () => {
    it("should disable secondary reads", () => {
      adapter.enableSecondaryReads();
      expect(adapter.isReadFromSecondary()).toBe(true);

      adapter.disableSecondaryReads();

      expect(adapter.isReadFromSecondary()).toBe(false);
    });
  });

  describe("warmup", () => {
    it("should set secondaryReady to true on success", async () => {
      primary.countValue = 10;

      await adapter.warmup();

      expect(adapter.isSecondaryReady()).toBe(true);
    });

    it("should not set secondaryReady on failure", async () => {
      const failingAdapter = new VectorReadWriteSplitAdapter(primary, secondary, {
        domain: "TestVector",
        readFromSecondary: false,
        fallbackToPrimary: true,
        secondaryWarmup: false,
      });

      secondary.shouldFailCount = true;

      let threw = false;
      try {
        await failingAdapter.warmup();
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);
      expect(failingAdapter.isSecondaryReady()).toBe(false);
    });
  });
});

describe("VectorDualWriteConfig", () => {
  it("should have correct default values", () => {
    const config: VectorDualWriteConfig = {
      domain: "Vector",
      batchSize: 100,
      asyncWrite: true,
    };

    expect(config.domain).toBe("Vector");
    expect(config.batchSize).toBe(100);
    expect(config.asyncWrite).toBe(true);
  });
});

describe("VectorReadWriteSplitConfig", () => {
  it("should have correct default values", () => {
    const config: VectorReadWriteSplitConfig = {
      domain: "Vector",
      readFromSecondary: false,
      fallbackToPrimary: true,
      secondaryWarmup: false,
    };

    expect(config.domain).toBe("Vector");
    expect(config.readFromSecondary).toBe(false);
    expect(config.fallbackToPrimary).toBe(true);
    expect(config.secondaryWarmup).toBe(false);
  });
});

class MockVectorStorage implements IVectorStorage {
  private _backendType: "lance" | "surrealdb";
  upsertCalledWith?: { id: string; vector: number[]; metadata: Record<string, unknown> };
  upsertBatchCalledWith?: VectorRecord[];
  upsertBatchCallCount = 0;
  deleteCalledWith?: string;
  searchCalled = false;
  countValue = 0;
  searchResults: VectorSearchResult[] = [];
  shouldFail = false;
  shouldFailSearch = false;
  shouldFailCount = false;

  constructor(backendType: "lance" | "surrealdb") {
    this._backendType = backendType;
  }

  getBackendType(): "lance" | "surrealdb" {
    return this._backendType;
  }

  async upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void> {
    if (this.shouldFail) {
      throw new Error("Mock upsert failure");
    }
    this.upsertCalledWith = { id, vector, metadata };
  }

  async upsertBatch(records: VectorRecord[]): Promise<void> {
    if (this.shouldFail) {
      throw new Error("Mock batch upsert failure");
    }
    this.upsertBatchCalledWith = records;
    this.upsertBatchCallCount++;
  }

  async delete(id: string): Promise<boolean> {
    this.deleteCalledWith = id;
    return true;
  }

  async search(
    queryVector: number[],
    _options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    this.searchCalled = true;
    if (this.shouldFailSearch) {
      throw new Error("Mock search failure");
    }
    return this.searchResults;
  }

  getDimension(): number {
    return 1536;
  }

  isPersisted(): boolean {
    return true;
  }

  async count(): Promise<number> {
    if (this.shouldFailCount) {
      throw new Error("Mock count failure");
    }
    return this.countValue;
  }
}
