## 1. Proposal Validation
- [x] 1.1 Review existing specs/changes，确认无冲突
- [x] 1.2 运行 `openspec validate add-unified-conversation-router --strict`

## 2. Backend Routing
- [x] 2.1 定义 `apexMeta` / Conversation 请求类型
- [x] 2.2 实现 `ConversationContextStore`
- [x] 2.3 引入 `ConversationRouter` 并改造 `ChatController`

## 3. Persona & Node Binding
- [x] 3.1 扩展 `NodeService` / `ConfigService` 数据模型
- [x] 3.2 更新节点 API & Admin 管理页人格绑定
- [x] 3.3 确保 router/personality engine 基于绑定校验 personaId

## 4. 群聊与 @ 调度
- [x] 4.1 支持会话成员列表和 @ 解析
- [x] 4.2 对被 @ AI 强制派发消息，其它 AI 接收广播
- [x] 4.3 处理 AI 自主回复机制（默认静默，预留 Hook）

## 5. 工具权限与审批
- [x] 5.1 实现 `ToolAuthorization`，覆盖 Hub/Companion/Worker 权限矩阵
- [x] 5.2 完成 Worker 指派链路与权限校验
- [x] 5.3 加入 Hub 工具审批流程（消息/事件驱动）

## 6. 记忆与画像
- [x] 6.1 ConversationContext 与 MemoryService 对接 persona 命名空间
  - [x] `ChatController` 解析 `user/user_id`，`ChatService.resolvePersonaMemoryInfo()` 将 userId/memoryUserId/knowledgeBase 写入 `ConversationContextStore.personaState`
- [x] 6.2 验证不同人格的记忆隔离与用户画像
  - [x] 新增 `tests/services/ChatService.persona-memory.test.ts`，覆盖命名空间复用与 persona 级 RAG 调用
  - [x] `docs/testing/INTEGRATION_SCENARIOS.md` 场景十一说明多 persona 记忆验证步骤

## 7. 事件与测试
- [x] 7.1 扩展事件推送/WS（群聊消息、审批状态等）
  - [x] ConversationRouter 触发 `conversation:user_message` / `conversation:assistant_message`，Server 透传到 Admin WS
- [x] 7.2 更新/新增单元、集成、E2E 测试
  - [x] 新增 `tests/core/ConversationRouter.events.test.ts`，验证事件推送
  - [x] `tests/api/ChatController.persona-routing.test.ts` 保持通过
- [x] 7.3 更新 docs/testing & Admin 使用说明
  - [x] `docs/testing/INTEGRATION_SCENARIOS.md` 新增场景十描述事件/审批监听


