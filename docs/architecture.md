# ApexBridge 架构设计文档

**版本:** 1.0.0  
**最后更新:** 2026-01-10  
**项目:** ApexBridge - 企业级 AI Agent 框架

---

## 1. 项目概述

ApexBridge 是一个高性能的企业级 AI Agent 框架，旨在构建孤立的大语言模型（LLM）与现实执行能力之间的桥梁。框架专注于轻量级架构设计，支持多模型编排、MCP 协议集成以及智能上下文管理，为开发者提供灵活、可扩展的 AI 应用开发基础。

框架的核心设计理念是"连接智能与执行的桥梁"，通过模块化的架构实现对多种 LLM 提供商的无缝支持，同时集成 Model Context Protocol（MCP）实现标准化的工具调用和上下文共享。4 层上下文压缩机制确保长对话场景下的高效 token 利用，100 条消息可压缩至约 4000 tokens，节省高达 44% 的上下文空间。

---

## 2. 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ApexBridge 架构概览                              │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │   Client     │
                              │  (HTTP/WS)   │
                              └──────┬───────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API Layer (接口层)                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │  ChatController │  │ ProviderController│  │        Routes              │ │
│  │  (聊天完成)      │  │  (提供商管理)     │  │  - skillRoutes            │ │
│  │                 │  │                  │  │  - mcpRoutes              │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────────────────┘ │
│           │                    │                                               │
│           ▼                    ▼                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    WebSocketManager                                    │  │
│  │         (ChatChannel - 实时通信、心跳检测、连接管理)                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Service Layer (服务层)                            │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                       ChatService                                       │   │
│  │    (消息处理、策略选择、上下文压缩、对话历史管理、请求追踪)                 │   │
│  └───────────────────────────┬───────────────────────────────────────────┘   │
│                              │                                               │
│          ┌───────────────────┼───────────────────┐                           │
│          ▼                   ▼                   ▼                           │
│  ┌───────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │MessagePreprocessor│  │StrategySelector│  │  ConversationSaver        │   │
│  │(消息预处理)     │  │  (策略选择)     │  │  (对话保存)                │   │
│  └───────────────┘  └─────────────────┘  └─────────────────────────────┘   │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │               ContextCompressionService (4层压缩引擎)                    │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────────────┐  │   │
│  │  │ Truncate   │ │   Prune    │ │  Summary   │ │      Hybrid        │  │   │
│  │  │ (截断策略)  │ │  (修剪策略) │ │  (摘要策略) │ │    (混合策略)       │  │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────────────┘  │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │ ToolRetrievalService│  │   SkillManager      │  │ MCPIntegrationService│  │
│  │  (LanceDB向量检索)   │  │   (技能管理)        │  │  (MCP协议集成)       │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Strategy Layer (策略层)                             │
│                                                                               │
│  ┌─────────────────────┐  ┌───────────────────────────────────────────────┐ │
│  │    ReActStrategy    │  │           SingleRoundStrategy                 │ │
│  │  (多轮推理策略)      │  │            (单轮快速响应)                       │ │
│  │  - 最多50轮迭代     │  │                                               │ │
│  │  - 工具调用集成     │  │                                               │ │
│  │  - 流式思考输出     │  │                                               │ │
│  └─────────────────────┘  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Core Layer (核心层)                                │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                         ProtocolEngine                                  │   │
│  │     (ABP协议解析、变量引擎、RAG服务集成)                                  │   │
│  └───────────────────────────┬───────────────────────────────────────────┘   │
│                              │                                               │
│          ┌───────────────────┼───────────────────┐                           │
│          ▼                   ▼                   ▼                           │
│  ┌───────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐ │
│  │ABPProtocolParser│  │VariableEngine │  │        EventBus                 │ │
│  │  (协议解析)    │  │  (变量引擎)     │  │  (事件总线、单例模式)           │ │
│  └───────────────┘  └─────────────────┘  └─────────────────────────────────┘ │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                          LLMManager                                     │   │
│  │              (多模型适配器管理、模型注册表、缓存机制)                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │              LLMAdapterFactory (适配器工厂)                        │  │   │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐       │  │   │
│  │  │  │ OpenAI  │ │ Claude  │ │DeepSeek │ │ Ollama  │ │ Custom│       │  │   │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └───────┘       │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Data Layer (数据层)                                │
│                                                                               │
│  ┌─────────────────────┐  ┌───────────────────────────────────────────────┐  │
│  │       SurrealDB                               │  │
│  │  (LLM配置、模型信息)  │  │             (向量数据库、工具检索)              │  │
│  │  - providers表      │  │                                               │  │
│  │  - models表         │  │  - skills表 (支持skill/mcp/builtin类型)        │  │
│  │  - mcp_servers表    │  │  - IVF_PQ向量索引                              │  │
│  └─────────────────────┘  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 目录结构

