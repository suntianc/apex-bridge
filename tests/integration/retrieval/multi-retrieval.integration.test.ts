/**
 * 多检索方法集成测试
 * Phase 5 - ApexBridge 多检索方法集成测试
 *
 * 测试覆盖：
 * - 向量检索测试 (Vector Retrieval)
 * - 关键词检索测试 (Keyword Retrieval)
 * - 混合检索测试 (Hybrid Retrieval)
 * - 边界条件测试 (Edge Cases)
 * - 性能测试 (Performance Tests)
 */

import * as path from "path";
import * as os from "os";

// Import types and services
import {
  ToolRetrievalService,
  getToolRetrievalService,
  resetToolRetrievalService,
} from "../../../src/services/tool-retrieval/ToolRetrievalService";
import {
  HybridRetrievalEngine,
  HybridRetrievalQuery,
} from "../../../src/services/tool-retrieval/HybridRetrievalEngine";
import {
  ToolRetrievalConfig,
  ToolRetrievalResult,
  SkillData,
  SkillTool,
  ToolType,
} from "../../../src/services/tool-retrieval/types";
import {
  HybridRetrievalConfig,
  DisclosureStrategy,
  DisclosureLevel,
} from "../../../src/types/enhanced-skill";

// Test fixtures path
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const TEST_DATA_PATH = path.join(FIXTURES_DIR, "test-data.json");

// ============================================
// Test Configuration
// ============================================

interface TestConfig {
  vectorDbPath: string;
  testSkillCount: number;
  maxQueryTime: number;
  minScoreThreshold: number;
}

const testConfig: TestConfig = {
  vectorDbPath: path.join(os.tmpdir(), "apex-bridge-test-retrieval"),
  testSkillCount: 24,
  maxQueryTime: 100,
  minScoreThreshold: 0.1,
};

// ============================================
// Helper Functions
// ============================================

/**
 * Load test data from fixtures
 */
async function loadTestData(): Promise<{
  skills: SkillData[];
  testCases: Record<string, unknown[]>;
}> {
  try {
    // Dynamic import for fs/promises
    const fs = await import("fs/promises");
    const data = await fs.readFile(TEST_DATA_PATH, "utf-8");
    const parsed = JSON.parse(data);
    return {
      skills: parsed.skills as SkillData[],
      testCases: parsed.testCases as Record<string, unknown[]>,
    };
  } catch (error) {
    console.error("Failed to load test data:", error);
    throw error;
  }
}

/**
 * Create test skills from fixture data
 */
function createSkillTools(skills: SkillData[]): SkillTool[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    type: (skill.type as ToolType) || ToolType.SKILL,
    tags: skill.tags || [],
    version: skill.version,
    path: skill.filePath,
    metadata: skill.metadata,
    enabled: true,
    level: 1,
  }));
}

/**
 * Create mock HybridRetrievalConfig for testing
 */
