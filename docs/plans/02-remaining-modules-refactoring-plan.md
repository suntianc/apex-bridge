# 剩余模块重构开发计划

**需求编号**: R-002
**计划版本**: 1.0.0
**创建日期**: 2025-12-30
**预估工时**: 8.5 周

---

## 变更版本记录

| 版本 | 日期 | 变更内容 | 变更人 |
|------|------|----------|--------|
| 1.0.0 | 2025-12-30 | 初始开发计划 | - |

---

## 关联文档

- 需求文档：[02-remaining-modules-refactoring.md](../requirements/02-remaining-modules-refactoring.md)
- 需求讨论纪要：[02-remaining-modules-refactoring-meeting.md](../meeting-minutes/02-remaining-modules-refactoring-meeting.md)
- 功能设计文档：
  - [02-01-PlaybookMatcher-refactoring.md](../functionality-design/02-01-PlaybookMatcher-refactoring.md)
  - [02-02-ToolRetrievalService-refactoring.md](../functionality-design/02-02-ToolRetrievalService-refactoring.md)
  - [02-03-AceStrategyManager-refactoring.md](../functionality-design/02-03-AceStrategyManager-refactoring.md)
  - [02-04-ChatService-refactoring.md](../functionality-design/02-04-ChatService-refactoring.md)

---

## 1. 需求概述

### 1.1 业务目标

在 ConfigService 重构试点完成后（R-001），对剩余4个超大服务文件进行重构，解决以下问题：
- 代码臃肿（单个文件超过1000行）
- 职责混乱（单一文件承担多种职责）
- 冗余代码（重复实现）
- 类型系统不严谨

### 1.2 功能范围

| 模块 | 当前行数 | 目标行数 | 拆分为 |
|------|----------|----------|--------|
| PlaybookMatcher | 1326 | ~1100 | 6 个文件 |
| ToolRetrievalService | 1149 | ~1200 | 7 个文件 |
| AceStrategyManager | 1062 | ~1050 | 6 个文件 |
| ChatService | 1190 | ~1300 | 7 个文件 |

### 1.3 非功能性需求

| 类别 | 要求 |
|------|------|
| 代码质量 | 单个文件不超过 500 行 |
| 类型安全 | 消除 `any` 类型 |
| 测试覆盖 | 单元测试覆盖率不低于 80% |
| 兼容性 | 保持所有公共 API 不变 |
| 性能 | 无明显性能下降 |

---

## 2. 技术方案

### 2.1 重构策略

- **渐进式重构**：每次只重构一个模块
- **职责分离**：每个文件只承担单一职责
- **依赖注入**：通过构造函数注入依赖（AceStrategyManager）
- **保持兼容**：所有公共 API 和数据格式不变

### 2.2 目录结构

```
src/services/
├── playbook/                    # PlaybookMatcher 拆分
│   ├── PlaybookMatcher.ts       # 主协调器 (200行)
│   ├── PlaybookMatcher.types.ts # 类型定义 (100行)
│   ├── ScoreCalculator.ts       # 评分计算器 (200行)
│   ├── DynamicTypeMatcher.ts    # 动态类型匹配 (250行)
│   ├── SequenceRecommender.ts   # 序列推荐 (200行)
│   ├── PlaybookCurator.ts       # 知识库维护 (250行)
│   └── index.ts                 # 统一导出
│
├── tool-retrieval/              # ToolRetrievalService 拆分
│   ├── ToolRetrievalService.ts  # 主服务 (200行)
│   ├── types.ts                 # 类型定义 (100行)
│   ├── LanceDBConnection.ts     # 数据库连接 (150行)
│   ├── EmbeddingGenerator.ts    # 嵌入生成 (200行)
│   ├── SkillIndexer.ts          # 技能索引 (200行)
│   ├── SearchEngine.ts          # 搜索逻辑 (200行)
│   ├── MCPToolSupport.ts        # MCP 工具支持 (150行)
│   └── index.ts                 # 统一导出
│
├── ace/                         # AceStrategyManager 拆分
│   ├── AceStrategyManager.ts    # 主管理器 (250行)
│   ├── types.ts                 # 类型定义 (100行)
│   ├── StrategicContextManager.ts # 战略上下文管理 (200行)
│   ├── WorldModelUpdater.ts     # 世界模型更新 (200行)
│   ├── PlaybookSynthesis.ts     # Playbook 自动提炼 (250行)
│   ├── MemoryManager.ts         # 内存管理 (150行)
│   └── index.ts                 # 统一导出
│
└── chat/                        # ChatService 拆分
    ├── ChatService.ts           # 主协调器 (300行)
    ├── types.ts                 # 类型定义 (100行)
    ├── MessageProcessor.ts      # 消息处理 (250行)
    ├── SessionCoordinator.ts    # 会话协调 (200行)
    ├── StreamHandler.ts         # 流式处理 (200行)
    ├── EthicsFilter.ts          # 伦理审查 (150行)
    ├── ContextManager.ts        # 上下文管理 (200行)
    └── index.ts                 # 统一导出
```

