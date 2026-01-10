# ApexBridge API 参考文档

**文档版本:** v1.0.0  
**最后更新:** 2026-01-10  
**基础 URL:** `http://localhost:8088`

---

## 目录

1. [概述](#概述)
2. [认证](#认证)
3. [聊天完成 API](#聊天完成-api)
4. [流式 API](#流式-api)
5. [模型管理 API](#模型管理-api)
6. [技能 API](#技能-api)
7. [MCP API](#mcp-api)
8. [会话 API](#会话-api)
9. [WebSocket API](#websocket-api)
10. [错误代码](#错误代码)

---

## 概述

ApexBridge 是一个企业级 AI Agent 框架，提供 OpenAI 兼容的 REST API 和 WebSocket 接口。本文档涵盖所有 API 端点的详细说明，包括请求格式、响应格式和代码示例。

所有 API 响应均采用 JSON 格式，错误响应包含 `error` 对象，成功响应包含 `success` 或 `data` 字段。

**服务器默认端口:** `8088`

---

## 认证

### API Key 认证

ApexBridge 支持基于 Bearer Token 的 API Key 认证方式。

**请求头格式:**

```
Authorization: Bearer <your_api_key>
```

**配置方式:**
API Key 可通过配置文件 (`config/admin-config.json`) 或环境变量 (`API_KEY` / `ABP_API_KEY`) 设置。

**示例请求:**

```bash
curl -X GET http://localhost:8088/v1/models \
  -H "Authorization: Bearer your_api_key_here"
```

**注意:**

- 认证可在配置中禁用 (`auth.enabled: false`)
- 公共端点 (`/health`, `/metrics`) 无需认证
- 静态资源无需认证

---

## 聊天完成 API

### POST /v1/chat/completions

创建聊天完成请求，支持同步和流式两种模式。

#### 请求参数

| 参数名              | 类型    | 必填 | 默认值   | 说明               |
| ------------------- | ------- | ---- | -------- | ------------------ |
| `messages`          | Array   | 是   | -        | 消息数组           |
| `model`             | String  | 否   | 默认模型 | 模型 ID            |
| `provider`          | String  | 否   | -        | 提供商标识         |
| `temperature`       | Number  | 否   | 1        | 温度参数 (0-2)     |
| `max_tokens`        | Integer | 否   | 4096     | 最大生成 token 数  |
| `top_p`             | Number  | 否   | 1        | Top-p 采样参数     |
| `frequency_penalty` | Number  | 否   | 0        | 频率惩罚 (-2 到 2) |
| `presence_penalty`  | Number  | 否   | 0        | 存在惩罚 (-2 到 2) |
| `stream`            | Boolean | 否   | false    | 是否启用流式输出   |
| `user`              | String  | 否   | -        | 用户标识           |
| `selfThinking`      | Object  | 否   | -        | 深度思考配置       |
| `conversation_id`   | String  | 否   | 自动生成 | 会话 ID            |

#### 消息格式

```typescript
// 文本消息
{
  "role": "user" | "assistant" | "system",
  "content": "你好，世界"
}

// 多模态消息
{
  "role": "user",
  "content": [
    { "type": "text", "text": "描述这张图片" },
    { "type": "image_url", "image_url": { "url": "https://example.com/image.jpg" } }
  ]
}
```

#### 请求示例

**同步模式:**

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "messages": [
      { "role": "system", "content": "你是一个专业助手" },
      { "role": "user", "content": "请介绍一下 ApexBridge" }
    ],
    "model": "gpt-4",
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

**流式模式:**

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "messages": [
      { "role": "user", "content": "写一个 Python 快速排序算法" }
    ],
    "model": "gpt-4",
    "stream": true
  }'
```

#### 响应示例

**同步响应:**

```json
{
  "id": "chatcmpl-1736486400",
  "object": "chat.completion",
  "created": 1736486400,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "ApexBridge 是一个高性能的 AI Agent 框架..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 150,
    "total_tokens": 200
  }
}
```

**流式响应 (SSE 格式):**

```json
data: {"id":"chatcmpl-1736486400","object":"chat.completion.chunk","created":1736486400,"model":"gpt-4","choices":[{"index":0,"delta":{"content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-1736486400","object":"chat.completion.chunk","created":1736486400,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"A"},"finish_reason":null}]}

data: {"id":"chatcmpl-1736486400","object":"chat.completion.chunk","created":1736486400,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"pex"},"finish_reason":null}]}

data: [DONE]
```

---

### GET /v1/models

获取所有可用的模型列表。

#### 请求示例

```bash
curl -X GET http://localhost:8088/v1/models \
  -H "Authorization: Bearer your_api_key"
```

#### 响应示例

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4",
      "object": "model",
      "owned_by": "openai",
      "created": 1736486400
    },
    {
      "id": "claude-3-5-sonnet",
      "object": "model",
      "owned_by": "anthropic",
      "created": 1736486400
    }
  ]
}
```

---

### POST /v1/interrupt

中断正在进行的流式请求。

#### 请求参数

| 参数名      | 类型   | 必填 | 说明    |
| ----------- | ------ | ---- | ------- |
| `requestId` | String | 是   | 请求 ID |

#### 请求示例

```bash
curl -X POST http://localhost:8088/v1/interrupt \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "requestId": "conv_1736486400_abc123"
  }'
```

#### 响应示例

**成功:**

```json
{
  "success": true,
  "message": "Request interrupted successfully",
  "requestId": "conv_1736486400_abc123",
  "interrupted": true
}
```

**失败 (请求不存在):**

```json
{
  "success": false,
  "message": "Request not found or already completed",
  "requestId": "conv_1736486400_abc123",
  "reason": "not_found"
}
```

---

### POST /v1/chat/simple-stream

简化版流式聊天接口，专为前端看板娘设计。

#### 请求参数

| 参数名        | 类型   | 必填 | 说明       |
| ------------- | ------ | ---- | ---------- |
| `messages`    | Array  | 是   | 消息数组   |
| `model`       | String | 是   | 模型 ID    |
| `provider`    | String | 否   | 提供商标识 |
| `temperature` | Number | 否   | 温度参数   |

#### 请求示例

```bash
curl -X POST http://localhost:8088/v1/chat/simple-stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "messages": [{ "role": "user", "content": "你好" }],
    "model": "gpt-4"
  }'
```

---

## 流式 API

### 流式响应事件类型

当启用流式输出时，服务器会发送多种 SSE 事件:

| 事件类型          | 说明           |
| ----------------- | -------------- |
| `data`            | 标准聊天完成块 |
| `thought_start`   | 思考过程开始   |
| `thought`         | 思考内容块     |
| `thought_end`     | 思考过程结束   |
| `action_start`    | 工具调用开始   |
| `observation`     | 工具执行结果   |
| `answer_start`    | 最终答案开始   |
| `answer`          | 最终答案内容   |
| `answer_end`      | 最终答案结束   |
| `conversation_id` | 会话 ID        |
| `stream_done`     | 流式响应完成   |

### 深度思考配置

```json
{
  "selfThinking": {
    "enabled": true,
    "maxIterations": 50,
    "includeThoughtsInResponse": true,
    "enableStreamThoughts": true,
    "systemPrompt": "你是一个专业助手",
    "additionalPrompts": [],
    "tools": []
  }
}
```

---

## 模型管理 API

### GET /api/llm/providers

获取所有 LLM 提供商列表。

#### 响应示例

```json
{
  "success": true,
  "providers": [
    {
      "id": 1,
      "provider": "openai",
      "name": "OpenAI",
      "description": "OpenAI GPT 系列模型",
      "enabled": true,
      "modelCount": 3,
      "baseConfig": {
        "baseURL": "https://api.openai.com/v1",
        "timeout": 60000,
        "maxRetries": 3
      },
      "createdAt": "2026-01-01T00:00:00Z",
      "updatedAt": "2026-01-10T00:00:00Z"
    }
  ]
}
```

---

### POST /api/llm/providers

创建新的 LLM 提供商。

#### 请求参数

| 参数名                  | 类型   | 必填 | 说明            |
| ----------------------- | ------ | ---- | --------------- |
| `provider`              | String | 是   | 提供商标识      |
| `name`                  | String | 是   | 提供商名称      |
| `description`           | String | 否   | 提供商描述      |
| `baseConfig`            | Object | 是   | 基础配置        |
| `baseConfig.apiKey`     | String | 是   | API Key         |
| `baseConfig.baseURL`    | String | 是   | API 基础 URL    |
| `baseConfig.timeout`    | Number | 否   | 超时时间 (毫秒) |
| `baseConfig.maxRetries` | Number | 否   | 最大重试次数    |

#### 请求示例

```bash
curl -X POST http://localhost:8088/api/llm/providers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "provider": "openai",
    "name": "OpenAI GPT-4",
    "description": "OpenAI GPT-4 模型",
    "baseConfig": {
      "apiKey": "sk-...",
      "baseURL": "https://api.openai.com/v1",
      "timeout": 60000,
      "maxRetries": 3
    }
  }'
```

---

### PUT /api/llm/providers/:id

更新提供商信息。

---

### DELETE /api/llm/providers/:id

删除提供商。

---

### GET /api/llm/providers/:providerId/models

获取指定提供商的所有模型。

#### 响应示例

```json
{
  "success": true,
  "provider": {
    "id": 1,
    "provider": "openai",
    "name": "OpenAI"
  },
  "models": [
    {
      "id": 1,
      "modelKey": "gpt-4",
      "modelName": "GPT-4",
      "modelType": "nlp",
      "enabled": true,
      "isDefault": true,
      "displayOrder": 1
    }
  ]
}
```

---

### POST /api/llm/providers/:providerId/models

创建新模型。

#### 请求参数

| 参数名        | 类型    | 必填 | 说明                            |
| ------------- | ------- | ---- | ------------------------------- |
| `modelKey`    | String  | 是   | 模型标识                        |
| `modelName`   | String  | 是   | 模型名称                        |
| `modelType`   | String  | 是   | 模型类型 (nlp/embedding/vision) |
| `modelConfig` | Object  | 否   | 模型特定配置                    |
| `enabled`     | Boolean | 否   | 是否启用                        |

---

### GET /api/llm/models

查询模型 (跨提供商)。

#### 查询参数

| 参数名    | 类型    | 说明                            |
| --------- | ------- | ------------------------------- |
| `type`    | String  | 模型类型 (nlp/embedding/vision) |
| `enabled` | Boolean | 是否启用                        |
| `default` | Boolean | 是否默认模型                    |

#### 请求示例

```bash
curl -X GET "http://localhost:8088/api/llm/models?type=nlp&enabled=true" \
  -H "Authorization: Bearer your_api_key"
```

---

### GET /api/llm/models/default

获取默认模型。

#### 查询参数

| 参数名 | 类型   | 必填 | 说明     |
| ------ | ------ | ---- | -------- |
| `type` | String | 是   | 模型类型 |

#### 请求示例

```bash
curl -X GET "http://localhost:8088/api/llm/models/default?type=nlp" \
  -H "Authorization: Bearer your_api_key"
```

---

### POST /api/llm/providers/test-connect

测试提供商连接。

#### 请求示例

```bash
curl -X POST http://localhost:8088/api/llm/providers/test-connect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "provider": "openai",
    "baseConfig": {
      "apiKey": "sk-...",
      "baseURL": "https://api.openai.com/v1"
    }
  }'
```

#### 响应示例

**成功:**

```json
{
  "success": true,
  "latency": 150,
  "message": "连接成功",
  "details": {
    "provider": "openai",
    "testedAt": "2026-01-10T00:00:00Z"
  }
}
```

---

### POST /api/llm/providers/validate-model

验证模型可用性。

#### 请求参数

| 参数名       | 类型   | 必填 | 说明       |
| ------------ | ------ | ---- | ---------- |
| `provider`   | String | 是   | 提供商标识 |
| `baseConfig` | Object | 是   | 基础配置   |
| `model`      | String | 是   | 模型 ID    |

---

## 技能 API

### GET /api/skills

列出所有技能。

#### 查询参数

| 参数名      | 类型   | 默认值 | 说明                  |
| ----------- | ------ | ------ | --------------------- |
| `page`      | Number | 1      | 页码                  |
| `limit`     | Number | 50     | 每页数量              |
| `name`      | String | -      | 按名称过滤            |
| `tags`      | String | -      | 按标签过滤 (逗号分隔) |
| `sortBy`    | String | name   | 排序字段              |
| `sortOrder` | String | asc    | 排序方向              |

#### 请求示例

```bash
curl -X GET "http://localhost:8088/api/skills?page=1&limit=20&tags=utility" \
  -H "Authorization: Bearer your_api_key"
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "skills": [
      {
        "name": "calculator",
        "description": "数学计算工具",
        "type": "tool",
        "tags": ["utility", "math"],
        "version": "1.0.0",
        "author": "ApexBridge",
        "enabled": true,
        "level": 1,
        "path": "/skills/calculator",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }
    ],
    "pagination": {
      "total": 50,
      "page": 1,
      "limit": 20,
      "totalPages": 3
    }
  }
}
```

---

### GET /api/skills/:name

获取单个技能详情。

#### 请求示例

```bash
curl -X GET http://localhost:8088/api/skills/calculator \
  -H "Authorization: Bearer your_api_key"
```

---

### POST /api/skills/install

安装技能 (ZIP 文件上传)。

#### 请求头

```
Content-Type: multipart/form-data
```

#### 请求参数

| 参数名              | 类型    | 说明               |
| ------------------- | ------- | ------------------ |
| `file`              | File    | ZIP 文件           |
| `overwrite`         | Boolean | 是否覆盖已存在技能 |
| `skipVectorization` | Boolean | 是否跳过向量化     |

#### 请求示例

```bash
curl -X POST http://localhost:8088/api/skills/install \
  -H "Authorization: Bearer your_api_key" \
  -F "file=@my-skill.zip" \
  -F "overwrite=true"
```

#### 响应示例

```json
{
  "success": true,
  "message": "Skill installed successfully",
  "skillName": "my-skill",
  "installedAt": "2026-01-10T00:00:00Z",
  "duration": 1500,
  "vectorized": true
}
```

---

### DELETE /api/skills/:name

卸载技能。

#### 请求示例

```bash
curl -X DELETE http://localhost:8088/api/skills/calculator \
  -H "Authorization: Bearer your_api_key"
```

---

### PUT /api/skills/:name/description

更新技能描述。

#### 请求体

```json
{
  "description": "新的技能描述"
}
```

---

### GET /api/skills/:name/exists

检查技能是否存在。

#### 响应示例

```json
{
  "success": true,
  "data": {
    "name": "calculator",
    "exists": true
  }
}
```

---

### GET /api/skills/stats

获取技能统计信息。

#### 响应示例

```json
{
  "success": true,
  "data": {
    "total": 50,
    "enabled": 45,
    "disabled": 5,
    "byType": {
      "tool": 30,
      "agent": 15,
      "utility": 5
    },
    "byTags": {}
  }
}
```

---

### POST /api/skills/reindex

重新索引所有技能。

---

## MCP API

### GET /api/mcp/servers

获取所有注册的 MCP 服务器列表。

#### 响应示例

```json
{
  "success": true,
  "data": [
    {
      "id": "server-1",
      "name": "Filesystem Server",
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
      "status": "running",
      "tools": [
        {
          "name": "read_file",
          "description": "Read file contents",
          "parameters": {
            "type": "object",
            "properties": {
              "path": { "type": "string" }
            },
            "required": ["path"]
          }
        }
      ]
    }
  ],
  "meta": {
    "total": 1,
    "timestamp": "2026-01-10T00:00:00Z"
  }
}
```

---

### POST /api/mcp/servers

注册新的 MCP 服务器。

#### 请求参数

| 参数名    | 类型   | 必填 | 说明                  |
| --------- | ------ | ---- | --------------------- |
| `id`      | String | 是   | 服务器 ID             |
| `type`    | String | 是   | 连接类型 (stdio/http) |
| `command` | String | 是   | 启动命令              |
| `args`    | Array  | 否   | 命令参数              |
| `env`     | Object | 否   | 环境变量              |

#### 请求示例

```bash
curl -X POST http://localhost:8088/api/mcp/servers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "id": "filesystem-server",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
  }'
```

---

### GET /api/mcp/servers/:serverId

获取特定 MCP 服务器详情。

---

### DELETE /api/mcp/servers/:serverId

注销 MCP 服务器。

---

### POST /api/mcp/servers/:serverId/restart

重启 MCP 服务器。

---

### GET /api/mcp/servers/:serverId/status

获取 MCP 服务器状态。

#### 响应示例

```json
{
  "success": true,
  "data": {
    "serverId": "filesystem-server",
    "status": {
      "state": "running",
      "uptime": 3600,
      "lastPing": "2026-01-10T00:00:00Z"
    }
  }
}
```

---

### GET /api/mcp/servers/:serverId/tools

获取 MCP 服务器的工具列表。

---

### POST /api/mcp/servers/:serverId/tools/:toolName/call

调用 MCP 工具。

#### 请求示例

```bash
curl -X POST http://localhost:8088/api/mcp/servers/filesystem-server/tools/read_file/call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "path": "/tmp/example.txt"
  }'
```

---

### POST /api/mcp/tools/call

调用 MCP 工具 (自动发现)。

#### 请求参数

| 参数名      | 类型   | 必填 | 说明     |
| ----------- | ------ | ---- | -------- |
| `toolName`  | String | 是   | 工具名称 |
| `arguments` | Object | 否   | 工具参数 |

---

### GET /api/mcp/statistics

获取 MCP 统计信息。

#### 响应示例

```json
{
  "success": true,
  "data": {
    "totalServers": 2,
    "runningServers": 2,
    "totalTools": 15,
    "callsTotal": 150,
    "callsSuccess": 148,
    "callsFailed": 2
  }
}
```

---

### GET /api/mcp/health

MCP 健康检查。

#### 响应示例

```json
{
  "success": true,
  "data": {
    "healthy": true,
    "servers": [
      {
        "id": "filesystem-server",
        "healthy": true,
        "latency": 5
      }
    ],
    "timestamp": "2026-01-10T00:00:00Z"
  }
}
```

---

## 会话 API

### GET /v1/chat/sessions/:conversationId

获取会话状态。

#### 响应示例

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "conversationId": "conv_1736486400_abc123",
    "status": "active",
    "messageCount": 10,
    "lastActivityAt": 1736486400000,
    "metadata": {
      "hasHistory": true
    }
  }
}
```

---

### GET /v1/chat/sessions/active

获取活动会话列表。

#### 响应示例

```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "sess_abc123",
        "conversationId": "conv_1736486400_abc123",
        "status": "active",
        "messageCount": 10,
        "lastActivityAt": 1736486400000,
        "lastMessage": "用户最后一条消息..."
      }
    ],
    "total": 1
  }
}
```

---

### GET /v1/chat/sessions/:conversationId/history

获取会话历史。

#### 查询参数

| 参数名  | 类型   | 默认值 | 说明                                      |
| ------- | ------ | ------ | ----------------------------------------- |
| `type`  | String | all    | 历史类型 (all/state/telemetry/directives) |
| `limit` | String | 100    | 限制数量                                  |

---

### GET /v1/chat/sessions/:conversationId/messages

获取对话消息历史。

#### 查询参数

| 参数名   | 类型   | 默认值 | 说明     |
| -------- | ------ | ------ | -------- |
| `limit`  | String | 100    | 限制数量 |
| `offset` | String | 0      | 偏移量   |

#### 响应示例

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg_1",
        "role": "user",
        "content": "你好",
        "created_at": 1736486400000
      }
    ],
    "total": 1,
    "limit": 100,
    "offset": 0
  }
}
```

