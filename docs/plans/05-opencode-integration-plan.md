# R-005: OpenCode 架构特性集成开发计划

> 需求文档：[05-opencode-integration.md](../requirements/05-opencode-integration.md)
> 需求讨论纪要：[05-opencode-integration-meeting.md](../meeting-minutes/05-opencode-integration-meeting.md)
> 架构设计：[总体架构设计.md](../architecture-design/总体架构设计.md)、[Core核心引擎模块设计.md](../architecture-design/模块/Core核心引擎模块设计.md)
> 功能设计：
> - [P0-1: 多轮思考机制](../functionality-design/05-OpenCode-integration-func/05-OpenCode-P0-1-multi-round-thinking.md)
> - [P0-2: 消息结构 Part 抽象](../functionality-design/05-OpenCode-integration-func/05-OpenCode-P0-2-message-part.md)
> - [P1-1: 工具调用框架](../functionality-design/05-OpenCode-integration-func/05-OpenCode-P1-1-tool-framework.md)
> - [P1-2: Skill 工具集成](../functionality-design/05-OpenCode-integration-func/05-OpenCode-P1-2-skill-integration.md)
> - [P1-3: MCP 工具增强](../functionality-design/05-OpenCode-integration-func/05-OpenCode-P1-3-mcp-enhancement.md)
> - [P2: 上下文压缩](../functionality-design/05-OpenCode-integration-func/05-OpenCode-P2-context-compaction.md)

---

## 变更版本记录

| 版本 | 日期 | 变更内容 | 变更人 |
|------|------|----------|--------|
| 1.0 | 2026-01-09 | 初始版本，基于功能设计文档创建 | - |

---

## 1. 需求概述

### 1.1 业务目标

在完成 ACE 功能剔除（R-004）后，集成 opencode 项目的成熟架构特性，增强 apex-bridge 的：

1. **多轮思考机制**：完整的思考追踪、步骤边界、Doom Loop 检测
2. **消息结构**：Part 抽象，支持更丰富的消息语义
3. **工具调用框架**：Tool.define() 工厂模式，统一工具定义和执行
4. **Skill/MCP 增强**：适配 Tool.define() 模式，新增 Direct 模式和工具转换
5. **上下文压缩**：token 溢出时的上下文自动压缩（可选增强）

### 1.2 功能范围

| 阶段 | 模块 | 功能需求 |
|------|------|----------|
| **P0** | 多轮思考机制 | reasoning 事件流、步骤边界、Doom Loop 检测 |
| **P0** | 消息结构 Part | PartBase、TextPart、ToolPart、ReasoningPart、StepStartPart、StepFinishPart、ToolState 状态机 |
| **P1** | 工具调用框架 | Tool.define() 工厂、ToolRegistry、metadata() 方法 |
| **P1** | Skill 工具集成 | 适配 Tool.define() 模式、增加 Direct 模式 |
| **P1** | MCP 工具增强 | convertMcpTool()、工具命名规范、资源 URI 解析 |
| **P2** | 上下文压缩 | 双重检查机制、消息摘要生成（可选） |

---

## 2. 任务分解与优先级

### 2.1 基础设施任务（必须优先）

| 序号 | 任务 | 优先级 | 交付标准 | 预计工时 |
|------|------|--------|----------|----------|
| 1 | 创建类型文件：`src/types/message-v2.ts`（Part 抽象） | P0 | 文件创建，类型定义编译通过 | 4h |
| 2 | 创建类型文件：`src/types/tool-state.ts`（ToolState 状态机） | P0 | 文件创建，状态机定义完整 | 2h |
| 3 | 创建工具框架：`src/core/tool/tool.ts`（Tool.define() 工厂） | P1 | 文件创建，工厂函数可用 | 4h |
| 4 | 创建工具框架：`src/core/tool/registry.ts`（ToolRegistry） | P1 | 文件创建，注册/查询功能可用 | 4h |
| 5 | 创建 MCP 转换器：`src/services/mcp/convert.ts` | P1 | 文件创建，转换函数可用 | 2h |

