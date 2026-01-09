# R-005: OpenCode 架构特性集成需求

**创建日期**: 2026-01-08
**优先级**: 高
**状态**: 待评审

---

## 1. 业务背景

在完成 ACE 功能剔除（R-004）后，apex-bridge 系统架构已简化，但相比 opencode 项目仍缺少一些重要的架构特性：

1. **多轮思考机制不完善**: 当前 ReActStrategy 缺乏完整的思考过程追踪、步骤边界管理和 Doom Loop 检测
2. **消息结构缺乏 Part 抽象**: 现有消息格式较为简单，无法表达思考、子任务、步骤边界等复杂语义
3. **工具调用框架不够规范**: 缺乏统一的工具定义工厂和细粒度的工具状态管理
4. **权限系统缺失**: 缺少 opencode 的 PermissionNext 细粒度权限控制机制
5. **上下文压缩缺失**: 剔除 ACE 时一并移除的上下文压缩机制对长对话场景很重要

opencode 项目在这些方面有成熟的实现，可以作为 apex-bridge 的重要参考和集成来源。

---

## 2. 需求目标

### 2.0 现有架构分析

根据对 apex-bridge 当前实现的深度分析，发现以下与 R-005 需求的差距：

#### 2.0.1 多轮思考机制差距

| 需求功能 | 现有实现 (ReActStrategy.ts) | 差距 |
|---------|---------------------------|------|
| reasoning-start/delta/end 事件流 | 仅 `reasoning` 事件 | **重大差距** - 缺少事件细分 |
| 思考时间戳 (start/end) | 无时间戳记录 | **重大差距** |
| ReasoningPart 类型 | 无 Part 抽象 | **重大差距** |
| start-step/finish-step 步骤边界 | 无 | **重大差距** |
| Doom Loop 检测 | 无 | **完全缺失** |

#### 2.0.2 消息结构差距

| 需求类型 | 现有实现 (types/index.ts) | 差距 |
|---------|--------------------------|------|
| PartBase 基类 | 无 | **完全缺失** |
| ReasoningPart, ToolPart, StepStartPart | 无 | **完全缺失** |
| ToolState 状态机 | 简单 ToolResult 接口 | **需重构** |
| 消息元信息扩展 | 基本 Message 接口 | **需扩展** |

#### 2.0.3 工具调用框架差距

| 需求功能 | 现有实现 | 差距 |
|---------|---------|------|
| Tool.define() 工厂函数 | 仅 BuiltInTool 接口 | **完全缺失** |
| Tool.Context 参数 | 仅 args | **需重构** |
| ToolRegistry 集中管理 | BuiltInToolsRegistry | **需重构** |
| metadata() 方法 | 无 | **完全缺失** |

#### 2.0.4 Skill 实现差距

> **重要更正**：SkillManager 和 SKILL.md 解析已存在，非"完全缺失"

| 需求功能 | 现有实现 | 差距/改造点 |
|---------|---------|------------|
| SkillManager | ✅ 已存在（`src/services/SkillManager.ts`） | 需适配 Tool.define() 模式 |
| SKILL.md 解析 | ✅ 已存在（`listSkills` 方法解析 YAML frontmatter） | 需扩展 Direct 模式支持 |
| Skill 扫描 | ✅ 已存在（`initializeSkillsIndex` 自动扫描） | 需增加自定义路径扫描 |
| Skill 调用 | ✅ 沙箱模式（`scripts/execute.js`） | 需增加 Direct 模式（Markdown 直接返回） |
| Skill 工具注册 | ✅ 代理模式注册为 BuiltInTool | 需改为统一工具定义模式 |

#### 2.0.5 MCP 集成差距

> **重要更正**：MCPIntegrationService 和 resource 类型已存在，非"完全缺失"

| 需求功能 | 现有实现 | 差距/改造点 |
|---------|---------|------------|
| MCPIntegrationService | ✅ 已存在 | 需适配 Tool.define() 模式 |
| MCP 工具调用 | ✅ 已实现（`callTool` 方法） | 需实现 convertMcpTool() 统一转换 |
| 工具名称格式 | ✅ 原始名称 | 需支持 `{clientName}_{toolName}` 格式 |
| resource 类型 | ✅ MCPToolContent 支持 `resource` 类型 | 需实现 mcp:// URI 解析 |
| 工具索引 | ✅ 已有 `toolIndex` Map | 需扩展为统一工具注册表 |

#### 2.0.6 工具调用框架差距

> **重要更正**：BuiltInTool 和 BuiltInToolsRegistry 已存在，需改造为 Tool.define() 模式