---

### DELETE /v1/chat/sessions/:conversationId

删除会话。

---

## WebSocket API

### WS /chat

实时聊天 WebSocket 连接。

**连接 URL:**

```
ws://localhost:8088/chat/api_key=<your_api_key>
```

**或:**

```
ws://localhost:8088/v1/chat/api_key=<your_api_key>
```

### 客户端消息格式

```typescript
interface ChatMessage {
  type: "chat" | "stream_chat" | "stop";
  payload?: {
    messages?: Message[];
    options?: ChatOptions;
    requestId?: string;
  };
}
```

#### 发送普通聊天消息

```json
{
  "type": "chat",
  "payload": {
    "messages": [{ "role": "user", "content": "你好" }],
    "options": {
      "model": "gpt-4"
    }
  }
}
```

#### 发送流式聊天消息

```json
{
  "type": "stream_chat",
  "payload": {
    "messages": [{ "role": "user", "content": "写一个 Python 快速排序" }],
    "options": {
      "model": "gpt-4",
      "temperature": 0.7
    }
  }
}
```

#### 发送中断请求

```json
{
  "type": "stop"
}
```

### 服务器消息格式

```typescript
interface ChatResponse {
  type: "chat_response" | "stream_chunk" | "stream_done" | "error" | "status" | "meta_event";
  payload?: any;
  error?: string;
}
```

