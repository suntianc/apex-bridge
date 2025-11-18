# WebSocket 精简规范

## 变更类型
`MODIFIED`

## 变更范围
- 模块：`api/websocket/WebSocketManager.ts`
- 新增：`api/websocket/channels/ChatChannel.ts`
- 移除：`api/websocket/channels/DistributedServerChannel.ts` 相关代码
- 影响：server.ts（初始化变更）

## 目标
精简 WebSocket 功能，移除分布式节点通信，转型为实时对话通道，提供更直接的前端交互能力。

## REMOVED Requirements

### 移除能力 1：分布式服务器通道

#### 场景：不再支持分布式节点连接

**Given** 客户端尝试连接到 `/distributed-server/ABP_Key=xxx`
**When** WebSocketManager 处理连接请求
**Then** 应返回 1003（Unknown path）错误并关闭连接

**Given** 客户端尝试连接到 `/abp-distributed-server/ABP_Key=xxx`
**When** WebSocketManager 处理连接请求
**Then** 应返回 1003 错误并关闭连接

**影响：** 分布式节点（Worker/Companion）将无法连接到本节点
**缓解：** 本地执行所有 Skills，或通过 HTTP API 进行节点间通信

## MODIFIED Requirements

### 修改能力 1：WebSocket 路径路由

#### 场景：精简路径匹配逻辑

**Given** WebSocketManager 初始化连接处理器
**When** 收到 WebSocket 连接请求
**Then** 只匹配以下路径：
- `/ABPlog/ABP_Key=xxx` 或 `/log/ABP_Key=xxx` → ABPLogChannel
- `/chat/ABP_Key=xxx` 或 `/conversation/ABP_Key=xxx` → ChatChannel（新增）

**And** 不应再匹配：
- `/distributed-server/*`（已移除）
- `/abp-distributed-server/*`（已移除）

### 修改能力 2：WebSocketManager 初始化

#### 场景：更新构造函数依赖

**Given** server.ts 初始化 WebSocketManager
**When** 创建 WebSocketManager 实例
**Then** 应传入：
- config（配置）
- abpLogChannel（保留）
- chatChannel（新增）

**And** 不应再传入：
- distributedServerChannel（已移除）

## ADDED Requirements

### 新增能力 1：实时对话通道

#### 场景：通过 WebSocket 进行实时对话

**Given** 客户端连接到 `/chat/ABP_Key=valid_key`
**And** API Key 验证通过
**When** 客户端发送聊天消息
**Then** ChatChannel 应：
1. 验证 API Key
2. 解析消息（JSON）
3. 调用 ChatService.createChatCompletion()
4. 返回格式化的响应

**消息格式：**
```json
{
  "type": "chat",
  "payload": {
    "messages": [{"role": "user", "content": "Hello"}],
    "options": {"model": "gpt-4o-mini"}
  }
}
```

**响应格式：**
```json
{
  "type": "chat_response",
  "payload": {
    "id": "chat-123",
    "object": "chat.completion",
    "choices": [{
      "message": {"role": "assistant", "content": "Hi there!"}
    }]
  }
}
```

### 新增能力 2：流式响应通道

#### 场景：通过 WebSocket 进行流式对话

**Given** 客户端连接到 `/chat/ABP_Key=valid_key`
**And** API Key 验证通过
**When** 客户端发送流式聊天消息
**Then** ChatChannel 应：
1. 验证 API Key
2. 解析消息
3. 调用 ChatService.createStreamChatCompletion()
4. 逐块返回响应（Server-Sent Events 风格）
5. 发送完成标记

**消息格式：**
```json
{
  "type": "stream_chat",
  "payload": {
    "messages": [{"role": "user", "content": "Tell a story"}],
    "options": {"model": "gpt-4o-mini", "stream": true}
  }
}
```

**响应格式（多帧）：**
```json
// 帧 1-N
{
  "type": "stream_chunk",
  "payload": "Once upon a time..."
}

// 最后一帧
{
  "type": "stream_done"
}
```

