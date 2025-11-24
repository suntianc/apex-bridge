# 会话管理测试用例 (Session Management Test Cases)

> **模块**: 会话管理 API (`/v1/chat/sessions/*`)  
> **优先级**: P0  
> **最后更新**: 2025-01-XX

## 📋 测试概述

本文档包含 ApexBridge 会话管理功能的详细测试用例，覆盖会话创建、查询、更新、归档等核心功能。

### 测试范围

- ✅ 会话创建和获取
- ✅ 会话活动更新
- ✅ 会话状态查询
- ✅ 会话历史查询
- ✅ 活动会话列表查询
- ✅ 会话归档（删除）
- ✅ 会话元数据更新
- ✅ 多用户并发会话隔离

### 前置条件

- ApexBridge 服务已启动（端口 3000）
- ACE Engine 已正确初始化
- 至少配置了一个 LLM 提供商

---

## 测试用例

### 用例 SESSION-001: 创建会话（首次消息）

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证用户首次发送消息时，系统自动创建会话。

#### 前置条件

- 服务正常运行
- ACE Engine 已初始化

#### 测试步骤

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "conversationId": "conv-test-001",
    "userId": "user-001",
    "agentId": "agent-001"
  }'
```

#### 预期结果

**HTTP 状态码**: 200

**验证点**:
- [ ] 消息处理成功
- [ ] 会话自动创建（通过日志验证）
- [ ] 会话ID与conversationId一致

#### 通过标准

所有验证点都通过。

---

### 用例 SESSION-002: 获取会话状态

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证可以查询会话的当前状态。

#### 前置条件

- 已存在会话（通过 SESSION-001 创建）

#### 测试步骤

```bash
curl -X GET http://localhost:3000/v1/chat/sessions/conv-test-001 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### 预期结果

**HTTP 状态码**: 200

**响应格式**:
```json
{
  "success": true,
  "data": {
    "sessionId": "conv-test-001",
    "createdAt": 1234567890,
    "lastActivityAt": 1234567890,
    "activeGoals": [],
    "reflectionCount": 0,
    "status": "active",
    "metadata": {
      "agentId": "agent-001",
      "userId": "user-001",
      "conversationId": "conv-test-001",
      "messageCount": 1,
      "totalTokens": 50,
      "lastMessageAt": 1234567890
    }
  }
}
```

#### 验证点

- [ ] HTTP 状态码为 200
- [ ] 响应包含 `sessionId`
- [ ] 响应包含 `status` 字段，值为 `active`
- [ ] 响应包含 `metadata` 字段
- [ ] `metadata.messageCount` 正确
- [ ] `metadata.totalTokens` 正确

#### 通过标准

所有验证点都通过。

---

### 用例 SESSION-003: 会话活动更新

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证每次消息处理时，会话活动时间自动更新。

#### 前置条件

- 已存在会话

#### 测试步骤

```bash
# 1. 获取初始活动时间
curl -X GET http://localhost:3000/v1/chat/sessions/conv-test-001

# 2. 等待 2 秒

# 3. 发送新消息
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "继续对话"}
    ],
    "conversationId": "conv-test-001"
  }'

# 4. 再次获取会话状态
curl -X GET http://localhost:3000/v1/chat/sessions/conv-test-001
```

#### 预期结果

**验证点**:
- [ ] 第二次查询的 `lastActivityAt` 大于第一次
- [ ] `metadata.messageCount` 递增
- [ ] `metadata.totalTokens` 累计增加

#### 通过标准

所有验证点都通过。

---

### 用例 SESSION-004: 获取活动会话列表

**优先级**: P1  
**类型**: 功能测试

#### 测试目标

验证可以查询活动会话列表。

#### 前置条件

- 存在多个活动会话

#### 测试步骤

```bash
curl -X GET "http://localhost:3000/v1/chat/sessions/active?cutoffTime=1234567890" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### 预期结果

**HTTP 状态码**: 200

**响应格式**:
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "conv-test-001",
        "status": "active",
        "lastActivityAt": 1234567890
      }
    ],
    "total": 1,
    "cutoffTime": 1234567890
  }
}
```

#### 验证点

- [ ] HTTP 状态码为 200
- [ ] 响应包含 `sessions` 数组
- [ ] 响应包含 `total` 字段
- [ ] 所有会话的 `status` 为 `active`
- [ ] `lastActivityAt` 大于 `cutoffTime`

#### 通过标准

所有验证点都通过。

---

### 用例 SESSION-005: 获取会话历史

**优先级**: P1  
**类型**: 功能测试