#### 响应示例

**普通响应:**

```json
{
  "type": "chat_response",
  "payload": {
    "id": "chatcmpl-1736486400",
    "content": "这是一个回复..."
  }
}
```

**流式响应:**

```json
{
  "type": "stream_chunk",
  "payload": {
    "id": "chatcmpl-1736486400",
    "delta": { "content": "这" },
    "finish_reason": null
  }
}
```

**元事件:**

```json
{
  "type": "meta_event",
  "payload": {
    "requestId": "conv_1736486400_abc123"
  }
}
```

**完成:**

```json
{
  "type": "stream_done"
}
```

**错误:**

```json
{
  "type": "error",
  "error": "Internal server error"
}
```

**状态:**

```json
{
  "type": "status",
  "payload": {
    "status": "interrupted",
    "success": true,
    "requestId": "conv_1736486400_abc123"
  }
}
```

### 心跳机制

WebSocket 连接每 30 秒发送一次心跳 (ping/pong)。无响应连接将被自动断开。

---

## 错误代码

### HTTP 状态码

| 状态码 | 说明           |
| ------ | -------------- |
| 200    | 成功           |
| 201    | 创建成功       |
| 400    | 请求参数错误   |
| 401    | 未授权         |
| 403    | 禁止访问       |
| 404    | 资源不存在     |
| 409    | 资源冲突       |
| 429    | 请求频率超限   |
| 500    | 服务器内部错误 |
| 503    | 服务不可用     |

