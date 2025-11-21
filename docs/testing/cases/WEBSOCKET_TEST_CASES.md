# WebSocket 测试用例 (WebSocket Test Cases)

> **模块**: WebSocket 通信  
> **优先级**: P1  
> **最后更新**: 2025-01-XX

## 📋 测试概述

本文档包含 ApexBridge WebSocket 功能的详细测试用例，覆盖连接管理、消息传输、实时通信等功能。

### 测试范围

- ✅ WebSocket 连接建立（带 API Key 认证）
- ✅ 普通聊天消息（非流式）
- ✅ 流式聊天消息
- ✅ 请求中断机制（stop）
- ✅ 连接中断和重连
- ✅ 并发连接
- ✅ 心跳和超时（ping/pong）
- ✅ 错误处理

### WebSocket 端点

- **连接地址**: `ws://localhost:8088/chat/api_key=<API_KEY>` 或 `ws://localhost:8088/v1/chat/api_key=<API_KEY>`
- **协议**: WebSocket (RFC 6455)
- **消息格式**: JSON
- **认证方式**: API Key 通过 URL 参数传递

### 前置条件

- ApexBridge 服务已启动（默认端口 8088）
- WebSocket 服务已初始化
- 已配置 API Key（环境变量 `API_KEY` 或配置文件）
- 安装了 WebSocket 客户端工具（wscat 或浏览器插件）

---

## 基础连接测试

### 用例 WS-001: WebSocket 连接建立（带 API Key）

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证 WebSocket 连接能够成功建立，包括 API Key 认证。

#### 测试步骤

**方法 1: 使用 wscat**

```bash
# 安装 wscat (如果未安装)
npm install -g wscat

# 连接 WebSocket（需要替换为实际的 API Key）
wscat -c "ws://localhost:8088/chat/api_key=your-api-key-here"
```

**方法 2: 使用 Node.js 脚本**

```javascript
// test-ws-connection.js
const WebSocket = require('ws');

// ✅ 根据当前架构：API Key 通过 URL 参数传递
const API_KEY = process.env.API_KEY || 'default-api-key';
const ws = new WebSocket(`ws://localhost:8088/chat/api_key=${API_KEY}`);

ws.on('open', () => {
  console.log('✅ WebSocket 连接成功建立');
  ws.close();
});

