# LLM 配置手动设置指南

> **场景**: 从零开始手动配置 LLM 提供商和模型  
> **适用**: 需要自定义配置的场景  
> **最后更新**: 2025-11-18

---

## 🎯 配置流程

### 总流程

```
1. 添加提供商（配置 API Key, Base URL 等）
   ↓
2. 添加该提供商的模型（指定类型、端点）
   ↓
3. 设置默认模型
   ↓
4. 测试使用
```

---

## 📝 详细步骤

### 步骤 1: 添加提供商

#### 示例 1: 添加 DeepSeek

```bash
curl -X POST http://localhost:8088/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "deepseek",
    "name": "DeepSeek AI",
    "description": "DeepSeek 聊天和代码模型",
    "baseConfig": {
      "apiKey": "sk-your-deepseek-api-key",
      "baseURL": "https://api.deepseek.com",
      "timeout": 60000,
      "maxRetries": 3
    },
    "enabled": true
  }'
```

**响应**:
```json
{
  "success": true,
  "provider": {
    "id": 1,
    "provider": "deepseek",
    "name": "DeepSeek AI"
  }
}
```

**记住返回的 ID（例如 1），后续添加模型时需要。**

---

### 步骤 2: 添加模型

#### 2.1 添加 NLP 模型（聊天）

```bash
# 为 DeepSeek (ID=1) 添加聊天模型
curl -X POST http://localhost:8088/api/llm/providers/1/models \
  -H "Content-Type: application/json" \
  -d '{
    "modelKey": "deepseek-chat",
    "modelName": "DeepSeek Chat",
    "modelType": "nlp",
    "modelConfig": {
      "contextWindow": 32000,
      "maxTokens": 4096
    },
    "apiEndpointSuffix": "/chat/completions",
    "enabled": true,
    "isDefault": true
  }'
```

#### 2.2 添加 Embedding 模型（向量化）

```bash
# 为 DeepSeek 添加 Embedding 模型
curl -X POST http://localhost:8088/api/llm/providers/1/models \
  -H "Content-Type: application/json" \
  -d '{
    "modelKey": "deepseek-embeddings",
    "modelName": "DeepSeek Embeddings",
    "modelType": "embedding",
    "modelConfig": {
      "dimensions": 1024
    },
    "apiEndpointSuffix": "/embeddings",
    "enabled": true,
    "isDefault": true
  }'
```

#### 2.3 添加 Rerank 模型（重排序）

```bash
# 如果提供商支持 Rerank
curl -X POST http://localhost:8088/api/llm/providers/1/models \
  -H "Content-Type: application/json" \
  -d '{
    "modelKey": "deepseek-rerank",
    "modelName": "DeepSeek Rerank",
    "modelType": "rerank",
    "modelConfig": {
      "topK": 10
    },
    "apiEndpointSuffix": "/rerank",
    "enabled": true,
    "isDefault": true
  }'
```

---

### 步骤 3: 验证配置

```bash
# 查看提供商列表
curl http://localhost:8088/api/llm/providers | jq

# 查看 DeepSeek 的所有模型
curl http://localhost:8088/api/llm/providers/1/models | jq

# 查看默认 NLP 模型
curl "http://localhost:8088/api/llm/models/default?type=nlp" | jq

# 查看默认 Embedding 模型
curl "http://localhost:8088/api/llm/models/default?type=embedding" | jq
```

---

### 步骤 4: 测试使用

```bash
# 测试聊天（使用默认 NLP 模型）
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

---

## 📋 配置模板

### OpenAI 完整配置

```bash
# 1. 添加提供商
curl -X POST http://localhost:8088/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "name": "OpenAI",
    "description": "OpenAI GPT 系列模型",
    "baseConfig": {
      "apiKey": "sk-your-openai-api-key",
      "baseURL": "https://api.openai.com/v1",
      "timeout": 60000,
      "maxRetries": 3
    },
    "enabled": true
  }'

# 假设返回 ID=2

