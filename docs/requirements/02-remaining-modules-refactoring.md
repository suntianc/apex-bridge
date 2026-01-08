# 剩余模块重构需求文档

**需求编号**: R-002
**版本**: 1.0.0
**创建日期**: 2025-12-30
**优先级**: 高
**状态**: 已评审

---

## 1. 项目概述

### 1.1 背景说明

在 ConfigService 重构试点完成后（R-001），项目仍有4个超大服务文件需要重构。本文档识别这些问题模块，分析其重构复杂度和风险，并制定分阶段重构计划。

### 1.2 重构目标

1. **代码规模精简**：将超大文件拆分为高内聚模块
2. **职责边界清晰**：明确定义每个模块的职责范围
3. **消除冗余代码**：移除重复实现，统一工具函数
4. **强化类型系统**：严格类型定义，消除 any 类型
5. **降低耦合度**：减少模块间依赖，建立清晰依赖链

### 1.3 参考标准

- 单个文件不超过 500 行
- 单一职责原则：每个类/模块只有一个变更理由
- 方法不超过 50 行（特殊情况不超过 100 行）
- 单元测试覆盖率不低于 80%

---

## 2. 超大模块问题分析

### 2.1 模块概览

| 文件 | 当前行数 | 问题等级 | 重构复杂度 | 优先级 |
|------|----------|----------|------------|--------|
| `PlaybookMatcher.ts` | 1326 | 严重 | 高 | P1 |
| `ChatService.ts` | 1190 | 严重 | 高 | P2 |
| `ToolRetrievalService.ts` | 1149 | 严重 | 中 | P3 |
| `AceStrategyManager.ts` | 1062 | 严重 | 中 | P4 |

### 2.2 PlaybookMatcher.ts 详细分析

#### 2.2.1 基本信息

| 属性 | 值 |
|------|-----|
| 文件路径 | `src/services/PlaybookMatcher.ts` |
| 当前行数 | 1326 行 |
| 公共方法 | 8 个 |
| 私有方法 | 30+ 个 |
| 依赖服务 | 4 个 |

#### 2.2.2 问题清单

| 问题编号 | 问题描述 | 严重程度 | 影响范围 |
|----------|----------|----------|----------|
| PM-001 | 单一职责违反：同时处理向量检索、相似度匹配、动态类型匹配、推荐序列生成 | 高 | 全局 |
| PM-002 | 方法过多：超过 30 个私有方法，理解成本高 | 高 | 可维护性 |
| PM-003 | Stage 3 Curator 知识库维护方法与核心匹配逻辑混合 | 中 | 可维护性 |
| PM-004 | 类型定义重复：LegacyMatchingContext 与 MatchingContext 重复 | 中 | 类型安全 |
| PM-005 | 评分算法分散：calculateMatchScore、calculateMultiTagMatchScore、calculateSimilarityScore 逻辑重叠 | 中 | 代码重复 |

#### 2.2.3 代码结构问题

```typescript
// 当前结构问题
class PlaybookMatcher {
  // 核心匹配逻辑 (Line 54-325)
  matchPlaybooks(), findSimilarPlaybooks(), recommendPlaybookSequence()

  // 私有辅助方法 (Line 224-447)
  buildSearchQuery(), calculateMatchScore(), calculateTextSimilarity()

  // Stage 3: Curator 知识库维护 (Line 581-834)
  maintainPlaybookKnowledgeBase(), findDuplicates(), mergePlaybooks()

  // 动态类型匹配 (Line 851-1326)
  matchPlaybooksDynamic(), calculateMultiTagMatchScore(), extractTypeSignals()
}
```

#### 2.2.4 依赖关系

```
PlaybookMatcher
├── ToolRetrievalService (向量检索)
├── LLMManager (LLM调用)
├── TypeVocabularyService (类型词汇表)
├── SimilarityService (相似度服务)
└── types/playbook-maintenance.ts (类型定义)
```

#### 2.2.5 风险评估

| 风险项 | 风险等级 | 缓解措施 |
|--------|----------|----------|
| 改动影响 Playbook 推荐准确性 | 高 | 建立功能测试基准，自动化回归测试 |
| 改动影响 ChatService.playbookMatcher | 中 | 保持公共 API 不变，渐进式迁移 |
| 类型变更导致编译错误 | 低 | 提供类型别名兼容层 |

---

