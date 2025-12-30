# PlaybookMatcher 重构功能设计文档

**文档编号**: FD-002
**版本**: 1.0.0
**创建日期**: 2025-12-30
**关联需求**: R-002
**状态**: 待评审

---

## 1. 概述

### 1.1 背景说明

PlaybookMatcher 是 Playbook 推荐系统的核心组件，当前文件 `src/services/PlaybookMatcher.ts` 包含 1326 行代码，违反单一职责原则，同时处理向量检索、相似度匹配、动态类型匹配、推荐序列生成和知识库维护等多重职责。

### 1.2 重构目标

1. 将 1326 行代码拆分为 6 个高内聚模块
2. 实现评分算法的可测试性
3. 分离知识库维护逻辑与核心匹配逻辑
4. 统一类型定义，消除重复
5. 保持公共 API 不变

### 1.3 参考标准

- 单个文件不超过 500 行
- 单一职责原则：每个类/模块只有一个变更理由
- 方法不超过 50 行（特殊情况不超过 100 行）
- 单元测试覆盖率不低于 80%

---

## 2. 目标结构

### 2.1 目录结构

```
src/services/playbook/
├── PlaybookMatcher.ts           # 主协调器 (200行)
├── PlaybookMatcher.types.ts     # 类型定义 (100行)
├── ScoreCalculator.ts           # 评分计算器 (200行)
├── DynamicTypeMatcher.ts        # 动态类型匹配 (250行)
├── SequenceRecommender.ts       # 序列推荐 (200行)
├── PlaybookCurator.ts           # Stage 3: 知识库维护 (250行)
└── index.ts                     # 统一导出
```

### 2.2 架构图

```
                    +-------------------+
                    |  PlaybookMatcher  |
                    |   (主协调器)       |
                    +-------------------+
                             |
              +--------------+--------------+--------------+
              |              |              |              |
              v              v              v              v
     +----------------+ +----------------+ +----------------+ +----------------+
     | ScoreCalculator| |DynamicTypeMatcher| |SequenceRecommender| | PlaybookCurator|
     +----------------+ +----------------+ +----------------+ +----------------+
              |              |              |
              |              |              |
              v              v              v
     +----------------+ +----------------+ +----------------+
     |  ToolRetrieval | |TypeVocabulary | |   Playbook     |
     |    Service     | |   Service     | |   Repository   |
     +----------------+ +----------------+ +----------------+
```

---

## 3. 职责划分

### 3.1 模块职责表

| 模块文件 | 职责描述 | 预估行数 | 依赖 |
|----------|----------|----------|------|
| PlaybookMatcher.ts | 主协调器，公共 API，调用各子模块协调工作 | 200 | ScoreCalculator, DynamicTypeMatcher, SequenceRecommender, PlaybookCurator |
| PlaybookMatcher.types.ts | 所有类型定义，包括 MatchingContext, PlaybookMatch 等 | 100 | - |
| ScoreCalculator.ts | 统一评分算法：calculateMatchScore, calculateMultiTagMatchScore, calculateSimilarityScore | 200 | ToolRetrievalService |
| DynamicTypeMatcher.ts | 动态类型匹配：extractTypeSignals, matchTypes, resolveTypeHierarchy | 250 | TypeVocabularyService |
| SequenceRecommender.ts | Playbook 序列推荐：recommendSequence, buildDependencyGraph | 200 | ScoreCalculator |
| PlaybookCurator.ts | 知识库维护：maintainPlaybookKnowledgeBase, findDuplicates, mergePlaybooks | 250 | LLMManager, SimilarityService |

### 3.2 方法迁移表

| 原始方法 | 新位置 | 迁移类型 |
|----------|--------|----------|
| matchPlaybooks() | PlaybookMatcher.ts | 保留 |
| findSimilarPlaybooks() | PlaybookMatcher.ts | 保留 |
| recommendPlaybookSequence() | PlaybookMatcher.ts | 保留 |
| calculateMatchScore() | ScoreCalculator.ts | 迁移 |
| calculateMultiTagMatchScore() | ScoreCalculator.ts | 迁移 |
| calculateSimilarityScore() | ScoreCalculator.ts | 迁移 |
| matchPlaybooksDynamic() | DynamicTypeMatcher.ts | 迁移 |
| extractTypeSignals() | DynamicTypeMatcher.ts | 迁移 |
| resolveTypeHierarchy() | DynamicTypeMatcher.ts | 迁移 |
| buildSequenceRecommendation() | SequenceRecommender.ts | 迁移 |
| buildDependencyGraph() | SequenceRecommender.ts | 迁移 |
| maintainPlaybookKnowledgeBase() | PlaybookCurator.ts | 迁移 |
| findDuplicates() | PlaybookCurator.ts | 迁移 |
| mergePlaybooks() | PlaybookCurator.ts | 迁移 |

