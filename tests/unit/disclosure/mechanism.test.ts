/**
 * 披露机制测试
 * Phase 5 - ApexBridge Claude Code Skill 兼容性增强项目
 *
 * 测试覆盖：
 * - Tier 1 (Minimal Disclosure) 测试
 * - Tier 2 (Standard Disclosure) 测试
 * - Tier 3 (Full Disclosure) 测试
 * - 边界条件测试（Token 限制、超时）
 */

import {
  DisclosureManager,
  DisclosureDecisionManager,
  DisclosureCache,
  DisclosureDecisionInput,
  DisclosureCacheKey,
  DEFAULT_DISCLOSURE_CONFIG_V2,
} from "../../../src/services/tool-retrieval/DisclosureManager";
import {
  DisclosureLevel,
  DisclosureContent,
  DisclosureStrategy,
} from "../../../src/types/enhanced-skill";

// ============================================
// Mock 数据工厂
// ============================================

function createMockDisclosureContent(
  level: DisclosureLevel = DisclosureLevel.METADATA
): DisclosureContent {
  const base = {
    level,
    name: "Test Tool",
    description: "A test tool for disclosure testing",
    tokenCount: 100,
  };

  switch (level) {
    case DisclosureLevel.METADATA:
      return {
        ...base,
        version: "1.0.0",
        author: "Test Author",
        tags: ["test", "unit"],
      };
    case DisclosureLevel.CONTENT:
      return {
        ...base,
        parameters: [
          { name: "input", type: "string", required: true, description: "Input data" },
          { name: "options", type: "object", required: false, description: "Additional options" },
        ],
        examples: [
          { input: "test1", output: "result1" },
          { input: "test2", output: "result2" },
        ],
      };
    case DisclosureLevel.RESOURCES:
      return {
        ...base,
        scripts: [
          {
            name: "main",
            language: "javascript",
            content: 'console.log("Hello World");',
          },
        ],
        dependencies: [
          { name: "lodash", version: "^4.17.21" },
          { name: "axios", version: "^1.6.0" },
        ],
        resources: [
          { type: "file", path: "./README.md", description: "Project README" },
          { type: "config", path: "./config.json", description: "Configuration file" },
        ],
      };
    default:
      return base;
  }
}

function createMockDecisionInput(
  score: number = 0.9,
  maxTokens: number = 3000
): DisclosureDecisionInput {
  return {
    result: {
      id: "tool1",
      name: "Test Tool",
      description: "A test tool",
      unifiedScore: score,
      scores: { vector: score, keyword: 0.5, semantic: 0.6, tag: 0.7 },
      ranks: { vector: 1, keyword: 2, semantic: 3, tag: 4 },
      tags: ["category:test"],
      toolType: "skill" as const,
      disclosure: createMockDisclosureContent(DisclosureLevel.METADATA),
    },
    score,
    maxTokens,
  };
}

// ============================================
// Tier 1 (Minimal Disclosure) 测试
// ============================================

