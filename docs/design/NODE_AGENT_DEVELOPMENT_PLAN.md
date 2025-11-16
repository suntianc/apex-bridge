# 节点侧开发设计方案（Worker / Companion）

> **版本**: v0.2  
> **更新时间**: 2025-11-11  
> **负责人**: Apex Bridge Team  
> **状态**: 核心运行时已实现，Hub 已支持 Companion/Worker 直接对话联调，待补全多节点并发与高级委派流程

---

## 1. 背景与目标

- Hub 端（NodeManager）已经完成注册、心跳、任务分发、LLM 代理、流式推送与配额控制等能力。
- 需要实现可运行的节点进程（Worker / Companion），完成协议落地并支撑真实集成测试。
- 节点必须具备稳定运行、易于扩展、可观测、可回退等特性。

### 1.1 设计目标
- 提供标准化 Node SDK（TypeScript/Node.js）用于快速开发 Worker/Companion 节点。
- 完整对接 `node_register` / `heartbeat` / `task_assign` / `task_result` / `llm_request` / `llm_response(_stream)` 协议。
- 支持限流与配额提示、流式 LLM 消息处理、任务队列、断线重连。
- 提供本地开发与集成测试脚手架。

### 1.2 非目标
- 不在本阶段实现每种垂直能力的业务逻辑（例如图像识别、音乐控制等）；仅提供框架与简单示例任务。
- 不实现 Companion 专有的人格引导与 UI，对 Companion 的差异仅限于配置与 LLM 代理策略。

---

## 2. 节点类型与角色

| 类型 | 描述 | 典型能力 | LLM 需求 |
|------|------|----------|----------|
| Worker | 运行工具任务（文件、日程、搜索等） | task_assign / task_result | 可选；默认透传到 Hub |
| Companion | 长连接对话和陪伴 | 每日问候、情感关怀等 | 必须使用 Hub LLM（可配置流式） |

节点类型通过 `config.nodeType` 控制，影响注册信息（`type` 字段）、默认能力列表、心跳频率、任务执行策略等。

---

## 3. 总体架构

```
┌───────────────────────────────────────────────────────────┐
│ Node Runtime                                              │
│                                                           │
│  ┌─────────────┐   ┌────────────────┐   ┌──────────────┐  │
│  │ Config/Env  │→→│ ConnectionManager│→→│ ProtocolLayer │  │
│  └─────────────┘   └────────┬───────┘   └──────┬───────┘  │
│                              │                 │          │
│                              │                 │          │
│         ┌────────────────────┴───────┐   ┌─────┴────────┐ │
│         │ Task Orchestrator         │   │ LLM Proxy     │ │
│         │ - 队列 & 调度             │   │ - stream消费  │ │
│         │ - 状态管理                │   │ - 限流回退    │ │
│         └────────────┬──────────────┘   └──────────────┘ │
│                      │                                    │
│             ┌────────┴────────┐                          │
│             │ Capability Packs │                          │
│             │ (Worker/Companion│                          │
│             │ 具体实现)        │                          │
│             └────────┬────────┘                          │
│                      │                                    │
│      ┌───────────────┴───────────────┐                    │
│      │ Telemetry & Diagnostics        │                    │
│      │ - 日志、指标、事件上报         │                    │
│      │ - 报警/自愈                    │                    │
│      └───────────────────────────────┘                    │
└───────────────────────────────────────────────────────────┘
```

---

## 4. 核心模块设计

### 4.1 配置与启动
- 支持 `.env` + `config.json`，可通过 CLI 参数覆盖。
- 关键配置：
  - `hubUrl`: Hub WebSocket 地址（含 VCP_Key）
  - `nodeId`/`nodeName`/`nodeType`
  - `capabilities`/`tools`（Worker）
  - `llm.streamEnabled`/`llm.retry`
  - `heartbeat.intervalMs`/`reconnect.retryPolicy`
  - `tasks.concurrentLimit`/`tasks.timeoutMs`
- 配置热更新：监听本地文件变更，必要时触发重新注册。