ws.on('error', (error) => {
  console.error('❌ 连接失败:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 连接关闭 - 状态码: ${code}, 原因: ${reason.toString()}`);
});
```

运行：
```bash
# 设置 API Key（如果使用环境变量）
export API_KEY=your-api-key-here
node test-ws-connection.js
```

**方法 3: 使用浏览器 Console**

```javascript
// ✅ 根据当前架构：API Key 通过 URL 参数传递
const API_KEY = 'your-api-key-here';
const ws = new WebSocket(`ws://localhost:8088/chat/api_key=${API_KEY}`);

ws.onopen = () => {
  console.log('✅ 连接成功');
};

ws.onerror = (error) => {
  console.error('❌ 连接失败', error);
};

ws.onclose = (event) => {
  console.log('🔌 连接关闭', event.code, event.reason);
};
```

#### 预期结果

- 连接成功建立
- 无错误消息
- 服务器日志显示连接已接受

#### 验证点

- [ ] WebSocket 连接成功 (readyState = 1)
- [ ] 无连接错误
- [ ] 服务器日志显示 "API_Key validated, accepting chat connection"
- [ ] 使用无效 API Key 时连接被拒绝（状态码 1008）

#### 通过标准

使用有效 API Key 时连接成功建立，使用无效 API Key 时连接被拒绝。

---

### 用例 WS-002: 普通聊天消息（非流式）

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证通过 WebSocket 发送普通聊天消息并接收完整响应。

#### 测试步骤

**使用 wscat**:

```bash
# 连接
wscat -c "ws://localhost:8088/chat/api_key=your-api-key-here"

# ✅ 根据当前架构：消息格式为 { type: 'chat', payload: { messages: [...] } }
> {"type":"chat","payload":{"messages":[{"role":"user","content":"你好"}]}}
```

**使用 Node.js 脚本**:

```javascript
// test-ws-chat.js
const WebSocket = require('ws');

const API_KEY = process.env.API_KEY || 'default-api-key';
const ws = new WebSocket(`ws://localhost:8088/chat/api_key=${API_KEY}`);

ws.on('open', () => {
  console.log('✅ 连接已建立\n');
  
  // ✅ 根据当前架构：发送格式化的消息
  const message = {
    type: 'chat',
    payload: {
      messages: [
        { role: 'user', content: '你好，这是测试消息' }
      ]
    }
  };
  
  ws.send(JSON.stringify(message));
  console.log('📤 消息已发送:', JSON.stringify(message, null, 2));
});

ws.on('message', (data) => {
  try {
    const response = JSON.parse(data.toString());
    console.log('\n📨 收到响应:');
    console.log(JSON.stringify(response, null, 2));
    
    // ✅ 根据当前架构：响应类型为 'chat_response'
    if (response.type === 'chat_response') {
      console.log('\n✅ 收到完整响应');
    } else if (response.type === 'error') {
      console.error('❌ 错误:', response.error);
    }
    
    ws.close();
  } catch (error) {
    console.error('❌ 解析响应失败:', error.message);
    ws.close();
  }
});

ws.on('error', (error) => {
  console.error('❌ 错误:', error.message);
});
```

#### 预期结果

- 消息成功发送
- 收到服务器响应（类型为 `chat_response`）
- 响应包含完整的聊天内容

#### 验证点

- [ ] 消息发送成功
- [ ] 收到 `chat_response` 类型的响应
- [ ] 响应格式为 JSON
- [ ] 响应包含有效内容（payload.content）

#### 通过标准

消息成功发送并收到完整的 `chat_response` 响应。

---

### 用例 WS-003: 流式聊天消息接收

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证通过 WebSocket 接收流式聊天响应的功能。

#### 测试步骤

```javascript
// test-ws-stream.js
const WebSocket = require('ws');

const API_KEY = process.env.API_KEY || 'default-api-key';
const ws = new WebSocket(`ws://localhost:8088/chat/api_key=${API_KEY}`);

ws.on('open', () => {
  console.log('✅ 连接已建立\n');
  
  // ✅ 根据当前架构：使用 stream_chat 类型
  const request = {
    type: 'stream_chat',
    payload: {
      messages: [
        { role: 'user', content: '请用50字介绍人工智能' }
      ]
    }
  };
  
  ws.send(JSON.stringify(request));
  console.log('📤 已发送流式聊天请求\n');
});

let chunkCount = 0;
let fullContent = '';
let requestId = null;

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    // ✅ 根据当前架构：响应类型为 stream_chunk, meta_event, stream_done
    if (message.type === 'meta_event') {
      // 记录 requestId（用于中断）
      if (message.payload?.requestId) {
        requestId = message.payload.requestId;
        console.log(`📌 Request ID: ${requestId}\n`);
      }
    } else if (message.type === 'stream_chunk') {
      chunkCount++;
      const content = message.payload?.choices?.[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        process.stdout.write(content); // 实时显示
      }
    } else if (message.type === 'stream_done') {
      console.log('\n\n✅ 流式响应完成');
      console.log(`📊 总共接收 ${chunkCount} 个数据块`);
      console.log(`📝 完整内容长度: ${fullContent.length} 字符`);
      ws.close();
    } else if (message.type === 'error') {
      console.error('\n❌ 错误:', message.error);
      ws.close();
    }
  } catch (error) {
    console.error('❌ 解析错误:', error.message);
  }
});

ws.on('close', () => {
  console.log('\n🔌 连接已关闭');
});

ws.on('error', (error) => {
  console.error('❌ WebSocket 错误:', error.message);
});
```

运行：
```bash
export API_KEY=your-api-key-here
node test-ws-stream.js
```

#### 预期结果

- 接收到 `meta_event` 消息（包含 requestId）
- 接收到多个 `stream_chunk` 消息
- 数据块按顺序到达
- 最后接收到 `stream_done` 消息
- 能够实时显示内容

#### 验证点

- [ ] 接收到 `meta_event` 消息（包含 requestId）
- [ ] 接收到多个 `stream_chunk` 消息（>= 5个）
- [ ] 每个 chunk 包含有效内容
- [ ] 最后接收到 `stream_done` 消息
- [ ] 内容完整且连贯
- [ ] 无数据丢失

#### 通过标准

流式消息正确接收，内容完整，包含所有必要的消息类型。

---

### 用例 WS-004: 消息格式验证

**优先级**: P1  
**类型**: 异常测试

#### 测试目标

验证发送无效格式消息时的处理。

#### 测试步骤

**测试 1: 无效 JSON**

```bash
# 使用 wscat
wscat -c "ws://localhost:8088/chat/api_key=your-api-key-here"

