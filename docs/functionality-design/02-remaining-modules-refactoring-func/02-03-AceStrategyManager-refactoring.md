# AceStrategyManager 重构功能设计文档

**文档编号**: FD-004
**版本**: 1.0.0
**创建日期**: 2025-12-30
**关联需求**: R-002
**状态**: 已评审

---

## 1. 概述

### 1.1 背景说明

AceStrategyManager 是 ACE 战略引擎的核心组件，当前文件 `src/services/AceStrategyManager.ts` 包含 1062 行代码，内部深度实例化 PlaybookManager 和 PlaybookMatcher，导致与 Playbook 系统紧耦合，且内存管理逻辑与业务逻辑混合。

### 1.2 重构目标

1. 将 1062 行代码拆分为 5 个高内聚模块
2. 将内部实例化的 Playbook 系统改为依赖注入
3. 分离内存管理逻辑
4. 保持公共 API 不变

### 1.3 关键决策

- AceStrategyManager 内部实例化的 PlaybookManager 和 PlaybookMatcher 改为**依赖注入**
- 不引入依赖注入容器，使用手动依赖注入

### 1.4 参考标准

- 单个文件不超过 500 行
- 单一职责原则：每个类/模块只有一个变更理由
- 方法不超过 50 行（特殊情况不超过 100 行）
- 单元测试覆盖率不低于 80%

---

## 2. 目标结构

### 2.1 目录结构

```
src/services/ace/
├── AceStrategyManager.ts        # 主管理器 (250行)
├── StrategicContextManager.ts   # 战略上下文管理 (200行)
├── WorldModelUpdater.ts         # 世界模型更新 (200行)
├── PlaybookSynthesis.ts         # Playbook 自动提炼 (250行)
├── MemoryManager.ts             # 内存管理 (150行)
├── types.ts                     # 类型定义 (100行)
└── index.ts                     # 统一导出
```

### 2.2 架构图

```
                    +----------------------+
                    |   AceStrategyManager |
                    |      (主协调器)       |
                    +----------------------+
                             |
    +------------------------+------------------------+
    |                        |                        |
    v                        v                        v
+-----------------+  +-----------------+  +-----------------+
|StrategicContext |  | WorldModelUpdater|  |MemoryManager    |
|    Manager      |  +-----------------+  +-----------------+
+-----------------+          |
                             |
                             v
                    +-----------------+
                    |PlaybookSynthesis|
                    +-----------------+
                             |
                             v
                    +-----------------+
                    |  PlaybookManager| (依赖注入)
                    |  PlaybookMatcher| (依赖注入)
                    +-----------------+
```

---

## 3. 职责划分

### 3.1 模块职责表

| 模块文件 | 职责描述 | 预估行数 | 依赖 |
|----------|----------|----------|------|
| AceStrategyManager.ts | 主协调器，公共 API，内存管理协调 | 250 | StrategicContextManager, WorldModelUpdater, PlaybookSynthesis, MemoryManager, PlaybookManager (DI), PlaybookMatcher (DI) |
| StrategicContextManager.ts | 战略上下文加载、更新、保存 | 200 | LLMManager, VariableEngine |
| WorldModelUpdater.ts | 世界模型更新逻辑，战略学习存储 | 200 | LLMManager, PlaybookManager |
| PlaybookSynthesis.ts | Playbook 自动提炼（成功/失败） | 250 | LLMManager, PlaybookManager, PlaybookMatcher |
| MemoryManager.ts | TTL 缓存管理，定期清理任务 | 150 | - |
| types.ts | 类型定义 | 100 | - |

### 3.2 方法迁移表

| 原始方法 | 新位置 | 迁移类型 |
|----------|--------|----------|
| loadStrategicContext() | StrategicContextManager.ts | 迁移 |
| updateStrategicGoals() | StrategicContextManager.ts | 迁移 |
| loadCurrentWorldView() | StrategicContextManager.ts | 迁移 |
| updateWorldModel() | WorldModelUpdater.ts | 迁移 |
| storeStrategicLearning() | WorldModelUpdater.ts | 迁移 |
| updateWorldModelFromLearning() | WorldModelUpdater.ts | 迁移 |
| extractPlaybookFromLearning() | PlaybookSynthesis.ts | 迁移 |
| extractFailurePlaybookFromLearning() | PlaybookSynthesis.ts | 迁移 |
| buildExtractionPrompt() | PlaybookSynthesis.ts | 迁移 |
| startPeriodicCleanup() | MemoryManager.ts | 迁移 |
| cleanupExpiredContexts() | MemoryManager.ts | 迁移 |
| startStrategicLearningCollection() | WorldModelUpdater.ts | 迁移 |