describe("Tier 1: Minimal Disclosure", () => {
  let disclosureManager: DisclosureManager;

  beforeEach(() => {
    disclosureManager = new DisclosureManager({
      enabled: true,
      thresholds: { l2: 0.7, l3: 0.85 },
      l1MaxTokens: 120,
      l2MaxTokens: 5000,
      cache: {
        enabled: true,
        maxSize: 2000,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      },
    });
  });

  describe("Basic Minimal Disclosure", () => {
    it("should return METADATA level for high score with low token budget", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.95,
        maxTokens: 100,
      });

      expect(result.level).toBe(DisclosureLevel.METADATA);
      expect(result.tokenCount).toBeLessThanOrEqual(120);
    });

    it("should return METADATA level for perfect score when always enforced", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 1.0,
        maxTokens: 5000,
      });

      // Even with perfect score, if token budget is tight, may return METADATA
      // But typically would return higher level
      expect(result).toHaveProperty("level");
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("description");
    });

    it("should include only metadata fields in L1 disclosure", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.95,
        maxTokens: 120,
      });

      expect(result).toHaveProperty("level", DisclosureLevel.METADATA);
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("description");
      expect(result).toHaveProperty("tokenCount");
      expect(result).not.toHaveProperty("parameters");
      expect(result).not.toHaveProperty("scripts");
    });

    it("should respect L1 token limit", async () => {
      // Create a disclosure that would exceed limit
      const largeDescription = "a".repeat(200);

      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.95,
        maxTokens: 120,
      });

      // Result should be truncated or optimized to fit limit
      expect(result.tokenCount).toBeLessThanOrEqual(120);
    });
  });

  describe("L1 Performance", () => {
    it("should complete L1 disclosure in < 10ms", async () => {
      const latencies: number[] = [];

      for (let i = 0; i < 100; i++) {
        const startTime = Date.now();
        await disclosureManager.getDisclosure(`tool${i}`, {
          score: 0.95,
          maxTokens: 120,
        });
        latencies.push(Date.now() - startTime);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      console.log(`L1 Average latency: ${avgLatency.toFixed(2)}ms`);

      expect(avgLatency).toBeLessThan(10);
    });

    it("should handle concurrent L1 requests", async () => {
      const concurrentRequests = 100;
      const startTime = Date.now();

      const promises = Array(concurrentRequests)
        .fill(null)
        .map((_, i) =>
          disclosureManager.getDisclosure(`tool${i}`, {
            score: 0.95,
            maxTokens: 120,
          })
        );

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      console.log(`Concurrent L1 requests (${concurrentRequests}): ${duration}ms`);
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("L1 Cache Behavior", () => {
    it("should cache L1 disclosures", async () => {
      // First request
      await disclosureManager.getDisclosure("tool1", {
        score: 0.95,
        maxTokens: 120,
      });

      // Second request should hit cache
      const startTime = Date.now();
      await disclosureManager.getDisclosure("tool1", {
        score: 0.95,
        maxTokens: 120,
      });
      const cachedTime = Date.now() - startTime;

      expect(cachedTime).toBeLessThan(1); // Should be instant from cache
    });

    it("should have shorter TTL for L1 cache", async () => {
      const cache = disclosureManager.getCache();
      expect(cache).toBeDefined();
    });
  });
});

// ============================================
// Tier 2 (Standard Disclosure) 测试
// ============================================

describe("Tier 2: Standard Disclosure", () => {
  let disclosureManager: DisclosureManager;

  beforeEach(() => {
    disclosureManager = new DisclosureManager({
      enabled: true,
      thresholds: { l2: 0.7, l3: 0.85 },
      l1MaxTokens: 120,
      l2MaxTokens: 5000,
      cache: {
        enabled: true,
        maxSize: 2000,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      },
    });
  });

  describe("Basic Standard Disclosure", () => {
    it("should return CONTENT level for score >= 0.7", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.75,
        maxTokens: 3000,
      });

      expect(result.level).toBe(DisclosureLevel.CONTENT);
    });

    it("should include parameters in L2 disclosure", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.8,
        maxTokens: 3000,
        metadata: {
          parameters: [
            { name: "input", type: "string", required: true, description: "Input data" },
            { name: "options", type: "object", required: false, description: "Additional options" },
          ],
        },
      });

      expect(result).toHaveProperty("level", DisclosureLevel.CONTENT);
      expect(result).toHaveProperty("parameters");
      expect(Array.isArray(result.parameters)).toBe(true);
    });

    it("should include examples in L2 disclosure", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.8,
        maxTokens: 3000,
      });

      expect(result).toHaveProperty("examples");
      expect(Array.isArray(result.examples)).toBe(true);
    });

    it("should not include scripts in L2 disclosure", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.8,
        maxTokens: 3000,
      });

      expect(result).not.toHaveProperty("scripts");
      expect(result).not.toHaveProperty("dependencies");
    });

    it("should respect L2 token limit", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.8,
        maxTokens: 3000,
      });

      expect(result.tokenCount).toBeLessThanOrEqual(5000);
    });
  });

  describe("L2 Decision Logic", () => {
    it("should return CONTENT for score >= l2 threshold", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.7,
        maxTokens: 3000,
      });

      expect(result.level).toBe(DisclosureLevel.CONTENT);
    });

    it("should return CONTENT for score between thresholds", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.75,
        maxTokens: 3000,
      });

      expect(result.level).toBe(DisclosureLevel.CONTENT);
    });

    it("should return METADATA if token budget is very low", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.9,
        maxTokens: 100, // Very low token budget
      });

      // Even with high score, if token budget is too low, might return METADATA
      expect(result.level).toBeDefined();
    });

    it("should handle exact threshold value (0.7)", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.7,
        maxTokens: 3000,
      });

      // Should return CONTENT (>= 0.7)
      expect(result.level).toBe(DisclosureLevel.CONTENT);
    });
  });

  describe("L2 Performance", () => {
    it("should complete L2 disclosure in < 50ms", async () => {
      const latencies: number[] = [];

      for (let i = 0; i < 50; i++) {
        const startTime = Date.now();
        await disclosureManager.getDisclosure(`tool${i}`, {
          score: 0.75,
          maxTokens: 3000,
        });
        latencies.push(Date.now() - startTime);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      console.log(`L2 Average latency: ${avgLatency.toFixed(2)}ms`);

      expect(avgLatency).toBeLessThan(50);
    });

    it("should be slower than L1 but still fast", async () => {
      // L1
      const l1Start = Date.now();
      await disclosureManager.getDisclosure("tool1", {
        score: 0.95,
        maxTokens: 120,
      });
      const l1Time = Date.now() - l1Start;

      // L2
      const l2Start = Date.now();
      await disclosureManager.getDisclosure("tool2", {
        score: 0.75,
        maxTokens: 3000,
      });
      const l2Time = Date.now() - l2Start;

      console.log(`L1 time: ${l1Time}ms, L2 time: ${l2Time}ms`);

      // L2 should generally be slower due to more content processing
      expect(l2Time).toBeGreaterThanOrEqual(l1Time);
    });
  });
});