# 发送无效 JSON
> {invalid json}
```

**测试 2: 缺少必需字段**

```bash
# 发送缺少 type 字段的消息
> {"payload":{"messages":[{"role":"user","content":"测试"}]}}
```

**测试 3: 无效的消息类型**

```bash
# 发送未知类型的消息
> {"type":"unknown","payload":{"messages":[{"role":"user","content":"测试"}]}}
```

**测试 4: 缺少 payload**

```bash
# 发送缺少 payload 的消息（chat 类型需要 payload）
> {"type":"chat"}
```

#### 预期结果

- 服务器返回 `error` 类型的消息
- 连接不会断开（优雅处理）
- 错误消息包含有用信息

#### 验证点

- [ ] 无效 JSON 被拒绝，返回错误消息
- [ ] 缺少必需字段时返回明确的错误消息
- [ ] 无效消息类型时返回错误消息
- [ ] 连接保持活跃
- [ ] 后续消息仍可正常发送

#### 通过标准

优雅地处理无效消息，返回明确的错误信息，不影响后续通信。

---

## 连接管理测试

### 用例 WS-005: 连接正常断开

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证 WebSocket 连接的正常断开机制。

#### 测试步骤

**客户端主动断开**:

```javascript
// test-ws-close.js
const WebSocket = require('ws');

const API_KEY = process.env.API_KEY || 'default-api-key';
const ws = new WebSocket(`ws://localhost:8088/chat/api_key=${API_KEY}`);

ws.on('open', () => {
  console.log('✅ 连接已建立');
  
  // 2 秒后主动断开
  setTimeout(() => {
    console.log('🔌 客户端主动断开连接...');
    ws.close(1000, '正常关闭'); // 1000 = 正常关闭状态码
  }, 2000);
});

ws.on('close', (code, reason) => {
  console.log(`✅ 连接已关闭 - 状态码: ${code}, 原因: ${reason.toString()}`);
});

ws.on('error', (error) => {
  console.error('❌ 错误:', error.message);
});
```

**使用 wscat**:

```bash
# 连接后按 Ctrl+C 断开
wscat -c "ws://localhost:8088/chat/api_key=your-api-key-here"
# ... 按 Ctrl+C
```

#### 预期结果

- 连接正常关闭
- 关闭状态码为 1000
- 服务器正确处理断开事件
- 如果有正在进行的请求，自动中断

#### 验证点

- [ ] close 事件被触发
- [ ] 状态码为 1000 (正常关闭)
- [ ] 无错误日志
- [ ] 服务器释放资源
- [ ] 正在进行的请求被自动中断

#### 通过标准

连接正常断开，资源被正确释放，请求被正确中断。

---

### 用例 WS-006: 连接异常断开和重连

**优先级**: P1  
**类型**: 异常测试

#### 测试目标

验证连接异常断开后的重连机制。

#### 测试步骤

```javascript
// test-ws-reconnect.js
const WebSocket = require('ws');

const API_KEY = process.env.API_KEY || 'default-api-key';
let reconnectAttempts = 0;
const maxReconnectAttempts = 3;
let ws;

