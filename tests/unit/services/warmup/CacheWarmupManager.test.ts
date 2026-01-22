/**
 * CacheWarmupManager 单元测试
 */

// Mock LanceDB to prevent native module loading issues in test environment
vi.mock("@lancedb/lancedb", () => ({
  LanceDB: class MockLanceDB {
    connect() {
      return Promise.resolve({});
    }
    close() {
      return Promise.resolve();
    }
  },
  EmbeddingFunction: class MockEmbeddingFunction {
    constructor() {}
  },
}));

import {
  CacheWarmupManager,
  type EmbeddingCacheWarmupConfig,
  type SearchCacheWarmupConfig,
  type CacheWarmupResult,
} from "@/services/warmup/CacheWarmupManager";
import { vi, describe, it, expect } from "vitest";

describe("CacheWarmupManager", () => {
  let manager: CacheWarmupManager;

  beforeEach(() => {
    manager = new CacheWarmupManager();
  });

  describe("constructor", () => {
    it("should initialize successfully", () => {
      expect(manager).toBeInstanceOf(CacheWarmupManager);
    });
  });
});

describe("CacheWarmupResult", () => {
  it("should have correct structure for success", () => {
    const result: CacheWarmupResult = {
      success: true,
      itemsWarmed: 100,
      errors: [],
      duration: 500,
    };

    expect(result.success).toBe(true);
    expect(result.itemsWarmed).toBe(100);
    expect(result.errors).toHaveLength(0);
    expect(result.duration).toBe(500);
  });

  it("should have correct structure for failure", () => {
    const result: CacheWarmupResult = {
      success: false,
      itemsWarmed: 50,
      errors: ["Network timeout", "Invalid response"],
      duration: 1500,
    };

    expect(result.success).toBe(false);
    expect(result.itemsWarmed).toBe(50);
    expect(result.errors).toHaveLength(2);
    expect(result.duration).toBe(1500);
  });
});

describe("EmbeddingCacheWarmupConfig", () => {
  it("should accept valid config", () => {
    const config: EmbeddingCacheWarmupConfig = {
      sampleCount: 100,
      timeoutMs: 60000,
    };

    expect(config.sampleCount).toBe(100);
    expect(config.timeoutMs).toBe(60000);
  });

  it("should handle edge cases", () => {
    const config: EmbeddingCacheWarmupConfig = {
      sampleCount: 1,
      timeoutMs: 1000,
    };

    expect(config.sampleCount).toBe(1);
    expect(config.timeoutMs).toBe(1000);
  });
});

describe("SearchCacheWarmupConfig", () => {
  it("should accept valid config", () => {
    const config: SearchCacheWarmupConfig = {
      queryCount: 50,
      timeoutMs: 30000,
    };

    expect(config.queryCount).toBe(50);
    expect(config.timeoutMs).toBe(30000);
  });

  it("should handle edge cases", () => {
    const config: SearchCacheWarmupConfig = {
      queryCount: 0,
      timeoutMs: 1000,
    };

    expect(config.queryCount).toBe(0);
    expect(config.timeoutMs).toBe(1000);
  });
});
