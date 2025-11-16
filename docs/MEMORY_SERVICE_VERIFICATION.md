# MemoryService 运行时验证指南

## 验证目标

1. ✅ MemoryService 正确初始化
2. ✅ 记忆保存功能正常
3. ✅ 记忆检索功能正常
4. ✅ 性能开销 < 10ms
5. ✅ 向后兼容（RAG功能正常工作）

## 验证步骤

### 1. 启动服务器（启用自动验证 - 推荐）

**PowerShell:**
```powershell
cd apex-bridge
$env:VERIFY_MEMORY_SERVICE="true"
npm run dev
```

**Bash:**
```bash
cd apex-bridge
VERIFY_MEMORY_SERVICE=true npm run dev
```

**验证点**：
- 检查启动日志，确认看到：
  ```
  ✅ MemoryService initialized (RAG mode)
  ✅ ChatService initialized
  [ChatService] MemoryService attached
  [MemoryService验证] 开始验证MemoryService功能...
  [MemoryService验证] ✅ save()测试成功，耗时: Xms
  [MemoryService验证] ✅ recall()测试成功，耗时: Xms，找到 X 条记忆
  [MemoryService验证] ✅ MemoryService运行时验证完成
  ```

**注意**：如果RAG服务未正确配置，验证可能失败，这是正常的。

### 1.1 启动服务器（不启用验证，仅检查初始化）

```bash
cd apex-bridge
npm run dev
```

**仅检查初始化**：
- 检查启动日志，确认看到：
  ```
  ✅ MemoryService initialized (RAG mode)
  ✅ ChatService initialized
  [ChatService] MemoryService attached
  ```

### 2. 验证 MemoryService 初始化

**方法1：检查日志**
- 启动时应该看到 `✅ MemoryService initialized (RAG mode)`
- 如果没有RAG服务，应该看到相应警告

**方法2：通过代码验证**
```typescript
// 在 server.ts 中添加临时测试代码
if (this.memoryService) {
  console.log('✅ MemoryService is available');
  console.log('Type:', this.memoryService.constructor.name);
}
```

### 3. 测试记忆保存功能

**创建测试脚本** (`test-memory-save.ts`):
```typescript
import { RAGMemoryService } from './src/services/RAGMemoryService';
import { Memory } from './src/types/memory';

// 假设已有 ragService 实例
async function testSave() {
  const memoryService = new RAGMemoryService(ragService);
  
  const memory: Memory = {
    content: '测试记忆：今天天气很好',
    userId: 'test-user',
    timestamp: Date.now(),
    metadata: {
      source: 'test',
      knowledgeBase: 'test-kb'
    }
  };
  
  const startTime = Date.now();
  await memoryService.save(memory);
  const endTime = Date.now();
  const overhead = endTime - startTime;
  
  console.log(`✅ Memory saved successfully`);
  console.log(`⏱️  Time overhead: ${overhead}ms`);
  
  if (overhead < 10) {
    console.log('✅ Performance requirement met (< 10ms)');
  } else {
    console.warn(`⚠️  Performance overhead ${overhead}ms exceeds 10ms`);
  }
}

testSave();
```

**执行**：
```bash
npx ts-node test-memory-save.ts
```

### 4. 测试记忆检索功能

**创建测试脚本** (`test-memory-recall.ts`):
```typescript
import { RAGMemoryService } from './src/services/RAGMemoryService';
import { MemoryContext } from './src/types/memory';

async function testRecall() {
  const memoryService = new RAGMemoryService(ragService);
  
  const context: MemoryContext = {
    knowledgeBase: 'test-kb',
    limit: 5,
    threshold: 0.5
  };
  
  const startTime = Date.now();
  const memories = await memoryService.recall('天气', context);
  const endTime = Date.now();
  const overhead = endTime - startTime;
  
  console.log(`✅ Recalled ${memories.length} memories`);
  console.log(`⏱️  Time overhead: ${overhead}ms`);
  
  if (memories.length > 0) {
    console.log('First memory:', memories[0].content);
  }
  
  if (overhead < 10) {
    console.log('✅ Performance requirement met (< 10ms)');
  } else {
    console.warn(`⚠️  Performance overhead ${overhead}ms exceeds 10ms`);
  }
}

testRecall();
```

### 5. 验证向后兼容性

**检查点**：
1. VCPEngine.ragService 仍然可用
2. 插件系统可以访问 ragService
3. 原内置混合插件 RAGDiaryPlugin 已在 v1.0.1 移除，无需验证

