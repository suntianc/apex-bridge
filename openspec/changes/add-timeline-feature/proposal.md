## Why

当前系统已实现记忆系统接口（IMemoryService），能够保存和检索记忆，但缺乏按时间线组织记忆的能力。用户无法查看最近一段时间内的对话历史、情感变化、偏好学习等事件的连贯时间线。M2.4旨在实现时间线功能，将分散的记忆按时间顺序组织，生成叙述性摘要，让用户和AI能够更好地理解历史交互的脉络和变化趋势。

## What Changes

- 在`RAGMemoryService`中实现`buildTimeline()`方法
  - 从RAG记忆系统中检索指定时间范围内的记忆
  - 按时间排序记忆（从旧到新）
  - 生成叙述性摘要（可选，使用LLM生成或简单拼接）
  - 支持时间范围筛选（最近7天、30天、全部）
- 实现时间线事件构建
  - 将记忆转换为TimelineEvent格式
  - 支持不同类型的事件（chat、emotion、preference等）
  - 添加事件元数据和标签
- 实现时间线管理REST API
  - `GET /api/admin/timeline` - 获取时间线（支持时间范围参数）
  - `GET /api/admin/timeline/search` - 搜索时间线事件（可选）
- 可选：时间线摘要生成（使用LLM生成叙述性摘要）

**BREAKING**: 无，完全向后兼容

## Impact

- Affected specs: 扩展`memory`能力，增加时间线功能
- Affected code:
  - `src/services/RAGMemoryService.ts` (修改，实现buildTimeline方法)
  - `src/api/controllers/TimelineController.ts` (新增)
  - `src/server.ts` (修改，添加路由)
  - `src/types/memory.ts` (TimelineEvent接口已存在)
- Dependencies:
  - IMemoryService (已完成) ✅
  - RAGMemoryService (已完成基础实现) ✅
  - LLMClient (可选，用于生成摘要) ✅

