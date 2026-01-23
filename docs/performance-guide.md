# ApexBridge 性能优化指南

**版本:** 2.0.0  
**最后更新:** 2026-01-12

本指南涵盖 ApexBridge 的性能优化策略，包括启动优化、检索优化、内存管理和监控调优。

---

## 目录

- [性能指标](#性能指标)
- [启动优化](#启动优化)
- [检索优化](#检索优化)
- [批量处理优化](#批量处理优化)
- [内存优化](#内存优化)
- [连接池管理](#连接池管理)
- [监控与调优](#监控与调优)

---

## 性能指标

### 核心性能目标

| 操作             | 目标延迟 (P50) | 目标延迟 (P95) | 备注          |
| ---------------- | -------------- | -------------- | ------------- |
| 向量检索         | < 10ms         | < 50ms         | 单次查询      |
| 关键词检索       | < 5ms          | < 20ms         | BM25 检索     |
| 混合检索         | < 15ms         | < 60ms         | 向量 + 关键词 |
| 批量嵌入 (1K 条) | < 5s           | < 10s          | 并行处理      |
| 上下文压缩       | < 100ms        | < 500ms        | 100 条消息    |
| 技能安装         | < 2s           | < 5s           | 含向量索引    |
| 冷启动           | < 500ms        | < 1000ms       | 无预热        |
| 预热后首次请求   | < 100ms        | < 200ms        | 启用预热      |

### 资源使用目标

| 资源类型 | 开发环境 | 生产环境 | 备注     |
| -------- | -------- | -------- | -------- |
| CPU      | < 50%    | < 70%    | 峰值使用 |
| 内存     | < 500MB  | < 2GB    | 堆内存   |
| 磁盘 I/O | < 10MB/s | < 50MB/s | 向量写入 |
| 网络     | < 1MB/s  | < 10MB/s | API 响应 |

---

## 启动优化

### 启用启动预热

启动预热可显著降低首次请求延迟：

**环境变量配置：**

```bash
# .env
WARMUP_ENABLED=true
WARMUP_TIMEOUT_MS=60000
WARMUP_DATABASE_ENABLED=true
WARMUP_INDEX_ENABLED=true
WARMUP_EMBEDDING_CACHE_ENABLED=true
WARMUP_SEARCH_CACHE_ENABLED=true
```

**程序化配置：**

```typescript
import { ApplicationWarmupService } from "./services/warmup/ApplicationWarmupService";

const warmupService = new ApplicationWarmupService({
  enabled: true,
  timeoutMs: 60000,
  databaseWarmup: {
    enabled: true,
    priority: ["surrealdb"],
  },
  indexWarmup: {
    enabled: true,
    queryCount: 100,
  },
  embeddingCacheWarmup: {
    enabled: true,
    sampleCount: 100,
  },
  searchCacheWarmup: {
    enabled: true,
    queryCount: 100,
  },
});

// 执行预热
await warmupService.warmup();

// 检查预热状态
const status = warmupService.getStatus();
console.log("Warmup completed:", status.isComplete);
console.log("Duration:", status.totalDuration, "ms");
```

### 预热效果对比

| 场景         | 无预热延迟  | 有预热延迟 | 提升比例 |
| ------------ | ----------- | ---------- | -------- |
| 首次向量检索 | 500-1000ms  | 50-100ms   | 90%+     |
| 首次批量嵌入 | 2000-3000ms | 200-500ms  | 80%+     |
| 首次混合检索 | 600-1200ms  | 80-150ms   | 85%+     |
| 数据库连接   | 200-500ms   | 20-50ms    | 90%+     |

### 数据库预热

```typescript
import { DatabaseManager } from "./services/DatabaseManager";

async function warmupDatabase() {
  const dbManager = DatabaseManager.getInstance();

  // 预热 SurrealDB 连接
  await dbManager.ensureConnection();

  // 预热查询常用表
  await dbManager.query("SELECT COUNT(*) FROM skills");
  await dbManager.query("SELECT COUNT(*) FROM mcp_servers");

  console.log("Database warmup completed");
}
```

### 索引预热

```typescript
import { IndexPrewarmService } from "./services/warmup/IndexPrewarmService";

async function warmupIndexes() {
  const indexPrewarm = new IndexPrewarmService();

  // 预热向量索引
  await indexPrewarm.prewarm({
    queryCount: 100,
    warmupAllIndexes: true,
  });

  console.log("Index warmup completed");
}
```

---

## 检索优化

### 索引配置优化

根据数据规模自动优化索引配置：

```typescript
import { IndexConfigOptimizer } from './services/tool-retrieval/IndexConfigOptimizer';

const optimizer = new IndexConfigOptimizer();

// 根据数据规模计算最优配置
const config = optimizer.calculateOptimalConfig(
  rowCount: 50000,      // 50K 向量
  dimension: 384,       // 维度 (text-embedding-3-small)
  targetRecall: 0.95    // 目标召回率
);

console.log('Optimal configuration:', config);
// 输出: { numPartitions: 128, numSubVectors: 96, refineFactor: 10 }
```

### IVF_PQ 索引配置

```typescript
// 推荐配置（10K-100K 向量）
const indexConfig = {
  // IVF_PQ 索引参数
  numPartitions: 128, // 分区数
  numSubVectors: 96, // 子向量数（PQ 分解）
  refineFactor: 10, // 重排序因子

  // 优化建议
  maxIter: 20, // k-means 最大迭代
  distanceType: "cosine", // 距离类型
};
```

### 混合检索策略

```typescript
import { HybridRetrievalEngine } from "./services/tool-retrieval/HybridRetrievalEngine";

const retrievalEngine = new HybridRetrievalEngine({
  // 检索权重配置
  vectorWeight: 0.6, // 向量检索权重
  keywordWeight: 0.3, // 关键词检索权重
  semanticWeight: 0.1, // 语义检索权重

  // RRF 融合参数
  rrfK: 60,

  // 查询限制
  maxResults: 20,
  scoreThreshold: 0.7,
});

// 执行混合检索
const results = await retrievalEngine.hybridSearch("query", {
  topK: 10,
  vectorWeight: 0.6,
  keywordWeight: 0.3,
  semanticWeight: 0.1,
  rrfK: 60,
});
```

### 披露机制优化

```typescript
import { DisclosureManager, DisclosureLevel } from "./services/tool-retrieval/DisclosureManager";

const disclosureManager = new DisclosureManager({
  // 默认披露级别
  defaultLevel: DisclosureLevel.METADATA,

  // Token 限制
  maxTokens: {
    [DisclosureLevel.METADATA]: 100,
    [DisclosureLevel.CONTENT]: 5000,
    [DisclosureLevel.RESOURCES]: 20000,
  },

  // 阈值配置
  thresholds: {
    l2: 0.9, // L2 相似度阈值
    l3: 0.7, // L3 相似度阈值
  },
});
```

---

## 批量处理优化

### 批量嵌入服务

```typescript
import { BatchEmbeddingService } from "./services/BatchEmbeddingService";

const batchService = new BatchEmbeddingService({
  batchSize: 100, // 每批数量（推荐 50-200）
  maxConcurrency: 5, // 最大并发数（推荐 CPU 核数 / 2）
  timeoutMs: 60000, // 单批超时时间
  retryAttempts: 3, // 重试次数
  minRetryDelayMs: 1000, // 最小重试延迟
  maxRetryDelayMs: 10000, // 最大重试延迟
  enableProgressCallback: true,
});

// 设置进度回调
batchService.setProgressCallback((progress) => {
  console.log(`Progress: ${((progress.processed / progress.total) * 100).toFixed(1)}%`);
  console.log(`Elapsed: ${progress.elapsedMs}ms`);
  console.log(`ETA: ${progress.estimatedRemainingMs}ms`);
});

// 执行批量嵌入
const result = await batchService.generateBatch(texts, async (batch) => {
  // 调用嵌入 API
  return await embeddingProvider.embed(batch);
});

console.log(`Processed: ${result.totalProcessed}`);
console.log(`Failed: ${result.failedCount}`);
console.log(`Duration: ${result.duration}ms`);
```

### 批量大小优化建议

| 数据规模 | 推荐批次大小 | 并发数 | 预估时间 |
| -------- | ------------ | ------ | -------- |
| 1K 条    | 100          | 3      | < 5s     |
| 10K 条   | 100          | 5      | < 30s    |
| 100K 条  | 150          | 5      | < 5min   |
| 1M 条    | 200          | 8      | < 30min  |

### 进度追踪

```typescript
// 估算处理时间
const estimatedDuration = BatchEmbeddingService.estimateDuration(
  10000, // 文本数量
  100 // 平均处理时间（ms）
);
console.log(`Estimated duration: ${estimatedDuration}ms`);
```

---

## 内存优化

### 批量处理大文件

```typescript
// 分批处理大文件
async function processLargeFile(filePath: string) {
  const batchService = new BatchEmbeddingService({
    batchSize: 50, // 减小批次大小
    maxConcurrency: 3, // 减少并发
  });

  const lines = await readLines(filePath);
  const totalLines = lines.length;

  let processed = 0;
  const batchSize = 50;

  for (let i = 0; i < totalLines; i += batchSize) {
    const batch = lines.slice(i, i + batchSize);
    const result = await batchService.generateBatch(batch, embedFn);

    processed += result.totalProcessed;
    console.log(`Progress: ${processed}/${totalLines}`);

    // 手动触发垃圾回收（可选）
    if (processed % 1000 === 0) {
      global.gc?.();
    }
  }
}
```

### 缓存策略

```typescript
import { SemanticCache } from "./services/cache/SemanticCache";

const cache = new SemanticCache({
  // 相似度阈值
  similarityThreshold: 0.95,

  // 最大缓存项
  maxItems: 10000,

  // 缓存时间（1小时）
  ttlMs: 3600000,
});

// 使用缓存
const cacheKey = generateCacheKey(query);
const cachedResult = await cache.get(cacheKey);

if (cachedResult) {
  return cachedResult;
}

const result = await processQuery(query);
await cache.set(cacheKey, result);
```

### 内存使用监控

```typescript
import { MemoryMonitor } from "./utils/memory";

const monitor = new MemoryMonitor({
  checkInterval: 10000, // 检查间隔
  maxHeapUsage: 0.8, // 最大堆使用率（80%）
  maxRss: 2 * 1024 * 1024 * 1024, // 最大 RSS 2GB
});

monitor.on("warning", (usage) => {
  console.warn("Memory warning:", usage);
});

monitor.on("critical", (usage) => {
  console.error("Memory critical:", usage);
  // 触发清理
  cache.clear();
});
```

---

## 连接池管理

### 连接池配置

```typescript
import { SurrealDBConnection } from "./services/tool-retrieval/SurrealDBConnection";

const pool = new SurrealDBConnection({
  maxInstances: 4, // 最大连接数
  instanceTTL: 300000, // 连接存活时间（5分钟）
  healthCheckInterval: 60000, // 健康检查间隔（1分钟）
});

// 获取连接
async function getDbConnection() {
  const connection = await pool.getConnection("/path/to/database.lance");
  return connection;
}

// 获取池统计
function getPoolStats() {
  const stats = pool.getStats();
  console.log("Active connections:", stats.activeConnections);
  console.log("Pool size:", stats.poolSize);
  console.log("Available permits:", stats.availablePermits);
}

// 关闭池
async function shutdownPool() {
  await pool.closeAll();
}
```

### 连接池配置建议

| 环境   | maxInstances | instanceTTL    | healthCheckInterval |
| ------ | ------------ | -------------- | ------------------- |
| 开发   | 2            | 300000 (5min)  | 60000 (1min)        |
| 生产   | 4            | 600000 (10min) | 30000 (30s)         |
| 高负载 | 8            | 600000 (10min) | 15000 (15s)         |

---

## 监控与调优

### 性能指标收集

```typescript
import { PerformanceCollector } from "./services/metrics/PerformanceCollector";

const collector = new PerformanceCollector({
  enabled: true,
  interval: 10000, // 收集间隔
  retention: 3600000, // 保留 1 小时
});

// 获取性能指标
const metrics = collector.getMetrics();
console.log("Average response time:", metrics.avgResponseTime);
console.log("P50 latency:", metrics.p50Latency);
console.log("P95 latency:", metrics.p95Latency);
console.log("P99 latency:", metrics.p99Latency);
console.log("Throughput:", metrics.requestsPerSecond);
```

### 请求追踪

```typescript
import { RequestTracker } from "./services/RequestTracker";

const tracker = new RequestTracker();

// 追踪单个请求
const trace = tracker.startTrace("chat-request");

try {
  const result = await chatService.processMessage(messages);
  trace.end({ success: true });
  return result;
} catch (error) {
  trace.end({ success: false, error: error.message });
  throw error;
}
```

### 性能报告

```typescript
import { PerformanceReporter } from "./services/metrics/PerformanceReporter";

const reporter = new PerformanceReporter({
  outputDir: "./reports",
  format: "json",
});

// 生成报告
await reporter.generateReport({
  startTime: new Date("2026-01-12T00:00:00Z"),
  endTime: new Date("2026-01-12T23:59:59Z"),
  includeCharts: true,
});

console.log("Report generated:", reporter.getReportPath());
```

### 监控端点

```bash
# 健康检查
curl http://localhost:8088/health

# 性能指标
curl http://localhost:8088/metrics

# 请求追踪
curl http://localhost:8088/traces?limit=100
```

---

## 调优清单

### 部署前检查

- [ ] 启用启动预热（`WARMUP_ENABLED=true`）
- [ ] 配置合适的批量大小和并发数
- [ ] 优化索引配置（根据数据规模）
- [ ] 配置连接池参数
- [ ] 启用缓存策略
- [ ] 设置日志级别为 `info` 或 `warn`

### 性能测试

- [ ] 测试向量检索延迟（目标 < 10ms）
- [ ] 测试批量嵌入性能（1K 条 < 5s）
- [ ] 测试并发请求处理能力
- [ ] 测试内存使用情况（目标 < 2GB）
- [ ] 测试长时间运行稳定性

### 生产调优

- [ ] 根据监控数据调整批量大小
- [ ] 调整连接池大小
- [ ] 优化缓存策略
- [ ] 调整日志级别
- [ ] 配置资源限制
- [ ] 设置告警阈值

---

## 常见问题

### Q1: 首次请求延迟过高？

**解决方案：**

1. 启用启动预热
2. 预加载常用模型
3. 预热向量索引
4. 预热嵌入缓存

```bash
# 启用预热
WARMUP_ENABLED=true
WARMUP_TIMEOUT_MS=120000
```

### Q2: 内存使用过高？

**解决方案：**

1. 减小批量处理大小
2. 启用垃圾回收
3. 限制缓存大小
4. 优化数据处理流程

```typescript
const batchService = new BatchEmbeddingService({
  batchSize: 50, // 减小批次
  maxConcurrency: 2, // 减少并发
});
```

### Q3: 向量检索慢？

**解决方案：**

1. 优化索引配置
2. 增加分区数
3. 使用更高效的索引类型
4. 预热向量索引

```typescript
const optimizer = new IndexConfigOptimizer();
const config = optimizer.calculateOptimalConfig(
  rowCount: 50000,
  dimension: 384,
  targetRecall: 0.95,
);
```

### Q4: 批量处理失败率高？

**解决方案：**

1. 增加重试次数
2. 减小批次大小
3. 增加超时时间
4. 实现断点续传

```typescript
const batchService = new BatchEmbeddingService({
  retryAttempts: 5,
  minRetryDelayMs: 2000,
  maxRetryDelayMs: 30000,
  timeoutMs: 120000,
});
```

---

## 最佳实践总结

### 1. 启动优化

```bash
# 环境变量
WARMUP_ENABLED=true
WARMUP_TIMEOUT_MS=60000
```

### 2. 检索优化

```typescript
// 使用混合检索
const results = await retrievalEngine.hybridSearch(query, {
  vectorWeight: 0.6,
  keywordWeight: 0.3,
  semanticWeight: 0.1,
});
```

### 3. 批量处理优化

```typescript
const batchService = new BatchEmbeddingService({
  batchSize: 100,
  maxConcurrency: 5,
  retryAttempts: 3,
});
```

### 4. 监控配置

```typescript
const collector = new PerformanceCollector({
  enabled: true,
  interval: 10000,
});
```

---

## 获取帮助

- **项目仓库**: https://github.com/suntianc/apex-bridge
- **问题反馈**: https://github.com/suntianc/apex-bridge/issues
- **性能优化讨论**: https://github.com/suntianc/apex-bridge/discussions
