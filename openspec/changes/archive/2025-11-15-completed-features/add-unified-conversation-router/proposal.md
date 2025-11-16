## Why
- 现有 `/v1/chat/completions` 仅能代表 Hub 自身人格，无法一站式路由到 Companion / Worker 节点，也缺乏群聊与 @ 机制。
- 项目已经完成节点管理与人格模板管理，需要统一入口来承接“AI 联系人 / 群组 / 工具审批 / 记忆隔离”的新体验。

## What Changes
- 扩展 `/v1/chat/completions` 请求结构，引入 `apexMeta` 会话元信息（会话 ID、成员、@ 列表、等待策略等）。
- 新增 ConversationRouter、ConversationContextStore、ToolAuthorization 等核心模块，统一调度 Hub / Companion / Worker。
- 扩展节点与人格绑定：Hub 节点可绑定多个人格，其它节点限制单人格，并在路由时校验。
- 实现群聊 @ 逻辑、AI 自主加入策略、工具调用审批流程，以及记忆/画像的 persona 命名空间。
- 更新管理后台与 API，支持人格绑定管理与新路由所需的元数据。

## Impact
- Affected specs: conversation-management（新增统一会话调度能力）。
- Affected code:
  - `src/api/controllers/ChatController.ts`、`src/services/ChatService.ts`
  - 新增 `src/core/ConversationRouter`、`ConversationContextStore`、`ToolAuthorization`
  - `src/services/NodeService.ts`、`ConfigService.ts`（节点人格绑定字段）
  - Admin Panel 节点管理视图、相关 API


