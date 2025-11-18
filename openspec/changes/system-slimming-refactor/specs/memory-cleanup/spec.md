# Memory/RAG 简化规范

## 变更类型
`MODIFIED`

## 变更范围
- 目录：`src/services/memory/`
- 模块：双轨记忆 → 单轨（SemanticMemory 仅）
- 影响：移除 EpisodicMemory、Bridge、冲突解决

## 目标
简化记忆系统，从双轨架构（情景 + 语义）简化为单轨架构（仅语义记忆/向量检索），减少复杂度和维护成本。

## REMOVED Requirements

### 移除能力 1：EpisodicMemoryService（情景记忆）

**模块：** `services/memory/EpisodicMemoryService.ts`

**Given** 用户对话历史需要存储
**When** 调用 `episodicMemoryService.addEpisode()`
**Then** 功能不再可用

**影响：** 失去对话历史的时间序列存储
**缓解：**
- 使用日志系统记录对话历史
- 在应用层维护会话状态（如 Redis）
- 如果需要，可重新实现简化版 EpisodicMemory

**Given** 需要查询历史对话
**When** 调用 `episodicMemoryService.queryEpisodes()`
**Then** 功能不再可用

**API 移除：**
- `addEpisode(episode: EpisodicRecord): Promise<void>`
- `queryEpisodes(filters: EpisodicQuery): Promise<EpisodicRecord[]>`
- `getRecentEpisodes(userId: string, limit: number): Promise<EpisodicRecord[]>`
- `deleteEpisode(id: string): Promise<void>`
- `analyzePatterns(userId: string): Promise<PatternAnalysis>`

### 移除能力 2：EpisodicSemanticBridge（桥接器）

**模块：** `services/memory/EpisodicSemanticBridge.ts`

**Given** 情景记忆和语义记忆需要关联
**When** 调用 `bridge.link(episode, semanticRecord)`
**Then** 功能不再可用

**影响：** 失去自动关联能力
**缓解：**
- 不关联（纯向量检索）
- 在应用层手动关联（如果需要）

**功能移除：**
- 时间关联（基于时间接近度）
- 语义相似关联（基于向量相似度）
- 用户上下文关联
- 主动同步

### 移除能力 3：Memory 冲突解决

**模块：** `services/memory/conflict/`（目录）

**Given** 同一内容多次存储
**When** 调用 `MemoryConflictDetector.detectConflicts()`
**Then** 功能不再可用

**模块列表：**
- `MemoryConflictDetector.ts` - 冲突检测
- `MemoryConflictArbiter.ts` - 冲突仲裁
- `MemoryMerger.ts` - 复杂合并
- `MergeRuleManager.ts` - 合并规则管理

**影响：** 失去智能冲突检测和解决能力
**缓解：**
- 依赖 SemanticMemoryService 去重（向量相似度阈值）
- 应用层简单策略（覆盖或忽略）
- 手动审查和清理

## MODIFIED Requirements

### 修改能力 1：SemanticMemoryService（保留核心）

**Given** 需要存储语义记忆
**When** 调用 `semanticMemoryService.saveSemantic(content, metadata)`
**Then** 功能正常工作（无依赖变更）

**Given** 需要检索相关知识
**When** 调用 `semanticMemoryService.searchSimilar(query, filters)`
**Then** 返回基于向量相似度的结果

**接口简化：**
```typescript
// 精简前（复杂接口）
export interface SemanticMemoryService {
  saveSemantic(record: SemanticMemoryRecord, options?: any): Promise<SemanticMemoryResult>;
  recallSemantic(id: string, options?: any): Promise<SemanticMemoryResult | null>;
  searchSimilar(query: SemanticMemoryQuery, options?: any): Promise<SemanticMemorySearchResponse>;
  deleteSemanticByContent(userId: string, personaId: string, content: string): Promise<void>;
}

// 精简后（简化接口）
export interface SemanticMemoryService {
  saveSemantic(content: string, metadata: { userId: string, source?: string }): Promise<void>;
  searchSimilar(query: string, filters?: { userId?: string, personaId?: string }): Promise<SemanticResult[]>;
}
```

