# ApexBridge 快速启动指南

> **目标**: 5 分钟完成配置并启动服务  
> **最后更新**: 2025-11-18

## 🚀 快速启动（5 分钟）

### 步骤 1: 初始化 LLM 提供商配置 (1 分钟)

```bash
cd /home/suntc/project/ApexBridge/apex-bridge

# 运行初始化脚本
node scripts/init-llm-providers.js
```

**输出**:
```
✅ 已启用 DeepSeek AI (deepseek)
⚪ 未启用 OpenAI GPT (openai)
⚪ 未启用 智谱 AI (zhipu)
⚪ 未启用 Ollama 本地模型 (ollama)
```

---

### 步骤 2: 更新真实 API Key (1 分钟)

**你现在的 DeepSeek API Key**: `sk-edcfe0c2c69e4c9f82ff60f16626022a`

```bash
# 启动服务（后台运行）
npm start &

# 等待 5 秒
sleep 5

# 更新 DeepSeek API Key
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "apiKey": "sk-edcfe0c2c69e4c9f82ff60f16626022a"
    }
  }'
```

---

### 步骤 3: 验证配置 (1 分钟)

```bash
# 查看所有提供商
curl http://localhost:8088/api/llm/providers | jq

# 或使用测试脚本
bash scripts/test-llm-api.sh
```

---

### 步骤 4: 测试聊天 (2 分钟)

```bash
# 测试基本聊天
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "stream": false
  }' | jq '.choices[0].message.content'
```

---

## ✅ 成功标志

如果看到以下输出，说明配置成功：

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "model": "deepseek-chat",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "你好！我是 DeepSeek AI..."
    },
    "finish_reason": "stop"
  }]
}
```

---

## 🔧 常见问题

### Q1: API Key 无效？

```bash
# 重新更新 API Key
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -H "Content-Type: application/json" \
  -d '{"config": {"apiKey": "sk-your-correct-key"}}'
```

### Q2: 服务启动失败？

```bash
# 查看日志
tail -f logs/apexbridge.log

# 或查看启动输出
npm run dev
```

### Q3: 认证错误？

确保 `config/admin-config.json` 中：
```json
{
  "auth": {
    "enabled": false
  }
}
```

---

## 📚 相关文档

- [LLM 配置完整指南](./LLM_CONFIG_GUIDE.md)
- [API Key 更新指南](./UPDATE_LLM_API_KEY.md)
- [配置文件说明](./CONFIG_GUIDE.md)
- [10 分钟快速验证](../docs/testing/guides/QUICK_VALIDATION_CHECKLIST.md)

---

## 🎯 下一步

配置完成后，你可以：

1. ✅ 使用聊天功能
2. ✅ 测试 Skills 工具调用
3. ✅ 启用其他 LLM 提供商
4. ✅ 配置认证和安全设置

---

**Happy Coding! 🎉**

