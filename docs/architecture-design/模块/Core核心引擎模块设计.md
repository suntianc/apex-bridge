# Core 核心引擎模块设计

> 所属模块：Core
> 文档版本：v2.1.0
> 创建日期：2025-12-29
> 更新日期：2026-01-09

## 1. 模块概述

Core 模块是 ApexBridge 的核心引擎层，负责 LLM 提供商管理、多轮思考执行、工具调度和动态变量解析。

### 1.1 模块职责

- 多 LLM 提供商适配器管理
- ReAct 多轮思考引擎
- 工具解析与调度
- 动态变量解析系统
- 内部事件总线

### 1.2 目录结构

```
src/core/
├── LLMManager.ts          # LLM 管理器
├── ReActEngine.ts         # ReAct 思考引擎
├── VariableEngine.ts      # 变量引擎
│   └── variable/          # 变量提供者
│       ├── TimeProvider.ts
│       ├── PlaceholderProvider.ts
│       └── index.ts
├── EventBus.ts            # 事件总线
├── tool/                  # 工具系统 (R-005 新增)
│   ├── tool.ts            # Tool.define() 工厂
│   └── registry.ts        # ToolRegistry 工具注册表
├── tool-action/           # 工具执行
│   ├── ToolDispatcher.ts  # 工具调度器
│   ├── tool-system.ts     # 工具系统定义
│   └── BuiltInExecutor.ts # 内置工具执行器
├── llm/                   # LLM 相关
│   ├── LLMManager.ts
│   ├── LLMAdapter.ts      # 适配器接口
│   ├── LLMAdapterFactory.ts
│   └── adapters/          # 具体适配器
│       ├── OpenAIAdapter.ts
│       ├── DeepSeekAdapter.ts
│       ├── ClaudeAdapter.ts
│       ├── ZhipuAdapter.ts
│       └── OllamaAdapter.ts
└── stream/                # 流式处理
    └── StreamOrchestrator.ts

**v2.1.0 变更（R-005）**：新增 tool/ 目录，包含 Tool.define() 工厂和 ToolRegistry。
```

---

## 2. 组件设计

### 2.1 LLMManager

**职责**：多提供商适配器编排、模型注册、流式支持

**核心方法**：
- `initializeAdapters()` - 初始化所有适配器
- `getAdapter(provider: string)` - 获取指定提供商适配器
- `chat(request: LLMRequest)` - 同步聊天
- `streamChat(request: LLMRequest)` - 流式聊天

### 2.3 ReActEngine

**职责**：多轮思考协调、工具调度、执行观察、Doom Loop 检测

**核心方法**：
- `executeStep(messages: WithParts[])` - 执行单步思考（R-005：WithParts 结构）
- `dispatchTool(toolCall: ToolCall)` - 调度工具
- `processObservation(observation: Observation)` - 处理观察结果
- `detectDoomLoop(pattern: ToolCall[])` - Doom Loop 检测（R-005 新增）

**R-005 扩展机制**：
- **事件流处理**：支持 reasoning-start/delta/end 事件流
- **步骤边界**：支持 step-start/finish 步骤边界事件
- **Doom Loop 检测**：连续 3 次相同工具调用模式触发检测（DOOM_LOOP_THRESHOLD = 3）
- **思考时间戳**：记录 ReasoningPart 的 start/end 时间戳

### 2.4 VariableEngine

**职责**：动态变量解析、占位符替换

**核心方法**：
- `resolveVariables(text: string, context: Context)` - 解析变量
- `registerProvider(provider: VariableProvider)` - 注册变量提供者

### 2.5 EventBus

**职责**：内部事件发布/订阅

**核心方法**：
- `publish(event: string, data: any)` - 发布事件
- `subscribe(event: string, handler: Handler)` - 订阅事件

---

## 3. 类图

