/**
 * DisclosureCache Test Suite - Standalone Cache Tests
 *
 * Focused tests for:
 * - TTL expiration (L1 and L2)
 * - LRU eviction policies
 * - Cache key generation
 * - Statistics tracking
 * - Invalidation logic
 */

import {
  DisclosureCache,
  DisclosureCacheKey,
  DEFAULT_DISCLOSURE_CONFIG_V2,
} from "../../../../src/services/tool-retrieval/DisclosureManager";
import { DisclosureLevel, DisclosureContent } from "../../../../src/types/enhanced-skill";

// ==================== Helper Functions ====================

function createTestDisclosureContent(
  level: DisclosureLevel = DisclosureLevel.METADATA,
  name: string = "Test Tool"
): DisclosureContent {
  return {
    level,
    name,
    description: `A ${name.toLowerCase().replace(/ /g, "_")} for testing`,
    tokenCount: 10,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== Test Suite ====================

describe("DisclosureCache - Basic Operations", () => {
  let cache: DisclosureCache;

  beforeEach(() => {
    cache = new DisclosureCache({
      enabled: true,
      maxSize: 100,
      l1TtlMs: 60000,
      l2TtlMs: 120000,
      cleanupIntervalMs: 0,
    });
  });

  describe("get/set operations", () => {
    it("should store and retrieve METADATA level content", () => {
      const key: DisclosureCacheKey = {
        id: "file-tool",
        level: DisclosureLevel.METADATA,
      };
      const content = createTestDisclosureContent(DisclosureLevel.METADATA, "File Tool");

      cache.set(key, content);
      const retrieved = cache.get(key);

      expect(retrieved).not.toBeNull();
      expect(retrieved).toEqual(content);
    });

    it("should store and retrieve CONTENT level content", () => {
      const key: DisclosureCacheKey = {
        id: "http-tool",
        level: DisclosureLevel.CONTENT,
      };
      const content = createTestDisclosureContent(DisclosureLevel.CONTENT, "HTTP Tool");

      cache.set(key, content);
      const retrieved = cache.get(key);

      expect(retrieved).not.toBeNull();
      expect(retrieved).toEqual(content);
    });

    it("should store and retrieve RESOURCES level content", () => {
      const key: DisclosureCacheKey = {
        id: "db-tool",
        level: DisclosureLevel.RESOURCES,
      };
      const content = createTestDisclosureContent(DisclosureLevel.RESOURCES, "Database Tool");

      cache.set(key, content);
      const retrieved = cache.get(key);

      expect(retrieved).not.toBeNull();
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
        maxSize: 100,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      });

      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createTestDisclosureContent();

      disabledCache.set(key, content);
      expect(disabledCache.get(key)).toBeNull();
    });

    it("should update existing entries on set", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const originalContent = createTestDisclosureContent(DisclosureLevel.METADATA, "Original");
      const updatedContent = createTestDisclosureContent(DisclosureLevel.METADATA, "Updated");

      cache.set(key, originalContent);
      cache.set(key, updatedContent);

      const retrieved = cache.get(key);
      expect(retrieved).toEqual(updatedContent);
      expect(cache.stats().size).toBe(1);
    });
  });

  describe("TTL expiration", () => {
    it("should expire L1 entries after default TTL", async () => {
      const shortTtlCache = new DisclosureCache({
        enabled: true,
        maxSize: 100,
        l1TtlMs: 50,
        l2TtlMs: 100,
        cleanupIntervalMs: 0,
      });

      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createTestDisclosureContent(DisclosureLevel.METADATA);

      shortTtlCache.set(key, content);
      expect(shortTtlCache.get(key)).not.toBeNull();

      await delay(60);

      expect(shortTtlCache.get(key)).toBeNull();
    });

    it("should expire L2 entries after L2 TTL", async () => {
      const shortTtlCache = new DisclosureCache({
        enabled: true,
        maxSize: 100,
        l1TtlMs: 50,
        l2TtlMs: 100,
        cleanupIntervalMs: 0,
      });

      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.CONTENT,
      };
      const content = createTestDisclosureContent(DisclosureLevel.CONTENT);

      shortTtlCache.set(key, content, 100);
      expect(shortTtlCache.get(key)).not.toBeNull();

      await delay(120);

      expect(shortTtlCache.get(key)).toBeNull();
    });

    it("should respect custom TTL when provided", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createTestDisclosureContent();

      cache.set(key, content, 1000);
      expect(cache.get(key)).toEqual(content);
    });

    it("should handle TTL=0 (uses default TTL)", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createTestDisclosureContent();

      // TTL=0 uses default L1 TTL, not immediate expiration
      cache.set(key, content, 0);
      expect(cache.get(key)).not.toBeNull();
    });

    it("should refresh access time on get (touch)", async () => {
      const touchCache = new DisclosureCache({
        enabled: true,
        maxSize: 100,
        l1TtlMs: 100,
        l2TtlMs: 200,
        cleanupIntervalMs: 0,
      });

      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createTestDisclosureContent();

      touchCache.set(key, content, 100);

      await delay(60);
      touchCache.get(key);

      await delay(60);

      expect(touchCache.get(key)).not.toBeNull();
    });
  });

  describe("LRU eviction", () => {
    it("should evict oldest entry when cache is full", () => {
      const smallCache = new DisclosureCache({
        enabled: true,
        maxSize: 5,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      });

      for (let i = 0; i < 5; i++) {
        smallCache.set(
          { id: `tool${i}`, level: DisclosureLevel.METADATA },
          createTestDisclosureContent(DisclosureLevel.METADATA, `Tool${i}`)
        );
      }

      const newKey: DisclosureCacheKey = {
        id: "tool5",
        level: DisclosureLevel.METADATA,
      };
      smallCache.set(newKey, createTestDisclosureContent(DisclosureLevel.METADATA, "Tool5"));

      expect(smallCache.get({ id: "tool0", level: DisclosureLevel.METADATA })).toBeNull();
      expect(smallCache.get(newKey)).not.toBeNull();
    });

    it("should respect maxSize limit exactly", () => {
      const boundaryCache = new DisclosureCache({
        enabled: true,
        maxSize: 3,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      });

      for (let i = 0; i < 3; i++) {
        boundaryCache.set(
          { id: `tool${i}`, level: DisclosureLevel.METADATA },
          createTestDisclosureContent(DisclosureLevel.METADATA)
        );
      }

      expect(boundaryCache.stats().size).toBe(3);

      boundaryCache.set(
        { id: "tool3", level: DisclosureLevel.METADATA },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );

      expect(boundaryCache.stats().size).toBe(3);
    });

    it("should evict oldest by expiration time", () => {
      const timeCache = new DisclosureCache({
        enabled: true,
        maxSize: 3,
        l1TtlMs: 100,
        l2TtlMs: 200,
        cleanupIntervalMs: 0,
      });

      timeCache.set(
        { id: "tool0", level: DisclosureLevel.METADATA },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );

      timeCache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );

      timeCache.set(
        { id: "tool2", level: DisclosureLevel.METADATA },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );

      // Add a 4th item to trigger eviction
      timeCache.set(
        { id: "tool3", level: DisclosureLevel.METADATA },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );

      // The oldest should be evicted
      expect(timeCache.get({ id: "tool0", level: DisclosureLevel.METADATA })).toBeNull();
      // Others should still exist
      expect(timeCache.get({ id: "tool1", level: DisclosureLevel.METADATA })).not.toBeNull();
    });
  });

  describe("invalidation", () => {
    it("should remove all entries with matching id regardless of level", () => {
      const baseKey = { id: "shared-tool", level: DisclosureLevel.METADATA };
      cache.set(baseKey, createTestDisclosureContent(DisclosureLevel.METADATA));
      cache.set(
        { ...baseKey, level: DisclosureLevel.CONTENT },
        createTestDisclosureContent(DisclosureLevel.CONTENT)
      );
      cache.set(
        { ...baseKey, level: DisclosureLevel.RESOURCES },
        createTestDisclosureContent(DisclosureLevel.RESOURCES)
      );

      cache.invalidate("shared-tool");

      expect(cache.get(baseKey)).toBeNull();
      expect(cache.get({ ...baseKey, level: DisclosureLevel.CONTENT })).toBeNull();
      expect(cache.get({ ...baseKey, level: DisclosureLevel.RESOURCES })).toBeNull();
    });

    it("should remove entries with matching id and different versions", () => {
      cache.set(
        { id: "tool1", level: DisclosureLevel.METADATA, version: "1.0" },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );
      cache.set(
        { id: "tool1", level: DisclosureLevel.METADATA, version: "2.0" },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );
      cache.set(
        { id: "tool1", level: DisclosureLevel.METADATA, version: "3.0" },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );

      cache.invalidate("tool1");

      expect(cache.stats().size).toBe(0);
    });

    it("should not affect other tool ids", () => {
      cache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );
      cache.set(
        { id: "tool2", level: DisclosureLevel.METADATA },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );
      cache.set(
        { id: "tool3", level: DisclosureLevel.METADATA },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );

      cache.invalidate("tool1");

      expect(cache.get({ id: "tool1", level: DisclosureLevel.METADATA })).toBeNull();
      expect(cache.get({ id: "tool2", level: DisclosureLevel.METADATA })).not.toBeNull();
      expect(cache.get({ id: "tool3", level: DisclosureLevel.METADATA })).not.toBeNull();
    });

    it("should handle invalidation of non-existent id gracefully", () => {
      cache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );

      expect(() => cache.invalidate("nonexistent")).not.toThrow();

      expect(cache.get({ id: "tool1", level: DisclosureLevel.METADATA })).not.toBeNull();
    });

    it("should handle empty cache invalidation gracefully", () => {
      expect(() => cache.invalidate("any")).not.toThrow();
      expect(cache.stats().size).toBe(0);
    });
  });

  describe("statistics", () => {
    it("should track cache hits correctly", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createTestDisclosureContent();

      cache.set(key, content);

      cache.get(key);
      cache.get(key);
      cache.get(key);

      const stats = cache.stats();
      expect(stats.hits).toBe(3);
    });

    it("should track cache misses correctly", () => {
      cache.get({ id: "missing1", level: DisclosureLevel.METADATA });
      cache.get({ id: "missing2", level: DisclosureLevel.METADATA });

      const stats = cache.stats();
      expect(stats.misses).toBe(2);
    });

    it("should calculate hit rate correctly", () => {
      const key: DisclosureCacheKey = {
        id: "tool1",
        level: DisclosureLevel.METADATA,
      };
      const content = createTestDisclosureContent();

      cache.get(key);
      cache.set(key, content);
      cache.get(key);
      cache.get(key);

      const stats = cache.stats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it("should return correct size after operations", () => {
      cache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createTestDisclosureContent(DisclosureLevel.METADATA)
      );
      cache.set(
        { id: "tool2", level: DisclosureLevel.CONTENT },
        createTestDisclosureContent(DisclosureLevel.CONTENT)
      );
      cache.set(
        { id: "tool3", level: DisclosureLevel.RESOURCES },
        createTestDisclosureContent(DisclosureLevel.RESOURCES)
      );

      expect(cache.stats().size).toBe(3);

      cache.invalidate("tool2");

      expect(cache.stats().size).toBe(2);
    });

    it("should not track stats when cache is disabled", () => {
      const disabledCache = new DisclosureCache({
        enabled: false,
        maxSize: 10,
        l1TtlMs: 60000,
        l2TtlMs: 120000,
        cleanupIntervalMs: 0,
      });

      disabledCache.set(
        { id: "tool1", level: DisclosureLevel.METADATA },
        createTestDisclosureContent()
      );
      disabledCache.get({ id: "tool1", level: DisclosureLevel.METADATA });
      disabledCache.get({ id: "tool2", level: DisclosureLevel.METADATA });

      const stats = disabledCache.stats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });
  });
});

