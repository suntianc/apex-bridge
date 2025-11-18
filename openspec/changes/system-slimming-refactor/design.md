# 系统精简重构设计

## 架构设计概述

### 核心设计原则

1. **可选注入模式（Optional Injection Pattern）**
   - 所有非核心模块采用可选注入，不强制依赖
   - 通过 `setXxx()` 方法注入，缺失时不影响系统启动
   - 变量解析器自动检测服务可用性，无服务时不提供对应变量

2. **渐进式移除策略**
   - 分6个阶段实施，每个阶段独立可回滚
   - 先移除无害模块（Personality/Emotion），再精简复杂子系统
   - 保持 API 兼容性，OpenAI 兼容端点不变

3. **能力保留优先**
   - Skills 体系保留核心执行能力（10个模块）
   - RAG 保留 SemanticMemory（向量检索）核心
   - WebSocket 转型（从分布式通信 → 实时对话）

### 技术架构视图（简化后）

```
┌─────────────────────────────────────────┐
│         API Layer (REST + WebSocket)     │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│         ChatService (Routing Hub)        │
│  - Session management                     │
│  - Request lifecycle                      │
└──────────┬──────────────────┬───────────┘
           │                  │
           ▼                  ▼
┌─────────────────┐    ┌──────────────────┐
│  LLMManager     │    │ ProtocolEngine   │
│  (Multi-LLM)    │    │  (ABP Protocol)  │
└────────┬────────┘    └─────────┬────────┘
         │                       │
         └──────────┬────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│      SkillsExecutionManager             │
│  - Tool mapping & execution             │
│  - 10 core modules                      │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│     SemanticMemoryService (RAG)         │
│  - Vector search (hnswlib)              │
│  - Knowledge retrieval                  │
└─────────────────────────────────────────┘
```

### 模块职责重新划分

| 模块 | 原有职责 | 新职责 | 变化 |
|------|---------|--------|------|
| LLMManager | 适配多提供商（OpenAI/DeepSeek/Claude等） | + 健康检查、负载均衡、故障转移 | ⬆️ 增强 |
| ProtocolEngine | ABP协议解析、7层变量解析 | 移除 RAG/Diary 相关解析器（2个） | ⬇️ 精简 |
| ChatService | 对话管理、插件/Skills调用 | 移除插件系统，纯 Skills 调用 | ➡️ 保持不变 |
| WebSocketManager | 分布式节点通信 + 日志 | 仅保留 Chat 实时通道 + 日志 | ⬇️ 精简 |
| Skills | 30+模块（加载/执行/监控/优化） | 10个核心（执行/安全/缓存） | ⬇️ 精简 |
| Memory | 双轨记忆 + 冲突解决 | 仅 SemanticMemory（向量检索） | ⬇️ 精简 |

## 详细设计

### 1. LLMManager 重构设计

#### 当前实现
- `LLMClient`（510行）- OpenAI 兼容适配器
- 功能：统一接口、参数过滤、重试、流式响应

#### 增强设计

```typescript
// 重命名：LLMClient → LLMManager
// 文件：src/core/LLMManager.ts

export interface ProviderHealth {
  provider: string;
  status: 'healthy' | 'degraded' | 'down';
  latency: number;
  lastError?: string;
}

export interface ProviderMetrics {
  provider: string;
  requests: number;
  errors: number;
  avgLatency: number;
  costPer1K: number; // 成本指标
}

export class LLMManager {
  // 保持原有属性
  private adapters: Map<string, ILLMAdapter>;
  private defaultProvider: string;

  // ✅ 保持接口（向后兼容）
  async chat(messages, options): Promise<LLMResponse>;
  async *streamChat(messages, options, signal): AsyncIterableIterator<string>;
  async getAllModels(): Promise<Array<{id: string, provider: string}>>;

  // 🆕 新增能力

  /**
   * 健康检查
   * 检测所有配置的 LLM 提供商可用性
   */
  async healthCheck(provider?: string): Promise<ProviderHealth[]>;

  /**
   * 智能提供商选择
   * 根据模型名称自动选择最佳提供商
   */
  async switchProvider(model: string): Promise<string>;

  /**
   * 负载均衡
   * 在多个 healthy 提供商间轮询分配请求
   */
  async loadBalance(
    providers: string[],
    messages: Message[],
    options: ChatOptions
  ): Promise<LLMResponse>;

  /**
   * 故障转移链
   * 按优先级尝试多个提供商，直到成功
   */
  async fallbackChain(
    providers: string[],
    messages: Message[],
    options: ChatOptions
  ): Promise<LLMResponse>;

  /**
   * 获取性能指标
   */
  async getProviderMetrics(): Promise<ProviderMetrics[]>;
}
```