function connect() {
  ws = new WebSocket(`ws://localhost:8088/chat/api_key=${API_KEY}`);
  
  ws.on('open', () => {
    console.log('✅ 连接已建立');
    reconnectAttempts = 0; // 重置重连计数
    
    // 发送测试消息
    ws.send(JSON.stringify({
      type: 'chat',
      payload: {
        messages: [{ role: 'user', content: '测试连接' }]
      }
    }));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📨 收到消息:', message.type);
  });
  
  ws.on('close', (code) => {
    console.log(`🔌 连接关闭 - 状态码: ${code}`);
    
    // 如果不是正常关闭，尝试重连
    if (code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      console.log(`🔄 尝试重连 (${reconnectAttempts}/${maxReconnectAttempts})...`);
      setTimeout(connect, 2000); // 2秒后重连
    } else if (reconnectAttempts >= maxReconnectAttempts) {
      console.log('❌ 达到最大重连次数，停止重连');
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ 连接错误:', error.message);
  });
}

// 开始连接
connect();

// 测试：10秒后模拟异常断开
setTimeout(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('\n⚠️  模拟异常断开...');
    ws.terminate(); // 强制断开（不发送关闭帧）
  }
}, 10000);
```

#### 预期结果

- 检测到连接断开
- 自动尝试重连
- 重连成功后恢复通信

#### 验证点

- [ ] 检测到连接断开
- [ ] 触发重连逻辑
- [ ] 重连成功
- [ ] 重连后可正常通信

#### 通过标准

重连机制正常工作，能够恢复通信。

---

### 用例 WS-007: 并发连接测试

**优先级**: P2  
**类型**: 性能测试

#### 测试目标

验证服务器处理多个并发 WebSocket 连接的能力。

#### 测试步骤

```javascript
// test-ws-concurrent.js
const WebSocket = require('ws');

const API_KEY = process.env.API_KEY || 'default-api-key';
const CONNECTION_COUNT = 10;
const connections = [];

console.log(`🚀 创建 ${CONNECTION_COUNT} 个并发连接...\n`);

for (let i = 0; i < CONNECTION_COUNT; i++) {
  const ws = new WebSocket(`ws://localhost:8088/chat/api_key=${API_KEY}`);
  
  ws.on('open', () => {
    console.log(`✅ 连接 ${i + 1} 已建立`);
    
    // 发送测试消息
    ws.send(JSON.stringify({
      type: 'chat',
      payload: {
        messages: [{ role: 'user', content: `来自连接 ${i + 1} 的消息` }]
      }
    }));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log(`📨 连接 ${i + 1} 收到响应: ${message.type}`);
  });
  
  ws.on('error', (error) => {
    console.error(`❌ 连接 ${i + 1} 错误:`, error.message);
  });
  
  connections.push(ws);
}

// 30秒后关闭所有连接
setTimeout(() => {
  console.log('\n🔌 关闭所有连接...');
  connections.forEach((ws, i) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
      console.log(`✅ 连接 ${i + 1} 已关闭`);
    }
  });
}, 30000);
```

运行：
```bash
export API_KEY=your-api-key-here
node test-ws-concurrent.js
```

#### 预期结果

- 所有连接都能成功建立
- 每个连接都能正常通信
- 无连接失败或超时
- 服务器资源占用合理

#### 验证点

- [ ] 所有 10 个连接成功建立
- [ ] 每个连接都能发送/接收消息
- [ ] 无连接超时
- [ ] 服务器稳定运行
- [ ] 内存占用合理

#### 通过标准

能够稳定处理 10 个并发 WebSocket 连接。

---

## 高级功能测试

### 用例 WS-008: 请求中断机制（stop）

**优先级**: P1  
**类型**: 功能测试

#### 测试目标

验证通过 WebSocket 中断正在进行的流式请求。

#### 测试步骤

```javascript
// test-ws-interrupt.js
const WebSocket = require('ws');

const API_KEY = process.env.API_KEY || 'default-api-key';
const ws = new WebSocket(`ws://localhost:8088/chat/api_key=${API_KEY}`);

let requestId = null;

