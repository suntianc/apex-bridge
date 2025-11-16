# Apex Bridge User Guide

Complete guide for using Apex Bridge.

## Table of Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Quick Start](#quick-start)
4. [Core Features](#core-features)
5. [Plugin System](#plugin-system)
6. [Variable System](#variable-system)
7. [RAG Advanced Search](#rag-advanced-search)
8. [API Reference](#api-reference)
9. [Troubleshooting](#troubleshooting)

---

## Installation

### Requirements

- Node.js >= 16.0.0
- npm >= 7.0.0

### Install Dependencies

```bash
npm install
```

### Build Project

```bash
npm run build
```

---

## Configuration

### Environment Variables

Copy the template and edit `.env`:

```bash
cp env.template .env
```

### Key Configurations

#### Server Settings

```env
PORT=8088                    # Server port
NODE_ENV=development         # Environment (development/production)
```

#### LLM Provider

Choose your LLM provider:

```env
LLM_PROVIDER=deepseek       # Options: deepseek/openai/zhipu/ollama
```

**DeepSeek**:
```env
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

**OpenAI**:
```env
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4
```

**Zhipu**:
```env
ZHIPU_API_KEY=xxx
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_MODEL=glm-4-plus
```

**Ollama**:
```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

#### RAG Configuration

```env
RAG_STORAGE_PATH=./vector_store
DIARY_ROOT_PATH=./dailynote

RAG_DEFAULT_MODE=basic
RAG_DEFAULT_K=5
RAG_MAX_K=20

RAG_SIMILARITY_THRESHOLD=0.3
```

#### Async Result Management

```env
ASYNC_RESULT_CLEANUP_ENABLED=true
ASYNC_RESULT_MAX_AGE_DAYS=7
ASYNC_RESULT_CLEANUP_INTERVAL_DAYS=1
ASYNC_RESULT_SEARCH_DAYS_LIMIT=30
```

#### Diary Archive

```env
DIARY_ARCHIVE_ENABLED=true
DIARY_ARCHIVE_AFTER_DAYS=30
DIARY_ARCHIVE_CRON=0 2 * * *
```

#### Rate Limiting & Redis

`admin-config.json` exposes a full rate-limiting block under `security.rateLimit` plus optional Redis settings:

```json
"security": {
  "rateLimit": {
    "enabled": true,
    "provider": "auto",            // memory | redis | auto
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

- `provider` chooses the limiter backend (`memory`, `redis`, or `auto`, which prefers Redis and falls back to memory if unavailable).  
- Matchers support `path`, `prefix`, or `regex`, while strategies can rate-limit by IP, API key, user id, or custom headers.  
- `burstMultiplier` allows short bursts while keeping the sliding-window semantics accurate.  
- Responses include standard `Retry-After` and `X-RateLimit-*` headers; logs also record `rateLimit.provider` so you can confirm the active backend.

**Updating the config via Admin API**

```bash
curl -X PUT http://localhost:8088/api/admin/config \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"config":{"security":{"rateLimit":{"rules":[{"id":"chat-api","windowMs":60000,"maxRequests":45,"mode":"sliding"}]}}}}'
```

When Redis credentials are present and reachable, the system automatically switches to the distributed limiter; otherwise it gracefully degrades to the in-memory implementation.

---

## Quick Start

### Start Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

### Test Connection

```bash
curl http://localhost:8088/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": 1730448000000,
  "activeRequests": 0
}
```

---

## Core Features

### 1. Chat Completions API

OpenAI-compatible chat completions endpoint.

#### Streaming Mode

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "stream": true
  }'
```

#### Non-Streaming Mode

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Tell me a joke"}
    ],
    "stream": false
  }'
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| messages | array | Yes | Array of message objects |
| stream | boolean | No | Enable streaming (default: true) |
| model | string | No | Override LLM model |
| temperature | number | No | Temperature (0-1) |
| max_tokens | number | No | Max tokens to generate |

#### Response Format (Streaming)

```
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"!"}}]}

data: [DONE]
```

#### Response Format (Non-Streaming)

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1730448000,
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! I'm doing well, thank you!"
    },
    "finish_reason": "stop"
  }]
}
```

### 2. Request Interrupt API

Cancel ongoing requests.

```bash
curl -X POST http://localhost:8088/v1/interrupt \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "req_1730448000000_xxx"
  }'
