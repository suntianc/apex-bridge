## Context
- `/v1/chat/completions` 目前直接调用 `ChatService`，只覆盖 Hub 自身能力。
- NodeManager / NodeAgent 已具备注册、任务派发、Quota、工具执行能力。
- 管理端已提供人格模板 CRUD，但节点仅有静态信息，缺少人格绑定。
- 目标是实现微信式“AI 联系人/群聊/@/协作”体验，同时复用现有节点生态。

## Goals
- 统一入口：前端始终通过 `/v1/chat/completions` 与任意 AI 交互。
- 会话调度：支持单聊、群聊、@ 提及、AI 自主加入。
- 工具权限：按照 persona 所属节点类型控制 Hub 工具、节点工具、Worker 指派与审批。
- 记忆隔离：ConversationContext 统一管理历史与 persona 维度记忆。
- 节点绑定：Hub 节点可绑定多人格，Companion/Worker 仅绑定单人格。

## Non-Goals
- 不引入新的外部存储（先以内存/现有配置实现，后续再持久化）。
- 不重写节点运行时代码，仅调整调用和权限。
- 不在本阶段实现完整前端 UI（只提供必要接口和字段）。

## Decisions
- **ConversationRouter**：在 `ChatController` 中引入路由层，解析 `apexMeta` 并调用 Hub/节点。
- **ConversationContextStore**：维护 `conversationId`、成员、历史、pending tasks、persona 记忆域。
- **ToolAuthorization**：依据 persona + nodeType 判断工具/指派权限，Hub 工具审批通过会话消息交互完成。
- **消息格式**：在 `apexMeta` 中声明 `sessionType`、成员列表、@ mentions、`waitForResult`，保持与 OpenAI 原消息兼容。
- **人格绑定**：扩展 Node 配置与管理端 API，路由前校验 persona 是否在节点绑定列表。
- **群聊策略**：被 @ 的 AI 强制响应，其他 AI 接收广播后可按策略选择是否发言（默认静默，可后续配置）。

## Alternatives Considered
- **单独新接口**：引入 `/v1/conversations/...`。否决：前端需要维护两套协议，与“统一入口”目标冲突。
- **前端直接调用节点**：破坏中心化调度与权限控制，不利于记忆统一管理。
- **只做单聊**：无法覆盖需求中的群聊/@/AI 协作场景。

## Risks / Trade-offs
- **状态管理复杂** → 通过 ConversationContextStore 抽象并逐步持久化；可在后续阶段接入 Redis。
- **审批流程阻塞** → 先以同步确认消息实现，支持超时/撤销；后续可扩展后台审批界面。
- **AI 自主发言控制** → 初期默认静默，避免噪音；提供 Hook 以便后续定制。
- **兼容性** → 保留旧请求（无 `apexMeta`）的默认行为，自动路由到 Hub 默认人格。

## Migration Plan
1. 扩展数据模型：节点人格绑定、`apexMeta` 类型、ConversationContext。
2. 引入 ConversationRouter（仅处理单聊 → Hub）。
3. 增量支持节点路由与 persona 选择。
4. 实现群聊/@ 与 ToolAuthorization。
5. 接入审批、事件推送、AI 自主策略。
6. 更新管理端、文档、测试。

## Open Questions
- ConversationContext 是否需要持久化到磁盘或 Redis？（短期可选）
- 群聊中 AI 自主策略是否需要配置化？（后续需求待定）
- 审批消息的 UX 细节与前端交互由谁负责？（需与前端团队协作）


