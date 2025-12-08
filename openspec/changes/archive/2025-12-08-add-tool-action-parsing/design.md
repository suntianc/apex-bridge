# Design: LLM 工具调用能力（tool_action 标签解析）

## Context

ApexBridge 当前通过 OpenAI 兼容的 function calling 方式实现工具调用。这种方式依赖 LLM 提供商的原生 `tool_calls` 响应格式，但存在以下限制：

1. **兼容性受限**: 部分 LLM（尤其是开源模型）不支持原生 tool_calls
2. **调试困难**: tool_calls 以 JSON 形式嵌入响应，难以直观观察
3. **灵活性不足**: 无法让 LLM 以自然语言方式表达工具调用意图

本设计引入 `<tool_action>` 标签解析机制，作为现有 tool_calls 的补充方案。

### 相关现有组件
- `ReActStrategy`: 多轮思考策略，已集成工具系统
- `ReActEngine`: ReAct 循环核心引擎
- `BuiltInToolsRegistry`: 内置工具注册表
- `ToolExecutor`: 工具并发执行器
- `ToolExecutorManager`: 工具执行器管理器

## Goals / Non-Goals

### Goals
- 支持通过 `<tool_action>` 标签格式调用工具
- 流式解析，实时检测完整标签
- 与现有 tool_calls 机制并行工作
- 复用现有工具执行基础设施
- 最小化对现有代码的侵入

### Non-Goals
- 不替换现有的 OpenAI tool_calls 支持
- 不实现复杂的标签嵌套语法
- 不处理流式中断恢复（依赖现有机制）
- 不实现工具结果的标签式返回（使用现有消息格式）

## Decisions

### Decision 1: 标签格式设计

采用 XML 风格标签，参数使用子标签 + value 属性：

```xml
<tool_action name="tool_name">
  <param1 value="value1" />
  <param2 value="value2" />
</tool_action>
```

**Rationale**:
- XML 风格易于解析，正则匹配简单可靠
- 子标签方式支持任意数量参数
- value 属性避免参数值中的特殊字符问题
- 闭合标签 `</tool_action>` 明确标记调用结束

**Alternatives considered**:
1. JSON 格式 `{"tool": "name", "params": {...}}` - 难以流式检测边界
2. Markdown 代码块 - 与其他代码块冲突
3. 自定义分隔符 `[[TOOL:name:param=value]]` - 可读性差

### Decision 2: 流式检测策略

使用缓冲区 + 状态机模式：

```
状态: NORMAL -> TAG_OPENING -> TAG_CONTENT -> TAG_CLOSING -> NORMAL
```

**Rationale**:
- 状态机模式清晰，易于调试
- 缓冲区控制内存占用
- 支持跨 chunk 的标签检测
- 可安全输出非标签文本

### Decision 3: 工具调度策略

复用现有 `ToolExecutorManager` 进行工具路由：

```typescript
// 解析到 tool_action 后
const toolInfo = toolExecutorManager.findTool(toolName);
const result = await toolExecutorManager.execute(toolInfo.type, { name, args });
```

**Rationale**:
- 复用现有基础设施，减少重复代码
- 自动支持内置工具和 Skills
- 保持统一的工具执行接口

### Decision 4: ReActEngine 集成方式

在 `ReActEngine.runIteration` 中添加标签检测分支：

```typescript
// 现有流程
if (chunk.type === 'tool_calls') { ... }

// 新增分支
if (chunk.type === 'content') {
  const detection = streamDetector.processChunk(chunk.content);
  if (detection.complete) {
    // 处理标签式工具调用
  }
}
```

**Rationale**:
- 最小化对现有逻辑的影响
- 标签检测和原生 tool_calls 互斥，不会冲突
- 保持现有的流式输出行为

## Risks / Trade-offs

### Risk 1: 标签解析误判
- **风险**: LLM 输出的普通文本可能包含类似标签的内容
- **缓解**: 要求完整的开闭标签匹配，name 属性必须存在

### Risk 2: 性能开销
- **风险**: 每个 chunk 都需要检测标签
- **缓解**: 使用简单的字符串查找作为快速路径，只有检测到 `<tool_action` 才启用完整解析

### Trade-off: 标签式 vs 原生 tool_calls
- **标签式优势**: 兼容性好，可读性强，易调试
- **原生优势**: 性能更高，无解析开销
- **决策**: 两者并行支持，可通过配置选择

## Architecture

### 组件架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        ReActStrategy                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     ReActEngine                          │    │
│  │  ┌─────────────┐  ┌─────────────────────────────────┐   │    │
│  │  │ LLMAdapter  │→ │ StreamTagDetector (新增)         │   │    │
│  │  └─────────────┘  │  ├─ TextBuffer                   │   │    │
│  │                   │  ├─ TagStateMachine              │   │    │
│  │                   │  └─ ToolActionParser             │   │    │
│  │                   └─────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   ToolDispatcher (新增)                  │    │
│  │                         ↓                                │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │           ToolExecutorManager (现有)             │    │    │
│  │  │  ┌─────────────┐  ┌─────────────────────────┐   │    │    │
│  │  │  │BuiltInExec  │  │ SkillsSandboxExecutor   │   │    │    │
│  │  │  └─────────────┘  └─────────────────────────┘   │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

```
LLM Output Chunk
      ↓
StreamTagDetector.processChunk()
      ↓
┌─────────────────────────────┐
│ 检测标签状态                 │
│ ├─ 无标签 → 直接输出文本     │
│ ├─ 标签开始 → 缓冲           │
│ ├─ 标签内容 → 继续缓冲       │
│ └─ 标签结束 → 解析执行       │
└─────────────────────────────┘
      ↓
ToolActionParser.parse()
      ↓
ToolDispatcher.dispatch()
      ↓
ToolExecutorManager.execute()
      ↓
工具结果注入对话历史
      ↓
继续下一轮 ReAct 循环
```

## Implementation Notes

### 关键接口

```typescript
// src/core/tool-action/types.ts
interface ToolActionCall {
  name: string;
  parameters: Record<string, string>;
  rawText: string;
  startIndex: number;
  endIndex: number;
}

interface DetectionResult {
  complete: boolean;
  toolAction?: ToolActionCall;
  textToEmit: string;
  bufferRemainder: string;
}
```

### 配置选项

```typescript
// 在 ReActOptions 中添加
interface ReActOptions {
  // ... 现有选项
  enableToolActionParsing?: boolean;  // 默认 true
  toolActionTimeout?: number;          // 单个工具超时，默认 30000ms
}
```

## Migration Plan

1. **Phase 1**: 实现核心解析器（无业务逻辑变更）
2. **Phase 2**: 集成到 ReActEngine（feature flag 控制）
3. **Phase 3**: 更新系统提示词模板
4. **Phase 4**: 文档和测试完善

无需数据迁移，向后兼容。

## Open Questions

1. **Q**: 是否需要支持嵌套标签？
   **A**: 初期不支持，保持解析简单。如有需求后续扩展。

2. **Q**: 工具结果如何返回给 LLM？
   **A**: 复用现有的 tool message 格式，保持一致性。

3. **Q**: 是否需要限制单次响应的工具调用数量？
   **A**: 复用现有的 `maxConcurrentTools` 配置。