### 4.2 ConnectionManager
- 管理 WebSocket 连接及重连（使用指数退避 + 抖动）。
- 连接建立后自动发送 `node_register`。
- 维护 `serverId` → 用于后续消息。
- 支持断线检测：关闭时通知 Task Orchestrator 进行清理。
- 提供事件总线（`connection:open/close/error`）。

### 4.3 ProtocolLayer
- 封装协议解析与响应：
  - 注册成功/失败回调。
  - 收到 `heartbeat_ack` 时更新状态。
  - 统一抛出 `task_assign`、`llm_response`/`stream`、`llm_rate_limit` 等事件。
- 自带 JSON schema 校验，防止无效消息导致崩溃。
- 记录耗时、错误日志。

### 4.4 HeartbeatService
- 周期性发送 `heartbeat`，包含：
  - `status`: online/busy（依据任务队列情况）
  - `stats`: activeTasks / totalTasks / completed / failed / averageResponseTime 等
- 支持弱网环境下的容错：多次失败后进入 `offline`，并提示重新注册。

### 4.5 Task Orchestrator
- 职责：
  - 接收 `task_assign` → 放入 `TaskQueue`
  - 按 `maxConcurrentTasks` 并发执行
  - 超时处理：达到 `expiresAt` 前未完成，取消并上报失败
- `TaskQueue` 结构：
  ```ts
  interface PendingTask {
    id: string;
    toolName: string;
    capability?: string;
    priority: number;
    payload: any;
    deadline: number;
  }
  ```
- 执行流程：
  1. 选择兼容能力的处理器（Capability Pack）
  2. 封装上下文（日志、traceId、超时）
  3. 结果上报（成功/失败，包含耗时、错误信息）
- 失败重试策略：
  - 默认不重试；可配置 `retry.count` 与 `retry.backoff`
  - 必须避免重复执行可能造成副作用的任务（利用 `taskId` 幂等）

### 4.6 Capability Pack
- Worker：根据 `toolName` 查找处理函数，如 `file.copy`, `calendar.add`.
- Companion：处理与 NLU/对话相关任务，可挂接到 Hub 的情感/人格服务。
- 提供插件机制：`capabilities/<name>.ts` 导出 `registerCapability(router)`。
- 默认提供示例能力：
  - `echo`: 输出请求参数
  - `wait`: 延迟 N 秒，用于超时测试
  - `llm-tool`: 触发 LLM 请求并返回总结文本

### 4.7 LLM Proxy Module
- 统一封装 `llm_request`/`llm_response(_stream)` 交互。
- 功能：
  - 生成 `requestId`，发送消息并监听流式 chunk。
  - 处理限流错误（`quota_exceeded` / `rate_limit_exceeded`）。
  - 节点内部提供 Promise/AsyncIterator 接口给业务使用。
- 客户端 API：
  ```ts
  const iterator = llmClient.createStream({
    nodeId,
    messages,
    options
  });
  for await (const chunk of iterator) {
    // 处理流式文本
  }
  ```
- 支持本地降级模式（无 Hub LLM 时可调用本地模型/Mock）。

### 4.8 Telemetry & Diagnostics
- 日志：使用 `pino` 或 `winston`，区分 info/debug/error，带 traceId。
- 指标：
  - heartbeat 成功率、重连次数、任务执行耗时、失败率
  - LLM 请求数量/流式 chunk 速度
- 提供 `/healthz` HTTP 服务用于运行状态探测。
- 可选：写入 Prometheus exporter 或本地文件。

### 4.9 安全与配置保护
- VCP Key/Token 存储在环境变量或加密文件中，不写入日志。
- 节点应验证 Hub URL 域名白名单。
- 任务执行需 sandbox 或权限控制（未来扩展）。

---

## 5. 协议映射表

