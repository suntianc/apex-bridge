# ApexBridge API 接口文档

> **版本**: v1.0.3  
> **最后更新**: 2025-01-XX  
> **基础URL**: `http://localhost:3000`（开发环境）

## 目录

- [快速开始](#快速开始)
- [认证](#认证)
- [聊天 API](#聊天-api)
- [会话管理 API](#会话管理-api)
- [模型管理 API](#模型管理-api)
- [提供商管理 API](#提供商管理-api)
- [系统 API](#系统-api)
- [错误处理](#错误处理)
- [示例代码](#示例代码)
- [注意事项](#注意事项)
- [更新日志](#更新日志)
- [附录](#附录)

---

## 快速开始

### 基础请求示例

```bash
# 1. 健康检查（无需认证）
curl http://localhost:3000/health

# 2. 创建聊天请求
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}],
    "model": "gpt-4"
  }'
```

### 参数格式说明

**推荐使用 `snake_case` 格式**（与 OpenAI 标准一致）：

```json
{
  "user": "user-123",              // ✅ OpenAI 标准参数
  "agent_id": "apex-bridge-001",   // ✅ 推荐格式
  "conversation_id": "conv-456"     // ✅ 推荐格式
}
```

**向后兼容格式**（不推荐同时使用）：

```json
{
  "userId": "user-123",            // ⚠️ 支持但不推荐
  "agentId": "apex-bridge-001",    // ⚠️ 支持但不推荐
  "conversationId": "conv-456",    // ⚠️ 支持但不推荐
  "apexMeta": {                    // ⚠️ 支持但不推荐
    "userId": "user-123",
    "agentId": "apex-bridge-001",
    "conversationId": "conv-456"
  }
}
```

**参数优先级**：
- `user_id` > `userId` > `apexMeta.userId` > `user`
- `conversation_id` > `conversationId` > `apexMeta.conversationId`
- `agent_id` > `agentId` > `apexMeta.agentId`

---

## 认证

所有 API 请求（除了 `/health` 和静态资源）都需要在请求头中包含 API Key：

```
Authorization: Bearer <your-api-key>
```

API Key 在配置文件中设置，可通过管理面板配置。

---

## 聊天 API

### 1. 创建聊天完成请求

**POST** `/v1/chat/completions`

OpenAI 兼容的聊天 API，支持流式和非流式响应。

#### 请求头

```
Content-Type: application/json
Authorization: Bearer <your-api-key>
```

#### 请求体

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "model": "gpt-4",
  "temperature": 0.7,
  "max_tokens": 1000,
  "top_p": 1.0,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0,
  "stop": ["\n\n"],
  "n": 1,
  "stream": false,
  "user": "user-123",
  "top_k": 40,
  "provider": "openai",
  "agent_id": "apex-bridge-001",
  "conversation_id": "conv-456"
}
```

**💡 参数格式提示**: 
- 推荐使用 `snake_case` 格式（`agent_id`, `conversation_id`, `user_id`）
- 系统支持多种格式，但建议统一使用一种格式以避免混淆
- 参数优先级说明见[快速开始](#快速开始)章节

#### 请求参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | `Message[]` | ✅ | 消息数组，每个消息包含 `role` 和 `content` |
| `model` | `string` | ❌ | 模型名称，如 `gpt-4`、`deepseek-chat` |
| `temperature` | `number` | ❌ | 温度参数，范围 0-2，默认 1.0 |
| `max_tokens` | `number` | ❌ | 最大生成 token 数 |
| `top_p` | `number` | ❌ | 核采样参数，范围 0-1 |
| `frequency_penalty` | `number` | ❌ | 频率惩罚，范围 -2.0 到 2.0 |
| `presence_penalty` | `number` | ❌ | 存在惩罚，范围 -2.0 到 2.0 |
| `stop` | `string[]` | ❌ | 停止序列数组 |
| `n` | `number` | ❌ | 生成多少个响应（通常为 1） |
| `stream` | `boolean` | ❌ | 是否使用流式响应，默认 `false` |
| `user` | `string` | ❌ | 用户标识符（OpenAI 标准参数，也可作为 userId 的最后备选） |
| `top_k` | `number` | ❌ | Top-K 采样参数 |
| `provider` | `string` | ❌ | 指定提供商（openai, deepseek, zhipu, claude, ollama） |
| `agent_id` | `string` | ❌ | Agent ID，用于指定人格（**推荐**，优先级：`agent_id` > `agentId` > `apexMeta.agentId`） |
| `user_id` | `string` | ❌ | 用户 ID，用于记忆命名空间（**推荐**，优先级：`user_id` > `userId` > `apexMeta.userId` > `user`） |
| `conversation_id` | `string` | ❌ | 对话 ID，用于会话隔离（**推荐**，优先级：`conversation_id` > `conversationId` > `apexMeta.conversationId`） |

#### 非流式响应

**状态码**: `200 OK`

```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1699123456,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! I'm doing well, thank you for asking. How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 20,
    "total_tokens": 35
  }
}
```

#### 流式响应

**状态码**: `200 OK`  
**Content-Type**: `text/event-stream`

```
data: {"id":"chatcmpl-1234567890","object":"chat.completion.chunk","created":1699123456,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-1234567890","object":"chat.completion.chunk","created":1699123456,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: [DONE]
```

#### 错误响应

**状态码**: `400 Bad Request`

```json
{
  "error": {
    "message": "Invalid request parameters",
    "type": "invalid_request"
  }
}
```

**状态码**: `500 Internal Server Error`

```json
{
  "error": {
    "message": "Internal server error",
    "type": "server_error"
  }
}
```

---

### 2. 获取模型列表

**GET** `/v1/models`

获取所有可用的模型列表（OpenAI 兼容格式）。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 响应

**状态码**: `200 OK`

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4",
      "object": "model",
      "owned_by": "openai",
      "created": 1699123456
    },
    {
      "id": "deepseek-chat",
      "object": "model",
      "owned_by": "deepseek",
      "created": 1699123456
    }
  ]
}
```

#### 错误响应

**状态码**: `503 Service Unavailable`

```json
{
  "error": {
    "message": "LLMClient not available. Please configure LLM providers in admin panel.",
    "type": "service_unavailable"
  }
}
```

---

### 3. 中断请求

**POST** `/v1/interrupt`

中断正在进行的聊天请求。

#### 请求头

```
Content-Type: application/json
Authorization: Bearer <your-api-key>
```

#### 请求体

```json
{
  "requestId": "req-1234567890"
}
```

#### 请求参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `requestId` | `string` | ✅ | 要中断的请求 ID |

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "message": "Request interrupted successfully",
  "requestId": "req-1234567890",
  "interrupted": true
}
```

#### 错误响应

**状态码**: `400 Bad Request`

```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Missing or invalid requestId"
}
```

**状态码**: `404 Not Found`

```json
{
  "success": false,
  "message": "Request not found or already completed",
  "requestId": "req-1234567890",
  "reason": "not_found"
}
```

---

## 会话管理 API

### 1. 获取会话状态

**GET** `/v1/chat/sessions/:conversationId`

获取指定会话的状态信息。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `conversationId` | `string` | ✅ | 对话 ID |

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "data": {
    "sessionId": "session-123",
    "status": "active",
    "createdAt": 1699123456000,
    "lastActivityAt": 1699123500000,
    "activeGoals": [],
    "reflectionCount": 0,
    "lastReflectionTime": 0,
    "lastReflectionDataHash": "",
    "metadata": {
      "lastMessageAt": 1699123500000,
      "messageCount": 5,
      "totalTokens": 1500,
      "totalInputTokens": 800,
      "totalOutputTokens": 700
    }
  }
}
```

#### 错误响应

**状态码**: `404 Not Found`

```json
{
  "error": {
    "message": "Session not found",
    "type": "not_found"
  }
}
```

---

### 2. 删除会话

**DELETE** `/v1/chat/sessions/:conversationId`

删除指定会话（归档会话）。**删除会话时，对应的对话消息历史也会被自动删除**。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `conversationId` | `string` | ✅ | 对话 ID |

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "message": "Session deleted successfully"
}
```

**注意**: 删除会话时，系统会：
1. 归档 ACE Engine 会话（将状态设置为 `archived`）
2. **自动删除所有关联的对话消息历史**
3. 清理会话相关的内存映射

#### 错误响应

**状态码**: `400 Bad Request`

```json
{
  "error": {
    "message": "conversationId is required",
    "type": "invalid_request"
  }
}
```

---

### 3. 获取活动会话列表

**GET** `/v1/chat/sessions/active`

获取活动会话列表。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `cutoffTime` | `number` | ❌ | 截止时间戳（毫秒），默认：当前时间 - 1小时 |

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "session-123",
        "status": "active",
        "createdAt": 1699123456000,
        "lastActivityAt": 1699123500000,
        "activeGoals": [],
        "reflectionCount": 0,
        "metadata": {}
      }
    ],
    "total": 1,
    "cutoffTime": 1699120000000
  }
}
```

#### 错误响应

**状态码**: `503 Service Unavailable`

```json
{
  "error": {
    "message": "ACE Engine not initialized",
    "type": "service_unavailable"
  }
}
```

---

### 4. 获取会话历史（ACE Engine 内部日志）

**GET** `/v1/chat/sessions/:conversationId/history`

获取会话的 ACE Engine 内部执行历史（状态、遥测日志、指令日志）。

> **注意**: 此接口返回的是 **ACE Engine 的内部执行日志**，不是用户对话消息。如需获取用户对话消息，请使用 [`GET /v1/chat/sessions/:conversationId/messages`](#5-获取对话消息历史)。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `conversationId` | `string` | ✅ | 对话 ID |

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `string` | ❌ | 历史类型：`all`（默认）、`state`、`telemetry`、`directives` |
| `limit` | `number` | ❌ | 限制返回数量，默认 100 |

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "data": {
    "sessionState": {
      "sessionId": "session-123",
      "status": "active",
      "createdAt": 1699123456000,
      "lastActivityAt": 1699123500000
    },
    "telemetry": [
      {
        "ts": "2024-01-01T12:00:00Z",
        "trace_id": "trace-123",
        "source": "TASK_PROSECUTION",
        "summary": "Task completed successfully",
        "embedding_id": null,
        "session_id": "session-123"
      }
    ],
    "directives": [
      {
        "ts": "2024-01-01T12:00:00Z",
        "trace_id": "trace-123",
        "source": "GLOBAL_STRATEGY",
        "command": "Execute task",
        "status": "PENDING",
        "session_id": "session-123"
      }
    ]
  }
}
```

#### 错误响应

**状态码**: `404 Not Found`

```json
{
  "error": {
    "message": "Session not found",
    "type": "not_found"
  }
}
```

---

### 5. 获取对话消息历史

**GET** `/v1/chat/sessions/:conversationId/messages`

获取对话的用户消息历史（用户与 AI 的对话记录）。

> **注意**: 此接口返回的是**用户对话消息**（messages），与 `/v1/chat/sessions/:conversationId/history` 不同，后者返回的是 ACE Engine 的内部执行日志。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `conversationId` | `string` | ✅ | 对话 ID |

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `limit` | `number` | ❌ | 限制返回数量，默认 100 |
| `offset` | `number` | ❌ | 偏移量，默认 0 |

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": 1,
        "conversation_id": "session-123",
        "role": "user",
        "content": "你好",
        "created_at": 1699123456000,
        "metadata": null
      },
      {
        "id": 2,
        "conversation_id": "session-123",
        "role": "assistant",
        "content": "你好！有什么可以帮助你的吗？",
        "created_at": 1699123457000,
        "metadata": null
      },
      {
        "id": 3,
        "conversation_id": "session-123",
        "role": "user",
        "content": "介绍一下你自己",
        "created_at": 1699123458000,
        "metadata": null
      }
    ],
    "total": 3,
    "limit": 100,
    "offset": 0
  }
}
```

#### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `messages` | `array` | 消息列表，按时间顺序排列 |
| `messages[].id` | `number` | 消息 ID |
| `messages[].conversation_id` | `string` | 对话 ID |
| `messages[].role` | `string` | 消息角色：`user`、`assistant`、`system` |
| `messages[].content` | `string` | 消息内容 |
| `messages[].created_at` | `number` | 创建时间戳（毫秒） |
| `messages[].metadata` | `string \| null` | 元数据（JSON 字符串，可选） |
| `total` | `number` | 消息总数 |
| `limit` | `number` | 本次查询的限制数量 |
| `offset` | `number` | 本次查询的偏移量 |

#### 错误响应

**状态码**: `404 Not Found`

```json
{
  "error": {
    "message": "Session not found",
    "type": "not_found"
  }
}
```

**状态码**: `500 Internal Server Error`

```json
{
  "error": {
    "message": "Internal server error",
    "type": "server_error"
  }
}
```

#### 使用示例

```bash
# 获取对话消息历史（前 50 条）
curl -X GET "http://localhost:3000/v1/chat/sessions/session-123/messages?limit=50&offset=0" \
  -H "Authorization: Bearer your-api-key"

# 分页获取（第 2 页，每页 20 条）
curl -X GET "http://localhost:3000/v1/chat/sessions/session-123/messages?limit=20&offset=20" \
  -H "Authorization: Bearer your-api-key"
```

#### 注意事项

1. **消息自动保存**: 每次聊天请求时，系统会自动保存用户消息和 AI 回复到消息历史中
2. **删除会话**: 当调用 `DELETE /v1/chat/sessions/:conversationId` 删除会话时，对应的消息历史也会被自动删除
3. **分页查询**: 使用 `limit` 和 `offset` 参数可以实现分页查询，避免一次性加载过多消息
4. **消息顺序**: 消息按 `created_at` 升序排列，最早的消息在前

---

## 模型管理 API

### 1. 查询模型（跨提供商）

**GET** `/api/llm/models`

查询所有模型，支持按类型、启用状态、默认状态过滤。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `string` | ❌ | 模型类型：`nlp`、`embedding`、`rerank`、`image`、`audio` |
| `enabled` | `boolean` | ❌ | 是否启用（`true`/`false`/`1`/`0`） |
| `default` | `boolean` | ❌ | 是否为默认模型（`true`/`false`/`1`/`0`） |

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "count": 2,
  "models": [
    {
      "id": 1,
      "providerId": 1,
      "provider": "openai",
      "providerName": "OpenAI",
      "modelKey": "gpt-4",
      "modelName": "GPT-4",
      "modelType": "nlp",
      "apiEndpointSuffix": "/chat/completions",
      "enabled": true,
      "isDefault": true,
      "displayOrder": 0
    }
  ]
}
```

#### 错误响应

**状态码**: `400 Bad Request`

```json
{
  "error": "Invalid model type",
  "message": "Model type must be one of: nlp, embedding, rerank, image, audio"
}
```

---

### 2. 获取默认模型

**GET** `/api/llm/models/default`

获取指定类型的默认模型。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `string` | ✅ | 模型类型：`nlp`、`embedding`、`rerank`、`image`、`audio` |

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "model": {
    "id": 1,
    "providerId": 1,
    "provider": "openai",
    "providerName": "OpenAI",
    "modelKey": "gpt-4",
    "modelName": "GPT-4",
    "modelType": "nlp",
    "modelConfig": {},
    "apiEndpointSuffix": "/chat/completions",
    "baseConfig": {
      "baseURL": "https://api.openai.com/v1",
      "timeout": 30000,
      "maxRetries": 3
    }
  }
}
```

#### 错误响应

**状态码**: `404 Not Found`

```json
{
  "error": "No default model found",
  "message": "No default model configured for type: nlp"
}
```

---

### 3. 列出提供商的所有模型

**GET** `/api/llm/providers/:providerId/models`

获取指定提供商的所有模型。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `providerId` | `number` | ✅ | 提供商 ID |

#### 成功响应

**状态码**: `200 OK`

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
      "apiEndpointSuffix": "/chat/completions",
      "enabled": true,
      "isDefault": true,
      "displayOrder": 0,
      "createdAt": 1699123456000,
      "updatedAt": 1699123456000
    }
  ]
}
```

---

### 4. 获取模型详情

**GET** `/api/llm/providers/:providerId/models/:modelId`

获取指定模型的详细信息。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `providerId` | `number` | ✅ | 提供商 ID |
| `modelId` | `number` | ✅ | 模型 ID |

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "model": {
    "id": 1,
    "providerId": 1,
    "provider": "openai",
    "providerName": "OpenAI",
    "modelKey": "gpt-4",
    "modelName": "GPT-4",
    "modelType": "nlp",
    "modelConfig": {},
    "apiEndpointSuffix": "/chat/completions",
    "enabled": true,
    "isDefault": true,
    "displayOrder": 0,
    "createdAt": 1699123456000,
    "updatedAt": 1699123456000
  }
}
```

---

### 5. 创建模型

**POST** `/api/llm/providers/:providerId/models`

为指定提供商创建新模型。

#### 请求头

```
Content-Type: application/json
Authorization: Bearer <your-api-key>
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `providerId` | `number` | ✅ | 提供商 ID |

#### 请求体

```json
{
  "modelKey": "gpt-4-turbo",
  "modelName": "GPT-4 Turbo",
  "modelType": "nlp",
  "modelConfig": {},
  "apiEndpointSuffix": "/chat/completions",
  "enabled": true,
  "isDefault": false,
  "displayOrder": 1
}
```

#### 请求参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `modelKey` | `string` | ✅ | 模型键（用于 API 调用） |
| `modelName` | `string` | ✅ | 模型显示名称 |
| `modelType` | `string` | ✅ | 模型类型：`nlp`、`embedding`、`rerank`、`image`、`audio` |
| `modelConfig` | `object` | ❌ | 模型特定配置 |
| `apiEndpointSuffix` | `string` | ❌ | API 端点后缀 |
| `enabled` | `boolean` | ❌ | 是否启用，默认 `true` |
| `isDefault` | `boolean` | ❌ | 是否为默认模型，默认 `false` |
| `displayOrder` | `number` | ❌ | 显示顺序，默认 0 |

#### 成功响应

**状态码**: `201 Created`

```json
{
  "success": true,
  "message": "Model created successfully",
  "model": {
    "id": 2,
    "providerId": 1,
    "modelKey": "gpt-4-turbo",
    "modelName": "GPT-4 Turbo",
    "modelType": "nlp",
    "enabled": true,
    "isDefault": false,
    "createdAt": 1699123456000,
    "updatedAt": 1699123456000
  }
}
```

---

### 6. 更新模型

**PUT** `/api/llm/providers/:providerId/models/:modelId`

更新指定模型的信息。

#### 请求头

```
Content-Type: application/json
Authorization: Bearer <your-api-key>
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `providerId` | `number` | ✅ | 提供商 ID |
| `modelId` | `number` | ✅ | 模型 ID |

#### 请求体

```json
{
  "modelName": "GPT-4 Turbo (Updated)",
  "enabled": false,
  "isDefault": true
}
```

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "message": "Model updated successfully",
  "model": {
    "id": 2,
    "providerId": 1,
    "modelKey": "gpt-4-turbo",
    "modelName": "GPT-4 Turbo (Updated)",
    "modelType": "nlp",
    "enabled": false,
    "isDefault": true,
    "updatedAt": 1699123500000
  }
}
```

---

### 7. 删除模型

**DELETE** `/api/llm/providers/:providerId/models/:modelId`

删除指定模型。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `providerId` | `number` | ✅ | 提供商 ID |
| `modelId` | `number` | ✅ | 模型 ID |

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "message": "Model deleted successfully"
}
```

---

## 提供商管理 API

### 1. 列出所有提供商

**GET** `/api/llm/providers`

获取所有 LLM 提供商的列表。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "providers": [
    {
      "id": 1,
      "provider": "openai",
      "name": "OpenAI",
      "description": "OpenAI API Provider",
      "enabled": true,
      "modelCount": 3,
      "baseConfig": {
        "baseURL": "https://api.openai.com/v1",
        "timeout": 30000,
        "maxRetries": 3
      },
      "createdAt": 1699123456000,
      "updatedAt": 1699123456000
    }
  ]
}
```

**注意**: 响应中的 `baseConfig` 不包含 `apiKey`，已自动脱敏。

---

### 2. 获取提供商详情

**GET** `/api/llm/providers/:id`

获取指定提供商的详细信息。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `number` | ✅ | 提供商 ID |

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "provider": {
    "id": 1,
    "provider": "openai",
    "name": "OpenAI",
    "description": "OpenAI API Provider",
    "enabled": true,
    "modelCount": 3,
    "baseConfig": {
      "baseURL": "https://api.openai.com/v1",
      "timeout": 30000,
      "maxRetries": 3
    },
    "createdAt": 1699123456000,
    "updatedAt": 1699123456000
  }
}
```

#### 错误响应

**状态码**: `404 Not Found`

```json
{
  "error": "Provider not found",
  "message": "Provider with id 999 not found"
}
```

---

### 3. 创建提供商

**POST** `/api/llm/providers`

创建新的 LLM 提供商。

#### 请求头

```
Content-Type: application/json
Authorization: Bearer <your-api-key>
```

#### 请求体

```json
{
  "provider": "openai",
  "name": "OpenAI",
  "description": "OpenAI API Provider",
  "enabled": true,
  "baseConfig": {
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "sk-...",
    "timeout": 30000,
    "maxRetries": 3
  }
}
```

#### 请求参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `provider` | `string` | ✅ | 提供商标识符（openai, deepseek, zhipu, claude, ollama, custom） |
| `name` | `string` | ✅ | 提供商显示名称 |
| `description` | `string` | ❌ | 提供商描述 |
| `enabled` | `boolean` | ❌ | 是否启用，默认 `true` |
| `baseConfig` | `object` | ✅ | 基础配置 |
| `baseConfig.baseURL` | `string` | ✅ | API 基础 URL |
| `baseConfig.apiKey` | `string` | ✅ | API 密钥 |
| `baseConfig.timeout` | `number` | ❌ | 超时时间（毫秒），默认 30000 |
| `baseConfig.maxRetries` | `number` | ❌ | 最大重试次数，默认 3 |

#### 成功响应

**状态码**: `201 Created`

```json
{
  "success": true,
  "message": "Provider created successfully",
  "provider": {
    "id": 1,
    "provider": "openai",
    "name": "OpenAI",
    "description": "OpenAI API Provider",
    "enabled": true,
    "modelCount": 0,
    "baseConfig": {
      "baseURL": "https://api.openai.com/v1",
      "timeout": 30000,
      "maxRetries": 3
    },
    "createdAt": 1699123456000,
    "updatedAt": 1699123456000
  }
}
```

**注意**: 响应中的 `baseConfig` 不包含 `apiKey`，已自动脱敏。

---

### 4. 更新提供商

**PUT** `/api/llm/providers/:id`

更新指定提供商的信息。

#### 请求头

```
Content-Type: application/json
Authorization: Bearer <your-api-key>
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `number` | ✅ | 提供商 ID |

#### 请求体

```json
{
  "name": "OpenAI (Updated)",
  "description": "Updated description",
  "enabled": false,
  "baseConfig": {
    "timeout": 60000,
    "maxRetries": 5
  }
}
```

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "message": "Provider updated successfully",
  "provider": {
    "id": 1,
    "provider": "openai",
    "name": "OpenAI (Updated)",
    "description": "Updated description",
    "enabled": false,
    "modelCount": 3,
    "baseConfig": {
      "baseURL": "https://api.openai.com/v1",
      "timeout": 60000,
      "maxRetries": 5
    },
    "createdAt": 1699123456000,
    "updatedAt": 1699123500000
  }
}
```

---

### 5. 删除提供商

**DELETE** `/api/llm/providers/:id`

删除指定提供商及其所有关联模型。

#### 请求头

```
Authorization: Bearer <your-api-key>
```

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `number` | ✅ | 提供商 ID |

#### 成功响应

**状态码**: `200 OK`

```json
{
  "success": true,
  "message": "Provider and associated models deleted successfully"
}
```

#### 错误响应

**状态码**: `404 Not Found`

```json
{
  "error": "Resource not found",
  "message": "Provider with id 999 not found"
}
```

---

## 系统 API

### 1. 健康检查

**GET** `/health`

检查服务健康状态（无需认证）。

#### 响应

**状态码**: `200 OK`

```json
{
  "status": "ok",
  "timestamp": 1699123456000
}
```

---

## 错误处理

### 错误响应格式

所有错误响应都遵循以下格式：

```json
{
  "error": {
    "message": "Error description",
    "type": "error_type"
  }
}
```

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| `200` | 成功 |
| `201` | 创建成功 |
| `400` | 请求参数错误 |
| `401` | 未授权（缺少或无效的 API Key） |
| `404` | 资源不存在 |
| `409` | 资源冲突（如已存在） |
| `500` | 服务器内部错误 |
| `503` | 服务不可用 |

### 错误类型

| 错误类型 | 说明 |
|----------|------|
| `authentication_error` | 认证错误 |
| `invalid_request` | 请求参数无效 |
| `not_found` | 资源不存在 |
| `server_error` | 服务器内部错误 |
| `service_unavailable` | 服务不可用 |

---

## 示例代码

### cURL 示例

#### 创建聊天请求（非流式）

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "model": "gpt-4",
    "temperature": 0.7,
    "user": "user-123",
    "agent_id": "apex-bridge-001",
    "conversation_id": "conv-456"
  }'
