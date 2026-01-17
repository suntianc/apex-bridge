# ApexBridge API Reference

**Generated:** 2026-01-16  
**Version:** 2.1.0

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
http://localhost:8088
```

---

## General Information

### Async API Calls

All API endpoints are asynchronous and require `await` or `.then()` to handle responses.

```javascript
// Example - Listing providers
const response = await fetch("/api/llm/providers");
const data = await response.json();
console.log(data.providers);
```

```javascript
// Example - Creating a provider
const response = await fetch("/api/llm/providers", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    provider: "openai",
    name: "My OpenAI",
    baseConfig: { apiKey: "sk-..." },
  }),
});
const result = await response.json();
```

### Response Format

All API responses follow a consistent format:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-01-16T15:45:30.000Z"
  }
}
```

### Error Response

Error responses include enhanced error details:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Provider not found",
    "details": {
      "provider_id": 1
    }
  }
}
```

### Common Error Codes

| Error Code         | HTTP Status | Description                |
| ------------------ | ----------- | -------------------------- |
| `NOT_FOUND`        | 404         | Resource not found         |
| `VALIDATION_ERROR` | 400         | Parameter validation error |
| `INTERNAL_ERROR`   | 500         | Server internal error      |

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

**Call Example:**

```javascript
const response = await fetch("/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello, world!" },
    ],
    model: "gpt-4",
    stream: false,
  }),
});
const result = await response.json();
console.log(result.choices[0].message.content);
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
      "createdAt": "2026-01-16T10:00:00Z",
      "messageCount": 15
    }
  ],
  "meta": {
    "total": 1,
    "timestamp": "2026-01-16T15:45:30.000Z"
  }
}
```

**Call Example:**

```javascript
const response = await fetch("/v1/chat/sessions/active");
const { success, data: sessions } = await response.json();
console.log(sessions);
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

**Call Example:**

```javascript
const response = await fetch("/v1/interrupt", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ conversationId: "conv_123456" }),
});
const result = await response.json();
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
    "timestamp": "2026-01-16T15:45:30.000Z"
  }
}
```

**Call Example:**

```javascript
const response = await fetch("/v1/models");
const { success, data: models } = await response.json();
console.log(models);
```

---

### GET /api/llm/models

Query models across all providers.

**Method:** `GET`  
**Path:** `/api/llm/models`  
**File:** `src/server.ts` (line 352)  
**Controller:** `ModelController.queryModels`

**Query Parameters:**

| Parameter | Type    | Description              |
| --------- | ------- | ------------------------ |
| `type`    | String  | Filter by model type     |
| `enabled` | Boolean | Filter by enabled status |
| `default` | Boolean | Filter by default status |

**Call Example:**

```javascript
const response = await fetch("/api/llm/models?type=NLP&enabled=true");
const { success, models } = await response.json();
console.log(models);
```

---

### GET /api/llm/models/default

Get the default model.

**Method:** `GET`  
**Path:** `/api/llm/models/default`  
**File:** `src/server.ts` (line 353)  
**Controller:** `ModelController.getDefaultModel`

**Query Parameters:**

| Parameter | Type   | Required | Description                           |
| --------- | ------ | -------- | ------------------------------------- |
| `type`    | String | Yes      | Model type (NLP, EMBEDDING, RERANKER) |

**Call Example:**