### 2.3 ChatService.ts 详细分析

#### 2.3.1 基本信息

| 属性 | 值 |
|------|-----|
| 文件路径 | `src/services/ChatService.ts` |
| 当前行数 | 1190 行 |
| 公共方法 | 25+ 个 |
| 私有方法 | 15+ 个 |
| 依赖服务 | 15+ 个 |

#### 2.3.2 问题清单

| 问题编号 | 问题描述 | 严重程度 | 影响范围 |
|----------|----------|----------|----------|
| CS-001 | 上帝类反模式：承担过多协调职责 | 高 | 全局 |
| CS-002 | 依赖注入过多：构造函数注入 10+ 个依赖 | 高 | 耦合度 |
| CS-003 | 方法过长：processMessage 方法超过 200 行 | 高 | 可读性 |
| CS-004 | 职责混乱：同时处理消息处理、对话历史、会话管理、上下文管理 | 高 | 可维护性 |
| CS-005 | 代理方法过多：大量代理到其他服务的方法 | 中 | 设计问题 |

#### 2.3.3 代码结构问题

```typescript
// 当前结构问题
class ChatService {
  // 依赖注入 (Line 89-191)
  15+ 个服务依赖

  // 核心处理逻辑 (Line 445-673)
  processMessage() - 200+ 行，包含伦理审查、上下文管理、策略选择、Playbook匹配

  // 私有辅助方法 (Line 218-440)
  selectStrategy(), prepareMessages(), saveConversationHistory()

  // WebSocket 支持 (Line 798-879)
  streamMessage() - 80+ 行

  // 代理方法 (Line 881-1191)
  20+ 个代理方法到 SessionManager, ConversationHistoryService 等
}
```

#### 2.3.4 依赖关系

```
ChatService
├── ProtocolEngine (协议解析)
├── LLMManager (LLM管理)
├── SessionManager (会话管理)
├── RequestTracker (请求追踪)
├── ConversationHistoryService (对话历史)
├── AceService (ACE引擎)
├── AceIntegrator (ACE集成)
├── AceEthicsGuard (伦理守卫)
├── AceStrategyOrchestrator (策略编排)
├── PlaybookMatcher (Playbook匹配)
├── ToolRetrievalService (工具检索)
├── SystemPromptService (系统提示)
├── VariableEngine (变量引擎)
├── ContextManager (上下文管理)
├── EnhancedSessionManager (增强会话)
└── ... 更多
```

#### 2.3.5 风险评估

| 风险项 | 风险等级 | 缓解措施 |
|--------|----------|----------|
| 核心聊天逻辑中断 | 极高 | 建立完整的集成测试，Feature Flag 切换 |
| 改动影响所有聊天请求 | 极高 | 渐进式迁移，保持 API 兼容 |
| 依赖链复杂 | 高 | 引入依赖注入容器 |

---

### 2.4 ToolRetrievalService.ts 详细分析

#### 2.4.1 基本信息

| 属性 | 值 |
|------|-----|
| 文件路径 | `src/services/ToolRetrievalService.ts` |
| 当前行数 | 1149 行 |
| 公共方法 | 10 个 |
| 私有方法 | 25+ 个 |
| 外部依赖 | LanceDB, LLMManager |

#### 2.4.2 问题清单

| 问题编号 | 问题描述 | 严重程度 | 影响范围 |
|----------|----------|----------|----------|
| TR-001 | 混合关注点：数据库连接、嵌入生成、技能索引、搜索逻辑 | 高 | 可维护性 |
| TR-002 | 初始化逻辑复杂：连接、Schema、索引创建混在一起 | 中 | 可读性 |
| TR-003 | MCP 支持逻辑与 Skills 逻辑耦合 | 中 | 扩展性 |
| TR-004 | 延迟导入模式导致代码可读性差 | 低 | 代码风格 |

#### 2.4.3 代码结构问题

```typescript
// 当前结构问题
class ToolRetrievalService {
  // 初始化逻辑 (Line 118-406)
  initialize(), connectToLanceDB(), initializeSkillsTable()

  // 向量生成 (Line 446-516)
  getEmbedding(), generateRemoteEmbedding(), prepareEmbeddingText()

  // 技能索引 (Line 521-613)
  indexSkill(), removeSkill()

  // 搜索逻辑 (Line 618-771)
  findRelevantSkills(), formatSearchResults()

  // 文件扫描 (Line 776-972)
  scanAndIndexAllSkills(), checkReindexRequired(), readSkillMetadata()

  // MCP 支持 (Line 1007-1101)
  indexTools(), getEmbeddingForTool(), removeTool()
}
```

