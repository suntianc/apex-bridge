# 需求记录

**项目**: apex-bridge
**维护日期**: 2025-12-30

---

## 需求清单

| 序号 | 需求名称 | 优先级 | 状态 | 关联文档 |
|------|----------|--------|------|----------|
| R-001 | 项目重构需求（试点 ConfigService） | 高 | ✅ 已完成 | [01-project-refactoring.md](01-project-refactoring.md) | [01-project-refactoring-plan.md](../plans/01-project-refactoring-plan.md) |
| R-002 | 剩余模块重构需求 | 高 | 评审通过 | [02-remaining-modules-refactoring.md](02-remaining-modules-refactoring.md) | [02-remaining-modules-refactoring-plan.md](../plans/02-remaining-modules-refactoring-plan.md) |
| FD-001 | ConfigService 重构功能设计 | 高 | ✅ 已完成 | [01-ConfigService-refactoring-func/ConfigService-refactoring.md](../functionality-design/01-ConfigService-refactoring-func/ConfigService-refactoring.md)|
| FD-002 | PlaybookMatcher 重构功能设计 | 高 | 评审通过 | [02-remaining-modules-refactoring-func/PlaybookMatcher-refactoring.md](../functionality-design/02-remaining-modules-refactoring-func/PlaybookMatcher-refactoring.md)|
| FD-003 | ToolRetrievalService 重构功能设计 | 高 | 评审通过 | [02-remaining-modules-refactoring-func/ToolRetrievalService-refactoring.md](../functionality-design/02-remaining-modules-refactoring-func/ToolRetrievalService-refactoring.md)|
| FD-004 | AceStrategyManager 重构功能设计 | 高 | 评审通过 | [02-remaining-modules-refactoring-func/AceStrategyManager-refactoring.md](../functionality-design/02-remaining-modules-refactoring-func/AceStrategyManager-refactoring.md)|
| FD-005 | ChatService 重构功能设计 | 高 | 评审通过 | [02-remaining-modules-refactoring-func/ChatService-refactoring.md](../functionality-design/02-remaining-modules-refactoring-func/ChatService-refactoring.md)|
| FD-006 | R-003 Vector-Search 工具类型返回功能设计 | 高 | ✅ 已完成 | [03-Vector-Search-tool-type-func/03-Vector-Search-tool-type.md](../functionality-design/03-Vector-Search-tool-type-func/03-Vector-Search-tool-type.md)|
| R-004 | ACE 功能剔除需求 | 高 | 评审通过 | [04-ACE功能剔除.md](04-ACE功能剔除.md) | [04-ACE功能剔除.md](../functionality-design/04-ACE功能剔除-func/04-ACE功能剔除.md) |
| R-005 | OpenCode 架构特性集成需求 | 高 | 评审通过 | [05-opencode-integration.md](05-opencode-integration.md) | [05-opencode-integration-meeting.md](../meeting-minutes/05-opencode-integration-meeting.md) |
| FD-007 | R-005 P0-1: 多轮思考机制功能设计 | 高 | 评审通过 | [05-OpenCode-P0-1-multi-round-thinking.md](../functionality-design/05-OpenCode-integration-func/05-OpenCode-P0-1-multi-round-thinking.md) |
| FD-008 | R-005 P0-2: 消息结构 Part 抽象功能设计 | 高 | 评审通过 | [05-OpenCode-P0-2-message-part.md](../functionality-design/05-OpenCode-integration-func/05-OpenCode-P0-2-message-part.md) |
| FD-009 | R-005 P1-1: 工具调用框架功能设计 | 高 | 评审通过 | [05-OpenCode-P1-1-tool-framework.md](../functionality-design/05-OpenCode-integration-func/05-OpenCode-P1-1-tool-framework.md) |
| FD-010 | R-005 P1-2: Skill 工具集成功能设计 | 高 | 评审通过 | [05-OpenCode-P1-2-skill-integration.md](../functionality-design/05-OpenCode-integration-func/05-OpenCode-P1-2-skill-integration.md) |
| FD-011 | R-005 P1-3: MCP 工具增强功能设计 | 高 | 评审通过 | [05-OpenCode-P1-3-mcp-enhancement.md](../functionality-design/05-OpenCode-integration-func/05-OpenCode-P1-3-mcp-enhancement.md) |
| FD-012 | R-005 P2: 上下文压缩功能设计 | 中 | 评审通过 | [05-OpenCode-P2-context-compaction.md](../functionality-design/05-OpenCode-integration-func/05-OpenCode-P2-context-compaction.md) |

