# LLM 配置架构 v2.0 升级说明

> **升级日期**: 2025-11-18  
> **状态**: ✅ 已完成并测试通过  
> **影响范围**: LLM 配置管理、API 接口、测试文档

---

## 🎯 升级概述

ApexBridge LLM 配置架构已从扁平化结构升级到**两级配置结构**，支持**多模型类型**。

### 主要变化

| 方面 | v1.0 | v2.0 | 改进 |
|------|------|------|------|
| **配置结构** | 扁平（单表） | 两级（提供商+模型） | ✅ 更清晰 |
| **模型类型** | 1 种（NLP） | 5 种 | ✅ 更灵活 |
| **API 端点** | 3 个 | 12 个 | ✅ 更完整 |
| **端点配置** | 固化 | 可配置 | ✅ 更适配 |
| **配置复用** | 否 | 是 | ✅ 更高效 |

---

## 📊 数据库结构变化

### v1.0 结构（旧）

```sql
llm_providers
  ├── id
  ├── provider
  ├── name
  ├── config_json (包含所有配置)
  └── enabled
```

### v2.0 结构（新）

```sql
llm_providers (提供商表)
  ├── id
  ├── provider
  ├── name
  ├── description
  ├── base_config (共享配置)
  └── enabled

llm_models (模型表)
  ├── id
  ├── provider_id (外键)
  ├── model_key
  ├── model_name
  ├── model_type (nlp/embedding/rerank/image/audio)
  ├── model_config
  ├── api_endpoint_suffix
  ├── enabled
  └── is_default
```

---

## 🚀 新功能

### 1. 多模型类型

```
支持的模型类型:
├── nlp (聊天/文本生成)
├── embedding (文本向量化)
├── rerank (结果重排序)
├── image (图像生成)
└── audio (语音处理)
```

### 2. 灵活的端点配置

```
提供商配置:
  base_config.baseURL: https://api.openai.com/v1

模型配置:
  NLP: api_endpoint_suffix = /chat/completions
  Embedding: api_endpoint_suffix = /embeddings

最终 URL:
  NLP: https://api.openai.com/v1/chat/completions
  Embedding: https://api.openai.com/v1/embeddings
```

### 3. 配置复用

```
OpenAI (提供商)
  base_config: {apiKey, baseURL, timeout}
  ├── GPT-4 (复用 base_config)
  ├── GPT-3.5 (复用 base_config)
  └── Ada Embeddings (复用 base_config)
```

---

## 📝 API 变化

### 保持兼容的 API

```bash
# 这些 API 保持不变
GET  /api/llm/providers          # 列出提供商（返回格式增强）
GET  /api/llm/providers/:id      # 获取提供商（返回格式增强）
PUT  /api/llm/providers/:id      # 更新提供商
```

### 新增的 API

```bash
# 提供商管理（新增）
POST   /api/llm/providers            # 创建提供商
DELETE /api/llm/providers/:id        # 删除提供商

# 模型管理（全新）
GET    /api/llm/providers/:providerId/models              # 列出模型
GET    /api/llm/providers/:providerId/models/:modelId    # 获取模型
POST   /api/llm/providers/:providerId/models             # 创建模型
PUT    /api/llm/providers/:providerId/models/:modelId    # 更新模型
DELETE /api/llm/providers/:providerId/models/:modelId    # 删除模型

# 模型查询（全新）
GET /api/llm/models?type=nlp              # 按类型查询
GET /api/llm/models/default?type=embedding # 获取默认模型
```

---

## 🔄 迁移指南

### 自动迁移

```bash
# 1. 备份数据库（自动）
# 2. 执行迁移
node scripts/migrate-llm-config-to-v2.js

# 3. 验证
node scripts/check-db-structure.js
```

### 迁移逻辑

