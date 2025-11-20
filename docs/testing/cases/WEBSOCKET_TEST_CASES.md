# WebSocket 测试用例 (WebSocket Test Cases)

> **模块**: WebSocket 通信  
> **优先级**: P1  
> **最后更新**: 2025-11-18

## 📋 测试概述

本文档包含 ApexBridge WebSocket 功能的详细测试用例，覆盖连接管理、消息传输、实时通信等功能。

### 测试范围

- ✅ WebSocket 连接建立
- ✅ 消息发送和接收
- ✅ 流式聊天消息
- ✅ 连接中断和重连
- ✅ 请求中断机制
- ✅ 并发连接
- ✅ 心跳和超时
- ✅ 错误处理

### WebSocket 端点

- **连接地址**: `ws://localhost:8088/ws`
- **协议**: WebSocket (RFC 6455)
- **消息格式**: JSON

### 前置条件

- ApexBridge 服务已启动
- WebSocket 服务已初始化
- 安装了 WebSocket 客户端工具（wscat 或浏览器插件）

---

## 基础连接测试

### 用例 WS-001: WebSocket 连接建立

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证 WebSocket 连接能够成功建立。

#### 测试步骤

**方法 1: 使用 wscat**

```bash
# 安装 wscat (如果未安装)
npm install -g wscat

# 连接 WebSocket
wscat -c ws://localhost:8088/ws
```

**方法 2: 使用 Node.js 脚本**

```javascript
// test-ws-connection.js
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8088/ws');

ws.on('open', () => {
  console.log('✅ WebSocket 连接成功建立');
  ws.close();
});

ws.on('error', (error) => {
  console.error('❌ 连接失败:', error.message);
});
```

运行：
```bash
node test-ws-connection.js
```

**方法 3: 使用浏览器 Console**

```javascript
const ws = new WebSocket('ws://localhost:8088/ws');

ws.onopen = () => {
  console.log('✅ 连接成功');
};

ws.onerror = (error) => {
  console.error('❌ 连接失败', error);
};
```

#### 预期结果

- 连接成功建立
- 收到连接建立的确认
- 无错误消息

#### 验证点

- [ ] WebSocket 连接成功 (readyState = 1)
- [ ] 无连接错误
- [ ] 服务器日志显示新连接

#### 通过标准

连接成功建立，无任何错误。

---

### 用例 WS-002: 简单消息发送

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证通过 WebSocket 发送简单消息的功能。

#### 测试步骤

**使用 wscat**:

```bash
# 连接
wscat -c ws://localhost:8088/ws

# 发送消息
> {"type":"chat","content":"你好"}
```

**使用 Node.js 脚本**:

```javascript
// test-ws-send.js
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8088/ws');

ws.on('open', () => {
  console.log('连接已建立');
  
  // 发送消息
  const message = {
    type: 'chat',
    content: '你好，这是测试消息'
  };
  
  ws.send(JSON.stringify(message));
  console.log('✅ 消息已发送:', message);
});

ws.on('message', (data) => {
  console.log('📨 收到响应:', data.toString());
  ws.close();
});

ws.on('error', (error) => {
  console.error('❌ 错误:', error.message);
});
```

#### 预期结果

- 消息成功发送
- 收到服务器响应
- 响应内容符合预期

#### 验证点

- [ ] 消息发送成功
- [ ] 收到服务器响应
- [ ] 响应格式为 JSON
- [ ] 响应包含有效内容

#### 通过标准

消息成功发送并收到有效响应。

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

const ws = new WebSocket('ws://localhost:8088/ws');

ws.on('open', () => {
  console.log('✅ 连接已建立\n');
  
  // 发送聊天请求
  const request = {
    type: 'chat',
    content: '请用50字介绍人工智能',
    stream: true
  };
  
  ws.send(JSON.stringify(request));
  console.log('📤 已发送流式聊天请求\n');
});