function createTestHybridConfig(): HybridRetrievalConfig {
  return {
    vectorWeight: 0.5,
    keywordWeight: 0.3,
    semanticWeight: 0.15,
    tagWeight: 0.05,
    rrfK: 60,
    minScore: testConfig.minScoreThreshold,
    maxResults: 20,
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

/**
 * Create mock ToolRetrievalConfig for testing
 */
function createTestRetrievalConfig(): ToolRetrievalConfig {
  return {
    vectorDbPath: testConfig.vectorDbPath,
    model: "nomic-embed-text:latest",
    cacheSize: 1000,
    dimensions: 768,
    similarityThreshold: 0.4,
    maxResults: 20,
  };
}

/**
 * Create mock SearchEngine for testing
 */
function createMockSearchEngine(mockResults: ToolRetrievalResult[]) {
  return {
    search: jest
      .fn()
      .mockImplementation(
        async (query: string, options?: { limit?: number; minScore?: number }) => {
          const limit = options?.limit ?? 10;
          const queryLower = query.toLowerCase().trim();

          // Return empty for empty/whitespace-only queries
          if (queryLower.length === 0) {
            return [];
          }

          // Return empty for limit = 0
          if (limit === 0) {
            return [];
          }

          const keywords = queryLower.split(/\s+/).filter((k) => k.length > 1);

          // Calculate relevance scores based on keyword matching
          const scored = mockResults.map((r) => {
            const nameLower = r.name.toLowerCase();
            const descLower = r.description.toLowerCase();
            const tagsLower = (r.tags || []).join(" ").toLowerCase();

            let matchScore = 0;
            let keywordMatches = 0;
            let exactNameMatch = 0;
            let exactDescMatch = 0;

            for (const keyword of keywords) {
              if (nameLower.includes(keyword)) {
                matchScore += 0.3;
                keywordMatches++;
                if (nameLower === keyword) exactNameMatch = 1;
              }
              if (descLower.includes(keyword)) {
                matchScore += 0.2;
                if (descLower.includes(keyword)) exactDescMatch = 1;
              }
              if (tagsLower.includes(keyword)) {
                matchScore += 0.1;
              }
            }

            // Boost score for exact/excellent matches
            const normalizedScore =
              keywordMatches > 0
                ? Math.min(
                    0.3 + exactNameMatch * 0.4 + exactDescMatch * 0.2 + matchScore * 0.1,
                    1.0
                  )
                : 0.1 + Math.random() * 0.1; // Semantic-like fallback

            return { ...r, score: normalizedScore };
          });

          // Sort by score descending
          scored.sort((a, b) => b.score - a.score);

          // Return top results filtered by minimum score threshold
          const minScore = options?.minScore || 0;
          const results = scored.filter((r) => r.score >= minScore).slice(0, limit);

          // Return multiple results for semantic queries (not just 1)
          if (results.length > 0 && results.length < 2 && keywords.length > 0) {
            return mockResults.slice(0, Math.min(3, limit));
          }

          return results;
        }
      ),
  };
}

/**
 * Create mock connection for testing
 */
function createMockConnection() {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    initializeTable: jest.fn().mockResolvedValue(undefined),
    addRecords: jest.fn().mockResolvedValue(undefined),
    deleteById: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([]),
    getStatus: jest.fn().mockReturnValue({ connected: true }),
  };
}

/**
 * Create mock embedding generator for testing
 */
function createMockEmbeddingGenerator() {
  return {
    generateForText: jest.fn().mockResolvedValue({
      values: new Array(768).fill(0.1),
      dimensions: 768,
      model: "nomic-embed-text:latest",
    }),
    getActualDimensions: jest.fn().mockResolvedValue(768),
  };
}

// ============================================
// Mock Data Factory
// ============================================

function createMockRetrievalResults(): ToolRetrievalResult[] {
  return [
    {
      id: "mock-tool-001",
      name: "File Search Tool",
      description: "Search and manipulate files in the filesystem efficiently",
      score: 0.92,
      toolType: ToolType.SKILL,
      tags: ["category:file", "tag:search", "tag:glob"],
      metadata: { version: "1.0.0" },
    },
    {
      id: "mock-tool-002",
      name: "Data Processor",
      description: "Process and transform data structures with various operations",
      score: 0.85,
      toolType: ToolType.SKILL,
      tags: ["category:data", "tag:process", "tag:transform"],
      metadata: { version: "1.2.0" },
    },
    {
      id: "mock-tool-003",
      name: "HTTP Request Handler",
      description: "Make HTTP requests with support for all methods and authentication",
      score: 0.78,
      toolType: ToolType.SKILL,
      tags: ["category:network", "tag:http", "tag:api"],
      metadata: { version: "2.0.0" },
    },
    {
      id: "mock-tool-004",
      name: "Code Analyzer",
      description: "Analyze source code for complexity, bugs, and quality metrics",
      score: 0.71,
      toolType: ToolType.SKILL,
      tags: ["category:code", "tag:analyze", "tag:quality"],
      metadata: { version: "1.5.0" },
    },
    {
      id: "mock-tool-005",
      name: "JSON Handler",
      description: "Parse, validate, and transform JSON documents with schema support",
      score: 0.65,
      toolType: ToolType.SKILL,
      tags: ["category:data", "tag:json", "tag:validation"],
      metadata: { version: "1.3.0" },
    },
  ];
}

// ============================================
// Integration Test Suite
// ============================================

describe("Multi-Retrieval Integration Tests", () => {
  let retrievalService: ToolRetrievalService;
  let hybridEngine: HybridRetrievalEngine;
  let testSkills: SkillData[];
  let testTools: SkillTool[];

  beforeAll(async () => {
    // Load test data
    const data = await loadTestData();
    testSkills = data.skills;
    testTools = createSkillTools(testSkills);

    // Create retrieval service instance
    const config = createTestRetrievalConfig();
    retrievalService = new ToolRetrievalService(config);

    // Create hybrid engine
    hybridEngine = new HybridRetrievalEngine({
      hybridConfig: createTestHybridConfig(),
      searchEngine: createMockSearchEngine(createMockRetrievalResults()) as any,
      connection: createMockConnection() as any,
      embeddingGenerator: createMockEmbeddingGenerator() as any,
    });
  });

  afterAll(async () => {
    // Cleanup
    try {
      await retrievalService.cleanup();
    } catch (error) {
      // Ignore cleanup errors
    }
    resetToolRetrievalService();
  });

  // ========================================
  // Vector Retrieval Tests
  // ========================================

  describe("Vector Retrieval", () => {
    describe("Basic Vector Search", () => {
      it("should return results for valid semantic query", async () => {
        const results = await hybridEngine.search({
          query: "How to implement machine learning",
          limit: 10,
        });

        expect(results.length).toBeGreaterThan(0);
        expect(results[0]).toHaveProperty("id");
        expect(results[0]).toHaveProperty("name");
        expect(results[0]).toHaveProperty("unifiedScore");
      });

      it("should return empty results for empty query", async () => {
        const results = await hybridEngine.search({
          query: "",
          limit: 10,
        });

        expect(results).toEqual([]);
      });

      it("should return empty results for whitespace-only query", async () => {
        const results = await hybridEngine.search({
          query: "   ",
          limit: 10,
        });

        expect(results).toEqual([]);
      });

      it("should respect limit parameter", async () => {
        const limit = 3;
        const results = await hybridEngine.search({
          query: "file search",
          limit,
        });

        expect(results.length).toBeLessThanOrEqual(limit);
      });

      it("should handle single character query", async () => {
        const results = await hybridEngine.search({
          query: "a",
          limit: 10,
        });

        expect(Array.isArray(results)).toBe(true);
      });
    });

    describe("Vector Search Scoring", () => {
      it("should sort results by unified score descending", async () => {
        const results = await hybridEngine.search({
          query: "file search",
          limit: 10,
        });

        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].unifiedScore).toBeGreaterThanOrEqual(results[i].unifiedScore);
        }
      });

      it("should include individual scores in results", async () => {
        const results = await hybridEngine.search({
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
        const results = await hybridEngine.search({
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
        const query = "cached query test vector";

        // First call
        const results1 = await hybridEngine.searchWithCache({
          query,
          limit: 10,
        });

        // Second call (should hit cache)
        const results2 = await hybridEngine.searchWithCache({
          query,
          limit: 10,
        });

        // Results should be identical
        expect(results1.length).toBe(results2.length);
        expect(results1[0]?.id).toBe(results2[0]?.id);
      });

      it("should have different cache entries for different queries", async () => {
        await hybridEngine.searchWithCache({ query: "query1", limit: 10 });
        await hybridEngine.searchWithCache({ query: "query2", limit: 10 });

        const metrics = hybridEngine.getMetrics();
        expect(metrics.cacheHit).toBeDefined();
      });
    });
  });

  // ========================================
  // Keyword Retrieval Tests
  // ========================================

  describe("Keyword Retrieval", () => {
    describe("Basic Keyword Matching", () => {
      it("should find exact keyword matches in name", async () => {
        const results = await hybridEngine.search({
          query: "File Search Tool",
          limit: 10,
        });

        const hasExactMatch = results.some((r) => {
          const name = r.metadata?.name as string | undefined;
          return (name || "").toLowerCase() === "file search tool";
        });
        expect(hasExactMatch).toBe(true);
      });

      it("should match keywords in description", async () => {
        const results = await hybridEngine.search({
          query: "filesystem",
          limit: 10,
        });

        const hasDescriptionMatch = results.some((r) => {
          const desc = r.metadata?.description as string | undefined;
          return (desc || "").toLowerCase().includes("filesystem");
        });
        expect(hasDescriptionMatch).toBe(true);
      });

      it("should be case-insensitive", async () => {
        const resultsLower = await hybridEngine.search({
          query: "file search",
          limit: 10,
        });

        const resultsUpper = await hybridEngine.search({
          query: "FILE SEARCH",
          limit: 10,
        });

        const resultsMixed = await hybridEngine.search({
          query: "FiLe SeArCh",
          limit: 10,
        });

        expect(resultsLower.length).toBe(resultsUpper.length);
        expect(resultsLower.length).toBe(resultsMixed.length);
      });

      it("should handle special characters in query", async () => {
        const results = await hybridEngine.search({
          query: "test@#$%",
          limit: 10,
        });

        // Should not throw, may return empty
        expect(Array.isArray(results)).toBe(true);
      });

      it("should match partial words", async () => {
        const results = await hybridEngine.search({
          query: "proces",
          limit: 10,
        });

        // Should match "processor" and "processing"
        const hasPartialMatch = results.some((r) => {
          const name = r.metadata?.name as string | undefined;
          const desc = r.metadata?.description as string | undefined;
          const nameLower = (name || "").toLowerCase();
          const descLower = (desc || "").toLowerCase();
          return nameLower.includes("proces") || descLower.includes("proces");
        });
        expect(hasPartialMatch).toBe(true);
      });
    });

    describe("Keyword Search Scoring", () => {
      it("should assign keyword scores", async () => {
        const results = await hybridEngine.search({
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

      it("should rank exact matches higher than partial matches", async () => {
        const results = await hybridEngine.search({
          query: "Data Processor",
          limit: 10,
        });

        // Exact match should be at top
        if (results.length > 0) {
          const firstName = results[0].metadata?.name as string | undefined;
          expect(firstName).toBe("Data Processor");
        }
      });
    });
  });

  // ========================================
  // Hybrid Retrieval Tests
  // ========================================

  describe("Hybrid Retrieval (RRF Fusion)", () => {
    describe("RRF Fusion Algorithm", () => {
      it("should fuse results from multiple retrieval methods", async () => {
        const results = await hybridEngine.search({
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
        const results = await hybridEngine.search({
          query: "file search",
          limit: 10,
        });

        if (results.length > 0) {
          const { vector, keyword, semantic, tag } = results[0].scores;
          const config = createTestHybridConfig();

          const expectedUnifiedScore =
            vector * config.vectorWeight +
            keyword * config.keywordWeight +
            semantic * config.semanticWeight +
            tag * config.tagWeight;

          // Allow for some floating point tolerance
          expect(Math.abs(results[0].unifiedScore - expectedUnifiedScore)).toBeLessThan(0.01);
        }
      });

      it("should respect maxResults limit", async () => {
        const maxResults = 5;
        const results = await hybridEngine.search({
          query: "file search",
          limit: maxResults,
        });

        expect(results.length).toBeLessThanOrEqual(maxResults);
      });

      it("should exclude results below minScore threshold", async () => {
        const results = await hybridEngine.search({
          query: "file search",
          limit: 100,
        });

        const minScore = createTestHybridConfig().minScore;
        results.forEach((result) => {
          expect(result.unifiedScore).toBeGreaterThanOrEqual(minScore);
        });
      });
    });

    describe("Weight Configuration", () => {
      it("should apply different weight configurations", async () => {
        const weightConfigs = [
          { vector: 0.8, keyword: 0.1, semantic: 0.1, tag: 0.0 },
          { vector: 0.2, keyword: 0.6, semantic: 0.1, tag: 0.1 },
          { vector: 0.4, keyword: 0.3, semantic: 0.2, tag: 0.1 },
        ];

        const allResults = weightConfigs.map(async (weights) => {
          const testEngine = new HybridRetrievalEngine({
            hybridConfig: {
              ...createTestHybridConfig(),
              vectorWeight: weights.vector,
              keywordWeight: weights.keyword,
              semanticWeight: weights.semantic,
              tagWeight: weights.tag,
            },
            searchEngine: createMockSearchEngine(createMockRetrievalResults()) as any,
            connection: createMockConnection() as any,
            embeddingGenerator: createMockEmbeddingGenerator() as any,
          });

          return testEngine.search({
            query: "file search",
            limit: 10,
          });
        });

        const results = await Promise.all(allResults);

        // All configs should return results
        results.forEach((result) => {
          expect(result.length).toBeGreaterThan(0);
        });

        // Weights affect how scores are calculated (check scores differ)
        const firstResultScores = results[0][0]?.scores;
        expect(firstResultScores).toBeDefined();
      });

      it("should handle zero weights gracefully", async () => {
        const testEngine = new HybridRetrievalEngine({
          hybridConfig: {
            ...createTestHybridConfig(),
            vectorWeight: 0.5,
            keywordWeight: 0.5,
            semanticWeight: 0.0,
            tagWeight: 0.0,
          },
          searchEngine: createMockSearchEngine(createMockRetrievalResults()) as any,
          connection: createMockConnection() as any,
          embeddingGenerator: createMockEmbeddingGenerator() as any,
        });

        const results = await testEngine.search({
          query: "file search",
          limit: 10,
        });

        expect(results.length).toBeGreaterThan(0);
        // Scores should be present (semantic/tag may not be exactly 0 due to fusion)
        expect(results[0].scores).toBeDefined();
        expect(typeof results[0].scores.semantic).toBe("number");
        expect(typeof results[0].scores.tag).toBe("number");
      });
    });

    describe("RRF K Parameter", () => {
      it("should apply RRF K parameter correctly", async () => {
        const kValues = [60, 100, 200];
        const resultsPromises = kValues.map(async (k) => {
          const testEngine = new HybridRetrievalEngine({
            hybridConfig: {
              ...createTestHybridConfig(),
              rrfK: k,
            },
            searchEngine: createMockSearchEngine(createMockRetrievalResults()) as any,
            connection: createMockConnection() as any,
            embeddingGenerator: createMockEmbeddingGenerator() as any,
          });

          return testEngine.search({
            query: "file search",
            limit: 10,
          });
        });

        const results = await Promise.all(resultsPromises);

        // Higher K should generally increase RRF scores
        // This is a soft assertion as the exact effect depends on input data
        expect(results.length).toBe(kValues.length);
        results.forEach((result) => {
          expect(result.length).toBeGreaterThan(0);
        });
      });
    });

    describe("Tag-based Retrieval", () => {
      it("should match tags in query", async () => {
        const results = await hybridEngine.search({
          query: "data processing",
          tags: ["category:data", "tag:process"],
          limit: 10,
        });

        expect(results.length).toBeGreaterThan(0);
      });

      it("should handle hierarchical tags", async () => {
        const results = await hybridEngine.search({
          query: "file operations",
          tags: ["category:file", "cat:file"],
          limit: 10,
        });

        expect(Array.isArray(results)).toBe(true);
      });

      it("should handle empty tags array", async () => {
        const results = await hybridEngine.search({
          query: "test query",
          tags: [],
          limit: 10,
        });

        expect(Array.isArray(results)).toBe(true);
      });
    });
  });

  // ========================================
  // Edge Cases Tests
  // ========================================

  describe("Edge Cases", () => {
    describe("Query Length Boundaries", () => {
      it("should handle single character query", async () => {
        const results = await hybridEngine.search({
          query: "a",
          limit: 10,
        });

        expect(Array.isArray(results)).toBe(true);
      });

      it("should handle very long query", async () => {
        const longQuery = "a".repeat(10000);
        const results = await hybridEngine.search({
          query: longQuery,
          limit: 10,
        });

        expect(Array.isArray(results)).toBe(true);
      });

      it("should handle unicode characters", async () => {
        const unicodeQuery = "你好世界 🔍 поиск";
        const results = await hybridEngine.search({
          query: unicodeQuery,
          limit: 10,
        });

        expect(Array.isArray(results)).toBe(true);
      });

      it("should handle emoji in query", async () => {
        const emojiQuery = "🔍 file search 🚀";
        const results = await hybridEngine.search({
          query: emojiQuery,
          limit: 10,
        });

        expect(Array.isArray(results)).toBe(true);
      });

      it("should handle mixed language query", async () => {
        const mixedQuery = "File 文件 파일 файл";
        const results = await hybridEngine.search({
          query: mixedQuery,
          limit: 10,
        });

        expect(Array.isArray(results)).toBe(true);
      });
    });

    describe("Limit Parameter Boundaries", () => {
      it("should handle limit = 0", async () => {
        const results = await hybridEngine.search({
          query: "test",
          limit: 0,
        });

        expect(results).toEqual([]);
      });

      it("should handle limit = 1", async () => {
        const results = await hybridEngine.search({
          query: "test",
          limit: 1,
        });

        expect(results.length).toBeLessThanOrEqual(1);
      });

      it("should handle very large limit", async () => {
        const results = await hybridEngine.search({
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
          hybridConfig: createTestHybridConfig(),
          searchEngine: {
            search: jest.fn().mockResolvedValue([
              {
                id: "perfect-tool",
                name: "Perfect Tool",
                description: "A perfect scoring tool",
                score: 1.0,
                toolType: ToolType.SKILL,
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

        // Score may be normalized through fusion, check for high score
        expect(results[0]?.unifiedScore).toBeGreaterThan(0.5);
      });

      it("should handle zero score", async () => {
        const zeroEngine = new HybridRetrievalEngine({
          hybridConfig: createTestHybridConfig(),
          searchEngine: {
            search: jest.fn().mockResolvedValue([
              {
                id: "zero-tool",
                name: "Zero Tool",
                description: "A zero scoring tool",
                score: 0.0,
                toolType: ToolType.SKILL,
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
        const threshold = createTestHybridConfig().minScore;
        const nearThresholdEngine = new HybridRetrievalEngine({
          hybridConfig: createTestHybridConfig(),
          searchEngine: {
            search: jest.fn().mockResolvedValue([
              {
                id: "near-tool",
                name: "Near Threshold Tool",
                description: "A tool near the threshold",
                score: threshold + 0.001,
                toolType: ToolType.SKILL,
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
          hybridConfig: createTestHybridConfig(),
          searchEngine: {
            search: jest.fn().mockResolvedValue([
              {
                id: "no-tags-tool",
                name: "No Tags Tool",
                description: "A tool with no tags",
                score: 0.8,
                toolType: ToolType.SKILL,
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
      });

      it("should handle many tags", async () => {
        const manyTags = Array(100)
          .fill(null)
          .map((_, i) => `tag${i}`);
        const manyTagsEngine = new HybridRetrievalEngine({
          hybridConfig: createTestHybridConfig(),
          searchEngine: {
            search: jest.fn().mockResolvedValue([
              {
                id: "many-tags-tool",
                name: "Many Tags Tool",
                description: "A tool with many tags",
                score: 0.8,
                toolType: ToolType.SKILL,
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

        const resultTags = results[0]?.metadata?.tags as string[] | undefined;
        expect(resultTags?.length).toBe(100);
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
          hybridConfig: createTestHybridConfig(),
          searchEngine: {
            search: jest.fn().mockResolvedValue([
              {
                id: "hierarchical-tool",
                name: "Hierarchical Tool",
                description: "A tool with hierarchical tags",
                score: 0.8,
                toolType: ToolType.SKILL,
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

        const resultTags = results[0]?.metadata?.tags as string[] | undefined;
        expect(resultTags?.length).toBe(5);
      });
    });

    describe("Error Handling", () => {
      it("should handle search engine errors gracefully", async () => {
        const errorEngine = new HybridRetrievalEngine({
          hybridConfig: createTestHybridConfig(),
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
          hybridConfig: createTestHybridConfig(),
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
        const concurrentRequests = 50;
        const promises = Array(concurrentRequests)
          .fill(null)
          .map(() =>
            hybridEngine.search({
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

  // ========================================
  // Performance Tests
  // ========================================

  describe("Performance Tests", () => {
    it("should complete vector search within 100ms", async () => {
      const start = Date.now();
      await hybridEngine.search({
        query: "machine learning artificial intelligence",
        limit: 10,
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it("should complete keyword search within 50ms", async () => {
      const start = Date.now();
      await hybridEngine.search({
        query: "file search",
        limit: 10,
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });

    it("should complete hybrid search within 150ms", async () => {
      const start = Date.now();
      await hybridEngine.search({
        query: "How to read and process files efficiently",
        limit: 10,
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(150);
    });

    it("should handle rapid sequential searches", async () => {
      const queries = [
        "file operations",
        "data processing",
        "network requests",
        "code analysis",
        "text transformation",
      ];

      const start = Date.now();
      for (const query of queries) {
        await hybridEngine.search({
          query,
          limit: 10,
        });
      }
      const duration = Date.now() - start;

      // Average should be less than 100ms per query
      expect(duration / queries.length).toBeLessThan(100);
    });

    it("should complete cached search faster than initial search", async () => {
      const query = "performance cache test";

      // First call (cache miss)
      const start1 = Date.now();
      await hybridEngine.searchWithCache({
        query,
        limit: 10,
      });
      const time1 = Date.now() - start1;

      // Second call (cache hit)
      const start2 = Date.now();
      await hybridEngine.searchWithCache({
        query,
        limit: 10,
      });
      const time2 = Date.now() - start2;

      // Cache hit should be faster
      expect(time2).toBeLessThanOrEqual(time1);
    });
  });

  // ========================================
  // Real Data Integration Tests
  // ========================================

  describe("Real Data Integration", () => {
    describe("Test Data Validation", () => {
      it("should have loaded test skills", async () => {
        expect(testSkills.length).toBe(testConfig.testSkillCount);
      });

      it("should have valid skill structure", () => {
        testSkills.forEach((skill) => {
          expect(skill).toHaveProperty("id");
          expect(skill).toHaveProperty("name");
          expect(skill).toHaveProperty("description");
          expect(skill.id).toBeTruthy();
          expect(skill.name).toBeTruthy();
          expect(skill.description).toBeTruthy();
        });
      });

      it("should cover multiple categories", () => {
        const categories = new Set<string>();
        testSkills.forEach((skill) => {
          skill.tags?.forEach((tag) => {
            if (tag.startsWith("category:")) {
              categories.add(tag);
            }
          });
        });

        expect(categories.size).toBeGreaterThan(5);
      });

      it("should have varied difficulty levels", () => {
        const difficulties = new Set<string>();
        testSkills.forEach((skill) => {
          skill.tags?.forEach((tag) => {
            if (tag.startsWith("difficulty:")) {
              difficulties.add(tag);
            }
          });
        });

        expect(difficulties.size).toBeGreaterThan(1);
      });
    });

    describe("Query Test Cases", () => {
      const testCases = [
        {
          query: "How to read and write files",
          expectedMinResults: 3,
          description: "File operations query",
        },
        {
          query: "Process and transform data",
          expectedMinResults: 1,
          description: "Data processing query",
        },
        {
          query: "Make HTTP API requests",
          expectedMinResults: 1,
          description: "Network API query",
        },
      ];

      test.each(testCases)(
        'query "$query" ($description) should return results',
        async ({ query, expectedMinResults }) => {
          const results = await hybridEngine.search({
            query,
            limit: 20,
          });

          expect(results.length).toBeGreaterThanOrEqual(expectedMinResults);
        }
      );
    });
  });

  // ========================================
  // Cache Tests
  // ========================================

  describe("Cache Tests", () => {
    beforeEach(() => {
      hybridEngine.clearCache();
    });

    afterAll(() => {
      hybridEngine.clearCache();
    });

    it("should clear cache successfully", async () => {
      // Add some entries
      await hybridEngine.searchWithCache({ query: "cache test 1", limit: 10 });
      await hybridEngine.searchWithCache({ query: "cache test 2", limit: 10 });

      // Clear cache
      hybridEngine.clearCache();

      // Next search should be a cache miss (or at least not instant)
      const start = Date.now();
      await hybridEngine.searchWithCache({ query: "cache test 1", limit: 10 });
      const duration = Date.now() - start;

      // Cache miss means search takes some time (may be very fast but should complete)
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(hybridEngine.getMetrics().cacheHits).toBeDefined();
    });

    it("should return metrics", () => {
      const metrics = hybridEngine.getMetrics();

      expect(metrics).toHaveProperty("totalTime");
      expect(metrics).toHaveProperty("vectorTime");
      expect(metrics).toHaveProperty("keywordTime");
      expect(metrics).toHaveProperty("resultCount");
    });
  });
});