```
┌─────────────────────────────────────────────────────────────────┐
│                         LLMManager                              │
├─────────────────────────────────────────────────────────────────┤
│ - adapters: Map<string, LLMAdapter>                             │
│ - configService: LLMConfigService                               │
├─────────────────────────────────────────────────────────────────┤
│ + initializeAdapters()                                          │
│ + getAdapter(provider: string)                                  │
│ + chat(request: LLMRequest)                                     │
│ + streamChat(request: LLMRequest)                               │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              v               v               v
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │  OpenAI     │  │  DeepSeek   │  │  Ollama     │
    │  Adapter    │  │  Adapter    │  │  Adapter    │
    └─────────────┘  └─────────────┘  └─────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        ReActEngine                              │
├─────────────────────────────────────────────────────────────────┤
│ - toolDispatcher: ToolDispatcher                                │
│ - maxIterations: number                                         │
├─────────────────────────────────────────────────────────────────┤
│ + executeStep(messages: Message[])                              │
│ + dispatchTool(toolCall: ToolCall)                              │
│ + processObservation(observation: Observation)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              v
┌─────────────────────────────────────────────────────────────────┐
│                      ToolDispatcher                             │
├─────────────────────────────────────────────────────────────────┤
│ - toolRegistry: ToolRegistry      (R-005: 替换分散的 executor)   │
│ - builtinExecutor: BuiltInExecutor                              │
│ - skillsExecutor: SkillsSandboxExecutor                         │
│ - mcpExecutors: Map<string, MCPExecutor>                        │
├─────────────────────────────────────────────────────────────────┤
│ + dispatch(toolName: string, params: any)                       │
│ + registerExecutor(type: string, executor: Executor)            │
│ + registerTool(tool: Tool.Info)                          (R-005)│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      ToolRegistry                               │ (R-005 新增)
├─────────────────────────────────────────────────────────────────┤
│ - tools: Map<string, Tool.Info>                                 │
│ - metadata: Map<string, ToolState>                              │
├─────────────────────────────────────────────────────────────────┤
│ + define(name: string, config: Tool.Config): Tool.Info          │
│ + get(name: string): Tool.Info | undefined                      │
│ + list(): Tool.Info[]                                           │
│ + updateState(callId: string, state: ToolState)                 │
│ + detectDoomLoop(): boolean                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 依赖关系

```
LLMManager
    ├── LLMAdapterFactory (适配器工厂)
    ├── LLMConfigService (配置管理)
    └── EventBus (事件)

ReActEngine
    ├── ToolDispatcher (工具调度)
    ├── LLMManager (LLM 调用)
    └── ToolRegistry (R-005: 工具状态管理)

ToolDispatcher
    ├── ToolRegistry (R-005: 统一工具注册表)
    ├── BuiltInExecutor (内置工具)
    ├── SkillsSandboxExecutor (技能执行)
    └── MCPIntegrationService (MCP 工具)

ToolRegistry (R-005 新增)
    ├── Tool.define() 工厂
    ├── BuiltInToolsRegistry (改造)
    └── MCPIntegrationService (适配)

VariableEngine
    ├── TimeProvider
    ├── PlaceholderProvider
    └── Custom Providers
```

---

## 5. 数据结构

### 5.1 LLMRequest

```typescript
interface LLMRequest {
  provider: string;
  model: string;
  messages: Message[];
  options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    selfThinking?: boolean;
  };
}
```

### 5.2 ToolCall

```typescript
interface ToolCall {
  toolId: string;
  parameters: Record<string, any>;
}
```

### 5.3 ToolState 状态机 (R-005 新增)

```typescript
type ToolState =
  | { status: "pending"; input: Record<string, any>; raw: string }
  | { status: "running"; input: Record<string, any>; title?: string; time: { start: number } }
  | { status: "completed"; input: Record<string, any>; output: string; title: string; time: { start: number; end: number; compacted?: number }; attachments?: FilePart[] }
  | { status: "error"; input: Record<string, any>; error: string; time: { start: number; end: number } }
```

### 5.4 WithParts 消息结构 (R-005 新增)

```typescript
interface WithParts {
  info: MessageInfo;  // User 或 Assistant 消息
  parts: Part[];      // TextPart, ToolPart, ReasoningPart, StepStartPart, StepFinishPart 等
}
```

---

## 6. 配置项

```typescript
interface CoreConfig {
  llm: {
    defaultProvider: string;
    timeout: number;
    maxRetries: number;
  };
  react: {
    maxIterations: number;
    observationTimeout: number;
    doomLoopThreshold: number;  // R-005: Doom Loop 检测阈值 (默认 3)
  };
  variable: {
    enabledProviders: string[];
    customProviders: VariableProvider[];
  };
}
```

---

## 7. 扩展点

### 7.1 新增 LLM 提供商

1. 在 `adapters/` 目录下创建新的适配器类
2. 实现 `LLMAdapter` 接口
3. 在 `LLMManager.initializeAdapters()` 中注册

### 7.2 新增变量提供者

1. 实现 `VariableProvider` 接口
2. 在 `VariableEngine` 中注册

### 7.3 新增工具类型 (R-005 变更)

**方式一：使用 Tool.define() 工厂**
```typescript
const myTool = Tool.define({
  name: "myTool",
  parameters: z.object({ ... }),
  execute: async (ctx) => { ... }
});
ToolRegistry.register(myTool);
```

**方式二：实现 Tool 接口**
1. 实现 `Tool.Info` 接口
2. 在 `ToolRegistry` 中注册

### 7.4 R-005 扩展机制

- **Part 类型扩展**：在 `src/types/message-v2.ts` 中新增 Part 类型
- **ToolState 扩展**：在 `src/types/tool-state.ts` 中新增状态类型
- **Skill Direct 模式**：配置 SKILL.md 直接返回，无需沙箱执行
- **MCP 工具转换**：使用 `convertMcpTool()` 标准化 MCP 工具定义