#### 2.4.4 风险评估

| 风险项 | 风险等级 | 缓解措施 |
|--------|----------|----------|
| 向量检索功能中断 | 高 | 建立功能测试基准 |
| 数据库 Schema 变更 | 中 | 保持向后兼容 |
| 嵌入模型切换 | 低 | 抽象嵌入生成接口 |

---

### 2.5 AceStrategyManager.ts 详细分析

#### 2.5.1 基本信息

| 属性 | 值 |
|------|-----|
| 文件路径 | `src/services/AceStrategyManager.ts` |
| 当前行数 | 1062 行 |
| 公共方法 | 8 个 |
| 私有方法 | 25+ 个 |
| 依赖服务 | 4 个 |

#### 2.5.2 问题清单

| 问题编号 | 问题描述 | 严重程度 | 影响范围 |
|----------|----------|----------|----------|
| AS-001 | Playbook 系统深度耦合：内部实例化 PlaybookManager 和 PlaybookMatcher | 高 | 耦合度 |
| AS-002 | 内存管理逻辑与业务逻辑混合 | 中 | 可维护性 |
| AS-003 | 战略学习提取与 Playbook 提炼逻辑复杂 | 中 | 可读性 |
| AS-004 | 定期清理任务与主逻辑耦合 | 低 | 设计问题 |

#### 2.5.3 代码结构问题

```typescript
// 当前结构问题
class AceStrategyManager {
  // 战略上下文管理 (Line 143-364)
  loadStrategicContext(), updateStrategicGoals()

  // 世界模型更新 (Line 198-508)
  updateWorldModel(), storeStrategicLearning(), updateWorldModelFromLearning()

  // Playbook 系统集成 (Line 796-1062)
  extractPlaybookFromLearning(), extractFailurePlaybookFromLearning()

  // Playbook 管理器 (内部实例化)
  private playbookManager: PlaybookManager
  private playbookMatcher: PlaybookMatcher

  // 内存管理 (Line 57-137)
  startPeriodicCleanup(), cleanupExpiredContexts()
}
```

#### 2.5.4 风险评估

| 风险项 | 风险等级 | 缓解措施 |
|--------|----------|----------|
| ACE 战略功能中断 | 中 | 建立功能测试基准 |
| Playbook 自动提炼失效 | 中 | 保持逻辑完整性 |
| 内存泄漏 | 中 | 独立内存管理模块 |

---

## 3. 重构优先级排序

### 3.1 优先级评估标准

| 评估维度 | 权重 | 评分标准 |
|----------|------|----------|
| 问题严重性 | 30% | 行数、方法数、复杂度 |
| 业务影响 | 25% | 对核心功能的影响程度 |
| 重构风险 | 25% | 依赖复杂度、测试覆盖 |
| 重构收益 | 20% | 可维护性提升程度 |

### 3.2 综合评分

| 排名 | 模块 | 问题严重性 | 业务影响 | 重构风险 | 重构收益 | 综合分 |
|------|------|------------|----------|----------|----------|--------|
| 1 | PlaybookMatcher | 9/10 | 7/10 | 7/10 | 9/10 | **8.0** |
| 2 | ChatService | 9/10 | 10/10 | 9/10 | 8/10 | 9.0 |
| 3 | ToolRetrievalService | 8/10 | 6/10 | 5/10 | 7/10 | 6.7 |
| 4 | AceStrategyManager | 7/10 | 5/10 | 6/10 | 6/10 | 6.0 |

### 3.3 推荐重构顺序

| 阶段 | 模块 | 预估工时 | 理由 |
|------|------|----------|------|
| Phase 1 | PlaybookMatcher | 2 周 | 问题最明确，收益高，可作为 ChatService 重构的前置依赖 |
| Phase 2 | ToolRetrievalService | 1.5 周 | 相对独立，重构风险低 |
| Phase 3 | AceStrategyManager | 2 周 | 与 Playbook 系统深度耦合，需在 PlaybookMatcher 重构后进行 |
| Phase 4 | ChatService | 3 周 | 核心服务，依赖最多，风险最高，最后重构 |

---

## 4. 详细重构方案