---

## 4. 详细类型设计

### 4.1 核心类型定义 (types.ts)

```typescript
// ==================== 战略上下文 ====================

/**
 * 战略上下文
 */
export interface StrategicContext {
  /** 用户 ID */
  userId: string;
  /** 当前世界模型 */
  worldView: string;
  /** 战略目标 */
  strategicGoals: string[];
  /** 已学习的策略 */
  learnedStrategies: StrategicLearning[];
  /** 最后更新时间 */
  lastUpdated: Date;
  /** 过期时间 */
  expiresAt: Date;
}

/**
 * 战略目标
 */
export interface StrategicGoal {
  /** 目标 ID */
  id: string;
  /** 目标描述 */
  description: string;
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
  /** 状态 */
  status: 'active' | 'achieved' | 'abandoned';
  /** 创建时间 */
  createdAt: Date;
}

/**
 * 世界视图
 */
export interface WorldView {
  /** 环境状态描述 */
  environmentState: string;
  /** 可用资源 */
  availableResources: string[];
  /** 约束条件 */
  constraints: string[];
  /** 假设 */
  assumptions: string[];
}

// ==================== 战略学习 ====================

/**
 * 战略学习结果
 */
export interface LearningOutcome {
  /** 会话 ID */
  sessionId: string;
  /** 用户 ID */
  userId: string;
  /** 成功标志 */
  success: boolean;
  /** 策略描述 */
  strategyDescription: string;
  /** 执行结果摘要 */
  resultSummary: string;
  /** 提取的洞察 */
  extractedInsights: string[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 时间戳 */
  timestamp: Date;
}

/**
 * 战略学习
 */
export interface StrategicLearning {
  /** 学习 ID */
  id: string;
  /** 来源会话 */
  sessionId: string;
  /** 策略描述 */
  strategy: string;
  /** 成功/失败 */
  success: boolean;
  /** 关键洞察 */
  keyInsights: string[];
  /** 应用场景 */
  applicableScenarios: string[];
  /** 置信度 */
  confidence: number;
  /** 创建时间 */
  createdAt: Date;
}

// ==================== Playbook 提炼 ====================

/**
 * 战略 Playbook
 */
export interface StrategicPlaybook {
  /** Playbook ID */
  id: string;
  /** 名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 触发条件 */
  triggerConditions: string[];
  /** 执行步骤 */
  steps: PlaybookStep[];
  /** 预期结果 */
  expectedOutcome: string;
  /** 成功率 */
  successRate: number;
  /** 学习来源 */
  learningSource: string;
  /** 创建时间 */
  createdAt: Date;
}

/**
 * Playbook 步骤
 */
export interface PlaybookStep {
  /** 步骤序号 */
  stepNumber: number;
  /** 步骤描述 */
  description: string;
  /** 执行条件 */
  condition?: string;
  /** 预期结果 */
  expectedResult: string;
}

/**
 * Playbook 提炼配置
 */
export interface SynthesisConfig {
  /** 最大步骤数 */
  maxSteps: number;
  /** 最小置信度阈值 */
  minConfidence: number;
  /** 启用失败案例提炼 */
  enableFailureExtraction: boolean;
  /** LLM 模型 */
  model?: string;
}

// ==================== 内存管理 ====================

/**
 * 缓存条目
 */
export interface CacheEntry<T> {
  /** 数据 */
  data: T;
  /** 创建时间 */
  createdAt: Date;
  /** 过期时间 */
  expiresAt: Date;
  /** 访问次数 */
  accessCount: number;
  /** 最后访问时间 */
  lastAccessedAt: Date;
}

/**
 * 内存配置
 */
export interface MemoryConfig {
  /** 上下文 TTL（毫秒） */
  contextTTL: number;
  /** 世界模型 TTL（毫秒） */
  worldModelTTL: number;
  /** 战略学习 TTL（毫秒） */
  learningTTL: number;
  /** 清理间隔（毫秒） */
  cleanupInterval: number;
  /** 最大缓存条目数 */
  maxEntries: number;
}

/**
 * 清理统计
 */
export interface CleanupStats {
  /** 清理时间 */
  cleanedAt: Date;
  /** 移除的条目数 */
  removedCount: number;
  /** 当前缓存大小 */
  currentSize: number;
  /** 清理耗时（毫秒） */
  duration: number;
}

// ==================== 服务状态 ====================

/**
 * 服务状态
 */
export interface ServiceStatus {
  /** 是否已初始化 */
  initialized: boolean;
  /** 缓存状态 */
  cacheStatus: {
    contextCount: number;
    worldModelCount: number;
    learningCount: number;
  };
  /** 最后清理时间 */
  lastCleanup?: Date;
  /** 健康状态 */
  healthy: boolean;
}

// ==================== 检索配置 ====================

/**
 * 战略知识检索配置
 */
export interface StrategicRetrievalConfig {
  /** 最大返回数量 */
  maxResults: number;
  /** 最小相似度阈值 */
  minSimilarity: number;
  /** 启用过滤 */
  enableFiltering: boolean;
  /** 过滤条件 */
  filters?: StrategicRetrievalFilter[];
}

/**
 * 战略检索过滤条件
 */
export interface StrategicRetrievalFilter {
  /** 字段名 */
  field: 'success' | 'confidence' | 'applicableScenarios';
  /** 操作符 */
  operator: 'eq' | 'gt' | 'lt' | 'contains';
  /** 值 */
  value: unknown;
}
```