#### 使用示例

```typescript
// server.ts
const llmManager = new LLMManager(config.llm);

// 定期健康检查（每30秒）
setInterval(async () => {
  const health = await llmManager.healthCheck();
  logger.info('🏥 LLM Health:', health);
}, 30000);

// 故障转移调用
const response = await llmManager.fallbackChain(
  ['openai', 'deepseek', 'claude'],  // 优先级顺序
  messages,
  { model: 'gpt-4o-mini', temperature: 0.7 }
);
```

### 2. ProtocolEngine 瘦身设计

#### 当前实现
- 7层变量解析器（Layer 1-3）
- 230行代码

#### 精简后设计

```typescript
// 文件：src/core/ProtocolEngine.ts

export class ProtocolEngine {
  // 保持不变
  public abpParser: ABPProtocolParser;
  public variableEngine: any;

  initializeCore(): void {
    // Layer 1 (priority: 10-30): 系统内置变量
    this.variableEngine.registerProvider(new TimeProvider());

    // Layer 2 (priority: 40-60): 配置驱动变量
    this.variableEngine.registerProvider(
      new EnvironmentProvider(['Var', 'Tar', 'Sar'])
    );
    this.variableEngine.registerProvider(new PlaceholderProvider());

    // Layer 3 (priority: 70-95): 动态内容变量
    this.variableEngine.registerProvider(
      new AgentProvider({
        agentDirectory: agentDir,
        enableCache: true
      })
    );

    // ❌ 移除：DiaryProvider（依赖 Memory/RAG）
    // ❌ 移除：RAGProvider（依赖 RAG 服务）
    //   原因：这两个变量需要外部服务初始化
    //   如果保留：在 ChatService 不注入 Memory 时会导致变量解析错误

    // ✅ 保留：ToolDescriptionProvider（仅依赖 Skills）
    //   Skills 是核心能力，已初始化
    this.variableEngine.registerProvider(toolDescProvider);

    // ✅ 保留：AsyncResultProvider（无外部依赖）
    this.variableEngine.registerProvider(asyncResultProvider);
  }
}
```

#### 配置变更

```yaml
# 移除 RAG 配置段
# abp.rag 配置不再需要

abp:
  dualProtocolEnabled: false
  variable:
    cacheEnabled: true
    # 不再有复杂的 provider 配置
```

### 3. WebSocketManager 精简设计

#### 当前实现
- 2个通道：DistributedServer + ABPLog
- 支持分布式节点通信

#### 精简后设计

```typescript
// 文件：src/api/websocket/WebSocketManager.ts

export class WebSocketManager {
  private wss!: WebSocketServer;
  private abpLogChannel: ABPLogChannel;
  private chatChannel: ChatChannel; // 🆕 新增

  constructor(
    private config: AdminConfig,
    abpLogChannel: ABPLogChannel,
    chatChannel: ChatChannel
  ) {
    this.abpLogChannel = abpLogChannel;
    this.chatChannel = chatChannel;
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws, request) => {
      const url = request.url || '';

      // 1. 保留：ABPLog 通道（系统监控）
      const abpLogMatch = url.match(/^\/(?:ABPlog|log)\/ABP_Key=(.+)$/);
      if (abpLogMatch) {
        this.abpLogChannel.handleConnection(ws, abpKey, request);
        return;
      }

      // 2. 🆕 新增：Chat 实时对话通道
      // 用途：前端实时对话、流式响应、状态推送
      const chatMatch = url.match(/^\/(?:chat|conversation)\/ABP_Key=(.+)$/);
      if (chatMatch) {
        this.chatChannel.handleConnection(ws, abpKey, request);
        return;
      }

      // 3. ❌ 移除：Distributed Server 通道
      // 原因：NodeManager 和分布式节点已被移除
      // 路径：/distributed-server/ABP_Key=xxx

      // 4. 未知路径关闭
      ws.close(1003, 'Unknown path');
    });
  }
}
```