## R-005: OpenCode 架构特性集成需求

### 需求概述

在完成 ACE 功能剔除（R-004）后，apex-bridge 系统架构已简化，但相比 opencode 项目仍缺少一些重要的架构特性。本需求旨在集成 opencode 的成熟实现，增强 apex-bridge 的多轮思考、消息结构、工具调用能力。

### 核心目标

1. **增强多轮思考机制**: 引入完整的思考追踪、步骤边界、Doom Loop 检测
2. **优化消息结构**: 完整迁移到 Part 抽象，支持更丰富的消息语义
3. **规范化工具调用**: 引入 Tool.define() 工厂模式，统一工具定义和执行
4. **Skill/MCP 增强**: 集成 skill 调用和 MCP 工具转换
5. **支持上下文压缩**: 实现 token 溢出时的上下文自动压缩（双重检查）

### 分阶段实施计划

| 优先级 | 模块 | 目标 |
|--------|------|------|
| **P0** | 多轮思考机制 | 引入完整的思考追踪、步骤边界、Doom Loop 检测 |
| **P0** | 消息结构优化 | 完整迁移到 Part 抽象，支持更丰富的消息语义 |
| **P1** | 工具调用框架 | 引入 Tool.define() 工厂模式，统一工具定义和执行 |
| **P1** | Skill 工具集成 | 支持 skill 扫描、SKILL.md 解析、SkillTool 执行 |
| **P1** | MCP 工具增强 | convertMcpTool() 转换、资源读取支持 |
| **P2** | 上下文压缩 | 实现 token 溢出时的上下文自动压缩 |

### 关键决策

1. **消息 Part 迁移策略**: 完整迁移到 Part 结构（API 可能变更）
2. **Doom Loop 检测**: 按照 opencode 机制实现（DOOM_LOOP_THRESHOLD = 3）
3. **上下文压缩触发时机**: 双重检查（LLM 调用前 + 工具执行后）
4. **权限系统**: 暂不实现，移至后续迭代
5. **FR-20 User 消息扩展**: 全部字段实现，summary 按需生成（仅上下文压缩触发时）
6. **FR-21 Assistant 消息扩展**: 全部字段实现，cost/tokens 按 OpenCode 格式

### 架构差距分析（基于深度代码分析）

| 模块 | 现有实现 | 改造/新增点 |
|------|---------|------------|
| 多轮思考 | 仅有 basic ReAct 循环 | **需新增**：reasoning-start/delta/end 事件流、时间戳、步骤边界、Doom Loop |
| 消息结构 | 简单 Message/ContentPart | **需新增**：PartBase 基类、ToolState 状态机、ReasoningPart 等 |
| 工具框架 | BuiltInTool + BuiltInToolsRegistry | **需改造**：为 Tool.define() 模式，保留现有逻辑 |
| Skill | SkillManager 已存在，SKILL.md 解析已实现 | **需改造**：适配 Tool.define() 模式，新增 Direct 模式 |
| MCP | MCPIntegrationService 已存在，resource 类型已支持 | **需增强**：convertMcpTool()、工具命名规范、resource URI 解析 |

### 需要修改的文件