#### 测试目标

验证可以查询会话的历史记录（日志、轨迹等）。

#### 前置条件

- 已存在会话，且有历史记录

#### 测试步骤

```bash
# 获取完整历史
curl -X GET "http://localhost:3000/v1/chat/sessions/conv-test-001/history?type=all&limit=100" \
  -H "Authorization: Bearer YOUR_API_KEY"

# 仅获取遥测日志
curl -X GET "http://localhost:3000/v1/chat/sessions/conv-test-001/history?type=telemetry&limit=50" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### 预期结果

**HTTP 状态码**: 200

**响应格式**:
```json
{
  "success": true,
  "data": {
    "sessionState": {...},
    "telemetry": [...],
    "directives": [...]
  }
}
```

#### 验证点

- [ ] HTTP 状态码为 200
- [ ] 响应包含 `sessionState`
- [ ] 响应包含 `telemetry` 数组（如果 type=all 或 type=telemetry）
- [ ] 响应包含 `directives` 数组（如果 type=all 或 type=directives）
- [ ] 日志记录包含 `session_id` 字段

#### 通过标准

所有验证点都通过。

---

### 用例 SESSION-006: 会话归档（删除）

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证用户删除对话时，会话被正确归档。

#### 前置条件

- 已存在活动会话

#### 测试步骤

```bash
# 1. 删除会话
curl -X DELETE http://localhost:3000/v1/chat/sessions/conv-test-001 \
  -H "Authorization: Bearer YOUR_API_KEY"

# 2. 验证会话状态
curl -X GET http://localhost:3000/v1/chat/sessions/conv-test-001 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### 预期结果

**删除响应**:
```json
{
  "success": true,
  "message": "Session deleted successfully"
}
```

**查询响应**:
- HTTP 状态码: 404 或 status 为 `archived`

#### 验证点

- [ ] 删除请求返回成功
- [ ] 再次查询时，会话状态为 `archived` 或返回 404
- [ ] 会话不再出现在活动会话列表中

#### 通过标准

所有验证点都通过。

---

### 用例 SESSION-007: 会话元数据更新

**优先级**: P1  
**类型**: 功能测试

#### 测试目标

验证消息处理时，会话元数据（消息计数、Token使用量）正确更新。

#### 前置条件

- 已存在会话

#### 测试步骤

```bash
# 1. 获取初始元数据
curl -X GET http://localhost:3000/v1/chat/sessions/conv-test-001

# 2. 发送多条消息
for i in {1..3}; do
  curl -X POST http://localhost:3000/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d "{
      \"messages\": [{\"role\": \"user\", \"content\": \"消息 $i\"}],
      \"conversationId\": \"conv-test-001\"
    }"
done

# 3. 再次获取元数据
curl -X GET http://localhost:3000/v1/chat/sessions/conv-test-001
```

#### 预期结果

**验证点**:
- [ ] `metadata.messageCount` 递增（+3）
- [ ] `metadata.totalTokens` 累计增加
- [ ] `metadata.totalInputTokens` 累计增加
- [ ] `metadata.totalOutputTokens` 累计增加
- [ ] `metadata.lastMessageAt` 更新为最新时间

#### 通过标准

所有验证点都通过。

---

### 用例 SESSION-008: 多用户并发会话隔离

**优先级**: P0  
**类型**: 集成测试

#### 测试目标

验证不同用户的会话相互隔离，互不影响。

#### 前置条件

- 服务正常运行

#### 测试步骤

```bash
# 用户1创建会话
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "用户1的消息"}],
    "conversationId": "conv-user1-001",
    "userId": "user-001"
  }'

# 用户2创建会话
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "用户2的消息"}],
    "conversationId": "conv-user2-001",
    "userId": "user-002"
  }'

# 验证会话隔离
curl -X GET http://localhost:3000/v1/chat/sessions/conv-user1-001
curl -X GET http://localhost:3000/v1/chat/sessions/conv-user2-001
```

#### 预期结果

**验证点**:
- [ ] 两个会话独立存在
- [ ] 会话1的 `metadata.userId` 为 `user-001`
- [ ] 会话2的 `metadata.userId` 为 `user-002`
- [ ] 会话1的日志不包含会话2的数据
- [ ] 会话2的日志不包含会话1的数据

#### 通过标准

所有验证点都通过。

---

### 用例 SESSION-009: 会话复用（同一conversationId）

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证同一 `conversationId` 的多次请求复用同一个会话。

#### 前置条件

- 无

#### 测试步骤

