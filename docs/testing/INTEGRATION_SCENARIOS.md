# 集成测试场景总览

> 目标：在当前 Apex Bridge + Node Agent 架构基础上，按照场景驱动完成端到端联调，验证节点生命周期、任务调度、LLM 流式能力、AdminPanel 透传等核心路径。
>
> 执行前请确保 Hub 与节点端依赖已安装：`npm install`（根仓库）与 `npm install`（packages/node-agent）。
>
> **通用准备（必读）**
> 1. **构建产物**：在 `packages/node-agent` 执行 `npm run build`，保证插件可读取 `dist/` 目录。
> 2. **插件目录**：确认以下文件存在（如有自定义需同步更新配置）：
>    - `packages/node-agent/plugins/worker/calendar-task.js`
>    - `packages/node-agent/plugins/worker/notify-user.js`
>    - 可在 `plugins/` 目录新增其它工具插件，新增后需重新 `npm run build`。
> 3. **节点配置**：确保使用的节点配置（如 `config.worker.todo.json`、`config.companion.json`）包含：
>    ```json
>    {
>      "plugins": {
>        "toolDirectory": "plugins/worker"
>      }
>    }
>    ```
>    Companion 节点如暂未使用自定义插件，可保留默认值（`plugins.toolDirectory: "plugins"`）。
> 4. **runtime-data 清理**：测试前可清空 `packages/node-agent/runtime-data/`，以便快速对比本次任务生成的 JSONL 文件。
> 5. **工具准备**：
>    - WebSocket 客户端（wscat / Postman / 浏览器插件）
>    - REST 客户端（curl / Postman）
>    - （可选）AdminPanel 前端
> 6. **测试日志记录**：建议在仓库根目录建立 `manual-testing/logs/`，按场景记录执行时间、任务 ID、WebSocket payload、关键响应。

---

## 场景一：Companion 节点流式对话与限流降级

### 1. 前置条件
- Hub 已启动并监听 8088（如使用 `node dist/server.js`）。
- `packages/node-agent/config.companion.json` 已配置正确的 `hub.url` 和 `vcpKey`。
- 准备好一个 WebSocket 测试工具，例如 `wscat`、Postman WS 或浏览器插件。
- 若需在 AdminPanel 中观察事件，确保前端构建并可访问 `http://localhost:8088/admin`。

### 2. 操作步骤
1. **启动 Companion 节点**
   ```bash
   cd packages/node-agent
   npx node-agent start --config config.companion.json
   ```
   预期 CLI 输出：
   - `Node agent runtime initialising`
   - `Node registration succeeded`
   - 每 15 秒一次 `Heartbeat sent` / `heartbeat_ack`

2. **手工派发流式会话任务**
   - 使用 Admin API 获取实际的 `nodeId`：
     ```bash
     curl -H "Authorization: Bearer <token>" http://localhost:8088/api/admin/nodes
     ```
   - 通过 REST 接口向指定节点派发任务（`waitForResult` 可选，默认异步返回）。以下示例以 `companion-demo-node` 为例：
     - **快速问候示例**（用于验证连通性）：
       ```bash
       curl -X POST http://localhost:8088/api/admin/nodes/companion-demo-node/tasks \
         -H "Content-Type: application/json" \
         -H "Authorization: Bearer <token>" \
         -d '{
               "taskId": "manual-companion-hello",
               "toolName": "companion_conversation",
               "capability": "companion",
               "toolArgs": {
                 "conversationId": "conv-manual-1",
                 "messages": [
                   { "role": "user", "content": "请用中文打个招呼" }
                 ],
                 "llm": { "stream": true },
                 "metadata": {
                   "fallbackReply": "现在有点忙，我们稍后再聊。"
                 }
               },
               "timeout": 120000,
               "waitForResult": true
             }'
       ```
     - **完整情绪关怀示例**（与 E2E 场景保持一致，涵盖多轮上下文与委派建议）：
       ```bash
       curl -X POST http://localhost:8088/api/admin/nodes/companion-demo-node/tasks \
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
   - 若 `waitForResult` 为 `true`，接口会等待节点返回结果；否则会立即返回 `taskId`，后续结果可在日志或 AdminPanel 中查看。
   - Companion CLI 中会打印：
     - `Companion streaming chunk`（多次）
     - `Companion conversation completed`，包含 `streamChunks`、`latencyMs`、`usage`

3. **测试限流降级**
   - 随即再调用一次任务派发接口（更换 `taskId` 防止冲突）。
   - 因配额限制（默认每分钟 1 次），应收到：
     - WebSocket 返回 `task_result`，`success: true`，`degraded: true`，`reply` 为 fallback 文本；
     - Companion CLI 记录 `rate_limit_exceeded`；
     - Hub 日志/事件中出现 `llm_proxy_rate_limited`。

### 3. 预期结果
- 节点顺利注册、维持心跳。
- 第一次任务得到流式分片和最终完整回复。
- 第二次任务降级到 fallback 文案，未导致崩溃。
- AdminPanel 如接入，可看到 `node_event`（`task_assigned`、`llm_proxy_stream_chunk`、`task_completed`、`llm_proxy_rate_limited`）。

### 4. 验证点
- 节点是否正确处理 `onStreamChunk`，`partialOutputs` 返回完整分片；
- Hub 配额触发后是否发布事件；
- 降级文案与 `degraded: true` 标记是否符合需求。

---

## 场景三：Hub 人格切换 API（JSON + 流式）

### 1. 前置条件
- Hub 已在本地运行（`npm run dev` 或 `node dist/server.js`）。
- `config/personality/` 目录中的预装人格已存在（`default.json`、`温暖伙伴.json` 等）。
- REST 客户端（curl/Postman）可访问 `http://localhost:8088`；如需鉴权可设置 `Authorization: Bearer <api-key>`。

