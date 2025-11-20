# LLMConfigService 测试用例 (LLMConfigService Test Cases)

> **模块**: LLMConfigService (LLM 配置服务 - 新架构)  
> **优先级**: P0  
> **架构版本**: v2.0 (两级配置：提供商+模型)  
> **最后更新**: 2025-11-18

## 📋 测试概述

本文档包含 LLMConfigService 模块的详细测试用例，基于新的两级配置架构。

### 测试范围

- ✅ 数据库初始化（两级表结构）
- ✅ 提供商 CRUD 操作
- ✅ 模型 CRUD 操作
- ✅ 默认模型管理
- ✅ 模型类型查询
- ✅ 级联删除
- ✅ 数据验证

### 数据库结构

```
llm_providers (提供商表)
  └─ llm_models (模型表，外键关联)
```

### 前置条件

- ApexBridge 服务已启动
- SQLite 数据库已初始化
- 两级表结构已创建

---

## 数据库初始化测试

### 用例 CFG-001: 两级表结构初始化

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证两级表结构的自动创建。

#### 测试步骤

```bash
# 1. 删除现有数据库（测试用）
rm -f data/llm_providers.db

# 2. 启动服务
npm run dev &
sleep 3

# 3. 检查表结构
node scripts/check-db-structure.js
```

#### 预期结果

- 自动创建 `llm_providers` 表
- 自动创建 `llm_models` 表
- 创建所有必需索引
- 外键约束已启用

#### 验证点

- [ ] `llm_providers` 表存在
- [ ] `llm_models` 表存在
- [ ] 表字段完整
- [ ] 索引已创建
- [ ] 外键约束生效

#### 通过标准

两级表结构自动创建成功。

---

### 用例 CFG-002: 外键级联删除验证

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证删除提供商时自动级联删除所有模型。

#### 测试步骤

```bash
# 1. 创建测试提供商
curl -X POST http://localhost:8088/api/llm/providers \
  -d '{
    "provider": "test-provider",
    "name": "Test Provider",
    "baseConfig": {"baseURL": "http://test.com"},
    "enabled": true
  }'

# 假设返回 ID 为 3

# 2. 为该提供商添加 2 个模型
curl -X POST http://localhost:8088/api/llm/providers/3/models \
  -d '{"modelKey": "test-model-1", "modelName": "Test Model 1", "modelType": "nlp"}'

curl -X POST http://localhost:8088/api/llm/providers/3/models \
  -d '{"modelKey": "test-model-2", "modelName": "Test Model 2", "modelType": "nlp"}'

# 3. 删除提供商
curl -X DELETE http://localhost:8088/api/llm/providers/3

# 4. 验证模型也被删除
curl http://localhost:8088/api/llm/providers/3/models
```

#### 预期结果

- 提供商删除成功
- 关联的模型自动删除
- 返回 404 错误

#### 验证点

- [ ] 提供商删除成功
- [ ] 模型自动删除
- [ ] 查询返回 404
- [ ] 无孤儿记录

#### 通过标准

级联删除机制正常工作。

---

## 提供商管理测试

### 用例 CFG-003: 创建提供商

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证创建新提供商的功能。

#### 测试步骤

```bash
curl -X POST http://localhost:8088/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "zhipu",
    "name": "智谱 AI",
    "description": "智谱 GLM 系列模型",
    "baseConfig": {
      "apiKey": "your-zhipu-key",
      "baseURL": "https://open.bigmodel.cn/api/paas/v4",
      "timeout": 60000,
      "maxRetries": 3
    },
    "enabled": true
  }'
```

#### 预期结果

- 提供商创建成功
- 返回提供商 ID
- 数据持久化

#### 验证点

- [ ] HTTP 201 Created
- [ ] 返回提供商 ID
- [ ] 配置可查询
- [ ] base_config 正确保存

#### 通过标准

提供商创建成功。

---

### 用例 CFG-004: 提供商唯一性约束

**优先级**: P0  
**类型**: 异常测试

#### 测试目标

验证 provider 字段的唯一性约束。

#### 测试步骤

```bash
# 尝试创建重复的提供商
curl -X POST http://localhost:8088/api/llm/providers \
  -d '{
    "provider": "deepseek",
    "name": "Duplicate DeepSeek",
    "baseConfig": {"baseURL": "http://test.com"}
  }'
```

#### 预期结果

- HTTP 409 Conflict
- 错误消息提示已存在

#### 验证点

- [ ] 返回 409 错误
- [ ] 错误消息明确
- [ ] 原记录不受影响

#### 通过标准

唯一性约束正常工作。

---

## 模型管理测试

### 用例 CFG-005: 创建模型

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证在提供商下创建模型。

#### 测试步骤