```
apex-bridge/
├── src/                                    # 源代码目录
│   ├── core/                               # 核心引擎层
│   │   ├── ProtocolEngine.ts               # 协议引擎（ABP协议、变量引擎）
│   │   ├── LLMManager.ts                   # LLM管理器（适配器管理）
│   │   ├── EventBus.ts                     # 事件总线（单例）
│   │   ├── protocol/                       # ABP协议解析器
│   │   │   └── ABPProtocolParser.ts        # JSON/Text解析、噪声去除
│   │   ├── llm/                            # LLM适配器
│   │   │   ├── adapters/                   # 具体适配器实现
│   │   │   │   ├── OpenAIAdapter.ts        # OpenAI兼容适配器
│   │   │   │   ├── ClaudeAdapter.ts        # Claude API适配器
│   │   │   │   ├── DeepSeekAdapter.ts      # DeepSeek适配器
│   │   │   │   ├── OllamaAdapter.ts        # Ollama本地模型适配器
│   │   │   │   ├── CustomAdapter.ts        # 自定义适配器基类
│   │   │   │   └── ZhipuAdapter.ts         # 智谱AI适配器
│   │   │   └── LLMAdapterFactory.ts        # 适配器工厂
│   │   ├── stream-orchestrator/            # 流式编排器
│   │   │   ├── ReActEngine.ts              # ReAct引擎（多轮推理）
│   │   │   ├── LLMAdapter.ts               # LLM适配器包装
│   │   │   └── types.ts                    # 流式类型定义
│   │   ├── tool-action/                    # 工具动作系统
│   │   │   ├── ToolDispatcher.ts           # 工具调度器
│   │   │   └── ToolExecutor.ts             # 工具执行器
│   │   └── variable/                       # 变量引擎
│   │       └── VariableEngine.ts           # 模板变量替换
│   │
│   ├── services/                           # 服务层
│   │   ├── ChatService.ts                  # 聊天服务（协调器）
│   │   ├── ConfigService.ts                # 配置服务
│   │   ├── LLMConfigService.ts             # LLM配置服务（SurrealDB）
│   │   ├── SkillManager.ts                 # 技能管理器
│   │   ├── MCPIntegrationService.ts        # MCP集成服务
│   │   ├── ConversationHistoryService.ts   # 对话历史服务
│   │   ├── SessionManager.ts               # 会话管理器
│   │   ├── RequestTracker.ts               # 请求追踪器
│   │   ├── context-compression/            # 上下文压缩
│   │   │   ├── ContextCompressionService.ts # 压缩服务
│   │   │   ├── TokenEstimator.ts           # Token估算器
│   │   │   └── strategies/                 # 压缩策略
│   │   │       ├── TruncateStrategy.ts     # 截断策略
│   │   │       ├── PruneStrategy.ts        # 修剪策略
│   │   │       ├── SummaryStrategy.ts      # 摘要策略
│   │   │       └── HybridStrategy.ts       # 混合策略
│   │   ├── tool-retrieval/                 # 工具检索
│   │   │   └── ToolRetrievalService.ts     # SurrealDB向量检索服务
│   │   ├── executors/                      # 执行器
│   │   │   ├── SkillsSandboxExecutor.ts    # 技能沙箱执行器
│   │   │   └── BuiltInExecutor.ts          # 内置工具执行器
│   │   ├── chat/                           # 聊天辅助服务
│   │   │   ├── ChatServiceFactory.ts       # ChatService工厂
│   │   │   ├── MessagePreprocessor.ts      # 消息预处理器
│   │   │   ├── ConversationSaver.ts        # 对话保存器
│   │   │   └── StrategySelector.ts         # 策略选择器
│   │   └── mcp/                            # MCP相关
│   │       ├── MCPServerManager.ts         # MCP服务器管理器
│   │       ├── MCPConfigService.ts         # MCP配置服务
│   │       └── convert.ts                  # 工具转换器
│   │
│   ├── strategies/                         # 策略层
│   │   ├── ChatStrategy.ts                 # 策略接口
│   │   ├── ReActStrategy.ts                # ReAct多轮推理策略
│   │   └── SingleRoundStrategy.ts          # 单轮快速响应策略
│   │
│   ├── api/                                # API接口层
│   │   ├── controllers/                    # 控制器
│   │   │   ├── ChatController.ts           # 聊天控制器
│   │   │   ├── ProviderController.ts       # 提供商控制器
│   │   │   ├── ModelController.ts          # 模型控制器
│   │   │   └── SkillsController.ts         # 技能控制器
│   │   ├── routes/                         # 路由定义
│   │   │   ├── skillRoutes.ts              # 技能路由
│   │   │   └── mcpRoutes.ts                # MCP路由
│   │   ├── websocket/                      # WebSocket处理
│   │   │   ├── WebSocketManager.ts         # WebSocket管理器
│   │   │   └── channels/                   # 通道
│   │   │       └── ChatChannel.ts          # 聊天通道
│   │   └── middleware/                     # 中间件
│   │       ├── authMiddleware.ts           # 认证中间件
│   │       ├── validationMiddleware.ts     # 验证中间件
│   │       ├── rateLimitMiddleware.ts      # 限流中间件
│   │       ├── securityHeadersMiddleware.ts # 安全头中间件
│   │       └── errorHandler.ts             # 错误处理器
│   │
│   ├── types/                              # 类型定义
│   │   ├── index.ts                        # 公共类型
│   │   ├── abp.ts                          # ABP协议类型
│   │   ├── llm-models.ts                   # LLM模型类型
│   │   ├── tool-system.ts                  # 工具系统类型
│   │   └── mcp.ts                          # MCP类型
│   │
│   ├── utils/                              # 工具函数
│   │   ├── logger.ts                       # 日志工具
│   │   ├── config-loader.ts                # 配置加载器
│   │   └── request-id.ts                   # 请求ID生成器
│   │
│   └── server.ts                           # 服务器入口点
│
├── config/                                 # 配置文件目录
│   └── admin-config.json                   # 管理配置（JSON格式）
│
├── .data/                                  # 数据目录（隐藏）
│   ├── surrealdb                           # SurrealDB数据库
│   └── vector_store/                       # SurrealDB向量存储
│       └── skills.lance                    # 技能向量表
│
├── scripts/                                # 脚本目录
│   └── migrations/                         # 数据库迁移脚本
│
├── tests/                                  # 测试目录
│   ├── unit/                               # 单元测试
│   └── integration/                        # 集成测试
│
└── docs/                                   # 文档目录
    └── architecture.md                     # 本架构文档
```

---

## 4. 核心组件详解

### 4.1 Core Layer（核心层）

核心层是整个框架的基础，提供协议解析、LLM适配器管理和事件通信等底层能力。

#### 4.1.1 ProtocolEngine（协议引擎）

**文件位置:** `src/core/ProtocolEngine.ts`

ProtocolEngine 是 ApexBridge 的协议中枢，负责 ABP 协议的解析、变量引擎的管理以及 RAG 服务的集成。

**核心功能:**

