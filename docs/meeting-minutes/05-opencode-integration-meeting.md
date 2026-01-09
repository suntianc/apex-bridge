# 需求讨论纪要

**需求**: R-005: OpenCode 架构特性集成需求
**日期**: 2026-01-09
**参与**: 用户、Claude Code

---

## 讨论议题

1. 实施范围和优先级确认
2. 消息 Part 抽象策略确认
3. Doom Loop 检测机制确认
4. 上下文压缩触发时机确认
5. 权限系统处理方式

---

## 讨论内容

### 1. 实施范围和优先级确认

**确认内容**:
- 需求包含多个模块，需要分阶段实施
- P0: 多轮思考、消息结构
- P1: 工具框架、Skill、MCP、权限
- P2: 上下文压缩

**结论**:
- ✅ 分阶段实施，按优先级进行
- ✅ P0 阶段优先完成多轮思考和消息结构
- ✅ 一次性渐进式重构，每个阶段验证后再进入下一阶段

### 2. 消息 Part 抽象策略确认

**选项**:
- 完整迁移：消息完全迁移到 Part 结构
- 内部兼容：保留现有消息格式，在内部使用 Part 结构
- 混合模式：只对工具调用和思考过程使用 Part

**结论**: ✅ **完整迁移**
- 消息格式完全迁移到 Part 结构
- API 可能因此变更，需要同步更新

### 3. Doom Loop 检测机制确认

**选项**:
- 固定阈值：使用固定阈值判断
- 空闲检测：使用时间窗口判断
- 双重检测：同时检测重复和空闲

**结论**: ✅ **按照 opencode 机制实现即可**
- DOOM_LOOP_THRESHOLD = 3
- 检测连续 3 次工具调用模式重复

### 4. 上下文压缩触发时机确认

**选项**:
- LLM 调用前：每次 LLM 调用前检查
- 工具执行后：工具执行完成后检查
- 双重检查：两者都支持

**结论**: ✅ **双重检查**
- 在 LLM 调用前检查 token 数量
- 在工具执行完成后检查上下文溢出

### 5. 权限系统处理方式

**选项**:
- 完整实现：实现完整的 PermissionNext 权限系统
- 简化版：只实现基础权限检查
- 暂不实现：后续再考虑

**结论**: ✅ **暂不实现**
- 权限系统相关功能移至后续迭代
- 当前聚焦于 P0 和 P1 的核心功能

---

### 6. 架构深度对比分析

**分析时间**: 2026-01-09

**分析范围**:
- ReActStrategy.ts - 多轮思考机制
- types/index.ts - 消息结构
- ToolDispatcher.ts - 工具调用框架
- MCPIntegrationService.ts - MCP 集成
- Skill 实现 - SkillsSandboxExecutor

#### 6.1 多轮思考机制差距

| 需求功能 | 现有实现 | 差距等级 |
|---------|---------|----------|
| reasoning-start/delta/end 事件流 | 仅 `reasoning` 事件 | **重大** |
| 思考时间戳 (start/end) | 无时间戳记录 | **重大** |
| ReasoningPart 类型 | 无 Part 抽象 | **重大** |
| start-step/finish-step 步骤边界 | 无 | **重大** |
| Doom Loop 检测 | 无 | **完全缺失** |

#### 6.2 消息结构差距

| 需求类型 | 现有实现 | 差距等级 |
|---------|---------|----------|
| PartBase 基类 | 无 | **完全缺失** |
| ReasoningPart, ToolPart | 无 | **完全缺失** |
| ToolState 状态机 | 简单 ToolResult | **需重构** |

#### 6.3 工具调用框架差距

| 需求功能 | 现有实现 | 差距等级 |
|---------|---------|----------|
| Tool.define() 工厂函数 | 仅 BuiltInTool | **完全缺失** |
| Tool.Context 参数 | 仅 args | **需重构** |
| metadata() 方法 | 无 | **完全缺失** |

#### 6.4 Skill 实现差距

> **重要更正**：SkillManager 和 SKILL.md 解析已存在，非"完全缺失"

| 需求功能 | 现有实现 | 差距/改造点 |
|---------|---------|------------|
| SkillManager | ✅ 已存在 | 需适配 Tool.define() 模式 |
| SKILL.md 解析 | ✅ 已存在 | 需扩展 Direct 模式支持 |
| Skill 扫描 | ✅ 已存在 | 需增加自定义路径扫描 |
| Skill 调用 | ✅ 沙箱模式 | 需增加 Direct 模式 |

#### 6.5 MCP 集成差距

> **重要更正**：MCPIntegrationService 和 resource 类型已存在，非"完全缺失"

| 需求功能 | 现有实现 | 差距/改造点 |
|---------|---------|------------|
| MCPIntegrationService | ✅ 已存在 | 需适配 Tool.define() 模式 |
| MCP 工具调用 | ✅ 已实现 | 需实现 convertMcpTool() 统一转换 |
| 工具名称格式 | ✅ 原始名称 | 需支持 `{clientName}_{toolName}` 格式 |
| resource 类型 | ✅ 已支持 | 需实现 mcp:// URI 解析 |

#### 6.6 需要修改的文件清单

**P0 优先级（必须修改现有文件）**:
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
| `src/types/message-v2.ts` | Part 抽象和类型定义 |
| `src/types/tool-state.ts` | ToolState 状态机 |
| `src/core/tool/tool.ts` | Tool.define() 工厂（基于现有 BuiltInTool） |
| `src/core/tool/registry.ts` | ToolRegistry（替换 BuiltInToolsRegistry） |
| `src/services/mcp/convert.ts` | MCP 工具转换器（convertMcpTool） |

---

## 决议事项

1. ✅ 分阶段实施：P0（多轮思考+消息结构）→ P1（工具框架+Skill+MCP）→ P2（上下文压缩）
2. ✅ 消息 Part 抽象采用完整迁移策略
3. ✅ Doom Loop 检测按照 opencode 机制实现（DOOM_LOOP_THRESHOLD = 3）
4. ✅ 上下文压缩采用双重检查机制
5. ✅ 权限系统暂不实现，移至后续迭代
6. ✅ 一次性渐进式重构，按优先级分阶段验证
7. ✅ 架构对比分析完成，明确了需要修改的文件清单
8. ✅ 复查完成：修正 Skill/MCP 已有实现描述，改为"改造"而非"重新实现"

---

## 分阶段实施计划（更新）

| 阶段 | 模块 | 预估时间 | 备注 |
|------|------|----------|------|
| P0 | 多轮思考机制 | 2 周 | 新增事件流、Doom Loop |
| P0 | 消息结构优化 | 1 周 | 新增 Part 抽象 |
| P1 | 工具调用框架 | 2 周 | 改造 BuiltInTool → Tool.define() |
| P1 | Skill 工具集成 | 1 周 | 改造 SkillManager，新增 Direct 模式 |
| P1 | MCP 工具增强 | 1 周 | 新增 convertMcpTool，工具命名规范 |
| P2 | 上下文压缩 | 1 周 | 可选增强 |

---

## 待办

| 任务 | 负责人 | 状态 |
|------|--------|------|
| P0: 多轮思考机制实现 | - | 待开始 |
| P0: 消息结构 Part 抽象 | - | 待开始 |
| P1: 工具框架规范化 | - | 待开始 |
| P1: Skill 工具集成 | - | 待开始 |
| P1: MCP 工具增强 | - | 待开始 |
| P2: 上下文压缩 | - | 待开始 |

---

## 附件

- 需求文档: [05-opencode-integration.md](../requirements/05-opencode-integration.md)
