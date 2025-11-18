# RAG能力保留说明

## 📋 重要说明

**移除ChatService中的MemoryService不会导致向量检索能力完全丧失。**

## ✅ 保留的能力

### 1. RAGService核心服务
- **位置**: `ProtocolEngine.ragService`
- **实现**: `abp-rag-sdk/src/RAGService.ts`
- **能力**: HNSW向量检索、文档存储、知识库管理
- **状态**: ✅ 完全保留，不受影响

### 2. RAGProvider变量
- **位置**: `src/core/variable/providers/RAGProvider.ts`
- **注册**: ProtocolEngine初始化时注册
- **使用方式**: `{{rag:query}}` 或 `{{rag:knowledgeBase:query}}`
- **状态**: ✅ 完全保留，正常工作

### 3. 向量检索核心功能
- **算法**: HNSW (Hierarchical Navigable Small World)
- **存储**: 本地文件系统（VectorStore目录）
- **能力**: 相似度搜索、文档管理、知识库隔离
- **状态**: ✅ 完全保留，不受影响

## ❌ 移除的能力

### 1. ChatService自动RAG检索
- **之前**: ChatService在对话时自动调用MemoryService进行RAG检索
- **现在**: 不再自动检索和注入RAG结果到系统提示
- **影响**: 对话不再自动包含RAG检索的上下文

### 2. MemoryService包装层
- **之前**: RAGMemoryService包装RAGService，提供IMemoryService接口
- **现在**: 不再在ChatService中使用MemoryService
- **影响**: 失去统一的记忆服务接口（但RAGService仍然可用）

## 🔄 使用方式变更

### 方式1: 通过变量使用RAG（推荐）

**之前（自动）**:
```typescript
// ChatService自动检索并注入
用户消息: "什么是ABP协议？"
// ChatService内部自动调用MemoryService.recall()
// 自动注入检索结果到系统提示
```

**现在（手动，通过变量）**:
```typescript
// 用户需要在消息中使用变量
用户消息: "{{rag:什么是ABP协议}}，请详细解释"
// RAGProvider自动解析变量，调用RAGService检索
// 变量被替换为检索结果
```

### 方式2: 在Skills中使用RAG

```typescript
// Skills可以通过context访问RAGService
export default async function execute(params: any, context: any) {
  const ragService = context.ragService; // 从ProtocolEngine获取
  const results = await ragService.search({
    knowledgeBase: 'docs',
    query: params.query,
    k: 5
  });
  return { results };
}
```

### 方式3: 直接调用RAGService

```typescript
// 在代码中直接使用
const ragService = protocolEngine.ragService;
const results = await ragService.search({
  knowledgeBase: 'default',
  query: 'ABP协议',
  k: 10
});
```

## 📊 能力对比表

| 能力 | 之前 | 现在 | 状态 |
|------|------|------|------|
| RAGService核心服务 | ✅ | ✅ | 保留 |
| HNSW向量检索 | ✅ | ✅ | 保留 |
| RAGProvider变量 | ✅ | ✅ | 保留 |
| 文档存储 | ✅ | ✅ | 保留 |
| 知识库管理 | ✅ | ✅ | 保留 |
| ChatService自动RAG | ✅ | ❌ | 移除 |
| MemoryService包装 | ✅ | ❌ | 移除 |
| 自动记忆注入 | ✅ | ❌ | 移除 |

## 🎯 迁移建议

### 如果之前依赖ChatService自动RAG

**方案A: 使用变量（推荐）**
```typescript
// 修改用户消息，添加RAG变量
const userMessage = `{{rag:${userQuery}}}，请回答：${userQuery}`;
```

**方案B: 在Skills中实现RAG**
```typescript
// 创建专门的RAG Skill
// 在Skill中调用RAGService，返回检索结果
```

**方案C: 前端预处理**
```typescript
// 前端先调用RAG API获取结果
// 然后将结果和用户消息一起发送
```

## ✅ 验证清单

- [ ] ProtocolEngine.ragService存在且可用
- [ ] RAGProvider已注册到VariableEngine
- [ ] `{{rag:query}}` 变量可以正常解析
- [ ] RAGService.search()方法正常工作
- [ ] 向量存储和检索功能正常
- [ ] ChatService不再自动使用MemoryService

## 📝 总结

**核心结论**: 向量检索能力完全保留，只是使用方式从"自动"变为"手动"。

- ✅ **保留**: RAGService、RAGProvider、向量检索核心功能
- ❌ **移除**: ChatService自动RAG检索和记忆注入
- 🔄 **变更**: 需要通过变量或Skills手动使用RAG

**优势**:
- 更灵活：可以选择性地使用RAG
- 更可控：明确知道何时使用RAG
- 更简洁：ChatService不再依赖复杂的MemoryService

