# ABP 协议瘦身规范

## 变更类型
`MODIFIED`

## 变更范围
- 模块：`core/ProtocolEngine.ts`
- 影响：移除 DiaryProvider 和 RAGProvider 变量解析器
- 配置：`config/*.yml`（移除 RAG 配置段）

## 目标
简化 ProtocolEngine，移除依赖外部服务（Memory/RAG）的变量解析器，减少启动依赖和配置复杂度。

## REMOVED Requirements

### 移除能力 1：DiaryProvider 变量解析

#### 场景：{{diary:xxx}} 变量不再支持

**Given** 系统精简后未配置 Memory 服务
**When** ProtocolEngine 初始化
**Then** DiaryProvider 不应被注册到 variableEngine

**Given** 对话中包含 `{{diary:2025-01-01}}` 变量
**When** ABP 协议解析器处理
**Then** 变量应保持原样（不解析），或根据 errorRecovery 配置进行回退

**影响：** 任何依赖日记功能的 Skills 需要显式初始化 Memory 服务

### 移除能力 2：RAGProvider 变量解析

#### 场景：{{rag:xxx}} 变量不再支持

**Given** 系统精简后未配置 RAG 服务
**When** ProtocolEngine 初始化
**Then** RAGProvider 不应被注册到 variableEngine

**Given** 对话中包含 `{{rag:search:query:mode}}` 变量
**When** ABP 协议解析器处理
**Then** 变量应保持原样（不解析），或根据 errorRecovery 配置进行回退

**影响：** RAG 搜索必须通过 ChatService 集成的 MemoryService 进行

## MODIFIED Requirements

### 修改能力 1：ProtocolEngine 初始化

#### 场景：简化变量解析器注册

**Given** ProtocolEngine 初始化核心组件
**When** 调用 `initializeCore()`
**Then** 只注册以下变量解析器：
- Layer 1: TimeProvider（系统时间）
- Layer 2: EnvironmentProvider（环境变量）、PlaceholderProvider（占位符）
- Layer 3: AgentProvider（Agent 配置）、ToolDescriptionProvider（Skills 工具描述）、AsyncResultProvider（异步结果）

**And** 不应注册：
- DiaryProvider（依赖 Memory）
- RAGProvider（依赖 RAG 服务）

### 修改能力 2：ChatService 变量解析

#### 场景：依赖 Skills 而非变量解析

**Given** ChatService 构建了包含变量的系统提示
**When** 调用 ProtocolEngine 解析变量
**Then** 仅解析不依赖外部服务的变量（time、env、agent 等）

**Given** 需要 RAG 上下文
**When** ChatService 处理对话
**Then** 应直接调用 SemanticMemoryService.searchSimilar()，而非依赖 {{rag:}} 变量

## 技术方案

### 文件变更

```
src/core/
└── ProtocolEngine.ts
    - 删除 DiaryProvider 注册（第 224-231 行）
    - 删除 RAGProvider 注册（第 243-256 行）

config/
└── default.yml
    - 删除 rag: 配置段
```

### 实现变更

```typescript
// src/core/ProtocolEngine.ts

public initializeCore(): void {
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

  // ❌ 移除：DiaryProvider（依赖 Memory）
  // ❌ 移除：RAGProvider（依赖 RAG 服务）

  // ✅ 保留：ToolDescriptionProvider（依赖 Skills）
  this.variableEngine.registerProvider(toolDescProvider);

  // ✅ 保留：AsyncResultProvider（无外部依赖）
  this.variableEngine.registerProvider(asyncResultProvider);
}
```

### 配置变更

**移除前：**
```yaml
abp:
  dualProtocolEnabled: false
  variable:
    cacheEnabled: true
    cacheTTL: 60000

rag:
  enabled: true
  workDir: ./vector_store
  vectorizer:
    baseURL: http://localhost:11434
    model: mxbai-embed-large
    dimensions: 1024
```

**移除后：**
```yaml
abp:
  dualProtocolEnabled: false
  variable:
    cacheEnabled: true
    cacheTTL: 60000
  # 不再有复杂的 provider 配置
```

## 兼容性要求

### 场景：ABP 协议解析不受影响

**Given** 移除了 DiaryProvider 和 RAGProvider
**When** 解析包含 {{time}}、{{env:VAR}} 等变量的内容
**Then** 这些变量应正常解析

**Given** 对话包含 {{diary:xxx}} 或 {{rag:xxx}} 变量
**When** ABP 协议解析器处理
**Then** 根据 errorRecovery 配置：
- 如果 errorRecoveryEnabled: true，回退到纯文本
- 如果 errorRecoveryEnabled: false，保持变量原样

## 测试策略

### 单元测试

1. **ProtocolEngine 初始化测试**
   - 验证只注册了 6 个变量解析器（而不是 8 个）
   - 验证 DiaryProvider 和 RAGProvider 未注册

2. **变量解析测试**
   - 测试 {{time}} 正常解析
   - 测试 {{env:VAR}} 正常解析
   - 测试 {{diary:xxx}} 不解析（保持原样）
   - 测试 {{rag:xxx}} 不解析（保持原样）

### 集成测试

1. **ChatService 集成测试**
   - 测试对话流程不含 Memory 服务
   - 验证系统提示正确构建（不含 RAG 上下文）
   - 验证 LLM 调用正常

## 性能影响

### 正面影响

1. **启动速度提升**：无需初始化 Memory/RAG 服务，启动时间减少 ~2-3 秒
2. **内存占用减少**：不加载 hnswlib 向量存储，内存减少 ~150MB
3. **配置简化**：移除复杂的 RAG 配置段

### 潜在负面影响

1. **功能丧失**：失去 {{diary}} 和 {{rag}} 变量解析能力
   - 缓解：通过 ChatService 直接集成 MemoryService 实现相同功能

## 相关任务

- [ ] 修改 ProtocolEngine.initializeCore()，移除 DiaryProvider 注册
- [ ] 修改 ProtocolEngine.initializeCore()，移除 RAGProvider 注册
- [ ] 更新配置文件，删除 rag: 配置段
- [ ] 编写单元测试，验证变量解析器数量
- [ ] 编写集成测试，验证 ChatService 不依赖变量解析
- [ ] 更新文档，说明移除的变量解析器
- [ ] 更新迁移指南，提供替代方案
