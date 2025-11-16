---
title: API文档
type: documentation
module: api
priority: high
environment: all
last-updated: 2025-11-16
---

# 📖 API文档

ApexBridge 提供的 RESTful API 和 WebSocket API 接口文档。

## 📋 API总览

### 基础信息

- **Base URL**: `http://localhost:3000/api`
- **协议**: HTTP/1.1, WebSocket
- **认证**: API Key 或 ABP_Key
- **数据格式**: JSON

### 认证方式

#### 方式1：API Key (Header)

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

#### 方式2：ABP_Key (Query参数)

```bash
curl -X POST "http://localhost:3000/api/chat?ABP_Key=YOUR_KEY" \
  -H "Content-Type: application/json"
```

#### 方式3：ABP_Key (WebSocket路径)

```javascript
const ws = new WebSocket('ws://localhost:3000/ABPlog/ABP_Key=YOUR_KEY');
```

---

## 🗨️ 聊天API

### 发送消息

**Endpoint**: `POST /api/chat`

**请求参数：**

```typescript
{
  "message": "string",              // 用户消息 (必填)
  "userId": "string",               // 用户ID (必填)
  "personalityId": "string",        // 人格ID (可选)
  "sessionId": "string",            // 会话ID (可选)
  "stream": boolean,                // 是否流式响应 (默认: false)
  "preferences": {                  // 用户偏好 (可选)
    "toolsDisclosure": "metadata|brief|full",
    // ...其他偏好
  },
  "context": {                      // 上下文 (可选)
    "lastMessages": Message[],
    "variables": Record<string, any>
  }
}
```

**响应示例：**

**非流式：**
```json
{
  "success": true,
  "data": {
    "response": "你好！很高兴为你服务。",
    "sessionId": "session-123",
    "toolCalls": [
      {
        "id": "call_123",
        "name": "calendar_task",
        "args": { "title": "会议" }
      }
    ],
    "metadata": {
      "model": "gpt-4",
      "tokens": 150,
      "duration": 3200
    }
  }
}
```

**流式：**
```javascript
// 响应是 Server-Sent Events (SSE)
// 每行格式: data: {"type":"content","content":"部分响应内容"}

data: {"type":"start"}
data: {"type":"content","content":"你好"}
data: {"type":"content","content":"你好！很高兴"}
data: {"type":"content","content":"你好！很高兴为你服务。"}
data: {"type":"end"}
```

**代码示例：**

```javascript
// JavaScript (Fetch API)
async function sendMessage(message, userId) {
  const response = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      message,
      userId,
      stream: false
    })
  });

  const result = await response.json();
  return result.data.response;
}
```

---

## 🧠 记忆API

### 保存记忆

**Endpoint**: `POST /api/memory/save`

**请求参数：**

```typescript
{
  "userId": "string",               // 用户ID (必填)
  "content": "string",              // 记忆内容 (必填)
  "type": "episodic|semantic",      // 记忆类型 (可选)
  "metadata": {                     // 元数据 (可选)
    "tags": ["工作", "重要"],
    "timestamp": "2025-11-16T10:00:00Z"
  }
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "memoryId": "mem_123",
    "saved": true,
    "timestamp": "2025-11-16T10:00:00Z"
  }
}
```

### 检索记忆

**Endpoint**: `POST /api/memory/recall`

**请求参数：**

```typescript
{
  "userId": "string",               // 用户ID (必填)
  "query": "string",                // 查询文本 (必填)
  "limit": number,                  // 返回数量 (可选, 默认: 10)
  "type": "episodic|semantic"       // 记忆类型筛选 (可选)
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "memories": [
      {
        "id": "mem_123",
        "content": "今天完成了项目部署",
        "type": "episodic",
        "score": 0.85,
        "timestamp": "2025-11-16T10:00:00Z",
        "metadata": {
          "tags": ["工作", "重要"]
        }
      }
    ],
    "count": 1
  }
}
```

---

## 🔧 Skills API

### 执行 Skill

**Endpoint**: `POST /api/skills/execute`

**请求参数：**

```typescript
{
  "skillId": "string",              // Skill ID (必填)
  "userId": "string",               // 用户ID (必填)
  "parameters": {                   // 执行参数 (可选)
    // Skill 特定参数
  },
  "metadata": {                     // 元数据 (可选)
    // 执行上下文
  }
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "executionId": "exec_123",
    "status": "completed",
    "result": {
      // Skill 执行结果
    },
    "duration": 450
  }
}
```

### 获取可用 Skills

**Endpoint**: `GET /api/skills/list`

**查询参数：**

```typescript
{
  "includeDisabled": boolean        // 是否包含禁用技能 (可选, 默认: false)
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "skills": [
      {
        "id": "WeatherInfo",
        "name": "天气信息",
        "description": "获取指定城市的天气信息",
        "category": "information",
        "enabled": true,
        "parameters": {
          "city": {
            "type": "string",
            "description": "城市名称",
            "required": true
          }
        }
      }
    ],
    "total": 1
  }
}
```

---

## 🎥 Stream API

### 创建流式会话

**Endpoint**: `POST /api/stream/create`

**请求参数：**

```typescript
{
  "userId": "string",               // 用户ID (必填)
  "personalityId": "string",        // 人格ID (可选)
  "metadata": {                     // 会话元数据 (可选)
    "source": "web",
    "clientVersion": "1.0.0"
  }
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "sessionId": "session_123",
    "streamId": "stream_456",
    "websocketUrl": "ws://localhost:3000/stream/session_123",
    "createdAt": "2025-11-16T10:00:00Z"
  }
}
```