| 功能        | 描述                                                                         |
| ----------- | ---------------------------------------------------------------------------- |
| ABP协议解析 | 通过 ABPProtocolParser 实现 JSON/Text 格式的协议解析，支持噪声去除和边界验证 |
| 变量引擎    | 提供模板变量替换能力，支持缓存机制（TTL可配置）                              |
| RAG服务     | 集成 abp-rag-sdk，支持向量检索和知识库管理                                   |

**关键方法:**

```typescript
class ProtocolEngine {
  // 获取ABP协议解析器
  getABPParser(): ABPProtocolParser;

  // 获取RAG服务实例
  getRAGService(): RAGService | undefined;

  // 初始化引擎
  async initialize(): Promise<void>;

  // 优雅关闭
  async shutdown(): Promise<void>;
}
```

**配置示例:**

```typescript
const abpConfig: ABPProtocolConfig = {
  dualProtocolEnabled: false, // 双协议支持
  errorRecoveryEnabled: true, // 错误恢复
  jsonRepair: { enabled: true }, // JSON修复
  noiseStripping: { enabled: true }, // 噪声去除
  fallback: { enabled: true }, // 回退机制
  variable: { cacheEnabled: true, cacheTTL: 60000 }, // 变量缓存
};
```

#### 4.1.2 LLMManager（LLM管理器）

**文件位置:** `src/core/LLMManager.ts`

LLMManager 采用两级配置结构（提供商+模型），支持多模型类型（NLP、Embedding、Rerank等），配置从 SurrealDB 数据库加载，支持运行时热更新。

**核心特性:**

| 特性           | 描述                                                   |
| -------------- | ------------------------------------------------------ |
| 两级适配器缓存 | 提供商级适配器（启动时加载）+ 模型级适配器（动态创建） |
| 配置哈希       | 计算模型配置哈希，检测配置变化                         |
| LRU驱逐        | 超过缓存大小限制时驱逐最旧条目                         |
| 多模型支持     | NLP（对话）、Embedding（向量化）、Rerank（重排序）     |

**适配器缓存机制:**

```
┌─────────────────────────────────────────────────────────────┐
│                    LLMManager 缓存架构                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  Provider Adapters   │  │   Model Adapters Cache       │ │
│  │  (提供商级适配器)      │  │    (模型级适配器缓存)          │ │
│  │                      │  │                               │ │
│  │  Map<string,         │  │  Map<string, AdapterCache>   │ │
│  │    ILLMAdapter>      │  │  - adapter: ILLMAdapter      │ │
│  │                      │  │  - configHash: string        │ │
│  │  启动时加载           │  │  - lastUsed: number          │ │
│  │  持久化缓存           │  │                               │ │
│  │                      │  │  动态创建，按需缓存            │ │
│  │                      │  │  TTL + LRU驱逐                │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**核心方法:**

```typescript
class LLMManager {
  // 聊天补全
  async chat(messages: Message[], options?: ChatOptions): Promise<LLMResponse>;

  // 流式聊天补全
  async *streamChat(messages: Message[], options?: ChatOptions): AsyncIterableIterator<string>;

  // 文本向量化
  async embed(texts: string[]): Promise<number[][]>;

  // 刷新配置
  refresh(): void;

  // 获取可用提供商
  getAvailableProviders(): string[];
}
```

#### 4.1.3 LLM Adapters（LLM适配器）

**文件位置:** `src/core/llm/adapters/`

ApexBridge 通过适配器模式支持多种 LLM 提供商，所有适配器均继承自 `BaseOpenAICompatibleAdapter` 或实现 `ILLMAdapter` 接口。

**支持的适配器:**

| 适配器   | 文件                 | 说明                         |
| -------- | -------------------- | ---------------------------- |
| OpenAI   | `OpenAIAdapter.ts`   | OpenAI GPT系列、Azure OpenAI |
| Claude   | `ClaudeAdapter.ts`   | Anthropic Claude API         |
| DeepSeek | `DeepSeekAdapter.ts` | DeepSeek Chat/Reasoning模型  |
| Ollama   | `OllamaAdapter.ts`   | Ollama本地模型               |
| Zhipu    | `ZhipuAdapter.ts`    | 智谱AI ChatGLM系列           |
| Custom   | `CustomAdapter.ts`   | 自定义OpenAI兼容API          |

**适配器接口:**

```typescript
interface ILLMAdapter {
  // 聊天补全
  chat(messages: Message[], options?: ChatOptions): Promise<LLMResponse>;

  // 流式聊天补全
  streamChat(
    messages: Message[],
    options?: ChatOptions,
    tools?: Tool[]
  ): AsyncIterableIterator<string>;

  // 文本向量化（可选）
  embed?(texts: string[], model?: string): Promise<number[][]>;

