/**
 * DisclosureManager Test Suite - Enhanced with Boundary Tests
 */

import {
  DisclosureManager,
  DEFAULT_DISCLOSURE_CONFIG,
  DisclosureDecisionManager,
  DisclosureCache,
  DisclosureDecisionInput,
  DisclosureCacheKey,
  DEFAULT_DISCLOSURE_CONFIG_V2,
} from "../../../../src/services/tool-retrieval/DisclosureManager";
import {
  DisclosureLevel,
  DisclosureStrategy,
  DisclosureContent,
} from "../../../../src/types/enhanced-skill";
import { UnifiedRetrievalResult } from "../../../../src/types/enhanced-skill";

// ==================== Helper Functions ====================

function createTestResult(overrides: Partial<UnifiedRetrievalResult> = {}): UnifiedRetrievalResult {
  const defaultResult: UnifiedRetrievalResult = {
    id: "tool1",
    name: "File Tool",
    description: "A file tool for reading and writing files",
    unifiedScore: 0.9,
    scores: { vector: 0.9, keyword: 0, semantic: 0, tag: 0 },
    ranks: { vector: 1, keyword: 0, semantic: 0, tag: 0 },
    tags: ["file", "io"],
    toolType: "skill",
    disclosure: {
      level: DisclosureLevel.METADATA,
      name: "File Tool",
      description: "A file tool for reading and writing files",
      tokenCount: 0,
    },
  };

  return { ...defaultResult, ...overrides };
}

function createTestDisclosureContent(
  overrides: Partial<DisclosureContent> = {}
): DisclosureContent {
  const defaultContent: DisclosureContent = {
    level: DisclosureLevel.METADATA,
    name: "File Tool",
    description: "A file tool for reading and writing files",
    tokenCount: 10,
  };

  return { ...defaultContent, ...overrides };
}