### 2.2 P0 阶段任务（多轮思考 + 消息结构）

| 序号 | 功能 | 优先级 | 交付标准 | 预计工时 | 依赖 | FR 编号 |
|------|------|--------|----------|----------|------|---------|
| 1 | Part 基类体系 | P0 | PartBase 和各 Part 类型定义正确 | 4h | 类型文件 | FR-11~FR-18 |
| 2 | ToolState 状态机 | P0 | pending/running/completed/error 状态完整 | 2h | - | FR-23~FR-26 |
| 3 | ReasoningPart 类型 | P0 | 支持 start/end 时间戳记录 | 2h | Part 基类 | FR-01~FR-03 |
| 4 | StepStartPart/StepFinishPart | P0 | 支持步骤边界事件 | 2h | Part 基类 | FR-04~FR-06 |
| 5 | 消息角色扩展（FR-20/FR-21） | P0 | User/Assistant 扩展字段完整 | 4h | Part 基类 | FR-20~FR-21 |
| 6 | Doom Loop 检测器 | P0 | 阈值=3，检测逻辑正确 | 4h | - | FR-07~FR-10 |
| 7 | ReActEngine 改造 | P0 | 适配新事件流和 WithParts | 6h | 类型文件 | FR-01~FR-10 |
| 8 | ReActStrategy 适配 | P0 | 适配 WithParts 结构 | 2h | ReActEngine | - |
| 9 | 消息格式迁移验证 | P0 | 现有功能 100% 正常 | 4h | 全部 P0 | NFR-04~NFR-06 |

### 2.3 P1 阶段任务（工具框架 + Skill + MCP）

| 序号 | 功能 | 优先级 | 交付标准 | 预计工时 | 依赖 | FR 编号 |
|------|------|--------|----------|----------|------|---------|
| 1 | Tool.define() 工厂 | P0 | 工厂函数可用，参数验证正常 | 4h | - | FR-27~FR-30 |
| 2 | ToolRegistry 实现 | P0 | 工具注册/查询/状态管理可用 | 6h | Tool.define() | FR-31~FR-33 |
| 3 | ToolDispatcher 适配 | P0 | 适配 Tool.define() 模式 | 4h | ToolRegistry | - |
| 4 | BuiltInTool 改造 | P1 | 改造为 Tool.Info 兼容模式 | 2h | ToolRegistry | - |
| 5 | BuiltInToolsRegistry → ToolRegistry | P1 | 单例替换，API 兼容 | 4h | ToolRegistry | - |
| 6 | SkillManager 改造 | P1 | 适配 Tool.define() 模式 | 4h | ToolRegistry | FR-34~FR-36 |
| 7 | Skill Direct 模式 | P1 | Markdown 直接返回功能可用 | 2h | SkillManager | FR-37~FR-40 |
| 8 | convertMcpTool() 实现 | P1 | 转换器可用，命名规范正确 | 2h | - | FR-41~FR-43 |
| 9 | MCP 工具命名规范 | P1 | {clientName}_{toolName} 格式正确 | 2h | convertMcpTool | - |
| 10 | MCPIntegrationService 改造 | P1 | 适配 Tool.define() 模式 | 4h | ToolRegistry | FR-47~FR-49 |
| 11 | mcp:// URI 解析 | P1 | 资源读取功能可用 | 2h | MCPIntegrationService | FR-44~FR-46 |
| 12 | 工具框架集成测试 | P1 | 三类工具调用正常 | 4h | 全部 P1 | - |

### 2.4 P2 阶段任务（上下文压缩，可选）

| 序号 | 功能 | 优先级 | 交付标准 | 预计工时 | 依赖 | FR 编号 |
|------|------|--------|----------|----------|------|---------|
| 1 | SessionCompaction 服务 | P2 | 溢出检测和压缩逻辑完整 | 4h | - | FR-50~FR-51 |
| 2 | 双重检查机制 | P2 | LLM 调用前 + 工具执行后检查 | 4h | SessionCompaction | FR-52~FR-53 |
| 3 | 消息摘要生成 | P2 | 摘要内容正确，保留关键信息 | 2h | SessionCompaction | FR-54~FR-56 |
| 4 | 上下文压缩测试 | P2 | 压缩触发和恢复功能正常 | 2h | 全部 P2 | - |