#### ChatChannel 设计

```typescript
// 文件：src/api/websocket/channels/ChatChannel.ts

export class ChatChannel {
  constructor(private chatService: ChatService) {}

  handleConnection(ws: WebSocket, apiKey: string, request: any): void {
    // 认证
    if (!this.validateApiKey(apiKey)) {
      ws.close(1008, 'Invalid API key');
      return;
    }

    // 消息处理
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'chat': {
            const { messages, options } = message.payload;

            // 调用 ChatService
            const response = await this.chatService.createChatCompletion({
              messages,
              ...options
            });

            // 返回结果
            ws.send(JSON.stringify({
              type: 'chat_response',
              payload: response
            }));
            break;
          }

          case 'stream_chat': {
            const { messages, options } = message.payload;

            // 流式响应
            const stream = await this.chatService.createStreamChatCompletion({
              messages,
              ...options
            });

            for await (const chunk of stream) {
              ws.send(JSON.stringify({
                type: 'stream_chunk',
                payload: chunk
              }));
            }

            ws.send(JSON.stringify({
              type: 'stream_done'
            }));
            break;
          }
        }
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          error: error.message
        }));
      }
    });
  }
}
```

#### 前端使用示例

```javascript
// WebSocket 客户端（JavaScript）

const ws = new WebSocket('ws://localhost:3000/chat/ABP_Key=your_api_key');

// 接收消息
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'chat_response':
      console.log('AI回复:', data.payload.choices[0].message.content);
      break;

    case 'stream_chunk':
      process.stdout.write(data.payload); // 实时输出
      break;

    case 'stream_done':
      console.log('\n流式响应完成');
      break;

    case 'error':
      console.error('错误:', data.error);
      break;
  }
};

// 发送普通对话
ws.send(JSON.stringify({
  type: 'chat',
  payload: {
    messages: [{ role: 'user', content: 'Hello!' }],
    options: { model: 'gpt-4o-mini' }
  }
}));

// 发送流式对话
ws.send(JSON.stringify({
  type: 'stream_chat',
  payload: {
    messages: [{ role: 'user', content: 'Tell me a story' }],
    options: { model: 'gpt-4o-mini', stream: true }
  }
}));
```

### 4. Skills 体系精简设计

#### 当前模块（30+）

当前结构：
```
skills/
├── SkillsExecutionManager.ts
├── SkillsToToolMapper.ts
├── SkillsIndex.ts
├── SkillsLoader.ts
├── ABPSkillsAdapter.ts
├── CodeGenerator.ts
├── CodeCache.ts
├── SkillsCache.ts
├── SecurityValidator.ts
├── SandboxEnvironment.ts
├── SkillsMetricsCollector.ts  // 🗑️
├── PerformanceOptimizer.ts    // 🗑️
├── ProductionMonitorService.ts // 🗑️
├── MemoryMonitor.ts           // 🗑️
├── PreloadManager.ts          // 🗑️
├── ... (20+ more)
└── executors/
    ├── BaseSkillsExecutor.ts
    ├── SkillsDirectExecutor.ts
    ├── SkillsInternalExecutor.ts
    ├── SkillsServiceExecutor.ts  // 🗑️ 可能保留
    ├── SkillsDistributedExecutor.ts // 🗑️ (NodeManager 已移除)
    └── ...
```

#### 精简后（10个核心）