| Hub 消息 | 节点行为 | 备注 |
|----------|----------|------|
| `node_registered` | 更新 `connectionId`、配置 Hub 能力（LLM 可用性等） | 失败时重试注册 |
| `heartbeat_ack` | 刷新状态；失败时触发重连 | 带 `timestamp`、`status` |
| `task_assign` | 推入队列，进入执行；若能力缺失 → 立即上报失败 | 需要幂等处理 |
| `task_timeout` (事件) | 节点更新状态/日志 | Hub 主导 |
| `llm_response_stream` | 更新流式迭代器 | 需按顺序处理 |
| `llm_response` | resolve Promise；失败时抛出异常 | 包含配额错误 |

节点发送：

| 节点消息 | 用途 |
|----------|------|
| `node_register` | 注册节点信息，包含 `capabilities` / `tools` / `config` |
| `heartbeat` | 定期上报状态和统计 |
| `task_result` | 任务执行完毕后返回结果/错误 |
| `llm_request` | 请求 Hub 代理 LLM |
| `node_unregister` | 退出前通知 Hub（可选） |

---

## 6. 测试策略

### 6.1 单元测试
- ConnectionManager：重连、消息路由、心跳逻辑。
- Task Orchestrator：并发控制、超时与失败处理。
- Capability Packs：示例能力的输入/输出。
- LLM Proxy：流式回调、限流处理、降级策略。

### 6.2 集成测试
- 使用 Mock Hub（基于 WebSocket server）模拟 Hub 消息流，验证节点行为。
- 场景：
  1. 注册→心跳→任务→结果→注销完整流程。
  2. LLM 流式响应（包括限流 error）。
  3. Hub 主动断线→节点自动重连。
  4. 并发任务执行及配额触发。

### 6.3 端到端测试
- 与真实 Hub (NodeManager) 对接，记录日志、指标。
- 构建 docker-compose（Hub + 节点）或脚本启动两端。
- 验证 AdminPanel 收到 `node_event` 推送并可视化。

### 6.4 性能/稳定性
- 压力测试：每分钟任务量、LLM 并发流数达到设定上限。
- 长时间运行测试：连续运行 ≥24 小时，观察心跳/重连/内存。

---

## 7. 实施计划

1. **Bootstrap & CLI**
   - 创建 `packages/node-agent`（TypeScript + ts-node）。
   - 初始化配置加载、CLI 入口（`node-agent start --config ./config.json`）。

2. **协议层与连接管理**
   - 封装 WebSocket 客户端，完成注册/心跳/重连。
   - 单元测试覆盖注册失败、服务器断开。

3. **任务执行器**
   - 实现 TaskQueue/TaskRunner，加入示例能力。
   - 处理 `task_result_ack`。编写集成测试。

4. **LLM 流式代理**
   - 实现 `llm_request` 与 `llm_response_stream` 消费器。
   - 支持限流错误回退（排队/等待/失败提示）。

5. **监控与日志**
   - 接入结构化日志，输出基本指标。
   - 实现健康检查端点。

6. **示例节点**
   - Worker 示例（Echo/Wait/LLM 工具）。
   - Companion 示例（简单问候 + LLM 流式对话）。

7. **端到端集成测试**
   - 脚本启动 Hub + 节点，跑完整流程并生成报告。
   - 整理测试脚本（npm scripts / docs）。

---

## 8. 风险与应对

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 节点异常导致任务积压 | 影响 Hub 调度 | 心跳标记 offline，Hub 侧重试；节点自动重连 |
| LLM 流式乱序/丢失 | 影响对话体验 | 在节点侧对 chunk 加 sequence；发现缺失时立即终止请求 |
| 多节点配额竞争 | 一方抢占资源 | 节点侧遵循限流提示，可实现排队/延迟 |
| 能力插件抛异常 | 节点崩溃 | 每个能力在 TaskRunner 中隔离 try/catch，并返回错误 |
| 断线无法重新注册 | 节点不可用 | 提供 CLI `status`/`restart`，以及自动重连回退 |

---

## 9. 开放问题

1. 是否需要 Companion 节点保存对话上下文，本地缓存如何与 Hub 同步？
2. 是否提供 Python 版本节点 SDK（未来可能需要 AI 工程师使用）？
3. 节点是否需要独立持久化（任务日志、数据存储）？如需，优先考虑 SQLite 或 file-based。
4. 管理后台需要展示哪些节点指标？需对接哪种指标上报接口？