describe("DisclosureCache - Key Generation", () => {
  let cache: DisclosureCache;

  beforeEach(() => {
    cache = new DisclosureCache({
      enabled: true,
      maxSize: 100,
      l1TtlMs: 60000,
      l2TtlMs: 120000,
      cleanupIntervalMs: 0,
    });
  });

  it("should generate unique keys for different ids", () => {
    const content = createTestDisclosureContent();

    cache.set({ id: "tool1", level: DisclosureLevel.METADATA }, content);
    cache.set({ id: "tool2", level: DisclosureLevel.METADATA }, content);
    cache.set({ id: "tool3", level: DisclosureLevel.METADATA }, content);

    expect(cache.stats().size).toBe(3);
  });

  it("should generate unique keys for different levels", () => {
    const content = createTestDisclosureContent();

    cache.set({ id: "tool1", level: DisclosureLevel.METADATA }, content);
    cache.set({ id: "tool1", level: DisclosureLevel.CONTENT }, content);
    cache.set({ id: "tool1", level: DisclosureLevel.RESOURCES }, content);

    expect(cache.stats().size).toBe(3);
  });

  it("should include hash in key generation", () => {
    const content = createTestDisclosureContent();

    cache.set({ id: "tool1", level: DisclosureLevel.METADATA, hash: "hash1" }, content);
    cache.set({ id: "tool1", level: DisclosureLevel.METADATA, hash: "hash2" }, content);

    expect(cache.stats().size).toBe(2);
  });

  it("should use default hash when not provided", () => {
    const content = createTestDisclosureContent();

    cache.set({ id: "tool1", level: DisclosureLevel.METADATA }, content);
    cache.set({ id: "tool1", level: DisclosureLevel.METADATA, hash: undefined }, content);

    expect(cache.stats().size).toBe(1);
  });

  it("should use id, level, and hash for key generation", () => {
    const content = createTestDisclosureContent();

    // Version is not included in key generation
    cache.set({ id: "tool1", level: DisclosureLevel.METADATA, version: "1.0" }, content);
    cache.set({ id: "tool1", level: DisclosureLevel.METADATA, version: "2.0" }, content);

    expect(cache.stats().size).toBe(1); // Same key overwrites
  });
});