### 新增能力 3：错误处理和状态推送

#### 场景：实时推送错误和状态信息

**Given** 对话处理过程中发生错误
**When** 错误捕获
**Then** ChatChannel 应发送错误消息：
```json
{
  "type": "error",
  "error": "Invalid API key"
}
```

**Given** 对话处理需要用户授权（工具调用）
**When** 工具授权流程触发
**Then** ChatChannel 应发送授权请求消息（未来扩展）

## 技术方案

### 文件变更

```
src/api/websocket/
├── WebSocketManager.ts
│   - 移除 distributed-server 路由匹配（第 58-73 行）
│   + 添加 chat 路由匹配
│
├── channels/
│   ├── ABPLogChannel.ts（保持不变）
│   └── ChatChannel.ts（新增）
│       - 实现 handleConnection 方法
│       - 支持 chat 消息类型
│       - 支持 stream_chat 消息类型
│       - 错误处理
│
└── channels/DistributedServerChannel.ts（逻辑删除，文件保留但内容清空或标记废弃）

src/server.ts
└── 修改 WebSocketManager 初始化：
    - 移除 DistributedService 注入
    + 添加 ChatService 注入
    + 创建 ChatChannel 实例
```

### ChatChannel 实现

```typescript
// src/api/websocket/channels/ChatChannel.ts

export class ChatChannel {
  constructor(private chatService: ChatService) {}

  handleConnection(ws: WebSocket, apiKey: string, request: any): void {
    // 1. 验证 API Key
    if (!this.validateApiKey(apiKey)) {
      ws.close(1008, 'Invalid API key');
      return;
    }

    // 2. 监听消息
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'chat':
            await this.handleChat(ws, message.payload);
            break;

          case 'stream_chat':
            await this.handleStreamChat(ws, message.payload);
            break;

          default:
            ws.send(JSON.stringify({
              type: 'error',
              error: `Unknown message type: ${message.type}`
            }));
        }
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          error: error.message
        }));
      }
    });

    // 3. 监听关闭
    ws.on('close', () => {
      logger.debug('Chat WebSocket connection closed');
    });
  }

  private async handleChat(ws: WebSocket, payload: any): Promise<void> {
    const { messages, options } = payload;

    // 调用 ChatService
    const response = await this.chatService.createChatCompletion({
      messages,
      ...options
    });

    // 返回结果
    ws.send(JSON.stringify({
      type: 'chat_response',
      payload: response
    }));
  }

  private async handleStreamChat(ws: WebSocket, payload: any): Promise<void> {
    const { messages, options } = payload;

    // 调用 ChatService（流式）
    const stream = await this.chatService.createStreamChatCompletion({
      messages,
      ...options
    });

    // 逐块发送
    for await (const chunk of stream) {
      ws.send(JSON.stringify({
        type: 'stream_chunk',
        payload: chunk
      }));
    }

    // 发送完成标记
    ws.send(JSON.stringify({
      type: 'stream_done'
    }));
  }

  private validateApiKey(apiKey: string): boolean {
    const expectedKey = process.env.API_KEY || this.config.auth.apiKey;
    return apiKey === expectedKey;
  }
}
```

### server.ts 更新

```typescript
// src/server.ts

// 1. 注入 ChatService 到 WebSocketManager
const chatChannel = new ChatChannel(chatService);

const wsManager = new WebSocketManager(
  config,
  abpLogChannel,
  chatChannel  // 新增
);

// 2. 删除 DistributedService 注入（不再需要）
// const distributedService = new DistributedService(config);
// wsManager.setDistributedService(distributedService);  // 已移除
```

## 使用示例

### JavaScript 客户端