---

## 3. 阶段划分

### 阶段一：类型基础设施（P0）

**目标**：完成 Part 抽象和 ToolState 状态机的类型定义

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| 创建 message-v2.ts | Part 类型定义文件 | PartBase、TextPart、ReasoningPart、ToolPart、StepStartPart、StepFinishPart、FilePart 定义完整 |
| 创建 tool-state.ts | ToolState 状态机定义 | pending/running/completed/error 四状态定义完整 |
| 创建工具框架基础 | tool.ts、registry.ts、convert.ts | 文件创建，类型编译通过 |

**依赖关系**：
```
message-v2.ts → Part 基类 → ReasoningPart → StepStartPart/StepFinishPart
tool-state.ts → ToolState 状态机
```

### 阶段二：多轮思考机制（P0）

**目标**：完成 ReActEngine 改造和 Doom Loop 检测

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| ReActEngine 改造 | 支持 reasoning 事件流 | reasoning-start/delta/end 事件处理正常 |
| Doom Loop 检测器 | 滑动窗口检测实现 | DOOM_LOOP_THRESHOLD = 3，检测延迟 < 10ms |
| 消息角色扩展 | User/Assistant 扩展字段 | FR-20/FR-21 全部字段实现 |
| ReActStrategy 适配 | WithParts 结构支持 | 现有 ReAct 功能 100% 正常 |

**依赖关系**：
```
message-v2.ts → ReasoningPart → ReActEngine 改造
message-v2.ts → StepStartPart/StepFinishPart → 步骤边界
tool-state.ts → ToolState → 工具状态管理
```

### 阶段三：工具调用框架（P1）

**目标**：完成 Tool.define() 工厂和 ToolRegistry

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| Tool.define() 工厂 | 工厂函数可用 | 参数验证正常，execute 包装正确 |
| ToolRegistry | 工具注册表 | 注册/查询/状态管理功能可用 |
| ToolDispatcher 适配 | 适配新模式 | 工具调度逻辑正常 |
| BuiltInTool 改造 | Tool.Info 兼容 | 现有内置工具正常迁移 |

**依赖关系**：
```
tool.ts (Tool.define) → registry.ts (ToolRegistry) → ToolDispatcher 适配
```

### 阶段四：Skill/MCP 改造（P1）

**目标**：完成 Skill 和 MCP 集成改造

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| SkillManager 改造 | 适配 Tool.define() | Skill 工具调用正常 |
| Skill Direct 模式 | Markdown 直接返回 | Direct 模式可用 |
| convertMcpTool() | MCP 工具转换器 | 转换正确，命名规范 |
| MCPIntegrationService 改造 | Tool.define() 模式 | MCP 工具调用正常 |
| mcp:// URI 解析 | 资源读取功能 | 资源内容正确转换 |

**依赖关系**：
```
ToolRegistry → SkillManager 改造 → Skill Direct 模式
ToolRegistry → MCPIntegrationService 改造 → convertMcpTool → mcp:// URI
```

### 阶段五：集成验证（P0+P1）

**目标**：完成整体集成和回归测试

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| 消息格式迁移验证 | 回归测试报告 | 现有功能 100% 正常 |
| 工具框架集成测试 | 测试报告 | 三类工具调用正常 |
| 性能验证 | 性能报告 | NFR-01~NFR-03 达标 |

### 阶段六：上下文压缩（P2，可选）

**目标**：完成上下文压缩机制（可选增强）

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| SessionCompaction 服务 | 压缩服务 | 溢出检测和压缩逻辑正确 |
| 双重检查机制 | 检查触发器 | LLM 调用前 + 工具执行后触发 |
| 消息摘要生成 | 摘要生成器 | 摘要保留关键信息 |

---

## 4. 交付标准

### 4.1 代码交付标准