```

Response:
```json
{
  "success": true,
  "requestId": "req_1730448000000_xxx",
  "message": "Request interrupted successfully"
}
```

### 3. List Models

Get available LLM models.

```bash
curl http://localhost:8088/v1/models
```

Response:
```json
{
  "object": "list",
  "data": [
    {
      "id": "deepseek-chat",
      "object": "model",
      "owned_by": "deepseek"
    }
  ]
}
```

---

## Plugin System

### Plugin Types

VCP IntelliCore supports multiple plugin types:

#### 1. Direct Plugin (stdio protocol)

Executes directly with stdin/stdout communication.

**Example**: `SimpleDice`

```bash
# Plugin manifest
{
  "type": "direct",
  "entryPoint": {
    "command": "node",
    "args": ["dice.js"]
  },
  "communication": {
    "protocol": "stdio"
  }
}
```

#### 2. Hybrid Plugin

Combines multiple capabilities (e.g., RAG + Service). The default distribution no longer ships a built-in hybrid plugin; use this slot for your own integrations.

#### 3. Static Plugin

Provides static information without execution.

**Example**: `SystemInfo`, `TimeInfo`

### Using Plugins in Chat

Plugins are automatically invoked when AI needs them.

**Example**:
```
User: Roll a dice
AI: <<<[TOOL_REQUEST]>>>
    tool_name:「始」SimpleDice「末」
    sides:「始」6「末」
    count:「始」1「末」
    <<<[END_TOOL_REQUEST]>>>

Result: You rolled: 4
```

### Developing Custom Plugins

#### 1. Create Plugin Directory

```bash
mkdir -p plugins/direct/MyPlugin
```

#### 2. Create Manifest

`plugins/direct/MyPlugin/plugin-manifest.json`:

```json
{
  "name": "MyPlugin",
  "version": "1.0.0",
  "type": "direct",
  "entryPoint": {
    "command": "node",
    "args": ["my-plugin.js"]
  },
  "communication": {
    "protocol": "stdio"
  },
  "capabilities": {
    "invocationCommands": [{
      "command": "MyPlugin",
      "description": "My custom plugin",
      "example": "<<<[TOOL_REQUEST]>>>\ntool_name:「始」MyPlugin「末」\nparam1:「始」value1「末」\n<<<[END_TOOL_REQUEST]>>>",
      "parameters": {
        "param1": {
          "type": "string",
          "description": "Parameter description",
          "required": true
        }
      }
    }]
  }
}
```

#### 3. Implement Plugin Logic

`plugins/direct/MyPlugin/my-plugin.js`:

```javascript
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let buffer = '';

rl.on('line', (line) => {
  buffer += line + '\n';
  
  if (line.includes('<<<[END_TOOL_REQUEST]>>>')) {
    // Parse parameters
    const param1Match = buffer.match(/param1:「始」(.+?)「末」/);
    const param1 = param1Match ? param1Match[1] : '';
    
    // Execute logic
    const result = {
      success: true,
      message: `Processed: ${param1}`,
      data: { param1 }
    };
    
    // Output result
    console.log(JSON.stringify(result));
    process.exit(0);
  }
});
```

#### 4. Test Plugin

Restart server and test:

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Use MyPlugin with param1 as test"}
    ]
  }'
```

---

## Variable System

### Namespace Syntax

All variables use `{{namespace:key}}` format.

### Built-in Namespaces

#### 1. Environment Variables (`env`)

```
{{env:API_KEY}}
{{env:DATABASE_URL}}
```

#### 2. Time (`time`)

```
{{time:now}}        # 2025-11-01 14:30:45
{{time:date}}       # 2025-11-01
{{time:time}}       # 14:30:45
{{time:timestamp}}  # 1730448645000
```

#### 3. Agent (`agent`)

```
{{agent:name}}       # Agent name
{{agent:prompt}}     # Agent system prompt
{{agent:character}}  # Agent character
```

#### 4. Diary (`diary`)

```
{{diary:public}}     # ./dailynote/public
{{diary:user}}       # ./dailynote/user
```

#### 5. Tool Descriptions (`tool`)

```
{{tool:all}}         # All tool descriptions
{{tool:SimpleDice}}  # Specific tool description
```

#### 6. Async Results (`async`)

```
{{async:PluginName::TaskId}}
```

#### 7. RAG Search (`rag`)