```

#### 创建聊天请求（流式）

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "model": "gpt-4",
    "stream": true,
    "user": "user-123",
    "agent_id": "apex-bridge-001",
    "conversation_id": "conv-456"
  }'
```

#### 获取模型列表

```bash
curl -X GET http://localhost:3000/v1/models \
  -H "Authorization: Bearer your-api-key"
```

#### 获取对话消息历史

```bash
# 获取对话消息历史（前 50 条）
curl -X GET "http://localhost:3000/v1/chat/sessions/session-123/messages?limit=50&offset=0" \
  -H "Authorization: Bearer your-api-key"

# 分页获取（第 2 页，每页 20 条）
curl -X GET "http://localhost:3000/v1/chat/sessions/session-123/messages?limit=20&offset=20" \
  -H "Authorization: Bearer your-api-key"
```

#### 创建提供商

```bash
curl -X POST http://localhost:3000/api/llm/providers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "provider": "openai",
    "name": "OpenAI",
    "baseConfig": {
      "baseURL": "https://api.openai.com/v1",
      "apiKey": "sk-...",
      "timeout": 30000
    }
  }'
```

### JavaScript/TypeScript 示例

```typescript
// 使用 fetch API
const response = await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-api-key'
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'Hello!' }
    ],
    model: 'gpt-4',
    temperature: 0.7,
    user: 'user-123',
    agent_id: 'apex-bridge-001',
    conversation_id: 'conv-456'
  })
});

const data = await response.json();
console.log(data);
```