### 流式消息

**WebSocket**: `ws://localhost:3000/stream/{sessionId}`

**消息格式：**

**发送消息：**
```json
{
  "type": "message",
  "data": {
    "content": "Hello!",
    "timestamp": 1234567890
  }
}
```

**接收消息：**
```json
{
  "type": "content",
  "data": {
    "content": "Hello! How can I help you?",
    "timestamp": 1234567890,
    "isComplete": false
  }
}
```

---

## ⚙️ 管理API

### 获取系统状态

**Endpoint**: `GET /api/admin/status`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 86400,
    "version": "1.0.1",
    "services": {
      "llm": "connected",
      "rag": "connected",
      "redis": "disconnected"
    },
    "stats": {
      "totalRequests": 1234,
      "activeConnections": 5,
      "memoryUsage": "256 MB"
    }
  }
}
```

### 获取配置

**Endpoint**: `GET /api/admin/config`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "general": {
      "server": {
        "port": 3000,
        "host": "localhost"
      }
    },
    "llm": {
      "provider": "openai",
      "model": "gpt-4"
    }
  }
}
```

### 更新配置

**Endpoint**: `POST /api/admin/config`

**请求参数：**

```typescript
{
  "path": "string",                 // 配置路径 (如: "llm.model")
  "value": any                       // 新值
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "updated": true,
    "path": "llm.model",
    "newValue": "gpt-4-turbo"
  }
}
```

---

## 📝 错误响应

### 错误格式

所有错误响应遵循统一格式：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": {                       // 可选
      // 详细错误信息
    }
  }
}
```

### 错误代码

| 错误代码 | HTTP状态码 | 描述 |
|---------|-----------|------|
| `INVALID_API_KEY` | 401 | API Key 无效或缺失 |
| `UNAUTHORIZED` | 403 | 权限不足 |
| `INVALID_PARAMETER` | 400 | 参数格式错误 |
| `RESOURCE_NOT_FOUND` | 404 | 资源不存在 |
| `SKILL_NOT_FOUND` | 404 | Skill 不存在 |
| `MEMORY_NOT_FOUND` | 404 | 记忆不存在 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |
| `SERVICE_UNAVAILABLE` | 503 | 服务不可用 |
| `RATE_LIMITED` | 429 | 请求过于频繁 |

**示例：**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_API_KEY",
    "message": "The API key provided is invalid or missing"
  }
}
```

---

## 🔌 WebSocket API

### 连接地址

**ABPLog 频道:**
```
ws://localhost:3000/ABPlog/ABP_Key=YOUR_KEY
ws://localhost:3000/log/ABP_Key=YOUR_KEY  # 兼容旧路径
```

**AdminPanel 频道:**
```
ws://localhost:3000/admin/ABP_Key=YOUR_KEY
```

### 消息格式

#### 连接确认

**服务器发送：**
```json
{
  "type": "connection_ack",
  "data": {
    "message": "Connected to ApexBridge ABPLog",
    "timestamp": 1234567890
  }
}
```

#### 工具执行日志

**服务器发送：**
```json
{
  "type": "tool_log",
  "data": {
    "tool_name": "calendar_task",
    "status": "executing",
    "content": "正在创建日历任务...",
    "timestamp": "2025-11-16T10:00:00Z"
  }
}
```

#### 通知消息

**服务器发送：**
```json
{
  "type": "notification",
  "data": {
    "message": "Skills 已更新",
    "level": "info",               // info/warn/error
    "timestamp": 1234567890
  }
}
```

### 客户端实现示例

**JavaScript (浏览器):**

```javascript
// 连接 WebSocket
const ws = new WebSocket('ws://localhost:3000/ABPlog/ABP_Key=your-key');

// 连接成功
ws.onopen = () => {
  console.log('WebSocket connected');
};

// 接收消息
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);

  if (message.type === 'tool_log') {
    console.log(`Tool ${message.data.tool_name}: ${message.data.status}`);
  }
};

// 错误处理
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

// 连接关闭
ws.onclose = () => {
  console.log('WebSocket disconnected');
};
```

**Node.js:**

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000/ABPlog/ABP_Key=your-key');

ws.on('open', () => {
  console.log('Connected to ApexBridge');
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Message:', message);
});

ws.on('error', (error) => {
  console.error('Error:', error.message);
});
```

---

## 🧪 测试与调试

### 使用 curl 测试

**聊天 API:**
```bash
# 发送消息
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, world!",
    "userId": "test-user"
  }'
```

**记忆 API:**
```bash
# 保存记忆
curl -X POST http://localhost:3000/api/memory/save \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "content": "今天完成了项目部署"
  }'
```

### 使用 Postman

1. **导入 OpenAPI 规范**
   - 地址: `http://localhost:3000/api/openapi.json`

2. **设置环境变量**
   ```
   baseUrl = http://localhost:3000
   apiKey = your-api-key
   ```

3. **配置认证**
   - 类型: API Key
   - 名称: Authorization
   - 位置: Header
   - 值: Bearer {{apiKey}}

---

## 📚 相关文档

- [⚙️ 配置指南](./CONFIGURATION.md)
- [🔧 故障排除](./TROUBLESHOOTING.md)
- [🧪 测试指南](./testing/README.md)

---

**最后更新**: 2025-11-16
**文档版本**: v1.0.1
**API版本**: v1