```
skills/
├── SkillsExecutionManager.ts      // 执行管理 ⭐ 必需
├── SkillsToToolMapper.ts          // 工具映射 ⭐ 必需
├── SkillsIndex.ts                 // 能力索引 ⭐ 必需
├── SkillsLoader.ts                // 能力加载 ⭐ 必需
├── ABPSkillsAdapter.ts            // ABP协议适配 ⭐ 必需
├── CodeGenerator.ts               // 代码生成 ⭐ 核心能力
├── SecurityValidator.ts           // 安全验证 ⭐ 运行防护
├── SandboxEnvironment.ts          // VM2沙箱 ⭐ 安全执行
├── SkillsCache.ts                 // 编译缓存 ⭐ 性能优化
├── CodeCache.ts                   // 脚本缓存 ⭐ 性能优化
└── executors/
    ├── BaseSkillsExecutor.ts
    ├── SkillsDirectExecutor.ts    // 直接执行 ⭐ 核心执行器
    ├── SkillsInternalExecutor.ts  // 内部执行 ⭐ 核心执行器
    └── index.ts
```

#### 保留理由

| 模块 | 必要性 | 理由 |
|-----------|---------|------|
| SkillsExecutionManager | ⭐⭐⭐ | 统一管理 Skills 生命周期，核心中的核心 |
| SkillsToToolMapper | ⭐⭐⭐ | ABP 工具映射，Skills 与协议桥梁 |
| SkillsIndex/Loader | ⭐⭐⭐ | 发现和管理可用 Skills |
| ABPSkillsAdapter | ⭐⭐⭐ | ProtocolEngine 集成必需 |
| CodeGenerator | ⭐⭐⭐ | TypeScript 代码生成，执行器依赖 |
| DirectExecutor | ⭐⭐⭐ | 本地脚本的直接执行 |
| InternalExecutor | ⭐⭐⭐ | 内部系统能力调用 |
| SandboxEnvironment | ⭐⭐ | VM2 沙箱，安全防护 |
| SecurityValidator | ⭐⭐ | 代码级安全检查 |
| Skills/CodeCache | ⭐ | 编译/执行性能优化 |

#### 可移除模块（20+）

```typescript
// 🗑️ 移除以下（节省 ~4000 行代码）

// 监控与指标（非必需）
ProductionMonitorService.ts
SkillsMetricsCollector.ts
PerformanceOptimizer.ts
MemoryMonitor.ts
CodeGenerationProfiler.ts

// 预加载管理（按需加载，非必需）
PreloadManager.ts
PreloadStrategy.ts
ResourceLoader.ts

// 内存管理（非必需）
MemoryManager.ts
MemoryCleaner.ts

// 依赖管理（轻量级 Skills 无需复杂依赖图）
DependencyManager.ts

// 分布           式执行器（NodeManager 已移除）
SkillsDistributedExecutor.ts
SkillsServiceExecutor.ts  // 可能保留，用于外部服务调用
SkillsStaticExecutor.ts   // 静态资源执行
SkillsPreprocessorExecutor.ts // 预处理执行

// 索引优化（10个模块无需复杂优化）
SkillsIndexOptimizer.ts
LoadingConcurrencyController.ts
```

#### 精简的影响分析

| 影响项 | 说明 | 缓解措施 |
|--------|------|----------|
| 性能监控 | 失去 SkillsMetricsCollector | 使用基础 Node.js 性能监控工具替代 |
| 内存释放 | 失去 MemoryCleaner 自动清理 | 依赖 Node.js GC，或手动重启进程 |
| 预加载 | 冷启动时 Skills 首次加载慢 | 在部署时预热常用 Skills，或使用持久化进程 |
| 依赖管理 | 复杂 Skills 的依赖关系不检查 | 简化 Skills，确保无复杂依赖，或使用静态检查 |
| 分布式执行 | 无法分发到远程节点 | 本地执行所有 Skills（适用场景） |

### 5. Memory/RAG 简化设计

#### 当前实现