### Python 示例

```python
import requests

url = "http://localhost:3000/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer your-api-key"
}
data = {
    "messages": [
        {"role": "user", "content": "Hello!"}
    ],
    "model": "gpt-4",
    "temperature": 0.7,
    "user": "user-123",
    "agent_id": "apex-bridge-001",
    "conversation_id": "conv-456"
}

response = requests.post(url, json=data, headers=headers)
print(response.json())
```

---

## 注意事项

1. **API Key 安全**: 所有 API Key 在响应中都会被自动脱敏，不会返回给客户端。

2. **流式响应**: 流式响应使用 Server-Sent Events (SSE) 格式，客户端需要正确处理 `text/event-stream` 内容类型。

3. **会话隔离**: 使用 `conversation_id` 可以实现会话级别的隔离，每个对话都有独立的上下文和反思策略。

4. **参数格式建议**: 
   - **推荐使用 `snake_case` 格式**（与 OpenAI 标准一致）：
     - `user_id`（而非 `userId`）
     - `conversation_id`（而非 `conversationId`）
     - `agent_id`（而非 `agentId`）
   - **参数优先级**（向后兼容，但建议统一格式）：
     - `user_id` > `userId` > `apexMeta.userId` > `user`
     - `conversation_id` > `conversationId` > `apexMeta.conversationId`
     - `agent_id` > `agentId` > `apexMeta.agentId`
   - **避免同时提供多种格式**，以减少请求体大小和避免混淆