| 需求功能 | 现有实现 | 差距/改造点 |
|---------|---------|------------|
| BuiltInTool | ✅ 已存在完整定义 | 需改造为 Tool.Info 接口 |
| BuiltInToolsRegistry | ✅ 单例模式实现 | 需改造为 ToolRegistry |
| 工具注册/执行 | ✅ 已有 `registerTool`/`execute` 方法 | 需适配 Tool.Context 参数 |
| metadata() 方法 | ❌ 无 | 需新增工具状态更新方法 |
| Tool.define() 工厂 | ❌ 无 | 需基于现有 BuiltInTool 实现 |

### 2.0.7 需要修改的文件清单

**P0 优先级（必须修改）**:
| 文件 | 修改内容 |
|------|---------|
| `src/types/index.ts` | 扩展 Message/ContentPart，添加 Part 基类 |
| `src/core/stream-orchestrator/ReActEngine.ts` | 增加事件类型、Doom Loop 检测 |
| `src/strategies/ReActStrategy.ts` | 适配新事件流 |
| `src/core/tool-action/ToolDispatcher.ts` | 适配 Tool.define() 模式 |
| `src/core/tool-action/tool-system.ts` | 改造 BuiltInTool 为 Tool.Info 兼容模式 |
| `src/services/BuiltInToolsRegistry.ts` | 改造为 ToolRegistry |
| `src/services/SkillManager.ts` | 适配 Tool.define() 模式，增加 Direct 模式 |
| `src/services/MCPIntegrationService.ts` | 适配 Tool.define() 模式 |

**P1 优先级（新建文件）**:
| 新建文件 | 功能 |
|------|------|
| `src/types/message-v2.ts` | Part 抽象和类型定义（TextPart, ReasoningPart, ToolPart 等） |
| `src/types/tool-state.ts` | ToolState 状态机（pending/running/completed/error） |
| `src/core/tool/tool.ts` | Tool.define() 工厂，基于现有 BuiltInTool 实现 |
| `src/core/tool/registry.ts` | ToolRegistry，替换 BuiltInToolsRegistry |
| `src/services/mcp/convert.ts` | MCP 工具转换器（convertMcpTool） |

**P2 优先级（可选增强）**:
| 功能 | 说明 |
------|------|
| 上下文压缩 | SessionCompaction 实现 |
| 权限系统 | PermissionNext 集成（后续迭代） |

---

## 2. 需求目标

### 2.1 分阶段实施计划

| 优先级 | 模块 | 目标 |
|--------|------|------|
| **P0** | 多轮思考机制 | 引入完整的思考追踪、步骤边界、Doom Loop 检测 |
| **P0** | 消息结构优化 | 采用 Part 抽象，支持更丰富的消息语义 |
| **P1** | 工具调用框架 | 引入 Tool.define() 工厂模式，统一工具定义和执行 |
| **P1** | Skill 工具集成 | 支持 skill 扫描、SKILL.md 解析、SkillTool 执行 |
| **P1** | MCP 工具增强 | convertMcpTool() 转换、资源读取支持 |
| **P1** | 权限系统 | 暂不实现（后续迭代） |
| **P2** | 上下文压缩 | 实现 token 溢出时的上下文自动压缩 |

### 2.2 核心目标

1. **增强多轮思考机制**: 引入完整的思考追踪、步骤边界、Doom Loop 检测
2. **优化消息结构**: 完整迁移到 Part 抽象，支持更丰富的消息语义
3. **规范化工具调用**: 引入 Tool.define() 工厂模式，统一工具定义和执行
4. **Skill/MCP 增强**: 集成 skill 调用和 MCP 工具转换
5. **支持上下文压缩**: 实现 token 溢出时的上下文自动压缩（双重检查）

### 2.3 预期收益

| 方面 | 现状 | 改进后 |
|------|------|--------|
| 多轮推理 | 基本 ReAct 循环 | 完整思考追踪 + Doom Loop 检测 |
| 消息格式 | 简单 JSON | Part 抽象的语义化消息 |
| 工具调用 | 分散实现 | 统一工厂模式 + 状态机管理 |
| 权限控制 | 无 | 细粒度工具调用权限 |
| 长对话 | 依赖 LLM 上下文限制 | 自动上下文压缩 |

---

## 3. 功能需求

### 3.1 多轮思考机制增强

#### 3.1.1 思考过程追踪

- **FR-01**: 实现 `reasoning-start` / `reasoning-delta` / `reasoning-end` 事件流处理
- **FR-02**: 记录思考内容的 `start` / `end` 时间戳
- **FR-03**: 支持在消息中嵌入 `ReasoningPart` 类型