### 4.1 PlaybookMatcher 重构方案

#### 4.1.1 目标结构

```
src/services/playbook/
├── PlaybookMatcher.ts          # 主匹配器 (200行)
├── PlaybookMatcher.types.ts    # 类型定义 (100行)
├── ScoreCalculator.ts          # 评分计算器 (200行)
├── DynamicTypeMatcher.ts       # 动态类型匹配 (250行)
├── SequenceRecommender.ts      # 序列推荐 (200行)
├── PlaybookCurator.ts          # Stage 3: 知识库维护 (250行)
└── index.ts                    # 统一导出
```

#### 4.1.2 职责划分

| 文件 | 职责 | 预估行数 |
|------|------|----------|
| PlaybookMatcher.ts | 主协调器，公共 API | 200 |
| ScoreCalculator.ts | 统一评分算法 | 200 |
| DynamicTypeMatcher.ts | 动态类型匹配逻辑 | 250 |
| SequenceRecommender.ts | Playbook 序列推荐 | 200 |
| PlaybookCurator.ts | 知识库维护 (去重/归档) | 250 |

#### 4.1.3 关键变更

```typescript
// 重构前：单一文件 1326 行
class PlaybookMatcher {
  async matchPlaybooks() { ... }
  private calculateMatchScore() { ... }
  private calculateMultiTagMatchScore() { ... }
  private calculateSimilarityScore() { ... }
  async maintainPlaybookKnowledgeBase() { ... }
  // 30+ 私有方法...
}

// 重构后：分散职责
// PlaybookMatcher.ts
class PlaybookMatcher {
  constructor(
    private scoreCalculator: ScoreCalculator,
    private dynamicTypeMatcher: DynamicTypeMatcher,
    private sequenceRecommender: SequenceRecommender,
    private curator: PlaybookCurator
  ) {}

  async matchPlaybooks(context, config) {
    // 协调各子模块
  }
}

// ScoreCalculator.ts
class ScoreCalculator {
  calculateMatchScore(playbook, context): PlaybookMatch { ... }
  calculateSimilarityScore(playbook, target): PlaybookMatch { ... }
  calculateMultiTagMatchScore(playbook, context, signals): PlaybookMatch { ... }
}
```

#### 4.1.4 验收标准

- [ ] PlaybookMatcher 不超过 200 行
- [ ] ScoreCalculator 独立，评分算法可测试
- [ ] DynamicTypeMatcher 可独立复用
- [ ] PlaybookCurator 可独立调度
- [ ] 保持公共 API 不变
- [ ] 单元测试覆盖率 80%+

---

### 4.2 ToolRetrievalService 重构方案

#### 4.2.1 目标结构

```
src/services/tool-retrieval/
├── ToolRetrievalService.ts     # 主服务 (200行)
├── LanceDBConnection.ts        # 数据库连接管理 (150行)
├── EmbeddingGenerator.ts       # 嵌入生成 (200行)
├── SkillIndexer.ts             # 技能索引 (200行)
├── SearchEngine.ts             # 搜索逻辑 (200行)
├── MCPToolSupport.ts           # MCP 工具支持 (150行)
├── types.ts                    # 类型定义 (100行)
└── index.ts                    # 统一导出
```

#### 4.2.2 职责划分

| 文件 | 职责 | 预估行数 |
|------|------|----------|
| ToolRetrievalService.ts | 主服务，公共 API | 200 |
| LanceDBConnection.ts | 数据库连接和 Schema 管理 | 150 |
| EmbeddingGenerator.ts | 嵌入生成逻辑 | 200 |
| SkillIndexer.ts | 技能索引操作 | 200 |
| SearchEngine.ts | 向量搜索和结果格式化 | 200 |
| MCPToolSupport.ts | MCP 工具特殊处理 | 150 |

#### 4.2.3 关键变更

```typescript
// 重构前：单一文件 1149 行
class ToolRetrievalService {
  async initialize() {
    // 连接、Schema、索引创建混在一起
  }
  async getEmbedding() { ... }
  async indexSkill() { ... }
  async findRelevantSkills() { ... }
  // 25+ 私有方法...
}

// 重构后：分散职责
// ToolRetrievalService.ts
class ToolRetrievalService {
  constructor(
    private connection: LanceDBConnection,
    private embeddingGenerator: EmbeddingGenerator,
    private skillIndexer: SkillIndexer,
    private searchEngine: SearchEngine
  ) {}
}

// LanceDBConnection.ts
class LanceDBConnection {
  async connect(config): Promise<Connection> { ... }
  async initializeTable(): Promise<Table> { ... }
  async checkSchemaCompatibility(): Promise<boolean> { ... }
}

// EmbeddingGenerator.ts
class EmbeddingGenerator {
  async generateForSkill(skill): Promise<number[]> { ... }
  async generateForTool(tool): Promise<number[]> { ... }
}
```