  // 获取模型列表
  listModels(): Promise<ModelInfo[]>;
}
```

**适配器工厂:**

```typescript
class LLMAdapterFactory {
  static create(provider: string, config: AdapterConfig): ILLMAdapter {
    switch (provider) {
      case "openai":
        return new OpenAIAdapter(config);
      case "claude":
        return new ClaudeAdapter(config);
      case "deepseek":
        return new DeepSeekAdapter(config);
      case "ollama":
        return new OllamaAdapter(config);
      case "zhipu":
        return new ZhipuAdapter(config);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
}
```

---

### 4.2 Service Layer（服务层）

服务层封装了核心业务逻辑，包括聊天协调、上下文压缩、工具检索、技能管理和 MCP 集成。

#### 4.2.1 ChatService（聊天服务）

**文件位置:** `src/services/ChatService.ts`

ChatService 是框架的聊天协调器，负责处理聊天请求的完整生命周期，包括消息预处理、策略选择、上下文压缩和对话历史管理。

**消息处理流程:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ChatService.processMessage() 流程                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. 获取/创建会话                                                    │
│     └─> SessionManager.getOrCreate()                                │
│                                                                      │
│  2. 选择策略                                                         │
│     └─> StrategySelector.select()                                   │
│         ├─> ReActStrategy (启用selfThinking时)                       │
│         └─> SingleRoundStrategy (默认)                               │
│                                                                      │
│  3. 策略prepare阶段                                                  │
│     └─> strategy.prepare()                                          │
│         └─> 返回需要注入的变量 (如 available_tools)                   │
│                                                                      │
│  4. 消息预处理                                                        │
│     └─> MessagePreprocessor.preprocess()                            │
│         ├─> 系统提示词注入                                           │
│         └─> 变量替换                                                 │
│                                                                      │
│  5. 上下文压缩 (可选)                                                 │
│     └─> ContextCompressionService.compress()                        │
│         └─> Truncate/Prune/Summary/Hybrid                           │
│                                                                      │
│  6. 策略执行                                                         │
│     └─> strategy.execute() / strategy.stream()                      │
│                                                                      │
│  7. 保存对话历史                                                      │
│     └─> ConversationSaver.save()                                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**核心方法:**

```typescript
class ChatService {
  // 处理聊天消息
  async processMessage(messages: Message[], options: ChatOptions = {}): Promise<any>;

  // 流式处理消息
  async *streamMessage(messages: Message[], options: ChatOptions): AsyncIterableIterator<string>;

  // 任务复杂度评估
  estimateTaskComplexity(query: string): number;

  // 获取服务状态
  getStatus(): ChatServiceStatus;
}
```

#### 4.2.2 ContextCompressionService（上下文压缩服务）

**文件位置:** `src/services/context-compression/ContextCompressionService.ts`

ContextCompressionService 提供统一的上下文压缩入口，支持 4 种压缩策略，采用 OpenCode 风格的智能压缩决策机制。

**4种压缩策略:**

| 策略     | 文件                  | 描述                                         |
| -------- | --------------------- | -------------------------------------------- |
| Truncate | `TruncateStrategy.ts` | 直接截断最旧消息，保留最新消息               |
| Prune    | `PruneStrategy.ts`    | 智能修剪，保留关键消息（系统消息、工具调用） |
| Summary  | `SummaryStrategy.ts`  | 使用LLM生成对话摘要，压缩历史消息            |
| Hybrid   | `HybridStrategy.ts`   | 混合策略，结合多种方法                       |

**OpenCode压缩决策流程:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                  OpenCode智能压缩决策流程                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. 溢出检测 (考虑缓存/输出空间)                                       │
│     ├─> 警告级别 (overflowRatio < 0.8)                               │
│     └─> 严重级别 (overflowRatio >= 0.8)                              │
│                                                                      │
│  2. 受保护修剪 (auto + prune + overflow)                             │
│     ├─> 识别并保护工具输出消息                                        │
│     ├─> 识别并保护工具调用消息                                        │
│     └─> 从后向前保留可移除消息                                        │
│                                                                      │
│  3. AI摘要生成 (severe overflow)                                     │
│     ├─> 保留系统消息 + 最近5条消息                                    │
│     ├─> 生成对话摘要 (用户/助手/工具调用统计)                          │
│     └─> 创建摘要消息替换旧消息                                        │
│                                                                      │
│  4. 策略回退 (如上述方法未能解决问题)                                  │
│     └─> 使用配置的策略 (truncate/prune/summary/hybrid)               │
│                                                                      │
│  5. 绝对限制兜底                                                     │
│     └─> 确保不超过 ABSOLUTE_MIN_TOKENS (1000)                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**压缩统计:**

```typescript
interface CompressionStats {
  originalMessageCount: number; // 原始消息数
  compactedMessageCount: number; // 压缩后消息数
  originalTokens: number; // 原始Token数
  compactedTokens: number; // 压缩后Token数
  savedTokens: number; // 节省Token数
  savingsRatio: number; // 节省比例
  strategy: string; // 使用的策略
  wasCompressed: boolean; // 是否执行了压缩
  openCodeDecision: {
    // OpenCode决策信息
    overflowDetected: boolean;
    compactionType: "none" | "prune" | "summary" | "strategy" | "hybrid";
    severity: "none" | "warning" | "severe";
    protectedCount: number;
    toolProtection: {
      protectedTools: number;
      protectedOutputs: number;
    };
  };
}
```

#### 4.2.3 ToolRetrievalService（工具检索服务）

**文件位置:** `src/services/tool-retrieval/ToolRetrievalService.ts`

ToolRetrievalService 基于 SurrealDB 提供向量数据库能力，支持 Skills 和 MCP 工具的语义检索。

**数据模型:**

```typescript
interface ToolsTable {
  id: string; // MD5哈希
  name: string; // 工具名称
  description: string; // 工具描述
  tags: string[]; // 标签
  path?: string; // Skills路径 (Skill特有)
  version?: string; // 版本 (Skill特有)
  source?: string; // MCP服务器ID 或 skill名称
  toolType: "skill" | "mcp" | "builtin"; // 工具类型
  metadata: string; // JSON格式元数据
  vector: number[]; // 向量嵌入
  indexedAt: Date; // 索引时间
}
```

**向量搜索流程:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ToolRetrievalService 检索流程                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. 初始化 (懒加载)                                                  │
│     └─> 连接SurrealDB → 创建IVF_PQ索引             │
│                                                                      │
│  2. 生成查询向量                                                     │
│     └─> 使用embedding模型将查询文本向量化                              │
│         └─> LLMManager.embed() → 数据库配置的默认embedding模型        │
│                                                                      │
│  3. 向量相似度搜索                                                   │
│     └─> table.query().nearestTo(queryVector)                        │
│         └─> 距离类型: cosine (余弦相似度)                             │
│                                                                      │
│  4. 结果过滤                                                         │
│     └─> 阈值过滤 (默认 threshold: 0.7)                               │
│         └─> 相似度 = 1 - distance/2                                 │
│                                                                      │
│  5. 结果格式化                                                       │
│     └─> 解析metadata JSON → 返回ToolRetrievalResult[]               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**初始化配置:**

```typescript
const config: ToolRetrievalConfig = {
  vectorDbPath: "./.data", // 向量数据库路径
  model: "nomic-embed-text:latest", // embedding模型名称
  dimensions: 768, // 向量维度 (初始化时从DB获取实际值)
  cacheSize: 1000, // 缓存大小
  similarityThreshold: 0.7, // 相似度阈值
  maxResults: 10, // 最大返回结果数
};
```

#### 4.2.4 SkillManager（技能管理器）

**文件位置:** `src/services/SkillManager.ts`

SkillManager 管理本地技能的完整生命周期，支持 ZIP 包安装、卸载和更新，与 ToolRetrievalService 集成实现技能向量化索引。

**技能结构:**

```
.data/skills/
├── skill-name-1/
│   ├── SKILL.md           # 技能元数据 (YAML Frontmatter)
│   ├── README.md          # 技能说明
│   ├── src/               # 技能代码
│   │   └── index.ts
│   └── .vectorized        # 向量化标记文件
└── skill-name-2/
    └── ...
```

**SKILL.md 示例:**

```yaml
---
name: file-operations
description: 提供文件读写、目录操作等能力
version: 1.0.0
tags:
  - file
  - io
  - system
tools:
  - name: read_file
    description: 读取文件内容
    input_schema:
      type: object
      properties:
        path:
          type: string
          description: 文件路径
      required: ["path"]
---
```

**核心方法:**

```typescript
class SkillManager {
  // 安装技能 (ZIP)
  async installSkill(zipPath: string): Promise<SkillInstallResult>;

  // 卸载技能
  async uninstallSkill(skillName: string): Promise<boolean>;

  // 列出技能
  listSkills(options?: ListSkillsOptions): SkillInfo[];

  // 执行技能
  async executeSkill(name: string, args: Record<string, any>): Promise<ToolResult>;

  // 等待初始化完成
  waitForInitialization(): Promise<void>;
}
```

#### 4.2.5 MCPIntegrationService（MCP集成服务）

**文件位置:** `src/services/MCPIntegrationService.ts`

MCPIntegrationService 实现 Model Context Protocol 的客户端功能，管理 MCP 服务器的注册、工具发现和执行。

**核心功能:**

| 功能       | 描述                                    |
| ---------- | --------------------------------------- |
| 服务器管理 | 注册、注销、重启 MCP 服务器             |
| 工具发现   | 自动发现服务器工具，注册到 ToolRegistry |
| 工具执行   | 调用 MCP 工具，处理返回结果             |
| 向量索引   | 将 MCP 工具向量化，集成到工具检索系统   |
| 持久化     | 从 SurrealDB 数据库加载已注册的服务器   |

**服务器状态:**

```typescript
type MCPServerPhase =
  | "pending" // 待启动
  | "initializing" // 初始化中
  | "running" // 运行中
  | "shutting-down" // 关闭中
  | "error"; // 错误状态
```

**工具调用流程:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MCP 工具调用流程                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. 确定服务器 (指定或自动发现)                                        │
│     ├─> 指定 serverId: 从 serverManagers 获取                         │
│     └─> 未指定: 从 toolIndex 查找                                     │
│                                                                      │
│  2. 验证服务器状态                                                    │
│     └─> phase === "running" 才能执行                                 │
│                                                                      │
│  3. 执行工具调用                                                      │
│     └─> MCPServerManager.callTool(toolCall)                          │
│                                                                      │
│  4. 清理结果元数据                                                    │
│     └─> cleanMcpToolResult() 移除技术标记                             │
│                                                                      │
│  5. 返回结果                                                          │
│     └─> MCPToolResult { success, content, duration, error? }         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**核心方法:**

```typescript
class MCPIntegrationService {
  // 注册MCP服务器
  async registerServer(config: MCPServerConfig): Promise<RegisterResult>;

  // 注销MCP服务器
  async unregisterServer(serverId: string): Promise<boolean>;

  // 调用工具
  async callTool(params: { toolName; arguments; serverId? }): Promise<MCPToolResult>;

  // 获取所有服务器
  getServers(): MCPServerInfo[];

  // 从数据库加载服务器
  async loadServersFromDatabase(): Promise<void>;

  // 健康检查
  async healthCheck(): Promise<HealthCheckResult>;
}
```

---

### 4.3 Strategy Layer（策略层）

策略层定义聊天处理策略接口，实现不同的聊天处理模式。

#### 4.3.1 ChatStrategy（策略接口）

**文件位置:** `src/strategies/ChatStrategy.ts`

所有聊天策略必须实现的接口。

```typescript
interface ChatStrategy {
  // 获取策略名称
  getName(): string;

  // 检查是否支持该选项
  supports(options: ChatOptions): boolean;

  // 准备阶段 (返回需要注入的变量)
  prepare(messages: Message[], options: ChatOptions): Promise<StrategyPrepareResult>;

  // 执行策略
  execute(messages: Message[], options: ChatOptions): Promise<ChatResult>;

  // 流式执行
  stream(
    messages: Message[],
    options: ChatOptions,
    abortSignal?: AbortSignal
  ): AsyncIterableIterator<any>;
}
```

#### 4.3.2 ReActStrategy（多轮推理策略）

**文件位置:** `src/strategies/ReActStrategy.ts`

ReActStrategy 实现 ReAct (Reasoning + Acting) 模式，支持多轮推理、工具调用和流式思考输出。

**核心特性:**

| 特性         | 描述                                                         |
| ------------ | ------------------------------------------------------------ |
| 最大迭代次数 | 50轮 (可配置)                                                |
| 工具系统     | 内置工具 + Skills + MCP 工具                                 |
| 自动清理     | 5分钟未使用的Skills自动注销                                  |
| 流式事件     | reasoning-start/delta/end, step-start/finish, tool_start/end |

**工具系统集成:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ReActStrategy 工具系统                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. 工具发现                                                         │
│     ├─> BuiltInToolsRegistry (内置工具)                              │
│     ├─> ToolRetrievalService (Skills向量检索)                        │
│     └─> SkillManager (Skills执行器)                                  │
│                                                                      │
│  2. 工具执行                                                         │
│     ├─> BuiltInExecutor (执行内置工具)                               │
│     └─> SkillsSandboxExecutor (执行Skills)                          │
│                                                                      │
│  3. 动态技能管理                                                     │
│     ├─> 追踪最后访问时间                                              │
│     ├─> 每分钟检查一次                                                │
│     └─> 超过5分钟未使用则自动注销                                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**流式事件类型:**

```typescript
type ReActStreamEvent =
  | { type: "reasoning-start"; data: string; iteration: number }
  | { type: "reasoning-delta"; data: string; stepNumber: number; iteration: number }
  | { type: "reasoning-end"; data: string; iteration: number }
  | { type: "step-start"; data: string; stepNumber: number; iteration: number }
  | { type: "step-finish"; data: string; stepNumber: number; iteration: number }
  | { type: "content"; data: string; stepNumber: number; iteration: number }
  | { type: "tool_start"; data: any; stepNumber: number; iteration: number }
  | { type: "tool_end"; data: any; stepNumber: number; iteration: number }
  | { type: "done"; data: any; iteration: number }
  | { type: "error"; data: any; iteration: number };
```

#### 4.3.3 SingleRoundStrategy（单轮快速响应策略）

**文件位置:** `src/strategies/SingleRoundStrategy.ts`

SingleRoundStrategy 是轻量级策略，直接调用 LLM，不进行多轮推理，适用于简单对话场景。

```typescript
class SingleRoundStrategy implements ChatStrategy {
  async execute(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    const response = await this.llmManager.chat(messages, options);
    return {
      content: response.content,
      usage: response.usage,
    };
  }

  async *stream(messages: Message[], options: ChatOptions): AsyncIterableIterator<string> {
    yield* this.llmManager.streamChat(messages, options);
  }
}
```

---

### 4.4 API Layer（接口层）

API 层提供 RESTful API 和 WebSocket 接口，处理客户端请求。

#### 4.4.1 REST API 端点

**聊天 API:**

| 方法 | 路径                   | 描述                 |
| ---- | ---------------------- | -------------------- |
| POST | `/v1/chat/completions` | 聊天完成（支持流式） |
| GET  | `/v1/models`           | 获取可用模型列表     |
| POST | `/v1/interrupt`        | 中断正在进行的请求   |

**会话管理 API:**

| 方法   | 路径                                         | 描述             |
| ------ | -------------------------------------------- | ---------------- |
| GET    | `/v1/chat/sessions/active`                   | 获取活动会话列表 |
| GET    | `/v1/chat/sessions/:conversationId`          | 获取单个会话     |
| GET    | `/v1/chat/sessions/:conversationId/history`  | 获取会话历史     |
| GET    | `/v1/chat/sessions/:conversationId/messages` | 获取对话消息     |
| DELETE | `/v1/chat/sessions/:conversationId`          | 删除会话         |

**LLM 配置 API:**

| 方法   | 路径                            | 描述               |
| ------ | ------------------------------- | ------------------ |
| GET    | `/api/llm/providers`            | 获取所有提供商     |
| POST   | `/api/llm/providers`            | 创建提供商         |
| PUT    | `/api/llm/providers/:id`        | 更新提供商         |
| DELETE | `/api/llm/providers/:id`        | 删除提供商         |
| GET    | `/api/llm/providers/:id/models` | 获取提供商模型列表 |
| POST   | `/api/llm/providers/:id/models` | 添加模型           |
| GET    | `/api/llm/models`               | 跨提供商查询模型   |

**技能管理 API:**

| 方法   | 路径                | 描述     |
| ------ | ------------------- | -------- |
| GET    | `/api/skills`       | 列出技能 |
| POST   | `/api/skills`       | 安装技能 |
| DELETE | `/api/skills/:name` | 卸载技能 |

**MCP 管理 API:**

| 方法   | 路径                         | 描述           |
| ------ | ---------------------------- | -------------- |
| GET    | `/api/mcp/servers`           | 列出MCP服务器  |
| POST   | `/api/mcp/servers`           | 注册服务器     |
| DELETE | `/api/mcp/servers/:id`       | 注销服务器     |
| GET    | `/api/mcp/servers/:id/tools` | 获取服务器工具 |
| POST   | `/api/mcp/tools/call`        | 调用工具       |

#### 4.4.2 WebSocket API

**文件位置:** `src/api/websocket/`

WebSocket 提供实时通信能力，支持流式响应和请求中断。

**连接端点:**

| 端点                     | 描述              |
| ------------------------ | ----------------- |
| `/chat/api_key=<key>`    | 聊天WebSocket连接 |
| `/v1/chat/api_key=<key>` | V1版本聊天连接    |

**心跳机制:**

```typescript
// 30秒心跳间隔
const HEARTBEAT_INTERVAL = 30000;

// Ping-Pong机制
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
});

