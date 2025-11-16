# RAG 配置格式统一 - API 测试案例

## 测试场景：基于 apex-bridge 接口的 RAG 功能测试

本测试案例通过实际的 HTTP API 调用来验证 RAG 配置统一后的功能。

---

## 📋 前置准备

### 1. 配置 `.env` 文件

在 `apex-bridge/.env` 中添加以下配置（扁平格式）：

```env
# RAG配置（扁平格式）
RAG_ENABLED=true
RAG_STORAGE_PATH=./vector_store
RAG_VECTORIZER_BASE_URL=https://api.siliconflow.cn/v1  # 兼容旧字段 RAG_VECTORIZER_API_URL
RAG_VECTORIZER_API_KEY=your_embedding_api_key
RAG_VECTORIZER_MODEL=Qwen/Qwen3-Embedding-4B
RAG_VECTORIZER_DIMENSIONS=2560

# 可选：启用MemoryService自动验证
VERIFY_MEMORY_SERVICE=true
```

### 2. 启动服务器

```bash
cd apex-bridge
npm run dev
```

**验证启动日志**：
- ✅ `✅ RAG Service initialized`
- ✅ `✅ MemoryService initialized (RAG mode)`
- ✅ `[ChatService] MemoryService attached`
- ✅ `[MemoryService验证] ✅ save()测试成功`
- ✅ `[MemoryService验证] ✅ recall()测试成功`

---

## 🧪 测试案例

### 案例1：基础聊天 + 记忆保存测试

**测试目标**：验证聊天接口正常工作，并且能触发记忆保存（如果已实现）

**API 调用**：
```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {
        "role": "user",
        "content": "你好，我是张三，我喜欢编程和AI技术"
      }
    ],
    "stream": false
  }'
```

**预期结果**：
1. 返回正常的聊天响应
2. 检查日志，确认：
   - 聊天请求处理成功
   - （如果已实现）记忆保存成功

**验证点**：
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "..."
    }
  }]
}
```

---

### 案例2：流式聊天测试

**测试目标**：验证流式聊天接口正常工作

**API 调用**：
```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {
        "role": "user",
        "content": "介绍一下向量数据库"
      }
    ],
    "stream": true
  }'
```

**预期结果**：
1. 返回 SSE (Server-Sent Events) 流
2. 每个数据块格式：
   ```
   data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}
   ```
3. 最后以 `data: [DONE]` 结束

**验证点**：
- 流式响应正常传输
- 内容完整且正确

---

### 案例3：使用 agent_id 的人格切换测试

**测试目标**：验证人格切换功能，同时测试 RAG 配置不影响其他功能

**API 调用**：
```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {
        "role": "user",
        "content": "你好"
      }
    ],
    "agent_id": "专业助手",
    "stream": false
  }'
```

**预期结果**：
1. 返回使用"专业助手"人格的响应
2. RAG 配置仍然正常（不影响人格功能）

**验证点**：
- 响应内容符合"专业助手"人格特点
- 日志显示人格注入成功
- MemoryService 仍然可用

---

### 案例4：RAG 变量解析测试（如果支持）

**测试目标**：验证 VCP 变量系统中的 RAG 变量能否正常工作

**测试前提**：需要确认是否实现了 `{{rag:*}}` 变量支持

**API 调用**：
```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {
        "role": "user",
        "content": "帮我查询一下关于AI的记忆：{{rag:default:AI:basic}}"
      }
    ],
    "stream": false
  }'
```

**预期结果**：
- 如果已实现：`{{rag:*}}` 变量被正确解析为 RAG 搜索结果
- 如果未实现：变量可能保持原样或报错（这是正常的）

---

### 案例5：多轮对话记忆连续性测试

**测试目标**：通过多轮对话验证系统是否能记住上下文

**步骤 1：第一轮对话**
```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {
        "role": "user",
        "content": "我的名字是李四，我是一名软件工程师"
      }
    ],
    "stream": false
  }'
```

**步骤 2：第二轮对话（测试记忆）**
```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {
        "role": "user",
        "content": "我刚才说过我的职业是什么？"
      }
    ],
    "stream": false
  }'
```

**预期结果**：
- 如果已实现记忆检索：AI 应该能回答"软件工程师"
- 如果未实现：AI 可能无法回答（这是正常的，因为记忆功能可能还在开发中）

---

### 案例6：并发请求测试

**测试目标**：验证 RAG 配置在高并发下的稳定性

**并发请求脚本**（使用 `curl` 或工具）：
```bash
# 创建 10 个并发请求
for i in {1..10}; do
  curl -X POST http://localhost:8088/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"gpt-4\",
      \"messages\": [{
        \"role\": \"user\",
        \"content\": \"这是第 $i 个并发请求\"
      }],
      \"stream\": false
    }" &
done
wait
```

**预期结果**：
1. 所有请求都能正常响应
2. 没有内存泄漏或资源耗尽
3. RAG 服务仍然可用

---

### 案例7：配置错误处理测试

**测试目标**：验证配置缺失时的错误处理

**步骤 1：修改 `.env`，移除必需配置**
```env
RAG_ENABLED=true
# 移除 RAG_VECTORIZER_BASE_URL（或旧字段 RAG_VECTORIZER_API_URL）
# 移除 RAG_VECTORIZER_API_KEY
```

**步骤 2：重启服务器**
```bash
npm run dev
```

**预期结果**：
1. 服务器仍然能启动（不崩溃）
2. 日志显示警告：
   - `⚠️ RAG服务未初始化，MemoryService将不会创建`
   - 或类似提示
3. 聊天接口仍然可用（不使用 RAG）

**步骤 3：测试聊天接口**
```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{
      "role": "user",
      "content": "测试聊天"
    }],
    "stream": false
  }'