#### 4.2.4 验收标准

- [ ] ToolRetrievalService 不超过 200 行
- [ ] 数据库连接逻辑独立，可测试
- [ ] 嵌入生成可独立替换
- [ ] MCP 支持逻辑独立
- [ ] 保持公共 API 不变
- [ ] 单元测试覆盖率 80%+

---

### 4.3 AceStrategyManager 重构方案

#### 4.3.1 目标结构

```
src/services/ace/
├── AceStrategyManager.ts       # 主管理器 (250行)
├── StrategicContextManager.ts  # 战略上下文管理 (200行)
├── WorldModelUpdater.ts        # 世界模型更新 (200行)
├── PlaybookSynthesis.ts        # Playbook 自动提炼 (250行)
├── MemoryManager.ts            # 内存管理 (150行)
├── types.ts                    # 类型定义 (100行)
└── index.ts                    # 统一导出
```

#### 4.3.2 职责划分

| 文件 | 职责 | 预估行数 |
|------|------|----------|
| AceStrategyManager.ts | 主协调器，公共 API | 250 |
| StrategicContextManager.ts | 战略上下文加载和更新 | 200 |
| WorldModelUpdater.ts | 世界模型更新逻辑 | 200 |
| PlaybookSynthesis.ts | Playbook 自动提炼 | 250 |
| MemoryManager.ts | TTL 缓存和清理 | 150 |

#### 4.3.3 关键变更

```typescript
// 重构前：单一文件 1062 行
class AceStrategyManager {
  async loadStrategicContext() { ... }
  async updateWorldModel() { ... }
  private async extractPlaybookFromLearning() { ... }
  private async extractFailurePlaybookFromLearning() { ... }
  // 内部实例化 PlaybookManager 和 PlaybookMatcher
}

// 重构后：分散职责
// AceStrategyManager.ts
class AceStrategyManager {
  constructor(
    private contextManager: StrategicContextManager,
    private worldModelUpdater: WorldModelUpdater,
    private playbookSynthesis: PlaybookSynthesis,
    private memoryManager: MemoryManager,
    private playbookManager: PlaybookManager,
    private playbookMatcher: PlaybookMatcher
  ) {}
}

// PlaybookSynthesis.ts
class PlaybookSynthesis {
  async extractFromSuccess(learning, sessionId): Promise<StrategicPlaybook> { ... }
  async extractFromFailure(learning, sessionId): Promise<StrategicPlaybook> { ... }
  async buildExtractionPrompt(learning, context): string { ... }
}
```

#### 4.3.4 验收标准

- [ ] AceStrategyManager 不超过 250 行
- [ ] Playbook 系统可独立实例化
- [ ] 内存管理逻辑独立
- [ ] Playbook 自动提炼逻辑可测试
- [ ] 保持公共 API 不变
- [ ] 单元测试覆盖率 80%+

---

### 4.4 ChatService 重构方案

#### 4.4.1 目标结构

```
src/services/chat/
├── ChatService.ts              # 主协调器 (300行)
├── MessageProcessor.ts         # 消息处理 (250行)
├── SessionCoordinator.ts       # 会话协调 (200行)
├── StreamHandler.ts            # 流式处理 (200行)
├── EthicsFilter.ts             # 伦理审查 (150行)
├── ContextManager.ts           # 上下文管理 (200行)
├── types.ts                    # 类型定义 (100行)
└── index.ts                    # 统一导出
```

#### 4.4.2 职责划分

| 文件 | 职责 | 预估行数 |
|------|------|----------|
| ChatService.ts | 主协调器，策略选择，依赖注入 | 300 |
| MessageProcessor.ts | 消息预处理、变量注入 | 250 |
| SessionCoordinator.ts | 会话管理协调 | 200 |
| StreamHandler.ts | 流式消息处理 | 200 |
| EthicsFilter.ts | 伦理审查逻辑 | 150 |
| ContextManager.ts | 上下文管理协调 | 200 |

