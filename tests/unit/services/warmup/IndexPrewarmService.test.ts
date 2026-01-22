/**
 * IndexPrewarmService 单元测试
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
  IndexPrewarmService,
  type IndexPrewarmConfig,
  type IndexPrewarmResult,
} from "@/services/warmup/IndexPrewarmService";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

describe.skip("IndexPrewarmService", () => {
  let service: IndexPrewarmService;

  beforeEach(() => {
    service = new IndexPrewarmService();
  });

  afterEach(() => {
    service.reset();
  });

  describe("constructor", () => {
    it("should initialize with default config", () => {
      expect(service).toBeInstanceOf(IndexPrewarmService);
      expect(service.isReady()).toBe(false);
    });

    it("should accept custom config", () => {
      const customConfig: Partial<IndexPrewarmConfig> = {
        queryCount: 50,
        queryTimeoutMs: 3000,
      };

      const customService = new IndexPrewarmService(customConfig);
      expect(customService).toBeInstanceOf(IndexPrewarmService);
    });
  });

  describe("isReady", () => {
    it("should return false before warmup", () => {
      expect(service.isReady()).toBe(false);
    });

    it("should return false after reset", () => {
      service.reset();
      expect(service.isReady()).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset warmup state", () => {
      service.reset();
      expect(service.isReady()).toBe(false);
    });

    it("should be callable multiple times", () => {
      service.reset();
      service.reset();
      service.reset();
      expect(service.isReady()).toBe(false);
    });
  });
});

describe("IndexPrewarmResult", () => {
  it("should have correct structure", () => {
    const result: IndexPrewarmResult = {
      success: true,
      queriesExecuted: 100,
      errors: [],
      duration: 500,
    };

    expect(result.success).toBe(true);
    expect(result.queriesExecuted).toBe(100);
    expect(result.errors).toHaveLength(0);
    expect(result.duration).toBe(500);
  });

  it("should handle errors", () => {
    const result: IndexPrewarmResult = {
      success: false,
      queriesExecuted: 50,
      errors: ["Query timeout", "Connection failed"],
      duration: 1000,
    };

    expect(result.success).toBe(false);
    expect(result.queriesExecuted).toBe(50);
    expect(result.errors).toHaveLength(2);
  });
});