### 2. 操作步骤

#### 2.1 非流式（JSON）人格切换
```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
        "model": "gpt-4o-mini",
        "agent_id": "温暖伙伴",
        "messages": [
          {"role":"system","content":"你是一位温暖的中文伙伴"},
          {"role":"user","content":"简短地介绍一下你自己"}
        ]
      }'
```

预期结果：
- 返回 `200`，`choices[0].message.content` 体现“温暖伙伴”模板中的语气（会主动称呼“爸爸”等）。
- Hub 日志包含：
  - `PersonalityEngine` 加载指定人格
  - `ChatController` 成功完成非流式请求 (`✅ Completed non-stream chat request`)
- `conversationRouter.recordAssistantMessage` 会记录 personaId=`温暖伙伴`。

#### 2.2 流式（SSE）人格切换
```bash
curl -N -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
        "model": "gpt-4o-mini",
        "agent_id": "专业助手",
        "stream": true,
        "messages": [
          {"role":"system","content":"请用专业语气回答"},
          {"role":"user","content":"现在的重点项目有哪些？"}
        ]
      }'
```

预期结果：
- 控制台持续收到 `data: {"object":"chat.completion.chunk",...}`，末尾为 `data: [DONE]`。
- 第一条 SSE 数据包含 `{"requestId": "..."}`
- 聚合内容落库后会以 personaId=`专业助手` 写入对话上下文，可在日志中看到 `recordAssistantMessage`。
- 若 `agent_id` 指向不存在的人格，将返回 400 并提示 `Hub 节点未绑定人格 ...`。

### 3. 验证点
- OpenAI 兼容的 JSON/流式接口均支持 `agent_id`。
- Hub 在流式模式下会自动设置 `text/event-stream` / `X-Accel-Buffering: no`。
- personaId 由 ConversationRouter 最终决定（可被路由策略覆盖），但 `agent_id` 提供了用户显式切换的入口。
- 若日志中同时出现 `📚 [MemoryInjection]` 与 personaId，说明人格配置已与记忆注入链路共存。

---

## 场景二：Worker 节点工具任务与超时处理

### 1. 前置条件
- Hub 已运行。
- Worker 配置（推荐 `config.worker.todo.json`）中的 `hub.url` 与 `plugins.toolDirectory` 正确设置为：
  ```json
  {
    "plugins": {
      "toolDirectory": "plugins/worker"
    }
  }
  ```
- 确认 `packages/node-agent/plugins/worker/` 下的 `calendar-task.js`、`notify-user.js` 已存在。
- 准备 REST 客户端（curl 或 Postman）用于手工派发任务；可选配合 WebSocket 监听 AdminPanel 事件。

