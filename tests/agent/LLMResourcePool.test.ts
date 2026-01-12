/**
 * LLMResourcePool 单元测试
 */

import {
  LLMResourcePool,
  ProviderConfig,
  ResourceStatus,
} from "../../src/services/agent/LLMResourcePool";

// 模拟 logger
jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("LLMResourcePool", () => {
  let pool: LLMResourcePool;

  beforeEach(() => {
    pool = new LLMResourcePool();
  });

  afterEach(async () => {
    try {
      await pool.shutdown();
    } catch {
      // 忽略关闭错误
    }
  });

  describe("addProvider", () => {
    it("should add a provider pool successfully", () => {
      const config: ProviderConfig = {
        provider: "openai",
        model: "gpt-4",
        maxConcurrent: 5,
        baseUrl: "https://api.openai.com/v1",
        timeout: 30000,
        retryAttempts: 3,
      };

      pool.addProvider(config);

      expect(pool.hasProvider("openai", "gpt-4")).toBe(true);
    });

    it("should allow multiple providers", () => {
      const config1: ProviderConfig = {
        provider: "openai",
        model: "gpt-4",
        maxConcurrent: 5,
        baseUrl: "https://api.openai.com/v1",
        timeout: 30000,
        retryAttempts: 3,
      };

      const config2: ProviderConfig = {
        provider: "anthropic",
        model: "claude-3-opus",
        maxConcurrent: 3,
        baseUrl: "https://api.anthropic.com/v1",
        timeout: 30000,
        retryAttempts: 3,
      };

      pool.addProvider(config1);
      pool.addProvider(config2);

      expect(pool.hasProvider("openai", "gpt-4")).toBe(true);
      expect(pool.hasProvider("anthropic", "claude-3-opus")).toBe(true);
    });
  });

  describe("acquire and release", () => {
    it("should acquire and release a resource", async () => {
      const config: ProviderConfig = {
        provider: "test",
        model: "test-model",
        maxConcurrent: 2,
        baseUrl: "https://test.example.com",
        timeout: 5000,
        retryAttempts: 3,
      };

      pool.addProvider(config);
      const resource = await pool.acquire("test", "test-model");

      expect(resource).toBeDefined();
      expect(resource.provider).toBe("test");
      expect(resource.model).toBe("test-model");
      expect(resource.status).toBe("in_use");

      await pool.release(resource);
      expect(resource.status).toBe("available");
    });

    it("should create new resources up to maxConcurrent", async () => {
      const config: ProviderConfig = {
        provider: "test",
        model: "test-model",
        maxConcurrent: 2,
        baseUrl: "https://test.example.com",
        timeout: 5000,
        retryAttempts: 3,
      };

      pool.addProvider(config);

      const resource1 = await pool.acquire("test", "test-model");
      const resource2 = await pool.acquire("test", "test-model");

      expect(resource1.id).not.toBe(resource2.id);

      // 释放资源
      await pool.release(resource1);
      await pool.release(resource2);
    });

    it("should track resources after acquire", async () => {
      const config: ProviderConfig = {
        provider: "test",
        model: "test-model",
        maxConcurrent: 2,
        baseUrl: "https://test.example.com",
        timeout: 5000,
        retryAttempts: 3,
      };

      pool.addProvider(config);

      // 获取资源
      const resource = await pool.acquire("test", "test-model");

      // 检查统计
      const stats = pool.getUsageStats("test", "test-model");
      expect(stats).not.toBeNull();
      expect(stats?.totalResources).toBeGreaterThan(0);
      expect(stats?.inUseResources).toBeGreaterThan(0);

      // 释放资源
      await pool.release(resource);
    });
  });

  describe("getAvailableResources", () => {
    it("should return available resources after release", async () => {
      const config: ProviderConfig = {
        provider: "test",
        model: "test-model",
        maxConcurrent: 2,
        baseUrl: "https://test.example.com",
        timeout: 5000,
        retryAttempts: 3,
      };

      pool.addProvider(config);

      // 先获取资源
      const resource = await pool.acquire("test", "test-model");

      // 释放资源
      await pool.release(resource);

      // 现在应该有可用资源
      const available = pool.getAvailableResources("test", "test-model");
      expect(available.length).toBeGreaterThan(0);
    });
  });

  describe("getUsageStats", () => {
    it("should return correct usage statistics after acquire", async () => {
      const config: ProviderConfig = {
        provider: "test",
        model: "test-model",
        maxConcurrent: 2,
        baseUrl: "https://test.example.com",
        timeout: 5000,
        retryAttempts: 3,
      };

      pool.addProvider(config);

      // 获取资源
      const resource = await pool.acquire("test", "test-model");

      const stats = pool.getUsageStats("test", "test-model");

      expect(stats).not.toBeNull();
      expect(stats?.provider).toBe("test");
      expect(stats?.model).toBe("test-model");
      expect(stats?.totalResources).toBeGreaterThan(0);

      // 释放资源
      await pool.release(resource);
    });

    it("should return null for non-existent provider", () => {
      const stats = pool.getUsageStats("non-existent");
      expect(stats).toBeNull();
    });
  });

  describe("getProviders", () => {
    it("should return list of providers", () => {
      const config1: ProviderConfig = {
        provider: "openai",
        model: "gpt-4",
        maxConcurrent: 5,
        baseUrl: "https://api.openai.com/v1",
        timeout: 5000,
        retryAttempts: 3,
      };

      const config2: ProviderConfig = {
        provider: "anthropic",
        model: "claude",
        maxConcurrent: 3,
        baseUrl: "https://api.anthropic.com/v1",
        timeout: 5000,
        retryAttempts: 3,
      };

      pool.addProvider(config1);
      pool.addProvider(config2);

      const providers = pool.getProviders();
      expect(providers).toContain("openai");
      expect(providers).toContain("anthropic");
    });
  });

  describe("removeProvider", () => {
    it("should remove a provider pool", async () => {
      const config: ProviderConfig = {
        provider: "test",
        model: "test-model",
        maxConcurrent: 2,
        baseUrl: "https://test.example.com",
        timeout: 5000,
        retryAttempts: 3,
      };

      pool.addProvider(config);
      expect(pool.hasProvider("test", "test-model")).toBe(true);

      await pool.removeProvider("test", "test-model");
      expect(pool.hasProvider("test", "test-model")).toBe(false);
    });
  });
});
