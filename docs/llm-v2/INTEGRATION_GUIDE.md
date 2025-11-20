# LLM 配置架构 v2.0 - 集成指南

> **目标**: 将 v2 架构集成到现有系统  
> **预计时间**: 2-3 小时  
> **最后更新**: 2025-11-18

## 📋 集成概述

LLM 配置架构 v2.0 已完成核心实现，现在需要集成到现有系统中。

### 已完成 ✅

- ✅ 数据库表结构设计
- ✅ TypeScript 类型定义
- ✅ LLMConfigServiceV2 实现
- ✅ ModelRegistry 实现
- ✅ 端点映射配置
- ✅ API 控制器实现
- ✅ 迁移工具

### 待集成 🚧

- 🚧 注册 API 路由
- 🚧 更新 LLMManager
- 🚧 更新 RAG 服务
- 🚧 增强 BaseAdapter
- 🚧 更新文档
- 🚧 编写测试

---

## 🚀 快速集成步骤

### 步骤 1: 注册新的 API 路由

**文件**: `src/server.ts`

在 `setupRoutes()` 方法中添加：

```typescript
// 在文件顶部添加导入
import * as ProviderControllerV2 from './api/controllers/ProviderControllerV2';
import * as ModelControllerV2 from './api/controllers/ModelControllerV2';

// 在 setupRoutes 方法中注册路由（在现有 LLM API 之后）
private async setupRoutes(): Promise<void> {
  // ... 现有代码 ...
  
  // ==================== LLM 配置管理 API v2 ====================
  // 提供商管理
  this.app.get('/api/v2/llm/providers', ProviderControllerV2.listProviders);
  this.app.get('/api/v2/llm/providers/:id', ProviderControllerV2.getProvider);
  this.app.post('/api/v2/llm/providers', ProviderControllerV2.createProvider);
  this.app.put('/api/v2/llm/providers/:id', ProviderControllerV2.updateProvider);
  this.app.delete('/api/v2/llm/providers/:id', ProviderControllerV2.deleteProvider);

  // 模型管理
  this.app.get('/api/v2/llm/providers/:providerId/models', ModelControllerV2.listProviderModels);
  this.app.get('/api/v2/llm/providers/:providerId/models/:modelId', ModelControllerV2.getModel);
  this.app.post('/api/v2/llm/providers/:providerId/models', ModelControllerV2.createModel);
  this.app.put('/api/v2/llm/providers/:providerId/models/:modelId', ModelControllerV2.updateModel);
  this.app.delete('/api/v2/llm/providers/:providerId/models/:modelId', ModelControllerV2.deleteModel);

  // 模型查询
  this.app.get('/api/v2/llm/models', ModelControllerV2.queryModels);
  this.app.get('/api/v2/llm/models/default', ModelControllerV2.getDefaultModel);
  
  logger.info('✅ LLM v2 API routes configured');
  
  // ... 其他代码 ...
}
```

---

### 步骤 2: 执行数据迁移

```bash
# 1. 预览迁移
node scripts/migrate-llm-config-to-v2.js --dry-run

# 2. 执行迁移
node scripts/migrate-llm-config-to-v2.js

# 3. 验证迁移
node scripts/view-llm-providers.js
```

---

### 步骤 3: 重启服务并测试

```bash
# 1. 重新编译
npm run build

# 2. 启动服务
npm run dev

# 3. 测试 v2 API
curl http://localhost:8088/api/v2/llm/providers
```

---

## 📝 使用示例

### 示例 1: 配置 OpenAI（NLP + Embedding）

```bash
# 1. 添加 OpenAI 提供商
curl -X POST http://localhost:8088/api/v2/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "name": "OpenAI",
    "description": "OpenAI GPT 系列和 Embeddings",
    "baseConfig": {
      "apiKey": "sk-your-openai-key",
      "baseURL": "https://api.openai.com/v1",
      "timeout": 60000,
      "maxRetries": 3
    },
    "enabled": true
  }'

# 假设返回的提供商 ID 是 1

# 2. 添加 NLP 模型
curl -X POST http://localhost:8088/api/v2/llm/providers/1/models \
  -H "Content-Type: application/json" \
  -d '{
    "modelKey": "gpt-4",
    "modelName": "GPT-4",
    "modelType": "nlp",
    "modelConfig": {
      "contextWindow": 128000,
      "maxTokens": 4096
    },
    "apiEndpointSuffix": "/chat/completions",
    "enabled": true,
    "isDefault": true
  }'

# 3. 添加 Embedding 模型
curl -X POST http://localhost:8088/api/v2/llm/providers/1/models \
  -H "Content-Type: application/json" \
  -d '{
    "modelKey": "text-embedding-ada-002",
    "modelName": "Ada Embeddings v2",
    "modelType": "embedding",
    "modelConfig": {
      "dimensions": 1536
    },
    "apiEndpointSuffix": "/embeddings",
    "enabled": true,
    "isDefault": true
  }'

# 4. 查看配置
curl http://localhost:8088/api/v2/llm/providers/1/models
```

---

### 示例 2: 配置 DeepSeek（多模型）