**P0 优先级（必须修改现有文件）**:
- `src/types/index.ts` - 扩展 Message/ContentPart，添加 Part 基类
- `src/core/stream-orchestrator/ReActEngine.ts` - 增加事件类型、Doom Loop 检测
- `src/strategies/ReActStrategy.ts` - 适配新事件流
- `src/core/tool-action/ToolDispatcher.ts` - 适配 Tool.define() 模式
- `src/core/tool-action/tool-system.ts` - 改造 BuiltInTool 为 Tool.Info 兼容模式
- `src/services/BuiltInToolsRegistry.ts` - 改造为 ToolRegistry
- `src/services/SkillManager.ts` - 适配 Tool.define() 模式，增加 Direct 模式
- `src/services/MCPIntegrationService.ts` - 适配 Tool.define() 模式

**P1 优先级（新建文件）**:
- `src/types/message-v2.ts` - Part 抽象和类型定义
- `src/types/tool-state.ts` - ToolState 状态机
- `src/core/tool/tool.ts` - Tool.define() 工厂（基于现有 BuiltInTool）
- `src/core/tool/registry.ts` - ToolRegistry（替换 BuiltInToolsRegistry）
- `src/services/mcp/convert.ts` - MCP 工具转换器（convertMcpTool）

### 验收标准

- [ ] TypeScript 编译无错误
- [ ] 单元测试覆盖率 80%+
- [ ] 现有功能 100% 正常
- [ ] 每个阶段完成后进行完整验证

### 文档位置

`docs/requirements/05-opencode-integration.md`
`docs/meeting-minutes/05-opencode-integration-meeting.md`

---

## R-004: ACE 功能剔除需求

### 需求概述

剔除所有 ACE 相关功能，简化系统架构，保留核心 LLM 调用和工具执行能力。

### 核心目标

1. **移除内容**:
   - ACE 框架（六层认知架构）
   - 上下文压缩机制
   - 伦理守卫（AceEthicsGuard）
   - 战略管理器（AceStrategyManager）
   - 集成服务（AceIntegrator）
   - 轨迹记录和反思机制
   - Playbook 自动提炼系统

2. **保留内容**:
   - LLM 调用能力（LLMManager、多模型适配器）
   - 工具执行能力（Skill/MCP/Builtin）
   - 基础对话历史（ConversationHistoryService）
   - 向量搜索工具检索（ToolRetrievalService、SearchEngine）

### 验收标准

- [ ] TypeScript 编译无错误
- [ ] API 接口行为 100% 一致
- [ ] 核心对话功能 100% 正常
- [ ] 工具执行功能 100% 正常

### 文档位置

`docs/requirements/04-ACE功能剔除.md`

---

## R-001: 项目重构需求（试点 ConfigService）

### 需求概述

对 apex-bridge 项目进行分阶段重构，解决代码臃肿、职责混乱、冗余代码、类型系统问题，以 ConfigService 为试点模块。

### 关键决策

1. **试点模块选择**: ConfigService
   - 理由：1050 行超大文件，问题明确，风险可控
   - 预估工时：4 周

2. **重构范围**:
   - 文件拆分：从 1 个 1050 行文件拆分为 7 个小文件
   - 类型独立：20+ 接口定义迁移到 types/config/ 目录
   - 服务拆分：ConfigLoader、ConfigValidator、ConfigWriter

3. **兼容性约束**:
   - API 接口保持不变
   - 配置 JSON 结构保持不变
   - 提供类型别名兼容层

### 验收标准

- [ ] 单个文件不超过 500 行
- [ ] 消除所有 `any` 类型
- [ ] 单元测试覆盖率 80%+
- [ ] TypeScript 编译无错误
- [ ] 现有功能 100% 正常

### 分阶段计划

| 阶段 | 内容 | 预估工时 |
|------|------|----------|
| 阶段一 | 准备阶段（测试基准、依赖分析） | 1 周 |
| 阶段二 | 类型拆分（配置类型独立） | 1 周 |
| 阶段三 | 服务拆分（ConfigLoader/Validator/Writer） | 1 周 |
| 阶段四 | 兼容性与优化 | 1 周 |