### 2. 操作步骤
1. **启动 Worker 节点**
   ```bash
   cd packages/node-agent
   npx node-agent start --config config.worker.todo.json
   ```
   CLI 输出应包含：
   - `Node registration succeeded`
   - 心跳日志
   - 插件加载日志：
     ```
     Loaded tool plugin {"file":".../plugins/worker/calendar-task.js"}
     Loaded tool plugin {"file":".../plugins/worker/notify-user.js"}
     ```

2. **手工执行 echo 任务**
   - 使用 Admin API 派发任务：
     ```bash
     curl -X POST http://localhost:8088/api/admin/nodes/worker-demo-node/tasks \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer <token>" \
       -d '{
             "taskId": "manual-echo-1",
             "toolName": "echo",
             "capability": "worker",
             "toolArgs": { "value": "hello manual" },
             "timeout": 10000,
             "waitForResult": true
           }'
     ```
   - 预期响应 `result.echoed.value = "hello manual"`，CLI 记录任务完成。

3. **执行 wait 成功任务**
   - 调用：
     ```bash
     curl -X POST http://localhost:8088/api/admin/nodes/worker-demo-node/tasks \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer <token>" \
       -d '{
             "taskId": "manual-wait-200",
             "toolName": "wait",
             "capability": "worker",
             "toolArgs": { "durationMs": 200 },
             "timeout": 5000,
             "waitForResult": true
           }'
     ```
   - CLI 输出 `Task finished`，响应返回 `sleptMs: 200`。

4. **执行 wait 超时任务**
   - 调用：
     ```bash
     curl -X POST http://localhost:8088/api/admin/nodes/worker-demo-node/tasks \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer <token>" \
       -d '{
             "taskId": "manual-wait-timeout",
             "toolName": "wait",
             "capability": "worker",
             "toolArgs": { "durationMs": 1500 },
             "timeout": 200,
             "waitForResult": true
           }'
     ```
   - 预期响应 `success: false`、错误码 `task_timeout`；Hub 日志、AdminPanel 有 `task_timeout` 事件。

5. **验证 calendar_task 插件写入**
   - 调用：
     ```bash
     curl -X POST http://localhost:8088/api/admin/nodes/worker-demo-node/tasks \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer <token>" \
       -d '{
             "taskId": "manual-calendar-1",
             "toolName": "calendar_task",
             "capability": "worker",
             "toolArgs": {
               "title": "整理周报",
               "deadline": "2025-11-10T09:00:00+08:00",
               "notes": "完成核心指标收集",
               "userId": "user-10001"
             },
             "timeout": 10000,
             "waitForResult": true
           }'
     ```
   - 预期响应 `scheduled: true`，并在 `packages/node-agent/runtime-data/calendar_tasks.jsonl` 中新增记录。

6. **验证 notify_user 插件写入**
   - 调用：
     ```bash
     curl -X POST http://localhost:8088/api/admin/nodes/worker-demo-node/tasks \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer <token>" \
       -d '{
             "taskId": "manual-notify-1",
             "toolName": "notify_user",
             "capability": "worker",
             "toolArgs": {
               "channel": "app_push",
               "message": "今日 15:00 项目例会，请提前准备材料。",
               "userId": "user-10001"
             },
             "timeout": 10000,
             "waitForResult": true
           }'
     ```
   - 预期响应 `notified: true`，并在 `runtime-data/notifications.jsonl` 中新增对应记录。

### 3. 预期结果
- 所有任务均收到明确的 `task_result`（成功或失败）。
- 超时后节点自动恢复 `online` 状态，队列清理正常。
- 插件工具生成的 JSONL 记录可用于后续人工校验。

### 4. 验证点
- `executionTime` 是否合理（毫秒级别）；
- 节点统计 (`activeTasks` 等) 是否更新；
- AdminPanel 是否实时显示任务状态变化。

---

## 场景三：AdminPanel 节点事件透传

### 1. 前置条件
- Hub 正在运行，admin 面板可访问。
- 已有至少一个节点在线（Worker 或 Companion）。

### 2. 操作步骤
1. **监听 AdminPanel WebSocket**
   - 若有界面：直接在 `http://localhost:8088/admin` 打开事件列表。
   - 无界面：使用 WebSocket 工具连接 AdminPanel 渠道（实际地址因实现而异，例如 `ws://localhost:8088/admin-panel`）。