```bash
# 1. 添加 DeepSeek 提供商
curl -X POST http://localhost:8088/api/v2/llm/providers \
  -d '{
    "provider": "deepseek",
    "name": "DeepSeek",
    "baseConfig": {
      "apiKey": "sk-your-deepseek-key",
      "baseURL": "https://api.deepseek.com",
      "timeout": 60000
    }
  }'

# 2. 添加聊天模型
curl -X POST http://localhost:8088/api/v2/llm/providers/2/models \
  -d '{
    "modelKey": "deepseek-chat",
    "modelName": "DeepSeek Chat",
    "modelType": "nlp",
    "apiEndpointSuffix": "/chat/completions",
    "isDefault": true
  }'

# 3. 添加代码模型
curl -X POST http://localhost:8088/api/v2/llm/providers/2/models \
  -d '{
    "modelKey": "deepseek-coder",
    "modelName": "DeepSeek Coder",
    "modelType": "nlp",
    "apiEndpointSuffix": "/chat/completions"
  }'
```

---

### 示例 3: 查询和使用

```bash
# 获取所有 Embedding 模型
curl http://localhost:8088/api/v2/llm/models?type=embedding

# 获取默认 NLP 模型
curl http://localhost:8088/api/v2/llm/models/default?type=nlp

# 获取默认 Embedding 模型
curl http://localhost:8088/api/v2/llm/models/default?type=embedding
```

---

## 🔧 可选集成（高级功能）

### 1. LLMManager 集成 ModelRegistry

```typescript
// src/core/LLMManager.ts

import { ModelRegistry } from '../services/ModelRegistry';
import { LLMModelType } from '../types/llm-v2';

class LLMManager {
  private modelRegistry: ModelRegistry;
  
  constructor() {
    this.modelRegistry = ModelRegistry.getInstance();
  }
  
  async chat(messages: Message[], options?: ChatOptions) {
    // 获取 NLP 模型
    let model;
    if (options?.model) {
      // 按 modelKey 查找
      model = this.modelRegistry.findModel(options.provider, options.model);
    } else {
      // 使用默认 NLP 模型
      model = this.modelRegistry.getDefaultModel(LLMModelType.NLP);
    }
    
    if (!model) {
      throw new Error('No NLP model available');
    }
    
    // 构建完整 API URL
    const apiUrl = buildApiUrl(
      model.providerBaseConfig.baseURL,
      model.apiEndpointSuffix || '/chat/completions'
    );
    
    // 调用 API...
  }
}
```

---

### 2. RAG 服务集成 Embedding 模型

```typescript
// src/core/ProtocolEngine.ts 或 RAG 相关代码

import { ModelRegistry } from '../services/ModelRegistry';
import { LLMModelType } from '../types/llm-v2';
import { buildApiUrl } from '../config/endpoint-mappings';

async initialize() {
  if (this.config.rag?.enabled) {
    const modelRegistry = ModelRegistry.getInstance();
    
    // 获取默认 Embedding 模型
    const embeddingModel = modelRegistry.getDefaultModel(LLMModelType.EMBEDDING);
    
    if (embeddingModel) {
      // 使用配置的 Embedding 模型
      const vectorizerConfig = {
        apiUrl: buildApiUrl(
          embeddingModel.providerBaseConfig.baseURL,
          embeddingModel.apiEndpointSuffix
        ),
        apiKey: embeddingModel.providerBaseConfig.apiKey,
        model: embeddingModel.modelKey,
        dimensions: embeddingModel.modelConfig.dimensions
      };
      
      await this.ragService.initialize({
        workDir: this.config.rag.workDir,
        vectorizer: vectorizerConfig
      });
    } else {
      // 降级到配置文件中的配置
      // ...
    }
  }
}
```

---

## 📚 API 使用文档（快速参考）

### 提供商 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v2/llm/providers` | 列出所有提供商 |
| GET | `/api/v2/llm/providers/:id` | 获取提供商详情 |
| POST | `/api/v2/llm/providers` | 创建提供商 |
| PUT | `/api/v2/llm/providers/:id` | 更新提供商 |
| DELETE | `/api/v2/llm/providers/:id` | 删除提供商 |

### 模型 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v2/llm/providers/:providerId/models` | 列出提供商的模型 |
| GET | `/api/v2/llm/providers/:providerId/models/:modelId` | 获取模型详情 |
| POST | `/api/v2/llm/providers/:providerId/models` | 创建模型 |
| PUT | `/api/v2/llm/providers/:providerId/models/:modelId` | 更新模型 |
| DELETE | `/api/v2/llm/providers/:providerId/models/:modelId` | 删除模型 |
| GET | `/api/v2/llm/models?type=nlp` | 按类型查询模型 |
| GET | `/api/v2/llm/models/default?type=embedding` | 获取默认模型 |

---

## ✅ 验证清单

### 基础功能验证

- [ ] 提供商 CRUD API 正常
- [ ] 模型 CRUD API 正常
- [ ] 数据库级联删除正常
- [ ] 默认模型设置正常

### 集成功能验证

- [ ] 聊天功能使用 NLP 模型
- [ ] RAG 使用 Embedding 模型
- [ ] 模型类型自动选择正确端点

### 性能验证

- [ ] ModelRegistry 缓存工作正常
- [ ] API 响应时间 < 200ms
- [ ] 数据库查询优化有效

---

老大，架构 v2.0 的核心代码已全部完成！✅

**总计创建**:
- ✅ 20 个文件（源码 10 + 编译后 10）
- ✅ ~2,880 行新代码
- ✅ 12 个新 API 端点
- ✅ 支持 5 种模型类型

**下一步**你可以选择：

1. **立即集成**: 我继续完成路由注册和集成工作
2. **先测试迁移**: 先在开发环境测试迁移脚本
3. **查看端点配置**: 你补充更多提供商的端点映射

要我继续集成吗？🚀