```
memory/
├── SemanticMemoryService.ts     // 向量检索
├── EpisodicMemoryService.ts     // 事件时间序列
├── EpisodicSemanticBridge.ts    // 桥接器
├── PromptBuilder.ts             // Prompt 构建
├── stores/
│   ├── HNSWSemanticStore.ts     // HNSW 向量存储
│   ├── InMemorySemanticStore.ts
│   ├── TimeSeriesEpisodicStore.ts
│   └── InMemoryEpisodicStore.ts
└── conflict/                    // 🗑️ 复杂冲突解决（可移除）
    ├── MemoryConflictDetector.ts
    ├── MemoryConflictArbiter.ts
    ├── MemoryMerger.ts
    └── MergeRuleManager.ts
```

#### 简化方案 A：轻量 RAG（推荐）

```
memory/
├── SemanticMemoryService.ts     // ⭐ 核心向量检索
└── stores/
    └── HNSWSemanticStore.ts     // HNSWLib 实现

// ❌ 移除
- EpisodicMemoryService（会话历史）- 可由日志系统替代
- EpisodicSemanticBridge（关联逻辑）- 功能过于复杂
- PromptBuilder（简化版）- ChatService 集成 BasicRAG 逻辑
- TimeSeriesEpisodicStore（时间序列）- 非必需
- conflict/*（冲突解决）- 过于复杂，无需
```

**设计要点：**

```typescript
// src/services/memory/SemanticMemoryService.ts

// 简单查询接口（去除复杂配置）
export interface SemanticMemoryService {
  searchSimilar(
    query: string,
    filters?: { userId?: string; personaId?: string }
  ): Promise<SemanticResult[]>;

  saveSemantic(
    content: string,
    metadata: { userId: string; source?: string }
  ): Promise<void>;
}

// 实现
export class DefaultSemanticMemoryService implements SemanticMemoryService {
  async searchSimilar(query: string, filters = {}): Promise<SemanticResult[]> {
    // 1. 向量化查询
    const embedding = await this.vectorize(query);

    // 2. HNSW 搜索
    const results = await this.store.search(embedding, {
      topK: this.config.defaultTopK,
      filters
    });

    return results;
  }

  async saveSemantic(content: string, metadata): Promise<void> {
    // 1. 向量化
    const embedding = await this.vectorize(content);

    // 2. 存储到 HNSW
    await this.store.save({
      id: randomUUID(),
      content,
      embedding,
      metadata
    });
  }

  private async vectorize(text: string): Promise<number[]> {
    // 调用外部向量化 API（OpenAI/Ollama）
    const response = await this.httpClient.post('/embeddings', {
      model: this.config.vectorizerModel,
      input: text
    });

    return response.data.embedding;
  }
}
```

**ChatService 集成：**

```typescript
// src/services/ChatService.ts

export class ChatService {
  private memoryService?: SemanticMemoryService;

  async createChatCompletion(params) {
    const { messages, ...options } = params;

    // 1. 从最后一条用户消息提取查询
    const lastUserMessage = messages
      .filter(m => m.role === 'user')
      .slice(-1)[0];

    let ragContext = '';

    // 2. RAG 检索（如果有 MemoryService）
    if (this.memoryService && lastUserMessage) {
      const results = await this.memoryService.searchSimilar(
        lastUserMessage.content,
        { userId: params.userId }
      );

      ragContext = results
        .map(r => r.content)
        .join('\n\n');

      logger.debug(`📚 RAG retrieved ${results.length} context paragraphs`);
    }

    // 3. 构建带上下文的系统提示
    const systemPrompt = ragContext
      ? `Based on the following context:\n\n${ragContext}\n\nAnswer the user question.`
      : 'You are a helpful assistant.';

    // 4. 调用 LLM
    const response = await this.llmManager.chat(
      [{ role: 'system', content: systemPrompt }, ...messages],
      options
    );

    return response;
  }
}
```

#### 简化方案 B：完整双轨（简化版）

如果业务需要会话历史：