describe("DisclosureManager", () => {
  let manager: DisclosureManager;

  beforeEach(() => {
    manager = new DisclosureManager();
  });

  describe("constructor", () => {
    it("should initialize with default config", () => {
      expect(manager).toBeInstanceOf(DisclosureManager);
    });

    it("should accept custom config", () => {
      const customManager = new DisclosureManager({
        strategy: DisclosureStrategy.CONTENT,
        adaptiveMaxTokens: 2000,
      });
      expect(customManager).toBeInstanceOf(DisclosureManager);
    });
  });

  describe("applyDisclosure", () => {
    it("should apply METADATA level disclosure", () => {
      const results: UnifiedRetrievalResult[] = [
        createTestResult({ id: "tool1", name: "File Tool", description: "A file tool" }),
      ];

      const disclosed = manager.applyDisclosure(results, DisclosureLevel.METADATA);

      expect(disclosed).toHaveLength(1);
      expect(disclosed[0].disclosure.level).toBe(DisclosureLevel.METADATA);
      expect(disclosed[0].disclosure.name).toBe("File Tool");
      expect(disclosed[0].disclosure.description).toBe("A file tool");
    });

    it("should apply CONTENT level disclosure", () => {
      const results: UnifiedRetrievalResult[] = [
        createTestResult({ id: "tool1", name: "File Tool", description: "A file tool" }),
      ];

      const disclosed = manager.applyDisclosure(results, DisclosureLevel.CONTENT);

      expect(disclosed).toHaveLength(1);
      expect(disclosed[0].disclosure.level).toBe(DisclosureLevel.CONTENT);
    });

    it("should apply RESOURCES level disclosure", () => {
      const results: UnifiedRetrievalResult[] = [
        createTestResult({ id: "tool1", name: "File Tool", description: "A file tool" }),
      ];

      const disclosed = manager.applyDisclosure(results, DisclosureLevel.RESOURCES);

      expect(disclosed).toHaveLength(1);
      expect(disclosed[0].disclosure.level).toBe(DisclosureLevel.RESOURCES);
    });

    it("should handle empty results", () => {
      const disclosed = manager.applyDisclosure([], DisclosureLevel.METADATA);
      expect(disclosed).toEqual([]);
    });

    it("should calculate token count", () => {
      const results: UnifiedRetrievalResult[] = [
        createTestResult({ id: "tool1", name: "File Tool", description: "A file tool" }),
      ];

      const disclosed = manager.applyDisclosure(results, DisclosureLevel.METADATA);

      expect(disclosed[0].disclosure.tokenCount).toBeGreaterThan(0);
    });
  });

  describe("applyAdaptiveDisclosure", () => {
    it("should apply METADATA for small token count", () => {
      const results: UnifiedRetrievalResult[] = [
        createTestResult({ id: "tool1", name: "Tool", description: "Short" }),
      ];

      const disclosed = manager.applyAdaptiveDisclosure(results, 1000);

      expect(disclosed).toHaveLength(1);
      expect(disclosed[0].disclosure.level).toBe(DisclosureLevel.METADATA);
    });

    it("should handle empty results", () => {
      const disclosed = manager.applyAdaptiveDisclosure([], 1000);
      expect(disclosed).toEqual([]);
    });
  });

  describe("getDisclosureContent", () => {
    it("should return base content for METADATA level", () => {
      const result = createTestResult({
        id: "tool1",
        name: "File Tool",
        description: "A file tool",
      });

      const content = manager.getDisclosureContent(result, DisclosureLevel.METADATA);

      expect(content.level).toBe(DisclosureLevel.METADATA);
      expect(content.name).toBe("File Tool");
      expect(content.description).toBe("A file tool");
    });

    it("should include examples for CONTENT level", () => {
      const result = createTestResult({
        id: "tool1",
        name: "File Tool",
        description: "A file tool",
      });
      result.metadata = { examples: ["example1", "example2"] };

      const content = manager.getDisclosureContent(result, DisclosureLevel.CONTENT);

      expect(content.examples).toEqual([
        { input: "example1", output: "example1" },
        { input: "example2", output: "example2" },
      ]);
    });

    it("should include resources for RESOURCES level", () => {
      const result = createTestResult({
        id: "tool1",
        name: "File Tool",
        description: "A file tool",
      });
      result.path = "/path/to/tool";

      const content = manager.getDisclosureContent(result, DisclosureLevel.RESOURCES);

      expect(content.resources).toContainEqual({
        type: "file",
        path: "/path/to/tool",
        description: "/path/to/tool",
      });
    });
  });

  // ==================== Phase 2: Boundary Condition Tests ====================

  describe("Boundary Conditions", () => {
    it("should handle very long content without crashing", () => {
      const longContent = "x".repeat(100000);
      const result = createTestResult({
        description: longContent,
      });

      const content = manager.getDisclosureContent(result, DisclosureLevel.CONTENT);

      expect(content.tokenCount).toBeGreaterThan(0);
    });

    it("should handle empty name and description", () => {
      const result = createTestResult({
        name: "",
        description: "",
      });

      const content = manager.getDisclosureContent(result, DisclosureLevel.METADATA);

      expect(content.name).toBe("");
      expect(content.description).toBe("");
      expect(content.tokenCount).toBe(0);
    });

    it("should handle special characters in content", () => {
      const specialResult = createTestResult({
        name: "Tool with special chars: @#$%",
        description: 'Description with "quotes" and newlines\n\tand unicode: 你好',
      });

      const content = manager.getDisclosureContent(specialResult, DisclosureLevel.METADATA);

      expect(content.name).toBe("Tool with special chars: @#$%");
      expect(content.description).toContain("quotes");
    });

    it("should handle metadata with various schema formats", () => {
      const result = createTestResult({ id: "tool1" });
      result.metadata = {
        inputSchema: { type: "object", properties: { name: { type: "string" } } },
        parameters: { type: "object", properties: { age: { type: "number" } } },
        outputSchema: { type: "string" },
        output: { type: "object" },
      };

      const content = manager.getDisclosureContent(result, DisclosureLevel.CONTENT);

      expect(content.inputSchema).toBeDefined();
      expect(content.outputSchema).toBeDefined();
    });

    it("should handle metadata with examples array variations", () => {
      const result = createTestResult({ id: "tool1" });
      result.metadata = {
        examples: ["example1", "example2"],
        example: ["deprecated1", "deprecated2"],
      };

      const content = manager.getDisclosureContent(result, DisclosureLevel.CONTENT);

      expect(content.examples).toEqual([
        { input: "example1", output: "example1" },
        { input: "example2", output: "example2" },
      ]);
    });

    it("should handle metadata with resources array variations", () => {
      const result = createTestResult({ id: "tool1", path: "/path/to/tool" });
      result.metadata = {
        resources: ["resource1", "resource2"],
        relatedFiles: ["file1.md", "file2.md"],
        dependencies: ["dep1", "dep2"],
      };

      const content = manager.getDisclosureContent(result, DisclosureLevel.RESOURCES);

      // extractResources returns the first array found (resources), not combined
      expect(content.resources).toContainEqual({
        type: "file",
        path: "resource1",
        description: "resource1",
      });
      expect(content.resources).toContainEqual({
        type: "file",
        path: "resource2",
        description: "resource2",
      });
      // relatedFiles and dependencies are not included when resources exists
    });
  });

  describe("Token Estimation", () => {
    it("should estimate tokens correctly for English text", () => {
      const result = createTestResult({
        name: "test",
        description: "test",
      });

      const content = manager.getDisclosureContent(result, DisclosureLevel.METADATA);

      // 4 chars per token estimate: "test" + "test" = 8 chars / 4 = 2 tokens
      expect(content.tokenCount).toBeGreaterThanOrEqual(2);
    });

    it("should handle empty strings in token estimation", () => {
      const result = createTestResult({
        name: "",
        description: "",
      });

      const content = manager.getDisclosureContent(result, DisclosureLevel.METADATA);

      expect(content.tokenCount).toBe(0);
    });

    it("should estimate tokens for JSON schemas", () => {
      const result = createTestResult({ id: "tool1" });
      result.metadata = {
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
            active: { type: "boolean" },
          },
        },
      };

      const content = manager.getDisclosureContent(result, DisclosureLevel.CONTENT);

      expect(content.tokenCount).toBeGreaterThan(0);
    });
  });
});