### 2.3 核心接口

#### PlaybookMatcher 接口

```typescript
interface IPlaybookMatcher {
  matchPlaybooks(context: MatchingContext, config?: PlaybookRecommendationConfig): Promise<PlaybookMatch[]>;
  findSimilarPlaybooks(playbookId: string, limit?: number): Promise<PlaybookMatch[]>;
  recommendPlaybookSequence(context: MatchingContext, targetOutcome: string): Promise<SequenceResult>;
}
```

#### ToolRetrievalService 接口

```typescript
interface IToolRetrievalService {
  initialize(): Promise<void>;
  findRelevantSkills(query: string, limit?: number, threshold?: number): Promise<ToolRetrievalResult[]>;
  indexSkill(skill: SkillData): Promise<void>;
  scanAndIndexAllSkills(skillsDir?: string): Promise<void>;
}
```

#### AceStrategyManager 接口

```typescript
interface IAceStrategyManager {
  loadStrategicContext(userId: string): Promise<string>;
  updateWorldModel(sessionId: string, outcome: LearningOutcome): Promise<void>;
  retrieveStrategicKnowledge(query: string, userId?: string): Promise<string[]>;
}
```

#### ChatService 接口

```typescript
interface IChatService {
  processMessage(messages: Message[], options?: ChatOptions): Promise<ChatResult>;
  streamMessage(messages: Message[], options?: ChatOptions): AsyncIterableIterator<string>;
  getStatus(): ServiceStatus;
}
```

---

## 3. 开发计划

### 3.1 阶段划分

| 阶段 | 模块 | 预估工时 | 目标产出 |
|------|------|----------|----------|
| Phase 1 | PlaybookMatcher | 1 周 (37h) | 6 个文件，测试通过 |
| Phase 2 | ToolRetrievalService | 1.5 周 (41h) | 7 个文件，测试通过 |
| Phase 3 | AceStrategyManager | 2 周 (43h) | 6 个文件，测试通过 |
| Phase 4 | ChatService | 3 周 (53h) | 7 个文件，测试通过 |
| **合计** | | **8.5 周 (174h)** | **26 个文件** |

### 3.2 详细任务清单

#### Phase 1: PlaybookMatcher 重构 (1 周)

| 序号 | 任务 | 预计工时 | 依赖 | 验证标准 |
|------|------|----------|------|----------|
| 1.1 | 创建 `src/services/playbook/` 目录 | 0.5h | - | 目录创建 |
| 1.2 | 创建 `PlaybookMatcher.types.ts` 类型定义 | 1.5h | 1.1 | 编译通过 |
| 1.3 | 创建 `ScoreCalculator.ts` 评分计算器 | 4h | 1.2 | 独立测试通过 |
| 1.4 | 创建 `DynamicTypeMatcher.ts` 动态类型匹配 | 6h | 1.2 | 功能测试通过 |
| 1.5 | 创建 `SequenceRecommender.ts` 序列推荐 | 4h | 1.3 | 功能测试通过 |
| 1.6 | 创建 `PlaybookCurator.ts` 知识库维护 | 6h | 1.2 | 功能测试通过 |
| 1.7 | 重构 `PlaybookMatcher.ts` 主服务 | 3h | 1.3-1.6 | 不超过 200 行 |
| 1.8 | 实现依赖注入 | 2h | 1.7 | 编译通过 |
| 1.9 | 创建 `index.ts` 统一导出 | 1h | 1.3-1.7 | 导出正确 |
| 1.10 | 补充单元测试 | 4h | 1.3-1.6 | 覆盖率 80%+ |
| 1.11 | 集成测试验证 | 2h | 1.10 | 功能正常 |