---

## 4. 详细类型设计

### 4.1 核心类型定义 (PlaybookMatcher.types.ts)

```typescript
// ==================== 匹配上下文 ====================

/**
 * Playbook 匹配上下文
 */
export interface MatchingContext {
  /** 用户查询 */
  query: string;
  /** 可用的 playbook ID 列表 */
  availablePlaybookIds: string[];
  /** 匹配的元数据 */
  metadata?: Record<string, unknown>;
  /** 匹配配置 */
  config?: PlaybookRecommendationConfig;
}

/**
 * 遗留匹配上下文（兼容性）
 */
export interface LegacyMatchingContext {
  query: string;
  availablePlaybooks: string[];
  metadata?: Record<string, unknown>;
}

// ==================== 匹配结果 ====================

/**
 * Playbook 匹配结果
 */
export interface PlaybookMatch {
  /** Playbook ID */
  playbookId: string;
  /** 匹配分数 (0-1) */
  score: number;
  /** 匹配原因描述 */
  reason: string;
  /** 匹配类型标签 */
  matchType: MatchType;
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 置信度 */
  confidence: number;
}

/**
 * 匹配类型枚举
 */
export enum MatchType {
  EXACT = 'exact',
  SIMILAR = 'similar',
  RELATED = 'related',
  DYNAMIC = 'dynamic',
  RECOMMENDED = 'recommended',
}

/**
 * 匹配结果排序选项
 */
export interface MatchSortingOptions {
  /** 排序字段 */
  field: 'score' | 'confidence' | 'relevance';
  /** 排序方向 */
  order: 'asc' | 'desc';
}

// ==================== 推荐配置 ====================

/**
 * Playbook 推荐配置
 */
export interface PlaybookRecommendationConfig {
  /** 最大返回数量 */
  maxResults?: number;
  /** 最小分数阈值 */
  minScore?: number;
  /** 启用动态类型匹配 */
  enableDynamicTypeMatching?: boolean;
  /** 启用序列推荐 */
  enableSequenceRecommendation?: boolean;
  /** 类型信号权重 */
  typeSignalWeight?: number;
  /** 相似度权重 */
  similarityWeight?: number;
}

// ==================== 序列推荐 ====================

/**
 * 序列推荐结果
 */
export interface SequenceResult {
  /** 推荐序列 */
  sequence: PlaybookSequence;
  /** 执行顺序理由 */
  reasoning: string;
  /** 依赖关系图 */
  dependencyGraph: DependencyGraph;
}

/**
 * Playbook 序列
 */
export interface PlaybookSequence {
  /** 序列 ID */
  id: string;
  /** 包含的 playbook IDs */
  playbookIds: string[];
  /** 推荐的执行顺序 */
  executionOrder: string[];
  /** 预期结果 */
  expectedOutcome: string;
}

/**
 * 依赖关系图
 */
export interface DependencyGraph {
  /** 节点列表 */
  nodes: DependencyNode[];
  /** 边列表 */
  edges: DependencyEdge[];
}

/**
 * 依赖节点
 */
export interface DependencyNode {
  /** Playbook ID */
  playbookId: string;
  /** 层级 */
  level: number;
  /** 依赖数量 */
  dependencyCount: number;
}

/**
 * 依赖边
 */
export interface DependencyEdge {
  /** 源 Playbook ID */
  from: string;
  /** 目标 Playbook ID */
  to: string;
  /** 依赖类型 */
  type: DependencyType;
}

/**
 * 依赖类型枚举
 */
export enum DependencyType {
  PREREQUISITE = 'prerequisite',
  SEQUENTIAL = 'sequential',
  ALTERNATIVE = 'alternative',
  ENHANCES = 'enhances',
}

// ==================== 动态类型匹配 ====================

/**
 * 类型信号
 */
export interface TypeSignal {
  /** 信号类型 */
  type: string;
  /** 信号值 */
  value: string | number | boolean;
  /** 置信度 */
  confidence: number;
  /** 来源 */
  source: string;
}

/**
 * 类型匹配配置
 */
export interface TypeMatchingConfig {
  /** 启用类型推断 */
  enableInference: boolean;
  /** 最大推断深度 */
  maxInferenceDepth: number;
  /** 类型匹配阈值 */
  threshold: number;
}

// ==================== 知识库维护 ====================

/**
 * 知识库维护结果
 */
export interface CuratorResult {
  /** 新增的 playbook 数量 */
  addedCount: number;
  /** 合并的 playbook 数量 */
  mergedCount: number;
  /** 删除的 playbook 数量 */
  deletedCount: number;
  /** 发现的重复项 */
  duplicates: DuplicateInfo[];
  /** 操作详情 */
  details: string[];
}

/**
 * 重复信息
 */
export interface DuplicateInfo {
  /** Playbook ID */
  playbookId: string;
  /** 重复的 playbook ID */
  duplicateId: string;
  /** 相似度 */
  similarity: number;
  /** 建议操作 */
  suggestedAction: 'keep' | 'merge' | 'delete';
}

// ==================== 工具检索结果 ====================

/**
 * 工具检索结果
 */
export interface ToolRetrievalResult {
  /** 工具/技能 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 相似度分数 */
  score: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}
```