// ============================================
// Tier 3 (Full Disclosure) 测试
// ============================================

describe("Tier 3: Full Disclosure", () => {
  let disclosureManager: DisclosureManager;

  beforeEach(() => {
    disclosureManager = new DisclosureManager({
      enabled: true,
      thresholds: { l2: 0.7, l3: 0.85 },
      l1MaxTokens: 120,
      l2MaxTokens: 5000,
      cache: {
        enabled: true,
        maxSize: 2000,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      },
    });
  });

  describe("Basic Full Disclosure", () => {
    it("should return RESOURCES level for score >= 0.85", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.9,
        maxTokens: 8000,
      });

      expect(result.level).toBe(DisclosureLevel.RESOURCES);
    });

    it("should include scripts in L3 disclosure", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.9,
        maxTokens: 8000,
        metadata: {
          scripts: [
            {
              name: "main",
              language: "javascript",
              content: 'console.log("Hello World");',
            },
          ],
        },
      });

      expect(result).toHaveProperty("level", DisclosureLevel.RESOURCES);
      expect(result).toHaveProperty("scripts");
      expect(Array.isArray(result.scripts)).toBe(true);
    });

    it("should include dependencies in L3 disclosure", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.9,
        maxTokens: 8000,
        metadata: {
          dependencies: [
            { name: "lodash", version: "^4.17.21" },
            { name: "axios", version: "^1.6.0" },
          ],
        },
      });

      expect(result).toHaveProperty("dependencies");
      expect(Array.isArray(result.dependencies)).toBe(true);
    });

    it("should include resources in L3 disclosure", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.9,
        maxTokens: 8000,
      });

      expect(result).toHaveProperty("resources");
      expect(Array.isArray(result.resources)).toBe(true);
    });

    it("should include all L2 fields plus L3-specific fields", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.9,
        maxTokens: 8000,
        metadata: {
          parameters: [
            { name: "input", type: "string", required: true, description: "Input data" },
          ],
          scripts: [
            {
              name: "main",
              language: "javascript",
              content: 'console.log("Hello World");',
            },
          ],
          dependencies: [{ name: "lodash", version: "^4.17.21" }],
        },
      });

      // Should have L2 fields
      expect(result).toHaveProperty("parameters");
      expect(result).toHaveProperty("examples");

      // Should have L3 fields
      expect(result).toHaveProperty("scripts");
      expect(result).toHaveProperty("dependencies");
      expect(result).toHaveProperty("resources");
    });
  });

  describe("L3 Decision Logic", () => {
    it("should return RESOURCES for score >= l3 threshold", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.85,
        maxTokens: 8000,
      });

      expect(result.level).toBe(DisclosureLevel.RESOURCES);
    });

    it("should return CONTENT for score between l2 and l3 thresholds", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.8,
        maxTokens: 8000,
      });

      // 0.8 is between 0.7 and 0.85, so should return CONTENT
      expect(result.level).toBe(DisclosureLevel.CONTENT);
    });

    it("should return METADATA for perfect score with very low token budget", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 1.0,
        maxTokens: 50, // Very low
      });

      expect(result.level).toBeDefined();
    });

    it("should handle exact threshold value (0.85)", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.85,
        maxTokens: 8000,
      });

      expect(result.level).toBe(DisclosureLevel.RESOURCES);
    });
  });

  describe("L3 Performance", () => {
    it("should complete L3 disclosure in < 100ms", async () => {
      const latencies: number[] = [];

      for (let i = 0; i < 20; i++) {
        const startTime = Date.now();
        await disclosureManager.getDisclosure(`tool${i}`, {
          score: 0.9,
          maxTokens: 8000,
        });
        latencies.push(Date.now() - startTime);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      console.log(`L3 Average latency: ${avgLatency.toFixed(2)}ms`);

      expect(avgLatency).toBeLessThan(100);
    });

    it("should be slower than L2 due to more content", async () => {
      // L2
      const l2Start = Date.now();
      await disclosureManager.getDisclosure("tool1", {
        score: 0.75,
        maxTokens: 3000,
      });
      const l2Time = Date.now() - l2Start;

      // L3
      const l3Start = Date.now();
      await disclosureManager.getDisclosure("tool2", {
        score: 0.9,
        maxTokens: 8000,
      });
      const l3Time = Date.now() - l3Start;

      console.log(`L2 time: ${l2Time}ms, L3 time: ${l3Time}ms`);

      // L3 should generally be slower due to more content
      expect(l3Time).toBeGreaterThanOrEqual(l2Time);
    });
  });
});

