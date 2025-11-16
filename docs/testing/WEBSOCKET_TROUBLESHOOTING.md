# WebSocket推送问题排查指南

## 问题：API调用成功但WebSocket未收到消息

### 已修复的问题

**问题原因：**
- 之前使用 `pushToolLog` 方法，发送的是 `vcp_log` 类型消息
- WebSocket客户端期望的是 `proactive_message` 类型消息
- 消息格式不匹配导致客户端无法识别

**修复方案：**
- 已修改 `server.ts`，现在直接发送 `proactive_message` 类型的消息
- 使用 `broadcast` 方法直接推送，格式符合客户端期望

---

## 排查步骤

### 1. 检查WebSocket连接

**确认连接成功：**

```bash
# 运行WebSocket测试脚本
export ABP_API_KEY=your-api-key
export PORT=8088  # 根据你的服务器端口
node tests/websocket-test.js
```

**应该看到：**
```
✅ WebSocket连接成功！
📡 等待接收主动消息...
```

**如果连接失败，检查：**
- API Key是否正确
- 端口是否正确（你使用的是8088，不是3000）
- WebSocket路径格式：
  - 推荐：`/ABPlog/ABP_Key=xxx` 或 `/log/ABP_Key=xxx`

---

### 2. 检查服务器日志

**触发场景后，查看服务器日志：**

应该看到以下日志：
```
✅ Proactive message sent: morning_greeting (score: 0.85)
📢 Proactive message pushed to WebSocket: morning_greeting
   Content: 早上好！...
   Score: 0.85
[ABPLog] Broadcast to 1 clients (0 failed)
```

**如果没有看到推送日志：**
- 检查EventBus是否正常工作
- 检查 `proactive:message` 事件是否被发布
- 检查 `vcpLogChannel` 是否已初始化

**如果看到推送日志但没有客户端：**
- 检查WebSocket客户端是否已连接
- 查看日志：`[ABPLog] Client connected with key: ...`

---

### 3. 检查消息格式

**正确的消息格式：**

```json
{
  "type": "proactive_message",
  "timestamp": 1704556800000,
  "data": {
    "sceneId": "morning_greeting",
    "message": "早上好！今天也是美好的一天呢~",
    "score": 0.85,
    "userId": "test-user",
    "personality": {
      "identity": {
        "name": "AI助手"
      },
      ...
    }
  }
}
```

**WebSocket测试脚本会显示：**
```
📢 [主动消息 #1]
   场景ID: morning_greeting
   消息内容: 早上好！今天也是美好的一天呢~
   评分: 0.85
   时间: 2024-01-06 23:30:00
```

---

### 4. 常见问题

#### 问题1：WebSocket连接失败

**错误信息：**
```
❌ WebSocket错误: 401 Unauthorized
```

**解决方案：**
- 检查API Key是否正确
- 确认WebSocket路径格式：
  - 推荐：`/ABPlog/ABP_Key=xxx` 或 `/log/ABP_Key=xxx`

#### 问题2：连接成功但收不到消息

**可能原因：**
1. **消息类型不匹配**（已修复）
   - 之前：发送 `vcp_log` 类型
   - 现在：发送 `proactive_message` 类型

2. **场景未触发**
   - 检查场景是否通过评分（分数 >= 0.62）
   - 检查是否在静音窗内
   - 检查是否被防抖阻止

3. **EventBus未工作**
   - 检查 `proactive:message` 事件是否被发布
   - 检查事件监听器是否已注册

**检查方法：**
```bash
# 查看服务器日志
# 应该看到：
# 📡 Event received: proactive:message
# 📢 Proactive message pushed to WebSocket
```

#### 问题3：消息格式错误

**检查消息内容：**
- 确认 `type` 字段是 `proactive_message`
- 确认 `data.sceneId` 存在
- 确认 `data.message` 存在且不为空

---

### 5. 调试方法

#### 方法1：启用详细日志

在WebSocket测试脚本中：
```bash
VERBOSE=true node tests/websocket-test.js
```

#### 方法2：检查服务器日志

查看完整的日志输出，特别关注：
- `✅ Proactive message sent` - 消息已生成
- `📢 Proactive message pushed to WebSocket` - 消息已推送
- `[ABPLog] Broadcast to X clients` - 消息已广播

#### 方法3：手动测试EventBus

可以在代码中临时添加日志，确认事件是否被发布：

```typescript
// 在 ProactivityScheduler.ts 的 deliverMessage 方法中
logger.debug('📤 Publishing proactive:message event', {
  sceneId: message.sceneId,
  hasEventBus: !!this.config.eventBus
});
```

---

### 6. 验证修复

**测试步骤：**

1. **启动服务器**
   ```bash
   npm run dev
   ```

2. **启动WebSocket监听**
   ```bash
   export ABP_API_KEY=your-api-key
   export PORT=8088
   node tests/websocket-test.js
   ```

3. **触发场景**
   ```bash
   curl -X POST http://localhost:8088/api/admin/proactivity/trigger \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -d '{"sceneId": "morning_greeting", "userId": "test-user"}'
   ```

4. **观察结果**
   - WebSocket终端应该显示主动消息
   - 服务器日志应该显示推送成功

---

## 修复后的代码变更

### server.ts 修改

**之前：**
```typescript
this.vcpLogChannel!.pushToolLog({
  status: 'success',
  tool: `proactive:${message.sceneId}`,
  content: message.content,
  source: 'proactive_scheduler'
});
```

**现在：**
```typescript
const proactiveMessage = {
  type: 'proactive_message',
  timestamp: message.timestamp || Date.now(),
  data: {
    sceneId: message.sceneId,
    message: message.content,
    score: message.metadata?.score,
    userId: message.userId,
    personality: message.personality
  }
};

(this.vcpLogChannel as any).broadcast(proactiveMessage);
```

### WebSocket测试脚本修改

**之前：**
```javascript
const WS_URL = `ws://localhost:3000/ws/vcplog?key=${API_KEY}`;
```

**现在：**
```javascript
const WS_URL = `ws://localhost:${process.env.PORT || 3000}/ABPlog/ABP_Key=${API_KEY}`;
```

---

## 总结

修复后的系统现在会：
1. ✅ 发送正确类型的消息（`proactive_message`）
2. ✅ 使用正确的消息格式（符合客户端期望）
3. ✅ 使用正确的WebSocket路径（推荐：`/ABPlog/ABP_Key=xxx` 或 `/log/ABP_Key=xxx`）

如果仍然有问题，请检查：
- WebSocket客户端是否已连接
- 服务器日志中的错误信息
- 消息是否真的被触发（检查评分、静音窗等）