### 修改能力 2：ChatService RAG 集成

**Given** ChatService 处理对话
**When** 需要 RAG 上下文增强
**Then** 直接调用 SemanticMemoryService（不通过变量解析）

**精简前：**
```typescript
// 使用 ABP 变量
const systemPrompt = `
Based on context:
{{rag:dairy:{{userQuery}}:basic}}

Answer the question.
`;
// 依赖 ProtocolEngine 解析变量
```

**精简后：**
```typescript
// 直接调用 MemoryService
const ragResults = await this.memoryService.searchSimilar(
  userQuery,
  { userId: params.userId }
);

const systemPrompt = `
Based on context:
${ragResults.map(r => r.content).join('\n\n')}

Answer the question.
`;
```

### 修改能力 3：存储实现（保持不变）

**Given** HNSWSemanticStore 实现
**When** 存储或检索向量
**Then** 功能保持不变

**保留存储：**
- HNSWLib：高性能向量存储（推荐）
- InMemorySemanticStore：内存存储（测试/开发）

**移除存储：**
- InMemoryEpisodicStore（情景内存）
- TimeSeriesEpisodicStore（时间序列）

## ADDED Requirements

### 新增能力：简化版 PromptBuilder（可选）

**Given** 需要构建带有 RAG 上下文的系统提示
**When** ChatService 处理对话
**Then** PromptBuilder 功能内联到 ChatService

**实现：**
```typescript
// 在 ChatService.createChatCompletion() 中

private async buildPromptWithRAG(
  messages: Message[],
  userId: string
): Promise<string> {
  const lastUserMessage = messages
    .filter(m => m.role === 'user')
    .slice(-1)[0];

  if (!lastUserMessage || !this.memoryService) {
    return 'You are a helpful assistant.';
  }

  // 检索相关知识
  const results = await this.memoryService.searchSimilar(
    lastUserMessage.content,
    { userId }
  );

  if (results.length === 0) {
    return 'You are a helpful assistant.';
  }

  // 构建带上下文的提示
  const context = results.map(r => r.content).join('\n\n');

  return `Based on the following context:

${context}

Please answer the user's question. If the context doesn't contain relevant information, say so.`;
}
```

## 技术方案

### 文件变更

```
src/services/memory/
├── SemanticMemoryService.ts          // ⭐ 保留（简化接口）
├── EpisodicMemoryService.ts          // 🗑️ 移除
├── EpisodicSemanticBridge.ts         // 🗑️ 移除
├── PromptBuilder.ts                  // 🗑️ 移除（内联到 ChatService）
├── stores/
│   ├── HNSWSemanticStore.ts          // ⭐ 保留
│   ├── InMemorySemanticStore.ts      // ⭐ 保留
│   ├── InMemoryEpisodicStore.ts      // 🗑️ 移除
│   └── TimeSeriesEpisodicStore.ts    // 🗑️ 移除
└── conflict/                         // 🗑️ 移除整个目录
    ├── MemoryConflictDetector.ts
    ├── MemoryConflictArbiter.ts
    ├── MemoryMerger.ts
    └── MergeRuleManager.ts

src/services/ChatService.ts
└── 修改：
    - 移除 setEpisodicMemoryService()
    - 修改 createChatCompletion() 以集成 RAG
    - 内联 PromptBuilder 逻辑
```

### SemanticMemoryService 简化实现