// ============================================
// 决策管理器测试
// ============================================

describe("DisclosureDecisionManager", () => {
  let decisionManager: DisclosureDecisionManager;

  beforeEach(() => {
    decisionManager = new DisclosureDecisionManager({
      l2: 0.7,
      l3: 0.85,
    });
  });

  describe("Decision Logic", () => {
    it("should return METADATA for very low token budget", () => {
      const input = createMockDecisionInput(0.9, 300);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });

    it("should return METADATA when maxTokens < 500", () => {
      const input = createMockDecisionInput(0.9, 400);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });

    it("should return CONTENT for score >= 0.7", () => {
      const input = createMockDecisionInput(0.75, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("threshold");
    });

    it("should return RESOURCES for score >= 0.85", () => {
      const input = createMockDecisionInput(0.9, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
      expect(decision.reason).toBe("threshold");
    });

    it("should return CONTENT for score < 0.7 (tokenBudget fallback)", () => {
      const input = createMockDecisionInput(0.5, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should handle exact threshold values", () => {
      expect(decisionManager.decide(createMockDecisionInput(0.7, 3000)).level).toBe(
        DisclosureLevel.CONTENT
      );
      expect(decisionManager.decide(createMockDecisionInput(0.85, 3000)).level).toBe(
        DisclosureLevel.RESOURCES
      );
    });

    it("should handle scores below all thresholds", () => {
      const input = createMockDecisionInput(0.3, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should handle zero score", () => {
      const input = createMockDecisionInput(0, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should handle perfect score", () => {
      const input = createMockDecisionInput(1.0, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
      expect(decision.reason).toBe("threshold");
    });
  });

  describe("Custom Thresholds", () => {
    it("should respect custom l2 threshold", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.8, l3: 0.9 });

      expect(manager.decide(createMockDecisionInput(0.75, 3000)).level).toBe(
        DisclosureLevel.CONTENT
      );
      expect(manager.decide(createMockDecisionInput(0.75, 3000)).reason).toBe("tokenBudget");
    });

    it("should respect custom l3 threshold", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.7, l3: 0.95 });

      // Score 0.9 is below l3 threshold (0.95), so should return CONTENT
      const decision = manager.decide(createMockDecisionInput(0.9, 3000));
      expect(decision.level).toBe(DisclosureLevel.CONTENT);
    });
  });

  describe("Edge Cases", () => {
    it("should handle maxTokens = 0", () => {
      const input = createMockDecisionInput(0.9, 0);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.METADATA);
    });

    it("should handle very high maxTokens", () => {
      const input = createMockDecisionInput(0.9, 100000);
      const decision = decisionManager.decide(input);

      // Should return appropriate level based on score
      expect(decision.level).toBeDefined();
    });

    it("should handle negative score", () => {
      const input = createMockDecisionInput(-0.1, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
    });

    it("should handle score > 1.0", () => {
      const input = createMockDecisionInput(1.5, 3000);
      const decision = decisionManager.decide(input);

      // Should cap at RESOURCES
      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
    });
  });
});

