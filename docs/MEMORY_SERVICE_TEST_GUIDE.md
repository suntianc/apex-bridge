# MemoryService 运行时验证指南

## 验证目标

1. ✅ 验证 MemoryService 初始化成功
2. ✅ 验证记忆保存功能（save）
3. ✅ 验证记忆检索功能（recall）
4. ✅ 验证性能（接口调用开销 < 10ms）
5. ✅ 验证向后兼容性（RAG服务正常工作）

## 前置条件

1. 确保 RAG 服务配置正确（`.env` 文件）
2. 确保 RAG 服务已初始化（检查启动日志）

## 验证步骤

### 步骤1: 启动服务器

```bash
npm run dev
```

**验证点**：查看启动日志，确认以下信息：

```
✅ MemoryService initialized (RAG mode)
[ChatService] MemoryService attached
```

### 步骤2: 验证 MemoryService 初始化

**验证方法**：检查服务器启动日志

**预期输出**：
```
✅ RAGMemoryService initialized { defaultKnowledgeBase: 'default' }
✅ MemoryService initialized (RAG mode)
[ChatService] MemoryService attached
```

### 步骤3: 测试记忆保存功能

**方法1: 通过API测试**（如果ChatService已集成保存逻辑）

**方法2: 直接测试MemoryService**（需要编写测试脚本）

创建测试脚本 `tests/runtime/memory-service-test.ts`：

```typescript
import { RAGMemoryService } from '../../src/services/RAGMemoryService';
import { Memory } from '../../src/types/memory';

// 需要获取VCPEngine的ragService实例
// 此脚本需要在实际服务器环境中运行
```

### 步骤4: 测试记忆检索功能

**验证方法**：使用 `recall()` 方法检索记忆

### 步骤5: 性能测试

**目标**：验证接口调用开销 < 10ms

**测试方法**：
1. 记录调用前时间戳
2. 调用 save() 或 recall()
3. 记录调用后时间戳
4. 计算差值（排除RAG服务本身耗时）

### 步骤6: 向后兼容性验证

**验证点**：
1. 插件系统仍能访问 `VCPEngine.ragService`
2. 现有RAG功能正常工作
3. RAG服务的 `addDocument` 和 `search` 方法正常

## API 测试示例（如果ChatService集成了记忆功能）

### 保存记忆（如果API支持）

```bash
curl -X POST http://localhost:8088/api/memory/save \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "content": "用户喜欢喝咖啡",
    "userId": "user123",
    "metadata": {
      "source": "chat",
      "knowledgeBase": "default"
    }
  }'
```

### 检索记忆（如果API支持）

```bash
curl -X POST http://localhost:8088/api/memory/recall \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "query": "用户喜欢什么",
    "context": {
      "userId": "user123",
      "limit": 5
    }
  }'
```

## 验证清单

- [ ] 服务器启动成功，MemoryService初始化日志出现
- [ ] MemoryService实例创建成功（RAG模式）
- [ ] save()方法能够保存记忆（如已集成到API）
- [ ] recall()方法能够检索记忆（如已集成到API）
- [ ] 接口调用开销 < 10ms（性能测试）
- [ ] VCPEngine.ragService仍可访问（插件系统兼容）
- [ ] 现有RAG功能正常工作（向后兼容）

## 注意事项

1. **MVP阶段**：ChatService中暂未直接调用MemoryService保存/检索记忆，需要后续集成
2. **当前验证重点**：验证MemoryService初始化成功，接口可用，性能符合要求
3. **后续集成**：在M2.1记忆增强功能中，ChatService将使用MemoryService保存对话记忆

## 预期结果

✅ **成功标准**：
- MemoryService初始化成功
- 接口调用性能 < 10ms
- 向后兼容性验证通过
- 所有单元测试通过（已完成）

⚠️ **注意事项**：
- 实际的记忆保存/检索功能需要在ChatService中集成后验证
- 当前阶段主要验证架构和接口正确性