```
memory/
├── SemanticMemoryService.ts     // 长期知识
├── EpisodicMemoryService.ts     // 会话历史（简化版）
├── SimpleBridge.ts              // 简单关联（无冲突解决）
└── stores/
    ├── HNSWSemanticStore.ts
    └── InMemoryEpisodicStore.ts // 内存存储

// 移除 conflict/*（所有冲突解决逻辑）
```

**简化说明：**
- EpisodicMemory：仅存储最近 N 条消息（环形缓冲区）
- SimpleBridge：自动关联（时间窗口 + 用户 ID）
- 无冲突检测、无合并规则、无仲裁逻辑

### 6. 实施路线图

#### 阶段 1：无害移除（Low Risk）

**时间：** 2-3 小时
**风险：** ⭐ 极低

```bash
# 修改：src/server.ts

# 删除以下初始化（或不调用 setter）
- chatService.setPersonalityEngine(personalityEngine);
- chatService.setEmotionEngine(emotionEngine);
- 不初始化 preferenceService
- 不初始化 relationshipService
- 不初始化 timelineService

# 删除：NodeManager 初始化
# 删除：DistributedService 初始化
```

**验证：**
```bash
# 1. 启动服务
npm run dev

# 2. 测试 ABP 协议
# {{time}} 变量应该正常工作

# 3. 测试对话 API
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]}'

# 预期：正常返回 AI 回复
```

#### 阶段 2：WebSocket 精简（Low Risk）

**时间：** 1-2 小时
**风险：** ⭐ 低

```bash
# 修改：src/api/websocket/WebSocketManager.ts

# 删除：
- distributedServerChannel 处理逻辑（第 58-73 行）
# 保留：
- abpLogChannel 处理逻辑（第 76-89 行）
# 新增：
- chatChannel 处理逻辑（同一路由文件）

# 修改：src/server.ts

# 删除：
- 将 DistributedService 注入 WebSocketManager
# 新增：
- 将 ChatService 注入 WebSocketManager
```

**验证：**
```javascript
// 测试 WebSocket 连接
const ws = new WebSocket('ws://localhost:3000/chat/ABP_Key=test_key');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'chat',
    payload: {
      messages: [{ role: 'user', content: 'Hello' }],
      options: { model: 'gpt-4o-mini' }
    }
  }));
};
```

#### 阶段 3：Memory 系统瘦身（Medium Risk）

**时间：** 4-6 小时（方案 A）
**风险：** ⭐⭐ 中

**任务：**
- 保留 SemanticMemoryService（核心 RAG）
- 删除 EpisodicMemoryService 和 Bridge
- 简化 PromptBuilder（ChatService 中内联 RAG 逻辑）

**步骤：**

1. 创建 `memory/SemanticMemoryService.ts`（简化版）
2. 修改 `ChatService.ts`（内联 RAG 查询）
3. 删除以下文件：
   - `memory/EpisodicMemoryService.ts`
   - `memory/EpisodicSemanticBridge.ts`
   - `memory/PromptBuilder.ts`
   - `memory/stores/TimeSeriesEpisodicStore.ts`
   - `memory/stores/InMemoryEpisodicStore.ts`
   - `memory/conflict/*`（4个文件）

**配置变更：**
```yaml
# 移除 RAG 配置段
# rag: { enabled: true, ... }

# 改为简单的记忆服务配置
memory:
  semantic:
    enabled: true
    storeName: hnswlib
    workDir: ./vector_store
    dimensions: 1024
```

**验证：**
```bash
# 测试 RAG 变量（如果配置了）
curl -X POST http://localhost:3000/v1/chat/completions \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{
      "role": "user",
      "content": "{{rag:什么是 ABP 协议}}"
    }]
  }'

# 如果不配置 RAG，变量不解析（预期行为）
```

#### 阶段 4：Skills 体系精简（Medium Risk）

**时间：** 6-8 小时
**风险：** ⭐⭐ 中
**并行度：** 可与阶段 3 同时执行

