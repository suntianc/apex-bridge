# ApexBridge API Reference

**Generated:** 2026-01-11  
**Version:** 2.0.0

ApexBridge provides a comprehensive REST API for managing AI agents, models, skills, and MCP servers.

---

## Table of Contents

1. [Chat API](#chat-api) - OpenAI-compatible chat completions
2. [Models API](#models-api) - Model management
3. [Providers API](#providers-api) - LLM provider management
4. [Skills API](#skills-api) - Skill management
5. [MCP API](#mcp-api) - MCP server management
6. [WebSocket API](#websocket-api) - Real-time communication
7. [System API](#system-api) - Health checks and monitoring

---

## Base URL

```
http://localhost:12345
```

All API responses follow a consistent format:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-01-11T15:45:30.000Z"
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  }
}
```

---

## Chat API

OpenAI-compatible chat completions API with streaming support.

### POST /v1/chat/completions

Create a chat completion request.

**Method:** `POST`  
**Path:** `/v1/chat/completions`  
**File:** `src/api/controllers/ChatController.ts` (line 31)

**Request Body:**

```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello, world!" }
  ],
  "model": "gpt-4",
  "stream": false,
  "max_tokens": 1000,
  "temperature": 0.7,
  "contextCompression": {
    "enabled": true,
    "strategy": "hybrid",
    "auto": true
  }
}
```

**Parameters:**

| Parameter            | Type    | Required | Description                                      |
| -------------------- | ------- | -------- | ------------------------------------------------ |
| `messages`           | Array   | Yes      | Array of message objects with role and content   |
| `model`              | String  | No       | Model ID to use (defaults to configured default) |
| `stream`             | Boolean | No       | Enable streaming response (default: false)       |
| `max_tokens`         | Integer | No       | Maximum tokens to generate                       |
| `temperature`        | Number  | No       | Temperature for random sampling (0-2)            |
| `contextCompression` | Object  | No       | Context compression settings                     |

**Context Compression Options:**

| Option                  | Type    | Description                                    |
| ----------------------- | ------- | ---------------------------------------------- |
| `enabled`               | Boolean | Enable 4-layer context compression             |
| `strategy`              | String  | `truncate` \| `prune` \| `summary` \| `hybrid` |
| `auto`                  | Boolean | Auto-detect context overflow                   |
| `preserveSystemMessage` | Boolean | Keep system message intact                     |

**Response (non-streaming):**

```json
{
  "id": "chatcmpl-1704997530123",
  "object": "chat.completion",
  "created": 1704997530,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 15,
    "total_tokens": 40
  }
}
```

---

### GET /v1/chat/sessions/active

Get list of active chat sessions.

**Method:** `GET`  
**Path:** `/v1/chat/sessions/active`  
**File:** `src/server.ts` (line 292)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "conversationId": "conv_123456",
      "model": "gpt-4",
      "createdAt": "2026-01-11T10:00:00Z",
      "messageCount": 15
    }
  ],
  "meta": {
    "total": 1,
    "timestamp": "2026-01-11T15:45:30.000Z"
  }
}
```

---

### GET /v1/chat/sessions/:conversationId/history

Get session history (ACE Engine internal logs).

**Method:** `GET`  
**Path:** `/v1/chat/sessions/:conversationId/history`  
**File:** `src/server.ts` (line 297)

**Parameters:**

| Parameter        | Type   | Description        |
| ---------------- | ------ | ------------------ |
| `conversationId` | String | Session identifier |

---

### GET /v1/chat/sessions/:conversationId/messages

Get conversation messages (user dialog messages).

**Method:** `GET`  
**Path:** `/v1/chat/sessions/:conversationId/messages`  
**File:** `src/server.ts` (line 302)

**Parameters:**

| Parameter        | Type   | Description        |
| ---------------- | ------ | ------------------ |
| `conversationId` | String | Session identifier |

---

### GET /v1/chat/sessions/:conversationId

Get a single session details.

**Method:** `GET`  
**Path:** `/v1/chat/sessions/:conversationId`  
**File:** `src/server.ts` (line 307)

**Parameters:**

| Parameter        | Type   | Description        |
| ---------------- | ------ | ------------------ |
| `conversationId` | String | Session identifier |

---

### DELETE /v1/chat/sessions/:conversationId

Delete a chat session.

**Method:** `DELETE`  
**Path:** `/v1/chat/sessions/:conversationId`  
**File:** `src/server.ts` (line 312)

**Parameters:**

| Parameter        | Type   | Description        |
| ---------------- | ------ | ------------------ |
| `conversationId` | String | Session identifier |

---

### POST /v1/interrupt

Interrupt an ongoing request.

**Method:** `POST`  
**Path:** `/v1/interrupt`  
**File:** `src/server.ts` (line 322)

**Request Body:**

```json
{
  "conversationId": "conv_123456"
}
```

---

## Models API

### GET /v1/models

Get list of available models.

**Method:** `GET`  
**Path:** `/v1/models`  
**File:** `src/server.ts` (line 317)  
**Middleware:** `modelsListSchema` validation

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "gpt-4",
      "type": "NLP",
      "provider": "openai",
      "contextWindow": 128000,
      "maxOutputTokens": 4096
    },
    {
      "id": "claude-3-5-sonnet-20241022",
      "type": "NLP",
      "provider": "anthropic",
      "contextWindow": 200000,
      "maxOutputTokens": 8192
    }
  ],
  "meta": {
    "total": 8,
    "timestamp": "2026-01-11T15:45:30.000Z"
  }
}
```

---

### GET /api/llm/models

Query models across all providers.

**Method:** `GET`  
**Path:** `/api/llm/models`  
**File:** `src/server.ts` (line 352)  
**Controller:** `ModelController.queryModels`

---

### GET /api/llm/models/default

Get the default model.

**Method:** `GET`  
**Path:** `/api/llm/models/default`  
**File:** `src/server.ts` (line 353)  
**Controller:** `ModelController.getDefaultModel`

---

## Providers API

LLM Provider management with two-level structure (Provider → Models).

### GET /api/llm/providers

List all LLM providers.

**Method:** `GET`  
**Path:** `/api/llm/providers`  
**File:** `src/server.ts` (line 331)  
**Controller:** `ProviderController.listProviders`

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "openai",
      "name": "OpenAI",
      "type": "openai",
      "models": [
        { "id": "gpt-4", "name": "GPT-4" },
        { "id": "gpt-4o", "name": "GPT-4o" }
      ]
    }
  ],
  "meta": {
    "total": 1,
    "timestamp": "2026-01-11T15:45:30.000Z"
  }
}
```

