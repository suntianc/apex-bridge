# LLM 配置使用指南（新架构）

> **架构版本**: v2.0  
> **完成日期**: 2025-11-18  
> **状态**: ✅ 生产就绪

---

## 🎯 新架构特点

### 两级配置结构

```
提供商（Provider）
  ├── 基础配置（API Key, Base URL 等）
  └── 模型列表（Models）
      ├── 模型 1（NLP）
      ├── 模型 2（NLP）
      └── 模型 3（Embedding）
```

### 支持的模型类型

| 类型 | 用途 | API 端点示例 |
|------|------|-------------|
| **nlp** | 聊天/文本生成 | `/chat/completions` |
| **embedding** | 文本向量化（RAG） | `/embeddings` |
| **rerank** | 结果重排序 | `/rerank` |
| **image** | 图像生成 | `/images/generations` |
| **audio** | 语音处理 | `/audio/transcriptions` |

---

## 🚀 快速开始

### 1. 初始化配置（首次使用）

```bash
# 运行初始化脚本
node scripts/init-llm-config-v2.js
```

**结果**:
```
✅ DeepSeek (已启用, 2 个 NLP 模型)
⚪ OpenAI (未启用, 2 个 NLP + 1 个 Embedding 模型)
```

---

### 2. 更新 API Key

```bash
# 更新 DeepSeek API Key
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -H "Content-Type: application/json" \
  -d '{
    "baseConfig": {
      "apiKey": "sk-your-actual-deepseek-key"
    }
  }'
```

---

### 3. 启动服务

```bash
npm run dev
```

---

### 4. 验证配置

```bash
# 列出所有提供商
curl http://localhost:8088/api/llm/providers | jq

# 列出 DeepSeek 的所有模型
curl http://localhost:8088/api/llm/providers/1/models | jq
```

---

## 📝 常用操作

### 提供商管理

#### 列出所有提供商

```bash
curl http://localhost:8088/api/llm/providers | jq
```

#### 添加新提供商

```bash
curl -X POST http://localhost:8088/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "zhipu",
    "name": "智谱 AI",
    "description": "智谱 GLM 系列",
    "baseConfig": {
      "apiKey": "your-api-key",
      "baseURL": "https://open.bigmodel.cn/api/paas/v4",
      "timeout": 60000,
      "maxRetries": 3
    },
    "enabled": true
  }'
```

#### 启用/禁用提供商

```bash
# 启用
curl -X PUT http://localhost:8088/api/llm/providers/2 \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# 禁用
curl -X PUT http://localhost:8088/api/llm/providers/2 \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

---

### 模型管理

#### 列出提供商的所有模型

```bash
curl http://localhost:8088/api/llm/providers/1/models | jq
```

#### 添加新模型

```bash
# 添加 Embedding 模型
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

#### 设置默认模型

```bash
curl -X PUT http://localhost:8088/api/llm/providers/2/models/3 \
  -H "Content-Type: application/json" \
  -d '{"isDefault": true}'
```

#### 查询模型

```bash
# 查询所有 NLP 模型
curl "http://localhost:8088/api/llm/models?type=nlp" | jq

# 查询所有 Embedding 模型
curl "http://localhost:8088/api/llm/models?type=embedding" | jq

# 获取默认 NLP 模型
curl "http://localhost:8088/api/llm/models/default?type=nlp" | jq

# 获取默认 Embedding 模型
curl "http://localhost:8088/api/llm/models/default?type=embedding" | jq
```

---

## 🔧 配置端点后缀

### 查看已配置的端点

**文件**: `src/config/endpoint-mappings.ts`

### 添加新提供商端点

编辑 `src/config/endpoint-mappings.ts`:

```typescript
export const PROVIDER_ENDPOINT_MAPPINGS = {
  // ... 现有配置 ...
  
  // 添加你的提供商
  your_provider: {
    nlp: '/your/chat/endpoint',
    embedding: '/your/embeddings/endpoint',
    rerank: '/your/rerank/endpoint'
  }
};
```

**需要你补充的端点配置**:
- 文心一言 (ERNIE)
- 通义千问 (Qwen)
- Moonshot
- 百度文心
- 阿里通义
- ... 其他提供商

---

## 📊 当前配置状态

### 提供商

```
✅ DeepSeek (已启用)
   - API Key: sk-edcf...022a
   - Base URL: https://api.deepseek.com
   - 模型数: 2

⚪ OpenAI (未启用)
   - API Key: sk-your...key (占位符)
   - Base URL: https://api.openai.com/v1
   - 模型数: 3
```

### 模型

```
NLP 模型 (4 个):
  ✅ deepseek-chat 🌟 (DeepSeek)
  ✅ deepseek-coder (DeepSeek)
  ⚪ gpt-4 🌟 (OpenAI)
  ⚪ gpt-3.5-turbo (OpenAI)

Embedding 模型 (1 个):
  ⚪ text-embedding-ada-002 🌟 (OpenAI)
```

---

## 🎯 典型使用场景

### 场景 1: 配置多个 NLP 模型

```bash
# 1. 添加提供商
curl -X POST http://localhost:8088/api/llm/providers -d '{...}'

# 2. 添加通用聊天模型
curl -X POST http://localhost:8088/api/llm/providers/3/models \
  -d '{
    "modelKey": "model-chat",
    "modelType": "nlp",
    "apiEndpointSuffix": "/chat/completions",
    "isDefault": true
  }'

# 3. 添加代码专用模型
curl -X POST http://localhost:8088/api/llm/providers/3/models \
  -d '{
    "modelKey": "model-coder",
    "modelType": "nlp",
    "apiEndpointSuffix": "/chat/completions"
  }'
```

### 场景 2: 配置 RAG 完整链路

```bash
# 1. 添加 Embedding 模型
curl -X POST http://localhost:8088/api/llm/providers/1/models \
  -d '{
    "modelKey": "embedding-model",
    "modelType": "embedding",
    "apiEndpointSuffix": "/embeddings",
    "isDefault": true
  }'

# 2. 添加 Rerank 模型
curl -X POST http://localhost:8088/api/llm/providers/1/models \
  -d '{
    "modelKey": "rerank-model",
    "modelType": "rerank",
    "apiEndpointSuffix": "/rerank",
    "isDefault": true
  }'

# 3. RAG 服务会自动使用默认 Embedding 模型
```

---

## 🔗 API 完整列表

### 提供商 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/llm/providers` | 列出所有提供商 |
| GET | `/api/llm/providers/:id` | 获取提供商详情 |
| POST | `/api/llm/providers` | 创建提供商 |
| PUT | `/api/llm/providers/:id` | 更新提供商 |
| DELETE | `/api/llm/providers/:id` | 删除提供商 |

### 模型 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/llm/providers/:providerId/models` | 列出提供商的模型 |
| GET | `/api/llm/providers/:providerId/models/:modelId` | 获取模型详情 |
| POST | `/api/llm/providers/:providerId/models` | 创建模型 |
| PUT | `/api/llm/providers/:providerId/models/:modelId` | 更新模型 |
| DELETE | `/api/llm/providers/:providerId/models/:modelId` | 删除模型 |
| GET | `/api/llm/models?type=nlp` | 按类型查询模型 |
| GET | `/api/llm/models/default?type=embedding` | 获取默认模型 |

---

## 📚 相关文档

- [数据库架构设计](./docs/llm-v2/DATABASE_SCHEMA_V2.md)
- [完整使用指南](./config/LLM_CONFIG_GUIDE.md)
- [快速启动](./config/QUICK_START.md)

---

**最后更新**: 2025-11-18  
**维护者**: ApexBridge Team

