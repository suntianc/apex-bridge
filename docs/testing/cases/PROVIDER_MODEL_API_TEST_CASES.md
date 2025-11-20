# 提供商和模型 API 测试用例

> **模块**: Provider & Model API (新架构)  
> **优先级**: P0  
> **架构版本**: v2.0  
> **最后更新**: 2025-11-18

## 📋 测试概述

本文档包含新的两级配置架构的 API 测试用例，覆盖提供商管理和模型管理的所有接口。

### 测试范围

**提供商 API (5 个端点)**:
- ✅ GET `/api/llm/providers` - 列出提供商
- ✅ GET `/api/llm/providers/:id` - 获取提供商
- ✅ POST `/api/llm/providers` - 创建提供商
- ✅ PUT `/api/llm/providers/:id` - 更新提供商
- ✅ DELETE `/api/llm/providers/:id` - 删除提供商

**模型 API (7 个端点)**:
- ✅ GET `/api/llm/providers/:providerId/models` - 列出模型
- ✅ GET `/api/llm/providers/:providerId/models/:modelId` - 获取模型
- ✅ POST `/api/llm/providers/:providerId/models` - 创建模型
- ✅ PUT `/api/llm/providers/:providerId/models/:modelId` - 更新模型
- ✅ DELETE `/api/llm/providers/:providerId/models/:modelId` - 删除模型
- ✅ GET `/api/llm/models?type=nlp` - 按类型查询
- ✅ GET `/api/llm/models/default?type=embedding` - 获取默认模型

---

## 提供商 API 测试

### 用例 API-PROV-001: 列出所有提供商

**优先级**: P0  
**类型**: 功能测试

#### 测试步骤

```bash
curl http://localhost:8088/api/llm/providers | jq
```

#### 预期结果

```json
{
  "success": true,
  "providers": [
    {
      "id": 1,
      "provider": "deepseek",
      "name": "DeepSeek",
      "description": "DeepSeek AI...",
      "enabled": true,
      "modelCount": 2,
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ]
}
```

#### 验证点

- [ ] HTTP 200
- [ ] 返回 providers 数组
- [ ] 包含 modelCount
- [ ] 不返回敏感信息（API Key）

---

### 用例 API-PROV-002: 获取提供商详情

**优先级**: P0

#### 测试步骤

```bash
curl http://localhost:8088/api/llm/providers/1 | jq
```

#### 预期结果

```json
{
  "success": true,
  "provider": {
    "id": 1,
    "provider": "deepseek",
    "name": "DeepSeek",
    "baseConfig": {
      "baseURL": "https://api.deepseek.com",
      "timeout": 60000
      // API Key 被隐藏
    },
    "enabled": true,
    "modelCount": 2
  }
}
```

#### 验证点

- [ ] HTTP 200
- [ ] 返回提供商详情
- [ ] baseConfig 不含敏感信息
- [ ] 包含 modelCount

---

### 用例 API-PROV-003: 创建提供商

**优先级**: P0

#### 测试步骤

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
      "timeout": 60000
    },
    "enabled": true
  }'
```

#### 预期结果

```json
{
  "success": true,
  "message": "Provider created successfully",
  "provider": {
    "id": 3,
    "provider": "zhipu",
    "name": "智谱 AI",
    "enabled": true
  }
}
```

#### 验证点

- [ ] HTTP 201
- [ ] 返回新 ID
- [ ] 数据持久化

---

### 用例 API-PROV-004: 更新提供商

**优先级**: P0

#### 测试步骤

```bash
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DeepSeek AI Updated",
    "baseConfig": {
      "timeout": 120000
    }
  }'
```

#### 预期结果

```json
{
  "success": true,
  "message": "Provider updated successfully",
  "provider": {
    "id": 1,
    "name": "DeepSeek AI Updated",
    "updatedAt": 1700000001000
  }
}
```

#### 验证点

- [ ] HTTP 200
- [ ] 配置更新成功
- [ ] updated_at 更新

---

### 用例 API-PROV-005: 删除提供商（级联删除模型）

**优先级**: P0

#### 测试步骤

```bash
# 1. 创建测试提供商和模型
curl -X POST http://localhost:8088/api/llm/providers \
  -d '{"provider": "test", "name": "Test", "baseConfig": {"baseURL": "http://test"}}'

# 2. 添加模型
curl -X POST http://localhost:8088/api/llm/providers/3/models \
  -d '{"modelKey": "test-model", "modelType": "nlp"}'

# 3. 删除提供商
curl -X DELETE http://localhost:8088/api/llm/providers/3

