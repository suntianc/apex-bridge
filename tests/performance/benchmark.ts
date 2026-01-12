/**
 * 性能基准测试框架
 * Phase 4 - ApexBridge 性能基准测试框架
 *
 * 提供：
 * - 延迟基准测试
 * - 吞吐量测试
 * - 统计计算 (p50, p95, p99, avg, throughput)
 * - 性能报告生成
 */

export interface BenchmarkResult {
  name: string;
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  throughput: number;
  samples: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ThroughputResult {
  name: string;
  avg: number;
  throughput: number;
  samples: number;
  duration: number;
  timestamp: Date;
}

export interface RecallResult {
  name: string;
  recall: number;
  precision: number;
  f1: number;
  totalQueries: number;
  relevantFound: number;
  totalRelevant: number;
  timestamp: Date;
}

/**
 * 性能基准测试框架
 * 支持延迟、吞吐量、召回率等指标测量
 */
export class BenchmarkFramework {
  private warmupRuns: number = 5;
  private gcBeforeTest: boolean = false;

  /**
   * 设置预热运行次数
   */
  setWarmupRuns(runs: number): this {
    this.warmupRuns = runs;
    return this;
  }

  /**
   * 是否在测试前触发 GC
   */
  setGCBeforeTest(enable: boolean): this {
    this.gcBeforeTest = enable;
    return this;
  }

  /**
   * 运行延迟基准测试
   *
   * @param name 测试名称
   * @param fn 异步测试函数
   * @param samples 样本数量 (默认 1000)
   * @returns 性能统计结果
   */
  async runLatencyBenchmark<T = void>(
    name: string,
    fn: () => Promise<T>,
    samples: number = 1000
  ): Promise<BenchmarkResult> {
    // 预热阶段
    await this._warmup(fn as () => Promise<void>);

    // 清理 GC
    if (this.gcBeforeTest) {
      this._forceGC();
    }

    const latencies: number[] = [];

    // 执行基准测试
    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      await fn();
      latencies.push(performance.now() - start);
    }

    return this._calculateLatencyStats(name, latencies);
  }

  /**
   * 运行吞吐量基准测试
   *
   * @param name 测试名称
   * @param fn 异步测试函数
   * @param durationMs 测试持续时间 (默认 10000ms)
   * @returns 吞吐量结果
   */
  async runThroughputBenchmark<T = void>(
    name: string,
    fn: () => Promise<T>,
    durationMs: number = 10000
  ): Promise<ThroughputResult> {
    // 预热阶段
    await this._warmup(fn as () => Promise<void>);

    // 清理 GC
    if (this.gcBeforeTest) {
      this._forceGC();
    }

    const start = Date.now();
    let count = 0;

    while (Date.now() - start < durationMs) {
      await fn();
      count++;
    }

    const actualDuration = Date.now() - start;
    const avg = actualDuration / count;
    const throughput = (count * 1000) / actualDuration;

    return {
      name,
      avg,
      throughput,
      samples: count,
      duration: actualDuration,
      timestamp: new Date(),
    };
  }

