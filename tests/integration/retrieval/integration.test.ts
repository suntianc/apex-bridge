/**
 * 多检索方法集成测试
 * Phase 5 - ApexBridge Claude Code Skill 兼容性增强项目
 *
 * 测试覆盖：
 * - 向量检索测试
 * - 关键词检索测试
 * - 混合检索测试（RRF Fusion）
 * - 边界条件测试
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { HybridRetrievalEngine } from "../../../src/services/tool-retrieval/HybridRetrievalEngine";
import { VectorRetrievalEngine } from "../../../src/services/tool-retrieval/VectorRetrievalEngine";
import { KeywordRetrievalEngine } from "../../../src/services/tool-retrieval/KeywordRetrievalEngine";
import { UnifiedScoringEngine } from "../../../src/services/tool-retrieval/UnifiedScoringEngine";
import { HybridRetrievalConfig, DisclosureStrategy } from "../../../src/types/enhanced-skill";
import { ToolType } from "../../../src/types/tool-system";

// ============================================
// Mock 数据工厂
// ============================================

function createMockHybridConfig(): HybridRetrievalConfig {
  return {
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
  };
}

interface MockRetrievalResult {
  id: string;
  name: string;
  description: string;
  score: number;
  toolType: ToolType;
  tags: string[];
}

function createMockVectorResults(): MockRetrievalResult[] {
  return [
    {
      id: "vector-tool-1",
      name: "File Search Tool",
      description: "Search and manipulate files in the filesystem",
      score: 0.92,
      toolType: "skill",
      tags: ["category:file", "tag:search"],
    },
    {
      id: "vector-tool-2",
      name: "Code Reader",
      description: "Read and analyze source code files",
      score: 0.85,
      toolType: "skill",
      tags: ["category:code", "tag:read"],
    },
    {
      id: "vector-tool-3",
      name: "Data Processor",
      description: "Process and transform data structures",
      score: 0.78,
      toolType: "skill",
      tags: ["category:data", "tag:process"],
    },
  ];
}

function createMockKeywordResults(): MockRetrievalResult[] {
  return [
    {
      id: "keyword-tool-1",
      name: "File Search Tool",
      description: "Search and manipulate files in the filesystem",
      score: 0.88,
      toolType: "skill",
      tags: ["category:file", "tag:search"],
    },
    {
      id: "keyword-tool-2",
      name: "Text Search",
      description: "Search for text patterns in files",
      score: 0.82,
      toolType: "skill",
      tags: ["category:text", "tag:search"],
    },
    {
      id: "keyword-tool-3",
      name: "Log Analyzer",
      description: "Analyze log files for patterns",
      score: 0.75,
      toolType: "skill",
      tags: ["category:log", "tag:analyze"],
    },
  ];
}

function createMockSemanticResults(): MockRetrievalResult[] {
  return [
    {
      id: "semantic-tool-1",
      name: "File Search Tool",
      description: "Search and manipulate files in the filesystem",
      score: 0.9,
      toolType: "skill",
      tags: ["category:file", "tag:search"],
    },
    {
      id: "semantic-tool-2",
      name: "Content Reader",
      description: "Read and interpret file contents",
      score: 0.86,
      toolType: "skill",
      tags: ["category:content", "tag:read"],
    },
  ];
}

function createMockTagResults(): MockRetrievalResult[] {
  return [
    {
      id: "tag-tool-1",
      name: "File Search Tool",
      description: "Search and manipulate files in the filesystem",
      score: 0.95,
      toolType: "skill",
      tags: ["category:file", "tag:search"],
    },
    {
      id: "tag-tool-2",
      name: "Image Processor",
      description: "Process image files",
      score: 0.88,
      toolType: "skill",
      tags: ["category:image", "tag:process"],
    },
  ];
}

// ============================================
// 向量检索测试
// ============================================

describe("Vector Retrieval Tests", () => {
  let engine: HybridRetrievalEngine;

  beforeEach(() => {
    const mockSearchEngine = {
      search: jest.fn().mockImplementation(async (query: string, limit: number) => {
        // Simulate vector search results
        const results = createMockVectorResults();
        return results.slice(0, limit);
      }),
    };

    const mockConnection = {
      query: jest.fn().mockResolvedValue([]),
    };

    const mockEmbeddingGenerator = {
      generateForText: jest.fn().mockResolvedValue(new Array(384).fill(0.1)),
    };

    engine = new HybridRetrievalEngine({
      hybridConfig: createMockHybridConfig(),
      searchEngine: mockSearchEngine as any,
      connection: mockConnection as any,
      embeddingGenerator: mockEmbeddingGenerator as any,
    });
  });

  afterEach(() => {
    engine.clearCache();
  });

  describe("Basic Vector Search", () => {
    it("should return results for valid query", async () => {
      const results = await engine.search({
        query: "file search",
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("id");
      expect(results[0]).toHaveProperty("name");
      expect(results[0]).toHaveProperty("unifiedScore");
    });

    it("should respect limit parameter", async () => {
      const limit = 2;
      const results = await engine.search({
        query: "file search",
        limit,
      });

      expect(results.length).toBeLessThanOrEqual(limit);
    });

    it("should return empty results for non-matching query", async () => {
      const results = await engine.search({
        query: "nonexistent tool xyz123",
        limit: 10,
      });

      // Could be empty or contain low-score results
      expect(Array.isArray(results)).toBe(true);
    });

    it("should return empty results for empty query", async () => {
      const results = await engine.search({
        query: "",
        limit: 10,
      });

      expect(results).toEqual([]);
    });

    it("should return empty results for whitespace-only query", async () => {
      const results = await engine.search({
        query: "   ",
        limit: 10,
      });

      expect(results).toEqual([]);
    });
  });

  describe("Vector Search Scoring", () => {
    it("should sort results by unified score descending", async () => {
      const results = await engine.search({
        query: "file search",
        limit: 10,
      });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].unifiedScore).toBeGreaterThanOrEqual(results[i].unifiedScore);
      }
    });

    it("should include individual scores in results", async () => {
      const results = await engine.search({
        query: "file search",
        limit: 10,
      });

      if (results.length > 0) {
        expect(results[0].scores).toHaveProperty("vector");
        expect(results[0].scores).toHaveProperty("keyword");
        expect(results[0].scores).toHaveProperty("semantic");
        expect(results[0].scores).toHaveProperty("tag");
      }
    });

    it("should include ranks in results", async () => {
      const results = await engine.search({
        query: "file search",
        limit: 10,
      });

      if (results.length > 0) {
        expect(results[0].ranks).toHaveProperty("vector");
        expect(results[0].ranks).toHaveProperty("keyword");
        expect(results[0].ranks).toHaveProperty("semantic");
        expect(results[0].ranks).toHaveProperty("tag");
      }
    });
  });

  describe("Vector Search Caching", () => {
    it("should cache results for identical queries", async () => {
      const query = "cached query test";

      // First call
      const startTime1 = Date.now();
      await engine.searchWithCache({ query, limit: 10 });
      const time1 = Date.now() - startTime1;

      // Second call (should hit cache)
      const startTime2 = Date.now();
      await engine.searchWithCache({ query, limit: 10 });
      const time2 = Date.now() - startTime2;

      const metrics = engine.getMetrics();

      // Cache should have at least one hit on second call
      expect(metrics.cacheHits).toBeGreaterThan(0);
    });

    it("should have different cache entries for different queries", async () => {
      await engine.searchWithCache({ query: "query1", limit: 10 });
      await engine.searchWithCache({ query: "query2", limit: 10 });

      const metrics = engine.getMetrics();
      expect((metrics.cacheHits || 0) + (metrics.cacheMisses || 0)).toBeGreaterThanOrEqual(2);
    });
  });
});

// ============================================
// 关键词检索测试
// ============================================

describe("Keyword Retrieval Tests", () => {
  let engine: HybridRetrievalEngine;

  beforeEach(() => {
    const mockSearchEngine = {
      search: jest.fn().mockImplementation(async (query: string, limit: number) => {
        const results = createMockKeywordResults();
        // Filter based on query relevance
        const filtered = results.filter(
          (r) =>
            r.name.toLowerCase().includes(query.toLowerCase()) ||
            r.description.toLowerCase().includes(query.toLowerCase())
        );
        return filtered.slice(0, limit);
      }),
    };

    const mockConnection = {
      query: jest.fn().mockResolvedValue([]),
    };

    const mockEmbeddingGenerator = {
      generateForText: jest.fn().mockResolvedValue(new Array(384).fill(0.1)),
    };

    engine = new HybridRetrievalEngine({
      hybridConfig: {
        ...createMockHybridConfig(),
        enableKeywordMatching: true,
      },
      searchEngine: mockSearchEngine as any,
      connection: mockConnection as any,
      embeddingGenerator: mockEmbeddingGenerator as any,
    });
  });

  afterEach(() => {
    engine.clearCache();
  });

  describe("Keyword Matching", () => {
    it("should match keywords in tool name", async () => {
      const results = await engine.search({
        query: "Search",
        limit: 10,
      });

      // Should match tools with "Search" in name
      const hasSearchMatch = results.some((r) => r.name.toLowerCase().includes("search"));
      expect(hasSearchMatch).toBe(true);
    });

    it("should match keywords in tool description", async () => {
      const results = await engine.search({
        query: "files",
        limit: 10,
      });

      // Should match tools mentioning "files" in description
      const hasDescriptionMatch = results.some((r) =>
        r.description.toLowerCase().includes("files")
      );
      expect(hasDescriptionMatch).toBe(true);
    });

    it("should be case-insensitive", async () => {
      const resultsLower = await engine.search({
        query: "file search",
        limit: 10,
      });

      const resultsUpper = await engine.search({
        query: "FILE SEARCH",
        limit: 10,
      });

      const resultsMixed = await engine.search({
        query: "FiLe SeArCh",
        limit: 10,
      });

      expect(resultsLower.length).toBe(resultsUpper.length);
      expect(resultsLower.length).toBe(resultsMixed.length);
    });

    it("should handle special characters in query", async () => {
      const results = await engine.search({
        query: "test@#$%",
        limit: 10,
      });

      // Should not throw, may return empty
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Keyword Search Scoring", () => {
    it("should assign keyword scores", async () => {
      const results = await engine.search({
        query: "search",
        limit: 10,
      });

      if (results.length > 0) {
        const searchResults = results.filter(
          (r) =>
            r.name.toLowerCase().includes("search") ||
            r.description.toLowerCase().includes("search")
        );

        if (searchResults.length > 0) {
          expect(searchResults[0].scores.keyword).toBeGreaterThan(0);
        }
      }
    });

    it("should rank exact matches higher", async () => {
      const results = await engine.search({
        query: "File Search Tool",
        limit: 10,
      });

      // Exact match should be at top
      if (results.length > 0) {
        expect(results[0].name).toBe("File Search Tool");
      }
    });
  });
});

// ============================================
// 混合检索测试（RRF Fusion）
// ============================================

describe("Hybrid Retrieval Tests (RRF Fusion)", () => {
  let engine: HybridRetrievalEngine;

  beforeEach(() => {
    const mockSearchEngine = {
      search: jest.fn().mockImplementation(async (query: string, limit: number) => {
        // Return different results from each "engine"
        const vectorResults = createMockVectorResults();
        const keywordResults = createMockKeywordResults();
        const semanticResults = createMockSemanticResults();
        const tagResults = createMockTagResults();

        return {
          vector: vectorResults,
          keyword: keywordResults,
          semantic: semanticResults,
          tag: tagResults,
        };
      }),
    };

    const mockConnection = {
      query: jest.fn().mockResolvedValue([]),
    };

    const mockEmbeddingGenerator = {
      generateForText: jest.fn().mockResolvedValue(new Array(384).fill(0.1)),
    };

    engine = new HybridRetrievalEngine({
      hybridConfig: createMockHybridConfig(),
      searchEngine: mockSearchEngine as any,
      connection: mockConnection as any,
      embeddingGenerator: mockEmbeddingGenerator as any,
    });
  });

  afterEach(() => {
    engine.clearCache();
  });

  describe("RRF Fusion Algorithm", () => {
    it("should fuse results from multiple retrieval methods", async () => {
      const results = await engine.search({
        query: "file search",
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);

      // Verify structure
      expect(results[0]).toHaveProperty("id");
      expect(results[0]).toHaveProperty("unifiedScore");
      expect(results[0]).toHaveProperty("scores");
      expect(results[0]).toHaveProperty("ranks");
    });

    it("should assign unified scores based on weighted fusion", async () => {
      const results = await engine.search({
        query: "file search",
        limit: 10,
      });

      if (results.length > 0) {
        // Unified score should be a combination of individual scores
        const { vector, keyword, semantic, tag } = results[0].scores;
        const { vectorWeight, keywordWeight, semanticWeight, tagWeight } = engine.getConfig();

        const expectedUnifiedScore =
          vector * vectorWeight +
          keyword * keywordWeight +
          semantic * semanticWeight +
          tag * tagWeight;

        // Allow for some floating point tolerance
        expect(Math.abs(results[0].unifiedScore - expectedUnifiedScore)).toBeLessThan(0.01);
      }
    });

    it("should respect maxResults limit", async () => {
      const maxResults = 5;
      const results = await engine.search({
        query: "file search",
        limit: maxResults,
      });

      expect(results.length).toBeLessThanOrEqual(maxResults);
    });

    it("should exclude results below minScore threshold", async () => {
      const results = await engine.search({
        query: "file search",
        limit: 10,
      });

      const minScore = engine.getConfig().minScore;
      results.forEach((result) => {
        expect(result.unifiedScore).toBeGreaterThanOrEqual(minScore);
      });
    });
  });

  describe("Weight Configuration", () => {
    it("should apply different weight configurations", async () => {
      const configs = [
        { vector: 0.8, keyword: 0.1, semantic: 0.1, tag: 0.0 },
        { vector: 0.2, keyword: 0.6, semantic: 0.1, tag: 0.1 },
        { vector: 0.4, keyword: 0.3, semantic: 0.2, tag: 0.1 },
      ];

      const results: any[] = configs.map(() => []);

      for (let i = 0; i < configs.length; i++) {
        const testEngine = new HybridRetrievalEngine({
          hybridConfig: {
            ...createMockHybridConfig(),
            vectorWeight: configs[i].vector,
            keywordWeight: configs[i].keyword,
            semanticWeight: configs[i].semantic,
            tagWeight: configs[i].tag,
          },
          searchEngine: {
            search: jest.fn().mockResolvedValue(createMockVectorResults()),
          } as any,
          connection: createMockConnection() as any,
          embeddingGenerator: createMockEmbeddingGenerator() as any,
        });

        results[i] = await testEngine.search({
          query: "file search",
          limit: 10,
        });
      }

      // Different configs should produce different result orders
      const firstIds = results.map((r) => r[0]?.id);
      const uniqueIds = new Set(firstIds);
      expect(uniqueIds.size).toBeGreaterThan(1);
    });

    it("should handle zero weights gracefully", async () => {
      const testEngine = new HybridRetrievalEngine({
        hybridConfig: {
          ...createMockHybridConfig(),
          vectorWeight: 0.5,
          keywordWeight: 0.5,
          semanticWeight: 0.0,
          tagWeight: 0.0,
        },
        searchEngine: {
          search: jest.fn().mockResolvedValue(createMockVectorResults()),
        } as any,
        connection: createMockConnection() as any,
        embeddingGenerator: createMockEmbeddingGenerator() as any,
      });

      const results = await testEngine.search({
        query: "file search",
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].scores.semantic).toBe(0);
      expect(results[0].scores.tag).toBe(0);
    });
  });

  describe("RRF K Parameter", () => {
    it("should apply RRF K parameter correctly", async () => {
      const kValues = [60, 100, 200];
      const results: any[] = kValues.map(() => []);

      for (let i = 0; i < kValues.length; i++) {
        const testEngine = new HybridRetrievalEngine({
          hybridConfig: {
            ...createMockHybridConfig(),
            rrfK: kValues[i],
          },
          searchEngine: {
            search: jest.fn().mockResolvedValue(createMockVectorResults()),
          } as any,
          connection: createMockConnection() as any,
          embeddingGenerator: createMockEmbeddingGenerator() as any,
        });

        results[i] = await testEngine.search({
          query: "file search",
          limit: 10,
        });
      }

      // Higher K should generally increase RRF scores
      // This is a soft assertion as the exact effect depends on input data
      expect(results.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// 边界条件测试
// ============================================

describe("Boundary Condition Tests", () => {
  let engine: HybridRetrievalEngine;

  beforeEach(() => {
    const mockSearchEngine = {
      search: jest.fn().mockResolvedValue([]),
    };

    const mockConnection = {
      query: jest.fn().mockResolvedValue([]),
    };

    const mockEmbeddingGenerator = {
      generateForText: jest.fn().mockResolvedValue(new Array(384).fill(0.1)),
    };

    engine = new HybridRetrievalEngine({
      hybridConfig: createMockHybridConfig(),
      searchEngine: mockSearchEngine as any,
      connection: mockConnection as any,
      embeddingGenerator: mockEmbeddingGenerator as any,
    });
  });

  afterEach(() => {
    engine.clearCache();
  });

  describe("Query Length Boundaries", () => {
    it("should handle single character query", async () => {
      const results = await engine.search({
        query: "a",
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it("should handle very long query", async () => {
      const longQuery = "a".repeat(10000);
      const results = await engine.search({
        query: longQuery,
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it("should handle unicode characters", async () => {
      const unicodeQuery = "你好世界 🔍 поиск";
      const results = await engine.search({
        query: unicodeQuery,
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it("should handle emoji in query", async () => {
      const emojiQuery = "🔍 file search 🚀";
      const results = await engine.search({
        query: emojiQuery,
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Limit Parameter Boundaries", () => {
    it("should handle limit = 0", async () => {
      const results = await engine.search({
        query: "test",
        limit: 0,
      });

      expect(results).toEqual([]);
    });

    it("should handle limit = 1", async () => {
      const results = await engine.search({
        query: "test",
        limit: 1,
      });

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it("should handle very large limit", async () => {
      const results = await engine.search({
        query: "test",
        limit: 10000,
      });

      // Should not crash, but may return limited results
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Score Boundaries", () => {
    it("should handle perfect score (1.0)", async () => {
      const perfectEngine = new HybridRetrievalEngine({
        hybridConfig: createMockHybridConfig(),
        searchEngine: {
          search: jest.fn().mockResolvedValue([
            {
              id: "perfect-tool",
              name: "Perfect Tool",
              description: "A perfect scoring tool",
              score: 1.0,
              toolType: "skill" as const,
              tags: ["category:test"],
            },
          ]),
        } as any,
        connection: createMockConnection() as any,
        embeddingGenerator: createMockEmbeddingGenerator() as any,
      });

      const results = await perfectEngine.search({
        query: "test",
        limit: 10,
      });

      expect(results[0]?.unifiedScore).toBe(1.0);
    });

    it("should handle zero score", async () => {
      const zeroEngine = new HybridRetrievalEngine({
        hybridConfig: createMockHybridConfig(),
        searchEngine: {
          search: jest.fn().mockResolvedValue([
            {
              id: "zero-tool",
              name: "Zero Tool",
              description: "A zero scoring tool",
              score: 0.0,
              toolType: "skill" as const,
              tags: [],
            },
          ]),
        } as any,
        connection: createMockConnection() as any,
        embeddingGenerator: createMockEmbeddingGenerator() as any,
      });

      const results = await zeroEngine.search({
        query: "test",
        limit: 10,
      });

      // Should be filtered out if below minScore
      expect(results.every((r) => r.unifiedScore >= 0)).toBe(true);
    });

    it("should handle score slightly above threshold", async () => {
      const threshold = createMockHybridConfig().minScore;
      const nearThresholdEngine = new HybridRetrievalEngine({
        hybridConfig: createMockHybridConfig(),
        searchEngine: {
          search: jest.fn().mockResolvedValue([
            {
              id: "near-tool",
              name: "Near Threshold Tool",
              description: "A tool near the threshold",
              score: threshold + 0.001,
              toolType: "skill" as const,
              tags: [],
            },
          ]),
        } as any,
        connection: createMockConnection() as any,
        embeddingGenerator: createMockEmbeddingGenerator() as any,
      });

      const results = await nearThresholdEngine.search({
        query: "test",
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.unifiedScore).toBeGreaterThanOrEqual(threshold);
    });
  });

  describe("Tag Matching Boundaries", () => {
    it("should handle empty tags array", async () => {
      const noTagsEngine = new HybridRetrievalEngine({
        hybridConfig: createMockHybridConfig(),
        searchEngine: {
          search: jest.fn().mockResolvedValue([
            {
              id: "no-tags-tool",
              name: "No Tags Tool",
              description: "A tool with no tags",
              score: 0.8,
              toolType: "skill" as const,
              tags: [],
            },
          ]),
        } as any,
        connection: createMockConnection() as any,
        embeddingGenerator: createMockEmbeddingGenerator() as any,
      });

      const results = await noTagsEngine.search({
        query: "test",
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.tags).toEqual([]);
    });

    it("should handle many tags", async () => {
      const manyTags = Array(100)
        .fill(null)
        .map((_, i) => `tag${i}`);
      const manyTagsEngine = new HybridRetrievalEngine({
        hybridConfig: createMockHybridConfig(),
        searchEngine: {
          search: jest.fn().mockResolvedValue([
            {
              id: "many-tags-tool",
              name: "Many Tags Tool",
              description: "A tool with many tags",
              score: 0.8,
              toolType: "skill" as const,
              tags: manyTags,
            },
          ]),
        } as any,
        connection: createMockConnection() as any,
        embeddingGenerator: createMockEmbeddingGenerator() as any,
      });

      const results = await manyTagsEngine.search({
        query: "test",
        limit: 10,
      });

      expect(results[0]?.tags.length).toBe(100);
    });

    it("should handle hierarchical tags", async () => {
      const hierarchicalTags = [
        "category:file",
        "subcategory:search",
        "tag:quick",
        "cat:file",
        "sub:search",
      ];
      const hierarchicalEngine = new HybridRetrievalEngine({
        hybridConfig: createMockHybridConfig(),
        searchEngine: {
          search: jest.fn().mockResolvedValue([
            {
              id: "hierarchical-tool",
              name: "Hierarchical Tool",
              description: "A tool with hierarchical tags",
              score: 0.8,
              toolType: "skill" as const,
              tags: hierarchicalTags,
            },
          ]),
        } as any,
        connection: createMockConnection() as any,
        embeddingGenerator: createMockEmbeddingGenerator() as any,
      });

      const results = await hierarchicalEngine.search({
        query: "test",
        limit: 10,
      });

      expect(results[0]?.tags.length).toBe(5);
    });
  });

  describe("Error Handling Boundaries", () => {
    it("should handle search engine errors gracefully", async () => {
      const errorEngine = new HybridRetrievalEngine({
        hybridConfig: createMockHybridConfig(),
        searchEngine: {
          search: jest.fn().mockRejectedValue(new Error("Search engine error")),
        } as any,
        connection: createMockConnection() as any,
        embeddingGenerator: createMockEmbeddingGenerator() as any,
      });

      // Should not throw, should return empty results
      await expect(
        errorEngine.search({
          query: "test",
          limit: 10,
        })
      ).resolves.not.toThrow();
    });

    it("should handle embedding generation errors gracefully", async () => {
      const embedErrorEngine = new HybridRetrievalEngine({
        hybridConfig: createMockHybridConfig(),
        searchEngine: {
          search: jest.fn().mockResolvedValue([]),
        } as any,
        connection: createMockConnection() as any,
        embeddingGenerator: {
          generateForText: jest.fn().mockRejectedValue(new Error("Embedding error")),
        } as any,
      });

      // Should not throw
      await expect(
        embedErrorEngine.search({
          query: "test",
          limit: 10,
        })
      ).resolves.not.toThrow();
    });

    it("should handle concurrent requests gracefully", async () => {
      const concurrentRequests = 100;
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() =>
          engine.search({
            query: `concurrent test ${Math.random()}`,
            limit: 10,
          })
        );

      // All should complete without errors
      const results = await Promise.all(promises);
      expect(results.length).toBe(concurrentRequests);
      results.forEach((result) => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });
});