**保留清单（10个文件）：**
```
skills/
├── Skills* (5个: ExecutionManager, ToToolMapper, Index, Loader, ABPSkillsAdapter)
├── CodeGenerator.ts
├── SecurityValidator.ts
├── SandboxEnvironment.ts
├── SkillsCache.ts
├── CodeCache.ts
└── executors/ (3个: Base, Direct, Internal)
```

**删除清单（20+个文件）：**
```bash
# 监控和指标
rm skills/ProductionMonitorService.ts
rm skills/SkillsMetricsCollector.ts
rm skills/PerformanceOptimizer.ts
rm skills/MemoryMonitor.ts

# 预加载
rm skills/PreloadManager.ts
rm skills/PreloadStrategy.ts
rm skills/ResourceLoader.ts

# 分布式执行器
rm skills/executors/SkillsDistributedExecutor.ts
rm skills/executors/SkillsServiceExecutor.ts  # 保留，如果有外部服务调用
rm skills/executors/SkillsStaticExecutor.ts
rm skills/executors/SkillsPreprocessorExecutor.ts

# 等等...（约 20 个文件）
```

**验证：**
```bash
# 测试 Skills 执行
# 确保内置 Skills 正常执行
# 确保代码生成和安全验证正常
```

#### 阶段 5：ABP 协议瘦身（Optional, Low Risk）

**时间：** 3-4 小时
**风险：** ⭐ 低
**可选：** 取决于是否保留了 Memory

**任务：**
- 在 ProtocolEngine 中注释掉 RAGProvider 和 DiaryProvider 注册

```bash
# 修改：src/core/ProtocolEngine.ts

# 第 224-231 行：DiaryProvider 注册
# 第 243-256 行：RAGProvider 注册
# -> 注释或删除
```

**如果没有配置 Memory 服务：**
- 这些 Provider 会报错（服务未初始化）
- 需要移除

**如果配置了 Memory 服务：**
- 可以保留，但建议移除以简化

#### 阶段 6：管理后台移除（Optional, High Impact）

**时间：** 2-3 小时（仅删除文件）
**风险：** ⭐ 低（运行时无依赖）**
**触发影响：** ⚠️ 失去可视化配置能力

**任务：**
```bash
# 删除整个目录
rm -rf admin/

# 修改 package.json
"scripts": {
  # 删除与 admin 相关的脚本
  - "admin:dev": "cd admin && npm run dev"
  - "admin:build": "cd admin && npm run build"
}
```

**影响：**
- ❌ 失去 Web 管理界面
- ❌ 无法通过 UI 配置：人格、节点、偏好等
- ✅ API 端点仍然可用（如果保留 controller）
- ✅ 配置文件（YAML/JSON）仍然可用

**替代方案：**
- 配置：直接编辑 YAML/JSON 文件
- 管理：通过 API 直接调用（curl / Postman）
- 未来：可开发轻量级 CLI 管理工具

## 风险评估

### 高风险项

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| **功能回退** | 低 | 高 | 1. Git 分支开发（feature/slim）<br>2. 分阶段部署，每阶段验证<br>3. 保留完整备份（main 分支）|
| **性能下降** | 低 | 中 | 1. 充分测试关键路径（/v1/chat）<br>2. 监控 CPU/内存/延迟<br>3. 必要时回滚或优化 |
| **兼容性问题** | 中 | 高 | 1. 保持 OpenAI 兼容 API 不变<br>2. 测试流式响应和错误处理<br>3. 测试 Skills 执行 |
| **测试覆盖不足** | 中 | 中 | 1. 为核心模块编写单元测试<br>2. 集成测试关键流程<br>3. 使用模拟数据 |
| **文档滞后** | 低 | 低 | 1. 更新 README.md<br>2. 更新 API 文档<br>3. 编写迁移指南 |

### 阶段风险矩阵