  /**
   * 运行召回率基准测试
   *
   * @param name 测试名称
   * @param searchFn 搜索函数 (查询 -> Promise<结果[]>)
   * @param testQueries 测试查询数组
   * @param getGroundTruthFn 获取真实结果的函数
   * @returns 召回率结果
   */
  async runRecallBenchmark(
    name: string,
    searchFn: (query: string) => Promise<Array<{ id: string; score: number }>>,
    testQueries: Array<{ query: string; relevantIds: string[] }>
  ): Promise<RecallResult> {
    let totalRelevant = 0;
    let relevantFound = 0;
    const allResults: Array<{ query: string; results: Array<{ id: string; score: number }> }> = [];

    for (const testQuery of testQueries) {
      const results = await searchFn(testQuery.query);
      allResults.push({ query: testQuery.query, results });

      const resultIds = new Set(results.map((r) => r.id));
      for (const relevantId of testQuery.relevantIds) {
        totalRelevant++;
        if (resultIds.has(relevantId)) {
          relevantFound++;
        }
      }
    }

    const recall = totalRelevant > 0 ? relevantFound / totalRelevant : 0;

    // 计算精确率和 F1
    const totalReturned = allResults.reduce((sum, r) => sum + r.results.length, 0);
    const truePositives = relevantFound;
    const precision = totalReturned > 0 ? truePositives / totalReturned : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      name,
      recall,
      precision,
      f1,
      totalQueries: testQueries.length,
      relevantFound,
      totalRelevant,
      timestamp: new Date(),
    };
  }

  /**
   * 运行批量延迟测试
   * 支持并发执行的延迟测试
   *
   * @param name 测试名称
   * @param fn 异步测试函数
   * @param samples 样本数量
   * @param concurrency 并发数 (默认 10)
   */
  async runConcurrentLatencyBenchmark(
    name: string,
    fn: () => Promise<void>,
    samples: number = 1000,
    concurrency: number = 10
  ): Promise<BenchmarkResult> {
    await this._warmup(fn);

    if (this.gcBeforeTest) {
      this._forceGC();
    }

    const latencies: number[] = [];

    // 分批执行并发测试
    for (let batchStart = 0; batchStart < samples; batchStart += concurrency) {
      const batch: Promise<void>[] = [];
      const batchEnd = Math.min(batchStart + concurrency, samples);

      for (let i = batchStart; i < batchEnd; i++) {
        const start = performance.now();
        batch.push(
          fn().then(() => {
            latencies.push(performance.now() - start);
          })
        );
      }

      await Promise.all(batch);
    }

    return this._calculateLatencyStats(name, latencies);
  }

  /**
   * 比较多个实现的性能
   *
   * @param name 测试名称
   * @param implementations 实现对象 { name: fn }
   * @param samples 样本数量
   */
  async compareImplementations(
    name: string,
    implementations: Record<string, () => Promise<void>>,
    samples: number = 1000
  ): Promise<Record<string, BenchmarkResult>> {
    const results: Record<string, BenchmarkResult> = {};

    for (const [implName, fn] of Object.entries(implementations)) {
      results[implName] = await this.runLatencyBenchmark(`${name}-${implName}`, fn, samples);
    }

    return results;
  }

  /**
   * 生成性能趋势报告
   *
   * @param historicalResults 历史测试结果
   */
  generateTrendReport(historicalResults: Array<{ result: BenchmarkResult; timestamp: Date }>): {
    p50Trend: number[];
    p95Trend: number[];
    p99Trend: number[];
    avgTrend: number[];
    throughputTrend: number[];
    regressionDetected: boolean;
  } {
    const p50Trend = historicalResults.map((r) => r.result.p50);
    const p95Trend = historicalResults.map((r) => r.result.p95);
    const p99Trend = historicalResults.map((r) => r.result.p99);
    const avgTrend = historicalResults.map((r) => r.result.avg);
    const throughputTrend = historicalResults.map((r) => r.result.throughput);

    // 检测性能回归
    const regressionDetected = this._detectRegression(historicalResults);

    return {
      p50Trend,
      p95Trend,
      p99Trend,
      avgTrend,
      throughputTrend,
      regressionDetected,
    };
  }

  // ============================================
  // 私有方法
  // ============================================

  /**
   * 预热阶段
   */
  private async _warmup(fn: () => Promise<void>): Promise<void> {
    for (let i = 0; i < this.warmupRuns; i++) {
      await fn();
    }
  }

  /**
   * 强制执行垃圾回收
   */
  private _forceGC(): void {
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * 计算延迟统计数据
   */
  private _calculateLatencyStats(name: string, latencies: number[]): BenchmarkResult {
    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / sorted.length;
    const throughput = 1000 / avg;

    const percentile = (arr: number[], p: number): number => {
      const index = Math.floor(arr.length * p);
      return arr[Math.min(index, arr.length - 1)];
    };

    return {
      name,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      avg,
      throughput,
      samples: latencies.length,
      timestamp: new Date(),
    };
  }

  /**
   * 检测性能回归
   */
  private _detectRegression(
    historicalResults: Array<{ result: BenchmarkResult; timestamp: Date }>
  ): boolean {
    if (historicalResults.length < 2) {
      return false;
    }

    const sorted = [...historicalResults].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const recent = sorted.slice(-5); // 最近 5 次
    const older = sorted.slice(0, Math.max(1, sorted.length - 5));

    if (recent.length === 0 || older.length === 0) {
      return false;
    }

    const recentAvgP95 = recent.reduce((sum, r) => sum + r.result.p95, 0) / recent.length;
    const olderAvgP95 = older.reduce((sum, r) => sum + r.result.p95, 0) / older.length;

    // 如果最近的表现比之前的差 20%，认为是回归
    return recentAvgP95 > olderAvgP95 * 1.2;
  }
}

/**
 * 延迟断言工具
 */