```
{{rag:source:target:mode}}
```

See [RAG Advanced Search](#rag-advanced-search) for details.

### Using Variables in Chat

Variables are automatically resolved in messages.

**Example**:

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are {{agent:name}}. Current time: {{time:now}}"
    },
    {
      "role": "user",
      "content": "What's the time?"
    }
  ]
}
```

Resolved to:

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are Assistant. Current time: 2025-11-01 14:30:45"
    },
    {
      "role": "user",
      "content": "What's the time?"
    }
  ]
}
```

---

## RAG Advanced Search

### Syntax

```
{{rag:source:target:mode}}
```

- **source**: Knowledge base source (e.g., `diary`)
- **target**: Specific target (e.g., `user`, `public`)
- **mode**: Search mode(s)

### Search Modes

#### 1. Basic Mode (`basic`)

Simple vector similarity search.

```
{{rag:diary:user:basic}}
```

**Parameters** (via `ragParams`):
- `query` - Search query

#### 2. Time Mode (`time`)

Time-aware search with natural language time expressions.

```
{{rag:diary:user:time}}
```

**Supported time expressions** (60+):
- `今天`, `昨天`, `前天`
- `上周`, `上个月`, `去年`
- `最近3天`, `最近一周`
- `2025-10-30`
- `10月30日`

**Parameters**:
- `query` - Search query
- `time` - Time expression

#### 3. Group Mode (`group`)

Semantic group expansion for better recall.

```
{{rag:diary:user:group}}
```

Configuration (`config/semantic_groups.json`):

```json
{
  "groups": [
    {
      "name": "项目开发",
      "keywords": ["项目", "开发", "编程", "代码", "bug"],
      "weight": 0.3
    }
  ]
}
```

#### 4. Rerank Mode (`rerank`)

External rerank API for better precision.

```
{{rag:diary:user:rerank}}
```

Configuration:

```env
RERANK_ENABLED=true
RERANK_API_URL=https://api.cohere.ai/v1/rerank
RERANK_API_KEY=your_key
RERANK_MODEL=rerank-english-v2.0
```

#### 5. Combined Modes

Combine multiple modes with `+`:

```
{{rag:diary:user:time+group}}
{{rag:diary:user:time+group+rerank}}
{{rag:diary:user:basic+rerank}}
```

**Execution order**:
1. Time filtering (if `time`)
2. Basic vector search
3. Semantic group expansion (if `group`)
4. Rerank (if `rerank`)

### Dynamic K-value

K-value (number of results) is automatically calculated:

- **basic**: K
- **group**: K × multiplier
- **rerank**: K × multiplier
- **time+group+rerank**: K × time_mult × group_mult × rerank_mult

Configuration:

```env
RAG_DEFAULT_K=5
RAG_MAX_K=20
RAG_MAX_MULTIPLIER=3
```

### RAG Usage Example

```json
{
  "messages": [
    {
      "role": "system",
      "content": "Search context: {{rag:diary:user:time+group}}"
    },
    {
      "role": "user",
      "content": "我今天学了什么？"
    }
  ],
  "ragParams": {
    "query": "学习",
    "time": "今天"
  }
}
```

---

## API Reference

### Chat Completions

**Endpoint**: `POST /v1/chat/completions`

**Headers**:
- `Content-Type: application/json`
- `Authorization: Bearer <token>` (if `API_AUTH_TOKEN` is set)

**Request Body**:
```typescript
{
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  stream?: boolean;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  ragParams?: {
    query?: string;
    time?: string;
    k?: number;
  };
}
```

**Response** (streaming):
```
data: {"id":"...","choices":[{"delta":{"content":"..."}}]}
data: [DONE]
```

### Request Interrupt

**Endpoint**: `POST /v1/interrupt`

**Request Body**:
```json
{
  "requestId": "req_xxx"
}
```

**Response**:
```json
{
  "success": true,
  "requestId": "req_xxx",
  "message": "Request interrupted successfully"
}
```

### List Models

**Endpoint**: `GET /v1/models`

**Response**:
```json
{
  "object": "list",
  "data": [
    {
      "id": "deepseek-chat",
      "object": "model",
      "owned_by": "deepseek"
    }
  ]
}
```

