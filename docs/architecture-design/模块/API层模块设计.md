# API 层模块设计

> 所属模块：API
> 文档版本：v1.0.0
> 创建日期：2025-12-29

## 1. 模块概述

API 层是 ApexBridge 的对外接口层，提供 REST API 和 WebSocket 两种接入方式。

### 1.1 模块职责

- REST API 控制器
- 请求验证与响应
- WebSocket 连接管理
- 中间件链

### 1.2 目录结构

```
src/api/
├── controllers/
│   ├── ChatController.ts      # 聊天 API
│   ├── ProviderController.ts  # 提供商管理 API
│   └── ModelController.ts     # 模型管理 API
├── websocket/
│   ├── WebSocketManager.ts    # WebSocket 管理器
│   ├── ChatChannel.ts         # 聊天频道
│   └── types.ts               # WebSocket 类型定义
├── middleware/
│   ├── auth.ts                # 认证中间件
│   ├── rateLimit.ts           # 限流中间件
│   ├── validation.ts          # 验证中间件
│   ├── sanitization.ts        # 清理中间件
│   ├── securityHeaders.ts     # 安全头中间件
│   ├── securityLogging.ts     # 安全日志中间件
│   ├── auditLogging.ts        # 审计日志中间件
│   ├── errorHandler.ts        # 错误处理中间件
│   └── index.ts               # 中间件导出
└── routes/
    ├── chatRoutes.ts          # 聊天路由
    ├── providerRoutes.ts      # 提供商路由
    └── index.ts               # 路由注册
```

---

## 2. 核心组件

### 2.1 ChatController

**职责**：OpenAI 兼容的聊天 API

**端点**：
- `POST /v1/chat/completions` - 聊天完成
- `GET /v1/models` - 获取模型列表
- `POST /v1/interrupt` - 中断请求
- `POST /v1/sessions` - 创建会话
- `GET /v1/sessions/:id` - 获取会话

### 2.2 ProviderController

**职责**：LLM 提供商管理

**端点**：
- `GET /api/llm/providers` - 获取所有提供商
- `POST /api/llm/providers` - 创建提供商
- `GET /api/llm/providers/:id` - 获取提供商
- `PUT /api/llm/providers/:id` - 更新提供商
- `DELETE /api/llm/providers/:id` - 删除提供商

### 2.3 ModelController

**职责**：模型管理

**端点**：
- `GET /api/llm/models` - 获取所有模型
- `GET /api/llm/models/:id` - 获取模型详情
- `PUT /api/llm/models/:id` - 更新模型配置

### 2.4 WebSocketManager

**职责**：WebSocket 连接管理

**核心方法**：
- `handleConnection(ws: WebSocket)` - 处理新连接
- `handleMessage(ws: WebSocket, message: string)` - 处理消息
- `handleDisconnect(ws: WebSocket)` - 处理断开
- `send(ws: WebSocket, data: any)` - 发送消息
- `broadcast(channel: string, data: any)` - 广播消息

### 2.5 ChatChannel

**职责**：WebSocket 聊天频道

**核心方法**：
- `handleChatMessage(data: ChatMessageData)` - 处理聊天消息
- `handleInterrupt(data: InterruptData)` - 处理中断
- `startStreaming(responseId: string)` - 开始流式响应

---

## 3. 中间件链（15+ 层）

| 顺序 | 中间件 | 职责 |
|------|--------|------|
| 1 | CORS | 跨域资源共享 |
| 2 | Helmet | 安全头配置 |
| 3 | JSON Parse | 请求体解析 |
| 4 | Rate Limit | 请求限流 |
| 5 | Auth | 身份认证 |
| 6 | Sanitization | 输入清理 |
| 7 | Validation | 参数验证 |
| 8 | Audit Logging | 审计日志 |
| 9 | Security Logging | 安全日志 |
| 10 | Request ID | 请求 ID 注入 |
| 11 | Logger | 请求日志 |
| 12 | Compression | 响应压缩 |
| 13 | Error Handler | 错误处理 |
| 14 | Not Found | 404 处理 |
| 15 | Final Handler | 最终处理 |

