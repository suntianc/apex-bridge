## 1. 类型定义
- [x] 1.1 创建`src/types/memory.ts`，定义IMemoryService接口
- [x] 1.2 定义Memory、Context等基础类型
- [x] 1.3 定义可选的扩展方法接口（recordEmotion、learnPreference、buildTimeline）

## 2. RAGMemoryService实现
- [x] 2.1 创建`RAGMemoryService`类（`src/services/RAGMemoryService.ts`）
- [x] 2.2 实现构造函数（接收RAG服务实例）
- [x] 2.3 实现`save()`方法（包装RAG的保存方法）
- [x] 2.4 实现`recall()`方法（包装RAG的检索方法）
- [x] 2.5 实现错误处理和日志

## 3. 集成到系统
- [x] 3.1 在`server.ts`中创建MemoryService实例（根据配置选择实现）
- [x] 3.2 将MemoryService注入到ChatService
- [x] 3.3 修改ChatService使用IMemoryService（替代直接调用RAG）
- [x] 3.4 保持VCPEngine中的ragService（供插件系统使用）

## 4. 配置支持
- [x] 4.1 添加`MEMORY_SYSTEM`环境变量支持（默认: `rag`）
- [x] 4.2 实现配置读取逻辑（为后续apex-memory集成预留）

## 5. 向后兼容验证
- [x] 5.1 验证现有RAG功能正常工作（编译通过，接口兼容）
- [x] 5.2 验证插件系统仍能访问ragService（VCPEngine.ragService保持不变）
- [x] 5.3 验证性能无损失（接口调用开销 < 10ms）
  - [x] `tests/integration/memory-service-integration.test.ts` 使用内存RAG确保 save/recall 接口耗时 ≤10ms，并在 `docs/MEMORY_SERVICE_VERIFICATION.md` 记录运行方法

## 6. 测试
- [x] 6.1 编写RAGMemoryService单元测试
- [x] 6.2 测试save()方法
- [x] 6.3 测试recall()方法
- [x] 6.4 测试错误处理
- [x] 6.5 集成测试（验证记忆保存和检索）
  - [x] 新增 `tests/integration/memory-service-integration.test.ts` + runtime脚本 `tests/runtime/memory-service-runtime-test.ts`，覆盖端到端保存/检索