### Health Check

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "ok",
  "timestamp": 1730448000000,
  "activeRequests": 0
}
```

### Plugin Callback

**Endpoint**: `POST /plugin-callback/:pluginName/:taskId`

**Headers**:
- `Authorization: Bearer <CALLBACK_AUTH_TOKEN>`

**Request Body**:
```json
{
  "status": "success",
  "result": {
    "message": "Task completed",
    "data": {}
  }
}
```

---

## Troubleshooting

### Server Won't Start

**Issue**: Port already in use

**Solution**:
```bash
# Check what's using port 8088
netstat -ano | findstr :8088

# Kill the process
taskkill /PID <PID> /F

# Or change port in .env
PORT=8089
```

### LLM API Errors

**Issue**: 401 Unauthorized

**Solution**: Check your API key in `.env`

```env
DEEPSEEK_API_KEY=sk-xxx  # Must be valid
```

**Issue**: 429 Rate Limit

**Solution**: Wait or upgrade API plan

### Plugin Execution Timeout

**Issue**: Plugin takes too long

**Solution**: Increase timeout

```env
PLUGIN_TIMEOUT=60000  # 60 seconds
```

### RAG Search Returns No Results

**Issue**: Empty search results

**Solutions**:

1. **Check knowledge base exists**:
```bash
ls vector_store/
```

2. **Lower similarity threshold**:
```env
RAG_SIMILARITY_THRESHOLD=0.1
```

3. **Check vectorizer configuration**:
```env
# Ensure API key is valid
OPENAI_API_KEY=sk-xxx
```

### WebSocket Connection Failed

**Issue**: Can't connect to WebSocket

**Solution**: Check WS port

```env
WS_PORT=8089
```

Client should connect to `ws://localhost:8089`

### Memory Issues

**Issue**: High memory usage

**Solutions**:

1. **Reduce cache size**:
```env
RAG_DEFAULT_K=3
RAG_MAX_K=10
```

2. **Enable async result cleanup**:
```env
ASYNC_RESULT_CLEANUP_ENABLED=true
ASYNC_RESULT_MAX_AGE_DAYS=3
```

3. **Enable diary archive**:
```env
DIARY_ARCHIVE_ENABLED=true
DIARY_ARCHIVE_AFTER_DAYS=15
```

### Variable Not Resolving

**Issue**: Variable shows as literal text

**Possible causes**:

1. **Typo in namespace or key**:
```
{{time:nw}}  # Wrong! Should be {{time:now}}
```

2. **Missing configuration**:
```env
# For {{agent:name}} to work
AGENT_NAME=MyAgent
```

3. **Check variable format**:
```
{{namespace:key}}  # Correct
{{namespace key}}  # Wrong!
{namespace:key}    # Wrong!
```

---

## Best Practices

### 1. Security

- **Never commit `.env`** - Already in `.gitignore`
- **Use strong callback tokens**:
```env
CALLBACK_AUTH_TOKEN=$(openssl rand -hex 32)
```
- **Enable API authentication** in production:
```env
API_AUTH_TOKEN=your_secret_token
```

### 2. Performance

- **Use streaming** for better UX:
```json
{"stream": true}
```

- **Cache RAG results** - Already enabled by default

- **Clean up old data** periodically:
```env
ASYNC_RESULT_CLEANUP_ENABLED=true
DIARY_ARCHIVE_ENABLED=true
```

### 3. Plugin Development

- **Use standard format**:
```
tool_name:「始」PluginName「末」
```

- **Handle errors gracefully**:
```javascript
try {
  // Plugin logic
} catch (error) {
  console.log(JSON.stringify({
    success: false,
    error: error.message
  }));
  process.exit(1);
}
```

- **Exit promptly**:
```javascript
console.log(JSON.stringify(result));
process.exit(0);  // Important!
```

### 4. RAG Usage

- **Use appropriate modes**:
  - Simple queries → `basic`
  - Time-based → `time`
  - Broad topics → `group`
  - Precision needed → `rerank`

- **Configure semantic groups** for your domain:
```json
{
  "groups": [
    {
      "name": "YourDomain",
      "keywords": ["key1", "key2", "key3"]
    }
  ]
}
```

---

## Support

- **GitHub Issues**: https://github.com/suntianc/apex-bridge/issues
- **Documentation**: https://github.com/suntianc/apex-bridge
- **npm Package**: https://www.npmjs.com/package/apex-bridge

---

**Version**: 1.0.0  
**Last Updated**: 2025-11-01