5. **模型类型**: 支持的模型类型包括：
   - `nlp`: 自然语言处理模型
   - `embedding`: 嵌入模型
   - `rerank`: 重排序模型
   - `image`: 图像生成模型
   - `audio`: 音频处理模型

6. **提供商支持**: 当前支持的提供商包括：
   - `openai`: OpenAI
   - `deepseek`: DeepSeek
   - `zhipu`: 智谱 AI
   - `claude`: Anthropic Claude
   - `ollama`: Ollama（本地模型）
   - `custom`: 自定义提供商

---

## 更新日志

- **v1.0.3**: 添加对话消息历史 API（`GET /v1/chat/sessions/:conversationId/messages`），支持查询和删除对话消息
- **v1.0.2**: 优化参数格式，推荐使用 `snake_case`，移除冗余参数，完善文档
- **v1.0.1**: 添加会话管理 API
- **v1.0.0**: 初始版本，支持基础聊天和模型管理功能

---

## 附录

### A. 参数格式对比表

| 功能 | 推荐格式 | 兼容格式 | 优先级 |
|------|---------|---------|--------|
| 用户标识 | `user` 或 `user_id` | `userId`, `apexMeta.userId` | `user_id` > `userId` > `apexMeta.userId` > `user` |
| 对话ID | `conversation_id` | `conversationId`, `apexMeta.conversationId` | `conversation_id` > `conversationId` > `apexMeta.conversationId` |
| Agent ID | `agent_id` | `agentId`, `apexMeta.agentId` | `agent_id` > `agentId` > `apexMeta.agentId` |