2. **手动触发事件**
   - 重复“场景一”或“场景二”的任务派发；
   - 触发主动性任务（场景四）。

3. **查看事件**
   - 界面或 WebSocket 流中应出现：
     ```json
     {
       "type": "node_event",
       "event": "task_completed",
       "payload": {
         "taskId": "...",
         "nodeId": "...",
         "success": true
       },
       "timestamp": 1693001234567
     }
     ```

### 3. 预期结果
- 每次任务执行或 LLM 代理事件都能广播到 AdminPanel；
- 页面或日志与节点实时状态一致。

### 4. 验证点
- 若无事件，检查 `setupNodeEventForwarding()` 是否被执行（日志中有相关提示）；
- AdminPanel 渠道断线时是否优雅重连。

---

## 场景四：主动性调度触发流程（手工）

### 1. 前置条件
- Hub 运行并加载配置（`config/admin-config.json` 存在）。
- 至少有 Worker 或 Companion 节点在线处理后续任务。
- 拥有管理员 `Bearer` Token。

### 2. 操作步骤
1. **发送触发请求**
   ```bash
   curl -X POST -H "Content-Type: application/json" \
        -H "Authorization: Bearer <token>" \
        -d '{"sceneId":"birthday_reminder","userId":"default"}' \
        http://localhost:8088/api/admin/proactivity/trigger
   ```
   - 若无需认证，可省略 Authorization 头。

2. **观察结果**
   - curl 输出 `{"success":true,...}`。
   - Hub 日志出现：
     - `Scene passed evaluation`
     - 若派发任务，紧接着 `task_assigned`，并向节点发送任务。

3. **节点端验证**
   - 查看 Worker/Companion 是否收到任务派发（参照场景一、二）；
   - 执行结果回传后，Hub 日志应记录 `task_completed`。

4. **AdminPanel 检查**
   - 如果管理面板可用，确认事件面板或节点列表出现对应变化。

### 3. 预期结果
- API 调用成功返回 `success: true`；
- Hub、节点、AdminPanel 都能看到对应事件链；
- 若场景条件未满足或禁用，应返回错误提示。

### 4. 验证点
- `skipChecks` 默认 true（除非请求体显式为 false），留意是否符合业务需求；
- 多次触发是否遵守节流/条件判断逻辑；
- 场景执行失败时是否给出明确日志。

---

## 场景五：API/监控回归

### 1. 前置条件
- Hub 运行，拥有管理员凭证。

### 2. 操作步骤
1. 查询节点列表：
   ```bash
   curl -H "Authorization: Bearer <token>" http://localhost:8088/api/admin/nodes
   ```
2. 访问 Telemetry（如有启用）：
   ```bash
   curl http://localhost:8766/healthz   # Companion 默认端口
   curl http://localhost:8765/healthz   # Worker 默认端口
   ```

### 3. 预期结果
- `nodes` 接口返回在线节点，包含 `type`、`status`、`stats`；
- Telemetry 输出节点健康状态、任务统计、警告信息（如 LLM 限流）。

### 4. 验证点
- 心跳/状态异常时，健康检查应标记 `degraded` 或 `critical`；
- 若 `healthz` 无响应需检查 `telemetry.enabled` 与端口占用。

---

## 场景六：情感引擎与记忆系统（Emotion + RAG）

### 1. 前置条件
- Hub 默认配置即可，EmotionEngine 与 RAGMemoryService 会在测试中自动 mock。

### 2. 操作步骤
1. 运行情感与记忆相关集成测试：
   ```bash
   cd apex-bridge
   npm run test -- tests/integration/emotion-chat-integration.test.ts
   npm run test -- tests/integration/emotion-recording.test.ts
   ```
2. 若需人工验证，可调用 `ChatController` 接口模拟对话，将 `recordEmotion` 与 RAG 入库打开。

### 3. 预期结果
- 日志中出现 `EmotionEngine initialized`、`Emotion detected` 等信息；
- 测试输出包含每日/每周情感统计、负面情绪检索；
- RAG 存储在 mock 模式下返回示例文案，实际环境下应接入真实向量库。

### 4. 验证点
- 情感检测在 fast mode 与 LLM fallback 之间切换是否符合阈值策略；
- RAG 失败时系统是否降级并给出警告；
- 记录频次与 `intensity` 阈值是否匹配设计。