### 后续计划

ConfigService 重构完成后，推广经验至：
1. PlaybookMatcher (2周)
2. ChatService (3周)
3. UnifiedToolManager (2周)
4. 类型系统统一 (2周)

### 完成信息

- **完成日期**: 2025-12-30
- **重构状态**: ✅ 已完成
- **产出文件**:
  - `src/types/config/api-key.ts`
  - `src/types/config/rate-limit.ts`
  - `src/types/config/redis.ts`
  - `src/types/config/ace.ts`
  - `src/types/config/admin.ts`
  - `src/types/config/index.ts`
  - `src/utils/config-loader.ts`
  - `src/utils/config-validator.ts`
  - `src/utils/config-writer.ts`
  - `src/utils/config-constants.ts`
  - `src/utils/config/index.ts`

---

## FD-001: ConfigService 重构功能设计

### 文档位置

`docs/functionality-design/01-ConfigService-refactoring.md`

### 设计概述

基于 R-001 需求，对 ConfigService 模块进行功能级详细设计：

1. **模块结构设计**:
   - 目标目录结构：7 个文件分散职责
   - 文件职责划分清晰
   - 依赖关系图

2. **类型拆分方案**:
   - ApiKeyInfo -> types/config/api-key.ts
   - RateLimit* -> types/config/rate-limit.ts
   - RedisConfig -> types/config/redis.ts
   - Ace* -> types/config/ace.ts
   - AdminConfig/SystemConfig/FullConfig -> types/config/admin.ts

3. **服务拆分设计**:
   - ConfigLoader: 配置加载和缓存
   - ConfigValidator: 配置验证逻辑
   - ConfigWriter: 配置更新和合并
   - ConfigConstants: 默认配置常量

4. **接口兼容性设计**:
   - 类型别名兼容层
   - API 接口保持不变
   - 数据格式兼容性

### 关键设计决策

| 决策项 | 决策 | 理由 |
|--------|------|------|
| 类型文件位置 | types/config/ 子目录 | 与现有 types/ 目录结构一致 |
| 工具文件位置 | utils/config/ 子目录 | 与现有 utils/ 目录结构一致 |
| 默认常量位置 | utils/config-constants.ts | 避免循环依赖 |
| 主服务简化 | 使用组合而非继承 | 更灵活的依赖注入 |

### 迁移步骤

| 阶段 | 内容 | 预计工时 |
|------|------|----------|
| 第一阶段 | 创建 6 个类型文件 | 4h |
| 第二阶段 | 创建 4 个工具服务 | 6h |
| 第三阶段 | 重构 ConfigService 主服务 | 3h |
| 第四阶段 | 验证与测试 | 3h |

### 验收标准

- [ ] 单个文件不超过 300 行
- [ ] TypeScript 编译无错误
- [ ] API 接口行为 100% 一致
- [ ] 单元测试覆盖率 80%+
- [ ] 文档更新完整

### 关联需求

- R-001: 项目重构需求（试点 ConfigService）

---

## FD-002: PlaybookMatcher 重构功能设计

### 文档位置

`docs/functionality-design/02-01-PlaybookMatcher-refactoring.md`

### 设计概述

基于 R-002 需求，对 PlaybookMatcher 模块进行功能级详细设计：

1. **模块结构设计**:
   - 目标目录结构：`src/services/playbook/` 目录下 6 个文件
   - PlaybookMatcher.ts (主协调器 200行)
   - ScoreCalculator.ts (评分计算器 200行)
   - DynamicTypeMatcher.ts (动态类型匹配 250行)
   - SequenceRecommender.ts (序列推荐 200行)
   - PlaybookCurator.ts (知识库维护 250行)
   - PlaybookMatcher.types.ts (类型定义 100行)

