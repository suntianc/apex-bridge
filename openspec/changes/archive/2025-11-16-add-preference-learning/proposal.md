## Why

用户个性偏好直接影响聊天质量、工具选择与记忆写入策略。当前系统仅有零散的配置与少量启发式，不具备：
- 明确的“偏好”数据模型（可合并、可溯源、可解释）
- 持久化与在线更新策略（对话中学习、多会话聚合）
- 在聊天管线与 Skills 工具路由中的一致注入与使用

## Goals
1. 建立“偏好学习（Preference Learning）”的一阶能力：结构化模型、读写接口、在线更新与合并策略。
2. 将用户/会话偏好在聊天管线中注入（影响系统提示、工具披露与参数默认值）。
3. 提供最小可用的 API 与服务层，支持读取、写入、合并、来源追踪。
4. 与 Memory/Skills 保持解耦但具备稳定集成点。

## Non-Goals
- 不做复杂的强化学习/排序/多臂赌博探索。
- 不引入重型特征库或特定供应商绑定。
- 不修改已归档的 Skills-only 与 ABP-only 架构决策。

## Scope
- Preference 模型（用户级、会话级、系统级默认）及合并优先级。
- PreferenceService（读写/合并/来源追踪/TTL）。
- ChatPipeline 注入点：在构建系统提示与工具描述前合并偏好，影响三段披露与工具参数默认值。
- API 控制器端点（最小集合）：GET/PUT 用户偏好、GET 合并视图。

## Acceptance Criteria
- 在对话中通过一次偏好更新，下一轮对话能反映相应的提示或工具默认参数变化。
- 提供单元/集成测试覆盖：模型合并、API 读写、聊天管线偏好注入。
- 文档化新增模型与端点，并在 MIGRATION_GUIDE 中标注为可选特性。

## Risks
- 与记忆系统的边界：偏好更像配置信念，避免与语义记忆混用。
- 合并优先级导致的意外覆盖：需清晰的 precedence 规则与来源记录。

## Metrics
- 偏好命中率（被注入提示或参数的会话占比）
- 偏好更新后生效延迟（轮次计）
## Why

当前系统已实现记忆系统接口（IMemoryService）和情感标注功能，但缺乏从对话中自动学习用户偏好的能力。用户可能多次提到"喜欢科幻电影"、"不爱吃辣"等偏好信息，但这些信息没有被系统性地提取和存储，也无法在后续对话中被有效利用。M2.3旨在实现偏好学习功能，让AI能够从对话中识别、存储和应用用户偏好，从而提供更个性化的服务。

## What Changes

- 在`RAGMemoryService`中实现`learnPreference()`方法
  - 偏好存储（使用轻量级JSON文件存储，或扩展RAG存储）
  - 偏好去重和更新逻辑（相同类型的偏好，更新置信度）
- 实现偏好提取逻辑
  - 从对话消息中识别偏好信息（可选项：使用LLM辅助提取，或关键词匹配）
  - 支持手动添加偏好（通过API）
- 扩展记忆检索，在检索时优先考虑相关偏好
  - 在`recall()`方法中，如果查询与已存储的偏好相关，优先返回相关记忆
- 实现偏好管理REST API
  - `GET /api/admin/preferences` - 获取用户偏好列表
  - `POST /api/admin/preferences` - 手动添加偏好
  - `PUT /api/admin/preferences/:id` - 更新偏好
  - `DELETE /api/admin/preferences/:id` - 删除偏好
- 可选：管理端UI（偏好查看和编辑界面）
- 集成到ChatService（可选，在对话处理时自动提取偏好）

**BREAKING**: 无，完全向后兼容

## Impact

- Affected specs: 扩展`memory`能力，增加偏好学习功能
- Affected code:
  - `src/services/RAGMemoryService.ts` (修改，实现learnPreference方法)
  - `src/services/ChatService.ts` (可选，集成偏好提取)
  - `src/api/controllers/PreferenceController.ts` (新增)
  - `src/server.ts` (修改，添加路由)
  - `admin/src/pages/Preferences.tsx` (可选，新增)
  - `admin/src/api/preferenceApi.ts` (可选，新增)
  - `config/preferences/` (新增，偏好存储目录)
- Dependencies:
  - IMemoryService (已完成) ✅
  - RAGMemoryService (已完成基础实现) ✅
  - LLMClient (可选，用于偏好提取) ✅