describe("DisclosureDecisionManager", () => {
  let decisionManager: DisclosureDecisionManager;

  beforeEach(() => {
    decisionManager = new DisclosureDecisionManager({
      l2: 0.7,
      l3: 0.85,
    });
  });

  describe("decide() - Threshold Logic", () => {
    it("should return METADATA for very low token budget (maxTokens < 500)", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.9 }),
        score: 0.9,
        maxTokens: 300,
      };
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });

    it("should return METADATA when maxTokens = 499", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.9 }),
        score: 0.9,
        maxTokens: 499,
      };
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });

    it("should return CONTENT for score >= 0.7 (exact threshold)", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.7 }),
        score: 0.7,
        maxTokens: 3000,
      };
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("threshold");
    });

    it("should return RESOURCES for score >= 0.85 (exact threshold)", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.85 }),
        score: 0.85,
        maxTokens: 3000,
      };
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
      expect(decision.reason).toBe("threshold");
    });

    it("should return METADATA for score just below 0.7 threshold (0.699)", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.699 }),
        score: 0.699,
        maxTokens: 3000,
      };
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should return CONTENT for score just below 0.85 threshold (0.849)", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.849 }),
        score: 0.849,
        maxTokens: 3000,
      };
      const decision = decisionManager.decide(input);

      // 0.849 < 0.85 but >= 0.7, so it should be CONTENT + threshold
      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("threshold");
    });

    it("should handle zero score", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0 }),
        score: 0,
        maxTokens: 3000,
      };
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should handle perfect score (1.0)", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 1.0 }),
        score: 1.0,
        maxTokens: 3000,
      };
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
      expect(decision.reason).toBe("threshold");
    });
  });

  describe("decide() - Edge Cases", () => {
    it("should respect maxTokens = 500 boundary", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.9 }),
        score: 0.9,
        maxTokens: 500,
      };
      const decision = decisionManager.decide(input);

      // maxTokens = 500 should still apply threshold logic (>= 500)
      expect(decision.level).not.toBe(DisclosureLevel.METADATA);
    });

    it("should handle very high scores with low token budget", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.95 }),
        score: 0.95,
        maxTokens: 100, // Very low token budget
      };
      const decision = decisionManager.decide(input);

      // Token budget should override score
      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("always");
    });

    it("should handle maximum token limit (very high maxTokens)", () => {
      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.9 }),
        score: 0.9,
        maxTokens: 100000,
      };
      const decision = decisionManager.decide(input);

      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
      expect(decision.reason).toBe("threshold");
    });
  });

  describe("Custom Thresholds", () => {
    it("should respect custom l2 threshold", () => {
      const customManager = new DisclosureDecisionManager({ l2: 0.8, l3: 0.9 });

      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.75 }),
        score: 0.75,
        maxTokens: 3000,
      };

      const decision = customManager.decide(input);

      // Score 0.75 < 0.8 (custom l2), so should be tokenBudget fallback
      expect(decision.level).toBe(DisclosureLevel.METADATA);
      expect(decision.reason).toBe("tokenBudget");
    });

    it("should respect custom l3 threshold", () => {
      const customManager = new DisclosureDecisionManager({ l2: 0.7, l3: 0.95 });

      const input: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.9 }),
        score: 0.9,
        maxTokens: 3000,
      };

      const decision = customManager.decide(input);

      // Score 0.9 < 0.95 (custom l3), >= 0.7 (l2)
      expect(decision.level).toBe(DisclosureLevel.CONTENT);
      expect(decision.reason).toBe("threshold");
    });

    it("should handle equal l2 and l3 thresholds", () => {
      const customManager = new DisclosureDecisionManager({ l2: 0.8, l3: 0.8 });

      const inputHigh: DisclosureDecisionInput = {
        result: createTestResult({ unifiedScore: 0.85 }),
        score: 0.85,
        maxTokens: 3000,
      };

      const decision = customManager.decide(inputHigh);

      // Score 0.85 >= 0.8 (both thresholds)
      expect(decision.level).toBe(DisclosureLevel.RESOURCES);
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
    it("should store and retrieve METADATA content", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createTestDisclosureContent({ level: DisclosureLevel.METADATA });

      cache.set(key, content);
      const retrieved = cache.get(key);

      expect(retrieved).toEqual(content);
    });

    it("should store and retrieve CONTENT content", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.CONTENT,
      };
      const content = createTestDisclosureContent({ level: DisclosureLevel.CONTENT });

      cache.set(key, content);
      const retrieved = cache.get(key);

      expect(retrieved).toEqual(content);
    });

    it("should store and retrieve RESOURCES content", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.RESOURCES,
      };
      const content = createTestDisclosureContent({ level: DisclosureLevel.RESOURCES });

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
      const content = createTestDisclosureContent({ level: DisclosureLevel.METADATA });

      disabledCache.set(key, content);
      expect(disabledCache.get(key)).toBeNull();
    });
  });

  describe("TTL expiration", () => {
    it("should expire entries after L1 TTL", async () => {
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
      const content = createTestDisclosureContent({ level: DisclosureLevel.METADATA });

      shortTtlCache.set(key, content);
      expect(shortTtlCache.get(key)).toEqual(content);

      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(shortTtlCache.get(key)).toBeNull();
    });

    it("should expire entries after L2 TTL", async () => {
      const shortTtlCache = new DisclosureCache({
        enabled: true,
        maxSize: 10,
        l1TtlMs: 50,
        l2TtlMs: 100,
        cleanupIntervalMs: 0,
      });

      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.CONTENT,
      };
      const content = createTestDisclosureContent({ level: DisclosureLevel.CONTENT });

      shortTtlCache.set(key, content, 100);
      expect(shortTtlCache.get(key)).toEqual(content);

      await new Promise((resolve) => setTimeout(resolve, 120));

      expect(shortTtlCache.get(key)).toBeNull();
    });

    it("should respect custom TTL when provided", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createTestDisclosureContent({ level: DisclosureLevel.METADATA });

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
        const content = createTestDisclosureContent({ level: DisclosureLevel.METADATA });
        cache.set(key, content);
      }

      const newKey: DisclosureCacheKey = {
        id: "tool10",
        level: DisclosureLevel.METADATA,
      };
      const newContent = createTestDisclosureContent({ level: DisclosureLevel.METADATA });
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
          createTestDisclosureContent({ level: DisclosureLevel.METADATA })
        );
      }

      const stats = smallCache.stats();
      expect(stats.size).toBe(5);
    });

    it("should handle cache size boundary (exactly maxSize)", () => {
      const boundaryCache = new DisclosureCache({
        enabled: true,
        maxSize: 5,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      });

      // Add exactly maxSize entries
      for (let i = 0; i < 5; i++) {
        boundaryCache.set(
          { id: `tool${i}`, level: DisclosureLevel.METADATA },
          createTestDisclosureContent({ level: DisclosureLevel.METADATA })
        );
      }

      const stats = boundaryCache.stats();
      expect(stats.size).toBe(5);

      // Adding one more should evict oldest
      boundaryCache.set(
        { id: "tool5", level: DisclosureLevel.METADATA },
        createTestDisclosureContent({ level: DisclosureLevel.METADATA })
      );

      expect(boundaryCache.stats().size).toBe(5);
    });
  });

  describe("invalidate()", () => {
    it("should remove all entries with matching id", () => {
      const baseKey = { id: "tool1", level: DisclosureLevel.METADATA };
      cache.set(baseKey, createTestDisclosureContent({ level: DisclosureLevel.METADATA }));
      cache.set(
        { ...baseKey, level: DisclosureLevel.CONTENT },
        createTestDisclosureContent({ level: DisclosureLevel.CONTENT })
      );
      cache.set(
        { ...baseKey, version: "2.0" },
        createTestDisclosureContent({ level: DisclosureLevel.METADATA })
      );

      cache.invalidate("tool1");

      expect(cache.get(baseKey)).toBeNull();
      expect(cache.get({ ...baseKey, level: DisclosureLevel.CONTENT })).toBeNull();
      expect(cache.get({ ...baseKey, version: "2.0" })).toBeNull();
    });

    it("should not affect other ids", () => {
      cache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createTestDisclosureContent({ level: DisclosureLevel.METADATA })
      );
      cache.set(
        { id: "tool2", level: DisclosureLevel.METADATA },
        createTestDisclosureContent({ level: DisclosureLevel.METADATA })
      );

      cache.invalidate("tool1");

      expect(cache.get({ id: "tool1", level: DisclosureLevel.METADATA })).toBeNull();
      expect(cache.get({ id: "tool2", level: DisclosureLevel.METADATA })).not.toBeNull();
    });

    it("should handle invalidation of non-existent id", () => {
      cache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createTestDisclosureContent({ level: DisclosureLevel.METADATA })
      );

      // Should not throw
      expect(() => cache.invalidate("nonexistent")).not.toThrow();

      // Original should still exist
      expect(cache.get({ id: "tool1", level: DisclosureLevel.METADATA })).not.toBeNull();
    });
  });

  describe("stats()", () => {
    it("should track cache hits and misses", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createTestDisclosureContent({ level: DisclosureLevel.METADATA });

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
      const content = createTestDisclosureContent({ level: DisclosureLevel.METADATA });

      disabledCache.set(key, content);
      disabledCache.get(key);

      const stats = disabledCache.stats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });

    it("should return correct size after operations", () => {
      cache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createTestDisclosureContent({ level: DisclosureLevel.METADATA })
      );
      cache.set(
        { id: "tool2", level: DisclosureLevel.METADATA },
        createTestDisclosureContent({ level: DisclosureLevel.METADATA })
      );

      expect(cache.stats().size).toBe(2);

      cache.invalidate("tool1");

      expect(cache.stats().size).toBe(1);
    });
  });

  describe("Cache Key Generation", () => {
    it("should generate unique keys for different levels", () => {
      const baseKey = { id: "tool1", level: DisclosureLevel.METADATA };
      const contentKey = { ...baseKey, level: DisclosureLevel.CONTENT };
      const resourcesKey = { ...baseKey, level: DisclosureLevel.RESOURCES };

      cache.set(baseKey, createTestDisclosureContent({ level: DisclosureLevel.METADATA }));
      cache.set(contentKey, createTestDisclosureContent({ level: DisclosureLevel.CONTENT }));
      cache.set(resourcesKey, createTestDisclosureContent({ level: DisclosureLevel.RESOURCES }));

      expect(cache.stats().size).toBe(3);
    });

    it("should include hash in key generation", () => {
      const key1: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
        hash: "abc123",
      };
      const key2: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
        hash: "def456",
      };

      cache.set(key1, createTestDisclosureContent({ level: DisclosureLevel.METADATA }));
      cache.set(key2, createTestDisclosureContent({ level: DisclosureLevel.METADATA }));

      expect(cache.stats().size).toBe(2);
    });

    it("should use default hash when not provided", () => {
      const key1: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const key2: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
        hash: undefined,
      };

      cache.set(key1, createTestDisclosureContent({ level: DisclosureLevel.METADATA }));
      cache.set(key2, createTestDisclosureContent({ level: DisclosureLevel.METADATA }));

      // Should overwrite because same key
      expect(cache.stats().size).toBe(1);
    });
  });

  // ==================== VUL-003: Timer Cleanup Tests ====================

  describe("Timer Cleanup (VUL-003)", () => {
    it("should not create timer when cleanupIntervalMs is 0", () => {
      const noTimerCache = new DisclosureCache({
        enabled: true,
        maxSize: 10,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      });

      // Cache should work without timer
      noTimerCache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createTestDisclosureContent({ level: DisclosureLevel.METADATA })
      );

      expect(noTimerCache.get({ id: "tool1", level: DisclosureLevel.METADATA })).not.toBeNull();

      // Dispose should work even without timer
      return expect(noTimerCache.dispose()).resolves.not.toThrow();
    });

    it("should create cleanup timer when cleanupIntervalMs > 0", () => {
      const timerCache = new DisclosureCache({
        enabled: true,
        maxSize: 10,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 1000,
      });

      // Cache should work with timer
      timerCache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createTestDisclosureContent({ level: DisclosureLevel.METADATA })
      );

      expect(timerCache.get({ id: "tool1", level: DisclosureLevel.METADATA })).not.toBeNull();
    });

    it("should stop timer on dispose", async () => {
      const timerCache = new DisclosureCache({
        enabled: true,
        maxSize: 10,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 100,
      });

      // Add some items
      timerCache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createTestDisclosureContent({ level: DisclosureLevel.METADATA })
      );

      // Dispose should resolve without error
      await timerCache.dispose();

      // After dispose, cache should be empty
      expect(timerCache.get({ id: "tool1", level: DisclosureLevel.METADATA })).toBeNull();
    });

    it("should clear cache on dispose", async () => {
      const timerCache = new DisclosureCache({
        enabled: true,
        maxSize: 10,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 100,
      });

      // Add multiple items
      for (let i = 0; i < 5; i++) {
        timerCache.set(
          { id: `tool${i}`, level: DisclosureLevel.METADATA },
          createTestDisclosureContent({ level: DisclosureLevel.METADATA })
        );
      }

      expect(timerCache.stats().size).toBe(5);

      await timerCache.dispose();

      // Cache should be empty after dispose
      expect(timerCache.stats().size).toBe(0);
    });

    it("should handle multiple dispose calls gracefully", async () => {
      const timerCache = new DisclosureCache({
        enabled: true,
        maxSize: 10,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 100,
      });

      // First dispose
      await timerCache.dispose();

      // Second dispose should not throw
      await expect(timerCache.dispose()).resolves.not.toThrow();
    });
  });
});