```javascript
// 连接到 Chat 通道
const ws = new WebSocket('ws://localhost:3000/chat/ABP_Key=your_api_key');

// 监听消息
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'chat_response':
      console.log('AI:', data.payload.choices[0].message.content);
      break;

    case 'stream_chunk':
      process.stdout.write(data.payload);  // 实时输出
      break;

    case 'stream_done':
      console.log('\n流式响应完成');
      break;

    case 'error':
      console.error('Error:', data.error);
      break;
  }
};

// 发送普通对话
ws.send(JSON.stringify({
  type: 'chat',
  payload: {
    messages: [{ role: 'user', content: 'Hello!' }],
    options: { model: 'gpt-4o-mini', temperature: 0.7 }
  }
}));

// 发送流式对话
ws.send(JSON.stringify({
  type: 'stream_chat',
  payload: {
    messages: [{ role: 'user', content: 'Tell me a story' }],
    options: { model: 'gpt-4o-mini', stream: true }
  }
}));
```

### React Hook 示例

```typescript
import { useEffect, useState } from 'react';

function useChatWebSocket(apiKey: string) {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const websocket = new WebSocket(`ws://localhost:3000/chat/ABP_Key=${apiKey}`);

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'chat_response') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.payload.choices[0].message.content
        }]);
      }
    };

    setWs(websocket);

    return () => websocket.close();
  }, [apiKey]);

  const sendMessage = (content: string) => {
    if (ws) {
      ws.send(JSON.stringify({
        type: 'chat',
        payload: {
          messages: [...messages, { role: 'user', content }],
          options: { model: 'gpt-4o-mini' }
        }
      }));
    }
  };

  return { messages, sendMessage };
}
```

## 兼容性要求

### 场景：向后兼容（运行时）

**Given** 客户端使用旧版 API（HTTP）
**When** 系统升级为精简版
**Then** HTTP API 应保持正常工作

### 场景：前端 WebSocket 升级

**Given** 前端需要从 HTTP 轮询升级到 WebSocket
**When** 切换到 WebSocket 实现
**Then** 需要提供清晰的迁移指南和示例代码

## 测试策略

### 单元测试

1. **WebSocketManager 路由测试**
   - 测试 ABPLog 路径匹配
   - 测试 Chat 路径匹配
   - 测试未知路径返回 1003

2. **ChatChannel 测试**
   - 测试 API Key 验证
   - 测试 chat 消息处理
   - 测试 stream_chat 消息处理
   - 测试错误处理
   - 测试关闭连接

### 集成测试

1. **完整对话流程**
   - 客户端连接 → 发送消息 → 接收响应 → 关闭连接

2. **流式响应流程**
   - 客户端连接 → 发送流式消息 → 接收多帧 → 接收完成标记

3. **错误场景**
   - 无效 API Key
   - 无效消息格式
   - ChatService 抛出异常

## 性能考虑

### WebSocket vs HTTP

- **连接开销**：WebSocket 一次握手，长期使用
- **实时性**：WebSocket 全双工，延迟更低
- **流式响应**：WebSocket 原生支持，无需 Server-Sent Events

### 连接管理

- **心跳检测**：实现 ping/pong 保持连接活跃
- **连接池**：防止单个客户端创建过多连接（限制每 IP/API Key）
- **自动重连**：客户端断开时，前端自动重连

## 部署注意事项

### 负载均衡器

如果使用负载均衡器（Nginx/AWS ALB）：

```nginx
# Nginx 配置
location /chat/ {
  proxy_pass http://backend;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

### 防火墙

确保 WebSocket 端口（通常是 80/443）开放。

## 相关任务

- [ ] 修改 WebSocketManager，移除 distributed-server 路由
- [ ] 创建 ChatChannel.ts
- [ ] 实现 ChatChannel.handleConnection()
- [ ] 实现 ChatChannel.handleChat()
- [ ] 实现 ChatChannel.handleStreamChat()
- [ ] 更新 server.ts，注入 ChatService 到 WebSocketManager
- [ ] 更新 server.ts，创建 ChatChannel 实例
- [ ] 编写 ChatChannel 单元测试
- [ ] 编写 WebSocket 集成测试
- [ ] 创建前端使用示例（JavaScript/React）
- [ ] 更新 API 文档（WebSocket 部分）
- [ ] 更新部署文档（负载均衡器配置）