---

### GET /api/llm/providers/adapters

List available LLM adapters.

**Method:** `GET`  
**Path:** `/api/llm/providers/adapters`  
**File:** `src/server.ts` (line 332)  
**Controller:** `ProviderController.listAdapters`

---

### GET /api/llm/providers/:id

Get a specific provider by ID.

**Method:** `GET`  
**Path:** `/api/llm/providers/:id`  
**File:** `src/server.ts` (line 333)  
**Controller:** `ProviderController.getProvider`

**Parameters:**

| Parameter | Type   | Description         |
| --------- | ------ | ------------------- |
| `id`      | String | Provider identifier |

---

### POST /api/llm/providers/test-connect

Test provider connection.

**Method:** `POST`  
**Path:** `/api/llm/providers/test-connect`  
**File:** `src/server.ts` (line 334)  
**Controller:** `ProviderController.testProviderConnection`

**Request Body:**

```json
{
  "type": "openai",
  "apiKey": "sk-...",
  "baseUrl": "https://api.openai.com/v1"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "connected": true,
    "latency": 150
  }
}
```

---

### POST /api/llm/providers

Create a new provider.

**Method:** `POST`  
**Path:** `/api/llm/providers`  
**File:** `src/server.ts` (line 340)  
**Controller:** `ProviderController.createProvider`

**Request Body:**

```json
{
  "name": "My OpenAI",
  "type": "openai",
  "apiKey": "sk-...",
  "baseUrl": "https://api.openai.com/v1",
  "enabled": true
}
```