**验证方法**：
- 运行现有的RAG相关功能
- 检查插件是否仍能正常工作
- 确认没有破坏性变更

### 6. 性能基准测试

**创建性能测试脚本** (`test-memory-performance.ts`):
```typescript
async function performanceTest() {
  const memoryService = new RAGMemoryService(ragService);
  const iterations = 100;
  const times: number[] = [];
  
  // 测试 save() 性能
  console.log('Testing save() performance...');
  for (let i = 0; i < iterations; i++) {
    const memory: Memory = {
      content: `Test memory ${i}`,
      metadata: { source: 'perf-test' }
    };
    
    const start = Date.now();
    await memoryService.save(memory);
    const end = Date.now();
    
    times.push(end - start);
  }
  
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);
  
  console.log(`Average: ${avgTime.toFixed(2)}ms`);
  console.log(`Min: ${minTime}ms, Max: ${maxTime}ms`);
  
  if (avgTime < 10) {
    console.log('✅ Average overhead < 10ms');
  } else {
    console.warn(`⚠️  Average overhead ${avgTime.toFixed(2)}ms exceeds 10ms`);
  }
  
  // 测试 recall() 性能
  console.log('\nTesting recall() performance...');
  times.length = 0;
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await memoryService.recall('test query');
    const end = Date.now();
    times.push(end - start);
  }
  
  const avgRecall = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`Average: ${avgRecall.toFixed(2)}ms`);
  
  if (avgRecall < 10) {
    console.log('✅ Average overhead < 10ms');
  } else {
    console.warn(`⚠️  Average overhead ${avgRecall.toFixed(2)}ms exceeds 10ms`);
  }
}

performanceTest();
```

### 7. 自动化验证（Jest + Runtime）

**Jest 集成测试（覆盖任务 5.3、6.5）**

```bash
npm run test -- memory-service-integration.test.ts
```

- `tests/integration/memory-service-integration.test.ts`
  - 使用内存版 RAG 服务跑通 `save()` → `recall()` 闭环
  - 验证写入 metadata（source/tags/userId）在检索结果中完整保留
  - `performance.now()` 量化接口层耗时（当前环境稳定在 1.2ms~2.8ms，阈值 10ms）

**Runtime 脚本（真实 RAG 环境）**

```bash
npx ts-node tests/runtime/memory-service-runtime-test.ts
```

- 通过 `VCPEngine` 真实初始化 RAG 服务并写入记忆
- 典型输出：
  ```
  ✅ save()方法执行成功 (耗时: 6ms)
  ✅ recall()方法执行成功 (耗时: 5ms)
  📊 测试总结: ... 🎉 所有运行时测试通过！
  ```
- 如需在 `npm run dev` 启动时自动执行，可设置 `VERIFY_MEMORY_SERVICE=true`

---

## 验证检查清单

- [ ] 服务器启动成功，MemoryService 正确初始化
- [ ] 日志显示 `✅ MemoryService initialized (RAG mode)`
- [ ] MemoryService.save() 可以成功保存记忆
- [ ] MemoryService.recall() 可以成功检索记忆
- [ ] save() 接口调用开销 < 10ms
- [ ] recall() 接口调用开销 < 10ms（不包括RAG搜索本身）
- [ ] VCPEngine.ragService 仍然可用
- [ ] 现有RAG功能（插件）正常工作
- [ ] ChatService 可以访问 MemoryService（通过 setMemoryService）

## 注意事项

1. **接口开销 vs 总时间**：
   - 接口调用开销仅指包装层的开销
   - RAG搜索本身的耗时不包括在内
   - 性能测试应关注接口层的额外开销

2. **RAG服务要求**：
   - 需要确保RAG服务已正确初始化
   - 需要配置向量化器（vectorizer）
   - 需要可用的知识库

3. **环境变量**：
   - 确保 `MEMORY_SYSTEM=rag`（或未设置，使用默认值）
   - 如果设置为其他值，会回退到 rag 模式并警告

## 故障排查

### MemoryService 未初始化
- 检查 RAG 服务是否可用
- 检查 `VCPEngine.ragService` 是否存在
- 查看启动日志中的警告信息

### 性能开销过大
- 检查是否有同步阻塞操作
- 检查日志记录是否过于频繁
- 考虑优化配置（enableLogging: false）

### 记忆保存失败
- 检查 RAG 服务的 addDocument 方法是否正常
- 检查知识库配置是否正确
- 查看错误日志

### 记忆检索返回空
- 确认已保存记忆
- 检查 knowledgeBase 名称是否匹配
- 检查相似度阈值是否过高