### 错误响应格式

```json
{
  "error": {
    "message": "错误描述",
    "type": "error_type",
    "code": "ERROR_CODE"
  }
}
```

### 常见错误类型

| 类型                   | 说明           |
| ---------------------- | -------------- |
| `invalid_request`      | 请求参数无效   |
| `authentication_error` | 认证失败       |
| `permission_denied`    | 权限不足       |
| `not_found`            | 资源不存在     |
| `rate_limit_error`     | 超出频率限制   |
| `server_error`         | 服务器内部错误 |
| `service_unavailable`  | 服务不可用     |

### MCP 错误代码

| 代码                   | 说明               |
| ---------------------- | ------------------ |
| `GET_SERVERS_FAILED`   | 获取服务器列表失败 |
| `REGISTRATION_FAILED`  | 服务器注册失败     |
| `SERVER_NOT_FOUND`     | 服务器不存在       |
| `UNREGISTRATION_ERROR` | 服务器注销失败     |
| `RESTART_ERROR`        | 服务器重启失败     |
| `GET_STATUS_FAILED`    | 获取状态失败       |
| `GET_TOOLS_FAILED`     | 获取工具列表失败   |
| `TOOL_CALL_ERROR`      | 工具调用失败       |
| `HEALTH_CHECK_FAILED`  | 健康检查失败       |