```bash
# 1. 首次请求（创建会话）
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "第一条消息"}],
    "conversationId": "conv-reuse-001"
  }'

# 2. 第二次请求（复用会话）
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "第二条消息"}],
    "conversationId": "conv-reuse-001"
  }'

# 3. 验证会话状态
curl -X GET http://localhost:3000/v1/chat/sessions/conv-reuse-001
```

#### 预期结果

**验证点**:
- [ ] 两次请求都成功
- [ ] 会话ID相同（都是 `conv-reuse-001`）
- [ ] `metadata.messageCount` 为 2
- [ ] `lastActivityAt` 更新为第二次请求的时间

#### 通过标准

所有验证点都通过。

---

### 用例 SESSION-010: 无conversationId的请求（向后兼容）

**优先级**: P0  
**类型**: 兼容性测试

#### 测试目标

验证没有 `conversationId` 的旧请求仍能正常工作。

#### 前置条件

- 无

#### 测试步骤

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "测试消息"}]
  }'
```

#### 预期结果

**验证点**:
- [ ] HTTP 状态码为 200
- [ ] 消息处理成功
- [ ] 不创建会话（通过日志验证）
- [ ] 不抛出错误

#### 通过标准

所有验证点都通过。

---

## 性能测试用例

### 用例 SESSION-PERF-001: 大量会话性能测试

**优先级**: P2  
**类型**: 性能测试

#### 测试目标

验证系统在大量会话情况下的性能表现。

#### 测试步骤

```bash
# 创建100个会话
for i in {1..100}; do
  curl -X POST http://localhost:3000/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d "{
      \"messages\": [{\"role\": \"user\", \"content\": \"消息 $i\"}],
      \"conversationId\": \"conv-perf-$i\"
    }" &
done
wait

# 查询活动会话列表
time curl -X GET http://localhost:3000/v1/chat/sessions/active
```

#### 预期结果

**验证点**:
- [ ] 所有会话创建成功
- [ ] 查询活动会话列表响应时间 < 2秒
- [ ] 内存使用正常（无明显泄漏）

#### 通过标准

所有验证点都通过。

---

## 错误处理测试用例

### 用例 SESSION-ERROR-001: 查询不存在的会话

**优先级**: P1  
**类型**: 错误处理测试

#### 测试目标

验证查询不存在的会话时返回正确的错误响应。

#### 测试步骤

```bash
curl -X GET http://localhost:3000/v1/chat/sessions/non-existent-session \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### 预期结果

**HTTP 状态码**: 404

**响应格式**:
```json
{
  "error": {
    "message": "Session not found",
    "type": "not_found"
  }
}
```

#### 通过标准

返回正确的错误响应。

---

## 测试检查清单

### 功能测试
- [ ] SESSION-001: 创建会话（首次消息）
- [ ] SESSION-002: 获取会话状态
- [ ] SESSION-003: 会话活动更新
- [ ] SESSION-004: 获取活动会话列表
- [ ] SESSION-005: 获取会话历史
- [ ] SESSION-006: 会话归档（删除）
- [ ] SESSION-007: 会话元数据更新
- [ ] SESSION-008: 多用户并发会话隔离
- [ ] SESSION-009: 会话复用
- [ ] SESSION-010: 向后兼容性

### 性能测试
- [ ] SESSION-PERF-001: 大量会话性能测试

### 错误处理测试
- [ ] SESSION-ERROR-001: 查询不存在的会话

---

## 测试工具

### 使用 curl 测试

所有测试用例都提供了 curl 命令，可以直接在终端执行。

### 使用 Postman 测试

1. 导入 Postman Collection（待创建）
2. 设置环境变量：`baseUrl`, `apiKey`
3. 运行测试集合

### 使用自动化测试脚本

```bash
# 运行所有会话管理测试
npm run test:session-management

# 运行特定测试用例
npm run test:session-management -- --grep "SESSION-001"
```

---

## 注意事项

1. **测试数据清理**: 测试完成后，建议清理测试数据
2. **并发测试**: 并发测试时注意系统资源限制
3. **数据库状态**: 确保测试前后数据库状态一致
4. **日志检查**: 测试时检查日志，确认功能正常

---

## 问题排查

### 会话创建失败

- 检查 ACE Engine 是否已初始化
- 检查日志中的错误信息
- 验证数据库连接是否正常

### 会话查询返回空

- 确认会话ID正确
- 检查会话是否已被归档
- 验证数据库查询是否正常

### 性能问题

- 检查数据库索引是否创建
- 验证缓存是否正常工作
- 检查系统资源使用情况

