# 端到端集成场景：情绪关怀 + 待办安排 + 总结汇报

> 目标：模拟真实用户早晨向陪伴助理求助，系统在 Companion 节点完成对话和工具委派，Worker 节点负责执行“安排日程”和“发送提醒”，AdminPanel 记录全过程。执行完成后，用户可手动按照步骤验证每个环节。

---

## 场景概览

| 步骤 | 参与组件 | 操作内容 | 预期结果 |
|------|-----------|----------|----------|
| 1 | Hub | 启动核心服务、AdminPanel | 监听 8088，AdminPanel 可访问 |
| 2 | Worker 节点 | 运行 Worker 并提供 `calendar_task`、`notify_user` 工具 | Worker 在线，支持待办/提醒功能 |
| 3 | Companion 节点 | 运行 Companion 并支持 `companion_conversation` | Companion 在线，准备对话 |
| 4 | 用户消息输入 | 通过 WebSocket/REST 触发主动场景 | Hub 接受任务，派发给 Companion |
| 5 | Companion 回复 | 结合用户情绪给出建议，并提出委派工具请求 | 回复流式输出，生成委派计划 |
| 6 | Hub 调度 Worker | 根据 Companion returned delegations 下发任务 | Worker 执行待办/提醒工具 |
| 7 | Worker 结果回收 | Worker 上报结果，Hub 广播 `task_completed` | AdminPanel 可见事件，Hub 记录日志 |
| 8 | Companion 总结 | Companion 接收 Worker 结果，生成汇总回复 | 用户得到安排总结，流程闭环 |

---

## 环境准备

1. **依赖安装**
   ```bash
   cd apex-bridge
   npm install

   cd packages/node-agent
   npm install
   ```

2. **配置检查**
   - `config/admin-config.json`：确认 `server.port`、`llm.quota`、`auth.vcpKey` 正确。
   - `packages/node-agent/config.example.json`：用于 Worker 节点。
   - `packages/node-agent/config.companion.json`：用于 Companion 节点，根据环境修改 `hub.url` 与 `vcpKey`。

3. **工具要求**
   - WebSocket 测试工具（`wscat` 或 Postman WS）。
   - curl 或 Postman 用于 HTTP API。

---

## 步骤 1：启动 Hub 与 AdminPanel

```bash
cd apex-bridge
npm run build
node dist/server.js
```

预期日志：
- `🧠 VCP IntelliCore (智脑) initializing...`
- `✅ Routes configured`
- `✅ Admin panel static files served from /admin`

如有前端，访问 `http://localhost:8088/admin`，确认页面可加载。

---

## 步骤 2：启动 Worker 节点（提供工具能力）

1. **准备配置**：在 `packages/node-agent/config.worker.todo.json` 创建如下内容（如已存在可跳过）：
   ```json
   {
     "hub": {
       "url": "ws://localhost:8088/abp-distributed-server/VCP_Key=your-key",
       # 或兼容路径: "ws://localhost:8088/vcp-distributed-server/VCP_Key=your-key" (已弃用)
       "vcpKey": "sk-example"
     },
     "node": {
       "name": "Worker Todo Assistant",
       "type": "worker",
       "capabilities": ["worker"],
       "tools": ["calendar_task", "notify_user", "echo", "wait"]
     },
     "heartbeat": { "intervalMs": 15000 },
     "tasks": { "maxConcurrent": 2, "defaultTimeoutMs": 60000 },
     "llm": { "streamEnabled": false, "localFallback": false },
     "telemetry": { "enabled": true, "port": 8775 },
     "logging": { "level": "info", "format": "pretty" },
     "plugins": {
       "toolDirectory": "plugins/worker"
     }
   }
   ```

   > `calendar_task`、`notify_user` 由 `plugins/worker/calendar-task.js`、`plugins/worker/notify-user.js` 自动注册，启动前请运行 `npm run build` 以确保可加载。

2. **启动 Worker**：
   ```bash
   cd packages/node-agent
   npx node-agent start --config config.worker.todo.json
   ```

3. **确认输出**：`Node registration succeeded`，心跳日志正常。

---

## 步骤 3：启动 Companion 节点

1. 更新 `config.companion.json` 确保连接信息可用。
2. 启动：
   ```bash
   cd packages/node-agent
   npx node-agent start --config config.companion.json
   ```
3. 日志确认注册成功、心跳正常。

---

## 步骤 4：触发主动场景（用户求助）

通过 curl/HTTP API 来模拟用户早晨的主动场景：

```bash
curl -X POST -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{
           "sceneId": "morning_emotion_checkin",
           "userId": "user-10001",
           "payload": {
             "emotion": "anxious",
             "summary": "昨晚没睡好，今天有两个项目需要提交"
           }
         }' \
     http://localhost:8088/api/admin/proactivity/trigger
```

预期 Hub 日志：
- `Scene passed evaluation: morning_emotion_checkin`
- 向 Companion 节点派发任务（`task_assigned` 事件）。

---

## 步骤 5：Companion 节点处理对话并提出委派