### B. 常见问题

**Q: 为什么推荐使用 `snake_case`？**  
A: 与 OpenAI API 标准保持一致，减少学习成本，避免参数混淆。

**Q: 如果同时提供多种格式会怎样？**  
A: 系统会按照优先级选择第一个匹配的参数，其他参数会被忽略。建议只使用一种格式。

**Q: `user` 和 `user_id` 有什么区别？**  
A: `user` 是 OpenAI 标准参数，主要用于标识用户；`user_id` 是 ApexBridge 扩展参数，用于记忆命名空间。如果只提供 `user`，它也会被用作 `user_id`。

**Q: 会话隔离是如何工作的？**  
A: 每个 `conversation_id` 对应一个独立的 ACE 会话，拥有独立的上下文、反思策略和记忆。不同对话之间的数据完全隔离。

**Q: 如何获取请求 ID？**  
A: 在流式响应中，第一个数据包会包含 `requestId` 元数据。非流式响应中，`id` 字段即为请求 ID。

**Q: 如何中断正在进行的请求？**  
A: 使用 `POST /v1/interrupt` 接口，传入 `requestId` 即可中断请求。

**Q: `/v1/chat/sessions/:conversationId/history` 和 `/v1/chat/sessions/:conversationId/messages` 有什么区别？**  
A: 
- `/history` 返回的是 **ACE Engine 的内部执行日志**（遥测日志、指令日志、会话状态），用于调试和监控
- `/messages` 返回的是 **用户对话消息**（用户和 AI 的对话记录），用于前端展示对话历史