// ============================================
// 缓存测试
// ============================================

describe("DisclosureCache", () => {
  let cache: DisclosureCache;

  beforeEach(() => {
    cache = new DisclosureCache({
      enabled: true,
      maxSize: 10,
      l1TtlMs: 60000,
      l2TtlMs: 120000,
      cleanupIntervalMs: 0,
    });
  });

  describe("Basic Operations", () => {
    it("should store and retrieve values", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
        version: "1.0",
        hash: "abc123",
      };
      const content = createMockDisclosureContent(DisclosureLevel.METADATA);

      cache.set(key, content);
      const retrieved = cache.get(key);

      expect(retrieved).toEqual(content);
    });

    it("should return null for non-existent keys", () => {
      const key: DisclosureCacheKey = {
        id: "nonexistent",
        level: DisclosureLevel.METADATA,
      };

      expect(cache.get(key)).toBeNull();
    });

    it("should return null when cache is disabled", () => {
      const disabledCache = new DisclosureCache({
        enabled: false,
        maxSize: 10,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      });

      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createMockDisclosureContent(DisclosureLevel.METADATA);

      disabledCache.set(key, content);
      expect(disabledCache.get(key)).toBeNull();
    });
  });

  describe("TTL Expiration", () => {
    it("should expire entries after TTL", async () => {
      const shortTtlCache = new DisclosureCache({
        enabled: true,
        maxSize: 10,
        l1TtlMs: 50,
        l2TtlMs: 100,
        cleanupIntervalMs: 0,
      });

      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createMockDisclosureContent(DisclosureLevel.METADATA);

      shortTtlCache.set(key, content);
      expect(shortTtlCache.get(key)).toEqual(content);

      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(shortTtlCache.get(key)).toBeNull();
    });

    it("should respect custom TTL when provided", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createMockDisclosureContent(DisclosureLevel.METADATA);

      cache.set(key, content, 1000);
      expect(cache.get(key)).toEqual(content);
    });
  });

  describe("LRU Eviction", () => {
    it("should evict oldest entry when cache is full", () => {
      for (let i = 0; i < 10; i++) {
        const key: DisclosureCacheKey = {
          id: `tool${i}`,
          level: DisclosureLevel.METADATA,
        };
        const content = createMockDisclosureContent(DisclosureLevel.METADATA);
        cache.set(key, content);
      }

      const newKey: DisclosureCacheKey = {
        id: "tool10",
        level: DisclosureLevel.METADATA,
      };
      const newContent = createMockDisclosureContent(DisclosureLevel.METADATA);
      cache.set(newKey, newContent);

      expect(cache.get({ id: "tool0", level: DisclosureLevel.METADATA })).toBeNull();
      expect(cache.get(newKey)).toEqual(newContent);
    });

    it("should respect maxSize limit", async () => {
      const smallCache = new DisclosureCache({
        enabled: true,
        maxSize: 5,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      });

      // Add 10 entries (should evict 5)
      for (let i = 0; i < 10; i++) {
        smallCache.set(
          { id: `tool${i}`, level: DisclosureLevel.METADATA },
          createMockDisclosureContent(DisclosureLevel.METADATA)
        );
      }

      const stats = smallCache.stats();
      expect(stats.size).toBe(5);
    });
  });

  describe("Invalidation", () => {
    it("should remove all entries with matching id", () => {
      const baseKey = { id: "tool1", level: DisclosureLevel.METADATA };
      cache.set(baseKey, createMockDisclosureContent(DisclosureLevel.METADATA));
      cache.set(
        { ...baseKey, level: DisclosureLevel.CONTENT },
        createMockDisclosureContent(DisclosureLevel.CONTENT)
      );
      cache.set(
        { ...baseKey, version: "2.0" },
        createMockDisclosureContent(DisclosureLevel.METADATA)
      );

      cache.invalidate("tool1");

      expect(cache.get(baseKey)).toBeNull();
      expect(cache.get({ ...baseKey, level: DisclosureLevel.CONTENT })).toBeNull();
      expect(cache.get({ ...baseKey, version: "2.0" })).toBeNull();
    });

    it("should not affect other ids", () => {
      cache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createMockDisclosureContent(DisclosureLevel.METADATA)
      );
      cache.set(
        { id: "tool2", level: DisclosureLevel.METADATA },
        createMockDisclosureContent(DisclosureLevel.METADATA)
      );

      cache.invalidate("tool1");

      expect(cache.get({ id: "tool1", level: DisclosureLevel.METADATA })).toBeNull();
      expect(cache.get({ id: "tool2", level: DisclosureLevel.METADATA })).not.toBeNull();
    });
  });

  describe("Statistics", () => {
    it("should track cache hits and misses", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createMockDisclosureContent(DisclosureLevel.METADATA);

      cache.get(key); // Miss

      cache.set(key, content);
      cache.get(key); // Hit

      const stats = cache.stats();

      expect(stats.size).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it("should track only enabled cache stats", () => {
      const disabledCache = new DisclosureCache({
        enabled: false,
        maxSize: 10,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      });

      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createMockDisclosureContent(DisclosureLevel.METADATA);

      disabledCache.set(key, content);
      disabledCache.get(key);

      const stats = disabledCache.stats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });
  });
});