#### 4.4.3 关键变更

```typescript
// 重构前：单一文件 1190 行
class ChatService {
  constructor(
    protocolEngine: ProtocolEngine,
    llmManager: LLMManager,
    eventBus: EventBus,
    // 15+ 依赖...
  ) {}

  async processMessage(messages, options) {
    // 伦理审查 (50行)
    // 会话管理 (30行)
    // 上下文管理 (50行)
    // ACE编排 (30行)
    // Playbook匹配 (50行)
    // 策略选择 (20行)
    // 消息预处理 (40行)
    // 策略执行 (80行)
    // 结果处理 (30行)
  }
}

// 重构后：分散职责
// ChatService.ts
class ChatService {
  constructor(
    private ethicsFilter: EthicsFilter,
    private sessionCoordinator: SessionCoordinator,
    private contextManager: ContextManager,
    private messageProcessor: MessageProcessor,
    private streamHandler: StreamHandler,
    private aceOrchestrator: AceStrategyOrchestrator
  ) {}

  async processMessage(messages, options) {
    // 协调各子模块
    const ethicsResult = await this.ethicsFilter.review(messages);
    if (!ethicsResult.approved) return ethicsResult;

    const session = await this.sessionCoordinator.getOrCreate(options);
    const context = await this.contextManager.manage(session, messages);
    const processed = await this.messageProcessor.prepare(messages, options);
    const result = await this.executeStrategy(processed, options);
    // ...
  }
}

// MessageProcessor.ts
class MessageProcessor {
  constructor(
    private systemPromptService: SystemPromptService,
    private variableEngine: VariableEngine,
    private playbookInjector: PlaybookInjector
  ) {}

  async prepare(messages, options, strategyVars, playbookVars) {
    // 注入系统提示词
    // 变量替换
    // Playbook指导注入
  }
}
```

#### 4.4.4 验收标准

- [ ] ChatService 不超过 300 行
- [ ] 各子模块可独立测试
- [ ] 伦理审查可独立配置
- [ ] 保持所有公共 API 不变
- [ ] 保持 WebSocket 接口兼容
- [ ] 单元测试覆盖率 80%+

---

## 5. 分阶段实施计划

### 5.1 Phase 1: PlaybookMatcher 重构 (2周)

| 周 | 任务 | 交付物 | 验证标准 |
|----|------|--------|----------|
| W1 | 提取 ScoreCalculator | ScoreCalculator.ts | 评分功能独立测试通过 |
| W1 | 提取 DynamicTypeMatcher | DynamicTypeMatcher.ts | 动态类型匹配功能通过 |
| W2 | 提取 SequenceRecommender | SequenceRecommender.ts | 序列推荐功能通过 |
| W2 | 提取 PlaybookCurator | PlaybookCurator.ts | 知识库维护功能通过 |
| W2 | 重构 PlaybookMatcher | PlaybookMatcher.ts | 不超过200行，测试通过 |

### 5.2 Phase 2: ToolRetrievalService 重构 (1.5周)

| 周 | 任务 | 交付物 | 验证标准 |
|----|------|--------|----------|
| W3 | 提取 LanceDBConnection | LanceDBConnection.ts | 数据库连接独立测试 |
| W3 | 提取 EmbeddingGenerator | EmbeddingGenerator.ts | 嵌入生成独立测试 |
| W4 | 提取 SkillIndexer 和 SearchEngine | Indexer/Search 文件 | 索引和搜索功能测试 |
| W4 | 提取 MCPToolSupport | MCPToolSupport.ts | MCP 支持功能测试 |
| W4 | 重构主服务 | ToolRetrievalService.ts | 不超过200行 |

### 5.3 Phase 3: AceStrategyManager 重构 (2周)

| 周 | 任务 | 交付物 | 验证标准 |
|----|------|--------|----------|
| W5 | 提取 StrategicContextManager | ContextManager.ts | 上下文管理功能测试 |
| W5 | 提取 WorldModelUpdater | WorldModelUpdater.ts | 世界模型更新测试 |
| W6 | 提取 PlaybookSynthesis | PlaybookSynthesis.ts | Playbook提炼功能测试 |
| W6 | 提取 MemoryManager | MemoryManager.ts | 内存管理功能测试 |
| W6 | 重构主服务 | AceStrategyManager.ts | 不超过250行 |