#### 3.1.2 步骤边界管理

- **FR-04**: 实现 `start-step` / `finish-step` 事件标识推理步骤边界
- **FR-05**: 支持 `StepStartPart` 和 `StepFinishPart` 消息部分
- **FR-06**: 步骤计数器随每次工具调用递增

#### 3.1.3 Doom Loop 检测

- **FR-07**: 实现无限循环检测机制（按照 opencode 机制：DOOM_LOOP_THRESHOLD = 3）
- **FR-08**: 检测连续 3 次工具调用模式重复则判定为 Doom Loop
- **FR-09**: 当检测到循环时触发中断并返回错误信息
- **FR-10**: 提供 Doom Loop 配置项允许自定义阈值

### 3.2 消息结构优化

#### 3.2.1 Part 抽象（完整迁移）

- **FR-11**: 定义统一的 `PartBase` 类型作为所有 Part 的基类
- **FR-12**: 实现 `TextPart` - 文本内容部分
- **FR-13**: 实现 `SubtaskPart` - 子任务部分
- **FR-14**: 实现 `ReasoningPart` - 思考过程部分
- **FR-15**: 实现 `ToolPart` - 工具调用部分
- **FR-16**: 实现 `StepStartPart` / `StepFinishPart` - 步骤边界部分
- **FR-17**: 实现 `FilePart` - 文件内容部分
- **FR-18**: 实现 `SnapshotPart` / `PatchPart` - 状态快照部分
- **FR-19**: 消息格式完整迁移到 Part 结构

#### 3.2.2 消息角色扩展

- **FR-20**: 扩展 User 消息，包含以下元信息字段：
  - `summary`: 对话摘要 `{ title?, body?, diffs? }`，**按需生成**（仅在上下文压缩触发时生成）
  - `agent`: 处理此消息的 agent 标识
  - `model`: 使用的模型信息 `{ providerID, modelID }`
  - `system`: 系统提示词变体
  - `tools`: 可用工具状态 `Record<string, boolean>`
  - `variant`: 消息变体标识

- **FR-21**: 扩展 Assistant 消息，包含以下统计信息字段：
  - `cost`: 货币成本（按照 opencode 形式，从 provider 响应获取）
  - `tokens`: Token 统计信息
    - `input`: 输入 token 数量
    - `output`: 输出 token 数量
    - `reasoning`: 思考 token 数量
    - `cache`: Cache token 统计 `{ read, write }`
  - `agent`: 处理此消息的 agent 标识
  - `path`: 执行上下文 `{ cwd, root }`
  - `time.completed`: 完成时间戳

- **FR-22**: 实现 `toModelMessage()` 转换方法，将内部消息格式转换为 AI SDK 格式

#### 3.2.3 ToolState 状态机

- **FR-23**: 定义 `ToolStatePending` - 工具调用待执行状态
- **FR-24**: 定义 `ToolStateRunning` - 工具执行中状态（含 start 时间戳）
- **FR-25**: 定义 `ToolStateCompleted` - 工具执行完成状态（含 end 时间戳和附件）
- **FR-26**: 定义 `ToolStateError` - 工具执行错误状态

### 3.3 工具调用框架规范化

#### 3.3.1 Tool.define() 工厂模式

- **FR-27**: 定义 `Tool.Info` 接口，包含 `id`、`description`、`parameters`、`execute`
- **FR-28**: 实现 `Tool.define()` 工厂函数
- **FR-29**: 工具 `execute` 方法接收 `Context` 参数（含 sessionID、messageID、callID、abort）
- **FR-30**: 支持 `metadata()` 方法更新工具执行状态

#### 3.3.2 工具注册机制

- **FR-31**: 实现 `ToolRegistry` 集中管理所有工具
- **FR-32**: 内置工具列表：bash、read、glob、grep、edit、write、task、web-fetch、todo-write、todo-read、web-search、code-search
- **FR-33**: 支持自定义工具扩展

### 3.4 Skill 工具集成（改造现有实现）

> **说明**：SkillManager 已存在，需改造适配 Tool.define() 模式

#### 3.4.1 SkillManager 改造

- **FR-34**: 改造 `SkillManager.ts` 适配 Tool.define() 模式
- **FR-35**: 保留现有 SKILL.md 解析逻辑（YAML frontmatter）
- **FR-36**: 增加 Skill Direct 模式支持（Markdown 直接返回，无需沙箱执行）

#### 3.4.2 Skill 执行模式