```bash
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

#### 预期结果

- 模型创建成功
- 关联到正确的提供商
- 配置正确保存

#### 验证点

- [ ] HTTP 201 Created
- [ ] 返回模型 ID
- [ ] provider_id 正确
- [ ] model_config 正确

#### 通过标准

模型创建成功。

---

### 用例 CFG-006: 模型唯一性约束

**优先级**: P0  
**类型**: 异常测试

#### 测试目标

验证同一提供商下模型 Key 的唯一性。

#### 测试步骤

```bash
# 尝试创建重复的模型
curl -X POST http://localhost:8088/api/llm/providers/1/models \
  -d '{
    "modelKey": "deepseek-chat",
    "modelName": "Duplicate Model",
    "modelType": "nlp"
  }'
```

#### 预期结果

- HTTP 409 Conflict
- 错误消息提示该提供商下已有此模型

#### 验证点

- [ ] 返回 409 错误
- [ ] 错误消息明确
- [ ] 原记录不受影响

#### 通过标准

唯一性约束正常工作。

---

### 用例 CFG-007: 模型类型验证

**优先级**: P0  
**类型**: 异常测试

#### 测试目标

验证 model_type 的枚举值验证。

#### 测试步骤

```bash
# 尝试创建无效类型的模型
curl -X POST http://localhost:8088/api/llm/providers/1/models \
  -d '{
    "modelKey": "invalid-model",
    "modelName": "Invalid Model",
    "modelType": "invalid_type"
  }'
```

#### 预期结果

- HTTP 400 Bad Request
- 错误消息提示无效的模型类型

#### 验证点

- [ ] 返回 400 错误
- [ ] 错误消息列出有效类型
- [ ] 数据库约束生效

#### 通过标准

模型类型验证正常。

---

## 查询功能测试

### 用例 CFG-008: 按类型查询模型

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证按模型类型查询功能。

#### 测试步骤

```bash
# 查询所有 NLP 模型
curl "http://localhost:8088/api/llm/models?type=nlp" | jq

# 查询所有 Embedding 模型
curl "http://localhost:8088/api/llm/models?type=embedding" | jq
```

#### 预期结果

- NLP: 返回所有 NLP 类型的模型
- Embedding: 返回所有 Embedding 类型的模型

#### 验证点

- [ ] 类型筛选正确
- [ ] 包含提供商信息
- [ ] 仅返回启用的模型
- [ ] 数据完整

#### 通过标准

按类型查询功能正常。

---

### 用例 CFG-009: 查询提供商的所有模型

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证查询指定提供商的所有模型。

#### 测试步骤

```bash
# 查询 DeepSeek 的所有模型
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
      "isDefault": true
    },
    {
      "id": 2,
      "modelKey": "deepseek-coder",
      "modelType": "nlp",
      "isDefault": false
    }
  ]
}
```

#### 验证点

- [ ] 返回提供商信息
- [ ] 返回所有关联模型
- [ ] 模型按顺序排列
- [ ] 包含 isDefault 标记

#### 通过标准

提供商模型查询正常。

---

### 用例 CFG-010: 获取默认模型

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证获取指定类型的默认模型。

#### 测试步骤

```bash
# 获取默认 NLP 模型
curl "http://localhost:8088/api/llm/models/default?type=nlp" | jq

# 获取默认 Embedding 模型
curl "http://localhost:8088/api/llm/models/default?type=embedding" | jq
```

#### 预期结果

- NLP: 返回 deepseek-chat (isDefault=true)
- Embedding: 返回 text-embedding-ada-002 (isDefault=true)

#### 验证点

- [ ] 返回正确的默认模型
- [ ] 包含完整配置信息
- [ ] isDefault = true
- [ ] 仅返回启用的模型

#### 通过标准

默认模型查询正常。

---

## 默认模型管理测试

### 用例 CFG-011: 设置默认模型

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证设置新的默认模型时，自动取消旧的默认标记。

#### 测试步骤

```bash
# 1. 查看当前默认 NLP 模型
curl "http://localhost:8088/api/llm/models/default?type=nlp" | jq '.model.id'
# 假设返回 1

# 2. 设置新的默认模型
curl -X PUT http://localhost:8088/api/llm/providers/1/models/2 \
  -H "Content-Type: application/json" \
  -d '{"isDefault": true}'

# 3. 验证新默认模型
curl "http://localhost:8088/api/llm/models/default?type=nlp" | jq '.model.id'
# 应返回 2

# 4. 验证旧默认已取消
curl http://localhost:8088/api/llm/providers/1/models/1 | jq '.model.isDefault'
# 应返回 false
```

#### 预期结果

- 新模型设为默认
- 旧默认自动取消
- 每种类型只有一个默认

#### 验证点

- [ ] 新默认设置成功
- [ ] 旧默认自动取消
- [ ] 查询返回新默认
- [ ] 同类型只有一个默认

#### 通过标准

默认模型管理逻辑正确。

---

### 用例 CFG-012: 跨类型默认模型独立

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证不同类型的默认模型互不影响。

#### 测试步骤

```bash
# 设置 NLP 默认
curl -X PUT http://localhost:8088/api/llm/providers/1/models/1 \
  -d '{"isDefault": true}'

# 设置 Embedding 默认
curl -X POST http://localhost:8088/api/llm/providers/2/models \
  -d '{
    "modelKey": "test-embed",
    "modelType": "embedding",
    "isDefault": true
  }'