### 5.4 Phase 4: ChatService 重构 (3周)

| 周 | 任务 | 交付物 | 验证标准 |
|----|------|--------|----------|
| W7 | 提取 EthicsFilter | EthicsFilter.ts | 伦理审查功能测试 |
| W7 | 提取 MessageProcessor | MessageProcessor.ts | 消息预处理功能测试 |
| W8 | 提取 SessionCoordinator | SessionCoordinator.ts | 会话协调功能测试 |
| W8 | 提取 ContextManager | ContextManager.ts | 上下文管理功能测试 |
| W9 | 提取 StreamHandler | StreamHandler.ts | 流式处理功能测试 |
| W9 | 重构主服务 | ChatService.ts | 不超过300行 |

### 5.5 总时间线

| 阶段 | 开始时间 | 结束时间 | 工时 |
|------|----------|----------|------|
| Phase 1: PlaybookMatcher | Week 1 | Week 2 | 2 周 |
| Phase 2: ToolRetrievalService | Week 3 | Week 4 | 1.5 周 |
| Phase 3: AceStrategyManager | Week 5 | Week 6 | 2 周 |
| Phase 4: ChatService | Week 7 | Week 9 | 3 周 |
| **合计** | - | - | **8.5 周** |

---

## 6. 兼容性约束

### 6.1 API 兼容性

所有重构必须保持以下接口不变：

```typescript
// PlaybookMatcher
interface PlaybookMatcher {
  matchPlaybooks(context: MatchingContext, config?: PlaybookRecommendationConfig): Promise<PlaybookMatch[]>;
  findSimilarPlaybooks(playbookId: string, limit?: number): Promise<PlaybookMatch[]>;
  recommendPlaybookSequence(context: MatchingContext, targetOutcome: string): Promise<SequenceResult>;
}

// ToolRetrievalService
interface ToolRetrievalService {
  initialize(): Promise<void>;
  findRelevantSkills(query: string, limit?: number, threshold?: number): Promise<ToolRetrievalResult[]>;
  indexSkill(skill: SkillData): Promise<void>;
  scanAndIndexAllSkills(skillsDir?: string): Promise<void>;
}

// AceStrategyManager
interface AceStrategyManager {
  loadStrategicContext(userId: string): Promise<string>;
  updateWorldModel(sessionId: string, outcome: LearningOutcome): Promise<void>;
  retrieveStrategicKnowledge(query: string, userId?: string): Promise<string[]>;
}

// ChatService
interface ChatService {
  processMessage(messages: Message[], options?: ChatOptions): Promise<ChatResult>;
  streamMessage(messages: Message[], options?: ChatOptions): AsyncIterableIterator<string>;
  getStatus(): ServiceStatus;
}
```

### 6.2 数据格式兼容性

- 配置 JSON 结构保持不变
- 数据库 Schema 保持向后兼容
- 消息格式保持 OpenAI 兼容

### 6.3 迁移策略

1. **并行运行**：新模块与旧代码并行运行
2. **Feature Flag**：通过配置切换新旧实现
3. **回滚机制**：发现问题可快速回滚到旧实现

---

## 7. 验收标准

### 7.1 代码质量标准

- [ ] 单个文件不超过 500 行
- [ ] 消除所有 `any` 类型（除非外部接口要求）
- [ ] 启用 `strictNullChecks`
- [ ] 重复代码率低于 5%
- [ ] 单元测试覆盖率 80%+

### 7.2 功能验收标准

- [ ] 原有功能 100% 正常
- [ ] API 接口行为一致
- [ ] 性能无明显下降
- [ ] 边界条件测试通过

### 7.3 性能验收标准

- [ ] TypeScript 编译时间减少 20% 以上
- [ ] 内存使用量无明显增加
- [ ] 启动时间无明显增加

---

## 8. 附录

### 8.1 术语表

| 术语 | 定义 |
|------|------|
| God Class | 上帝类，指承担过多职责的类 |
| SRP | Single Responsibility Principle，单一职责原则 |
| Feature Flag | 功能开关，用于渐进式发布 |
| Curator | 知识库维护者，负责去重、归档等 |

### 8.2 变更记录

| 版本 | 日期 | 作者 | 描述 |
|------|------|------|------|
| 1.0.0 | 2025-12-30 | - | 初始版本 |

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-30
**状态**: 评审通过
