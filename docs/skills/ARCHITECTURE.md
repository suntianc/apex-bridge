# Skills系统技术架构文档

## 概述

Skills系统是基于渐进式披露机制的插件架构，通过三级加载策略实现Token效率最大化，同时保持向后兼容性。

## 核心架构

### 三级加载机制

```
┌─────────────────────────────────────────┐
│          Skills系统架构                  │
├─────────────────────────────────────────┤
│  Level 1: 元数据预加载 (50 tokens)      │
│  ├─ 启动时加载所有METADATA.yml          │
│  ├─ 支持智能匹配和搜索                  │
│  └─ LRU缓存，TTL: 1小时                │
├─────────────────────────────────────────┤
│  Level 2: 指令按需加载 (1000-5000 tokens)│
│  ├─ 置信度>0.7时加载SKILL.md            │
│  ├─ 解析代码块和文档结构                │
│  └─ LRU缓存，TTL: 30分钟                │
├─────────────────────────────────────────┤
│  Level 3: 资源延迟加载 (动态)            │
│  ├─ 执行时按需加载脚本和资源            │
│  ├─ 支持依赖解析                        │
│  └─ LRU缓存，TTL: 15分钟                │
└─────────────────────────────────────────┘
```

### 核心组件

#### 1. SkillsIndex（智能索引）

**职责**: 管理所有Skills的元数据索引

**关键特性**:
- 仅加载元数据（50 tokens）
- 支持基于关键词和语义的智能匹配
- 实现置信度评估机制
- 支持动态索引更新

**使用示例**:
```typescript
const index = new SkillsIndex({
  skillsRoot: './skills',
  defaultSearchLimit: 3,
  defaultConfidenceThreshold: 0.15
});

await index.buildIndex();
const results = await index.findRelevantSkills('计算器', {
  limit: 5,
  minConfidence: 0.7
});
```

#### 2. SkillsLoader（三级加载器）

**职责**: 协调元数据、指令和资源的加载

**关键特性**:
- 按需加载，避免全量加载
- 支持并发加载控制
- 多级缓存集成
- 异步加载优化

**使用示例**:
```typescript
const loader = new SkillsLoader(
  index,
  instructionLoader,
  resourceLoader,
  cache,
  { maxConcurrentLoads: 5 }
);

// 仅加载元数据
const skill = await loader.loadSkill('calculator');

// 加载元数据 + 内容
const skillWithContent = await loader.loadSkill('calculator', {
  includeContent: true
});

// 加载完整技能
const fullSkill = await loader.loadSkill('calculator', {
  includeContent: true,
  includeResources: true
});
```

#### 3. CodeGenerator（代码生成器）

**职责**: 将TypeScript代码编译为可执行的JavaScript

**关键特性**:
- 实时TypeScript编译
- 依赖分析和注入
- 安全验证
- 代码缓存

**使用示例**:
```typescript
const generator = new CodeGenerator({
  includeSourceMap: true
});

const code = await generator.generate(skillContent, {
  profiler: profilerInstance
});
```

#### 4. SkillsExecutionManager（执行管理器）

**职责**: 协调技能执行，选择适当的执行器

**关键特性**:
- 支持6种执行器类型
- 故障转移机制
- 执行指标收集
- 使用跟踪集成

**使用示例**:
```typescript
const manager = new SkillsExecutionManager(loader, {
  executors: {
    direct: directExecutor,
    service: serviceExecutor,
    // ...
  },
  usageTracker: usageTracker
});

const response = await manager.execute({
  skillName: 'calculator',
  parameters: { a: 10, b: 20 }
});
```

## 性能优化

### 缓存策略

#### 多级LRU缓存

```typescript
const cache = new SkillsCache({
  metadata: {
    maxSize: 256,
    ttl: 3600000 // 1小时
  },
  content: {
    maxSize: 32,
    ttl: 1800000 // 30分钟
  },
  resources: {
    maxSize: 16,
    ttl: 900000 // 15分钟
  }
});
```

#### 代码缓存

```typescript
const codeCache = new CodeCache({
  maxSize: 64,
  ttlMs: 3600000 // 1小时
});
```

### 智能预加载

```typescript
const preloadManager = new PreloadManager({
  loader: loader,
  usageTracker: usageTracker,
  strategy: new DefaultPreloadStrategy({
    enabled: true,
    interval: 5 * 60 * 1000, // 5分钟
    frequencyThreshold: 0.1, // 10%
    confidenceThreshold: 0.7, // 70%
    maxSkills: 10
  })
});

preloadManager.start();
```

### 内存管理

```typescript
const memoryManager = new MemoryManager({
  skillsCache: cache,
  codeCache: codeCache,
  usageTracker: usageTracker,
  config: {
    enabled: true,
    monitoringInterval: 30000, // 30秒
    maxMemoryMB: 500,
    autoCleanup: true,
    cleanupInterval: 5 * 60 * 1000 // 5分钟
  }
});

memoryManager.start();
```

## 执行器类型

### 1. DirectExecutor（直接执行器）

用于执行TypeScript代码，支持沙箱隔离。

**适用场景**:
- 计算类技能
- 数据处理
- 内部工具

### 2. ServiceExecutor（服务执行器）

通过HTTP/HTTPS调用外部服务。

**适用场景**:
- API集成
- 外部服务调用
- 微服务架构

