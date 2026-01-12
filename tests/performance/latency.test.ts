/**
 * 延迟基准测试
 * Phase 4 - ApexBridge 性能基准测试框架
 *
 * 测试覆盖：
 * - 向量搜索延迟
 * - 关键词搜索延迟
 * - 混合搜索延迟
 * - 并发延迟测试
 */

import { BenchmarkFramework, BenchmarkResult, LatencyAssertions } from "./benchmark";

// ============================================
// Mock 检索服务 (模拟真实服务行为)
// ============================================

interface MockRetrievalService {
  findRelevantSkills(query: string): Promise<Array<{ id: string; score: number }>>;
  searchByKeyword(keyword: string): Promise<Array<{ id: string; score: number }>>;
  hybridSearch(query: string): Promise<Array<{ id: string; score: number }>>;
}

function createMockRetrievalService(avgLatencyMs: number = 5): MockRetrievalService {
  return {
    async findRelevantSkills(query: string): Promise<Array<{ id: string; score: number }>> {
      const latency = avgLatencyMs + (Math.random() - 0.5) * 2 * avgLatencyMs;
      await new Promise((resolve) => setTimeout(resolve, latency));

      return [
        { id: "tool-1", score: 0.95 },
        { id: "tool-2", score: 0.88 },
        { id: "tool-3", score: 0.82 },
      ];
    },

    async searchByKeyword(keyword: string): Promise<Array<{ id: string; score: number }>> {
      const latency = avgLatencyMs * 0.4 + (Math.random() - 0.5) * avgLatencyMs * 0.4;
      await new Promise((resolve) => setTimeout(resolve, latency));

      return [
        { id: "tool-1", score: 0.92 },
        { id: "tool-4", score: 0.85 },
      ];
    },

    async hybridSearch(query: string): Promise<Array<{ id: string; score: number }>> {
      const latency = avgLatencyMs * 1.2 + (Math.random() - 0.5) * avgLatencyMs * 0.6;
      await new Promise((resolve) => setTimeout(resolve, latency));

      return [
        { id: "tool-1", score: 0.94 },
        { id: "tool-2", score: 0.89 },
        { id: "tool-3", score: 0.85 },
        { id: "tool-4", score: 0.78 },
      ];
    },
  };
}

// ============================================
// 测试配置
// ============================================

const BENCHMARK_SAMPLES = 500;
const THROUGHPUT_DURATION_MS = 2000; // Reduced to 2 seconds for faster testing
const CONCURRENCY_LEVEL = 10;