// 定期Ping客户端
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);
```

**消息格式:**

```typescript
// 客户端发送
interface WSClientMessage {
  type: "chat" | "interrupt";
  payload: {
    messages: Message[];
    options?: ChatOptions;
  };
}

// 服务器发送
interface WSServerMessage {
  event_type: "reasoning-start" | "reasoning-delta" | "content" | "done" | "error";
  reasoning_content?: string;
  content?: string;
  step_number?: number;
  iteration?: number;
}
```

---

### 4.5 Data Layer（数据层）

数据层负责持久化存储，统一使用 SurrealDB（结构化 + 向量数据）。

#### 4.5.1 SurrealDB 数据库

**文件位置:** `.data/apexbridge.db`

**主要表结构:**

```sql
-- LLM提供商表
CREATE TABLE providers (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,  -- openai, claude, deepseek, ollama, zhipu
  name TEXT NOT NULL,
  base_config TEXT NOT NULL,      -- JSON: { apiKey, baseURL, timeout, maxRetries }
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 模型表
CREATE TABLE models (
  id INTEGER PRIMARY KEY,
  provider_id INTEGER NOT NULL,
  model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_type TEXT NOT NULL,       -- nlp, embedding, rerank
  model_config TEXT NOT NULL,     -- JSON: { contextWindow, maxTokens, temperature }
  api_endpoint_suffix TEXT,       -- API端点后缀
  is_default INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  FOREIGN KEY (provider_id) REFERENCES providers(id),
  UNIQUE(provider_id, model_key)
);

-- MCP服务器表
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  config TEXT NOT NULL,           -- JSON: MCPServerConfig
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

#### 4.5.2 SurrealDB 向量数据库

**文件位置:** `.data/vector_store/skills.lance`

**向量表 Schema:**

```typescript
const schema = new arrow.Schema([
  new arrow.Field("id", new arrow.Utf8(), false), // MD5哈希
  new arrow.Field("name", new arrow.Utf8(), false), // 工具名称
  new arrow.Field("description", new arrow.Utf8(), false), // 工具描述
  new arrow.Field("tags", new arrow.List(new arrow.Utf8()), false), // 标签列表
  new arrow.Field("path", new arrow.Utf8(), true), // Skills路径
  new arrow.Field("version", new arrow.Utf8(), true), // 版本
  new arrow.Field("source", new arrow.Utf8(), true), // 来源(MCP服务器ID/skill名称)
  new arrow.Field("toolType", new arrow.Utf8(), false), // skill|mcp|builtin
  new arrow.Field("metadata", new arrow.Utf8(), false), // JSON元数据
  new arrow.Field("vector", new arrow.FixedSizeList(dimensions), false), // 向量
  new arrow.Field("indexedAt", new arrow.Timestamp(), false), // 索引时间
]);
```

**向量索引配置:**

```typescript
await table.createIndex("vector", {
  config: Index.ivfPq({
    numPartitions: 64, // 分区数
    numSubVectors: 8, // 子向量数
  }),
  replace: true,
});
```

---

## 5. 设计模式

ApexBridge 在架构中运用了多种设计模式，确保代码的可维护性、可扩展性和可测试性。

### 5.1 适配器模式 (Adapter Pattern)

**应用场景:** LLM 提供商适配器

所有 LLM 适配器都实现统一的 `ILLMAdapter` 接口，使上层代码无需关心具体提供商的实现细节。

```typescript
// 统一的接口
interface ILLMAdapter {
  chat(messages: Message[], options?: ChatOptions): Promise<LLMResponse>;
  streamChat(messages: Message[], options?: ChatOptions): AsyncIterableIterator<string>;
}

// 具体实现
class OpenAIAdapter implements ILLMAdapter {
  /* ... */
}
class ClaudeAdapter implements ILLMAdapter {
  /* ... */
}
class DeepSeekAdapter implements ILLMAdapter {
  /* ... */
}

// 使用方代码（依赖接口，而非具体实现）
class LLMManager {
  constructor(private adapter: ILLMAdapter) {}
  async chat(messages, options) {
    return this.adapter.chat(messages, options);
  }
}
```

### 5.2 策略模式 (Strategy Pattern)

**应用场景:** 聊天策略、上下文压缩策略

将算法/策略封装为独立对象，使它们可以互相替换。

```typescript
// 策略接口
interface ChatStrategy {
  execute(messages: Message[], options: ChatOptions): Promise<ChatResult>;
  stream(messages: Message[], options: ChatOptions): AsyncIterableIterator<string>;
}

// 具体策略
class ReActStrategy implements ChatStrategy {
  /* ... */
}
class SingleRoundStrategy implements ChatStrategy {
  /* ... */
}

// 上下文压缩策略
interface IContextCompressionStrategy {
  compress(messages: Message[], config: CompressionStrategyConfig): Promise<CompressionResult>;
}

class TruncateStrategy implements IContextCompressionStrategy {
  /* ... */
}
class PruneStrategy implements IContextCompressionStrategy {
  /* ... */
}
class SummaryStrategy implements IContextCompressionStrategy {
  /* ... */
}
class HybridStrategy implements IContextCompressionStrategy {
  /* ... */
}

// 使用方代码
class ChatService {
  private strategy: ChatStrategy;

  setStrategy(strategy: ChatStrategy) {
    this.strategy = strategy;
  }

  async processMessage(messages, options) {
    return this.strategy.execute(messages, options);
  }
}
```

### 5.3 工厂模式 (Factory Pattern)

**应用场景:** 适配器创建、ChatService 创建

使用工厂类封装复杂创建逻辑。

```typescript
// 适配器工厂
class LLMAdapterFactory {
  static create(provider: string, config: AdapterConfig): ILLMAdapter {
    switch (provider) {
      case "openai":
        return new OpenAIAdapter(config);
      case "claude":
        return new ClaudeAdapter(config);
      case "deepseek":
        return new DeepSeekAdapter(config);
      case "ollama":
        return new OllamaAdapter(config);
      case "zhipu":
        return new ZhipuAdapter(config);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
}

// ChatService工厂
class ChatServiceFactory {
  create(protocolEngine: ProtocolEngine, llmManager: LLMManager, eventBus: EventBus): ChatService {
    const messagePreprocessor = new MessagePreprocessor(protocolEngine);
    const conversationSaver = new ConversationSaver();
    const strategySelector = new StrategySelector(llmManager);
    const sessionManager = new SessionManager();
    const requestTracker = new RequestTracker();

    return new ChatService(
      protocolEngine,
      llmManager,
      eventBus,
      messagePreprocessor,
      conversationSaver,
      strategySelector,
      sessionManager,
      requestTracker
    );
  }
}
```

### 5.4 单例模式 (Singleton Pattern)

**应用场景:** EventBus、ConfigService、SkillManager

确保类只有一个实例，并提供全局访问点。

```typescript
// EventBus 单例
class EventBus {
  private static instance: EventBus;

  private northbound: EventEmitter = new EventEmitter();
  private southbound: EventEmitter = new EventEmitter();

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }
}

// 使用
const eventBus = EventBus.getInstance();
```

### 5.5 观察者模式 (Observer Pattern)

**应用场景:** 事件系统、服务器状态监听

通过事件机制实现组件间的松耦合通信。

```typescript
// MCP 服务器事件
class MCPIntegrationService extends EventEmitter {
  private setupEventHandlers(): void {
    this.on("server-status-changed", (data) => {
      logger.info(`Server ${data.serverId} status: ${data.status.phase}`);
    });

    this.on("tools-changed", async (data) => {
      await this.updateToolIndex(data.serverId, data.tools);
      await this.vectorizeServerTools(data.serverId, data.tools);
    });
  }
}

// 服务器管理器
class MCPServerManager extends EventEmitter {
  private emitStatusChanged(status: MCPServerStatus) {
    this.emit("status-changed", status);
  }
}
```

---

## 6. 配置管理

ApexBridge 使用 JSON 配置文件和环境变量相结合的配置管理方式。

### 6.1 配置文件

**文件位置:** `config/admin-config.json`

```json
{
  "port": 8088,
  "api": {
    "host": "0.0.0.0",
    "prefix": "/v1"
  },
  "auth": {
    "apiKey": "your-secret-key"
  },
  "environment": {
    "maxRequestSize": "100mb"
  },
  "contextCompression": {
    "enabled": true,
    "strategy": "hybrid",
    "outputReserve": 4000,
    "preserveSystemMessage": true
  },
  "selfThinking": {
    "enabled": true,
    "maxIterations": 50,
    "enableStreamThoughts": true,
    "enableToolActionParsing": true
  }
}
```

### 6.2 环境变量

| 变量                      | 描述                | 默认值      |
| ------------------------- | ------------------- | ----------- |
| `NODE_ENV`                | 运行环境            | development |
| `PORT`                    | 服务端口            | 8088        |
| `API_KEY` / `ABP_API_KEY` | API认证密钥         | -           |
| `OPENAI_API_KEY`          | OpenAI API密钥      | -           |
| `ANTHROPIC_API_KEY`       | Anthropic API密钥   | -           |
| `DEEPSEEK_API_KEY`        | DeepSeek API密钥    | -           |
| `EMBEDDING_PROVIDER`      | Embedding模型提供商 | -           |
| `EMBEDDING_MODEL`         | Embedding模型名称   | -           |
| `LOG_LEVEL`               | 日志级别            | info        |
| `APEX_BRIDGE_AUTOSTART`   | 是否自动启动        | true        |

### 6.3 配置优先级

```
环境变量 > SurrealDB数据库 > 配置文件 (config/admin-config.json)
```

---

## 7. 启动流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ApexBridge 启动流程                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. 加载环境变量                                                     │
│     └─> dotenv.config()                                             │
│                                                                      │
│  2. 初始化目录结构                                                    │
│     └─> PathService.ensureAllDirs()                                 │
│                                                                      │
│  3. 加载配置                                                         │
│     └─> ConfigService.readConfig()                                  │
│         └─> 验证系统配置 (环境变量)                                   │
│         └─> 验证应用配置 (JSON文件)                                   │
│                                                                      │
│  4. 初始化LLM配置服务                                                 │
│     └─> LLMConfigService.getInstance()                              │
│         └─> SurrealDB数据库和表初始化                                │
│                                                                      │
│  5. 初始化SkillManager                                               │
│     └─> SkillManager.getInstance()                                  │
│         └─> 扫描Skills目录 → 向量化索引                               │
│                                                                      │
│  6. 加载MCP服务器                                                     │
│     └─> mcpIntegration.loadServersFromDatabase()                    │
│                                                                      │
│  7. 初始化协议引擎                                                    │
│     └─> ProtocolEngine.initialize()                                 │
│         └─> ABP协议解析器                                             │
│         └─> RAG服务 (如果启用)                                        │
│                                                                      │
│  8. 初始化LLM管理器                                                   │
│     └─> LLMManager.getInstance()                                    │
│         └─> 从SurrealDB加载提供商配置                                 │
│         └─> 创建提供商适配器                                           │
│                                                                      │
│  9. 创建ChatService                                                  │
│     └─> ChatServiceFactory.create()                                 │
│                                                                      │
│  10. 设置WebSocket                                                   │
│      └─> WebSocketManager.initialize()                              │
│          └─> 绑定到HTTP服务器                                         │
│          └─> 启动心跳检测                                             │
│                                                                      │
│  11. 设置Express中间件                                               │
│      ├─> 安全头 (Helmet.js)                                          │
│      ├─> CORS                                                       │
│      ├─> Body解析                                                   │
│      ├─> 限流                                                       │
│      ├─> 输入清理                                                    │
│      ├─> 安全日志                                                    │
│      ├─> 审计日志                                                    │
│      └─> 认证                                                        │
│                                                                      │
│  12. 设置路由                                                        │
│      └─> ChatController                                             │
│      └─> ProviderController                                         │
│      └─> ModelController                                            │
│      └─> skillRoutes                                               │
│      └─> mcpRoutes                                                 │
│      └─> 健康检查                                                   │
│                                                                      │
│  13. 启动HTTP服务器                                                   │
│      └─> server.listen(port, host)                                  │
│                                                                      │
│  14. 设置优雅关闭                                                     │
│      └─> SIGINT / SIGTERM 处理                                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. 总结

ApexBridge 是一个设计良好、架构清晰的 AI Agent 框架，通过模块化的设计实现了高度的灵活性和可扩展性。框架的核心优势包括：

1. **多模型支持** - 通过适配器模式无缝集成多种 LLM 提供商
2. **MCP 协议集成** - 标准化的工具调用和上下文共享
3. **智能上下文压缩** - 4 层压缩策略确保长对话场景下的高效 token 利用
4. **灵活的策略模式** - 支持多种聊天处理模式（ReAct、SingleRound）
5. **完善的工具系统** - 内置工具、Skills、MCP 工具的统一管理
6. **可靠的数据持久化** - SurrealDB 统一存储架构

框架采用 TypeScript 开发，充分利用了类型系统带来的安全性，同时保持了良好的代码可读性和可维护性。

---

**文档版本:** 1.0.0  
**最后更新:** 2026-01-10
