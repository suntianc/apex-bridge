# Apex Bridge 使用手册（2025-11-11）  

Apex Bridge 是一套面向多智能体协同的对话中枢。它支持 Hub 核心路由、Companion/Worker 节点远程执行、人格记忆隔离、工具授权与审计、RAG 检索等能力。本手册面向实际运营和开发团队，帮助你从零部署项目、配置各项服务、理解路由机制并排查常见问题。  

---

## 目录

1. [系统总览](#系统总览)  
2. [快速开始](#快速开始)  
3. [核心配置清单](#核心配置清单)  
4. [节点部署指南（Worker / Companion）](#节点部署指南worker--companion)  
5. [会话路由与人格管理](#会话路由与人格管理)  
6. [API 详解](#api-详解)  
7. [管理后台操作指南](#管理后台操作指南)  
8. [RAG 与记忆体系](#rag-与记忆体系)  
9. [工具授权与任务流水](#工具授权与任务流水)  
10. [日志、事件与排障建议](#日志事件与排障建议)  
11. [常见问题 FAQ](#常见问题-faq)  
12. [附录：常用命令与示例](#附录常用命令与示例)  

---

## 系统总览

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│        Hub (Apex Bridge)│◀─────▶ │  Node Agents (Companion / Worker) │
│ - HTTP / WebSocket API  │        │  - TaskOrchestrator          │
│ - Conversation Router   │        │  - LLMProxy (透传到 Hub)     │
│ - Tool Authorization    │        │  - 自定义工具 / 插件         │
│ - Memory & RAG 服务     │        └──────────────────────────────┘
│ - EventBus & 审计日志   │
└─────────────────────────┘
```

- **Hub**：负责对话路由、人格注入、工具授权、事件发布、RAG 记忆写入。  
- **Companion 节点**：主要负责对话类任务，可结合人格模板输出。  
- **Worker 节点**：执行工具/任务，也可以直接对话回复（`worker_conversation`）。  
- **管理后台**：可视化配置 LLM、RAG、节点、人格绑定等。  

---

## 快速开始

### 1. 环境准备

- Node.js 18+  
- npm 9+  
- Git  
- （可选）Docker / Docker Compose（用于部署向量数据库或其他依赖）  

### 2. 获取代码

```bash
git clone https://github.com/your-org/apex-bridge.git
cd apex-bridge
```

### 3. 安装依赖并构建

```bash
npm install
npm run build
```

### 4. 启动 Hub

```bash
npm start                       # 默认监听 http://localhost:8088
```

服务启动后可访问健康检查：  

```bash
curl http://localhost:8088/health
```

### 5. 启动管理后台（共用 Hub 端口）

启动 Hub 后，直接打开浏览器访问 `http://localhost:8088/admin`。首次进入需按引导完成基础配置（管理员账号、LLM、RAG 等）。  

### 6. 启动节点（示例）

```bash
# 安装节点依赖
cd packages/node-agent
npm install

# 构建
npm run build

# Companion 节点（示例）
npx node-agent start --config config.companion.json

# Worker 节点（示例）
npx node-agent start --config config.worker.json
```

### 7. 验证对话

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
        "model": "deepseek-chat",
        "messages": [
          {"role":"user","content":"@小悦 今天状态怎么样？"}
        ],
        "apexMeta": {
          "conversationId": "conv-demo-1",
          "sessionType": "group",
          "mentions": ["companion:node-xxxx:温暖伙伴"]
        }
      }'
```

返回体包含 `node_result` 即节点执行详情。  

---

## 核心配置清单

### 1. Hub 配置目录

默认位于 `config/`，其中主要文件：  

| 文件 | 说明 |
|------|------|
| `admin-config.json` | 管理后台整体配置。首次通过后台完成后会生成/更新。 |
| `runtime-data/` | 存放临时数据（如工具审批记录等）。 |
| `logs/` | Hub 运行日志。 |

### 2. LLM 配置（`admin-config.json` → `llm` 段）

```json
"llm": {
  "defaultProvider": "deepseek",
  "deepseek": {
    "apiKey": "sk-xxx",
    "baseURL": "https://api.deepseek.com/v1",
    "defaultModel": "deepseek-chat",
    "timeout": 60000,
    "maxRetries": 2
  },
  "openai": { ... },
  "zhipu": { ... },
  "ollama": { ... },
  "custom": { ... },
  "quota": {
    "maxRequestsPerMinute": 60,
    "maxTokensPerDay": 500000,
    "maxConcurrentStreams": 5
  }
}
```

- 所有提供商统一使用 `baseURL` 字段（兼容旧 `apiUrl` / `baseUrl`）。  
- `defaultProvider` 决定未指定模型时默认选用的提供商。  
- Companion/Worker 节点通过 Hub 代理，无需直接配置第三方 API。  

### 3. RAG 配置（`admin-config.json` → `rag` 段）

```json
"rag": {
  "enabled": true,
  "storagePath": "./data/vector-store",
  "vectorizer": {
    "provider": "intellicore-embed",
    "baseURL": "https://embed.intellicore.ai/v1",
    "apiKey": "your_embedding_api_key",
    "model": "text-embedding-3-large",
    "dimensions": 3072
  },
  "rerank": {
    "enabled": true,
    "baseURL": "https://api.rerank.com/v1",
    "apiKey": "your_rerank_key",
    "model": "rerank-english-v2.0"
  },
  "defaultMode": "basic",
  "defaultK": 5,
  "maxK": 20,
  "maxMultiplier": 3,
  "semanticWeight": 0.6
}
```

- 若出现 “Embedding API error: 404” 说明未配置真实向量化服务。  
- Admin 设置页已提供嵌入 API Key 输入项。  

### 4. 工具授权

在 `admin-config.json` 的 `toolAuthorization` 段配置默认策略，可选状态：  
- `allow`：直接放行。  
- `deny`：直接拒绝。  
- `requires_approval`：需 Hub 审批。  

### 5. 安全限流设置（`security.rateLimit` + `redis`）

```json
"security": {
  "rateLimit": {
    "enabled": true,
    "provider": "auto",
    "keyPrefix": "rate_limit",
    "defaultStrategyOrder": ["apiKey", "ip"],
    "rules": [
      {
        "id": "chat-api",
        "windowMs": 60000,
        "maxRequests": 60,
        "mode": "sliding",
        "burstMultiplier": 1.5,
        "matchers": [
          { "prefix": "/v1/chat", "methods": ["POST"] },
          { "prefix": "/v1/chatvcp", "methods": ["POST"] }
        ],
        "strategyOrder": ["apiKey", "ip"],
        "responseHeaders": true
      },
      {
        "id": "admin-api",
        "windowMs": 60000,
        "maxRequests": 120,
        "mode": "fixed",
        "matchers": [{ "prefix": "/api/admin" }],
        "strategyOrder": ["user", "ip"],
        "skipFailedRequests": true
      }
    ]
  }
},
"redis": {
  "enabled": true,
  "url": "redis://user:pass@redis-host:6379/0",
  "keyPrefix": "apexbridge",
  "connectTimeoutMs": 5000,
  "commandTimeoutMs": 3000
}
```

- `provider` 支持 `memory`（仅本地）/`redis`（强制分布式）/`auto`（优先 Redis、失败回退 Memory）。  
- 规则可指定匹配器（`path`/`prefix`/`regex`）与身份策略（IP、API Key、User、Header）；`burstMultiplier` 用于允许短时突发访问。  
- 当请求被限流时，响应会附带 `Retry-After` 与 `X-RateLimit-*` 头部，日志会显示 `rateLimit.provider` 标识当前实现。  

**在管理后台调整限流**  
1. 登录 `http://<hub-host>:<port>/admin` → “系统配置”。  
2. 导出配置或直接编辑 JSON，在 `security.rateLimit` / `redis` 段修改参数。  
3. 提交后后台实际调用 `PUT /api/admin/config`。也可脚本化更新：

```bash
curl -X PUT http://localhost:8088/api/admin/config \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"config":{"security":{"rateLimit":{"rules":[{"id":"chat-api","windowMs":60000,"maxRequests":45,"mode":"sliding"}]}}}}'
```

如启用 Redis，请确保连接信息正确；当 Redis 不可达时系统会自动降级至内存限流。

### 6. 其他常用环境变量

| 变量 | 说明 |
|------|------|
| `PORT` | Hub HTTP 端口，默认 8088。 |
| `APEX_LOG_LEVEL` | Hub 日志级别（`info`/`debug`）。 |
| `API_AUTH_TOKEN` | 若设置，所有 REST 调用需携带 `Authorization: Bearer <token>`。 |
| `CALLBACK_AUTH_TOKEN` | 插件/外部任务回调口令。 |

---

## 节点部署指南（Worker / Companion）

节点配置位于 JSON 文件，如 `packages/node-agent/config.companion.json`。  

### 1. 通用字段

```json
{
  "hub": {
    "url": "ws://localhost:8088/vcp-distributed-server/VCP_Key=your-vcp-key",
    "vcpKey": "sk-example"
  },
  "node": {
    "name": "Example Companion",
    "type": "companion",
    "capabilities": ["companion"],
    "tools": ["companion_conversation"]
  },
  "heartbeat": {
    "intervalMs": 15000
  },
  "tasks": {
    "maxConcurrent": 1,
    "defaultTimeoutMs": 120000
  },
  "llm": {
    "streamEnabled": true,
    "defaultProvider": "deepseek",
    "providers": {
      "deepseek": {
        "apiKey": "sk-node-agent",
        "baseURL": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
        "stream": true
      }
    }
  },
  "logging": {
    "level": "info",
    "format": "pretty"
  }
}
```

要点：  
- `llm.providers` 必须保留 `model` 字段，否则会在 Hub 报 “missing field model”。  
- 节点会在 `packages/node-agent/runtime-data/<nodeName>/node-id` 持久化 `nodeId`，确保重启后保持一致。  
- 设置 `NODE_AGENT_ID_PATH` 可自定义 `node-id` 存储路径。  

### 2. Companion 专属

- 默认能力：`companion_conversation`。  
- 支持人格注入、情绪检测、工具委派。  
- 当前版本暂不支持自动流式返回到客户端，因此 Hub 会强制走非流式模式（日志会提示）。  

### 3. Worker 专属

- 默认能力：`echo`、`wait`、`llm-tool`、`worker_conversation`。  
- 可直接响应对话请求：Hub 会调用 `worker_conversation`，并将结果放在 `node_result.reply` 中。  
- 可通过插件目录挂载业务工具，文件位于 `packages/node-agent/plugins/`。  

### 4. 运行监控

- Telemetry HTTP（可选，默认端口 Companion 8766、Worker 8775）：  
  - `/healthz`：健康状态  
  - `/metrics`（如启用）：Prometheus 指标  
- 日志等级建议保持 `info`，调试时改为 `debug`。  

---

## 会话路由与人格管理

### 1. 人格存储位置

- JSON：`config/personality/<personaId>.json`  
- TXT（兼容模式）：`Agent/<personaId>.txt`  
- Persona ID 必须与配置文件名一致。  

### 2. 会话成员与 mentions

`apexMeta` 示例：

```json
{
  "conversationId": "conv-group-1",
  "sessionType": "group",
  "target": {
    "members": [
      {"memberId":"hub:hub:default","personaId":"default","type":"hub"},
      {"memberId":"companion:node-123:温暖伙伴","personaId":"温暖伙伴","type":"companion","nodeId":"node-123","displayName":"小悦"},
      {"memberId":"worker:node-456:小码","personaId":"小码","type":"worker","nodeId":"node-456"}
    ]
  },
  "mentions": ["companion:node-123:温暖伙伴"]
}
```

说明：  
- `mentions` 第一个成员将作为 `primaryTarget`，Hub 会派发到对应节点。  
- 若 `mentions` 列出多个节点，当前版本只会直接回复第一个，其他成员会被记入 `mandatoryTargets` 以备后续任务。  
- `displayName` 可用于 `@昵称` 匹配，写法为消息文本 `@小悦`。  
- Worker/Companion 都支持直接对话。  
- Hub 节点仍负责广播/记录消息。  

### 3. 记忆命名空间

系统为每个 `(userId, personaId)` 生成独立命名空间：  
- `memoryUserId = ${userId}::${personaId}`  
- `knowledgeBase = ${userId}-persona-${personaId}`  

记忆写入后会触发事件：  
- `memory:new_document`  
- `memory:persona_recall`  

### 4. 响应结构中的节点信息

```json
{
  "choices": [...],
  "node_result": {
    "success": true,
    "reply": "节点返回的文本",
    "usage": {...},
    "partialOutputs": [{"chunk":"...","timestamp":1731312456000}],
    "delegations": [...],
    "error": null
  },
  "partial_outputs": [...],
  "delegations": [...]
}
```

- `node_result.rawResult` 包含节点原始返回结构，可用于调试。  
- `partial_outputs` 为节点侧流式片段（目前主要记录在 Hub 日志或前端）。  

---

## API 详解

### 1. `/v1/chat/completions`（兼容 OpenAI）

#### 1.1 标准参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | array | 是 | OpenAI 标准消息数组 |
| `model` | string | 否 | 覆盖默认模型（默认为配置的 defaultModel 或 `worker-proxy`/`companion-proxy`） |
| `temperature` | number | 否 | 0~2 |
| `max_tokens` | number | 否 | 最大补全 token |
| `stream` | boolean | 否 | 对 Hub/Companion 可用；节点会自动降级为非流式 |
| `user` | string | 否 | 用户标识，将透传到记忆体系 |

#### 1.2 `apexMeta` 拓展字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `conversationId` | string | 否 | 会话 ID，若为空会自动生成 |
| `sessionType` | string | 否 | `single` / `group`，默认自动推断 |
| `target.members` | array | 否 | 成员列表；首次建群时提供，后续可省略 |
| `target.default` | object | 否 | 默认主说话人 |
| `mentions` | array | 否 | 本轮指定节点或成员 ID |
| `approval` | object | 否 | 用于工具审批回调 |
| `waitForResult` | boolean | 否 | 强制等待节点工具执行完成 |

示例请求见“快速开始”。  

#### 1.3 响应字段

| 字段 | 说明 |
|------|------|
| `model` | 当路由至节点时会显示 `companion-proxy` / `worker-proxy`，便于识别来源 |
| `node_result` | 节点执行详情（成功/错误、usage、partialOutputs、delegations） |
| `partial_outputs` | Hub 汇总的节点流式片段 |
| `delegations` | 节点产生的工具委派请求（当前主要用于 Companion） |

### 2. `/v1/interrupt`

```json
POST /v1/interrupt
{
  "requestId": "chatreq-1731312000-abc"
}
```

若成功，返回 `{ "success": true }`。日志会有 `[ChatService] Request interrupted ...` 记录。  

### 3. `/v1/models`

用于前端获取可用模型列表。节点场景下仍返回 Hub 配置的模型。  

### 4. WebSocket

- **推荐路径**：`/abp-distributed-server/VCP_Key=<key>` 或 `/distributed-server/VCP_Key=<key>`
- **兼容路径**：`/vcp-distributed-server/VCP_Key=<key>` (已弃用，建议迁移)
- 消息类型：`node_register`、`heartbeat`、`task_assign`、`task_result`、`llm_request` 等。  
- Node Agent 已内置协议层，手动对接时可参考 `packages/node-agent/src/protocol`。  

---

## 管理后台操作指南

### 1. 登录与基础配置

- 首次访问 `http://localhost:8088/admin` 会触发安装向导：  
  1. 设置管理员账号  
  2. 填写 LLM 基础信息  
  3. 配置 RAG 嵌入服务（可暂时跳过）  
- 向导完成后会生成 `config/admin-config.json`。  

### 2. 设置页

| 区块 | 说明 |
|------|------|
| **服务器设置** | 端口、Host、Debug 等。 |
| **LLM 设置** | 各提供商 API Key、baseURL、默认模型。 |
| **RAG 设置** | 向量化器 baseURL/API Key、重排序配置、Embedding Key 输入。 |
| **节点管理** | 查看在线节点、绑定人格、设置工具能力。 |
| **人格管理** | 上传/编辑人格模板（JSON/Markdown）。 |

### 3. 节点与人格绑定

- Hub/Companion/Worker 节点各只能绑定特定人格。  
- Worker `nodeId` 由节点启动时自动注册；若需手动，支持在设置页根据 nodeId 选择人格模板。  
- 绑定后 `ConversationRouter` 会自动校验：未绑定人格的节点无法接收对话任务。  

### 4. 审计与事件

- 工具审批请求会出现在后台“工具授权”面板。  
- 事件日志（如 `memory:new_document`、`tool_approval_requested`）可在“系统事件”中查看。  

---

## RAG 与记忆体系

### 1. 嵌入写入流程

1. 用户消息写入 `MemoryService`，触发向量化。  
2. 保存到 `vector_store/`（基于文件系统或外部数据库）。  
3. 发布事件：`memory:new_document`。  

若日志中出现 `Embedding API error` 或目录为空，检查以下内容：  
- `rag.vectorizer.baseURL` 是否可访问。  
- 是否在管理员界面填写有效的嵌入 API Key。  
- 是否正确设置 `rag.enabled = true`。  

### 2. 记忆召回

Hub 在每轮对话开始会尝试召回记忆，日志级别为 `debug`：  
`[ChatService] recallPersonaMemories -> Published memory:persona_recall event`。  

### 3. RAG 语法回顾

见“RAG 与记忆体系”章节或 `config/` 中的范例。可通过 `ragParams` 传入 `query`、`time` 等。  

---

## 工具授权与任务流水

### 1. 授权状态

| 状态 | 行为 |
|------|------|
| `allow` | 直接执行工具 |
| `deny` | 拒绝并把原因反馈给 LLM |
| `requires_approval` | 生成审批请求，等待管理员在后台操作 |

### 2. 节点任务派发

当工具由 Companion/Worker 节点执行时：  
1. Hub 调度 `nodeManager.dispatchTaskToNode`。  
2. 节点 `TaskOrchestrator` 执行工具。  
3. 结果回传 Hub，写入 `node_result`。  

`ChatService` 日志（info）：`[ChatService] Dispatching node conversation ... nodeType: worker/companion`。  

### 3. 常见事件

| 事件 | 说明 |
|------|------|
| `tool_approval_requested` | 工具需要审批时触发。 |
| `tool_approval_completed` | 审批完成后触发。 |
| `memory:new_document` | 新记忆写入。 |
| `memory:persona_recall` | 召回记忆成功。 |
| `emotion:negative_detected` | 识别到负面情绪。 |

---

## 日志、事件与排障建议

### 1. Hub 日志（默认 `logs/intellicore.log`）

| 级别 | 说明 |
|------|------|
| `info` | 重要执行流程（派发、审批、事件） |
| `warn` | 配置缺失、授权拒绝、上下文过长等警告 |
| `error` | API 调用失败、工具执行异常 |
| `debug` | 详细流程（变量解析、记忆召回、工具结果等） |

### 2. 常见问题排查

1. **LLM 请求返回 400 missing model**  
   - 检查节点配置中的 `llm.providers.<provider>.model` 是否填写。  
   - 确认 Hub `NodeManager` 日志中 `options.model` 是否为 `null`。  

2. **RAG 无法写入**  
   - 管理后台是否填写真实嵌入 API Key。  
   - `rag.vectorizer.baseURL` 是否返回 200。  
   - 日志是否有 `memory:new_document` 事件。  

3. **`@` 提及节点无响应**  
   - `mentions` 是否写入完整 `memberId` 或 `displayName`。  
   - 会话是否已有成员缓存；若首次调用，需要在 `target.members` 中提供该节点信息。  

4. **Worker 对话不回复**  
   - 确认 Worker 节点日志是否出现 `Worker conversation completed`。  
   - Hub 日志是否进入 `[ChatService] Dispatching node conversation ... nodeType: worker`。  

5. **工具审批无法生效**  
   - 检查 `admin-config.json` 中 `toolAuthorization` 是否生效。  
   - 审批结果可在后台查看并确认执行。  

---

## 常见问题 FAQ

1. **Q：是否必须同时运行 Companion 和 Worker？**  
   A：否。单节点也可运行，Hub 会根据 `mentions` 或 `target.default` 选择可用节点。  

2. **Q：如何新增人格？**  
   A：在 `config/personality/` 新增 `<personaId>.json`，然后在管理后台绑定到节点成员。  

3. **Q：如何扩展工具？**  
   A：Worker 节点新增插件或在 `registerWorkerCapabilities` 中注册新工具，并在 Hub 侧配置授权。  

4. **Q：可以使用其他向量数据库吗？**  
   A：可以，只需在 RAG 配置中替换向量化服务/存储路径，或扩展 `VCPEngine` 中的存储适配器。  

5. **Q：如何查看节点运行状态？**  
   A：后台“节点管理”列表、节点 CLI 日志，以及 Telemetry `/healthz`。  

---

## 附录：常用命令与示例

### 1. 常用 npm 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | Hub 开发模式（热重载） |
| `npm run build` | 编译 Hub TypeScript |
| `npm start` | 启动 Hub |
| `npm --prefix packages/node-agent run build` | 编译节点代理 |
| `npx node-agent start --config <file>` | 启动指定节点 |

### 2. 工具审批示例

```json
{
  "tool": "calendar_task",
  "decision": {
    "status": "requires_approval",
    "reason": "用户未授权访问日历"
  }
}
```

管理员在后台审批通过后，节点会再次获得执行令牌。  

### 3. 日志级别调整

```bash
# Hub
export APEX_LOG_LEVEL=debug
npm start

# 节点
npx node-agent start --config config.worker.json --log-level debug
```

---

如需进一步信息，请参考 `docs/design/` 和 `docs/testing/` 目录中的设计方案与测试脚本，或直接在管理后台查看实时状态。祝使用顺利！  