---

## 5. 接口定义

### 5.1 AceStrategyManager 接口

```typescript
/**
 * AceStrategyManager 主接口
 */
export interface IAceStrategyManager {
  /**
   * 加载战略上下文
   * @param userId 用户 ID
   * @returns 战略上下文
   */
  loadStrategicContext(userId: string): Promise<string>;

  /**
   * 更新世界模型
   * @param sessionId 会话 ID
   * @param outcome 学习结果
   */
  updateWorldModel(sessionId: string, outcome: LearningOutcome): Promise<void>;

  /**
   * 检索战略知识
   * @param query 查询文本
   * @param userId 用户 ID（可选）
   * @returns 检索结果
   */
  retrieveStrategicKnowledge(
    query: string,
    userId?: string
  ): Promise<string[]>;

  /**
   * 启动战略学习收集
   * @param sessionId 会话 ID
   */
  startStrategicLearningCollection(sessionId: string): Promise<void>;

  /**
   * 获取服务状态
   * @returns 服务状态
   */
  getStatus(): ServiceStatus;
}
```

### 5.2 StrategicContextManager 接口

```typescript
/**
 * 战略上下文管理器接口
 */
export interface IStrategicContextManager {
  /**
   * 加载战略上下文
   * @param userId 用户 ID
   * @returns 战略上下文
   */
  loadContext(userId: string): Promise<StrategicContext | null>;

  /**
   * 保存战略上下文
   * @param context 战略上下文
   */
  saveContext(context: StrategicContext): Promise<void>;

  /**
   * 更新战略目标
   * @param userId 用户 ID
   * @param goals 新的目标列表
   */
  updateGoals(userId: string, goals: StrategicGoal[]): Promise<void>;

  /**
   * 加载当前世界视图
   * @param userId 用户 ID
   * @returns 世界视图
   */
  loadWorldView(userId: string): Promise<string>;

  /**
   * 检查上下文是否过期
   * @param context 战略上下文
   * @returns 是否过期
   */
  isExpired(context: StrategicContext): boolean;
}
```

### 5.3 WorldModelUpdater 接口

```typescript
/**
 * 世界模型更新器接口
 */
export interface IWorldModelUpdater {
  /**
   * 更新世界模型
   * @param userId 用户 ID
   * @param outcome 学习结果
   */
  updateModel(userId: string, outcome: LearningOutcome): Promise<void>;

  /**
   * 存储战略学习
   * @param learning 战略学习
   */
  storeLearning(learning: StrategicLearning): Promise<void>;

  /**
   * 从学习结果更新世界模型
   * @param outcome 学习结果
   * @returns 更新后的世界视图
   */
  updateFromLearning(outcome: LearningOutcome): Promise<string>;

  /**
   * 获取世界视图
   * @param userId 用户 ID
   * @returns 世界视图字符串
   */
  getWorldView(userId: string): Promise<string>;

  /**
   * 查询相似学习
   * @param query 查询文本
   * @param userId 用户 ID
   * @returns 相似学习列表
   */
  findSimilarLearnings(
    query: string,
    userId: string
  ): Promise<StrategicLearning[]>;
}
```

### 5.4 PlaybookSynthesis 接口

