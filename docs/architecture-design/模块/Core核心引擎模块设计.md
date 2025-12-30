# Core 核心引擎模块设计

> 所属模块：Core
> 文档版本：v1.0.0
> 创建日期：2025-12-29

## 1. 模块概述

Core 模块是 ApexBridge 的核心引擎层，负责 ABP 协议解析、LLM 提供商管理、多轮思考执行和动态变量解析。

### 1.1 模块职责

- ABP 协议解析与处理
- 多 LLM 提供商适配器管理
- ReAct 多轮思考引擎
- 动态变量解析系统
- 内部事件总线

### 1.2 目录结构

```
src/core/
├── ProtocolEngine.ts      # ABP 协议引擎
├── LLMManager.ts          # LLM 管理器
├── ReActEngine.ts         # ReAct 思考引擎
├── VariableEngine.ts      # 变量引擎
│   └── variable/          # 变量提供者
│       ├── TimeProvider.ts
│       ├── PlaceholderProvider.ts
│       └── index.ts
├── EventBus.ts            # 事件总线
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
```

---

## 2. 组件设计

### 2.1 ProtocolEngine

**职责**：ABP 协议解析、工具调用处理、RAG 集成

**核心方法**：
- `parseProtocol(input: string)` - 解析 ABP 协议输入
- `processWithTools(chatHistory)` - 处理工具调用
- `executeRAG(query: string)` - RAG 向量检索

### 2.2 LLMManager

**职责**：多提供商适配器编排、模型注册、流式支持

**核心方法**：
- `initializeAdapters()` - 初始化所有适配器
- `getAdapter(provider: string)` - 获取指定提供商适配器
- `chat(request: LLMRequest)` - 同步聊天
- `streamChat(request: LLMRequest)` - 流式聊天

### 2.3 ReActEngine

**职责**：多轮思考协调、工具调度、执行观察

**核心方法**：
- `executeStep(messages: Message[])` - 执行单步思考
- `dispatchTool(toolCall: ToolCall)` - 调度工具
- `processObservation(observation: Observation)` - 处理观察结果

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
│                        ProtocolEngine                           │
├─────────────────────────────────────────────────────────────────┤
│ - ragService: RAGService                                        │
│ - variableEngine: VariableEngine                                │
├─────────────────────────────────────────────────────────────────┤
│ + parseProtocol(input: string)                                  │
│ + processWithTools(chatHistory)                                 │
│ + executeRAG(query: string)                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              v
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
```

---

## 4. 依赖关系

```
ProtocolEngine
    ├── VariableEngine (变量解析)
    ├── RAGService (向量检索)
    └── ReActEngine (工具调用)

LLMManager
    ├── LLMAdapterFactory (适配器工厂)
    ├── LLMConfigService (配置管理)
    └── EventBus (事件)

ReActEngine
    ├── ToolDispatcher (工具调度)
    └── LLMManager (LLM 调用)

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

### 7.3 新增工具类型

1. 实现 `Tool` 接口
2. 在 `ToolDispatcher` 中注册