---

## 场景七：偏好/时间线/人格管理 API

### 1. 前置条件
- Hub 运行并有管理员 token。

### 2. 操作步骤
1. Preference API：
   ```bash
   curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
        -d '{"userId":"tester","type":"movie","value":"sci-fi"}' \
        http://localhost:8088/api/admin/preferences
   
   curl -H "Authorization: Bearer <token>" http://localhost:8088/api/admin/preferences?userId=tester
   ```
2. Timeline API：
   ```bash
   curl -H "Authorization: Bearer <token>" "http://localhost:8088/api/admin/timeline?userId=tester&days=7"
   ```
3. Personality API：
   ```bash
   curl -H "Authorization: Bearer <token>" http://localhost:8088/api/admin/personalities
   ```

### 3. 预期结果
- Preference 返回新增项并可查询；
- Timeline 在无数据时返回空数组，有数据时按时间排序；
- Personality 可列举默认人格（需配置文件存在）。

### 4. 验证点
- 缺少必填字段时是否返回正确的 4xx/5xx（测试脚本已有断言）；
- 与 MemoryService/RAG 联动时，缺失依赖会有警告而非崩溃；
- 更新/删除 API 是否同步刷新缓存。

---

## 场景八：插件与学习文档验证

### 1. 前置条件
- 阅读 `docs/learning/apex-bridge-study` 系列文档；
- 确保 `plugins/` 目录存在（如需加载插件），并在节点配置中写入 `plugins.toolDirectory`。

### 2. 操作步骤
1. 按学习文档中的步骤创建/安装示例插件；
2. 在 Hub 启动时检查插件加载日志；
3. 若插件提供 API/任务，结合 Worker/Companion 节点执行。

### 3. 预期结果
- 插件初始化日志 `Plugin loaded`；
- 文档中的示例脚本（如 `环境配置与脚本`）能够成功执行；
- 若插件未注册正确，应有警告提示。

### 4. 验证点
- 插件热加载（若启用）是否按预期工作；
- 插件依赖的外部服务是否已准备；
- 插件异常是否隔离，不影响主流程。

---

## 场景九：容错与恢复

## 场景十：会话事件广播与审批状态

### 1. 前置条件
1. Hub 以 `npm run dev` 或 `node dist/server.js` 运行，并配置好 `VCP_Key`（用于 WS 认证）。
2. 任意浏览器/CLI WebSocket 客户端（如 `wscat`、Postman）可连到：
   - 推荐：`ws://localhost:8088/ABPlog/VCP_Key=<your-key>` 或 `ws://localhost:8088/log/VCP_Key=<your-key>`
   - 兼容：`ws://localhost:8088/VCPlog/VCP_Key=<your-key>` (已弃用)
3. AdminPanel 若已构建，可同步打开以观察事件列表（可选）。

### 2. 操作步骤
1. **监听事件**
   ```bash
   npx wscat -c "ws://localhost:8088/ABPlog/VCP_Key=<your-key>"
   ```
   建立连接后，保持终端不关闭，等待事件。
2. **发起群聊消息**
   - 调用 `/v1/chat/completions`，携带 `apexMeta.target.members`（至少 2 个 persona）与 `apexMeta.mentions`，或在用户消息中使用 `@小悦` 等别名。
   - 请求示例：
     ```bash
     curl -X POST http://localhost:8088/v1/chat/completions \
       -H "Content-Type: application/json" \
       -d '{
             "model": "gpt-4o-mini",
             "messages": [
               {"role":"user","content":"@温暖伙伴 @专业助手 来个早安播报"}
             ],
             "apexMeta": {
               "conversationId": "conv-event-demo-1",
               "target": {
                 "members": [
                   {"memberId":"hub-main","personaId":"温暖伙伴","type":"hub"},
                   {"memberId":"hub-pro","personaId":"专业助手","type":"hub"}
                 ]
               }
             }
           }'
     ```
3. **触发工具审批**
   - 让任何 persona 触发需要 Hub 批准的工具（可通过自定义插件或手工任务）。
   - 在审批通过/拒绝后再次观察 WS。