ws.on('open', () => {
  console.log('✅ 连接已建立\n');
  
  // ✅ 根据当前架构：发送流式聊天请求
  const request = {
    type: 'stream_chat',
    payload: {
      messages: [
        { role: 'user', content: '请写一篇1000字的文章关于人工智能的发展' }
      ]
    }
  };
  
  ws.send(JSON.stringify(request));
  console.log('📤 已发送长时间请求\n');
  
  // 3秒后发送中断请求
  setTimeout(() => {
    if (requestId) {
      console.log(`\n⚠️  发送中断请求 (Request ID: ${requestId})...`);
      // ✅ 根据当前架构：使用 stop 类型中断请求
      ws.send(JSON.stringify({
        type: 'stop'
      }));
    } else {
      console.log('\n⚠️  未获取到 Request ID，无法中断');
    }
  }, 3000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    // 记录 requestId
    if (message.type === 'meta_event' && message.payload?.requestId) {
      requestId = message.payload.requestId;
      console.log(`📌 Request ID: ${requestId}\n`);
    }
    
    if (message.type === 'stream_chunk') {
      const content = message.payload?.choices?.[0]?.delta?.content || '';
      process.stdout.write(content);
    } else if (message.type === 'status') {
      // ✅ 根据当前架构：中断确认消息类型为 'status'
      if (message.payload?.status === 'interrupted') {
        console.log('\n\n✅ 请求已成功中断');
        console.log(`📊 中断状态: ${message.payload.success ? '成功' : '失败'}`);
        ws.close();
      } else if (message.payload?.status === 'no_active_request') {
        console.log('\n\n⚠️  没有正在进行的请求');
        ws.close();
      }
    } else if (message.type === 'stream_done') {
      console.log('\n\n⚠️  请求在中断前完成');
      ws.close();
    } else if (message.type === 'error') {
      console.error('\n❌ 错误:', message.error);
      ws.close();
    }
  } catch (error) {
    console.error('❌ 解析错误:', error.message);
  }
});

ws.on('close', () => {
  console.log('🔌 连接已关闭');
});

ws.on('error', (error) => {
  console.error('❌ 错误:', error.message);
});
```

#### 预期结果

- 流式请求开始执行
- 接收到 `meta_event` 消息（包含 requestId）
- 中断请求被处理
- 原请求被终止
- 收到 `status` 类型的确认消息（status: 'interrupted'）

#### 验证点

- [ ] 原请求开始执行
- [ ] 接收到 `meta_event` 消息（包含 requestId）
- [ ] 中断消息被接受
- [ ] 原请求被终止
- [ ] 收到 `status` 消息（status: 'interrupted'）
- [ ] 资源被正确释放

#### 通过标准

中断机制正常工作，请求被正确终止，收到明确的确认消息。

---

### 用例 WS-009: 心跳和超时机制

**优先级**: P2  
**类型**: 功能测试

#### 测试目标

验证 WebSocket 心跳（ping/pong）和超时机制。

#### 测试步骤

```javascript
// test-ws-heartbeat.js
const WebSocket = require('ws');

const API_KEY = process.env.API_KEY || 'default-api-key';
const ws = new WebSocket(`ws://localhost:8088/chat/api_key=${API_KEY}`);

let pingCount = 0;
let pongCount = 0;

ws.on('open', () => {
  console.log('✅ 连接已建立');
  console.log('⏱️  监听心跳（服务器每 30 秒 ping）...\n');
});

// ✅ 根据当前架构：服务器每 30 秒发送 ping，客户端需要响应 pong
ws.on('ping', (data) => {
  pingCount++;
  console.log(`💓 [${new Date().toLocaleTimeString()}] 收到 ping #${pingCount}:`, data.toString());
  // WebSocket 库会自动回复 pong，无需手动处理
});

ws.on('pong', (data) => {
  pongCount++;
  console.log(`💓 [${new Date().toLocaleTimeString()}] 收到 pong #${pongCount}:`, data.toString());
});

// 客户端也可以主动发送 ping
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log('📤 客户端主动发送 ping...');
    ws.ping('client-ping');
  }
}, 60000); // 每60秒发送一次

ws.on('close', (code, reason) => {
  console.log(`\n🔌 连接关闭`);
  console.log(`   状态码: ${code}`);
  console.log(`   原因: ${reason.toString()}`);
  console.log(`   收到 ${pingCount} 个 ping, ${pongCount} 个 pong`);
});

ws.on('error', (error) => {
  console.error('❌ 错误:', error.message);
});