#### Phase 2: ToolRetrievalService 重构 (1.5 周)

| 序号 | 任务 | 预计工时 | 依赖 | 验证标准 |
|------|------|----------|------|----------|
| 2.1 | 创建 `src/services/tool-retrieval/` 目录 | 0.5h | - | 目录创建 |
| 2.2 | 创建 `types.ts` 类型定义 | 1.5h | 2.1 | 编译通过 |
| 2.3 | 创建 `LanceDBConnection.ts` 数据库连接 | 4h | 2.2 | 连接测试通过 |
| 2.4 | 创建 `EmbeddingGenerator.ts` 嵌入生成 | 5h | 2.2 | 嵌入测试通过 |
| 2.5 | 创建 `SkillIndexer.ts` 技能索引 | 5h | 2.3 | 索引测试通过 |
| 2.6 | 创建 `SearchEngine.ts` 搜索逻辑 | 5h | 2.3, 2.4 | 搜索测试通过 |
| 2.7 | 创建 `MCPToolSupport.ts` MCP 工具支持 | 4h | 2.2 | MCP 功能通过 |
| 2.8 | 重构 `ToolRetrievalService.ts` 主服务 | 3h | 2.3-2.7 | 不超过 200 行 |
| 2.9 | 创建 `index.ts` 统一导出 | 1h | 2.3-2.8 | 导出正确 |
| 2.10 | 补充单元测试 | 6h | 2.3-2.7 | 覆盖率 80%+ |
| 2.11 | 集成测试验证 | 3h | 2.10 | 功能正常 |

#### Phase 3: AceStrategyManager 重构 (2 周)

| 序号 | 任务 | 预计工时 | 依赖 | 验证标准 |
|------|------|----------|------|----------|
| 3.1 | 创建 `src/services/ace/` 目录 | 0.5h | - | 目录创建 |
| 3.2 | 创建 `types.ts` 类型定义 | 1.5h | 3.1 | 编译通过 |
| 3.3 | 创建 `StrategicContextManager.ts` 上下文管理 | 5h | 3.2 | 上下文功能通过 |
| 3.4 | 创建 `WorldModelUpdater.ts` 世界模型更新 | 5h | 3.2 | 更新功能通过 |
| 3.5 | 创建 `PlaybookSynthesis.ts` Playbook 提炼 | 6h | PlaybookMatcher 重构完成 | 提炼功能通过 |
| 3.6 | 创建 `MemoryManager.ts` 内存管理 | 4h | 3.2 | 内存管理通过 |
| 3.7 | 重构 `AceStrategyManager.ts` 主服务（含 DI） | 5h | 3.3-3.6 | 不超过 250 行 |
| 3.8 | 创建 `index.ts` 统一导出 | 1h | 3.3-3.7 | 导出正确 |
| 3.9 | 补充单元测试 | 8h | 3.3-3.6 | 覆盖率 80%+ |
| 3.10 | 集成测试验证 | 4h | 3.9 | 功能正常 |

#### Phase 4: ChatService 重构 (3 周)