```javascript
const response = await fetch("/api/llm/models/default?type=NLP");
const { success, model } = await response.json();
console.log(model);
```

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
  "providers": [
    {
      "id": 1,
      "provider": "openai",
      "name": "OpenAI",
      "description": "OpenAI API provider",
      "enabled": true,
      "modelCount": 2,
      "baseConfig": {
        "baseURL": "https://api.openai.com/v1",
        "timeout": 60000,
        "maxRetries": 3
      },
      "createdAt": "2026-01-16T10:00:00.000Z",
      "updatedAt": "2026-01-16T15:45:30.000Z"
    }
  ]
}
```

**Call Example:**

```javascript
const response = await fetch("/api/llm/providers");
const { success, providers } = await response.json();
console.log(providers);
```

---

### GET /api/llm/providers/adapters

List available LLM adapters.

**Method:** `GET`  
**Path:** `/api/llm/providers/adapters`  
**File:** `src/server.ts` (line 332)  
**Controller:** `ProviderController.listAdapters`

**Response:**

```json
{
  "success": true,
  "adapters": ["openai", "anthropic", "deepseek", "ollama", "google", "custom"]
}
```

**Call Example:**

```javascript
const response = await fetch("/api/llm/providers/adapters");
const { success, adapters } = await response.json();
console.log(adapters);
```

---

### GET /api/llm/providers/:id

Get a specific provider by ID.

**Method:** `GET`  
**Path:** `/api/llm/providers/:id`  
**File:** `src/server.ts` (line 333)  
**Controller:** `ProviderController.getProvider`

**Parameters:**

| Parameter | Type    | Description         |
| --------- | ------- | ------------------- |
| `id`      | Integer | Provider identifier |

**Response:**

```json
{
  "success": true,
  "provider": {
    "id": 1,
    "provider": "openai",
    "name": "OpenAI",
    "description": "OpenAI API provider",
    "enabled": true,
    "modelCount": 2,
    "baseConfig": {
      "baseURL": "https://api.openai.com/v1",
      "timeout": 60000,
      "maxRetries": 3
    },
    "createdAt": "2026-01-16T10:00:00.000Z",
    "updatedAt": "2026-01-16T15:45:30.000Z"
  }
}
```

**Call Example:**

```javascript
const response = await fetch("/api/llm/providers/1");
const { success, provider } = await response.json();
console.log(provider);
```

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
  "provider": "openai",
  "baseConfig": {
    "apiKey": "sk-...",
    "baseURL": "https://api.openai.com/v1"
  }
}
```

**Response:**

```json
{
  "success": true,
  "latency": 150,
  "message": "Connection successful",
  "details": {
    "provider": "openai",
    "testedAt": "2026-01-16T15:45:30.000Z"
  }
}
```

**Call Example:**

```javascript
const response = await fetch("/api/llm/providers/test-connect", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    provider: "openai",
    baseConfig: { apiKey: "sk-..." },
  }),
});
const result = await response.json();
console.log(result.latency);
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
  "provider": "openai",
  "name": "My OpenAI",
  "description": "My custom OpenAI configuration",
  "baseConfig": {
    "apiKey": "sk-...",
    "baseURL": "https://api.openai.com/v1",
    "timeout": 60000,
    "maxRetries": 3
  },
  "enabled": true
}
```

**Response:**

```json
{
  "success": true,
  "provider": {
    "id": 2,
    "provider": "openai",
    "name": "My OpenAI",
    "description": "My custom OpenAI configuration",
    "enabled": true,
    "modelCount": 0,
    "baseConfig": {
      "baseURL": "https://api.openai.com/v1",
      "timeout": 60000,
      "maxRetries": 3
    },
    "createdAt": "2026-01-16T15:45:30.000Z",
    "updatedAt": "2026-01-16T15:45:30.000Z"
  }
}
```

**Call Example:**

```javascript
const response = await fetch("/api/llm/providers", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    provider: "openai",
    name: "My OpenAI",
    baseConfig: { apiKey: "sk-..." },
  }),
});
const { success, provider } = await response.json();
console.log(provider.id);
```

---

### PUT /api/llm/providers/:id

Update a provider.

**Method:** `PUT`  
**Path:** `/api/llm/providers/:id`  
**File:** `src/server.ts` (line 341)  
**Controller:** `ProviderController.updateProvider`

**Parameters:**

| Parameter | Type    | Description         |
| --------- | ------- | ------------------- |
| `id`      | Integer | Provider identifier |