### 3. DistributedExecutor（分布式执行器）

通过WebSocket与远程节点通信。

**适用场景**:
- 分布式计算
- 跨节点协作
- 负载均衡

### 4. StaticExecutor（静态执行器）

提供静态数据，支持模板和过滤。

**适用场景**:
- 配置数据
- 静态资源
- 预定义响应

### 5. PreprocessorExecutor（预处理器）

在消息处理流程中执行预处理。

**适用场景**:
- 消息预处理
- 数据转换
- 格式标准化

### 6. InternalExecutor（内部工具）

执行系统内部的辅助技能。

**适用场景**:
- 系统工具
- 内部API
- 管理功能

## 安全机制

### 代码安全验证

```typescript
const validator = new SecurityValidator();
const report = validator.audit(generatedCode);

if (!report.passed) {
  throw new SecurityValidationError('代码未通过安全审计');
}
```

### 沙箱执行

```typescript
const sandbox = new SandboxEnvironment({
  timeout: 5000,
  memoryLimitMb: 128
});

const result = await sandbox.execute(code, {
  args: parameters,
  context: executionContext
});
```

## 监控和指标

### 执行指标

```typescript
const stats = executionManager.getExecutionStats();
console.log(`总执行次数: ${stats.totalExecutions}`);
console.log(`成功率: ${stats.successfulExecutions / stats.totalExecutions * 100}%`);
console.log(`平均执行时间: ${stats.averageExecutionTime}ms`);
```

### 内存统计

```typescript
const memoryStats = memoryManager.getStats();
console.log(`当前内存使用: ${memoryStats.currentStats.heapUsed / 1024 / 1024}MB`);
console.log(`压力级别: ${memoryStats.pressureLevel.level}`);
console.log(`总清理次数: ${memoryStats.totalCleanups}`);
```

### 预加载统计

```typescript
const preloadStats = preloadManager.getStats();
console.log(`预加载总数: ${preloadStats.totalPreloads}`);
console.log(`预加载命中率: ${preloadStats.preloadHitRate * 100}%`);
```

## 配置优化

### 环境配置

```typescript
import { getPerformanceConfig } from './SkillsPerformanceConfig';

// 开发环境
const devConfig = getPerformanceConfig('development');

// 生产环境
const prodConfig = getPerformanceConfig('production');

// 高性能环境
const highPerfConfig = getPerformanceConfig('high-performance');

// 低资源环境
const lowResourceConfig = getPerformanceConfig('low-resource');
```

### 自定义配置

```typescript
import { mergePerformanceConfig, DEFAULT_PERFORMANCE_CONFIG } from './SkillsPerformanceConfig';

const customConfig = mergePerformanceConfig(DEFAULT_PERFORMANCE_CONFIG, {
  cache: {
    metadata: {
      maxSize: 512,
      ttl: 7200000 // 2小时
    }
  },
  preload: {
    maxSkills: 20
  }
});
```

## 性能目标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 元数据加载时间 | < 5s | 启动时加载所有元数据 |
| 内容加载时间 | < 100ms | 按需加载技能内容 |
| 资源加载时间 | < 200ms | 按需加载外部资源 |
| 缓存命中率 | > 80% | 多级缓存命中率 |
| 内存使用 | < 140MB | 优化后的内存占用 |
| Token使用减少 | ≥ 90% | 相比全量加载 |

## 扩展性

### 添加新执行器类型

```typescript
class CustomExecutor extends BaseSkillsExecutor {
  protected async executeSkill(
    request: ExecutionRequest,
    metadata?: SkillMetadata
  ): Promise<SkillExecutionOutcome> {
    // 实现自定义执行逻辑
  }
  
  protected async validateRequest(
    request: ExecutionRequest
  ): Promise<ValidationResult> {
    // 实现验证逻辑
  }
}
```

### 自定义预加载策略

```typescript
class CustomPreloadStrategy implements PreloadStrategy {
  analyzeUsagePatterns(records: SkillUsageRecord[]): UsagePattern[] {
    // 实现自定义分析逻辑
  }
  
  shouldPreload(pattern: UsagePattern, context: PreloadContext): boolean {
    // 实现自定义预加载决策
  }
  
  getPreloadPriority(patterns: UsagePattern[]): UsagePattern[] {
    // 实现自定义优先级排序
  }
}
```

## 最佳实践

1. **使用缓存**: 充分利用多级缓存系统，减少重复加载
2. **合理配置**: 根据环境选择合适的性能配置
3. **监控指标**: 定期检查执行指标和内存使用情况
4. **安全第一**: 始终启用代码安全验证和沙箱执行
5. **错误处理**: 实现完善的错误处理和回滚机制
6. **性能调优**: 根据实际使用情况调整缓存大小和TTL

## 故障排查

### 常见问题

1. **内存使用过高**
   - 检查缓存配置是否合理
   - 启用内存管理器
   - 调整清理间隔

2. **缓存命中率低**
   - 增加缓存大小
   - 延长TTL
   - 启用智能预加载

3. **执行速度慢**
   - 检查代码缓存是否启用
   - 优化技能代码
   - 调整并发加载数

## 参考资料

- [Skills格式规范](./SKILLS_FORMAT.md)
- [开发者迁移指南](./MIGRATION_GUIDE.md)
- [最佳实践指南](./BEST_PRACTICES.md)
- [API文档](./API.md)