| 序号 | 任务 | 预计工时 | 依赖 | 验证标准 |
|------|------|----------|------|----------|
| 4.1 | 创建 `src/services/chat/` 目录 | 0.5h | - | 目录创建 |
| 4.2 | 创建 `types.ts` 类型定义 | 1.5h | 4.1 | 编译通过 |
| 4.3 | 创建 `EthicsFilter.ts` 伦理审查 | 4h | 4.2 | 审查功能通过 |
| 4.4 | 创建 `MessageProcessor.ts` 消息处理 | 6h | 4.2 | 处理功能通过 |
| 4.5 | 创建 `SessionCoordinator.ts` 会话协调 | 5h | 4.2 | 会话功能通过 |
| 4.6 | 创建 `ContextManager.ts` 上下文管理 | 5h | 4.2 | 上下文功能通过 |
| 4.7 | 创建 `StreamHandler.ts` 流式处理 | 5h | 4.2 | 流式功能通过 |
| 4.8 | 重构 `ChatService.ts` 主服务 | 6h | 4.3-4.7 | 不超过 300 行 |
| 4.9 | 创建 `index.ts` 统一导出 | 1h | 4.3-4.8 | 导出正确 |
| 4.10 | 补充单元测试 | 10h | 4.3-4.7 | 覆盖率 80%+ |
| 4.11 | 集成测试验证（含 WebSocket） | 6h | 4.10 | 功能正常 |

### 3.3 总工时汇总

| Phase | 模块 | 工时 | 文件数 |
|-------|------|------|--------|
| Phase 1 | PlaybookMatcher | 37h | 6 |
| Phase 2 | ToolRetrievalService | 41h | 7 |
| Phase 3 | AceStrategyManager | 43h | 6 |
| Phase 4 | ChatService | 53h | 7 |
| **合计** | | **174h (8.5周)** | **26** |

---

## 4. 验收标准

### 4.1 代码质量标准

- [ ] 单个文件不超过 500 行
- [ ] 消除所有 `any` 类型
- [ ] 启用 `strictNullChecks`
- [ ] 重复代码率低于 5%

### 4.2 功能验收标准

| 模块 | 验收项 |
|------|--------|
| PlaybookMatcher | `matchPlaybooks()`, `findSimilarPlaybooks()`, `recommendPlaybookSequence()` API 行为一致 |
| ToolRetrievalService | `findRelevantSkills()`, `indexSkill()`, `scanAndIndexAllSkills()` 功能正常 |
| AceStrategyManager | `loadStrategicContext()`, `updateWorldModel()`, `retrieveStrategicKnowledge()` 功能正常 |
| ChatService | `processMessage()`, `streamMessage()`, `getStatus()` 功能正常，WebSocket 兼容 |

### 4.3 测试标准

- [ ] 单元测试覆盖率不低于 80%
- [ ] 核心算法有独立测试
- [ ] 集成测试覆盖所有公共 API
- [ ] 重构前后功能行为一致

### 4.4 兼容性标准

- [ ] 保持公共 API 不变
- [ ] 保持数据格式兼容
- [ ] TypeScript 编译无错误
- [ ] 现有功能 100% 正常

---

## 5. 风险识别与应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| 改动影响 Playbook 推荐准确性 | 高 | 中 | 建立功能测试基准，自动化回归测试 |
| 核心聊天逻辑中断 | 极高 | 中 | 建立完整集成测试，Feature Flag 切换 |
| 向量检索功能中断 | 高 | 低 | 建立功能测试基准 |
| ACE 战略功能中断 | 中 | 低 | 建立功能测试基准 |
| 评分算法行为差异 | 高 | 低 | 逐方法对比测试，确保行为一致 |
| 改动影响 ChatService.playbookMatcher | 中 | 低 | 保持公共 API 不变，渐进式迁移 |

---

## 6. 里程碑

| 里程碑 | 时间点 | 交付物 |
|--------|--------|--------|
| M1: Phase 1 完成 | Week 1 | PlaybookMatcher 6 个文件，测试通过 |
| M2: Phase 2 完成 | Week 2.5 | ToolRetrievalService 7 个文件，测试通过 |
| M3: Phase 3 完成 | Week 4.5 | AceStrategyManager 6 个文件，测试通过 |
| M4: Phase 4 完成 | Week 7.5 | ChatService 7 个文件，测试通过 |
| M5: 项目完成 | Week 8.5 | 所有重构完成，文档更新 |

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-30
**状态**: 评审通过
