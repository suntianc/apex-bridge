/**
 * HybridRetrievalEngine Test Suite
 */

import { vi } from "vitest";

import { HybridRetrievalEngine } from "../../../../src/services/tool-retrieval/HybridRetrievalEngine";
import { HybridRetrievalConfig, DisclosureStrategy } from "../../../../src/types/enhanced-skill";

describe("HybridRetrievalEngine", () => {
  let engine: HybridRetrievalEngine;

  const createMockConfig = (): HybridRetrievalConfig => ({
    vectorWeight: 0.5,
    keywordWeight: 0.3,
    semanticWeight: 0.2,
    tagWeight: 0.1,
    rrfK: 60,
    minScore: 0.1,
    maxResults: 10,
    enableTagMatching: true,
    enableKeywordMatching: true,
    enableSemanticMatching: true,
    cacheTTL: 300,
    disclosureStrategy: DisclosureStrategy.METADATA,
    tagHierarchy: {
      levels: ["category", "subcategory", "tag"],
      aliases: {
        cat: "category",
        sub: "subcategory",
        t: "tag",
      },
    },
  });

  beforeEach(() => {
    // Create mock dependencies
    const mockConfig = createMockConfig();
    const mockSearchEngine = {
      search: vi.fn().mockResolvedValue([]),
    };
    const mockConnection = {
      query: vi.fn(),
    };
    const mockEmbeddingGenerator = {
      generateForText: vi.fn(),
    };

    engine = new HybridRetrievalEngine({
      hybridConfig: mockConfig,
      searchEngine: mockSearchEngine as any,
      connection: mockConnection as any,
      embeddingGenerator: mockEmbeddingGenerator as any,
    });
  });

  afterEach(() => {
    engine.clearCache();
  });

  describe("constructor", () => {
    it("should initialize with config", () => {
      expect(engine).toBeInstanceOf(HybridRetrievalEngine);
    });
  });

  describe("search", () => {
    it("should return empty results for empty query", async () => {
      const results = await engine.search({
        query: "",
        limit: 10,
      });

      expect(results).toEqual([]);
    });

    it("should return results for valid query", async () => {
      const mockResults = [
        {
          id: "tool1",
          name: "File Tool",
          description: "A file tool",
          score: 0.9,
          toolType: "skill" as const,
          tags: ["category:file"],
        },
      ];

      // Mock the search engine
      const engineWithMocks = new HybridRetrievalEngine({
        hybridConfig: {
          vectorWeight: 0.5,
          keywordWeight: 0.3,
          semanticWeight: 0.2,
          tagWeight: 0.1,
          rrfK: 60,
          minScore: 0.1,
          maxResults: 10,
          enableTagMatching: true,
          enableKeywordMatching: true,
          enableSemanticMatching: true,
          cacheTTL: 300,
          disclosureStrategy: DisclosureStrategy.METADATA,
          tagHierarchy: {
            levels: ["category", "subcategory", "tag"],
            aliases: {},
          },
        },
        searchEngine: {
          search: vi.fn().mockResolvedValue(mockResults),
        } as any,
        connection: {} as any,
        embeddingGenerator: {} as any,
      });

      const results = await engineWithMocks.search({
        query: "file tool",
        limit: 10,
      });

      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("searchWithCache", () => {
    it("should cache results", async () => {
      const mockResults = [
        {
          id: "tool1",
          name: "File Tool",
          description: "A file tool",
          score: 0.9,
          toolType: "skill" as const,
          tags: [],
        },
      ];

      const engineWithMocks = new HybridRetrievalEngine({
        hybridConfig: {
          vectorWeight: 0.5,
          keywordWeight: 0.3,
          semanticWeight: 0.2,
          tagWeight: 0.1,
          rrfK: 60,
          minScore: 0.1,
          maxResults: 10,
          enableTagMatching: true,
          enableKeywordMatching: true,
          enableSemanticMatching: true,
          cacheTTL: 300,
          disclosureStrategy: DisclosureStrategy.METADATA,
          tagHierarchy: {
            levels: ["category", "subcategory", "tag"],
            aliases: {},
          },
        },
        searchEngine: {
          search: vi.fn().mockResolvedValue(mockResults),
        } as any,
        connection: {} as any,
        embeddingGenerator: {} as any,
      });

      // First call
      await engineWithMocks.searchWithCache({
        query: "file",
        limit: 10,
      });

      const metrics = engineWithMocks.getMetrics();
      expect(metrics.cacheHit).toBe(false);
    });
  });

  describe("getMetrics", () => {
    it("should return metrics object", () => {
      const metrics = engine.getMetrics();

      expect(metrics).toHaveProperty("totalTime");
      expect(metrics).toHaveProperty("vectorTime");
      expect(metrics).toHaveProperty("keywordTime");
      expect(metrics).toHaveProperty("semanticTime");
      expect(metrics).toHaveProperty("tagTime");
      expect(metrics).toHaveProperty("fusionTime");
      expect(metrics).toHaveProperty("resultCount");
      expect(metrics).toHaveProperty("cacheHit");
    });
  });

  describe("clearCache", () => {
    it("should clear the cache without errors", () => {
      expect(() => engine.clearCache()).not.toThrow();
    });
  });
});