```
v1 提供商记录 → v2 提供商 + 默认 NLP 模型

示例:
v1: deepseek (config_json 包含 defaultModel: "deepseek-chat")
↓
v2: 
  提供商: deepseek (base_config: {apiKey, baseURL})
  模型: deepseek-chat (model_type: nlp, is_default: true)
```

---

## 📚 更新的文档

### 测试文档（已更新）

1. ✅ [LLMManager 测试用例](./testing/cases/LLM_MANAGER_TEST_CASES.md) - 反映新架构
2. ✅ [LLMConfigService 测试用例](./testing/cases/LLM_CONFIG_SERVICE_TEST_CASES.md) - 两级结构测试
3. ✅ [Provider/Model API 测试](./testing/cases/PROVIDER_MODEL_API_TEST_CASES.md) - 新增
4. ✅ [快速验证清单](./testing/guides/QUICK_VALIDATION_CHECKLIST.md) - 增加 LLM 配置验证
5. ✅ [测试文档中心](./testing/README.md) - 更新统计和版本信息

### 配置文档（已更新）

1. ✅ [LLM 配置指南](./config/LLM_CONFIG_GUIDE.md) - 补充 v2.0 说明
2. ✅ [README_LLM_CONFIG.md](./README_LLM_CONFIG.md) - 新架构使用指南
3. ✅ [LLM_CONFIG_V2_COMPLETE.md](./docs/LLM_CONFIG_V2_COMPLETE.md) - 完成报告

### 技术文档（新增）

1. ✅ [DATABASE_SCHEMA_V2.md](./docs/llm-v2/DATABASE_SCHEMA_V2.md) - 数据库设计
2. ✅ [INTEGRATION_GUIDE.md](./docs/llm-v2/INTEGRATION_GUIDE.md) - 集成指南
3. ✅ [FINAL_SUMMARY.md](./docs/llm-v2/FINAL_SUMMARY.md) - 最终总结

---

## 🎯 使用变化

### 添加模型（之前）

```bash
# v1.0: 每个模型都是独立的提供商
POST /api/llm/providers
{
  "provider": "openai-gpt4",
  "config": {...}
}

POST /api/llm/providers
{
  "provider": "openai-embeddings",
  "config": {...}  # 重复配置
}
```

### 添加模型（现在）

```bash
# v2.0: 一次配置提供商，多次添加模型
POST /api/llm/providers
{
  "provider": "openai",
  "baseConfig": {...}  # 配置一次
}

POST /api/llm/providers/1/models
{
  "modelKey": "gpt-4",
  "modelType": "nlp"
}

POST /api/llm/providers/1/models
{
  "modelKey": "text-embedding-ada-002",
  "modelType": "embedding"
}
```

---

## ⚠️ 注意事项

1. **数据迁移**: 首次启动时会自动迁移（如果检测到 v1 结构）
2. **备份**: 迁移前会自动备份数据库
3. **向后兼容**: LLMManager 保持向后兼容，现有聊天功能不受影响
4. **API 格式**: 返回格式略有变化，增加了 modelCount 等字段

---

## 🧪 测试验证

### 快速验证

```bash
# 1. 检查数据库结构
node scripts/check-db-structure.js

# 2. 查看提供商配置
curl http://localhost:8088/api/llm/providers | jq

# 3. 查看模型配置
curl http://localhost:8088/api/llm/providers/1/models | jq

# 4. 测试聊天功能
curl -X POST http://localhost:8088/v1/chat/completions \
  -d '{"messages": [{"role": "user", "content": "你好"}]}'
```

---

## 📞 获取帮助

- 技术文档: [docs/llm-v2/](./docs/llm-v2/)
- 测试文档: [docs/testing/cases/](./docs/testing/cases/)
- 配置指南: [README_LLM_CONFIG.md](./README_LLM_CONFIG.md)
- GitHub Issues: https://github.com/suntianc/apex-bridge/issues

---

**升级状态**: ✅ 完成  
**系统状态**: ✅ 生产就绪

*最后更新: 2025-11-18*