2. **职责划分**:
   - PlaybookMatcher: 主协调器，公共 API
   - ScoreCalculator: 统一评分算法
   - DynamicTypeMatcher: 动态类型匹配逻辑
   - SequenceRecommender: Playbook 序列推荐
   - PlaybookCurator: 知识库维护 (去重/归档)

3. **依赖注入设计**:
   - 通过构造函数注入子模块
   - 保持公共 API 不变

### 关键设计决策

| 决策项 | 决策 | 理由 |
|--------|------|------|
| 目录位置 | src/services/playbook/ | 与 playbook 相关模块集中管理 |
| 接口设计 | 每个子模块定义接口 | 便于测试和替换 |
| 类型管理 | 独立 types 文件 | 避免循环依赖 |

### 迁移步骤

| 阶段 | 内容 | 预计工时 |
|------|------|----------|
| 阶段一 | 创建类型定义 | 4h |
| 阶段二 | 创建子模块 (4个) | 20h |
| 阶段三 | 重构主服务 | 6h |
| 阶段四 | 验证与测试 | 7h |

### 验收标准

- [ ] 单个文件不超过 500 行
- [ ] 消除所有 `any` 类型
- [ ] 单元测试覆盖率 80%+
- [ ] 保持公共 API 不变

### 关联需求

- R-002: 剩余模块重构需求

---

## FD-003: ToolRetrievalService 重构功能设计

### 文档位置

`docs/functionality-design/02-02-ToolRetrievalService-refactoring.md`

### 设计概述

基于 R-002 需求，对 ToolRetrievalService 模块进行功能级详细设计：

1. **模块结构设计**:
   - 目标目录结构：`src/services/tool-retrieval/` 目录下 7 个文件
   - ToolRetrievalService.ts (主服务 200行)
   - LanceDBConnection.ts (数据库连接 150行)
   - EmbeddingGenerator.ts (嵌入生成 200行)
   - SkillIndexer.ts (技能索引 200行)
   - SearchEngine.ts (搜索逻辑 200行)
   - MCPToolSupport.ts (MCP 工具支持 150行)
   - types.ts (类型定义 100行)

2. **职责划分**:
   - ToolRetrievalService: 主服务，公共 API
   - LanceDBConnection: 数据库连接和 Schema 管理
   - EmbeddingGenerator: 嵌入生成逻辑
   - SkillIndexer: 技能索引操作
   - SearchEngine: 向量搜索和结果格式化
   - MCPToolSupport: MCP 工具特殊处理

### 关键设计决策

| 决策项 | 决策 | 理由 |
|--------|------|------|
| 目录位置 | src/services/tool-retrieval/ | 与检索相关模块集中管理 |
| 数据库抽象 | 独立连接管理 | 便于测试和替换 |
| 嵌入模型 | 抽象接口 | 支持多模型切换 |

### 迁移步骤

| 阶段 | 内容 | 预计工时 |
|------|------|----------|
| 阶段一 | 创建类型定义 | 4h |
| 阶段二 | 创建子模块 (5个) | 24h |
| 阶段三 | 重构主服务 | 6h |
| 阶段四 | 验证与测试 | 7h |

### 验收标准

- [ ] 单个文件不超过 500 行
- [ ] 数据库连接逻辑独立
- [ ] 嵌入生成可独立替换
- [ ] 单元测试覆盖率 80%+

### 关联需求

- R-002: 剩余模块重构需求

---

## FD-004: AceStrategyManager 重构功能设计

### 文档位置

`docs/functionality-design/02-03-AceStrategyManager-refactoring.md`

### 设计概述

基于 R-002 需求，对 AceStrategyManager 模块进行功能级详细设计：

