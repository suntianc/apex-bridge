## Why

当前系统中RAG服务直接集成在VCPEngine中，缺乏统一的记忆服务接口。为了支持后续的apex-memory集成和记忆系统增强功能（M2.1），需要建立统一的IMemoryService接口，实现可插拔的记忆系统架构。

## What Changes

- 定义`IMemoryService`统一接口（`src/types/memory.ts`）
- 创建`RAGMemoryService`实现类，包装现有的RAG服务
- 实现基础方法：`save()`、`recall()`
- 在ChatService中集成IMemoryService，替换直接调用RAG
- 支持配置切换（`MEMORY_SYSTEM=rag`，为后续扩展预留）
- 保持向后兼容，现有RAG功能正常工作

**BREAKING**: 无，完全向后兼容

## Impact

- Affected specs: 新增`memory`能力（capability）
- Affected code:
  - `src/types/memory.ts` (新增)
  - `src/services/RAGMemoryService.ts` (新增)
  - `src/services/ChatService.ts` (修改，使用IMemoryService)
  - `src/server.ts` (修改，初始化MemoryService)
  - `src/core/VCPEngine.ts` (可选，保留ragService用于插件系统)
- Dependencies:
  - vcp-intellicore-rag (已存在) ✅
  - RAG服务已存在于VCPEngine中 ✅