---

## 5. 接口定义

### 5.1 PlaybookMatcher 接口

```typescript
/**
 * PlaybookMatcher 主接口
 */
export interface IPlaybookMatcher {
  /**
   * 匹配 Playbook
   * @param context 匹配上下文
   * @param config 推荐配置（可选）
   * @returns 匹配结果数组
   */
  matchPlaybooks(
    context: MatchingContext,
    config?: PlaybookRecommendationConfig
  ): Promise<PlaybookMatch[]>;

  /**
   * 查找相似的 Playbook
   * @param playbookId 基准 Playbook ID
   * @param limit 返回数量限制
   * @returns 相似 Playbook 列表
   */
  findSimilarPlaybooks(playbookId: string, limit?: number): Promise<PlaybookMatch[]>;

  /**
   * 推荐 Playbook 序列
   * @param context 匹配上下文
   * @param targetOutcome 目标结果描述
   * @returns 序列推荐结果
   */
  recommendPlaybookSequence(
    context: MatchingContext,
    targetOutcome: string
  ): Promise<SequenceResult>;
}
```

### 5.2 ScoreCalculator 接口

```typescript
/**
 * 评分计算器接口
 */
export interface IScoreCalculator {
  /**
   * 计算 Playbook 匹配分数
   * @param playbook Playbook 数据
   * @param context 匹配上下文
   * @returns 匹配结果
   */
  calculateMatchScore(
    playbook: Record<string, unknown>,
    context: MatchingContext
  ): Promise<PlaybookMatch>;

  /**
   * 计算相似度分数
   * @param playbook Playbook 数据
   * @param target 目标内容
   * @returns 匹配结果
   */
  calculateSimilarityScore(
    playbook: Record<string, unknown>,
    target: string
  ): Promise<PlaybookMatch>;

  /**
   * 计算多标签匹配分数
   * @param playbook Playbook 数据
   * @param context 匹配上下文
   * @param signals 类型信号数组
   * @returns 匹配结果
   */
  calculateMultiTagMatchScore(
    playbook: Record<string, unknown>,
    context: MatchingContext,
    signals: TypeSignal[]
  ): Promise<PlaybookMatch>;
}
```

### 5.3 DynamicTypeMatcher 接口

```typescript
/**
 * 动态类型匹配器接口
 */
export interface IDynamicTypeMatcher {
  /**
   * 匹配 Playbook（动态类型）
   * @param context 匹配上下文
   * @param config 推荐配置
   * @returns 匹配结果数组
   */
  matchPlaybooksDynamic(
    context: MatchingContext,
    config: PlaybookRecommendationConfig
  ): Promise<PlaybookMatch[]>;

  /**
   * 提取类型信号
   * @param query 用户查询
   * @returns 类型信号数组
   */
  extractTypeSignals(query: string): Promise<TypeSignal[]>;

  /**
   * 解析类型层次结构
   * @param typeName 类型名称
   * @returns 父类型列表
   */
  resolveTypeHierarchy(typeName: string): Promise<string[]>;

  /**
   * 计算类型兼容性
   * @param sourceType 源类型
   * @param targetType 目标类型
   * @returns 兼容性分数
   */
  calculateTypeCompatibility(sourceType: string, targetType: string): Promise<number>;
}
```

### 5.4 SequenceRecommender 接口

```typescript
/**
 * 序列推荐器接口
 */
export interface ISequenceRecommender {
  /**
   * 推荐执行序列
   * @param context 匹配上下文
   * @param targetOutcome 目标结果
   * @returns 序列推荐结果
   */
  recommendSequence(
    context: MatchingContext,
    targetOutcome: string
  ): Promise<SequenceResult>;

  /**
   * 构建依赖关系图
   * @param playbookIds Playbook ID 列表
   * @returns 依赖关系图
   */
  buildDependencyGraph(playbookIds: string[]): Promise<DependencyGraph>;

  /**
   * 计算最优执行顺序
   * @param graph 依赖关系图
   * @param targetOutcome 目标结果
   * @returns 执行顺序
   */
  calculateOptimalOrder(
    graph: DependencyGraph,
    targetOutcome: string
  ): Promise<string[]>;
}
```