```typescript
// src/services/memory/SemanticMemoryService.ts

export interface SemanticMemoryService {
  /**
   * 保存语义记忆（简化版）
   */
  saveSemantic(
    content: string,
    metadata: { userId: string; source?: string }
  ): Promise<void>;

  /**
   * 相似度搜索（简化版）
   */
  searchSimilar(
    query: string,
    filters?: { userId?: string; personaId?: string }
  ): Promise<SemanticResult[]>;
}

export class DefaultSemanticMemoryService implements SemanticMemoryService {
  constructor(
    private store: HNSWSemanticStore | InMemorySemanticStore,
    private config: { vectorizer: VectorizerConfig }
  ) {}

  async saveSemantic(
    content: string,
    metadata: { userId: string; source?: string }
  ): Promise<void> {
    // 1. 向量化
    const embedding = await this.vectorize(content);

    // 2. 存储
    await this.store.save({
      id: randomUUID(),
      content,
      embedding,
      metadata: {
        ...metadata,
        timestamp: Date.now()
      }
    });
  }

  async searchSimilar(
    query: string,
    filters: { userId?: string; personaId?: string } = {}
  ): Promise<SemanticResult[]> {
    // 1. 向量化查询
    const queryEmbedding = await this.vectorize(query);

    // 2. HNSW 搜索
    const results = await this.store.search(queryEmbedding, {
      topK: this.config.defaultTopK || 5,
      filters
    });

    return results;
  }

  private async vectorize(text: string): Promise<number[]> {
    // 调用外部向量化 API（OpenAI / Ollama / 自定义）
    const response = await this.httpClient.post(
      this.config.vectorizer.apiUrl,
      {
        model: this.config.vectorizer.model,
        input: text
      },
      {
        headers: { Authorization: `Bearer ${this.config.vectorizer.apiKey}` }
      }
    );

    return response.data.embedding;
  }
}

// 简化结果接口
export interface SemanticResult {
  id: string;
  content: string;
  similarity: number;  // 0-1
  metadata: {
    userId: string;
    source?: string;
    timestamp: number;
  };
}
```

### ChatService 集成

```typescript
// src/services/ChatService.ts

export class ChatService {
  private semanticMemoryService?: SemanticMemoryService;

  /**
   * 设置 SemanticMemoryService（可选）
   */
  setSemanticMemoryService(service: SemanticMemoryService): void {
    this.semanticMemoryService = service;
  }

  async createChatCompletion(params: ChatCompletionParams): Promise<ChatResponse> {
    const { messages, userId, ...options } = params;

    // 构建系统提示（内联 PromptBuilder 逻辑）
    const systemPrompt = await this.buildSystemPrompt(messages, userId);

    // 调用 LLM
    const response = await this.llmManager.chat(
      [{ role: 'system', content: systemPrompt }, ...messages],
      options
    );

    return response;
  }

  /**
   * 构建带 RAG 的系统提示（内联 PromptBuilder）
   */
  private async buildSystemPrompt(
    messages: Message[],
    userId?: string
  ): Promise<string> {
    // 如果没有 Memory 服务或没有 userId，返回默认提示
    if (!this.semanticMemoryService || !userId) {
      return 'You are a helpful assistant.';
    }

    // 提取最后一条用户消息
    const lastUserMessage = messages
      .filter(m => m.role === 'user')
      .slice(-1)[0];

    if (!lastUserMessage) {
      return 'You are a helpful assistant.';
    }

    try {
      // RAG 检索
      const results = await this.semanticMemoryService.searchSimilar(
        lastUserMessage.content,
        { userId }
      );

      if (results.length === 0) {
        return 'You are a helpful assistant.';
      }

      // 构建带上下文的提示
      const context = results
        .map(r => r.content)
        .join('\n\n');

      return `Based on the following context:

${context}

Please answer the user's question. If the context doesn't contain relevant information, say so.`;

    } catch (error) {
      logger.warn('RAG retrieval failed:', error);
      return 'You are a helpful assistant.';
    }
  }
}
```

### 配置变更

**精简前：**
```yaml
rag:
  enabled: true
  workDir: ./vector_store
  vectorizer:
    baseURL: http://localhost:11434/api/embed
    model: mxbai-embed-large
    dimensions: 1024
    batchSize: 10
  reranker:
    enabled: false
  semanticMemory:
    defaultTopK: 5
    maxTopK: 20
    minSimilarity: 0.7

episodicMemory:
  enabled: true
  store: time-series
  retentionDays: 30

bridge:
  enabled: true
  linkStrategy: time-and-semantic
  enabled: true
```