---

## 4. 类图

```
┌─────────────────────────────────────────────────────────────────┐
│                      ChatController                             │
├─────────────────────────────────────────────────────────────────┤
│ - chatService: ChatService                                      │
│ - sessionManager: SessionManager                                │
├─────────────────────────────────────────────────────────────────┤
│ + chatCompletions(req, res)                                     │
│ + listModels(req, res)                                          │
│ + interrupt(req, res)                                           │
│ + createSession(req, res)                                       │
└─────────────────────────────────────────────────────────────────┘
         │
         v
┌─────────────────────────────────────────────────────────────────┐
│                    WebSocketManager                             │
├─────────────────────────────────────────────────────────────────┤
│ - connections: Map<string, WebSocket>                           │
│ - channels: Map<string, ChatChannel>                            │
├─────────────────────────────────────────────────────────────────┤
│ + handleConnection(ws)                                          │
│ + handleMessage(ws, message)                                    │
│ + handleDisconnect(ws)                                          │
│ + send(ws, data)                                                │
│ + broadcast(channel, data)                                      │
└─────────────────────────────────────────────────────────────────┘
         │
         v
┌─────────────────────────────────────────────────────────────────┐
│                      ChatChannel                                │
├─────────────────────────────────────────────────────────────────┤
│ - ws: WebSocket                                                 │
│ - sessionId: string                                             │
├─────────────────────────────────────────────────────────────────┤
│ + handleChatMessage(data)                                       │
│ + handleInterrupt(data)                                         │
│ + startStreaming(responseId)                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 数据结构

### 5.1 ChatCompletions Request

```typescript
interface ChatCompletionsRequest {
  model: string;
  messages: Message[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  self_thinking?: boolean;
}
```

### 5.2 WebSocket Chat Message

```typescript
interface WSChatMessage {
  type: 'chat' | 'interrupt' | 'heartbeat';
  sessionId: string;
  data: ChatData | InterruptData | null;
}

interface ChatData {
  messages: Message[];
  options?: {
    stream?: boolean;
    selfThinking?: boolean;
  };
}
```

### 5.3 Interrupt Data

```typescript
interface InterruptData {
  sessionId: string;
  requestId: string;
  reason?: string;
}
```

---

## 6. 配置项

```typescript
interface APIConfig {
  rest: {
    port: number;
    basePath: string;
    corsOrigins: string[];
  };
  websocket: {
    path: string;
    heartbeatInterval: number;
    heartbeatTimeout: number;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  auth: {
    enabled: boolean;
    jwtSecret: string;
    tokenExpiry: string;
  };
}
```

---

## 7. OpenAI 兼容性

### 7.1 兼容端点

| ApexBridge | OpenAI |
|------------|--------|
| `POST /v1/chat/completions` | `POST /v1/chat/completions` |
| `GET /v1/models` | `GET /v1/models` |
| `GET /v1/models/:id` | `GET /v1/models/:id` |

### 7.2 兼容请求格式

```typescript
// OpenAI 格式（完全兼容）
{
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "temperature": 0.7
}

// ApexBridge 扩展
{
  "model": "gpt-4",
  "messages": [...],
  "self_thinking": true,  // 启用 ReAct 思考
  "stream": true
}
```

---

## 8. 扩展点

### 8.1 新增 API 端点

1. 在 `controllers/` 创建控制器
2. 在 `routes/` 添加路由
3. 在 `middleware/` 添加必要中间件

### 8.2 新增 WebSocket 频道

1. 在 `websocket/` 创建频道类
2. 在 `WebSocketManager` 注册频道

### 8.3 新增中间件

1. 在 `middleware/` 创建中间件
2. 在 `src/server.ts` 中间件链中注册