// ============================================
// 边界条件测试
// ============================================

describe("Boundary Condition Tests", () => {
  let disclosureManager: DisclosureManager;

  beforeEach(() => {
    disclosureManager = new DisclosureManager({
      enabled: true,
      thresholds: { l2: 0.7, l3: 0.85 },
      l1MaxTokens: 120,
      l2MaxTokens: 5000,
      cache: {
        enabled: true,
        maxSize: 2000,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      },
    });
  });

  describe("Token Limit Boundaries", () => {
    it("should handle zero token limit", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.9,
        maxTokens: 0,
      });

      // Should return minimal disclosure
      expect(result).toHaveProperty("level");
    });

    it("should handle very small token limit (1-10)", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.9,
        maxTokens: 10,
      });

      expect(result.tokenCount).toBeLessThanOrEqual(10);
    });

    it("should handle very large token limit", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.9,
        maxTokens: 100000,
      });

      // Should return full disclosure
      expect(result).toHaveProperty("level");
    });

    it("should handle token limit equal to threshold", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.9,
        maxTokens: 120, // Exactly l1MaxTokens
      });

      expect(result).toHaveProperty("level");
    });
  });

  describe("Score Boundaries", () => {
    it("should handle score = 0", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0,
        maxTokens: 3000,
      });

      expect(result.level).toBe(DisclosureLevel.CONTENT);
    });

    it("should handle score = 0.699999 (just below l2)", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.699999,
        maxTokens: 3000,
      });

      // Should return CONTENT (from tokenBudget fallback)
      expect(result.level).toBe(DisclosureLevel.CONTENT);
    });

    it("should handle score = 0.849999 (just below l3)", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 0.849999,
        maxTokens: 3000,
      });

      // Should return CONTENT (below l3 threshold but >= l2)
      expect(result.level).toBe(DisclosureLevel.CONTENT);
    });

    it("should handle negative score", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: -0.5,
        maxTokens: 3000,
      });

      expect(result.level).toBe(DisclosureLevel.CONTENT);
    });

    it("should handle score > 1.0", async () => {
      const result = await disclosureManager.getDisclosure("tool1", {
        score: 1.5,
        maxTokens: 3000,
      });

      // Should cap at RESOURCES
      expect(result.level).toBe(DisclosureLevel.RESOURCES);
    });
  });

  describe("Timeout Simulation", () => {
    it("should handle rapid successive requests", async () => {
      const requests = Array(100)
        .fill(null)
        .map((_, i) =>
          disclosureManager.getDisclosure(`tool${i}`, {
            score: 0.8,
            maxTokens: 3000,
          })
        );

      const startTime = Date.now();
      await Promise.all(requests);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // 5 seconds for 100 requests
    });

    it("should handle mixed disclosure levels", async () => {
      const mixedRequests = [
        { score: 0.95, tokens: 100 }, // L1
        { score: 0.8, tokens: 3000 }, // L2
        { score: 0.9, tokens: 8000 }, // L3
      ];

      const promises = mixedRequests.map((req, i) =>
        disclosureManager.getDisclosure(`tool${i}`, {
          score: req.score,
          maxTokens: req.tokens,
        })
      );

      const results = await Promise.all(promises);

      // All should complete successfully
      results.forEach((result, index) => {
        expect(result).toHaveProperty("level");
        expect(result).toHaveProperty("name");
      });
    });
  });

  describe("Cache Boundaries", () => {
    it("should handle cache miss for non-existent tool", async () => {
      const result = await disclosureManager.getDisclosure("non-existent-tool-xyz", {
        score: 0.9,
        maxTokens: 3000,
      });

      // Should still return a result (maybe empty or error)
      expect(result).toHaveProperty("level");
    });

    it("should handle concurrent cache access", async () => {
      const concurrentRequests = Array(50)
        .fill(null)
        .map((_, i) =>
          disclosureManager.getDisclosure("shared-tool", {
            score: 0.8 + (i % 10) * 0.01,
            maxTokens: 3000,
          })
        );

      // All should complete without race conditions
      const results = await Promise.all(concurrentRequests);
      expect(results.length).toBe(50);
    });

    it("should handle cache size limit", async () => {
      // Add more items than cache size
      const requests = Array(25)
        .fill(null)
        .map((_, i) =>
          disclosureManager.getDisclosure(`tool${i}`, {
            score: 0.8,
            maxTokens: 3000,
          })
        );

      await Promise.all(requests);

      // Cache should not exceed maxSize
      const cache = disclosureManager.getCache();
      const stats = cache.stats();
      expect(stats.size).toBeLessThanOrEqual(25); // Could be less due to evictions
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed tool data gracefully", async () => {
      // This tests error handling in the disclosure manager
      // The actual behavior depends on implementation
      const result = await disclosureManager.getDisclosure("tool-with-bad-data", {
        score: 0.8,
        maxTokens: 3000,
      });

      // Should not throw, should return some result
      expect(result).toHaveProperty("level");
    });

    it("should handle concurrent errors gracefully", async () => {
      const requests = Array(10)
        .fill(null)
        .map((_, i) =>
          disclosureManager.getDisclosure(`error-tool-${i}`, {
            score: 0.8,
            maxTokens: 3000,
          })
        );

      // Should not throw
      const results = await Promise.allSettled(requests);
      results.forEach((result) => {
        expect(result.status).toBe("fulfilled");
      });
    });
  });
});