1. **模块结构设计**:
   - 目标目录结构：`src/services/ace/` 目录下 6 个文件
   - AceStrategyManager.ts (主管理器 250行)
   - StrategicContextManager.ts (战略上下文管理 200行)
   - WorldModelUpdater.ts (世界模型更新 200行)
   - PlaybookSynthesis.ts (Playbook 自动提炼 250行)
   - MemoryManager.ts (内存管理 150行)
   - types.ts (类型定义 100行)

2. **关键决策**:
   - AceStrategyManager 内部实例化的 PlaybookManager 和 PlaybookMatcher 改为**依赖注入**
   - 不引入依赖注入容器，使用手动依赖注入
   - 内存管理逻辑独立

3. **依赖注入设计**:
   - PlaybookManager 和 PlaybookMatcher 通过构造函数注入
   - 便于测试和模块替换

### 关键设计决策

| 决策项 | 决策 | 理由 |
|--------|------|------|
| 目录位置 | src/services/ace/ | 与 ACE 相关模块集中管理 |
| 依赖注入 | 手动注入 | 简单直接，避免容器复杂度 |
| Playbook 系统 | 外部注入 | 解耦核心逻辑 |

### 迁移步骤

| 阶段 | 内容 | 预计工时 |
|------|------|----------|
| 阶段一 | 创建类型定义 | 4h |
| 阶段二 | 创建子模块 (4个) | 24h |
| 阶段三 | 重构主服务 | 8h |
| 阶段四 | 验证与测试 | 7h |

### 验收标准

- [ ] 单个文件不超过 500 行
- [ ] Playbook 系统可独立实例化
- [ ] 内存管理逻辑独立
- [ ] 单元测试覆盖率 80%+

### 关联需求

- R-002: 剩余模块重构需求

---

## FD-005: ChatService 重构功能设计

### 文档位置

`docs/functionality-design/02-04-ChatService-refactoring.md`

### 设计概述

基于 R-002 需求，对 ChatService 模块进行功能级详细设计：

1. **模块结构设计**:
   - 目标目录结构：`src/services/chat/` 目录下 7 个文件
   - ChatService.ts (主协调器 300行)
   - MessageProcessor.ts (消息处理 250行)
   - SessionCoordinator.ts (会话协调 200行)
   - StreamHandler.ts (流式处理 200行)
   - EthicsFilter.ts (伦理审查 150行)
   - ContextManager.ts (上下文管理 200行)
   - types.ts (类型定义 100行)

2. **关键决策**:
   - **不引入依赖注入容器**
   - 仅通过拆分职责降低耦合度
   - 保持所有公共 API 不变

3. **子模块设计**:
   - EthicsFilter: 伦理审查逻辑
   - SessionCoordinator: 会话管理协调
   - MessageProcessor: 消息预处理、变量注入
   - ContextManager: 上下文管理协调
   - StreamHandler: 流式消息处理

### 关键设计决策

| 决策项 | 决策 | 理由 |
|--------|------|------|
| 目录位置 | src/services/chat/ | 与聊天相关模块集中管理 |
| 依赖注入 | 不使用容器 | 保持现状，仅拆分职责 |
| 子模块 | 手动实例化 | 简化依赖管理 |

### 迁移步骤

| 阶段 | 内容 | 预计工时 |
|------|------|----------|
| 阶段一 | 创建类型定义 | 4h |
| 阶段二 | 创建子模块 (5个) | 30h |
| 阶段三 | 重构主服务 | 7h |
| 阶段四 | 验证与测试 | 12h |

### 验收标准

- [ ] 单个文件不超过 500 行
- [ ] 各子模块可独立测试
- [ ] 保持 WebSocket 接口兼容
- [ ] 单元测试覆盖率 80%+

### 关联需求

- R-002: 剩余模块重构需求

---

## R-002: 剩余模块重构需求

### 需求概述

在 ConfigService 重构试点完成后，对剩余4个超大服务文件进行重构：PlaybookMatcher、ChatService、ToolRetrievalService、AceStrategyManager。

### 关键决策