### 3. 预期结果
 在 WebSocket 客户端看到以下事件：
 - `conversation:user_message`：包含 `conversationId`、`mentions`、最近一条用户内容。
 - `conversation:assistant_message`：助手回复落地后触发。
 - `tool_approval_requested` / `tool_approval_completed`：审批链路更新。
 这些事件也会透传给 AdminPanel `node_event` 订阅方，便于实时看板或告警。

### 4. 验证点
 - 群聊消息是否生成 `conversation:user_message`，并携带 `mentions` 列表。
 - 助手回复是否生成 `conversation:assistant_message`，`personaId` 对应实际人格。
 - 审批请求与结果是否分别触发 `tool_approval_requested` / `tool_approval_completed`。

---

## 场景十一：多 Persona 记忆隔离验证

### 1. 前置条件
1. Hub 运行且已启用 `MemoryService`（默认 RAG）。
2. 至少存在两个 Hub 人格（例如 `温暖伙伴`、`专业助手`）。
3. REST 客户端可访问 `/v1/chat/completions`。

### 2. 操作步骤
1. **写入 Persona A 记忆**
   ```bash
   curl -X POST http://localhost:8088/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
           "model": "gpt-4o-mini",
           "user": "user-2001",
           "agent_id": "温暖伙伴",
           "messages": [
             {"role":"user","content":"记住我喜欢喝乌龙茶"}
           ]
         }'
   ```
2. **写入 Persona B 记忆**
   ```bash
   curl -X POST http://localhost:8088/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
           "model": "gpt-4o-mini",
           "user": "user-2001",
           "agent_id": "专业助手",
           "messages": [
             {"role":"user","content":"提醒我本周要写周报"}
           ]
         }'
   ```
3. **查询或监听记忆事件**
   - 通过 `wscat` 监听 `memory:new_document` 事件，或在 RAG DB 中查询 `knowledgeBase`.

### 3. 预期结果
 - `memory:new_document` 事件中，`metadata.knowledgeBase` 分别为 `user-2001-persona-温暖伙伴` 与 `user-2001-persona-专业助手`。
 - 再次调用 `温暖伙伴` 人格时，只能检索到“乌龙茶”记忆；`专业助手` 只能检索到“写周报”记忆。

### 4. 验证点
 - 相同 `user` 但不同 persona，`memoryUserId`/`knowledgeBase` 是否隔离。
 - 不显式传 `user` 的后续请求（同一 `conversationId`）是否继续沿用首次写入的命名空间。

---

## 场景十二：语义记忆服务契约验证（Phase 2）

### 1. 前置条件
1. 已执行 `npm install` 并完成 `npm run build`（可选）。
2. 本地 Node 版本 ≥ 18，便于使用 `crypto.randomUUID`/`hnswlib-node`。
3. （可选）若需观察事件，可在 Hub 中启用全局 `EventBus` 并监听 `memory:semantic:*`。

### 2. 操作步骤
1. 运行契约测试，确保接口签名未被破坏：
   ```bash
   npm run test -- tests/contracts/SemanticMemoryService.contract.test.ts
   ```
2. 运行语义记忆单测，覆盖保存/检索/时间窗口逻辑：
   ```bash
   npm run test -- tests/services/memory/SemanticMemoryService.test.ts
   ```
3. 若已安装 `hnswlib-node`，运行持久化集成测试：
   ```bash
   npm run test -- tests/integration/semantic-memory-hnsw.integration.test.ts
   ```
4. （可选）在 VSCode/Node REPL 中手动调用服务：
   ```ts
   import { DefaultSemanticMemoryService } from '../../src/services/memory/SemanticMemoryService';
   import { InMemorySemanticStore } from '../../src/services/memory/stores/InMemorySemanticStore';

   const service = new DefaultSemanticMemoryService(
     new InMemorySemanticStore(),
     { embeddingDimensions: 3, defaultTopK: 3, maxTopK: 5 }
   );

   await service.saveSemantic({ userId: 'user-1', content: '喜欢蓝山', embedding: [1,0,0] });
   await service.searchSimilar({ vector: [1,0,0], userId: 'user-1', includeDiagnostics: true });
   ```