// 保持连接 2 分钟
setTimeout(() => {
  console.log('\n⏰ 测试时间结束，关闭连接');
  ws.close();
}, 120000);
```

#### 预期结果

- 接收到服务器的 ping 消息（每 30 秒）
- 自动回复 pong 消息
- 连接保持活跃
- 无超时断开

#### 验证点

- [ ] 接收到 ping 消息（至少 2 次，因为测试持续 2 分钟）
- [ ] 自动回复 pong（WebSocket 库自动处理）
- [ ] 连接保持活跃
- [ ] 无超时断开
- [ ] 如果客户端不响应 pong，连接会被服务器终止

#### 通过标准

心跳机制正常工作，连接保持稳定，服务器能够检测并清理无响应的连接。

---

### 用例 WS-010: 大消息传输

**优先级**: P2  
**类型**: 边界测试

#### 测试目标

验证 WebSocket 处理大消息的能力。

#### 测试步骤

```javascript
// test-ws-large-message.js
const WebSocket = require('ws');

const API_KEY = process.env.API_KEY || 'default-api-key';
const ws = new WebSocket(`ws://localhost:8088/chat/api_key=${API_KEY}`);

ws.on('open', () => {
  console.log('✅ 连接已建立\n');
  
  // 生成大消息（约 10KB）
  const largeContent = '这是测试内容。'.repeat(1000);
  
  // ✅ 根据当前架构：消息格式
  const message = {
    type: 'chat',
    payload: {
      messages: [
        { 
          role: 'user', 
          content: `请总结以下内容：${largeContent}` 
        }
      ]
    }
  };
  
  const messageSize = JSON.stringify(message).length;
  console.log(`📦 消息大小: ${(messageSize / 1024).toFixed(2)} KB`);
  console.log('📤 发送大消息...\n');
  
  ws.send(JSON.stringify(message));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📨 收到响应类型:', message.type);
  if (message.type === 'chat_response') {
    const responseSize = JSON.stringify(message).length;
    console.log(`📦 响应大小: ${(responseSize / 1024).toFixed(2)} KB`);
  }
  ws.close();
});

ws.on('close', () => {
  console.log('\n🔌 连接已关闭');
});

ws.on('error', (error) => {
  console.error('❌ 错误:', error.message);
});
```

#### 预期结果

- 大消息成功发送
- 服务器正确处理
- 接收到响应
- 无消息截断或丢失

#### 验证点

- [ ] 大消息成功发送
- [ ] 服务器正确接收
- [ ] 收到完整响应
- [ ] 无错误或超时

#### 通过标准

能够正确处理 10KB 以上的消息。

---

## 错误处理测试

### 用例 WS-011: 无效 API Key

**优先级**: P1  
**类型**: 异常测试

#### 测试目标

验证使用无效 API Key 时的错误处理。

#### 测试步骤

```javascript
// test-ws-invalid-api-key.js
const WebSocket = require('ws');

// 使用无效的 API Key
const ws = new WebSocket('ws://localhost:8088/chat/api_key=invalid-key-12345');

ws.on('open', () => {
  console.log('⚠️  意外：连接成功（不应该发生）');
  ws.close();
});