# 验证两个默认都存在
curl "http://localhost:8088/api/llm/models/default?type=nlp" | jq '.model.modelKey'
curl "http://localhost:8088/api/llm/models/default?type=embedding" | jq '.model.modelKey'
```

#### 预期结果

- NLP 默认: deepseek-chat
- Embedding 默认: test-embed
- 互不影响

#### 验证点

- [ ] NLP 默认正确
- [ ] Embedding 默认正确
- [ ] 设置一个不影响另一个
- [ ] 可同时查询

#### 通过标准

不同类型的默认模型独立管理。

---

## 配置更新测试

### 用例 CFG-013: 更新提供商基础配置

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证更新提供商的 base_config。

#### 测试步骤

```bash
# 更新 DeepSeek 的 API Key
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -H "Content-Type: application/json" \
  -d '{
    "baseConfig": {
      "apiKey": "sk-new-api-key"
    }
  }'

# 查看更新后的配置（敏感信息应被隐藏）
curl http://localhost:8088/api/llm/providers/1 | jq
```

#### 预期结果

- base_config 更新成功
- 其他字段不变
- API Key 部分脱敏

#### 验证点

- [ ] base_config 更新成功
- [ ] 配置合并正确
- [ ] updated_at 更新
- [ ] 敏感信息保护

#### 通过标准

提供商配置更新正常。

---

### 用例 CFG-014: 更新模型配置

**优先级**: P0  
**类型**: 功能测试

#### 测试目标

验证更新模型的 model_config。

#### 测试步骤

```bash
# 更新模型配置
curl -X PUT http://localhost:8088/api/llm/providers/1/models/1 \
  -H "Content-Type: application/json" \
  -d '{
    "modelConfig": {
      "temperature": 0.8,
      "maxTokens": 8192
    }
  }'

# 查看更新后的配置
curl http://localhost:8088/api/llm/providers/1/models/1 | jq '.model.modelConfig'
```

#### 预期结果

- model_config 更新成功
- 配置合并正确
- 其他字段不变

#### 验证点

- [ ] model_config 更新
- [ ] 配置合并（不是替换）
- [ ] updated_at 更新
- [ ] 其他字段不变

#### 通过标准

模型配置更新正常。

---

## 数据验证测试

### 用例 CFG-015: 提供商必需字段验证

**优先级**: P0  
**类型**: 异常测试

#### 测试目标

验证提供商必需字段的验证。

#### 测试步骤

```bash
# 缺少 provider
curl -X POST http://localhost:8088/api/llm/providers \
  -d '{"name": "Test"}'

# 缺少 name
curl -X POST http://localhost:8088/api/llm/providers \
  -d '{"provider": "test"}'

# 缺少 baseConfig
curl -X POST http://localhost:8088/api/llm/providers \
  -d '{"provider": "test", "name": "Test"}'

# 缺少 baseURL
curl -X POST http://localhost:8088/api/llm/providers \
  -d '{"provider": "test", "name": "Test", "baseConfig": {}}'
```

#### 预期结果

- 所有请求都返回 400
- 错误消息明确指出缺失字段

#### 验证点

- [ ] 所有请求返回 400
- [ ] 错误消息明确
- [ ] 字段验证生效

#### 通过标准

必需字段验证正常。

---

## 📊 测试结果汇总

### 测试用例统计

| 类别 | 用例数 | 描述 |
|------|--------|------|
| 数据库初始化 | 2 | 表结构、外键约束 |
| 提供商管理 | 3 | 创建、唯一性、验证 |
| 模型管理 | 3 | 创建、唯一性、类型验证 |
| 查询功能 | 3 | 类型查询、提供商查询、默认模型 |
| 默认模型管理 | 2 | 设置、独立性 |
| 配置更新 | 2 | 提供商、模型更新 |
| **总计** | **15** | |

### 测试记录模板

```markdown
## LLMConfigService 测试执行记录（新架构）

- **测试日期**: YYYY-MM-DD
- **测试人员**: [姓名]
- **ApexBridge 版本**: v1.0.1 (v2 架构)
- **数据库**: SQLite (两级结构)

| 用例编号 | 用例名称 | 结果 | 备注 |
|----------|----------|------|------|
| CFG-001 | 表结构初始化 | ✅ PASS | 两级表 |
| CFG-002 | 级联删除 | ✅ PASS | - |
| CFG-003 | 创建提供商 | ✅ PASS | - |
| ... | ... | ... | ... |

**总通过率**: XX%
```

---

## 🔗 相关文档

- [测试总览指南](../MANUAL_TESTING_GUIDE.md)
- [LLMManager 测试用例](./LLM_MANAGER_TEST_CASES.md)
- [提供商和模型 API 测试](./PROVIDER_MODEL_API_TEST_CASES.md)
- [数据库架构设计](../../llm-v2/DATABASE_SCHEMA_V2.md)

---

**文档维护**: 如发现测试用例有问题或需要补充，请提交 Issue 或 PR。

*最后更新: 2025-11-18*