---

### PUT /api/llm/providers/:id

Update a provider.

**Method:** `PUT`  
**Path:** `/api/llm/providers/:id`  
**File:** `src/server.ts` (line 341)  
**Controller:** `ProviderController.updateProvider`

---

### DELETE /api/llm/providers/:id

Delete a provider.

**Method:** `DELETE`  
**Path:** `/api/llm/providers/:id`  
**File:** `src/server.ts` (line 342)  
**Controller:** `ProviderController.deleteProvider`

---

### GET /api/llm/providers/:providerId/models

List models for a specific provider.

**Method:** `GET`  
**Path:** `/api/llm/providers/:providerId/models`  
**File:** `src/server.ts` (line 345)  
**Controller:** `ModelController.listProviderModels`

---

### GET /api/llm/providers/:providerId/models/:modelId

Get a specific model.

**Method:** `GET`  
**Path:** `/api/llm/providers/:providerId/models/:modelId`  
**File:** `src/server.ts` (line 346)  
**Controller:** `ModelController.getModel`

---

### POST /api/llm/providers/:providerId/models

Create a new model for a provider.

**Method:** `POST`  
**Path:** `/api/llm/providers/:providerId/models`  
**File:** `src/server.ts` (line 347)  
**Controller:** `ModelController.createModel`

---

### PUT /api/llm/providers/:providerId/models/:modelId

Update a model.

**Method:** `PUT`  
**Path:** `/api/llm/providers/:providerId/models/:modelId`  
**File:** `src/server.ts` (line 348)  
**Controller:** `ModelController.updateModel`

---

### DELETE /api/llm/providers/:providerId/models/:modelId

Delete a model.

**Method:** `DELETE`  
**Path:** `/api/llm/providers/:providerId/models/:modelId`  
**File:** `src/server.ts` (line 349)  
**Controller:** `ModelController.deleteModel`

---

## Skills API

Skill management RESTful API routes.

**Base Path:** `/api/skills`  
**File:** `src/api/routes/skillRoutes.ts`

---

### POST /api/skills/install

Install skills from ZIP file upload.

**Method:** `POST`  
**Path:** `/api/skills/install`  
**File:** `src/api/routes/skillRoutes.ts` (line 27)  
**Controller:** `SkillsController.installSkill`

**Content-Type:** `multipart/form-data`

**Body Parameters:**

| Parameter           | Type    | Required | Description                          |
| ------------------- | ------- | -------- | ------------------------------------ |
| `file`              | File    | Yes      | ZIP file containing skill definition |
| `overwrite`         | Boolean | No       | Overwrite existing skill             |
| `skipVectorization` | Boolean | No       | Skip vector indexing                 |

---

### DELETE /api/skills/:name

Uninstall a skill.

**Method:** `DELETE`  
**Path:** `/api/skills/:name`  
**File:** `src/api/routes/skillRoutes.ts` (line 38)  
**Controller:** `SkillsController.uninstallSkill`

**Parameters:**

| Parameter | Type   | Description             |
| --------- | ------ | ----------------------- |
| `name`    | String | Skill name to uninstall |

---

### PUT /api/skills/:name/description

Update skill description.

**Method:** `PUT`  
**Path:** `/api/skills/:name/description`  
**File:** `src/api/routes/skillRoutes.ts` (line 46)  
**Controller:** `SkillsController.updateSkillDescription`

**Request Body:**

```json
{
  "description": "Updated skill description"
}
```

---

### GET /api/skills

List all skills with pagination, filtering, and sorting.

**Method:** `GET`  
**Path:** `/api/skills`  
**File:** `src/api/routes/skillRoutes.ts` (line 54)  
**Controller:** `SkillsController.listSkills`

**Query Parameters:**

| Parameter   | Type    | Description                  |
| ----------- | ------- | ---------------------------- |
| `page`      | Integer | Page number (default: 1)     |
| `limit`     | Integer | Items per page (default: 20) |
| `name`      | String  | Filter by name               |
| `tags`      | String  | Filter by tags               |
| `sortBy`    | String  | Field to sort by             |
| `sortOrder` | String  | `asc` or `desc`              |