export class LatencyAssertions {
  constructor(private result: BenchmarkResult) {}

  /**
   * 断言 P50 延迟小于指定值
   */
  p50LessThan(ms: number): void {
    expect(this.result.p50).toBeLessThan(ms);
  }

  /**
   * 断言 P95 延迟小于指定值
   */
  p95LessThan(ms: number): void {
    expect(this.result.p95).toBeLessThan(ms);
  }

  /**
   * 断言 P99 延迟小于指定值
   */
  p99LessThan(ms: number): void {
    expect(this.result.p99).toBeLessThan(ms);
  }

  /**
   * 断言平均延迟小于指定值
   */
  avgLessThan(ms: number): void {
    expect(this.result.avg).toBeLessThan(ms);
  }

  /**
   * 断言吞吐量大于指定值
   */
  throughputGreaterThan(rps: number): void {
    expect(this.result.throughput).toBeGreaterThan(rps);
  }
}

/**
 * 召回率断言工具
 */
export class RecallAssertions {
  constructor(private result: RecallResult) {}

  /**
   * 断言召回率大于指定值
   */
  recallGreaterThan(threshold: number): void {
    expect(this.result.recall).toBeGreaterThan(threshold);
  }

  /**
   * 断言精确率大于指定值
   */
  precisionGreaterThan(threshold: number): void {
    expect(this.result.precision).toBeGreaterThan(threshold);
  }

  /**
   * 断言 F1 分数大于指定值
   */
  f1GreaterThan(threshold: number): void {
    expect(this.result.f1).toBeGreaterThan(threshold);
  }
}

/**
 * 性能测试工具函数
 */

/**
 * 生成测试查询数据
 */
export function generateTestQueries(
  count: number
): Array<{ query: string; relevantIds: string[] }> {
  const queries: Array<{ query: string; relevantIds: string[] }> = [];
  const keywords = [
    "search",
    "file",
    "data",
    "code",
    "api",
    "database",
    "system",
    "user",
    "config",
    "network",
  ];

  for (let i = 0; i < count; i++) {
    const keyword1 = keywords[Math.floor(Math.random() * keywords.length)];
    const keyword2 = keywords[Math.floor(Math.random() * keywords.length)];
    const query = `${keyword1} ${keyword2}`;
    const relevantIds = [`tool-${Math.floor(Math.random() * 20) + 1}`];

    queries.push({ query, relevantIds });
  }

  return queries;
}

/**
 * 创建模拟检索服务
 */
export function createMockRetrievalService(avgLatencyMs: number = 5): {
  findRelevantSkills: (query: string) => Promise<Array<{ id: string; score: number }>>;
  searchByKeyword: (keyword: string) => Promise<Array<{ id: string; score: number }>>;
  hybridSearch: (query: string) => Promise<Array<{ id: string; score: number }>>;
} {
  return {
    async findRelevantSkills(query: string): Promise<Array<{ id: string; score: number }>> {
      const latency = avgLatencyMs + (Math.random() - 0.5) * 2 * avgLatencyMs;
      await new Promise((resolve) => setTimeout(resolve, latency));

      return [
        { id: `tool-${Math.floor(Math.random() * 10)}`, score: 0.9 },
        { id: `tool-${Math.floor(Math.random() * 10)}`, score: 0.8 },
        { id: `tool-${Math.floor(Math.random() * 10)}`, score: 0.7 },
      ];
    },

    async searchByKeyword(keyword: string): Promise<Array<{ id: string; score: number }>> {
      const latency = avgLatencyMs * 0.5 + (Math.random() - 0.5) * avgLatencyMs;
      await new Promise((resolve) => setTimeout(resolve, latency));

      return [
        { id: `tool-${Math.floor(Math.random() * 10)}`, score: 0.95 },
        { id: `tool-${Math.floor(Math.random() * 10)}`, score: 0.85 },
      ];
    },

    async hybridSearch(query: string): Promise<Array<{ id: string; score: number }>> {
      const latency = avgLatencyMs * 1.5 + (Math.random() - 0.5) * avgLatencyMs;
      await new Promise((resolve) => setTimeout(resolve, latency));

      return [
        { id: `tool-${Math.floor(Math.random() * 10)}`, score: 0.92 },
        { id: `tool-${Math.floor(Math.random() * 10)}`, score: 0.88 },
        { id: `tool-${Math.floor(Math.random() * 10)}`, score: 0.75 },
      ];
    },
  };
}