# 2. 添加 GPT-4
curl -X POST http://localhost:8088/api/llm/providers/2/models \
  -d '{
    "modelKey": "gpt-4",
    "modelName": "GPT-4",
    "modelType": "nlp",
    "modelConfig": {"contextWindow": 128000, "maxTokens": 4096},
    "apiEndpointSuffix": "/chat/completions",
    "isDefault": true
  }'

# 3. 添加 GPT-3.5 Turbo
curl -X POST http://localhost:8088/api/llm/providers/2/models \
  -d '{
    "modelKey": "gpt-3.5-turbo",
    "modelName": "GPT-3.5 Turbo",
    "modelType": "nlp",
    "modelConfig": {"contextWindow": 16384, "maxTokens": 4096},
    "apiEndpointSuffix": "/chat/completions"
  }'

# 4. 添加 Embeddings
curl -X POST http://localhost:8088/api/llm/providers/2/models \
  -d '{
    "modelKey": "text-embedding-ada-002",
    "modelName": "Ada Embeddings v2",
    "modelType": "embedding",
    "modelConfig": {"dimensions": 1536},
    "apiEndpointSuffix": "/embeddings",
    "isDefault": true
  }'
```

---

## 🔧 字段说明

### 提供商必需字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `provider` | string | 提供商标识（唯一） | "deepseek" |
| `name` | string | 显示名称 | "DeepSeek AI" |
| `baseConfig.baseURL` | string | API 基础地址 | "https://api.deepseek.com" |

### 提供商可选字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `description` | string | - | 提供商描述 |
| `baseConfig.apiKey` | string | - | API 密钥 |
| `baseConfig.timeout` | number | 60000 | 超时（毫秒） |
| `baseConfig.maxRetries` | number | 3 | 最大重试 |
| `enabled` | boolean | true | 是否启用 |

### 模型必需字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `modelKey` | string | 模型标识 | "gpt-4" |
| `modelName` | string | 显示名称 | "GPT-4" |
| `modelType` | string | 模型类型 | "nlp" / "embedding" / "rerank" |

### 模型可选字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `modelConfig` | object | {} | 模型配置 |
| `apiEndpointSuffix` | string | auto | API 端点后缀 |
| `enabled` | boolean | true | 是否启用 |
| `isDefault` | boolean | false | 是否默认 |
| `displayOrder` | number | 0 | 显示顺序 |

---

## 📊 模型类型说明

| 类型 | 标识 | 用途 | 常见端点 |
|------|------|------|----------|
| **NLP** | `nlp` | 聊天/文本生成 | `/chat/completions` |
| **Embedding** | `embedding` | 文本向量化 | `/embeddings` |
| **Rerank** | `rerank` | 结果重排序 | `/rerank` |
| **Image** | `image` | 图像生成 | `/images/generations` |
| **Audio** | `audio` | 语音处理 | `/audio/transcriptions` |

---

## 💡 配置技巧

### 1. 先配置提供商，再添加模型

```bash
# 错误顺序 ❌
POST /api/llm/providers/1/models  # 提供商 1 还不存在

# 正确顺序 ✅
POST /api/llm/providers           # 先创建提供商
POST /api/llm/providers/1/models  # 再添加模型
```

### 2. 每种类型设置一个默认模型

```bash
# NLP 默认
POST .../models -d '{"modelType": "nlp", "isDefault": true}'

# Embedding 默认
POST .../models -d '{"modelType": "embedding", "isDefault": true}'
```

### 3. 端点后缀如何确定

参考 `src/config/endpoint-mappings.ts` 中的配置，或查看提供商的 API 文档。

---

## 🧰 辅助命令

```bash
# 清空所有配置
echo "yes" | node scripts/clear-llm-config.js

# 仅清空模型（保留提供商）
echo "yes" | node scripts/clear-llm-config.js --models-only

# 查看当前配置
curl http://localhost:8088/api/llm/providers | jq

# 查看数据库结构
node scripts/check-db-structure.js
```

---

老大，数据库已清空！✅

**当前状态**:
- ✅ 提供商: 0 个
- ✅ 模型: 0 个
- ✅ 数据库表结构保留
- ✅ 自增 ID 已重置

**下一步**: 你可以开始手动添加提供商和模型了！

需要我提供完整的配置示例吗？🚀