```
阶段 1（无害移除）:   风险 ⭐     收益 ⭐⭐⭐   推荐 ✅
阶段 2（WebSocket）:   风险 ⭐     收益 ⭐⭐    推荐 ✅
阶段 3（Memory）:     风险 ⭐⭐   收益 ⭐⭐⭐   推荐 ⚠️ 评估
阶段 4（Skills）:     风险 ⭐⭐   收益 ⭐⭐⭐   推荐 ⚠️ 评估
阶段 5（ABP）:        风险 ⭐     收益 ⭐     可选
阶段 6（Admin）:      风险 ⭐     影响 ⚠️⚠️   可选
     （如果移除了后台，配置能力丧失）
```

## 验证清单

### 预实施检查

- [ ] 创建 feature/slim 分支
- [ ] 完成当前迭代的所有测试
- [ ] 备份 production 配置
- [ ] 更新 README.md（临时记录变更）

### 阶段验证

**阶段 1-2（无害 + WebSocket）：**
- [ ] 服务正常启动，无报错
- [ ] ABP 协议解析正常（{{time}} 变量工作）
- [ ] /v1/chat/completions 端点正常
- [ ] WebSocket Chat 通道可连接
- [ ] 基础 Skills 执行正常

**阶段 3-4（Memory + Skills）：**
- [ ] SemanticMemoryService 正常初始化
- [ ] RAG 检索功能正常（如果配置）
- [ ] 编译缓存（SkillsCache）正常工作
- [ ] 沙箱执行（SandboxEnvironment）安全运行
- [ ] 安全验证（SecurityValidator）拦截危险代码

**阶段 5-6（ABP + Admin）：**
- [ ] ABP 变量解析器正确注册（无重复）
- [ ] 未使用的变量不解析（{{rag:xxx}}）
- [ ] API 端点可用性（curl 测试）
- [ ] 文档更新完成

### 性能基准

```bash
# 基准测试脚本（实施前后对比）

# 1. 启动时间
time npm start
# 目标：从 8-12s 降至 3-5s

# 2. 内存占用
ps aux | grep node
# 目标：从 600-800MB 降至 250-350MB

# 3. API 响应时间
ab -n 100 -c 10 http://localhost:3000/v1/chat/completions
# 目标：保持或提升（移除复杂逻辑）

# 4. 代码行数统计
find src/ -name "*.ts" | xargs wc -l
# 目标：从 15,000 降至 7,500
```

## 回滚计划

### 阶段 1-2 回滚

```bash
# 如果在阶段 1-2 发现问题：

# 方案 A：Git 回滚（推荐）
git checkout main  # 或 develop
git branch -D feature/slim

# 方案 B：快速恢复（如果已部署）
# 重新添加 setter 调用（server.ts）
chatService.setPersonalityEngine(personalityEngine);
chatService.setEmotionEngine(emotionEngine);
```

### 阶段 3-6 回滚

```bash
# 如果在阶段 3-6 发现问题：

# 1. 恢复被删除的文件（从 Git 历史）
git checkout main -- src/core/PersonalityEngine.ts
git checkout main -- src/services/PreferenceService.ts
# ... 其他文件

# 2. 恢复配置（config/*.yml）
git checkout main -- config/

# 3. 重新安装依赖（如果需要）
npm install

# 4. 测试
npm test
```

## 总结

本设计通过分阶段、低风险的方式实现系统精简：

1. **架构先进性**：采用可选注入模式，模块解耦良好
2. **渐进式实施**：6个阶段，每个阶段可独立验证和回滚
3. **收益显著**：代码 -50%，性能 +60%，维护成本 -70%
4. **风险可控**：高影响模块（Personality/Emotion）已解耦，移除无风险

**推荐实施路径：**
- **必做**：阶段 1（无害移除）→ 阶段 2（WebSocket 精简）
- **评估**：阶段 3（Memory 简化）→ 阶段 4（Skills 精简）
- **可选**：阶段 5（ABP 瘦身）→ 阶段 6（Admin 移除）

**适用场景：**
- ✅ API 对话服务（推荐，收益最大）
- ✅ 企业知识库（保留 RAG 核心）
- ⚠️ 家庭 AI 中枢（谨慎，失去人格/情感/后台）
- ❌ 分布式节点系统（不推荐，核心能力丧失）