**Q: 删除会话时，消息历史会被删除吗？**  
A: 是的。调用 `DELETE /v1/chat/sessions/:conversationId` 删除会话时，系统会自动删除所有关联的对话消息历史，确保数据一致性。

### C. 最佳实践

1. **统一参数格式**: 在整个应用中统一使用 `snake_case` 格式
2. **避免冗余**: 不要同时提供多种格式的相同参数
3. **会话管理**: 为每个用户对话使用唯一的 `conversation_id`
4. **错误处理**: 始终检查响应中的 `error` 字段
5. **流式响应**: 使用 SSE 客户端正确处理流式响应
6. **API Key 安全**: 不要在客户端代码中硬编码 API Key，使用环境变量或配置管理
7. **重试策略**: 对于临时错误（5xx），实现指数退避重试机制

### D. 速率限制

当前版本未实现全局速率限制，但建议客户端实现以下策略：

- **请求频率**: 建议不超过 10 请求/秒
- **并发请求**: 建议不超过 5 个并发请求
- **重试间隔**: 失败重试时使用指数退避（1s, 2s, 4s, 8s...）

### E. 性能优化建议

1. **使用流式响应**: 对于长文本生成，使用 `stream: true` 可以更快获得首字
2. **合理设置 `max_tokens`**: 根据实际需求设置，避免生成过长内容
3. **会话复用**: 在同一对话中复用 `conversation_id`，避免创建过多会话
4. **批量操作**: 对于模型和提供商管理，尽量批量操作而非逐个操作