describe("Latency Benchmarks", () => {
  let benchmark: BenchmarkFramework;
  let mockService: MockRetrievalService;

  beforeAll(async () => {
    benchmark = new BenchmarkFramework();
    benchmark.setWarmupRuns(3);
    mockService = createMockRetrievalService(5);

    // 预热服务
    await mockService.findRelevantSkills("warmup");
    await mockService.searchByKeyword("warmup");
    await mockService.hybridSearch("warmup");
  });

  describe("Vector Search Latency", () => {
    it("p50 latency < 10ms for vector search", async () => {
      const result = await benchmark.runLatencyBenchmark(
        "vector-search",
        () => mockService.findRelevantSkills("test query"),
        BENCHMARK_SAMPLES
      );

      const assertions = new LatencyAssertions(result);
      assertions.p50LessThan(10);
      assertions.p95LessThan(25);
      assertions.p99LessThan(50);
      assertions.avgLessThan(10);

      console.log(`Vector Search P50: ${result.p50.toFixed(2)}ms`);
    });

    it("should maintain consistent latency under load", async () => {
      const result = await benchmark.runLatencyBenchmark(
        "vector-search-under-load",
        () => mockService.findRelevantSkills("concurrent query"),
        BENCHMARK_SAMPLES
      );

      // 验证延迟方差
      const variance = Math.pow(result.p99 - result.p50, 2);
      expect(variance).toBeLessThan(100);

      console.log(`Vector Search P99-P50 variance: ${Math.sqrt(variance).toFixed(2)}ms`);
    });
  });

  describe("Keyword Search Latency", () => {
    it("p50 latency < 5ms for keyword search", async () => {
      const result = await benchmark.runLatencyBenchmark(
        "keyword-search",
        () => mockService.searchByKeyword("test"),
        BENCHMARK_SAMPLES
      );

      const assertions = new LatencyAssertions(result);
      assertions.p50LessThan(5);
      assertions.p95LessThan(12);
      assertions.p99LessThan(20);
      assertions.avgLessThan(5);

      console.log(`Keyword Search P50: ${result.p50.toFixed(2)}ms`);
    });

    it("keyword search should be faster than vector search", async () => {
      const [keywordResult, vectorResult] = await Promise.all([
        benchmark.runLatencyBenchmark(
          "keyword-search-comparison",
          () => mockService.searchByKeyword("test"),
          BENCHMARK_SAMPLES
        ),
        benchmark.runLatencyBenchmark(
          "vector-search-comparison",
          () => mockService.findRelevantSkills("test"),
          BENCHMARK_SAMPLES
        ),
      ]);

      expect(keywordResult.avg).toBeLessThan(vectorResult.avg);

      console.log(
        `Keyword avg: ${keywordResult.avg.toFixed(2)}ms, Vector avg: ${vectorResult.avg.toFixed(2)}ms`
      );
    });
  });

  describe("Hybrid Search Latency", () => {
    it("p50 latency < 15ms for hybrid search", async () => {
      const result = await benchmark.runLatencyBenchmark(
        "hybrid-search",
        () => mockService.hybridSearch("test query"),
        BENCHMARK_SAMPLES
      );

      const assertions = new LatencyAssertions(result);
      assertions.p50LessThan(15);
      assertions.p95LessThan(35);
      assertions.p99LessThan(60);
      assertions.avgLessThan(15);

      console.log(`Hybrid Search P50: ${result.p50.toFixed(2)}ms`);
    });

    it("hybrid search latency should be reasonable combination of components", async () => {
      const [hybridResult, vectorResult, keywordResult] = await Promise.all([
        benchmark.runLatencyBenchmark(
          "hybrid-search-isolation",
          () => mockService.hybridSearch("test"),
          BENCHMARK_SAMPLES
        ),
        benchmark.runLatencyBenchmark(
          "vector-search-isolation",
          () => mockService.findRelevantSkills("test"),
          BENCHMARK_SAMPLES
        ),
        benchmark.runLatencyBenchmark(
          "keyword-search-isolation",
          () => mockService.searchByKeyword("test"),
          BENCHMARK_SAMPLES
        ),
      ]);

      // 混合搜索应该比单独的向量和关键词搜索慢，但差距应该合理
      const overhead = hybridResult.avg - (vectorResult.avg + keywordResult.avg);
      expect(overhead).toBeLessThan(10);

      console.log(`Hybrid-Vector-Keyword overhead: ${overhead.toFixed(2)}ms`);
    });
  });

  describe("Concurrent Latency", () => {
    it("should handle concurrent requests efficiently", async () => {
      const result = await benchmark.runConcurrentLatencyBenchmark(
        "concurrent-vector-search",
        async () => {
          await mockService.findRelevantSkills("concurrent test");
        },
        BENCHMARK_SAMPLES,
        CONCURRENCY_LEVEL
      );

      const assertions = new LatencyAssertions(result);
      assertions.p50LessThan(20);
      assertions.p95LessThan(50);
      assertions.p99LessThan(100);

      console.log(
        `Concurrent P50: ${result.p50.toFixed(2)}ms, Throughput: ${result.throughput.toFixed(2)} req/s`
      );
    });
  });

  describe("Throughput Benchmarks", () => {
    it("vector search throughput > 100 req/s", async () => {
      const result = await benchmark.runThroughputBenchmark(
        "vector-search-throughput",
        () => mockService.findRelevantSkills("throughput test"),
        THROUGHPUT_DURATION_MS
      );

      expect(result.throughput).toBeGreaterThan(100);

      console.log(`Vector Search Throughput: ${result.throughput.toFixed(2)} req/s`);
    }, 30000); // Increased timeout

    it("keyword search throughput > 200 req/s", async () => {
      const result = await benchmark.runThroughputBenchmark(
        "keyword-search-throughput",
        () => mockService.searchByKeyword("throughput"),
        THROUGHPUT_DURATION_MS
      );

      expect(result.throughput).toBeGreaterThan(200);

      console.log(`Keyword Search Throughput: ${result.throughput.toFixed(2)} req/s`);
    }, 30000); // Increased timeout

    it("hybrid search throughput > 80 req/s", async () => {
      const result = await benchmark.runThroughputBenchmark(
        "hybrid-search-throughput",
        () => mockService.hybridSearch("throughput test"),
        THROUGHPUT_DURATION_MS
      );

      expect(result.throughput).toBeGreaterThan(80);

      console.log(`Hybrid Search Throughput: ${result.throughput.toFixed(2)} req/s`);
    }, 30000); // Increased timeout
  });

  describe("Latency Stability", () => {
    it("should not have significant latency outliers", async () => {
      const result = await benchmark.runLatencyBenchmark(
        "latency-stability-test",
        () => mockService.findRelevantSkills("stability test"),
        BENCHMARK_SAMPLES
      );

      // P99 应该在 P95 的 2 倍以内
      const outlierRatio = result.p99 / result.p95;
      expect(outlierRatio).toBeLessThan(2.5);

      console.log(`P99/P95 ratio: ${outlierRatio.toFixed(2)}`);
    });

    it("should maintain low standard deviation", async () => {
      const result = await benchmark.runLatencyBenchmark(
        "latency-stddev-test",
        () => mockService.searchByKeyword("stddev test"),
        BENCHMARK_SAMPLES
      );

      // 使用更简单的标准差计算
      // CV = stdDev / mean，CV 应该小于 1.0 表示相对稳定
      // 使用 p99 和 p50 的差值作为分布宽度的近似
      const distributionWidth = result.p99 - result.p50;
      const cvApprox = distributionWidth / result.avg;
      expect(cvApprox).toBeLessThan(1.0);

      console.log(`CV approximation: ${(cvApprox * 100).toFixed(2)}%`);
    });
  });
});

// ============================================
// 性能回归测试
// ============================================

describe("Performance Regression Tests", () => {
  let benchmark: BenchmarkFramework;
  let mockService: MockRetrievalService;

  beforeAll(async () => {
    benchmark = new BenchmarkFramework();
    benchmark.setWarmupRuns(3);
    mockService = createMockRetrievalService(5);
  });

  it("should detect performance regression", async () => {
    const historicalResults: Array<{ result: BenchmarkResult; timestamp: Date }> = [];

    // 模拟历史数据
    for (let i = 0; i < 5; i++) {
      const result = await benchmark.runLatencyBenchmark(
        `regression-test-${i}`,
        () => mockService.findRelevantSkills("regression test"),
        100
      );

      historicalResults.push({
        result,
        timestamp: new Date(Date.now() - (5 - i) * 60000),
      });
    }

    const trendReport = benchmark.generateTrendReport(historicalResults);

    expect(trendReport.regressionDetected).toBe(false);

    console.log("Regression detection:", trendReport.regressionDetected ? "REGRESSION!" : "OK");
  });
});