---

### GET /api/skills/:name

Get a single skill details.

**Method:** `GET`  
**Path:** `/api/skills/:name`  
**File:** `src/api/routes/skillRoutes.ts` (line 61)  
**Controller:** `SkillsController.getSkill`

---

### GET /api/skills/:name/exists

Check if a skill exists.

**Method:** `GET`  
**Path:** `/api/skills/:name/exists`  
**File:** `src/api/routes/skillRoutes.ts` (line 68)  
**Controller:** `SkillsController.checkSkillExists`

---

### GET /api/skills/stats

Get skill statistics.

**Method:** `GET`  
**Path:** `/api/skills/stats`  
**File:** `src/api/routes/skillRoutes.ts` (line 75)  
**Controller:** `SkillsController.getSkillStats`

---

### POST /api/skills/reindex

Reindex all skills (for vector database rebuild).

**Method:** `POST`  
**Path:** `/api/skills/reindex`  
**File:** `src/api/routes/skillRoutes.ts` (line 82)  
**Controller:** `SkillsController.reindexAllSkills`

---

## MCP API

MCP (Model Context Protocol) server management REST API.

**Base Path:** `/api/mcp`  
**File:** `src/api/routes/mcpRoutes.ts`

---

### GET /api/mcp/servers

Get all registered MCP servers.