```

**预期结果**：
- 聊天功能正常（不依赖 RAG）
- 返回正常响应

---

### 案例8：配置变更测试

**测试目标**：验证配置格式统一后的正确性

**步骤 1：使用扁平格式配置**
```env
RAG_ENABLED=true
RAG_VECTORIZER_BASE_URL=https://api.siliconflow.cn/v1  # 推荐
RAG_VECTORIZER_API_KEY=your_key
RAG_VECTORIZER_MODEL=Qwen/Qwen3-Embedding-4B
RAG_VECTORIZER_DIMENSIONS=2560
```

**步骤 2：启动服务器并验证**
- 检查日志确认 RAG 已初始化
- 执行案例1的 API 调用
- 确认功能正常

**步骤 3：尝试嵌套格式（应无效）**
```env
rag.enabled=true
rag.vectorizer.baseURL=https://api.siliconflow.cn/v1
rag.vectorizer.apiKey=your_key
```

**步骤 4：重启服务器**
- 检查日志，确认 RAG **未**初始化
- 这证明嵌套格式已被移除

---

### 案例9：完整功能链路测试

**测试目标**：端到端验证 RAG + MemoryService + Chat 的完整流程

**测试步骤**：

1. **启动服务器**（确保配置正确）
2. **发送第一轮对话**（保存记忆）
   ```bash
   curl -X POST http://localhost:8088/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "gpt-4",
       "messages": [{
         "role": "user",
         "content": "我喜欢的颜色是蓝色"
       }],
       "stream": false
     }'
   ```
3. **检查日志**：确认记忆已保存（如果已实现）
4. **发送第二轮对话**（检索记忆）
   ```bash
   curl -X POST http://localhost:8088/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "gpt-4",
       "messages": [
         {
           "role": "user",
           "content": "我喜欢的颜色是蓝色"
         },
         {
           "role": "assistant",
           "content": "好的，我记住了"
         },
         {
           "role": "user",
           "content": "你还记得我喜欢什么颜色吗？"
         }
       ],
       "stream": false
     }'
   ```
5. **验证响应**：AI 应该能回答"蓝色"（如果记忆功能已实现）

---

### 案例10：性能测试

**测试目标**：验证 RAG 配置对性能的影响

**测试脚本**：
```bash
# 记录响应时间
time curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{
      "role": "user",
      "content": "测试响应时间"
    }],
    "stream": false
  }'
```

**预期结果**：
- 首次请求可能较慢（RAG 初始化）
- 后续请求响应时间正常（< 5秒，取决于 LLM）

---

## ✅ 验证检查清单

执行测试时，请确认：

### 配置验证
- [ ] 扁平格式配置 `RAG_VECTORIZER_*` 能正确读取
- [ ] 服务器启动日志显示 RAG 初始化成功
- [ ] MemoryService 正确初始化

### 功能验证
- [ ] 基础聊天接口 `/v1/chat/completions` 正常工作
- [ ] 流式聊天接口正常工作
- [ ] 人格切换功能 `agent_id` 正常工作
- [ ] 配置错误时系统优雅降级

### 性能验证
- [ ] 响应时间在可接受范围内
- [ ] 并发请求不崩溃
- [ ] 无内存泄漏

### 日志验证
- [ ] 启动日志清晰易读
- [ ] 错误日志有明确提示
- [ ] MemoryService 验证日志正常（如果启用）

---

## 📝 测试报告模板

**测试环境**：
- 服务器地址：`http://localhost:8088`
- 配置格式：扁平格式（`RAG_VECTORIZER_*`）
- 测试时间：`YYYY-MM-DD HH:mm:ss`

**测试结果**：

| 案例 | 测试项 | 状态 | 备注 |
|------|--------|------|------|
| 1 | 基础聊天 | ✅/❌ | |
| 2 | 流式聊天 | ✅/❌ | |
| 3 | 人格切换 | ✅/❌ | |
| 4 | RAG变量 | ✅/❌/N/A | |
| 5 | 多轮对话 | ✅/❌/N/A | |
| 6 | 并发请求 | ✅/❌ | |
| 7 | 错误处理 | ✅/❌ | |
| 8 | 配置变更 | ✅/❌ | |
| 9 | 完整链路 | ✅/❌/N/A | |
| 10 | 性能测试 | ✅/❌ | |

**发现问题**：
1. （如有问题，记录 here）

**建议**：
1. （如有建议，记录 here）

---

## 🔧 故障排查

### 问题1：RAG 服务未初始化

**症状**：日志显示 `⚠️ RAG服务未初始化`

**排查步骤**：
1. 检查 `.env` 文件中的配置
2. 确认 `RAG_ENABLED=true`
3. 确认 `RAG_VECTORIZER_BASE_URL`（或旧字段 `RAG_VECTORIZER_API_URL`） 和 `RAG_VECTORIZER_API_KEY` 已设置
4. 检查 API Key 是否有效
5. 检查网络连接（能否访问 embedding API）

### 问题2：聊天接口返回错误

**症状**：API 返回 500 错误

**排查步骤**：
1. 查看服务器日志
2. 检查 LLM 配置是否正确
3. 确认服务器依赖已安装

### 问题3：配置格式问题

**症状**：使用嵌套格式时 RAG 不工作

**解决方案**：
- 这是预期的！嵌套格式已被移除
- 请使用扁平格式：`RAG_VECTORIZER_*`

---

## 📚 相关文档

- [MemoryService 验证指南](./MEMORY_SERVICE_VERIFICATION.md)
- [配置说明](../env.template)
- [架构文档](./design/ARCHITECTURE.md)