---

## 10. 后续行动

- [ ] 整理 change proposal（OpenSpec），明确影响范围及需求。
- [x] 实施阶段按照“连接→任务→LLM→示例→观测”的顺序推进。
- [ ] 与前端/运维沟通节点部署模式（Docker 镜像、命令行工具等）。
- [ ] 设计节点发布/升级流程（版本回滚机制）。

---

## 11. 当前进展（2025-11-11）

- **运行时实现**：ConnectionManager、ProtocolClient、TaskOrchestrator、LLMProxy、Telemetry、默认 Worker/Companion 能力均已落地并通过 `npm run build`。
- **对话链路**：
  - Hub `ChatService.processNodeConversation` 已支持 `companion` / `worker` 节点直接会话，自动注入人格提示并透传 LLM 选项。
  - Worker 节点新增 `worker_conversation` 能力，能够通过 Hub 代理 LLM 生成回复，返回 `partialOutputs`、`usage` 与 `delegations` 信息。
- **测试成果**：
  - 单元测试：`TaskOrchestrator` 覆盖优先级/超时/缺失能力，`LLMProxy` 覆盖流式响应、失败与取消场景。
  - 集成测试：`runtime.integration.test.ts` 验证注册→心跳→任务执行→流式 LLM 链路；`hub-worker.integration.test.ts` 新增 `worker_conversation` 场景验证节点直连对话。
- **待办聚焦**：
  - 补充 Companion 委派/回流流程（任务 3.3/4.2）与多节点并发回复策略。
  - 产出真实 Hub 联调脚本（任务 5.3）及节点运维文档（任务 6.x）。

> 本设计将随着节点开发推进滚动更新，务必在实现前再次 review 与确认。任何重大偏差须更新设计文档并同步至团队。

## 12. Companion 对话流设计（M3.2 下一阶段）

### 12.1 设计目标
- 让 Companion 节点在收到 Hub 指派的对话任务时，能够：
  - 使用 Hub LLM（流式）生成回复，并在过程中将文本片段回推给 Hub。
  - 根据语义决定是否委派 Worker 任务（例如工具调用），并在 Worker 完成后将结果合并回对话。
  - 通过 Policy Guard / Quota 反馈限流、错误信息，维持用户体验。
- 保持与现有 Hub 协议兼容：所有下行消息依旧通过 `task_assign` / `llm_response_stream`，上行消息遵循 `task_result` / `llm_request`。

### 12.2 消息路由流程
1. **启动对话任务**：Hub 触发 `task_assign`（toolName=`companion_conversation`）。
2. **Companion 接收任务**：`TaskOrchestrator` 调用 Companion 能力处理器，创建会话上下文（traceId、userId、sceneId）。
3. **流式回复**：
   - 调用 `LLMProxy.streamChat`，将用户上下文发送至 Hub。
   - 对收到的 `llm_response_stream` chunk：
     - 通过 Hub 回传 `task_result` 中的 `partialOutputs` 字段（新增）、或发布 `companion_stream` 事件（待确认 Hub 接口）。
     - 将分片记录在节点侧 `partialOutputs`，供最终回复带回，便于前端渐进展示。
     - 同步写入 Telemetry（最近输出时间、总 token）。
4. **工具委派**：
   - 根据 LLM 输出中的 `tool_call` 结构决定是否派发 Worker 任务。
   - 通过 `protocol.sendTaskResult` 发送状态 `deferred`，并触发 `node_delegate_task`（新事件，Hub 侧转换成 Worker `task_assign`）。
   - 等待 `task_result_ack`，记录任务 ID。
5. **Worker 结果回流**：
   - Hub 收到 Worker 成功后，将结果以 `task_assign`（toolName=`companion_tool_result`）或事件推送回 Companion。
   - Companion 能力将结果整理成补充上下文，重新调用 LLM 生成总结。
6. **结束对话**：
   - 发送最终 `task_result`（success=true, payload 包含 `finalResponse`、`delegations`、`latencyMetrics`）。
   - 更新 Telemetry：任务完成计数 +1，记录最后一次会话耗时。