### 5.5 PlaybookCurator 接口

```typescript
/**
 * Playbook Curator 接口
 */
export interface IPlaybookCurator {
  /**
   * 维护知识库
   * @param playbooks Playbook 列表
   * @returns 维护结果
   */
  maintainPlaybookKnowledgeBase(
    playbooks: Record<string, unknown>[]
  ): Promise<CuratorResult>;

  /**
   * 查找重复项
   * @param playbooks Playbook 列表
   * @returns 重复信息列表
   */
  findDuplicates(
    playbooks: Record<string, unknown>[]
  ): Promise<DuplicateInfo[]>;

  /**
   * 合并重复的 Playbook
   * @param primaryId 主 Playbook ID
   * @param duplicateIds 重复 Playbook ID 列表
   * @returns 合并后的 Playbook
   */
  mergePlaybooks(
    primaryId: string,
    duplicateIds: string[]
  ): Promise<Record<string, unknown>>;

  /**
   * 归档不活跃的 Playbook
   * @param daysInactive 不活跃天数阈值
   * @returns 归档的 Playbook 数量
   */
  archiveInactivePlaybooks(daysInactive: number): Promise<number>;
}
```

---

## 6. 依赖关系

### 6.1 外部依赖

```typescript
// PlaybookMatcher.ts
import { ToolRetrievalService } from './ToolRetrievalService';
import { LLMManager } from '../core/LLMManager';
import { TypeVocabularyService } from './TypeVocabularyService';
import { SimilarityService } from './SimilarityService';
```

### 6.2 内部依赖图

```
PlaybookMatcher
    |
    +---> ScoreCalculator
    |         |
    |         +---> ToolRetrievalService (向量检索)
    |
    +---> DynamicTypeMatcher
    |         |
    |         +---> TypeVocabularyService (类型词汇表)
    |
    +---> SequenceRecommender
    |         |
    |         +---> ScoreCalculator (评分计算)
    |
    +---> PlaybookCurator
              |
              +---> LLMManager (LLM调用)
              +---> SimilarityService (相似度服务)
```

### 6.3 依赖注入设计

```typescript
/**
 * PlaybookMatcher 构造函数依赖注入
 */
export class PlaybookMatcher implements IPlaybookMatcher {
  constructor(
    private readonly scoreCalculator: IScoreCalculator,
    private readonly dynamicTypeMatcher: IDynamicTypeMatcher,
    private readonly sequenceRecommender: ISequenceRecommender,
    private readonly curator: IPlaybookCurator,
    private readonly similarityService?: SimilarityService
  ) {}

  async matchPlaybooks(
    context: MatchingContext,
    config?: PlaybookRecommendationConfig
  ): Promise<PlaybookMatch[]> {
    // 优先使用动态类型匹配
    if (config?.enableDynamicTypeMatching) {
      return this.dynamicTypeMatcher.matchPlaybooksDynamic(context, config);
    }

    // 使用标准评分匹配
    const playbooks = await this.retrievePlaybooks(context);
    const results = await Promise.all(
      playbooks.map(p => this.scoreCalculator.calculateMatchScore(p, context))
    );

    // 过滤和排序
    return this.filterAndSortResults(results, config);
  }

  async findSimilarPlaybooks(playbookId: string, limit?: number): Promise<PlaybookMatch[]> {
    const playbook = await this.getPlaybookById(playbookId);
    const similarPlaybooks = await this.similarityService?.findSimilar(playbook, limit);

    if (!similarPlaybooks) {
      return [];
    }

    return similarPlaybooks.map(result => ({
      playbookId: result.id,
      score: result.score,
      reason: 'Similar content',
      matchType: MatchType.SIMILAR,
      confidence: result.score,
    }));
  }

  async recommendPlaybookSequence(
    context: MatchingContext,
    targetOutcome: string
  ): Promise<SequenceResult> {
    // 获取匹配的 Playbook
    const matches = await this.matchPlaybooks(context, {
      enableSequenceRecommendation: true,
      maxResults: 10,
    });

    const playbookIds = matches.map(m => m.playbookId);
    return this.sequenceRecommender.recommendSequence(context, targetOutcome);
  }

  // 私有辅助方法
  private async retrievePlaybooks(context: MatchingContext): Promise<Record<string, unknown>[]> {
    // 从 ToolRetrievalService 检索 Playbook
    return [];
  }

  private filterAndSortResults(
    results: PlaybookMatch[],
    config?: PlaybookRecommendationConfig
  ): PlaybookMatch[] {
    // 过滤低于阈值的匹配
    // 按分数排序
    // 限制返回数量
    return results;
  }

  private async getPlaybookById(id: string): Promise<Record<string, unknown>> {
    return {};
  }
}
```