**精简后：**
```yaml
memory:
  semantic:
    enabled: true
    storeName: hnswlib  # hnswlib | memory
    workDir: ./vector_store
    embeddingDimensions: 1024
    defaultTopK: 5
    maxTopK: 20

  # episodic 配置段移除
  # bridge 配置段移除
```

## 兼容性要求

### 场景：SemanticMemory 接口兼容性

**Given** 代码使用简化版接口
**When** 调用 saveSemantic() 和 searchSimilar()
**Then** 功能正常工作

### 场景：ChatService 不配置 Memory

**Given** 系统启动时不初始化 SemanticMemoryService
**When** ChatService.buildSystemPrompt() 调用
**Then** 返回默认提示，不抛出错误

## 测试策略

### 单元测试

1. **SemanticMemoryService 测试**
   - 测试 saveSemantic() 存储成功
   - 测试 searchSimilar() 检索结果
   - 测试向量相似度阈值

2. **ChatService 集成测试**
   - 测试无 Memory 时的默认提示
   - 测试有 Memory 时的 RAG 提示
   - 测试 RAG 检索失败的回退

### 集成测试

1. **RAG 完整流程**
   - 存储知识 → 构建提示 → 调用 LLM → 返回增强响应

2. **性能测试**
   - 向量检索延迟（HNSWLib 性能）
   - 检索 + LLM 调用总延迟

## 性能影响

### 正面影响

1. **启动速度**：移除 EpisodicMemory 和 Bridge 初始化，启动时间减少 ~1-2 秒
2. **内存占用**：不加载时间序列数据，内存减少 ~100MB
3. **代码复杂度**：移除 6 个文件（~2000 行代码）

### 潜在负面影响

1. **功能丧失**：失去对话历史管理
   - 缓解：使用应用层日志或 Redis 管理会话

2. **关联能力丧失**：失去情景-语义自动关联
   - 缓解：纯向量检索通常足够，语义相似度已隐含关联

3. **冲突解决丧失**：可能重复存储相似内容
   - 缓解：
     - 使用向量相似度阈值去重
     - 定期手动清理
     - 应用层存储前检查

## 数据迁移

### 情景：如果已有 EpisodicMemory 数据

**Given** 生产环境有 TimeSeriesEpisodicStore 数据
**When** 升级到精简版
**Then** 数据不再可访问

**迁移方案选项：**
1. **不迁移**：放弃历史数据（如果非关键）
2. **日志导出**：将数据导出到日志系统
3. **批量转换**：转换为 SemanticMemory 存储（失去时序信息）

**建议：** 如果业务依赖对话历史，应保留 EpisodicMemory 简化版而非完全移除

## 相关任务

- [ ] 创建简化版 SemanticMemoryService 接口
- [ ] 实现 SemanticMemoryService.saveSemantic()
- [ ] 实现 SemanticMemoryService.searchSimilar()
- [ ] 移除 EpisodicMemoryService.ts
- [ ] 移除 EpisodicSemanticBridge.ts
- [ ] 移除 PromptBuilder.ts
- [ ] 修改 ChatService，移除 setEpisodicMemoryService()
- [ ] 修改 ChatService，内联 PromptBuilder 逻辑到 buildSystemPrompt()
- [ ] 更新 ChatService.createChatCompletion() 集成 RAG
- [ ] 删除 InMemoryEpisodicStore.ts
- [ ] 删除 TimeSeriesEpisodicStore.ts
- [ ] 删除整个 conflict/ 目录
- [ ] 更新配置文件
- [ ] 编写 SemanticMemoryService 单元测试
- [ ] 编写 ChatService RAG 集成测试
- [ ] 性能基准测试（检索延迟）
- [ ] 文档更新（Memory 简化说明）