### 12.3 关键模块职责调整
- **ProtocolClient**：
  - 增加 `companion_delegate`、`companion_tool_result` 等消息监听与转发。
  - 支持 `task_result` 新字段（partialOutputs/deferred）。
- **TaskOrchestrator**：
  - 在 Companion 模式下注入会话级状态管理（允许任务重入/多阶段完成）。
  - 支持 `deferred` 状态（任务暂挂），等待外部事件再继续执行。
- **Companion Capability Pack**：
  - 新增 `companion_conversation` handler：封装流程、调用 LLM、处理工具调用，并在节点侧维护 `partialOutputs`、限流降级提示。
  - 提供 Hook：`onStreamChunk`、`onWorkerResult`、`onError`。
- **TelemetryService**：
  - 扩展指标：`activeConversations`、`toolDelegations`、`llmStreamRate`、`quotaErrors`。
- **LLMProxy**：
  - 暴露 `streamChat` 高阶接口，支持自定义 chunk 回调与请求超时控制。

### 12.4 数据结构/事件草案
- `CompanionConversationContext`：
  ```ts
  interface CompanionConversationContext {
    conversationId: string;
    userId: string;
    sceneId?: string;
    startAt: number;
    streamedTokens: number;
    delegations: Array<{ taskId: string; toolName: string; status: 'pending' | 'completed' | 'failed'; result?: unknown }>;
  }
  ```
- `task_result` 追加字段：
  ```ts
  {
    type: 'task_result',
    data: {
      ...,
      partialOutputs?: Array<{ chunk: string; timestamp: number }>,
      status?: 'in_progress' | 'deferred' | 'completed'
    }
  }
  ```
- 新事件（Hub 侧协作，需与 NodeManager 对齐）：
  - `companion:delegate_task`（Companion → Hub）
  - `companion:tool_result`（Hub → Companion）
  - `companion:stream_chunk`（可复用现有 llm_response_stream，也可单独事件，待最终方案）

### 12.5 测试策略
- **单元测试**：
  - Companion handler 流程（含流式 chunk、错误、取消、降级）。
  - 委派流程模拟（mock Worker 结果回流）。
- **集成测试**：
  - 扩展 Mock Hub，覆盖多阶段任务：对话开始 → 工具委派 → Worker 结果回流 → 最终回复。
  - 验证限流/Quota 触发时的降级行为。
  - 新增 `packages/node-agent/tests/integration/hub-companion.integration.test.ts`，拉起真实 `NodeManager` + Companion 运行时，记录流式分片与限流降级。
  - 新增 `packages/node-agent/tests/integration/hub-worker.integration.test.ts`，实测 Worker 节点完成 Echo/Wait 任务以及超时处理。

### 12.6 实施步骤对齐 OpenSpec 任务
1. **任务 3.3**（Companion 节点对话任务）
   - 实现 `companion_conversation` 能力与上下文管理。
   - 更新 ProtocolClient/TaskOrchestrator，支持多阶段任务状态。
   - 编写针对性单测。
2. **任务 4.2**（Companion 流式输出）
   - 扩展 LLMProxy 与流式回传策略。
   - 将流式 chunk 通过 Hub 反馈，保障前端实时显示。
   - 引入限流告警与降级策略测试。
3. **任务 5.3**（真实联调）
   - 脚本化 Hub + Companion + Worker 联调场景。
   - 记录运行日志、生成报告，验证 AdminPanel 与 Telemetry 指标。

### 12.7 风险与缓解
- **多阶段状态处理复杂**：通过显式状态机（`in_progress`/`deferred`/`completed`）避免逻辑分散。
- **流式回传重复/乱序**：chunk 加 `sequence` 字段；Hub 收到后按序重组，缺失则中止。
- **委派任务失败**：Companion 捕获 Worker 错误并追加到最终回复，必要时触发备用回复。
- **Quota 限流**：提前订阅 `llm_proxy_rate_limited`，回传明确信息给 Hub/前端，允许 Companion 改用简短回复或节点内部 fallback。

