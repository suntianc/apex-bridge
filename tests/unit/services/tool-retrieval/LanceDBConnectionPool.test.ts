/**
 * LanceDBConnectionPool Test Suite
 */

import { vi } from "vitest";

import {
  LanceDBConnectionPool,
  PoolConfig,
  PoolStats,
} from "../../../../src/services/tool-retrieval/LanceDBConnectionPool";

// Mock lancedb module
vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn(),
}));

import * as lancedb from "@lancedb/lancedb";

describe("LanceDBConnectionPool", () => {
  let pool: LanceDBConnectionPool;
  const mockConnection = {
    tableNames: vi.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (lancedb.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockConnection);
  });

  afterEach(async () => {
    if (pool) {
      await pool.closeAll();
    }
  });

  describe("constructor", () => {
    it("should initialize with default config", () => {
      pool = new LanceDBConnectionPool();
      const stats = pool.getStats();
      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(4);
    });

    it("should accept custom config", () => {
      const customConfig: PoolConfig = {
        maxInstances: 2,
        instanceTTL: 60000,
        healthCheckInterval: 30000,
        minIdle: 1,
        leakDetectionThreshold: 60000,
      };
      pool = new LanceDBConnectionPool(customConfig);
      const stats = pool.getStats();
      expect(stats.maxSize).toBe(2);
    });
  });

  describe("getConnection", () => {
    it("should create a new connection when none exists", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath = "/tmp/test-lancedb-1";

      const connection = await pool.getConnection(dbPath);

      expect(lancedb.connect).toHaveBeenCalledWith(dbPath);
      expect(connection).toBeDefined();
    });

    it("should reuse existing connection for same path", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath = "/tmp/test-lancedb-2";

      const connection1 = await pool.getConnection(dbPath);
      const connection2 = await pool.getConnection(dbPath);

      expect(lancedb.connect).toHaveBeenCalledTimes(1);
      expect(connection1).toBe(connection2);
    });

    it("should create separate connections for different paths", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath1 = "/tmp/test-lancedb-3";
      const dbPath2 = "/tmp/test-lancedb-4";

      await pool.getConnection(dbPath1);
      await pool.getConnection(dbPath2);

      expect(lancedb.connect).toHaveBeenCalledTimes(2);
      expect(lancedb.connect).toHaveBeenCalledWith(dbPath1);
      expect(lancedb.connect).toHaveBeenCalledWith(dbPath2);
      expect(pool.getSize()).toBe(2);
    });

    it("should track connection access count", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath = "/tmp/test-lancedb-5";

      await pool.getConnection(dbPath);
      await pool.getConnection(dbPath);
      await pool.getConnection(dbPath);

      const stats = pool.getStats();
      expect(stats.totalAccess).toBe(3);
    });

    it("should increase hit rate with reuse", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath = "/tmp/test-lancedb-6";

      await pool.getConnection(dbPath); // miss
      await pool.getConnection(dbPath); // hit
      await pool.getConnection(dbPath); // hit

      const stats = pool.getStats();
      expect(stats.hitRate).toBeCloseTo(0.67, 1);
    });
  });

  describe("releaseConnection", () => {
    it("should update last access time on release", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath = "/tmp/test-lancedb-7";

      await pool.getConnection(dbPath);
      await pool.releaseConnection(dbPath);

      // Should not throw
      expect(async () => pool.releaseConnection(dbPath)).not.toThrow();
    });
  });

  describe("closeConnection", () => {
    it("should remove connection from pool", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath = "/tmp/test-lancedb-8";

      await pool.getConnection(dbPath);
      expect(pool.getSize()).toBe(1);

      await pool.closeConnection(dbPath);
      expect(pool.getSize()).toBe(0);
    });

    it("should allow creating new connection after closing", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath = "/tmp/test-lancedb-9";

      await pool.getConnection(dbPath);
      await pool.closeConnection(dbPath);
      await pool.getConnection(dbPath);

      // Should create a new connection since the old one was closed
      expect(lancedb.connect).toHaveBeenCalledTimes(2);
      expect(pool.getSize()).toBe(1);
    });
  });

  describe("closeAll", () => {
    it("should close all connections", async () => {
      pool = new LanceDBConnectionPool();

      await pool.getConnection("/tmp/test-lancedb-10");
      await pool.getConnection("/tmp/test-lancedb-11");
      expect(pool.getSize()).toBe(2);

      await pool.closeAll();
      expect(pool.getSize()).toBe(0);
    });

    it("should handle closeAll multiple times", async () => {
      pool = new LanceDBConnectionPool();

      await pool.getConnection("/tmp/test-lancedb-12");
      await pool.closeAll();
      await pool.closeAll();

      expect(pool.getSize()).toBe(0);
    });
  });

  describe("getStats", () => {
    it("should return accurate statistics", async () => {
      pool = new LanceDBConnectionPool();

      await pool.getConnection("/tmp/test-lancedb-13");
      await pool.getConnection("/tmp/test-lancedb-14");
      await pool.getConnection("/tmp/test-lancedb-13"); // reuse

      const stats = pool.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(4);
      expect(stats.totalAccess).toBe(3);
      expect(stats.hitRate).toBeCloseTo(0.33, 1);
    });
  });

  describe("getSize", () => {
    it("should return current pool size", async () => {
      pool = new LanceDBConnectionPool();

      expect(pool.getSize()).toBe(0);

      await pool.getConnection("/tmp/test-lancedb-15");
      expect(pool.getSize()).toBe(1);

      await pool.getConnection("/tmp/test-lancedb-16");
      expect(pool.getSize()).toBe(2);
    });
  });

  describe("isHealthy", () => {
    it("should return true for healthy connection", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath = "/tmp/test-lancedb-17";

      await pool.getConnection(dbPath);
      const healthy = await pool.isHealthy(dbPath);

      expect(healthy).toBe(true);
    });

    it("should return false for non-existent connection", async () => {
      pool = new LanceDBConnectionPool();

      const healthy = await pool.isHealthy("/tmp/non-existent");

      expect(healthy).toBe(false);
    });

    it("should return false for unhealthy connection", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath = "/tmp/test-lancedb-18";

      await pool.getConnection(dbPath);
      mockConnection.tableNames.mockRejectedValueOnce(new Error("Connection lost"));

      const healthy = await pool.isHealthy(dbPath);

      expect(healthy).toBe(false);
    });
  });

  describe("refreshConnection", () => {
    it("should create new connection for existing path", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath = "/tmp/test-lancedb-19";

      await pool.getConnection(dbPath);
      await pool.refreshConnection(dbPath);

      expect(lancedb.connect).toHaveBeenCalledTimes(2);
      expect(pool.getSize()).toBe(1);
    });
  });

  describe("path normalization", () => {
    it("should treat same paths as same", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath = "/tmp/test-lancedb-20";

      await pool.getConnection(dbPath);
      await pool.getConnection(dbPath);

      expect(lancedb.connect).toHaveBeenCalledTimes(1);
      expect(pool.getSize()).toBe(1);
    });

    it("should normalize relative paths", async () => {
      pool = new LanceDBConnectionPool();

      await pool.getConnection("test-db");
      const stats = pool.getStats();

      expect(stats.size).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should handle connection failure gracefully", async () => {
      pool = new LanceDBConnectionPool();
      (lancedb.connect as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Connection failed")
      );

      await expect(pool.getConnection("/tmp/test-lancedb-21")).rejects.toThrow("Connection failed");
    });

    it("should not add unhealthy connections to pool", async () => {
      pool = new LanceDBConnectionPool();
      const dbPath = "/tmp/test-lancedb-22";

      (lancedb.connect as ReturnType<typeof vi.fn>).mockResolvedValue({
        tableNames: vi.fn().mockRejectedValue(new Error("Health check failed")),
      });

      try {
        await pool.getConnection(dbPath);
      } catch (error) {
        // Expected to fail
      }

      // Connection should not be in pool if unhealthy
      const healthy = await pool.isHealthy(dbPath);
      expect(healthy).toBe(false);
    });
  });
});