- **FR-37**: 保留现有沙箱模式（`scripts/execute.js`）作为默认
- **FR-38**: 新增 Direct 模式：解析 SKILL.md 直接返回内容
- **FR-39**: Skill 工具参数：name（skill 标识符）
- **FR-40**: 改造 Skill 注册方式：从代理 BuiltInTool 改为统一工具定义

### 3.5 MCP 工具增强（改造现有实现）

> **说明**：MCPIntegrationService 已存在，需增强 convertMcpTool 转换

#### 3.5.1 MCP 工具转换器

- **FR-41**: 新建 `src/services/mcp/convert.ts` 实现 `convertMcpTool()` 函数
- **FR-42**: 工具名称格式化为 `{clientName}_{toolName}` 避免命名冲突
- **FR-43**: 保留 MCP 原有的 inputSchema 和 descriptions

#### 3.5.2 MCP 资源读取增强

- **FR-44**: 实现 mcp:// URI 解析（`mcp://serverId/resourcePath`）
- **FR-45**: 资源内容转换为 FilePart 嵌入消息
- **FR-46**: 处理 MCP 返回的多种 content 类型（text、image、resource）

#### 3.5.3 MCPIntegrationService 改造

- **FR-47**: 改造为 Tool.define() 模式注册 MCP 工具
- **FR-48**: 支持超时配置（`mcp_timeout`）
- **FR-49**: 集成 convertMcpTool 转换器

### 3.6 权限系统实现（暂不实现）

权限系统相关功能已移至后续迭代计划。

### 3.7 上下文压缩机制（双重检查）

#### 3.7.1 溢出检测

- **FR-50**: 实现 `SessionCompaction.isOverflow()` 检测 token 溢出
- **FR-51**: 溢出阈值可配置（基于 maxTokens 和当前 token 计数）

#### 3.7.2 压缩触发时机

- **FR-52**: 在 LLM 调用前检查 token 数量，超阈值则压缩
- **FR-53**: 在工具执行完成后检查上下文是否溢出

#### 3.7.3 压缩策略

- **FR-54**: 实现消息摘要生成（保留关键信息，压缩次要内容）
- **FR-55**: 支持移除最早的用户消息（保留系统提示和最近上下文）
- **FR-56**: 压缩记录：`time.compacted` 标记压缩时间点

---

## 4. 非功能需求

### 4.1 性能需求

- **NFR-01**: 工具执行延迟 < 100ms（不含工具本身耗时）
- **NFR-02**: 消息 Part 解析和序列化 < 10ms
- **NFR-03**: 权限评估 < 5ms

### 4.2 兼容性需求

- **NFR-04**: 消息格式完整迁移到 Part 结构（API 变更需同步更新）
- **NFR-05**: 保持核心功能兼容（工具调用、LLM 调用）
- **NFR-06**: 渐进式迁移，阶段验证后进入下一阶段

### 4.3 可扩展性需求

- **NFR-07**: 支持自定义 Part 类型扩展
- **NFR-08**: 支持自定义工具注册
- **NFR-09**: 权限规则集支持自定义（后续迭代）

---

## 5. 约束条件

### 5.1 技术约束

- **C-01**: 继续使用 TypeScript 作为开发语言
- **C-02**: 保持现有依赖管理（package.json）
- **C-03**: 不引入额外的依赖注入容器（使用手动依赖注入）
- **C-04**: 消息格式完整迁移到 Part 结构（API 可能变更）

### 5.2 资源约束

- **C-05**: 参考 opencode 实现，但不直接复制代码（需重写适配）
- **C-06**: 保持项目目录结构一致
- **C-07**: 渐进式重构，按优先级分阶段实施

### 5.3 时间约束

| 阶段 | 模块 | 预估时间 |
|------|------|----------|
| P0 | 多轮思考机制 | 2 周 |
| P0 | 消息结构优化 | 1 周 |
| P1 | 工具调用框架 | 2 周 |
| P1 | Skill 工具集成 | 1 周 |
| P1 | MCP 工具增强 | 1 周 |
| P2 | 上下文压缩 | 1 周 |

---

## 6. 验收标准

### 6.1 功能验收（P0 阶段）

#### 6.1.1 多轮思考机制
- [ ] 支持 reasoning-start/delta/end 事件流
- [ ] 支持 step-start/finish 步骤边界
- [ ] Doom Loop 检测正常工作（DOOM_LOOP_THRESHOLD = 3）
- [ ] ReasoningPart 类型支持时间戳记录

