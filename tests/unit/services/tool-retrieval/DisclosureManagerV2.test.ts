/**
 * DisclosureManagerV2 Test Suite - Phase 2
 *
 * Tests for:
 * - DisclosureDecisionManager: threshold decision logic
 * - DisclosureCache: TTL, LRU, stats, invalidation
 * - HybridRetrievalEngine: disclosure integration
 * - Configuration loading
 */

import {
  DisclosureDecisionManager,
  DisclosureCache,
  DisclosureDecisionInput,
  DisclosureCacheKey,
  DEFAULT_DISCLOSURE_CONFIG_V2,
} from "../../../../src/services/tool-retrieval/DisclosureManager";
import { DisclosureLevel, DisclosureContent } from "../../../../src/types/enhanced-skill";

// Helper to create mock disclosure content
const createMockDisclosure = (
  level: DisclosureLevel = DisclosureLevel.METADATA
): DisclosureContent => ({
  level,
  name: "Test Tool",
  description: "A test tool",
  tokenCount: 10,
});

// Helper to create mock result for decision input
const createMockInput = (score: number, maxTokens: number = 3000): DisclosureDecisionInput => ({
  result: {
    id: "tool1",
    name: "Test Tool",
    description: "A test tool",
    unifiedScore: score,
    scores: { vector: score, keyword: 0, semantic: 0, tag: 0 },
    ranks: { vector: 1, keyword: 0, semantic: 0, tag: 0 },
    tags: [],
    toolType: "skill" as const,
    disclosure: createMockDisclosure(),
  },
  score,
  maxTokens,
});

describe("DisclosureDecisionManager", () => {
  let decisionManager: DisclosureDecisionManager;

  beforeEach(() => {
    decisionManager = new DisclosureDecisionManager({
      l2: 0.7,
      l3: 0.85,
    });
  });

  describe("decide()", () => {
    it("should return METADATA for very low token budget", () => {
      const input = createMockInput(0.9, 300);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });

    it("should return METADATA when maxTokens < 500", () => {
      const input = createMockInput(0.9, 400);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });

    it("should return CONTENT for score >= 0.7", () => {
      const input = createMockInput(0.75, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("threshold");
    });

    it("should return RESOURCES for score >= 0.85", () => {
      const input = createMockInput(0.9, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
      expect(decision.reason).toBe("threshold");
    });

    it("should return CONTENT for score < 0.7 (tokenBudget fallback)", () => {
      const input = createMockInput(0.5, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should handle exact threshold values", () => {
      expect(decisionManager.decide(createMockInput(0.7, 3000)).level).toBe(
        DisclosureLevel.CONTENT
      );
      expect(decisionManager.decide(createMockInput(0.85, 3000)).level).toBe(
        DisclosureLevel.RESOURCES
      );
    });

    it("should handle scores below all thresholds", () => {
      const input = createMockInput(0.3, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should handle zero score", () => {
      const input = createMockInput(0, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should handle perfect score", () => {
      const input = createMockInput(1.0, 3000);
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
      expect(decision.reason).toBe("threshold");
    });
  });

  describe("custom thresholds", () => {
    it("should respect custom l2 threshold", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.8, l3: 0.9 });

      expect(manager.decide(createMockInput(0.75, 3000)).level).toBe(DisclosureLevel.CONTENT);
      expect(manager.decide(createMockInput(0.75, 3000)).reason).toBe("tokenBudget");
    });

    it("should respect custom l3 threshold", () => {
      const manager = new DisclosureDecisionManager({ l2: 0.7, l3: 0.95 });

      expect(manager.decide(createMockInput(0.9, 3000)).level).toBe(DisclosureLevel.CONTENT);
    });
  });
});

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

  describe("get/set", () => {
    it("should store and retrieve values", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
        version: "1.0",
        hash: "abc123",
      };
      const content = createMockDisclosure(DisclosureLevel.METADATA);

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
      const content = createMockDisclosure(DisclosureLevel.METADATA);

      disabledCache.set(key, content);
      expect(disabledCache.get(key)).toBeNull();
    });
  });

  describe("TTL expiration", () => {
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
      const content = createMockDisclosure(DisclosureLevel.METADATA);

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
      const content = createMockDisclosure(DisclosureLevel.METADATA);

      cache.set(key, content, 1000);
      expect(cache.get(key)).toEqual(content);
    });
  });

  describe("LRU eviction", () => {
    it("should evict oldest entry when cache is full", () => {
      for (let i = 0; i < 10; i++) {
        const key: DisclosureCacheKey = {
          id: `tool${i}`,
          level: DisclosureLevel.METADATA,
        };
        const content = createMockDisclosure(DisclosureLevel.METADATA);
        cache.set(key, content);
      }

      const newKey: DisclosureCacheKey = {
        id: "tool10",
        level: DisclosureLevel.METADATA,
      };
      const newContent = createMockDisclosure(DisclosureLevel.METADATA);
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
          createMockDisclosure(DisclosureLevel.METADATA)
        );
      }

      const stats = smallCache.stats();
      expect(stats.size).toBe(5);
    });
  });

  describe("invalidate()", () => {
    it("should remove all entries with matching id", () => {
      const baseKey = { id: "tool1", level: DisclosureLevel.METADATA };
      cache.set(baseKey, createMockDisclosure(DisclosureLevel.METADATA));
      cache.set(
        { ...baseKey, level: DisclosureLevel.CONTENT },
        createMockDisclosure(DisclosureLevel.CONTENT)
      );
      cache.set({ ...baseKey, version: "2.0" }, createMockDisclosure(DisclosureLevel.METADATA));

      cache.invalidate("tool1");

      expect(cache.get(baseKey)).toBeNull();
      expect(cache.get({ ...baseKey, level: DisclosureLevel.CONTENT })).toBeNull();
      expect(cache.get({ ...baseKey, version: "2.0" })).toBeNull();
    });

    it("should not affect other ids", () => {
      cache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createMockDisclosure(DisclosureLevel.METADATA)
      );
      cache.set(
        { id: "tool2", level: DisclosureLevel.METADATA },
        createMockDisclosure(DisclosureLevel.METADATA)
      );

      cache.invalidate("tool1");

      expect(cache.get({ id: "tool1", level: DisclosureLevel.METADATA })).toBeNull();
      expect(cache.get({ id: "tool2", level: DisclosureLevel.METADATA })).not.toBeNull();
    });
  });

  describe("stats()", () => {
    it("should track cache hits and misses", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createMockDisclosure(DisclosureLevel.METADATA);

      cache.get(key);

      cache.set(key, content);
      cache.get(key);

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
      const content = createMockDisclosure(DisclosureLevel.METADATA);

      disabledCache.set(key, content);
      disabledCache.get(key);

      const stats = disabledCache.stats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });
  });
});

describe("Configuration Loading", () => {
  it("should load DEFAULT_DISCLOSURE_CONFIG_V2", () => {
    expect(DEFAULT_DISCLOSURE_CONFIG_V2.enabled).toBe(true);
    expect(DEFAULT_DISCLOSURE_CONFIG_V2.thresholds).toEqual({ l2: 0.7, l3: 0.85 });
    expect(DEFAULT_DISCLOSURE_CONFIG_V2.l1MaxTokens).toBe(120);
    expect(DEFAULT_DISCLOSURE_CONFIG_V2.l2MaxTokens).toBe(5000);
    expect(DEFAULT_DISCLOSURE_CONFIG_V2.cache.enabled).toBe(true);
    expect(DEFAULT_DISCLOSURE_CONFIG_V2.cache.maxSize).toBe(2000);
  });
});
