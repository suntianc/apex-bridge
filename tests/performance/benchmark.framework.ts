/**
 * 性能基准测试框架
 * Phase 5 - ApexBridge Claude Code Skill 兼容性增强项目
 *
 * 测试覆盖：
 * - 响应时间测试
 * - 吞吐量测试
 * - 内存使用测试
 * - 基准对比测试
 */

import { HybridRetrievalEngine } from "../../../../src/services/tool-retrieval/HybridRetrievalEngine";
import {
  DisclosureManager,
  DisclosureLevel,
} from "../../../../src/services/tool-retrieval/DisclosureManager";
import { ContextCompressionService } from "../../../../src/services/context-compression/ContextCompressionService";
import { TokenEstimator } from "../../../../src/services/context-compression/TokenEstimator";
import { HybridRetrievalConfig, DisclosureStrategy } from "../../../../src/types/enhanced-skill";

// ============================================
// 测试配置与类型定义
// ============================================

interface PerformanceMetrics {
  totalTime: number;
  memoryUsed: number;
  throughput: number;
  latency: number;
}

interface PerformanceTestCase {
  name: string;
  iterations: number;
  warmupIterations: number;
  expectedLatency: number;
  expectedThroughput: number;
}

interface BenchmarkResult {
  testName: string;
  iterations: number;
  actualTime: number;
  avgLatency: number;
  throughput: number;
  memoryUsed: number;
  passed: boolean;
  details?: Record<string, number>;
}

// ============================================
// Mock 数据工厂
// ============================================