---

## 7. 迁移步骤

### 7.1 阶段一：创建类型定义

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 1.1 | 创建 `PlaybookMatcher.types.ts` 文件 | 1h | 文件创建成功 |
| 1.2 | 迁移所有类型定义 | 2h | 编译通过 |
| 1.3 | 添加类型别名兼容层 | 1h | 旧类型引用正常 |

### 7.2 阶段二：创建子模块

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 2.1 | 创建 `ScoreCalculator.ts` 并迁移评分方法 | 4h | 评分功能独立测试通过 |
| 2.2 | 创建 `DynamicTypeMatcher.ts` 并迁移类型匹配方法 | 6h | 动态类型匹配功能通过 |
| 2.3 | 创建 `SequenceRecommender.ts` 并迁移序列推荐方法 | 4h | 序列推荐功能通过 |
| 2.4 | 创建 `PlaybookCurator.ts` 并迁移知识库维护方法 | 6h | 知识库维护功能通过 |

### 7.3 阶段三：重构主服务

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 3.1 | 重构 `PlaybookMatcher.ts` 主服务 | 3h | 不超过 200 行 |
| 3.2 | 实现依赖注入 | 2h | 编译通过 |
| 3.3 | 创建 `index.ts` 统一导出 | 1h | 导出正确 |

### 7.4 阶段四：验证与测试

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 4.1 | 运行现有测试 | 1h | 测试通过 |
| 4.2 | 补充单元测试 | 4h | 覆盖率 80%+ |
| 4.3 | 集成测试验证 | 2h | 功能正常 |

### 7.5 总工时

| 阶段 | 预计工时 |
|------|----------|
| 阶段一：类型定义 | 4h |
| 阶段二：子模块 | 20h |
| 阶段三：主服务 | 6h |
| 阶段四：验证测试 | 7h |
| **合计** | **37h (约 1 周)** |

---

## 8. 验收标准

### 8.1 代码质量标准

- [ ] PlaybookMatcher 不超过 200 行
- [ ] ScoreCalculator 不超过 200 行
- [ ] DynamicTypeMatcher 不超过 250 行
- [ ] SequenceRecommender 不超过 200 行
- [ ] PlaybookCurator 不超过 250 行
- [ ] 消除所有 `any` 类型
- [ ] 重复代码率低于 5%

### 8.2 功能验收标准

- [ ] `matchPlaybooks()` API 行为 100% 一致
- [ ] `findSimilarPlaybooks()` API 行为 100% 一致
- [ ] `recommendPlaybookSequence()` API 行为 100% 一致
- [ ] 动态类型匹配功能正常
- [ ] 知识库维护功能正常

### 8.3 测试标准

- [ ] 单元测试覆盖率不低于 80%
- [ ] 核心评分算法有独立测试
- [ ] 动态类型匹配有独立测试
- [ ] 序列推荐有独立测试

### 8.4 兼容性标准

- [ ] 保持公共 API 不变
- [ ] 保持 `MatchingContext` 类型兼容
- [ ] 保持 `PlaybookMatch` 类型兼容
- [ ] TypeScript 编译无错误
- [ ] 现有功能 100% 正常

---

## 9. 风险与缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 改动影响 Playbook 推荐准确性 | 高 | 中 | 建立功能测试基准，自动化回归测试 |
| 改动影响 ChatService.playbookMatcher | 中 | 低 | 保持公共 API 不变，渐进式迁移 |
| 类型变更导致编译错误 | 低 | 低 | 提供类型别名兼容层 |
| 评分算法行为差异 | 高 | 低 | 逐方法对比测试，确保行为一致 |

---

## 10. 附录

### 10.1 术语表

| 术语 | 定义 |
|------|------|
| Playbook | 可复用的操作手册，包含步骤和决策点 |
| Curator | 知识库维护者，负责去重、归档等 |
| Type Signal | 类型信号，用于动态类型推断 |
| Dependency Graph | 依赖关系图，表示 Playbook 之间的依赖关系 |

### 10.2 变更记录

| 版本 | 日期 | 作者 | 描述 |
|------|------|------|------|
| 1.0.0 | 2025-12-30 | - | 初始版本 |

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-30
**状态**: 评审通过