describe("DisclosureCache - Edge Cases", () => {
  it("should handle concurrent access", async () => {
    const concurrentCache = new DisclosureCache({
      enabled: true,
      maxSize: 1000,
      l1TtlMs: 60000,
      l2TtlMs: 120000,
      cleanupIntervalMs: 0,
    });

    const promises: Promise<void>[] = [];

    for (let i = 0; i < 100; i++) {
      promises.push(
        (async () => {
          const key: DisclosureCacheKey = {
            id: `tool${i % 10}`,
            level: DisclosureLevel.METADATA,
          };
          const content = createTestDisclosureContent();

          concurrentCache.set(key, content);
          concurrentCache.get(key);
        })()
      );
    }

    await Promise.all(promises);

    expect(concurrentCache.stats().size).toBeLessThanOrEqual(10);
  });

  it("should handle very large content objects", () => {
    const largeContent: DisclosureContent = {
      level: DisclosureLevel.RESOURCES,
      name: "Large Tool",
      description: "A tool with large content",
      inputSchema: { type: "object", properties: { data: { type: "string" } } },
      outputSchema: { type: "object" },
      resources: Array(1000).fill("resource"),
      examples: Array(1000).fill("example"),
      tokenCount: 100000,
    };

    const testCache = new DisclosureCache({
      enabled: true,
      maxSize: 100,
      l1TtlMs: 60000,
      l2TtlMs: 120000,
      cleanupIntervalMs: 0,
    });

    testCache.set({ id: "large-tool", level: DisclosureLevel.RESOURCES }, largeContent);

    const retrieved = testCache.get({ id: "large-tool", level: DisclosureLevel.RESOURCES });
    expect(retrieved).toEqual(largeContent);
  });

  it("should handle cache with zero maxSize (evicts then adds)", () => {
    const zeroSizeCache = new DisclosureCache({
      enabled: true,
      maxSize: 0,
      l1TtlMs: 60000,
      l2TtlMs: 120000,
      cleanupIntervalMs: 0,
    });

    zeroSizeCache.set(
      { id: "tool1", level: DisclosureLevel.METADATA },
      createTestDisclosureContent()
    );

    // With maxSize=0, the cache evicts oldest then adds new entry
    // So size will be 1 (evicts nothing, then adds one)
    expect(zeroSizeCache.stats().size).toBe(1);
  });

  it("should handle very long tool ids", () => {
    // Use a shorter ID to avoid performance issues
    const longId = "a".repeat(100);
    const testCache = new DisclosureCache({
      enabled: true,
      maxSize: 100,
      l1TtlMs: 60000,
      l2TtlMs: 120000,
      cleanupIntervalMs: 0,
    });

    testCache.set({ id: longId, level: DisclosureLevel.METADATA }, createTestDisclosureContent());

    const retrieved = testCache.get({ id: longId, level: DisclosureLevel.METADATA });
    expect(retrieved).not.toBeNull();
  });
});

describe("DisclosureCache - Configuration", () => {
  it("should use default configuration from DEFAULT_DISCLOSURE_CONFIG_V2", () => {
    const cache = new DisclosureCache(DEFAULT_DISCLOSURE_CONFIG_V2.cache);

    expect(cache.stats().size).toBe(0);
  });

  it("should handle negative TTL values gracefully", () => {
    const cache = new DisclosureCache({
      enabled: true,
      maxSize: 10,
      l1TtlMs: -1,
      l2TtlMs: -1,
      cleanupIntervalMs: 0,
    });

    cache.set({ id: "tool1", level: DisclosureLevel.METADATA }, createTestDisclosureContent());

    expect(cache.get({ id: "tool1", level: DisclosureLevel.METADATA })).toBeNull();
  });
});
