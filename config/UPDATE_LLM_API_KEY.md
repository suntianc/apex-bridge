# 更新 LLM API Key 快速指南

> **场景**: 初始化后需要更新真实的 API Key  
> **目标**: 将占位符 API Key 替换为真实的 Key

## 🚀 三种更新方式

### 方式 1: 使用 API 接口（推荐）⭐

**优点**: 简单、安全、支持热更新

```bash
# 更新 DeepSeek API Key（ID=1）
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "apiKey": "sk-your-actual-deepseek-api-key"
    }
  }'

# 验证更新
curl http://localhost:8088/api/llm/providers/1
```

---

### 方式 2: 直接编辑 SQLite 数据库

**优点**: 适合批量更新或离线配置

```bash
# 进入数据库
sqlite3 data/llm_providers.db

# 查看当前配置
SELECT id, provider, name FROM llm_providers;

# 更新 DeepSeek API Key
UPDATE llm_providers 
SET config_json = json_set(
  config_json,
  '$.apiKey',
  'sk-your-actual-deepseek-api-key'
),
updated_at = strftime('%s','now') * 1000
WHERE provider = 'deepseek';

# 验证更新
SELECT provider, json_extract(config_json, '$.apiKey') as api_key 
FROM llm_providers;

# 退出
.quit
```

---

### 方式 3: 使用环境变量重新初始化

**优点**: 自动化配置，适合部署脚本

```bash
# 设置环境变量
export DEEPSEEK_API_KEY="sk-your-actual-deepseek-api-key"
export OPENAI_API_KEY="sk-your-actual-openai-api-key"
export ZHIPU_API_KEY="your-actual-zhipu-api-key"

# 重新运行初始化脚本（会覆盖现有配置）
node scripts/init-llm-providers.js

# 脚本会自动使用环境变量中的 API Key
```

---

## 📝 各提供商 API Key 获取

### DeepSeek

1. 访问: https://platform.deepseek.com
2. 注册/登录账号
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 复制 Key（格式: `sk-xxx`）

---

### OpenAI

1. 访问: https://platform.openai.com
2. 注册/登录账号（需要国际网络）
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 复制 Key（格式: `sk-xxx`）

---

### 智谱 AI

1. 访问: https://open.bigmodel.cn
2. 注册/登录账号
3. 进入个人中心 → API Keys
4. 创建新的 API Key
5. 复制 Key

---

### Ollama（本地）

无需 API Key，但需要：

1. 安装 Ollama: https://ollama.ai
2. 下载模型:
   ```bash
   ollama pull llama2
   ollama pull mistral
   ```
3. 确认服务运行:
   ```bash
   curl http://localhost:11434/api/tags
   ```

---

## ✅ 验证配置

### 验证步骤 1: 查看提供商列表

```bash
curl http://localhost:8088/api/llm/providers | jq
```

### 验证步骤 2: 测试聊天

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好，请用一句话介绍你自己"}
    ],
    "stream": false
  }' | jq
```

**成功标志**:
- HTTP 200
- 返回 AI 响应内容
- 无 API Key 错误

---

## 🔧 常见问题

### Q: API Key 格式不对？

**A**: 确保 API Key 格式正确：
- OpenAI/DeepSeek: `sk-` 开头
- 智谱 AI: 无特定前缀
- 检查是否有多余空格

### Q: 更新后不生效？

**A**: 
1. 检查数据库是否真的更新了
2. 如果服务正在运行，等待几秒（热更新需要时间）
3. 或者重启服务确保生效

### Q: 如何启用多个提供商？

**A**:
```bash
# 启用 OpenAI
curl -X PUT http://localhost:8088/api/llm/providers/2 \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# 在请求时指定使用哪个
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "provider": "openai"
  }'
```

---

## 🎯 推荐配置

### 单一提供商（简单）

只启用一个提供商，如 DeepSeek：

```bash
# 1. 更新 DeepSeek API Key
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -d '{"config": {"apiKey": "sk-your-key"}}'

# 2. 设置为默认（admin-config.json）
"llm": {"defaultProvider": "deepseek"}

# 3. 启动服务
npm run dev
```

---

### 多提供商（高级）

启用多个提供商，按需切换：

```bash
# 1. 更新所有 API Keys
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -d '{"config": {"apiKey": "sk-deepseek-key"}}'

curl -X PUT http://localhost:8088/api/llm/providers/2 \
  -d '{"config": {"apiKey": "sk-openai-key"}, "enabled": true}'

# 2. 设置默认提供商（admin-config.json）
"llm": {"defaultProvider": "deepseek"}

# 3. 在请求中临时切换
curl -X POST http://localhost:8088/v1/chat/completions \
  -d '{"messages": [...], "provider": "openai"}'
```

---

**最后更新**: 2025-11-18