ws.on('error', (error) => {
  console.log('✅ 预期的错误:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`✅ 连接关闭`);
  console.log(`   状态码: ${code} (1008 = 策略违规，表示认证失败)`);
  console.log(`   原因: ${reason.toString()}`);
});
```

#### 预期结果

- 连接失败或被立即关闭
- 关闭状态码为 1008（策略违规）
- 原因包含 "Invalid API key"

#### 验证点

- [ ] 连接被拒绝或立即关闭
- [ ] close 事件被触发
- [ ] 状态码为 1008（策略违规）
- [ ] 错误消息明确

#### 通过标准

正确处理无效 API Key，返回明确的错误信息。

---

### 用例 WS-012: 连接到错误端点

**优先级**: P1  
**类型**: 异常测试

#### 测试目标

验证连接到不存在的 WebSocket 端点时的错误处理。

#### 测试步骤

```javascript
// test-ws-invalid-endpoint.js
const WebSocket = require('ws');

const API_KEY = process.env.API_KEY || 'default-api-key';
// ✅ 根据当前架构：只有 /chat/api_key=xxx 和 /v1/chat/api_key=xxx 是有效端点
const ws = new WebSocket(`ws://localhost:8088/invalid-endpoint/api_key=${API_KEY}`);

ws.on('open', () => {
  console.log('⚠️  意外：连接成功（不应该发生）');
});

ws.on('error', (error) => {
  console.log('✅ 预期的错误:', error.message);
});

ws.on('close', (code) => {
  console.log(`✅ 连接关闭 - 状态码: ${code} (1003 = 不支持的数据类型，表示路径无效)`);
});
```

#### 预期结果

- 连接失败或被关闭
- 关闭状态码为 1003（不支持的数据类型）
- 原因包含 "Unknown path"

#### 验证点

- [ ] 连接失败或立即关闭
- [ ] close 事件被触发
- [ ] 状态码为 1003（不支持的数据类型）
- [ ] 错误消息明确

#### 通过标准

正确处理无效端点，返回明确的错误信息。

---

### 用例 WS-013: 服务器关闭时的处理

**优先级**: P2  
**类型**: 异常测试

#### 测试目标

验证服务器关闭时客户端的处理。

#### 测试步骤

1. 建立 WebSocket 连接
2. 手动停止 ApexBridge 服务
3. 观察客户端行为

```javascript
// test-ws-server-shutdown.js
const WebSocket = require('ws');

const API_KEY = process.env.API_KEY || 'default-api-key';
const ws = new WebSocket(`ws://localhost:8088/chat/api_key=${API_KEY}`);

ws.on('open', () => {
  console.log('✅ 连接已建立');
  console.log('⚠️  请在 10 秒内手动停止服务器...\n');
});

ws.on('close', (code, reason) => {
  console.log(`🔌 连接关闭`);
  console.log(`   状态码: ${code}`);
  console.log(`   原因: ${reason.toString() || '无'}`);
});

ws.on('error', (error) => {
  console.log('⚠️  连接错误:', error.message);
});

// 保持运行 60 秒
setTimeout(() => {
  console.log('\n⏰ 测试结束');
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
}, 60000);
```

#### 预期结果

- 检测到连接断开
- 触发 close 事件
- 状态码非 1000（异常关闭）

#### 验证点

- [ ] close 事件被触发
- [ ] 状态码指示异常关闭（非 1000）
- [ ] 客户端正确清理资源

#### 通过标准

优雅地处理服务器关闭，客户端能够正确检测和响应。

---

## 📊 测试结果汇总

### 测试用例统计

| 类别 | 用例数 | 描述 |
|------|--------|------|
| 基础连接 | 4 | 连接、消息、流式、格式 |
| 连接管理 | 3 | 断开、重连、并发 |
| 高级功能 | 2 | 中断、心跳 |
| 错误处理 | 3 | 无效 Key、错误端点、服务器关闭 |
| **总计** | **12** | |

### 优先级分布

| 优先级 | 用例数 | 用例编号 |
|--------|--------|----------|
| P0 | 4 | WS-001, 002, 003, 005 |
| P1 | 5 | WS-004, 006, 008, 011, 012 |
| P2 | 3 | WS-007, 009, 010, 013 |

### 测试记录模板

```markdown
## WebSocket 测试执行记录

- **测试日期**: YYYY-MM-DD
- **测试人员**: [姓名]
- **ApexBridge 版本**: [版本号]
- **测试工具**: wscat / Node.js / Browser
- **API Key**: [已配置/未配置]

| 用例编号 | 用例名称 | 结果 | 响应时间 | 备注 |
|----------|----------|------|----------|------|
| WS-001 | 连接建立 | ✅ PASS | 50ms | - |
| WS-002 | 普通消息 | ✅ PASS | 200ms | - |
| WS-003 | 流式消息 | ✅ PASS | 3.5s | - |
| ... | ... | ... | ... | ... |

**总通过率**: XX%
```

---

## 🛠️ 测试工具

### wscat 安装和使用

```bash
# 安装
npm install -g wscat

# ✅ 根据当前架构：连接时需要 API Key
wscat -c "ws://localhost:8088/chat/api_key=your-api-key-here"

# 发送消息
> {"type":"chat","payload":{"messages":[{"role":"user","content":"你好"}]}}

# 断开连接
Ctrl + C
```

### 浏览器测试

在浏览器 Console 中：

```javascript
// ✅ 根据当前架构：API Key 通过 URL 传递
const API_KEY = 'your-api-key-here';
const ws = new WebSocket(`ws://localhost:8088/chat/api_key=${API_KEY}`);

// 监听事件
ws.onopen = () => console.log('已连接');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('收到:', message.type, message);
};
ws.onerror = (error) => console.error('错误:', error);
ws.onclose = () => console.log('已断开');