**Request Body:**

```json
{
  "name": "Updated OpenAI",
  "enabled": false
}
```

**Call Example:**

```javascript
const response = await fetch("/api/llm/providers/1", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Updated OpenAI", enabled: false }),
});
const { success, provider } = await response.json();
```

---

### DELETE /api/llm/providers/:id

Delete a provider.

**Method:** `DELETE`  
**Path:** `/api/llm/providers/:id`  
**File:** `src/server.ts` (line 342)  
**Controller:** `ProviderController.deleteProvider`

**Parameters:**

| Parameter | Type    | Description         |
| --------- | ------- | ------------------- |
| `id`      | Integer | Provider identifier |

**Call Example:**

```javascript
const response = await fetch("/api/llm/providers/1", {
  method: "DELETE",
});
const result = await response.json();
console.log(result.message);
```

---

### GET /api/llm/providers/:providerId/models

List models for a specific provider.

**Method:** `GET`  
**Path:** `/api/llm/providers/:providerId/models`  
**File:** `src/server.ts` (line 345)  
**Controller:** `ModelController.listProviderModels`

**Parameters:**

| Parameter    | Type    | Description         |
| ------------ | ------- | ------------------- |
| `providerId` | Integer | Provider identifier |

**Response:**

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
      "modelType": "NLP",
      "enabled": true,
      "isDefault": true,
      "displayOrder": 1
    }
  ]
}
```

**Call Example:**

```javascript
const response = await fetch("/api/llm/providers/1/models");
const { success, provider, models } = await response.json();
console.log(models);
```

---

### GET /api/llm/providers/:providerId/models/:modelId

Get a specific model.

**Method:** `GET`  
**Path:** `/api/llm/providers/:providerId/models/:modelId`  
**File:** `src/server.ts` (line 346)  
**Controller:** `ModelController.getModel`

**Parameters:**

| Parameter    | Type    | Description |
| ------------ | ------- | ----------- |
| `providerId` | Integer | Provider ID |
| `modelId`    | Integer | Model ID    |

**Call Example:**

```javascript
const response = await fetch("/api/llm/providers/1/models/1");
const { success, model } = await response.json();
console.log(model);
```

---

### POST /api/llm/providers/:providerId/models

Create a new model for a provider.

**Method:** `POST`  
**Path:** `/api/llm/providers/:providerId/models`  
**File:** `src/server.ts` (line 347)  
**Controller:** `ModelController.createModel`

**Parameters:**

| Parameter    | Type    | Description |
| ------------ | ------- | ----------- |
| `providerId` | Integer | Provider ID |

**Request Body:**

```json
{
  "modelKey": "gpt-4o",
  "modelName": "GPT-4o",
  "modelType": "NLP",
  "enabled": true,
  "isDefault": false
}
```

**Call Example:**

```javascript
const response = await fetch("/api/llm/providers/1/models", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    modelKey: "gpt-4o",
    modelName: "GPT-4o",
    modelType: "NLP",
  }),
});
const result = await response.json();
```

---

### PUT /api/llm/providers/:providerId/models/:modelId

Update a model.

**Method:** `PUT`  
**Path:** `/api/llm/providers/:providerId/models/:modelId`  
**File:** `src/server.ts` (line 348)  
**Controller:** `ModelController.updateModel`

**Parameters:**

| Parameter    | Type    | Description |
| ------------ | ------- | ----------- |
| `providerId` | Integer | Provider ID |
| `modelId`    | Integer | Model ID    |

**Call Example:**

```javascript
const response = await fetch("/api/llm/providers/1/models/1", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ enabled: false, isDefault: false }),
});
const result = await response.json();
```

---

### DELETE /api/llm/providers/:providerId/models/:modelId

Delete a model.

**Method:** `DELETE`  
**Path:** `/api/llm/providers/:providerId/models/:modelId`  
**File:** `src/server.ts` (line 349)  
**Controller:** `ModelController.deleteModel`

**Parameters:**

| Parameter    | Type    | Description |
| ------------ | ------- | ----------- |
| `providerId` | Integer | Provider ID |
| `modelId`    | Integer | Model ID    |

**Call Example:**

```javascript
const response = await fetch("/api/llm/providers/1/models/1", {
  method: "DELETE",
});
const result = await response.json();
```

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
| `validationLevel`   | String  | No       | Validation level (basic/full)        |

**Response:**

```json
{
  "success": true,
  "skillName": "my-skill",
  "installedAt": "2026-01-16T15:45:30.000Z",
  "duration": 1500,
  "vectorized": true
}
```

**Call Example:**

```javascript
const formData = new FormData();
formData.append("file", skillZipFile);
formData.append("overwrite", "false");