describe("Configuration", () => {
  describe("DEFAULT_DISCLOSURE_CONFIG", () => {
    it("should have correct default values", () => {
      expect(DEFAULT_DISCLOSURE_CONFIG.strategy).toBe(DisclosureStrategy.METADATA);
      expect(DEFAULT_DISCLOSURE_CONFIG.adaptiveMaxTokens).toBe(3000);
      expect(DEFAULT_DISCLOSURE_CONFIG.preferMetadataBelow).toBe(500);
    });
  });

  describe("DEFAULT_DISCLOSURE_CONFIG_V2", () => {
    it("should have correct Phase 2 defaults", () => {
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.enabled).toBe(true);
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.thresholds).toEqual({ l2: 0.7, l3: 0.85 });
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.l1MaxTokens).toBe(120);
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.l2MaxTokens).toBe(5000);
    });

    it("should have correct cache defaults", () => {
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.cache.enabled).toBe(true);
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.cache.maxSize).toBe(2000);
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.cache.l1TtlMs).toBe(300000);
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.cache.l2TtlMs).toBe(300000);
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.cache.cleanupIntervalMs).toBe(300000);
    });

    it("should have correct parallel load defaults", () => {
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.parallelLoad.enabled).toBe(true);
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.parallelLoad.maxConcurrency).toBe(8);
    });

    it("should have correct metrics defaults", () => {
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.metrics.enabled).toBe(true);
      expect(DEFAULT_DISCLOSURE_CONFIG_V2.metrics.sampleRate).toBe(1.0);
    });
  });
});