#### 6.1.2 消息结构 Part 抽象
- [ ] 消息支持 TextPart、ToolPart、ReasoningPart、StepStartPart、StepFinishPart 等 Part 类型
- [ ] ToolState 状态机工作正常（pending/running/completed/error）
- [ ] Part 基类 PartBase 定义正确

#### 6.1.3 消息角色扩展（FR-20/FR-21）
- [ ] User 消息支持 summary 字段（按需生成，仅上下文压缩时生成）
- [ ] User 消息支持 agent、model、system、tools、variant 字段
- [ ] Assistant 消息支持 cost 字段（从 provider 响应获取）
- [ ] Assistant 消息支持 tokens 统计（input/output/reasoning/cache）
- [ ] Assistant 消息支持 path、time.completed 字段
- [ ] 消息角色扩展格式与 OpenCode 兼容

### 6.2 功能验收（P1 阶段 - 改造验证）

- [ ] Tool.define() 工厂模式工作正常（基于现有 BuiltInTool 改造）
- [ ] ToolRegistry 替代 BuiltInToolsRegistry
- [ ] SkillManager 适配 Tool.define() 模式，新增 Direct 模式
- [ ] Skill 工具调用正常（沙箱模式 + Direct 模式）
- [ ] MCPIntegrationService 适配 Tool.define() 模式
- [ ] convertMcpTool() 转换器工作正常
- [ ] {clientName}_{toolName} 工具命名规范
- [ ] MCP resource URI 解析正常工作

### 6.3 功能验收（P2 阶段）

- [ ] 上下文压缩在 LLM 调用前触发
- [ ] 上下文压缩在工具执行后触发
- [ ] 压缩后消息保持可读性

### 6.4 质量验收

- [ ] TypeScript 编译无错误
- [ ] 单元测试覆盖率 80%+
- [ ] 现有功能 100% 正常（回归测试）
- [ ] 每个阶段完成后进行完整验证

### 6.5 文档验收

- [ ] 更新 README.md（新增特性说明）
- [ ] 更新 CLAUDE.md（架构变更记录）
- [ ] 关键模块添加 JSDoc 注释

---

## 7. 参考资料

### 7.1 OpenCode 源文件

| 功能 | 文件路径 |
|------|----------|
| 消息定义 | `opencode/packages/opencode/src/session/message-v2.ts` |
| 处理器 | `opencode/packages/opencode/src/session/processor.ts` |
| 会话循环 | `opencode/packages/opencode/src/session/prompt.ts` |
| 工具定义 | `opencode/packages/opencode/src/tool/tool.ts` |
| 工具注册 | `opencode/packages/opencode/src/tool/registry.ts` |
| Skill 工具 | `opencode/packages/opencode/src/tool/skill.ts` |
| Skill 管理 | `opencode/packages/opencode/src/skill/skill.ts` |
| MCP 集成 | `opencode/packages/opencode/src/mcp/index.ts` |
| Bash 工具 | `opencode/packages/opencode/src/tool/bash.ts` |

### 7.2 Apex-Bridge 现有实现

| 模块 | 路径 |
|------|------|
| 推理策略 | `src/strategies/ReActStrategy.ts` |
| 工具调度 | `src/core/tool-action/ToolDispatcher.ts` |
| Chat 服务 | `src/services/ChatService.ts` |
| 工具检索 | `src/services/ToolRetrievalService.ts` |

---

## 8. 附录

### 8.1 消息 Part 类型参考

```typescript
// OpenCode Part 定义参考
const Part = z.discriminatedUnion("type", [
  TextPart,           // 文本内容
  SubtaskPart,        // 子任务
  ReasoningPart,      // 思考过程
  FilePart,           // 文件内容
  ToolPart,           // 工具调用
  StepStartPart,      // 步骤开始
  StepFinishPart,     // 步骤完成
  SnapshotPart,       // 状态快照
  PatchPart,          // 状态补丁
  AgentPart,          // Agent 信息
  RetryPart,          // 重试信息
  CompactionPart,     // 压缩信息
])
```

### 8.2 ToolState 状态机参考

```typescript
// OpenCode ToolState 定义参考
type ToolStatePending = { status: "pending", input: Record<string, any>, raw: string }
type ToolStateRunning = { status: "running", input: Record<string, any>, title?: string, time: { start: number } }
type ToolStateCompleted = { status: "completed", input: Record<string, any>, output: string, title: string, time: { start: number, end: number, compacted?: number }, attachments?: FilePart[] }
type ToolStateError = { status: "error", input: Record<string, any>, error: string, time: { start: number, end: number } }
```