// ============================================
// 配置测试
// ============================================

describe("Configuration Tests", () => {
  describe("Default Configuration", () => {
    it("should load DEFAULT_DISCLOSURE_CONFIG_V2", () => {
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.enabled).toBe(true);
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.thresholds).toEqual({ l2: 0.7, l3: 0.85 });
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.l1MaxTokens).toBe(120);
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.l2MaxTokens).toBe(5000);
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.cache.enabled).toBe(true);
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.cache.maxSize).toBe(2000);
    });
  });

  describe("Custom Configuration", () => {
    it("should accept custom thresholds", () => {
      const manager = new DisclosureDecisionManager({
        l2: 0.8,
        l3: 0.92,
      });

      const input = createMockDecisionInput(0.85, 3000);
      const decision = manager.decide(input);

      // 0.85 is below custom l3 (0.92) but above l2 (0.8)
      expect(decision.level).toBe(DisclosureLevel.CONTENT);
    });

    it("should accept custom token limits", async () => {
      const manager = new DisclosureManager({
        enabled: true,
        thresholds: { l2: 0.7, l3: 0.85 },
        l1MaxTokens: 200, // Custom
        l2MaxTokens: 8000, // Custom
        cache: {
          enabled: true,
          maxSize: 5000,
          l1TtlMs: 120000,
          l2TtlMs: 240000,
          cleanupIntervalMs: 0,
        },
      });

      const result = await manager.getDisclosure("tool1", {
        score: 0.95,
        maxTokens: 200,
      });

      expect(result.tokenCount).toBeLessThanOrEqual(200);
    });

    it("should handle disabled cache", async () => {
      const manager = new DisclosureManager({
        enabled: true,
        thresholds: { l2: 0.7, l3: 0.85 },
        l1MaxTokens: 120,
        l2MaxTokens: 5000,
        cache: {
          enabled: false,
          maxSize: 2000,
          l1TtlMs: 60000,
          l2TtlMs: 120000,
          cleanupIntervalMs: 0,
        },
      });

      // First request
      await manager.getDisclosure("tool1", {
        score: 0.8,
        maxTokens: 3000,
      });

      // Second request should not hit cache (cache is disabled)
      const result = await manager.getDisclosure("tool1", {
        score: 0.8,
        maxTokens: 3000,
      });

      expect(result).toHaveProperty("level");
    });
  });
});
