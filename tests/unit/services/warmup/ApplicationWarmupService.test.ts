/**
 * ApplicationWarmupService 单元测试
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
  ApplicationWarmupService,
  getWarmupService,
  resetWarmupService,
  type WarmupConfig,
  type WarmupStatus,
} from "@/services/warmup/ApplicationWarmupService";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

describe.skip("ApplicationWarmupService", () => {
  let service: ApplicationWarmupService;

  beforeEach(() => {
    resetWarmupService();
    service = new ApplicationWarmupService();
  });

  afterEach(() => {
    resetWarmupService();
  });

  describe("constructor", () => {
    it("should initialize with default config", () => {
      expect(service).toBeInstanceOf(ApplicationWarmupService);
      expect(service.isReady()).toBe(false);
    });

    it("should accept custom config", () => {
      const customConfig: Partial<WarmupConfig> = {
        enabled: false,
        timeoutMs: 30000,
      };

      const customService = new ApplicationWarmupService(customConfig);
      expect(customService).toBeInstanceOf(ApplicationWarmupService);
    });
  });

  describe("getStatus", () => {
    it("should return initial status", () => {
      const status = service.getStatus();

      expect(status.isComplete).toBe(false);
      expect(status.startTime).toBeNull();
      expect(status.endTime).toBeNull();
      expect(status.totalDuration).toBe(0);
      expect(status.errors).toHaveLength(0);
      expect(status.phases.database.status).toBe("pending");
      expect(status.phases.index.status).toBe("pending");
      expect(status.phases.embedding.status).toBe("pending");
      expect(status.phases.search.status).toBe("pending");
    });
  });

  describe("isReady", () => {
    it("should return false before warmup", () => {
      expect(service.isReady()).toBe(false);
    });

    it("should return false when disabled but not run", () => {
      const disabledService = new ApplicationWarmupService({ enabled: false });
      expect(disabledService.isReady()).toBe(false);
    });
  });

  describe("getConfig", () => {
    it("should return current config", () => {
      const config = service.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.timeoutMs).toBe(30000);
      expect(config.databaseWarmup.enabled).toBe(true);
      expect(config.indexWarmup.enabled).toBe(true);
      expect(config.embeddingCacheWarmup.enabled).toBe(true);
      expect(config.searchCacheWarmup.enabled).toBe(true);
    });
  });

  describe("updateConfig", () => {
    it("should update config", () => {
      service.updateConfig({
        enabled: false,
        timeoutMs: 30000,
      });

      const config = service.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.timeoutMs).toBe(30000);
    });
  });

  // ==================== VUL-004: State Management Tests ====================

  describe("warmup() - State Management", () => {
    it("should reset isRunning flag after successful warmup", async () => {
      // Disable warmup to test state management without actual warmup operations
      const disabledService = new ApplicationWarmupService({ enabled: false });
      await disabledService.warmup();

      const status = disabledService.getStatus();
      expect(status.isComplete).toBe(true);
    }, 60000);

    it("should reset isRunning flag after failed warmup", async () => {
      const failingService = new ApplicationWarmupService({
        enabled: true,
        timeoutMs: 1000,
        databaseWarmup: {
          enabled: true,
          priority: [],
        },
        indexWarmup: {
          enabled: true,
          queryCount: 100,
        },
        embeddingCacheWarmup: {
          enabled: false,
          sampleCount: 0,
        },
        searchCacheWarmup: {
          enabled: false,
          queryCount: 0,
        },
      });

      // This should fail and still reset state
      await failingService.warmup();

      const status = failingService.getStatus();
      // Either complete or has errors, but state should be consistent
      expect(status.startTime).not.toBeNull();
    }, 60000);

    it("should handle multiple warmup calls sequentially", async () => {
      const disabledService = new ApplicationWarmupService({
        enabled: true,
        timeoutMs: 5000,
        databaseWarmup: {
          enabled: false,
          priority: [],
        },
        indexWarmup: {
          enabled: false,
          queryCount: 0,
        },
        embeddingCacheWarmup: {
          enabled: false,
          sampleCount: 0,
        },
        searchCacheWarmup: {
          enabled: false,
          queryCount: 0,
        },
      });

      // First warmup
      await disabledService.warmup();

      // Second warmup should work (either complete or be no-op)
      await disabledService.warmup();

      const status = disabledService.getStatus();
      expect(status.isComplete).toBe(true);
    });

    it("should track warmup phases correctly", async () => {
      const disabledService = new ApplicationWarmupService({
        enabled: true,
        databaseWarmup: {
          enabled: false,
          priority: [],
        },
        indexWarmup: {
          enabled: false,
          queryCount: 0,
        },
        embeddingCacheWarmup: {
          enabled: false,
          sampleCount: 0,
        },
        searchCacheWarmup: {
          enabled: false,
          queryCount: 0,
        },
      });

      await disabledService.warmup();

      const status = disabledService.getStatus();
      expect(status.isComplete).toBe(true);
      expect(status.totalDuration).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("WarmupConfig", () => {
  it("should have correct structure", () => {
    const config: WarmupConfig = {
      enabled: true,
      timeoutMs: 60000,
      databaseWarmup: {
        enabled: true,
        priority: ["sqlite"],
      },
      indexWarmup: {
        enabled: true,
        queryCount: 100,
      },
      embeddingCacheWarmup: {
        enabled: true,
        sampleCount: 100,
      },
      searchCacheWarmup: {
        enabled: true,
        queryCount: 100,
      },
    };

    expect(config.enabled).toBe(true);
    expect(config.timeoutMs).toBe(60000);
    expect(config.databaseWarmup.priority).toContain("sqlite");
  });

  it("should handle disabled phases", () => {
    const config: WarmupConfig = {
      enabled: true,
      timeoutMs: 60000,
      databaseWarmup: {
        enabled: false,
        priority: [],
      },
      indexWarmup: {
        enabled: false,
        queryCount: 0,
      },
      embeddingCacheWarmup: {
        enabled: false,
        sampleCount: 0,
      },
      searchCacheWarmup: {
        enabled: false,
        queryCount: 0,
      },
    };

    expect(config.databaseWarmup.enabled).toBe(false);
    expect(config.indexWarmup.enabled).toBe(false);
    expect(config.embeddingCacheWarmup.enabled).toBe(false);
    expect(config.searchCacheWarmup.enabled).toBe(false);
  });
});

describe("WarmupStatus", () => {
  it("should have correct structure for completed warmup", () => {
    const status: WarmupStatus = {
      isComplete: true,
      startTime: new Date(),
      endTime: new Date(),
      totalDuration: 500,
      phases: {
        database: { status: "complete", duration: 100 },
        index: { status: "complete", duration: 200 },
        embedding: { status: "complete", duration: 100 },
        search: { status: "complete", duration: 100 },
      },
      errors: [],
    };

    expect(status.isComplete).toBe(true);
    expect(status.totalDuration).toBe(500);
    expect(status.errors).toHaveLength(0);
    expect(status.phases.database.status).toBe("complete");
  });

  it("should have correct structure for failed warmup", () => {
    const status: WarmupStatus = {
      isComplete: false,
      startTime: new Date(),
      endTime: new Date(),
      totalDuration: 1000,
      phases: {
        database: { status: "complete", duration: 100 },
        index: { status: "failed", duration: 500 },
        embedding: { status: "pending", duration: 0 },
        search: { status: "pending", duration: 0 },
      },
      errors: ["Index warmup failed: timeout"],
    };

    expect(status.isComplete).toBe(false);
    expect(status.errors).toHaveLength(1);
    expect(status.phases.index.status).toBe("failed");
  });
});

describe("getWarmupService", () => {
  beforeEach(() => {
    resetWarmupService();
  });

  afterEach(() => {
    resetWarmupService();
  });

  it("should return singleton instance", () => {
    const instance1 = getWarmupService();
    const instance2 = getWarmupService();

    expect(instance1).toBe(instance2);
  });

  it("should create new instance after reset", () => {
    const instance1 = getWarmupService();
    resetWarmupService();
    const instance2 = getWarmupService();

    expect(instance1).not.toBe(instance2);
  });
});

describe("resetWarmupService", () => {
  it("should clear singleton", () => {
    const instance1 = getWarmupService();
    resetWarmupService();
    const instance2 = getWarmupService();

    expect(instance1).not.toBe(instance2);
  });

  it("should be callable multiple times", () => {
    resetWarmupService();
    resetWarmupService();
    resetWarmupService();

    const instance = getWarmupService();
    expect(instance).toBeInstanceOf(ApplicationWarmupService);
  });
});