let chunkCount = 0;
let fullContent = '';

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    if (message.type === 'chunk') {
      chunkCount++;
      const content = message.content || '';
      fullContent += content;
      process.stdout.write(content); // 实时显示
    } else if (message.type === 'done') {
      console.log('\n\n✅ 流式响应完成');
      console.log(`📊 总共接收 ${chunkCount} 个数据块`);
      console.log(`📝 完整内容: ${fullContent}`);
      ws.close();
    } else if (message.type === 'error') {
      console.error('❌ 错误:', message.error);
      ws.close();
    }
  } catch (error) {
    console.error('解析错误:', error.message);
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
node test-ws-stream.js
```

#### 预期结果

- 接收到多个数据块
- 数据块按顺序到达
- 最后接收到 "done" 消息
- 能够实时显示内容

#### 验证点

- [ ] 接收到多个 chunk 消息（>= 5个）
- [ ] 每个 chunk 包含 content 字段
- [ ] 最后接收到 done 消息
- [ ] 内容完整且连贯
- [ ] 无数据丢失

#### 通过标准

流式消息正确接收，内容完整。

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
wscat -c ws://localhost:8088/ws

# 发送无效 JSON
> {invalid json}
```

**测试 2: 缺少必需字段**

```bash
# 发送缺少 type 字段的消息
> {"content":"测试"}
```

**测试 3: 无效的消息类型**

```bash
# 发送未知类型的消息
> {"type":"unknown","content":"测试"}
```

#### 预期结果

- 服务器返回错误消息
- 连接不会断开（优雅处理）
- 错误消息包含有用信息

#### 验证点

- [ ] 无效 JSON 被拒绝
- [ ] 返回明确的错误消息
- [ ] 连接保持活跃
- [ ] 后续消息仍可正常发送

#### 通过标准

优雅地处理无效消息，不影响后续通信。

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

const ws = new WebSocket('ws://localhost:8088/ws');

ws.on('open', () => {
  console.log('✅ 连接已建立');
  
  // 2 秒后主动断开
  setTimeout(() => {
    console.log('🔌 客户端主动断开连接...');
    ws.close(1000, '正常关闭'); // 1000 = 正常关闭状态码
  }, 2000);
});

ws.on('close', (code, reason) => {
  console.log(`✅ 连接已关闭 - 状态码: ${code}, 原因: ${reason}`);
});

ws.on('error', (error) => {
  console.error('❌ 错误:', error.message);
});
```

**使用 wscat**:

```bash
# 连接后按 Ctrl+C 断开
wscat -c ws://localhost:8088/ws
# ... 按 Ctrl+C
```

#### 预期结果

- 连接正常关闭
- 关闭状态码为 1000
- 服务器正确处理断开事件

#### 验证点

- [ ] close 事件被触发
- [ ] 状态码为 1000 (正常关闭)
- [ ] 无错误日志
- [ ] 服务器释放资源

#### 通过标准

连接正常断开，资源被正确释放。

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

let reconnectAttempts = 0;
const maxReconnectAttempts = 3;
let ws;

function connect() {
  ws = new WebSocket('ws://localhost:8088/ws');
  
  ws.on('open', () => {
    console.log('✅ 连接已建立');
    reconnectAttempts = 0; // 重置重连计数
    
    // 发送测试消息
    ws.send(JSON.stringify({
      type: 'chat',
      content: '测试连接'
    }));
  });
  
  ws.on('message', (data) => {
    console.log('📨 收到消息:', data.toString());
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

重连机制正常工作。

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

const CONNECTION_COUNT = 10;
const connections = [];

console.log(`🚀 创建 ${CONNECTION_COUNT} 个并发连接...\n`);

for (let i = 0; i < CONNECTION_COUNT; i++) {
  const ws = new WebSocket('ws://localhost:8088/ws');
  
  ws.on('open', () => {
    console.log(`✅ 连接 ${i + 1} 已建立`);
    
    // 发送测试消息
    ws.send(JSON.stringify({
      type: 'chat',
      content: `来自连接 ${i + 1} 的消息`
    }));
  });
  
  ws.on('message', (data) => {
    console.log(`📨 连接 ${i + 1} 收到响应`);
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

### 用例 WS-008: 请求中断机制

**优先级**: P1  
**类型**: 功能测试

#### 测试目标

验证通过 WebSocket 中断正在进行的请求。

#### 测试步骤

```javascript
// test-ws-interrupt.js
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8088/ws');

ws.on('open', () => {
  console.log('✅ 连接已建立\n');
  
  // 发送一个长时间运行的请求
  const request = {
    type: 'chat',
    content: '请写一篇1000字的文章关于人工智能的发展',
    stream: true
  };
  
  ws.send(JSON.stringify(request));
  console.log('📤 已发送长时间请求\n');
  
  // 3秒后发送中断请求
  setTimeout(() => {
    console.log('\n⚠️  发送中断请求...');
    ws.send(JSON.stringify({
      type: 'interrupt'
    }));
  }, 3000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    if (message.type === 'chunk') {
      process.stdout.write(message.content || '');
    } else if (message.type === 'interrupted') {
      console.log('\n\n✅ 请求已成功中断');
      ws.close();
    } else if (message.type === 'done') {
      console.log('\n\n⚠️  请求在中断前完成');
      ws.close();
    }
  } catch (error) {
    console.error('解析错误:', error.message);
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

- 请求开始执行
- 中断请求被处理
- 原请求被终止
- 收到中断确认消息

#### 验证点

- [ ] 原请求开始执行
- [ ] 中断消息被接受
- [ ] 原请求被终止
- [ ] 收到 interrupted 消息
- [ ] 资源被正确释放

#### 通过标准

中断机制正常工作，请求被正确终止。

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

const ws = new WebSocket('ws://localhost:8088/ws');

ws.on('open', () => {
  console.log('✅ 连接已建立');
  console.log('⏱️  监听心跳...\n');
});

// 监听 ping 消息
ws.on('ping', (data) => {
  console.log('💓 收到 ping:', data.toString());
});

// 监听 pong 消息
ws.on('pong', (data) => {
  console.log('💓 收到 pong:', data.toString());
});

// 主动发送 ping
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log('📤 发送 ping...');
    ws.ping('client-ping');
  }
}, 30000); // 每30秒发送一次

ws.on('close', (code, reason) => {
  console.log(`🔌 连接关闭 - 状态码: ${code}, 原因: ${reason}`);
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

- 接收到服务器的 ping 消息
- 自动回复 pong 消息
- 连接保持活跃
- 无超时断开

#### 验证点

- [ ] 接收到 ping 消息
- [ ] 自动回复 pong
- [ ] 连接保持活跃
- [ ] 无超时断开

#### 通过标准

心跳机制正常工作，连接保持稳定。

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

const ws = new WebSocket('ws://localhost:8088/ws');

ws.on('open', () => {
  console.log('✅ 连接已建立\n');
  
  // 生成大消息（约 10KB）
  const largeContent = '这是测试内容。'.repeat(1000);
  
  const message = {
    type: 'chat',
    content: `请总结以下内容：${largeContent}`
  };
  
  const messageSize = JSON.stringify(message).length;
  console.log(`📦 消息大小: ${(messageSize / 1024).toFixed(2)} KB`);
  console.log('📤 发送大消息...\n');
  
  ws.send(JSON.stringify(message));
});

ws.on('message', (data) => {
  console.log('📨 收到响应');
  console.log(`📦 响应大小: ${(data.length / 1024).toFixed(2)} KB`);
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

### 用例 WS-011: 连接到错误端点

**优先级**: P1  
**类型**: 异常测试

#### 测试目标

验证连接到不存在的 WebSocket 端点时的错误处理。

#### 测试步骤

```javascript
// test-ws-invalid-endpoint.js
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8088/invalid-endpoint');

ws.on('open', () => {
  console.log('⚠️  意外：连接成功（不应该发生）');
});

ws.on('error', (error) => {
  console.log('✅ 预期的错误:', error.message);
});

ws.on('close', (code) => {
  console.log(`✅ 连接关闭 - 状态码: ${code}`);
});
```

#### 预期结果

- 连接失败
- 返回明确的错误
- 状态码非 1000

#### 验证点

- [ ] 连接失败
- [ ] error 事件被触发
- [ ] 错误消息明确
- [ ] 状态码非正常关闭

#### 通过标准

正确处理无效端点，返回明确错误。

---

### 用例 WS-012: 服务器关闭时的处理

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

const ws = new WebSocket('ws://localhost:8088/ws');

ws.on('open', () => {
  console.log('✅ 连接已建立');
  console.log('⚠️  请在 10 秒内手动停止服务器...\n');
});

ws.on('close', (code, reason) => {
  console.log(`🔌 连接关闭`);
  console.log(`   状态码: ${code}`);
  console.log(`   原因: ${reason || '无'}`);
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
- 状态码非 1000

#### 验证点

- [ ] close 事件被触发
- [ ] 状态码指示异常关闭
- [ ] 客户端正确清理资源

#### 通过标准

优雅地处理服务器关闭。

---

## 📊 测试结果汇总

### 测试用例统计

| 类别 | 用例数 | 描述 |
|------|--------|------|
| 基础连接 | 4 | 连接、消息、流式、格式 |
| 连接管理 | 3 | 断开、重连、并发 |
| 高级功能 | 3 | 中断、心跳、大消息 |
| 错误处理 | 2 | 无效端点、服务器关闭 |
| **总计** | **12** | |

### 优先级分布

| 优先级 | 用例数 | 用例编号 |
|--------|--------|----------|
| P0 | 4 | WS-001, 002, 003, 005 |
| P1 | 5 | WS-004, 006, 008, 011 |
| P2 | 3 | WS-007, 009, 010, 012 |

### 测试记录模板

```markdown
## WebSocket 测试执行记录

- **测试日期**: YYYY-MM-DD
- **测试人员**: [姓名]
- **ApexBridge 版本**: [版本号]
- **测试工具**: wscat / Node.js / Browser

| 用例编号 | 用例名称 | 结果 | 响应时间 | 备注 |
|----------|----------|------|----------|------|
| WS-001 | 连接建立 | ✅ PASS | 50ms | - |
| WS-002 | 消息发送 | ✅ PASS | 200ms | - |
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

# 基本连接
wscat -c ws://localhost:8088/ws

# 带自定义头的连接
wscat -c ws://localhost:8088/ws -H "Authorization: Bearer token"

# 断开连接
Ctrl + C
```

### 浏览器测试

在浏览器 Console 中：

```javascript
// 创建连接
const ws = new WebSocket('ws://localhost:8088/ws');

// 监听事件
ws.onopen = () => console.log('已连接');
ws.onmessage = (event) => console.log('收到:', event.data);
ws.onerror = (error) => console.error('错误:', error);
ws.onclose = () => console.log('已断开');

// 发送消息
ws.send(JSON.stringify({type: 'chat', content: '你好'}));

// 关闭连接
ws.close();
```

### Chrome 插件

推荐使用：
1. **Simple WebSocket Client**
2. **WebSocket King Client**
3. **Browser WebSocket Client**

---

## 📝 WebSocket 消息协议

### 请求消息格式

```json
{
  "type": "chat",           // 消息类型: chat, interrupt
  "content": "你好",        // 消息内容
  "stream": true           // 是否流式响应（可选）
}
```

### 响应消息格式

**数据块消息**:
```json
{
  "type": "chunk",
  "content": "部分响应内容"
}
```

**完成消息**:
```json
{
  "type": "done",
  "message": "响应完成"
}
```

**错误消息**:
```json
{
  "type": "error",
  "error": "错误描述"
}
```

**中断确认**:
```json
{
  "type": "interrupted",
  "message": "请求已中断"
}
```

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
   wscat -c ws://localhost:8088/ws
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

---

**文档维护**: 如发现测试用例有问题或需要补充，请提交 Issue 或 PR。

*最后更新: 2025-11-18*