const response = await fetch("/api/skills/install", {
  method: "POST",
  body: formData,
});
const result = await response.json();
console.log(result.skillName);
```

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

**Response:**

```json
{
  "success": true,
  "skillName": "my-skill",
  "uninstalledAt": "2026-01-16T15:45:30.000Z",
  "duration": 150
}
```

**Call Example:**

```javascript
const response = await fetch("/api/skills/my-skill", {
  method: "DELETE",
});
const result = await response.json();
console.log(result.skillName);
```

---

### PUT /api/skills/:name/description

Update skill description.

**Method:** `PUT`  
**Path:** `/api/skills/:name/description`  
**File:** `src/api/routes/skillRoutes.ts` (line 46)  
**Controller:** `SkillsController.updateSkillDescription`

**Parameters:**

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `name`    | String | Skill name  |

**Request Body:**

```json
{
  "description": "Updated skill description"
}
```

**Call Example:**

```javascript
const response = await fetch("/api/skills/my-skill/description", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ description: "New description" }),
});
const result = await response.json();
```

---

### GET /api/skills

List all skills with pagination, filtering, and sorting.

**Method:** `GET`  
**Path:** `/api/skills`  
**File:** `src/api/routes/skillRoutes.ts` (line 54)  
**Controller:** `SkillsController.listSkills`

**Query Parameters:**

| Parameter   | Type    | Description                                     |
| ----------- | ------- | ----------------------------------------------- |
| `page`      | Integer | Page number (default: 1)                        |
| `limit`     | Integer | Items per page (default: 50)                    |
| `name`      | String  | Filter by name                                  |
| `tags`      | String  | Filter by tags (comma-separated)                |
| `sortBy`    | String  | Field to sort by (updatedAt, name, installedAt) |
| `sortOrder` | String  | `asc` or `desc`                                 |

**Response:**

```json
{
  "success": true,
  "skills": [
    {
      "name": "calculator",
      "description": "Performs arithmetic calculations",
      "type": "tool",
      "tags": ["math", "utility"],
      "version": "1.0.0",
      "author": "ApexBridge",
      "enabled": true,
      "level": 0,
      "path": "/skills/calculator",
      "parameters": {
        "type": "object",
        "properties": {
          "expression": {
            "type": "string",
            "description": "Mathematical expression"
          }
        },
        "required": ["expression"]
      }
    }
  ],
  "pagination": {
    "total": 10,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

**Call Example:**

```javascript
const response = await fetch("/api/skills?page=1&limit=10&sortBy=updatedAt&sortOrder=desc");
const { success, skills, pagination } = await response.json();
console.log(`Total: ${pagination.total}, Pages: ${pagination.totalPages}`);
console.log(skills);
```

---

### GET /api/skills/:name

Get a single skill details.

**Method:** `GET`  
**Path:** `/api/skills/:name`  
**File:** `src/api/routes/skillRoutes.ts` (line 61)  
**Controller:** `SkillsController.getSkill`

**Parameters:**

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `name`    | String | Skill name  |

**Response:**

```json
{
  "success": true,
  "name": "calculator",
  "description": "Performs arithmetic calculations",
  "type": "tool",
  "tags": ["math", "utility"],
  "version": "1.0.0",
  "author": "ApexBridge",
  "enabled": true,
  "level": 0,
  "path": "/skills/calculator",
  "parameters": { ... }
}
```

**Call Example:**

```javascript
const response = await fetch("/api/skills/calculator");
const { success, ...skill } = await response.json();
console.log(skill);
```

---

### GET /api/skills/:name/exists

Check if a skill exists.

**Method:** `GET`  
**Path:** `/api/skills/:name/exists`  
**File:** `src/api/routes/skillRoutes.ts` (line 68)  
**Controller:** `SkillsController.checkSkillExists`

**Parameters:**

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `name`    | String | Skill name  |

**Response:**

```json
{
  "success": true,
  "name": "calculator",
  "exists": true
}
```

**Call Example:**

```javascript
const response = await fetch("/api/skills/calculator/exists");
const { success, name, exists } = await response.json();
if (exists) {
  console.log(`Skill '${name}' exists`);
}
```

---

### GET /api/skills/stats

Get skill statistics.

**Method:** `GET`  
**Path:** `/api/skills/stats`  
**File:** `src/api/routes/skillRoutes.ts` (line 75)  
**Controller:** `SkillsController.getSkillStats`

**Response:**

```json
{
  "success": true,
  "totalSkills": 15,
  "enabledSkills": 12,
  "disabledSkills": 3,
  "totalTags": 25,
  "skillsByType": {
    "tool": 10,
    "agent": 3,
    "utility": 2
  },
  "skillsByLevel": {
    "0": 8,
    "1": 5,
    "2": 2
  }
}
```

**Call Example:**

```javascript
const response = await fetch("/api/skills/stats");
const { success, totalSkills, enabledSkills } = await response.json();
console.log(`Total: ${totalSkills}, Enabled: ${enabledSkills}`);
```

---

### POST /api/skills/reindex

Reindex all skills (for vector database rebuild).

**Method:** `POST`  
**Path:** `/api/skills/reindex`  
**File:** `src/api/routes/skillRoutes.ts` (line 82)  
**Controller:** `SkillsController.reindexAllSkills`

**Response:**

```json
{
  "success": true,
  "message": "All skills reindexed successfully"
}
```

**Call Example:**

```javascript
const response = await fetch("/api/skills/reindex", {
  method: "POST",
});
const result = await response.json();
console.log(result.message);
```

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
    "timestamp": "2026-01-16T15:45:30.000Z"
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
      "lastCheck": "2026-01-16T15:45:00.000Z"
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
ws://localhost:8088/ws
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
  "version": "2.1.0",
  "uptime": 3600,
  "plugins": 5,
  "activeRequests": 2
}
```

**Call Example:**

```javascript
const response = await fetch("/health");
const health = await response.json();
console.log(health.status);
```

---

## Middleware

### Authentication

All `/api/*` endpoints require API Key authentication.

```bash
curl -H "X-API-Key: your-api-key" http://localhost:8088/api/llm/providers
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
| `NOT_FOUND`           | 404         | Resource not found                    |
| `VALIDATION_ERROR`    | 400         | Parameter validation error            |
| `INTERNAL_ERROR`      | 500         | Server internal error                 |

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

## Changelog

### Version 2.1.0 (2026-01-16)

- **All APIs now async**: All endpoints require `await` to handle responses
- **Enhanced error responses**: Added `details` field for better error debugging
- **Skills API improvements**:
  - Added `totalPages` field to pagination response
  - Added `/api/skills/:name/exists` endpoint
  - Added `/api/skills/stats` endpoint
  - Added `/api/skills/reindex` endpoint
- **Updated Base URL**: Changed from `12345` to `8088`

---

_Generated by ApexBridge API Documentation Generator_