### 技能错误代码

| 代码                      | 说明           |
| ------------------------- | -------------- |
| `SKILL_NOT_FOUND`         | 技能不存在     |
| `SKILL_ALREADY_EXISTS`    | 技能已存在     |
| `SKILL_INVALID_STRUCTURE` | 技能结构无效   |
| `VECTOR_DB_ERROR`         | 向量数据库错误 |

---

## 速率限制

| 端点类型 | 限制        |
| -------- | ----------- |
| 聊天完成 | 60 次/分钟  |
| 模型查询 | 120 次/分钟 |
| MCP API  | 120 次/分钟 |
| 技能管理 | 30 次/分钟  |

超过速率限制将返回 `429 Too Many Requests` 错误。

---

## 附录

### 支持的模型提供商

| 提供商           | 标识符     |
| ---------------- | ---------- |
| OpenAI           | `openai`   |
| Anthropic Claude | `claude`   |
| DeepSeek         | `deepseek` |
| Ollama           | `ollama`   |
| 智谱 AI          | `zhipu`    |
| 自定义           | `custom`   |

### 支持的模型类型

| 类型        | 说明             |
| ----------- | ---------------- |
| `nlp`       | 自然语言处理模型 |
| `embedding` | 向量嵌入模型     |
| `vision`    | 视觉模型         |

---

_文档最后更新: 2026-01-10_