```typescript

/**
 * Playbook 合成器接口
 */
export interface IPlaybookSynthesis {
  /**
   * 从成功案例提炼 Playbook
   * @param learning 学习结果
   * @param sessionId 会话 ID
   * @returns 提炼的 Playbook
   */
  extractFromSuccess(
    learning: LearningOutcome,
    sessionId: string
  ): Promise<StrategicPlaybook>;

  /**
   * 从失败案例提炼 Playbook
   * @param learning 学习结果
   * @param sessionId 会话 ID
   * @returns 提炼的 Playbook
   */
  extractFromFailure(
    learning: LearningOutcome,
    sessionId: string
  ): Promise<StrategicPlaybook>;

  /**
   * 构建提炼提示
   * @param learning 学习结果
   * @param context 上下文
   * @returns 提示文本
   */
  buildExtractionPrompt(
    learning: LearningOutcome,
    context: string
  ): string;

  /**
   * 保存提炼的 Playbook
   * @param playbook 战略 Playbook
   * @returns Playbook ID
   */
  savePlaybook(playbook: StrategicPlaybook): Promise<string>;
}
```

### 5.5 MemoryManager 接口

```typescript
/**
 * 内存管理器接口
 */
export interface IMemoryManager {
  /**
   * 获取缓存条目
   * @param key 缓存键
   * @returns 缓存条目
   */
  get<T>(key: string): Promise<CacheEntry<T> | null>;

  /**
   * 设置缓存条目
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（毫秒）
   */
  set<T>(key: string, value: T, ttl: number): Promise<void>;

  /**
   * 删除缓存条目
   * @param key 缓存键
   */
  delete(key: string): Promise<void>;

  /**
   * 清理过期条目
   * @returns 清理统计
   */
  cleanup(): Promise<CleanupStats>;

  /**
   * 启动定期清理任务
   */
  startPeriodicCleanup(): void;

  /**
   * 停止定期清理任务
   */
  stopPeriodicCleanup(): void;

  /**
   * 获取缓存统计
   * @returns 缓存统计
   */
  getStats(): { size: number; maxSize: number };
}
```

---

## 6. 依赖关系

### 6.1 外部依赖

```typescript
// AceStrategyManager.ts
import { IStrategicContextManager } from './StrategicContextManager';
import { IWorldModelUpdater } from './WorldModelUpdater';
import { IPlaybookSynthesis } from './PlaybookSynthesis';
import { IMemoryManager } from './MemoryManager';
import { PlaybookManager } from '../playbook/PlaybookManager';
import { PlaybookMatcher } from '../playbook/PlaybookMatcher';
import { LLMManager } from '../core/LLMManager';
```

### 6.2 内部依赖图

```
AceStrategyManager
    |
    +---> StrategicContextManager
    |         |
    |         +---> LLMManager
    |         +---> VariableEngine
    |
    +---> WorldModelUpdater
    |         |
    |         +---> LLMManager
    |         +----> PlaybookManager (DI)
    |
    +---> PlaybookSynthesis
    |         |
    |         +---> LLMManager
    |         +---> PlaybookManager (DI)
    |         +---> PlaybookMatcher (DI)
    |
    +---> MemoryManager
    |
    +---> PlaybookManager (DI - 外部注入)
    |
    +---> PlaybookMatcher (DI - 外部注入)
```

### 6.3 依赖注入设计

```typescript
/**
 * AceStrategyManager 构造函数依赖注入
 */
export class AceStrategyManager implements IAceStrategyManager {
  constructor(
    private readonly contextManager: IStrategicContextManager,
    private readonly worldModelUpdater: IWorldModelUpdater,
    private readonly playbookSynthesis: IPlaybookSynthesis,
    private readonly memoryManager: IMemoryManager,
    // 依赖注入的 Playbook 系统
    private readonly playbookManager: PlaybookManager,
    private readonly playbookMatcher: PlaybookMatcher,
    // 可选依赖
    private readonly llmManager?: LLMManager
  ) {
    // 启动定期清理任务
    this.memoryManager.startPeriodicCleanup();
  }

  async loadStrategicContext(userId: string): Promise<string> {
    // 检查缓存
    const cached = await this.memoryManager.get<StrategicContext>(`context:${userId}`);
    if (cached && !this.contextManager.isExpired(cached.data)) {
      return cached.data.worldView;
    }

    // 从上下文管理器加载
    const context = await this.contextManager.loadContext(userId);
    if (!context) {
      return '';
    }

    // 更新缓存
    await this.memoryManager.set(`context:${userId}`, context, 3600000); // 1小时

    return context.worldView;
  }

  async updateWorldModel(sessionId: string, outcome: LearningOutcome): Promise<void> {
    // 更新世界模型
    await this.worldModelUpdater.updateModel(outcome.userId, outcome);

    // 尝试提炼 Playbook
    if (outcome.success) {
      const playbook = await this.playbookSynthesis.extractFromSuccess(
        outcome,
        sessionId
      );
      if (playbook) {
        await this.playbookSynthesis.savePlaybook(playbook);
      }
    } else {
      const playbook = await this.playbookSynthesis.extractFromFailure(
        outcome,
        sessionId
      );
      if (playbook) {
        await this.playbookSynthesis.savePlaybook(playbook);
      }
    }
  }

  async retrieveStrategicKnowledge(
    query: string,
    userId?: string
  ): Promise<string[]> {
    // 使用 PlaybookMatcher 检索相关知识
    if (this.playbookMatcher && userId) {
      const matches = await this.playbookMatcher.findSimilarPlaybooks(query, 5);
      return matches.map(m => m.reason);
    }
    return [];
  }

  async startStrategicLearningCollection(sessionId: string): Promise<void> {
    // 启动学习收集
  }

  getStatus(): ServiceStatus {
    const stats = this.memoryManager.getStats();
    return {
      initialized: true,
      cacheStatus: {
        contextCount: stats.size,
        worldModelCount: stats.size,
        learningCount: stats.size,
      },
      lastCleanup: new Date(),
      healthy: true,
    };
  }
}
```