// 发送消息
ws.send(JSON.stringify({
  type: 'chat',
  payload: {
    messages: [{ role: 'user', content: '你好' }]
  }
}));

// 关闭连接
ws.close();
```

### Chrome 插件

推荐使用：
1. **Simple WebSocket Client**
2. **WebSocket King Client**
3. **Browser WebSocket Client**

**注意**: 在插件中连接时，URL 格式为：`ws://localhost:8088/chat/api_key=your-api-key-here`

---

## 📝 WebSocket 消息协议

### 客户端请求消息格式

**普通聊天**:
```json
{
  "type": "chat",
  "payload": {
    "messages": [
      { "role": "user", "content": "你好" }
    ],
    "options": {
      "model": "gpt-4",
      "temperature": 0.7
    }
  }
}
```

**流式聊天**:
```json
{
  "type": "stream_chat",
  "payload": {
    "messages": [
      { "role": "user", "content": "你好" }
    ],
    "options": {
      "stream": true
    }
  }
}
```

**中断请求**:
```json
{
  "type": "stop"
}
```

### 服务器响应消息格式

**普通响应**:
```json
{
  "type": "chat_response",
  "payload": {
    "content": "完整的响应内容",
    "usage": {
      "prompt_tokens": 10,
      "completion_tokens": 20,
      "total_tokens": 30
    }
  }
}
```

**流式数据块**:
```json
{
  "type": "stream_chunk",
  "payload": {
    "choices": [{
      "delta": {
        "content": "部分响应内容"
      }
    }]
  }
}
```

**元数据事件**（包含 requestId）:
```json
{
  "type": "meta_event",
  "payload": {
    "requestId": "req-1234567890"
  }
}
```

**流式完成**:
```json
{
  "type": "stream_done"
}
```

**中断状态**:
```json
{
  "type": "status",
  "payload": {
    "status": "interrupted",
    "success": true,
    "requestId": "req-1234567890"
  }
}
```

**错误消息**:
```json
{
  "type": "error",
  "error": "错误描述"
}
```

---

## 🔐 API Key 配置

### 获取 API Key

API Key 可以通过以下方式配置：

1. **环境变量**:
   ```bash
   export API_KEY=your-api-key-here
   ```

2. **配置文件**:
   - 在 `config/admin-config.json` 中配置
   - 或在启动时通过环境变量传递

### 验证 API Key

WebSocket 连接时，API Key 通过 URL 参数传递：
- 有效路径：`/chat/api_key=xxx` 或 `/v1/chat/api_key=xxx`
- 无效 API Key 会导致连接被拒绝（状态码 1008）

---

## 🔗 相关文档

- [测试总览指南](../MANUAL_TESTING_GUIDE.md)
- [聊天接口测试用例](./CHAT_API_TEST_CASES.md)
- [Skills 测试用例](./SKILLS_TEST_CASES.md)
- [10 分钟快速验证](../guides/QUICK_VALIDATION_CHECKLIST.md)

---

## 💡 测试技巧

1. **使用 wscat 进行快速测试**：
   ```bash
   wscat -c "ws://localhost:8088/chat/api_key=your-api-key-here"
   ```

2. **监控 WebSocket 流量**：
   - Chrome DevTools → Network → WS
   - 可以查看所有 WebSocket 消息

3. **脚本化测试**：
   - 将测试用例保存为 Node.js 脚本
   - 便于自动化和回归测试

4. **日志分析**：
   ```bash
   # 查看 WebSocket 相关日志
   tail -f logs/apexbridge.log | grep -i websocket
   ```

5. **API Key 安全**：
   - 不要在日志中打印完整的 API Key
   - 使用环境变量管理敏感信息
   - 测试时使用测试专用的 API Key

---

**文档维护**: 如发现测试用例有问题或需要补充，请提交 Issue 或 PR。

*最后更新: 2025-01-XX*
