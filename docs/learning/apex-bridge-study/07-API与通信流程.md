# 07 - API 与通信流程

Apex Bridge 提供一套 OpenAI 兼容的 HTTP API 与双向 WebSocket 通道，用于聊天、插件回调、节点协作和实时通知。本章详解接口行为、消息格式与常见调用序列。

## 7.1 HTTP API 概览
- `POST /v1/chat/completions`：主聊天接口，兼容 OpenAI Chat Completion 协议。参数支持 `messages`、`stream`、`tools`、`tool_choice` 等。默认返回 JSON，自带 request-id。
- `POST /v1/interrupt`：终止长时间运行的请求。ProtocolEngine 会通过 AbortSignal 通知正在执行的插件或模型停止。
- `POST /plugin-callback/:plugin/:taskId`：异步插件回调入口。回调体包含 `status`、`result`、`error` 等信息；成功写入后 AsyncResultCleanupService 会通知等待者。
- `GET /v1/models`：返回当前可用模型列表（结合 LLMClient 配置）。
- `GET /health`：健康检查，返回服务状态、版本、依赖检查结果。
- 其它控制接口：`/v1/config/*` 用于热更新配置、`/v1/nodes/*` 查看节点状态（需鉴权）。

### 请求示例
```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
        "messages": [
          {"role": "user", "content": "今天日程是什么？"}
        ],
        "stream": false
      }'
```

## 7.2 WebSocket 通道
**位置**：`src/api/websocket/`

**WebSocket路径**：
- **日志通道**：
  - 推荐：`/ABPlog/VCP_Key=<key>` 或 `/log/VCP_Key=<key>`
  - 兼容：`/VCPlog/VCP_Key=<key>` (已弃用)
- **分布式服务器通道**：
  - 推荐：`/abp-distributed-server/VCP_Key=<key>` 或 `/distributed-server/VCP_Key=<key>`
  - 兼容：`/vcp-distributed-server/VCP_Key=<key>` (已弃用)

- **客户端通道**：用于把流式回复、主动提醒、节点状态变更推送给前端。消息类型包括 `chat.chunk`、`chat.completed`、`notification`, `alert` 等。
- **节点通道**：`DistributedServerChannel`、`NodeAwareDistributedServerChannel` 维护 Hub 与 Worker/Companion 的连接。消息类型：
  - `node_register`：节点上线注册，携带能力、人格、版本信息。
  - `heartbeat`：心跳包，包含状态、资源占用、任务统计。
  - `task_assign`：Hub 下发任务，指定目标节点、任务载荷、超时。
  - `task_result`：节点完成任务后返回的结果。
  - `llm_request` / `llm_response`：节点向 Hub 请求代理调用 LLM。
  - `log`：节点发送日志片段，便于集中收集。

WebSocketManager 会为每个连接分配 ID，并在断线后执行重连、状态回收、任务迁移。

## 7.3 节点任务流闭环
1. **注册**：节点连接 Hub，发送 `node_register`。Hub 校验身份、更新 NodeService。
2. **派发任务**：Hub 根据请求或主动任务，发送 `task_assign`。载荷包含动作类型、参数、超时时间、回调方式。
3. **执行**：节点本地执行插件或特定操作；如需 LLM 支持，可发送 `llm_request`，Hub 代理调用。
4. **返回结果**：节点通过 `task_result` 或 HTTP 回调返回成功/失败信息；Hub 更新状态并继续对话。
5. **记录**：NodeService 更新任务统计，TriggerHub 可触发相关事件（如主动总结或提醒）。

若任务超时或节点掉线，Hub 会标记任务异常，可通知用户重试或转派其他节点。

## 7.4 插件回调协议
- **异步任务启动**：Hybrid 插件返回 `{ taskId, status: 'pending' }`。
- **结果回写**：回调请求示例：
```json
{
  "status": "success",
  "output": {
    "summary": "已完成文件整理",
    "details": [{ "path": "D:/docs" }]
  }
}
```
- **失败处理**：`status: "failed"` 并附带 `error` 字段。Hub 会根据 manifest 中的策略决定是否重试或通知用户。
- **安全**：可为回调接口设置签名或 Token 校验，防止伪造回调。

## 7.5 REST + WebSocket 协同
许多场景需要双通道配合：
- 前端发起聊天（HTTP）→ Hub 流式返回回复（WebSocket）。
- 主动提醒由 Scheduler 触发（内部）→ 通过 WebSocket 推送消息。
- 插件执行过程中的进度更新可通过 `notification` 推送给用户，完成后再通过 HTTP 回写任务结果。

## 7.6 常见问题与排查
- **请求阻塞**：检查 LLMProvider 连通性与超时设置；确认是否有插件卡住。
- **WebSocket 不断线重连**：确认代理或防火墙设置；检查心跳是否按约定发送。
- **回调失效**：校验回调 URL、鉴权信息；查看 `async_results/` 是否存在对应 taskId。
- **节点重复注册**：确保 `nodeId` 唯一；若强制更新，NodeService 会覆盖旧记录并标记旧连接下线。

## 7.7 设计建议
- 为所有对外接口添加 request-id，方便追踪完整调用链。
- 在管理后台提供接口浏览与测试功能，便于非开发人员理解接口行为。
- 对外暴露接口时加入速率限制与鉴权，尤其是 `/chat/completions` 与 `/plugin-callback`。
- 当存在多 Hub 或多家庭部署需求时，可在请求中携带 `familyId`、`tenantId` 等字段以实现隔离。

上述通信机制保障了 Apex Bridge 在家庭场景中的实时性与可靠性，让 Hub 能够同时服务用户前端与分布式节点。