1. **重构优先级**:
   - Phase 1: PlaybookMatcher (2周) - 问题最明确，收益高
   - Phase 2: ToolRetrievalService (1.5周) - 相对独立，重构风险低
   - Phase 3: AceStrategyManager (2周) - 与 Playbook 系统深度耦合
   - Phase 4: ChatService (3周) - 核心服务，最后重构

2. **重构范围**:
   - PlaybookMatcher: 拆分为 ScoreCalculator、DynamicTypeMatcher、SequenceRecommender、PlaybookCurator
   - ToolRetrievalService: 拆分为 LanceDBConnection、EmbeddingGenerator、SkillIndexer、SearchEngine
   - AceStrategyManager: 拆分为 StrategicContextManager、WorldModelUpdater、PlaybookSynthesis、MemoryManager
   - ChatService: 拆分为 MessageProcessor、SessionCoordinator、StreamHandler、EthicsFilter

3. **兼容性约束**:
   - 所有公共 API 接口保持不变
   - 数据库 Schema 保持向后兼容
   - 提供 Feature Flag 支持渐进式迁移

### 验收标准

- [ ] 单个文件不超过 500 行
- [ ] 消除所有 `any` 类型
- [ ] 单元测试覆盖率 80%+
- [ ] TypeScript 编译无错误
- [ ] 现有功能 100% 正常

### 分阶段计划

| 阶段 | 模块 | 预估工时 |
|------|------|----------|
| Phase 1 | PlaybookMatcher | 2 周 |
| Phase 2 | ToolRetrievalService | 1.5 周 |
| Phase 3 | AceStrategyManager | 2 周 |
| Phase 4 | ChatService | 3 周 |

### 文档位置

`docs/requirements/02-remaining-modules-refactoring.md`

| R-003 | Vector-Search 工具类型返回 | 高 | ✅ 已完成 | [03-vector-search-tool-type.md](03-vector-search-tool-type.md) | [FD-006 功能设计](docs/functionality-design/03-Vector-Search-tool-type.md) |

---

## R-003: Vector-Search 工具类型返回

### 需求概述

当前使用内置工具 `vector-search` 检索出来的工具没有返回工具类型，按照项目内设定，工具分为三类：**mcp**（外部 MCP 服务器工具）、**builtin**（内置工具）、**skill**（技能工具）。

由于检索结果缺少工具类型（`toolType`）字段，导致 LLM 无法正确选择工具，错误地使用 `readskill` 内置工具去读取 skill。

### 问题分析

1. **症状**: LLM 错误使用 `readskill` 工具调用 skill
2. **根因**: `vector-search` 返回结果缺少 `toolType` 字段
3. **影响**: 工具调用逻辑混乱，增加不必要的中间调用

### 预期目标

1. `vector-search` 检索结果包含 `toolType` 字段
2. LLM 根据 `toolType` 正确选择调用策略
3. 三类工具调用路径清晰

### 工具类型定义

| 类型值 | 含义 | 示例 |
|--------|------|------|
| `mcp` | 外部 MCP 服务器工具 | `filesystem`, `postgres` |
| `builtin` | 系统内置工具 | `vector-search`, `read-file` |
| `skill` | 用户定义 skill | `data-validator`, `git-commit-helper` |

### 验收标准

- [ ] `vector-search` 返回结果包含 `toolType` 字段
- [ ] `toolType` 值为 `"mcp"`、`"builtin"` 或 `"skill"`
- [ ] LLM 正确选择工具调用策略
- [ ] TypeScript 编译无错误

### 文档位置

`docs/requirements/03-vector-search-tool-type.md`

---

## FD-006: R-003 Vector-Search 工具类型返回功能设计

### 文档位置

`docs/functionality-design/03-Vector-Search-tool-type-func/03-Vector-Search-tool-type.md`

### 设计概述

基于 R-003 需求，对 Vector-Search 工具类型返回进行功能级详细设计：