1. Companion 节点会自动收到 Hub 派发的对话任务；若需手动复现，可使用 Admin API 向 Companion 节点派发任务：
   ```bash
   curl -X POST http://localhost:8088/api/admin/nodes/companion-node-001/tasks \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{
           "taskId": "task-20251109-001",
           "toolName": "companion_conversation",
           "capability": "companion",
           "toolArgs": {
             "conversationId": "user-10001-session-20251109-1",
             "userId": "user-10001",
             "sceneId": "daily_checkin",
             "messages": [
               { "role": "system", "content": "你是一位中文陪伴助理，请用简短、温暖的语气回答。" },
               { "role": "assistant", "content": "早上好，小明！昨天睡得好吗？今天打算安排些什么？" },
               { "role": "user", "content": "昨晚睡得不太好，今天还有两个项目的报告要交，有点焦虑。" }
             ],
             "llm": {
               "model": "deepseek-chat",
               "stream": true,
               "temperature": 0.7,
               "maxTokens": 512
             },
             "metadata": {
               "fallbackReply": "我这边线路有点忙，不过请先深呼吸几次，我们稍后继续聊。",
               "timezone": "Asia/Shanghai",
               "preferences": { "tone": "warm", "proactiveCare": true },
               "delegations": [
                 {
                   "toolName": "calendar_task",
                   "capability": "worker",
                   "args": {
                     "title": "提交项目报告",
                     "deadline": "2025-11-09T16:00:00+08:00",
                     "notes": "为两个项目分别预留 2 小时处理时间"
                   }
                 },
                 {
                   "toolName": "notify_user",
                   "capability": "worker",
                   "args": {
                     "channel": "in-app",
                     "message": "记得下午 4 点前提交项目报告，有需要随时告诉我。"
                   }
                 }
               ]
             }
           },
           "timeout": 180000,
           "waitForResult": true
         }'
   ```

2. Companion 输出：
   - 流式回复，安抚用户情绪，说明将安排具体待办；
   - 在任务结果中附带 `delegations`，请求 Hub 调用工具。

---

## 步骤 6：Hub 调度 Worker 执行工具任务

1. Hub 根据 `delegations` 自动选择 Worker 节点并派发任务；无需人工干预即可看到 Worker 接收 `calendar_task`、`notify_user`。

2. Hub 根据 `delegations` 选择 Worker 节点（若尚未自动实现，可手动下发）：
   ```bash
   curl -X POST http://localhost:8088/api/admin/nodes/worker-todo-node/tasks \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{
           "taskId": "task-20251109-001-cal",
           "toolName": "calendar_task",
           "capability": "worker",
           "toolArgs": {
             "userId": "user-10001",
             "title": "提交项目报告",
             "deadline": "2025-11-09T16:00:00+08:00",
             "notes": "为两个项目分别预留 2 小时处理时间"
           },
           "timeout": 60000,
           "waitForResult": true
         }'
   ```
   同样方式向 Worker 发送 `notify_user` 任务。

3. Worker 节点执行后在 CLI 输出：
   - `Recording calendar task` / `Recording user notification`
   - 任务完成日志 `Task finished`
   同时会在 `packages/node-agent/runtime-data/` 下生成 `calendar_tasks.jsonl`、`notifications.jsonl`。

---

## 步骤 7：Worker 上报结果 & AdminPanel 验证

1. Worker 节点完成后返回 `task_result`，Hub 日志出现 `task_completed`；AdminPanel 如在线可看到相应事件。

2. 检查 AdminPanel 页面或事件流：
   - Worker 状态回到 `online`
   - 事件列表包含 `task_assigned`、`task_completed`、`llm_proxy_stream_chunk`

3. NodeManager 自动处理后，Companion 将收到携带 Worker 结果的任务派发（`task_assigned` 事件），用于给用户汇总反馈。

---

## 步骤 8：Companion 输出总结并结束对话

1. Companion 节点接收 Worker 结果后（Hub 自动派发总结任务），生成总结回复，例如：
   > “我已经帮你安排了今天的任务：下午 4 点前提交项目报告，并设置了提醒。如果需要我继续关注进度或安排休息，请告诉我。”

2. 用户可在聊天界面或调试工具中看到最终回复。

---

## 验证与记录

- **日志**：
  - Hub：在 `logs/intellicore.log` 中搜 `node_event`、`task_assign`、`task_completed` 等；
  - 节点：CLI 输出或自定义日志。
- **接口检查**：
  - 节点列表：`curl http://localhost:8088/api/admin/nodes`
  - 健康检查：`curl http://localhost:8775/healthz`（Worker）、`curl http://localhost:8766/healthz`（Companion）
- **总结**：将每步的输入/输出、日志截屏记录，便于复盘。

---

## 注意事项

- 工具实现可根据业务需求自行扩展（写入数据库、调用外部 API 等）。
- 若 LLM 配额不足，可在 `config/admin-config.json` 调整 `llm.quota` 或在 Companion 元数据中提供 fallback 文案。
- 全流程结束后，建议清理日志、恢复配置，确保环境可重复使用。

执行完以上步骤，您就能获得“用户求助 → Companion 安抚并计划 → Worker 执行 → Companion 汇总”的完整验证数据，后续可据此继续扩展或编写自动化脚本。

---

## 附加验证：Worker 直接对话回复（可选）

> 适用于验证 Hub 在 `mentions` 指定 Worker 时，由 Worker 节点直接生成回复的链路（无需 Companion 委派）。

1. **保持 Worker 节点在线**，并在配置中确保 `llm.providers` 指向可用模型（如 `deepseek`）。  
2. **通过 REST 接口触发对话**：
   ```bash
   curl -X POST http://localhost:8088/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
           "model": "deepseek-chat",
           "messages": [
             {"role": "user", "content": "Worker，现在可以直接回复我了吗？"}
           ],
           "apexMeta": {
             "conversationId": "conv-worker-direct-1",
             "sessionType": "group",
             "mentions": ["worker:<node-id>:<persona-id>"]
           }
         }'
   ```
3. **预期现象**：
   - Hub 日志出现 `Dispatching node conversation` 且 `nodeType: worker`。
   - Worker 日志打印 `Worker conversation completed`，响应中包含 `reply`、`usage`、`partialOutputs`。
   - HTTP 返回体 `model` 字段默认为 `worker-proxy`，并附带 `node_result`。

4. **后续扩展**：可在同一会话中混合使用 Worker 与 Companion `mentions`，对比回复风格和人格注入效果。