### 3. 预期结果
- 契约测试输出 `PASS`，证明 `saveSemantic` / `recallSemantic` / `searchSimilar` 的签名保持一致；
- 单元测试 `DefaultSemanticMemoryService` 通过，日志显示去重、persona 过滤、时间窗口等断言；
- 手工调用时返回 `results` 与 `diagnostics`，`diagnostics.returned` 与 CLI 输出一致。

### 4. 验证点
- 变更接口或新增字段后，契约测试是否立即失败（用以提醒更新文档）；
- `searchSimilar` 是否严格遵守 `userId` / `personaId` / `timeWindow`，且 `minSimilarity` 控制生效；
- `diagnostics` 的统计（`totalCandidates / filteredByContext / filteredByThreshold / returned`）与实际结果是否匹配。

---

## 场景十三：情景记忆窗口 API（Phase 2）

### 1. 前置条件
1. Episodic Memory 接口与 `DefaultEpisodicMemoryService` 已注入（内存 store 即可）。
2. 可通过 Node REPL / REST 直接调用 `EpisodicMemoryService`。

### 2. 操作步骤
1. 写入两条不同 persona 的事件：
   ```ts
   await episodicService.recordEvent({
     userId: 'user-demo',
     personaId: '温暖伙伴',
     eventType: 'conversation',
     content: '记住我今天跑步5公里',
     timestamp: Date.now()
   });
   await episodicService.recordEvent({
     userId: 'user-demo',
     personaId: '专业助手',
     eventType: 'task',
     content: '提醒我写周报',
     timestamp: Date.now()
   });
   ```
2. 触发窗口查询：
   ```ts
   const result = await episodicService.queryWindow({
     userId: 'user-demo',
     personaId: '专业助手',
     eventTypes: ['task'],
     includeDiagnostics: true,
     window: { lastDays: 1 }
   });
   ```
3. 可选：调用 `summarizeRange` 检查 `earliest/latest` 与事件类型统计。

### 3. 预期结果
- `result.events` 仅包含 persona=`专业助手` 的 `task` 事件；
- `diagnostics.filteredByContext` > 0（另一 persona 被过滤）；
- `diagnostics.filteredByWindow` = 0（事件皆在 1 天窗口内）。
- 如已配置 vectorizer，EventBus 中可同时观察到 `memory:semantic:saved` 事件（桥接成功将 episodic 写入语义记忆）。

### 4. 验证点
- persona / household / user 维度是否隔离；
- `lastDays` / `from` / `to` 参数是否生效；
- `diagnostics` 统计与返回事件是否一致；
- `summarizeRange` 的 `total` 是否与窗口结果匹配。

> 自动化：`npm run test -- tests/services/memory/EpisodicMemoryService.test.ts`


> 在真实环境中验证系统韧性，建议独立记录操作和结果。

1. **节点断线恢复**
   - 启动节点 → `Ctrl+C` 强制退出 → Hub 记录 `node_disconnected`；
   - 重启节点 → 状态恢复 `online`，任务可继续执行。

2. **LLM 失效/降级**
   - 修改节点配置使 LLM 不可用（无 API Key 等）；
   - Worker/Companion 的 LLM 任务返回 `llm_proxy_unavailable`；
   - Hub 日志出现 `llm_proxy_completed` with `success: false`，无系统崩溃。

3. **配额策略调整**
   - 调整 `config/admin-config.json` 的 `llm.quota`；
   - 验证节点能正确降级/排队，AdminPanel 有对应事件；
   - 多节点竞争时，QuotaManager 统计是否符合预期。

4. **配置热更/回滚**
   - 使用 ConfigController 导出备份 → 修改配置 → 导入；
   - 验证 `readConfig()` 缓存更新，必要时重启服务；
   - 检查 PathService 新路径是否正确生效。

---

## 执行建议（更新）
- **统一记录**：每个场景执行后写下节点 ID、任务 ID、事件 payload、接口响应，形成测试日志。
- **批量回归**：建议每日执行 `npm test`（主体仓库）和 `npm run test`（Node Agent），再按需挑选关键集成场景。
- **持续集成**：在 CI 中串联重要脚本（尤其是 Hub + Worker/Companion 联调与 AdminPanel 事件），自动验证回归。
- **复盘与扩展**：若接入新的插件/模块，应在此文档追加对应场景，保持全量覆盖。

若需要更深入的专项（如性能压测、跨 datacenter 节点同步），请列出目标和约束，我会继续拆解流程。