**Method:** `GET`  
**Path:** `/api/mcp/servers`  
**File:** `src/api/routes/mcpRoutes.ts` (line 17)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "server_1",
      "name": "Filesystem Server",
      "type": "stdio",
      "status": "running",
      "tools": ["read_file", "write_file", "list_dir"]
    }
  ],
  "meta": {
    "total": 1,
    "timestamp": "2026-01-11T15:45:30.000Z"
  }
}
```

---

### POST /api/mcp/servers

Register a new MCP server.

**Method:** `POST`  
**Path:** `/api/mcp/servers`  
**File:** `src/api/routes/mcpRoutes.ts` (line 46)

**Request Body:**

```json
{
  "id": "my-server",
  "name": "My MCP Server",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "./data"],
  "env": {
    "KEY": "value"
  }
}
```

**Required Fields:** `id`, `type`, `command`

---

### GET /api/mcp/servers/:serverId

Get specific MCP server details.

**Method:** `GET`  
**Path:** `/api/mcp/servers/:serverId`  
**File:** `src/api/routes/mcpRoutes.ts` (line 97)

---

### DELETE /api/mcp/servers/:serverId

Unregister an MCP server.

**Method:** `DELETE`  
**Path:** `/api/mcp/servers/:serverId`  
**File:** `src/api/routes/mcpRoutes.ts` (line 133)

---

### POST /api/mcp/servers/:serverId/restart

Restart an MCP server.

**Method:** `POST`  
**Path:** `/api/mcp/servers/:serverId/restart`  
**File:** `src/api/routes/mcpRoutes.ts` (line 172)

---

### GET /api/mcp/servers/:serverId/status

Get MCP server status.

**Method:** `GET`  
**Path:** `/api/mcp/servers/:serverId/status`  
**File:** `src/api/routes/mcpRoutes.ts` (line 211)

**Response:**

```json
{
  "success": true,
  "data": {
    "serverId": "server_1",
    "status": {
      "healthy": true,
      "uptime": 3600,
      "lastCheck": "2026-01-11T15:45:00.000Z"
    }
  }
}
```

---

### GET /api/mcp/servers/:serverId/tools

Get tools list for an MCP server.

**Method:** `GET`  
**Path:** `/api/mcp/servers/:serverId/tools`  
**File:** `src/api/routes/mcpRoutes.ts` (line 250)

---

### POST /api/mcp/servers/:serverId/tools/:toolName/call

Call an MCP tool by name.

**Method:** `POST`  
**Path:** `/api/mcp/servers/:serverId/tools/:toolName/call`  
**File:** `src/api/routes/mcpRoutes.ts` (line 290)

**Request Body:**

```json
{
  "path": "/some/file.txt"
}
```

---

### POST /api/mcp/tools/call

Call an MCP tool with auto-discovery.

**Method:** `POST`  
**Path:** `/api/mcp/tools/call`  
**File:** `src/api/routes/mcpRoutes.ts` (line 322)

**Request Body:**

```json
{
  "toolName": "read_file",
  "arguments": {
    "path": "/some/file.txt"
  }
}
```

---

### GET /api/mcp/statistics

Get MCP statistics.

**Method:** `GET`  
**Path:** `/api/mcp/statistics`  
**File:** `src/api/routes/mcpRoutes.ts` (line 362)

---

### GET /api/mcp/health

MCP health check.

**Method:** `GET`  
**Path:** `/api/mcp/health`  
**File:** `src/api/routes/mcpRoutes.ts` (line 387)

**Response:**

```json
{
  "success": true,
  "data": {
    "healthy": true,
    "servers": {
      "total": 2,
      "running": 2,
      "stopped": 0
    }
  }
}
```

---

## WebSocket API

Real-time communication for streaming responses and interrupts.

**File:** `src/api/websocket/WebSocketManager.ts`

### Connection

```
ws://localhost:12345/ws
```

### Events

| Event       | Direction     | Description                |
| ----------- | ------------- | -------------------------- |
| `message`   | Client→Server | Send chat message          |
| `stream`    | Server→Client | Receive streaming response |
| `interrupt` | Client→Server | Interrupt ongoing request  |
| `error`     | Server→Client | Error notification         |
| `close`     | Server→Client | Connection closed          |

### WebSocket Channels

| Channel    | Purpose                    |
| ---------- | -------------------------- |
| `/ws/chat` | Chat completions streaming |
| `/ws/mcp`  | MCP tool calls             |

---

## System API

### GET /health

Health check endpoint.

**Method:** `GET`  
**Path:** `/health`  
**File:** `src/server.ts` (line 370)

**Response:**

```json
{
  "status": "ok",
  "version": "2.0.0",
  "uptime": 3600,
  "plugins": 5,
  "activeRequests": 2
}
```

---

## Middleware

### Authentication

All `/api/*` endpoints require API Key authentication.

```bash
curl -H "X-API-Key: your-api-key" http://localhost:12345/api/llm/providers
```

### Rate Limiting

- **In-memory limiter**: For development
- **Redis limiter**: For production

### Validation Schemas

| Schema                         | Endpoint                               | Description                  |
| ------------------------------ | -------------------------------------- | ---------------------------- |
| `modelsListSchema`             | GET /v1/models                         | Model list query validation  |
| `interruptRequestSchema`       | POST /v1/interrupt                     | Interrupt request validation |
| `validateModelBeforeAddSchema` | POST /api/llm/providers/validate-model | Model validation             |

---

## Error Codes

| Code                  | HTTP Status | Description                           |
| --------------------- | ----------- | ------------------------------------- |
| `INVALID_CONFIG`      | 400         | Missing required configuration fields |
| `REGISTRATION_FAILED` | 400         | MCP server registration failed        |
| `SERVER_NOT_FOUND`    | 404         | Requested server/resource not found   |
| `GET_SERVERS_FAILED`  | 500         | Internal error fetching servers       |
| `TOOL_CALL_ERROR`     | 500         | Error executing MCP tool              |
| `HEALTH_CHECK_FAILED` | 503         | Health check failed                   |

---

## Rate Limits

| Endpoint               | Requests | Window     |
| ---------------------- | -------- | ---------- |
| `/v1/chat/completions` | 100      | per minute |
| `/api/mcp/*`           | 60       | per minute |
| `/api/skills/*`        | 30       | per minute |

---

## Response Timeouts

| Endpoint               | Timeout          |
| ---------------------- | ---------------- |
| `/v1/chat/completions` | 120s (streaming) |
| `/api/mcp/tools/call`  | 30s              |
| Other endpoints        | 10s              |

---

_Generated by ApexBridge API Documentation Generator_