- [ ] TypeScript 编译无错误
- [ ] 单元测试覆盖率 ≥ 80%
- [ ] 代码通过 Code Review
- [ ] 无严重级别 Bug
- [ ] 符合项目编码规范

### 4.2 接口交付标准

- [ ] 内部接口文档完整（JSDoc）
- [ ] 接口返回格式统一
- [ ] 错误处理完善

### 4.3 功能交付标准

| 阶段 | 验收标准 |
|------|----------|
| P0 | 多轮思考机制：reasoning 事件流、步骤边界、Doom Loop 检测正常工作 |
| P0 | 消息结构：Part 类型完整、ToolState 状态机工作正常 |
| P1 | 工具框架：Tool.define() 工厂、ToolRegistry 工作正常 |
| P1 | Skill/MCP：适配 Tool.define() 模式，Direct 模式、convertMcpTool 正常 |
| P0+P1 | 回归测试：现有功能 100% 正常 |
| P2（可选） | 上下文压缩：双重检查触发，消息摘要生成正确 |

### 4.4 文档交付标准

- [ ] 更新 CLAUDE.md（架构变更记录）
- [ ] 关键模块添加 JSDoc 注释

---

## 5. 依赖关系总览

```
阶段一：类型基础设施
├── message-v2.ts
│   └── Part 基类 → ReasoningPart → StepStartPart/StepFinishPart
└── tool-state.ts

阶段二：多轮思考机制（P0）
├── ReActEngine 改造
│   └── reasoning 事件流 + Doom Loop 检测
├── ReActStrategy 适配
└── 消息角色扩展（FR-20/FR-21）

阶段三：工具调用框架（P1）
├── tool.ts (Tool.define)
│   └── registry.ts (ToolRegistry)
│       └── ToolDispatcher 适配
│           └── BuiltInTool 改造

阶段四：Skill/MCP 改造（P1）
├── SkillManager 改造
│   └── Skill Direct 模式
└── MCPIntegrationService 改造
    ├── convertMcpTool()
    └── mcp:// URI 解析

阶段五：集成验证
└── 回归测试 + 性能验证

阶段六：上下文压缩（P2，可选）
├── SessionCompaction 服务
├── 双重检查机制
└── 消息摘要生成
```

---

## 6. 风险识别与应对

| 风险 | 影响 | 可能性 | 应对措施 |
|------|------|--------|----------|
| **消息格式迁移导致 API 变更** | 现有客户端可能不兼容 | 中 | 提供兼容层，渐进式迁移，提前文档通知 |
| **Doom Loop 误检测** | 正常流程被中断 | 低 | 合理设置阈值和 ignoredTools，提供手动覆盖选项 |
| **Skill Direct 模式安全风险** | 可能泄露敏感信息 | 中 | Direct 模式默认禁用，需显式配置启用 |
| **MCP 工具转换兼容性问题** | 部分 MCP 工具无法转换 | 低 | 保留原始工具调用作为 fallback |
| **性能下降** | Part 抽象增加开销 | 低 | 优化序列化逻辑，性能测试验证 |

---

## 7. 工时估算

| 阶段 | 任务数 | 预计工时 |
|------|--------|----------|
| 阶段一：类型基础设施 | 5 | 16h（2 天） |
| 阶段二：多轮思考机制 | 9 | 30h（4 天） |
| 阶段三：工具调用框架 | 4 | 20h（2.5 天） |
| 阶段四：Skill/MCP 改造 | 6 | 16h（2 天） |
| 阶段五：集成验证 | 3 | 12h（1.5 天） |
| **P0+P1 小计** | **27** | **94h（~12 工作日）** |
| 阶段六：上下文压缩（P2） | 4 | 12h（1.5 天） |
| **总计** | **31** | **~14 工作日** |

---

## 8. 后续工作

1. **权限系统（后续迭代）**：PermissionNext 细粒度权限控制
2. **性能优化**：根据实际使用情况优化 Part 序列化和 Doom Loop 检测
3. **功能扩展**：根据用户反馈增加更多 Part 类型和工具框架特性