---

## 7. 迁移步骤

### 7.1 阶段一：创建类型定义

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 1.1 | 创建 `types.ts` 文件 | 1h | 文件创建成功 |
| 1.2 | 迁移所有类型定义 | 2h | 编译通过 |
| 1.3 | 添加类型别名兼容层 | 1h | 旧类型引用正常 |

### 7.2 阶段二：创建子模块

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 2.1 | 创建 `MemoryManager.ts` 并迁移内存管理方法 | 4h | 内存管理功能测试 |
| 2.2 | 创建 `StrategicContextManager.ts` 并迁移上下文方法 | 6h | 上下文管理功能测试 |
| 2.3 | 创建 `WorldModelUpdater.ts` 并迁移世界模型方法 | 6h | 世界模型更新测试 |
| 2.4 | 创建 `PlaybookSynthesis.ts` 并迁移提炼方法 | 8h | Playbook 提炼功能测试 |

### 7.3 阶段三：重构主服务

| 步骤 | 操作 | 预计工时 | 验证标准 |
|------|------|----------|----------|
| 3.1 | 重构 `AceStrategyManager.ts` 主服务 | 4h | 不超过 250 行 |
| 3.2 | 实现依赖注入 | 3h | 编译通过 |
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
| 阶段二：子模块 | 24h |
| 阶段三：主服务 | 8h |
| 阶段四：验证测试 | 7h |
| **合计** | **43h (约 2 周)** |

---

## 8. 验收标准

### 8.1 代码质量标准

- [ ] AceStrategyManager 不超过 250 行
- [ ] StrategicContextManager 不超过 200 行
- [ ] WorldModelUpdater 不超过 200 行
- [ ] PlaybookSynthesis 不超过 250 行
- [ ] MemoryManager 不超过 150 行
- [ ] 消除所有 `any` 类型
- [ ] 重复代码率低于 5%

### 8.2 功能验收标准

- [ ] `loadStrategicContext()` API 行为 100% 一致
- [ ] `updateWorldModel()` API 行为 100% 一致
- [ ] `retrieveStrategicKnowledge()` API 行为 100% 一致
- [ ] Playbook 系统可独立实例化
- [ ] 内存管理逻辑独立
- [ ] Playbook 自动提炼逻辑可测试

### 8.3 测试标准

- [ ] 单元测试覆盖率不低于 80%
- [ ] 内存管理有独立测试
- [ ] 上下文管理有独立测试
- [ ] Playbook 提炼有独立测试

### 8.4 兼容性标准

- [ ] 保持公共 API 不变
- [ ] 保持 `LearningOutcome` 类型兼容
- [ ] 保持 `StrategicContext` 类型兼容
- [ ] TypeScript 编译无错误
- [ ] 现有功能 100% 正常

---

## 9. 风险与缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| ACE 战略功能中断 | 中 | 中 | 建立功能测试基准 |
| Playbook 自动提炼失效 | 中 | 低 | 保持逻辑完整性 |
| 内存泄漏 | 中 | 低 | 独立内存管理模块 |
| 依赖注入配置错误 | 高 | 低 | 编译时类型检查 |

---

## 10. 附录

### 10.1 术语表

| 术语 | 定义 |
|------|------|
| World Model | 世界模型，系统的环境理解和状态表示 |
| Strategic Learning | 战略学习，从交互中提取可复用的策略 |
| Playbook Synthesis | Playbook 合成，从学习结果生成可执行的 playbook |
| TTL | Time To Live，缓存存活时间 |

### 10.2 变更记录

| 版本 | 日期 | 作者 | 描述 |
|------|------|------|------|
| 1.0.0 | 2025-12-30 | - | 初始版本 |

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-30
**状态**: 评审通过
