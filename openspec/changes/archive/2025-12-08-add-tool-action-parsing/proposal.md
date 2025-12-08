# Change: 添加 LLM 工具调用能力（tool_action 标签解析）

## Why

当前系统通过 OpenAI 兼容的 function calling 方式实现工具调用，这要求 LLM 必须支持原生的 tool_calls 响应格式。然而，许多 LLM（如部分开源模型）不原生支持这种格式，或者用户希望 LLM 能够以更灵活、可读的方式输出工具调用请求。

通过实现 `<tool_action>` 标签解析，可以让任何能够输出结构化文本的 LLM 都具备工具调用能力，同时提高工具调用的可读性和调试便利性。

## What Changes

### 核心功能
- **新增 `<tool_action>` 标签解析器**: 解析 LLM 输出中的工具调用标签
- **新增流式标签检测器**: 在流式输出中实时检测完整的工具调用标签
- **新增工具调度器**: 统一路由工具调用到内置工具或 Skills
- **ReActStrategy 集成**: 在多轮思考循环中支持标签式工具调用

### 标签格式
```xml
<tool_action name="工具名称">
  <参数名1 value="参数值1" />
  <参数名2 value="参数值2" />
</tool_action>
```

### 新增文件
- `src/core/tool-action/ToolActionParser.ts` - 标签解析器
- `src/core/tool-action/StreamTagDetector.ts` - 流式标签检测器
- `src/core/tool-action/ToolDispatcher.ts` - 工具调度器
- `src/core/tool-action/types.ts` - 类型定义
- `src/core/tool-action/index.ts` - 模块导出

### 修改文件
- `src/strategies/ReActStrategy.ts` - 集成标签式工具调用
- `src/core/stream-orchestrator/ReActEngine.ts` - 支持标签检测模式

## Impact

- **Affected specs**: tool-action-system (新增)
- **Affected code**:
  - `src/core/tool-action/` (新增目录)
  - `src/strategies/ReActStrategy.ts` (修改)
  - `src/core/stream-orchestrator/ReActEngine.ts` (修改)
- **兼容性**: 与现有 OpenAI 风格的 tool_calls 并行支持，不影响现有功能
- **性能**: 流式解析，零阻塞，最小内存占用