1. **修改范围**：
   - `types.ts`: `ToolRetrievalResult` 接口添加 `toolType` 字段
   - `SearchEngine.ts`: `formatSearchResults` 添加 `toolType`，`formatTool` 添加 `builtin` 处理

2. **核心变更**：
   - 返回结果包含顶层 `toolType` 字段
   - 完整处理三类工具：mcp、builtin、skill

3. **业务流程**：
   - LLM → vector-search → SearchEngine → LanceDB → 返回结果（含 toolType）

### 关键设计决策

| 决策项 | 决策 | 理由 |
|--------|------|------|
| toolType 位置 | 顶层字段 | LLM 可直接读取，无需解析 metadata |
| 类型来源 | 直接从数据库读取 | 避免额外计算，性能最优 |
| 默认值 | toolType 为空时默认 skill | 向后兼容，避免异常 |

### 实现清单

| 任务 | 文件 | 修改内容 |
|------|------|----------|
| 修改接口 | `types.ts` | `ToolRetrievalResult` 添加 `toolType` |
| 修改格式化 | `SearchEngine.ts` | `formatSearchResults` 添加 `toolType` |
| 添加 builtin | `SearchEngine.ts` | `formatTool` 添加 `builtin` 处理 |
| 扩展 Schema | `types.ts` | `ToolsTable.toolType` 扩展为三类 |

### 验收标准

- [ ] 返回结果包含顶层 `toolType` 字段
- [ ] `toolType` 值为 `'mcp'`、`'builtin'` 或 `'skill'`
- [ ] TypeScript 编译无错误
- [ ] 现有功能 100% 正常

### 关联需求

- R-003: Vector-Search 工具类型返回

---

## 版本历史

| 版本 | 日期 | 描述 |
|------|------|------|
| 1.0.0 | 2025-12-29 | 初始需求记录 |
| 1.1.0 | 2025-12-30 | 添加功能设计文档关联 (FD-001) |
| 1.2.0 | 2025-12-30 | 状态更新：评审通过 |
| 1.3.0 | 2025-12-30 | 添加剩余模块重构需求 (R-002) |
| 1.4.0 | 2025-12-30 | R-002 评审通过 |
| 1.5.0 | 2025-12-30 | 添加功能设计文档 (FD-002 ~ FD-005) |
| 1.6.0 | 2025-12-30 | FD-002 ~ FD-005 评审通过 |
| 1.7.0 | 2025-12-30 | 添加开发计划，R-002 评审通过 |
| 1.8.0 | 2025-12-30 | 添加 R-001 开发计划，完成追溯链 |
| 1.9.0 | 2025-12-30 | R-001 ConfigService 重构完成，状态更新为"已完成" |
| 1.10.0 | 2025-12-30 | 添加 R-003: Vector-Search 工具类型返回需求 |
| 1.11.0 | 2025-12-30 | R-003 评审通过，完善实现方案 |
| 1.12.0 | 2025-12-30 | 添加 FD-006 功能设计文档 |
| 1.13.0 | 2025-12-30 | R-003 实现完成，FD-006 状态更新为"已完成" |
| 1.14.0 | 2026-01-08 | 添加 R-005: OpenCode 架构特性集成需求 |
| 1.15.0 | 2026-01-09 | R-005 评审通过，确认分阶段实施计划 |
| 1.16.0 | 2026-01-09 | R-005 架构深度对比分析完成，更新需求文档 |
| 1.17.0 | 2026-01-09 | R-005 复查：修正 Skill/MCP 已有实现描述，改为改造模式 |
| 1.18.0 | 2026-01-09 | R-005 FR-20/FR-21 消息角色扩展讨论完成，明确字段定义和按需生成策略 |
| 1.19.0 | 2026-01-09 | R-005 功能设计文档完成（FD-007 ~ FD-012）：多轮思考、消息 Part、工具框架、Skill/MCP 增强、上下文压缩 |
