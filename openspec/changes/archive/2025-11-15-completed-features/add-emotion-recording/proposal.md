## Why

EmotionEngine已经实现了情感识别和记录接口（recordEmotion），但尚未与记忆系统集成。M2.1旨在扩展记忆系统，将用户情感标注存储到记忆中，以便后续检索和应用。这将让AI在回复时能够参考用户的历史情感模式，提供更个性化的服务。

## What Changes

- 在`RAGMemoryService`中实现`recordEmotion()`方法，将情感信息存储到RAG记忆元数据中
- 在`ChatService`对话结束时调用`recordEmotion()`记录用户情感
- 扩展记忆检索结果，在metadata中包含情感标签
- 确保情感记录不阻塞对话流程（容错设计）

**BREAKING**: 无，完全向后兼容

## Impact

- Affected specs: 修改`memory`能力，增加情感标注功能
- Affected code:
  - `src/services/RAGMemoryService.ts` (修改，实现recordEmotion方法)
  - `src/services/ChatService.ts` (修改，调用recordEmotion)
  - `src/types/memory.ts` (可能需要扩展Memory接口的metadata)
- Dependencies:
  - EmotionEngine (已完成) ✅
  - IMemoryService (已完成) ✅
  - RAGMemoryService (已完成基础实现) ✅