# 4. 验证模型也被删除
curl http://localhost:8088/api/llm/providers/3/models
```

#### 预期结果

- 提供商删除成功
- 模型自动删除（级联）
- 查询返回 404

#### 验证点

- [ ] HTTP 200
- [ ] 提供商被删除
- [ ] 模型自动删除
- [ ] 后续查询 404

---

## 模型 API 测试

### 用例 API-MODEL-001: 列出提供商的模型

**优先级**: P0

#### 测试步骤

```bash
curl http://localhost:8088/api/llm/providers/1/models | jq
```

#### 预期结果

```json
{
  "success": true,
  "provider": {
    "id": 1,
    "provider": "deepseek",
    "name": "DeepSeek"
  },
  "models": [
    {
      "id": 1,
      "modelKey": "deepseek-chat",
      "modelType": "nlp",
      "enabled": true,
      "isDefault": true
    }
  ]
}
```

#### 验证点

- [ ] HTTP 200
- [ ] 返回提供商信息
- [ ] 返回模型列表
- [ ] 按顺序排列

---

### 用例 API-MODEL-002: 获取模型详情

**优先级**: P0

#### 测试步骤

```bash
curl http://localhost:8088/api/llm/providers/1/models/1 | jq
```

#### 预期结果

```json
{
  "success": true,
  "model": {
    "id": 1,
    "providerId": 1,
    "provider": "deepseek",
    "providerName": "DeepSeek",
    "modelKey": "deepseek-chat",
    "modelName": "DeepSeek Chat",
    "modelType": "nlp",
    "modelConfig": {...},
    "apiEndpointSuffix": "/chat/completions",
    "enabled": true,
    "isDefault": true
  }
}
```

#### 验证点

- [ ] HTTP 200
- [ ] 包含完整模型信息
- [ ] 包含提供商信息
- [ ] 配置完整

---

### 用例 API-MODEL-003: 创建模型

**优先级**: P0

#### 测试步骤

```bash
curl -X POST http://localhost:8088/api/llm/providers/1/models \
  -H "Content-Type: application/json" \
  -d '{
    "modelKey": "deepseek-embeddings",
    "modelName": "DeepSeek Embeddings",
    "modelType": "embedding",
    "modelConfig": {"dimensions": 1024},
    "apiEndpointSuffix": "/embeddings",
    "enabled": true,
    "isDefault": true
  }'
```

#### 预期结果

```json
{
  "success": true,
  "message": "Model created successfully",
  "model": {
    "id": 3,
    "providerId": 1,
    "modelKey": "deepseek-embeddings",
    "modelType": "embedding",
    "isDefault": true
  }
}
```

#### 验证点

- [ ] HTTP 201
- [ ] 返回模型 ID
- [ ] 关联正确的提供商
- [ ] 数据持久化

---

### 用例 API-MODEL-004: 按类型查询模型

**优先级**: P0

#### 测试步骤

```bash
# 查询所有 NLP 模型
curl "http://localhost:8088/api/llm/models?type=nlp" | jq

# 查询所有 Embedding 模型
curl "http://localhost:8088/api/llm/models?type=embedding" | jq
```

#### 预期结果

- NLP: 返回所有 NLP 模型
- Embedding: 返回所有 Embedding 模型

#### 验证点

- [ ] HTTP 200
- [ ] 类型筛选正确
- [ ] 返回模型数量正确
- [ ] 包含提供商信息

---

### 用例 API-MODEL-005: 获取默认模型

**优先级**: P0

#### 测试步骤

```bash
# 获取默认 NLP 模型
curl "http://localhost:8088/api/llm/models/default?type=nlp" | jq

# 获取默认 Embedding 模型
curl "http://localhost:8088/api/llm/models/default?type=embedding" | jq

# 查询不存在的类型
curl "http://localhost:8088/api/llm/models/default?type=rerank" | jq
```

#### 预期结果

- NLP: 返回 deepseek-chat
- Embedding: 返回 text-embedding-ada-002
- Rerank: 返回 404

#### 验证点

- [ ] 正确类型返回模型
- [ ] 包含完整配置
- [ ] 不存在返回 404

---

## 📊 测试结果汇总

### API 端点统计

| 分类 | 端点数 | 测试用例 |
|------|--------|----------|
| 提供商 API | 5 | 5 个 |
| 模型 API | 7 | 10 个 |
| **总计** | **12** | **15** |

---

## 🔗 相关文档

- [LLMManager 测试用例](./LLM_MANAGER_TEST_CASES.md)
- [LLMConfigService 测试用例](./LLM_CONFIG_SERVICE_TEST_CASES.md)
- [快速验证清单](../guides/QUICK_VALIDATION_CHECKLIST.md)

---

*最后更新: 2025-11-18*