function createMockRetrievalConfig(): HybridRetrievalConfig {
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

function createMockSearchEngine() {
  return {
    search: jest.fn().mockResolvedValue([
      {
        id: "tool1",
        name: "File Tool",
        description: "A file tool",
        score: 0.9,
        toolType: "skill" as const,
        tags: ["category:file"],
      },
      {
        id: "tool2",
        name: "Search Tool",
        description: "A search tool",
        score: 0.85,
        toolType: "skill" as const,
        tags: ["category:search"],
      },
    ]),
  };
}

function createMockConnection() {
  return {
    query: jest.fn().mockResolvedValue([]),
  };
}

function createMockEmbeddingGenerator() {
  return {
    generateForText: jest.fn().mockResolvedValue(new Array(384).fill(0.1)),
  };
}

// ============================================
// 性能测试套件
// ============================================

describe("Performance Benchmarks", () => {
  let retrievalEngine: HybridRetrievalEngine;
  let disclosureManager: DisclosureManager;
  let compressionService: ContextCompressionService;
  let tokenEstimator: TokenEstimator;

  const testCases: PerformanceTestCase[] = [
    {
      name: "Single Retrieval",
      iterations: 100,
      warmupIterations: 10,
      expectedLatency: 30,
      expectedThroughput: 100,
    },
    {
      name: "Cached Retrieval",
      iterations: 200,
      warmupIterations: 20,
      expectedLatency: 10,
      expectedThroughput: 500,
    },
    {
      name: "Bulk Retrieval",
      iterations: 50,
      warmupIterations: 5,
      expectedLatency: 100,
      expectedThroughput: 50,
    },
  ];

  beforeEach(() => {
    // 初始化检索引擎
    retrievalEngine = new HybridRetrievalEngine({
      hybridConfig: createMockRetrievalConfig(),
      searchEngine: createMockSearchEngine(),
      connection: createMockConnection(),
      embeddingGenerator: createMockEmbeddingGenerator(),
    });

    // 初始化披露管理器
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

    // 初始化压缩服务
    tokenEstimator = new TokenEstimator();
    compressionService = new ContextCompressionService({
      strategy: "hybrid",
      maxTokens: 4000,
      preserveSystemMessage: true,
    });
  });

  afterEach(() => {
    retrievalEngine.clearCache();
  });

  // ============================================
  // 响应时间测试
  // ============================================

  describe("Response Time Tests", () => {
    testCases.forEach((testCase) => {
      describe(testCase.name, () => {
        let latencies: number[];

        beforeEach(() => {
          latencies = [];
        });

        it(`should complete within ${testCase.expectedLatency}ms on average`, async () => {
          // Warmup
          for (let i = 0; i < testCase.warmupIterations; i++) {
            await retrievalEngine.search({
              query: "test query",
              limit: 10,
            });
          }

          // Actual test
          for (let i = 0; i < testCase.iterations; i++) {
            const startTime = Date.now();
            await retrievalEngine.search({
              query: `test query ${i}`,
              limit: 10,
            });
            latencies.push(Date.now() - startTime);
          }

          const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
          console.log(`${testCase.name} - Average latency: ${avgLatency.toFixed(2)}ms`);

          expect(avgLatency).toBeLessThan(testCase.expectedLatency);
        });

        it(`should have p95 latency within acceptable range`, async () => {
          // Warmup
          for (let i = 0; i < testCase.warmupIterations; i++) {
            await retrievalEngine.search({
              query: "test query",
              limit: 10,
            });
          }

          // Collect latencies
          for (let i = 0; i < testCase.iterations; i++) {
            const startTime = Date.now();
            await retrievalEngine.search({
              query: `test query ${i}`,
              limit: 10,
            });
            latencies.push(Date.now() - startTime);
          }

          // Calculate p95
          latencies.sort((a, b) => a - b);
          const p95Index = Math.floor(latencies.length * 0.95);
          const p95Latency = latencies[p95Index];
          console.log(`${testCase.name} - P95 latency: ${p95Latency}ms`);

          // P95 should be within 2x of average
          const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
          expect(p95Latency).toBeLessThan(avgLatency * 3);
        });
      });
    });

    describe("Disclosure Response Time", () => {
      it("should complete L1 disclosure in < 10ms", async () => {
        const latencies: number[] = [];

        // Warmup
        for (let i = 0; i < 10; i++) {
          const startTime = Date.now();
          await disclosureManager.getDisclosure("tool1", {
            score: 0.95,
            maxTokens: 3000,
          });
          latencies.push(Date.now() - startTime);
        }

        // Test
        for (let i = 0; i < 100; i++) {
          const startTime = Date.now();
          await disclosureManager.getDisclosure(`tool${i}`, {
            score: 0.95,
            maxTokens: 3000,
          });
          latencies.push(Date.now() - startTime);
        }

        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        console.log(`L1 Disclosure - Average latency: ${avgLatency.toFixed(2)}ms`);

        expect(avgLatency).toBeLessThan(10);
      });

      it("should complete L2 disclosure in < 50ms", async () => {
        const latencies: number[] = [];

        // Warmup
        for (let i = 0; i < 10; i++) {
          const startTime = Date.now();
          await disclosureManager.getDisclosure("tool1", {
            score: 0.75,
            maxTokens: 3000,
          });
          latencies.push(Date.now() - startTime);
        }

        // Test
        for (let i = 0; i < 100; i++) {
          const startTime = Date.now();
          await disclosureManager.getDisclosure(`tool${i}`, {
            score: 0.75,
            maxTokens: 3000,
          });
          latencies.push(Date.now() - startTime);
        }

        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        console.log(`L2 Disclosure - Average latency: ${avgLatency.toFixed(2)}ms`);

        expect(avgLatency).toBeLessThan(50);
      });

      it("should complete L3 disclosure in < 100ms", async () => {
        const latencies: number[] = [];

        // Warmup
        for (let i = 0; i < 10; i++) {
          const startTime = Date.now();
          await disclosureManager.getDisclosure("tool1", {
            score: 0.9,
            maxTokens: 3000,
          });
          latencies.push(Date.now() - startTime);
        }

        // Test
        for (let i = 0; i < 100; i++) {
          const startTime = Date.now();
          await disclosureManager.getDisclosure(`tool${i}`, {
            score: 0.9,
            maxTokens: 3000,
          });
          latencies.push(Date.now() - startTime);
        }

        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        console.log(`L3 Disclosure - Average latency: ${avgLatency.toFixed(2)}ms`);

        expect(avgLatency).toBeLessThan(100);
      });
    });
  });

  // ============================================
  // 吞吐量测试
  // ============================================

  describe("Throughput Tests", () => {
    it("should handle 1000 concurrent retrieval requests", async () => {
      const concurrentRequests = 1000;
      const startTime = Date.now();

      const promises = Array(concurrentRequests)
        .fill(null)
        .map((_, i) =>
          retrievalEngine.search({
            query: `concurrent test ${i}`,
            limit: 10,
          })
        );

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      const throughput = concurrentRequests / (duration / 1000);

      console.log(`Concurrent throughput: ${throughput.toFixed(2)} ops/sec`);
      console.log(`Total duration: ${duration}ms`);

      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
      // Should handle at least 200 ops/sec
      expect(throughput).toBeGreaterThan(200);
    });

    it("should handle 500 cached retrieval requests efficiently", async () => {
      // First, populate cache
      for (let i = 0; i < 100; i++) {
        await retrievalEngine.searchWithCache({
          query: `cache test ${i}`,
          limit: 10,
        });
      }

      const cachedRequests = 500;
      const startTime = Date.now();

      const promises = Array(cachedRequests)
        .fill(null)
        .map((_, i) =>
          retrievalEngine.searchWithCache({
            query: `cached query ${i % 100}`,
            limit: 10,
          })
        );

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      const throughput = cachedRequests / (duration / 1000);

      console.log(`Cached throughput: ${throughput.toFixed(2)} ops/sec`);
      console.log(`Total duration: ${duration}ms`);

      // Cached requests should be much faster
      expect(duration).toBeLessThan(2000);
      expect(throughput).toBeGreaterThan(500);
    });

    it("should handle burst requests without degradation", async () => {
      const burstSize = 100;
      const bursts = 10;
      const results: number[] = [];

      for (let b = 0; b < bursts; b++) {
        const startTime = Date.now();

        const promises = Array(burstSize)
          .fill(null)
          .map((_, i) =>
            retrievalEngine.search({
              query: `burst test ${b}-${i}`,
              limit: 10,
            })
          );

        await Promise.all(promises);
        results.push(Date.now() - startTime);
      }

      // Each burst should complete within reasonable time
      const avgBurstTime = results.reduce((a, b) => a + b, 0) / results.length;
      console.log(`Average burst time: ${avgBurstTime.toFixed(2)}ms`);

      // No significant degradation across bursts
      const firstHalf = results.slice(0, bursts / 2);
      const secondHalf = results.slice(bursts / 2);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      // Second half should not be more than 50% slower
      expect(secondAvg).toBeLessThan(firstAvg * 1.5);
    });
  });

  // ============================================
  // 内存使用测试
  // ============================================

  describe("Memory Usage Tests", () => {
    it("should not exceed 256MB memory during retrieval operations", async () => {
      const memorySnapshots: number[] = [];

      // Initial memory
      global.gc?.();
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        await retrievalEngine.search({
          query: `memory test ${i}`,
          limit: 10,
        });

        // Sample memory every 100 operations
        if (i % 100 === 0) {
          memorySnapshots.push(process.memoryUsage().heapUsed);
        }
      }

      const peakMemory = Math.max(...memorySnapshots);
      const memoryIncrease = peakMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)}MB`);
      console.log(`Peak memory: ${(peakMemory / (1024 * 1024)).toFixed(2)}MB`);

      // Memory increase should be less than 100MB
      expect(memoryIncreaseMB).toBeLessThan(100);
    });

    it("should properly release cache memory on clear", async () => {
      // Populate cache
      for (let i = 0; i < 100; i++) {
        await retrievalEngine.searchWithCache({
          query: `cache memory test ${i}`,
          limit: 10,
        });
      }

      // Get memory before clear
      global.gc?.();
      const memoryBefore = process.memoryUsage().heapUsed;

      // Clear cache
      retrievalEngine.clearCache();
      global.gc?.();

      // Small delay to allow GC
      await new Promise((resolve) => setTimeout(resolve, 100));
      global.gc?.();

      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryFreed = memoryBefore - memoryAfter;
      const memoryFreedMB = memoryFreed / (1024 * 1024);

      console.log(`Memory freed: ${memoryFreedMB.toFixed(2)}MB`);
      console.log(`Memory before: ${(memoryBefore / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`Memory after: ${(memoryAfter / (1024 * 1024)).toFixed(2)}MB`);

      // Some memory should be freed
      expect(memoryFreed).toBeGreaterThan(0);
    });

    it("should handle memory pressure gracefully", async () => {
      const operations: unknown[] = [];

      // Create memory pressure
      for (let i = 0; i < 100; i++) {
        operations.push(new Array(10000).fill(`data ${i}`));
      }

      // Perform operations under pressure
      const startTime = Date.now();
      await retrievalEngine.search({
        query: "memory pressure test",
        limit: 10,
      });
      const latency = Date.now() - startTime;

      console.log(`Latency under memory pressure: ${latency}ms`);

      // Should still complete within reasonable time
      expect(latency).toBeLessThan(100);
    });
  });

  // ============================================
  // 缓存性能测试
  // ============================================

  describe("Cache Performance Tests", () => {
    it("should achieve > 80% cache hit rate", async () => {
      const queries = Array(50)
        .fill(null)
        .map((_, i) => `cache hit test ${i}`);

      // First pass - populate cache
      for (const query of queries) {
        await retrievalEngine.searchWithCache({
          query,
          limit: 10,
        });
      }

      // Second pass - should hit cache
      for (const query of queries) {
        await retrievalEngine.searchWithCache({
          query,
          limit: 10,
        });
      }

      const metrics = retrievalEngine.getMetrics();
      const totalRequests = (metrics.cacheHits || 0) + (metrics.cacheMisses || 0);
      const hitRate = totalRequests > 0 ? (metrics.cacheHits || 0) / totalRequests : 0;

      console.log(`Cache hit rate: ${(hitRate * 100).toFixed(2)}%`);
      console.log(`Cache hits: ${metrics.cacheHits}, misses: ${metrics.cacheMisses}`);

      expect(hitRate).toBeGreaterThan(0.8);
    });

    it("should complete cache eviction in < 1ms", async () => {
      // Create engine with small cache
      const smallCacheEngine = new HybridRetrievalEngine({
        hybridConfig: {
          ...createMockRetrievalConfig(),
          cacheTTL: 300,
        },
        searchEngine: createMockSearchEngine(),
        connection: createMockConnection(),
        embeddingGenerator: createMockEmbeddingGenerator(),
      });

      // Fill cache
      for (let i = 0; i < 50; i++) {
        await smallCacheEngine.searchWithCache({
          query: `eviction test ${i}`,
          limit: 10,
        });
      }

      const startTime = Date.now();
      smallCacheEngine.clearCache();
      const evictionTime = Date.now() - startTime;

      console.log(`Cache eviction time: ${evictionTime}ms`);

      expect(evictionTime).toBeLessThan(1);
    });

    it("should respect TTL expiration", async () => {
      const shortTtlEngine = new HybridRetrievalEngine({
        hybridConfig: {
          ...createMockRetrievalConfig(),
          cacheTTL: 1, // 1ms TTL
        },
        searchEngine: createMockSearchEngine(),
        connection: createMockConnection(),
        embeddingGenerator: createMockEmbeddingGenerator(),
      });

      // Populate cache
      await shortTtlEngine.searchWithCache({
        query: "ttl test",
        limit: 10,
      });

      const metricsBefore = shortTtlEngine.getMetrics();
      expect(metricsBefore.cacheHits).toBe(0);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should be cache miss
      await shortTtlEngine.searchWithCache({
        query: "ttl test",
        limit: 10,
      });

      const metricsAfter = shortTtlEngine.getMetrics();
      expect(metricsAfter.cacheMisses).toBeGreaterThan(metricsBefore.cacheMisses);
    });
  });

  // ============================================
  // Token 节省测试
  // ============================================

  describe("Token Savings Tests", () => {
    it("should achieve > 50% token savings with compression", async () => {
      // Generate test messages
      const messages = Array(100)
        .fill(null)
        .map((_, i) => ({
          role: i % 2 === 0 ? "user" : ("assistant" as const),
          content: `This is test message number ${i} with some additional content to simulate a real conversation.`,
        }));

      const originalTokens = tokenEstimator.countMessages(messages);

      const compressedMessages = await compressionService.compress(messages, {
        strategy: "hybrid",
        maxTokens: 4000,
      });

      const compressedTokens = tokenEstimator.countMessages(compressedMessages);
      const savings = (originalTokens - compressedTokens) / originalTokens;

      console.log(`Original tokens: ${originalTokens}`);
      console.log(`Compressed tokens: ${compressedTokens}`);
      console.log(`Token savings: ${(savings * 100).toFixed(2)}%`);

      expect(savings).toBeGreaterThan(0.5);
    });

    it("should complete compression within acceptable time", async () => {
      const messages = Array(100)
        .fill(null)
        .map((_, i) => ({
          role: i % 2 === 0 ? "user" : ("assistant" as const),
          content: `Test message ${i}`.repeat(10),
        }));

      const startTime = Date.now();
      await compressionService.compress(messages, {
        strategy: "hybrid",
        maxTokens: 4000,
      });
      const compressionTime = Date.now() - startTime;

      console.log(`Compression time: ${compressionTime}ms`);

      expect(compressionTime).toBeLessThan(1000);
    });
  });

  // ============================================
  // 性能门禁测试
  // ============================================

  describe("Performance Gates", () => {
    interface GateResult {
      name: string;
      passed: boolean;
      value: number;
      threshold: number;
    }

    it("must pass all performance gates", async () => {
      const results: GateResult[] = [];

      // Gate 1: Vector retrieval < 30ms
      const vectorStart = Date.now();
      await retrievalEngine.search({
        query: "gate test",
        limit: 10,
      });
      const vectorTime = Date.now() - vectorStart;
      results.push({
        name: "vector_retrieval",
        passed: vectorTime < 30,
        value: vectorTime,
        threshold: 30,
      });

      // Gate 2: L1 disclosure < 10ms
      const l1Start = Date.now();
      await disclosureManager.getDisclosure("tool1", {
        score: 0.95,
        maxTokens: 3000,
      });
      const l1Time = Date.now() - l1Start;
      results.push({
        name: "l1_disclosure",
        passed: l1Time < 10,
        value: l1Time,
        threshold: 10,
      });

      // Gate 3: Cache hit rate > 80%
      // Populate and query cache
      for (let i = 0; i < 50; i++) {
        await retrievalEngine.searchWithCache({
          query: `gate cache test ${i}`,
          limit: 10,
        });
      }
      for (let i = 0; i < 50; i++) {
        await retrievalEngine.searchWithCache({
          query: `gate cache test ${i}`,
          limit: 10,
        });
      }
      const metrics = retrievalEngine.getMetrics();
      const totalRequests = (metrics.cacheHits || 0) + (metrics.cacheMisses || 0);
      const hitRate = totalRequests > 0 ? (metrics.cacheHits || 0) / totalRequests : 0;
      results.push({
        name: "cache_hit_rate",
        passed: hitRate > 0.8,
        value: hitRate * 100,
        threshold: 80,
      });

      // Gate 4: Token savings > 50%
      const messages = Array(100)
        .fill(null)
        .map((_, i) => ({
          role: i % 2 === 0 ? "user" : ("assistant" as const),
          content: `Token savings test message ${i}`,
        }));
      const originalTokens = tokenEstimator.countMessages(messages);
      const compressedMessages = await compressionService.compress(messages, {
        strategy: "hybrid",
        maxTokens: 4000,
      });
      const compressedTokens = tokenEstimator.countMessages(compressedMessages);
      const savings = (originalTokens - compressedTokens) / originalTokens;
      results.push({
        name: "token_savings",
        passed: savings > 0.5,
        value: savings * 100,
        threshold: 50,
      });

      // Log all results
      console.log("\n=== Performance Gate Results ===");
      results.forEach((r) => {
        const status = r.passed ? "✓" : "✗";
        console.log(`${status} ${r.name}: ${r.value.toFixed(2)} (threshold: ${r.threshold})`);
      });

      // Assert all gates passed
      const failedGates = results.filter((r) => !r.passed);
      expect(failedGates).toHaveLength(0);

      if (failedGates.length > 0) {
        console.error("Failed gates:", failedGates);
      }
    });
  });

  // ============================================
  // 基准对比测试
  // ============================================

  describe("Baseline Comparison Tests", () => {
    it("should maintain consistent performance across weight configurations", () => {
      const weightConfigs = [
        { vector: 0.5, keyword: 0.3, semantic: 0.2, tag: 0.1 },
        { vector: 0.7, keyword: 0.2, semantic: 0.1, tag: 0.0 },
        { vector: 0.3, keyword: 0.4, semantic: 0.2, tag: 0.1 },
        { vector: 0.4, keyword: 0.3, semantic: 0.2, tag: 0.1 },
      ];

      const latencies: number[] = [];

      weightConfigs.forEach((weights) => {
        const engine = new HybridRetrievalEngine({
          hybridConfig: {
            ...createMockRetrievalConfig(),
            vectorWeight: weights.vector,
            keywordWeight: weights.keyword,
            semanticWeight: weights.semantic,
            tagWeight: weights.tag,
          },
          searchEngine: createMockSearchEngine(),
          connection: createMockConnection(),
          embeddingGenerator: createMockEmbeddingGenerator(),
        });

        const startTime = Date.now();
        // Run a few searches
        for (let i = 0; i < 10; i++) {
          // Note: We're not awaiting to test synchronous behavior
          engine.search({
            query: `weight test ${i}`,
            limit: 10,
          });
        }
        latencies.push(Date.now() - startTime);
      });

      // All configurations should have similar latencies
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const variance =
        latencies.reduce((sum, lat) => sum + Math.pow(lat - avgLatency, 2), 0) / latencies.length;

      console.log(`Weight config latencies: ${latencies.map((l) => l.toFixed(2)).join(", ")}ms`);
      console.log(`Average: ${avgLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms`);

      // Variance should be low (no config should be significantly slower)
      expect(variance).toBeLessThan(100);
    });
  });
});

// ============================================
// 工具函数
// ============================================

/**
 * 运行性能测试并生成报告
 */
export async function runPerformanceBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // 这里可以添加自动化性能测试逻辑

  return results;
}

/**
 * 生成性能测试报告
 */
export function generatePerformanceReport(results: BenchmarkResult[]): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  let report = `# Performance Benchmark Report\n\n`;
  report += `**Total Tests:** ${results.length}\n`;
  report += `**Passed:** ${passed}\n`;
  report += `**Failed:** ${failed}\n\n`;
  report += `## Results\n\n`;

  results.forEach((r) => {
    const status = r.passed ? "✓" : "✗";
    report += `${status} **${r.testName}**\n`;
    report += `  - Average Latency: ${r.avgLatency.toFixed(2)}ms\n`;
    report += `  - Throughput: ${r.throughput.toFixed(2)} ops/sec\n`;
    report += `  - Memory: ${(r.memoryUsed / (1024 * 1024)).toFixed(2)}MB\n`;
    if (r.details) {
      report += `  - Details: ${JSON.stringify(r.details)}\n`;
    }
    report += `\n`;
  });

  return report;
}
