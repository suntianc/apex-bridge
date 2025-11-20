# LLM 配置数据库架构 v2.0

> **版本**: v2.0  
> **设计日期**: 2025-11-18  
> **设计目标**: 支持多模型类型的两级配置结构

## 📊 架构设计

### 设计理念

1. **两级结构**: 提供商 + 模型分离
2. **配置复用**: 提供商基础配置可被多个模型共享
3. **类型支持**: 支持 NLP、Embedding、Rerank 等多种模型类型
4. **灵活扩展**: 易于添加新的模型类型和提供商

---

## 🗄️ 表结构设计

### 表 1: `llm_providers` - 提供商表

**用途**: 存储 LLM 提供商的基础配置

```sql
CREATE TABLE llm_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL UNIQUE,        -- 提供商标识 (openai, deepseek, zhipu)
  name TEXT NOT NULL,                   -- 显示名称 (OpenAI, DeepSeek AI)
  description TEXT,                     -- 提供商描述
  base_config TEXT NOT NULL,            -- 基础配置 JSON
  enabled INTEGER DEFAULT 1,            -- 是否启用 (1=启用, 0=禁用)
  created_at INTEGER NOT NULL,          -- 创建时间戳（毫秒）
  updated_at INTEGER NOT NULL,          -- 更新时间戳（毫秒）
  
  CHECK(enabled IN (0, 1))
);

-- 索引
CREATE INDEX idx_provider ON llm_providers(provider);
CREATE INDEX idx_enabled ON llm_providers(enabled);
```

**base_config JSON 结构**:
```json
{
  "apiKey": "sk-xxx",                    // API 密钥（可选，Ollama 不需要）
  "baseURL": "https://api.openai.com/v1", // 基础 URL
  "timeout": 60000,                      // 超时时间（毫秒）
  "maxRetries": 3,                       // 最大重试次数
  "customHeaders": {                     // 自定义请求头（可选）
    "X-Custom-Header": "value"
  }
}
```

---

### 表 2: `llm_models` - 模型表

**用途**: 存储具体模型的详细配置

```sql
CREATE TABLE llm_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL,         -- 关联提供商 ID
  model_key TEXT NOT NULL,              -- 模型标识 (gpt-4, deepseek-chat)
  model_name TEXT NOT NULL,             -- 显示名称 (GPT-4, DeepSeek Chat)
  model_type TEXT NOT NULL,             -- 模型类型 (nlp, embedding, rerank, image, audio)
  model_config TEXT NOT NULL,           -- 模型配置 JSON
  api_endpoint_suffix TEXT,             -- API 端点后缀 (如 /embeddings, /rerank)
  enabled INTEGER DEFAULT 1,            -- 是否启用
  is_default INTEGER DEFAULT 0,         -- 是否为该类型的默认模型
  display_order INTEGER DEFAULT 0,      -- 显示排序
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  
  FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE,
  UNIQUE(provider_id, model_key),
  CHECK(enabled IN (0, 1)),
  CHECK(is_default IN (0, 1)),
  CHECK(model_type IN ('nlp', 'embedding', 'rerank', 'image', 'audio', 'other'))
);

-- 索引
CREATE INDEX idx_provider_id ON llm_models(provider_id);
CREATE INDEX idx_model_type ON llm_models(model_type);
CREATE INDEX idx_enabled ON llm_models(enabled);
CREATE INDEX idx_default ON llm_models(is_default);
CREATE INDEX idx_model_key ON llm_models(model_key);
```

**model_config JSON 结构**:
```json
{
  "contextWindow": 128000,               // 上下文窗口（可选）
  "maxTokens": 4096,                     // 最大生成 tokens（可选）
  "temperature": 0.7,                    // 温度参数（可选）
  "dimensions": 1536,                    // 向量维度（Embedding 模型）
  "topK": 10,                           // Top-K（Rerank 模型）
  "customParams": {                     // 自定义参数
    "key": "value"
  }
}
```

---

## 📋 字段说明

### llm_providers 表

| 字段 | 类型 | 必需 | 说明 | 示例 |
|------|------|------|------|------|
| `id` | INTEGER | 是 | 主键，自增 | 1 |
| `provider` | TEXT | 是 | 提供商标识，唯一 | "openai" |
| `name` | TEXT | 是 | 显示名称 | "OpenAI" |
| `description` | TEXT | 否 | 提供商描述 | "OpenAI GPT 系列模型" |
| `base_config` | TEXT | 是 | 基础配置 JSON | `{"apiKey":"sk-xxx",...}` |
| `enabled` | INTEGER | 是 | 是否启用 | 1 |
| `created_at` | INTEGER | 是 | 创建时间戳 | 1700000000000 |
| `updated_at` | INTEGER | 是 | 更新时间戳 | 1700000000000 |

### llm_models 表

| 字段 | 类型 | 必需 | 说明 | 示例 |
|------|------|------|------|------|
| `id` | INTEGER | 是 | 主键，自增 | 1 |
| `provider_id` | INTEGER | 是 | 关联提供商 | 1 |
| `model_key` | TEXT | 是 | 模型标识 | "gpt-4" |
| `model_name` | TEXT | 是 | 显示名称 | "GPT-4" |
| `model_type` | TEXT | 是 | 模型类型 | "nlp" |
| `model_config` | TEXT | 是 | 模型配置 JSON | `{"contextWindow":128000}` |
| `api_endpoint_suffix` | TEXT | 否 | API 端点后缀 | "/chat/completions" |
| `enabled` | INTEGER | 是 | 是否启用 | 1 |
| `is_default` | INTEGER | 是 | 是否默认 | 0 |
| `display_order` | INTEGER | 是 | 显示排序 | 0 |
| `created_at` | INTEGER | 是 | 创建时间戳 | 1700000000000 |
| `updated_at` | INTEGER | 是 | 更新时间戳 | 1700000000000 |

---

## 🔗 表关系

```
llm_providers (1)  ----<  (N) llm_models
    ↑                         ↑
    |                         |
  provider_id            model_type
    |                         |
提供商基础信息            具体模型配置
```

**关系说明**:
- 一个提供商可以有多个模型
- 删除提供商时，级联删除所有关联模型
- 同一提供商下的模型共享 `base_config`

---

## 📝 模型类型定义

### 支持的模型类型

| 类型 | 标识 | 用途 | API 端点示例 |
|------|------|------|-------------|
| **NLP** | `nlp` | 聊天/文本生成 | `/chat/completions` |
| **Embedding** | `embedding` | 文本向量化 | `/embeddings` |
| **Rerank** | `rerank` | 结果重排序 | `/rerank` |
| **Image** | `image` | 图像生成 | `/images/generations` |
| **Audio** | `audio` | 语音处理 | `/audio/transcriptions` |
| **Other** | `other` | 其他类型 | 自定义 |

---

## 🌐 API 端点映射配置

### 各提供商的端点后缀

```typescript
// 端点映射表
const ENDPOINT_MAPPINGS = {
  openai: {
    nlp: '/chat/completions',
    embedding: '/embeddings',
    rerank: '/rerank',
    image: '/images/generations',
    audio: '/audio/transcriptions'
  },
  deepseek: {
    nlp: '/chat/completions',
    embedding: '/embeddings'
  },
  zhipu: {
    nlp: '/chat/completions',
    embedding: '/embeddings'
  },
  ollama: {
    nlp: '/api/chat',
    embedding: '/api/embeddings'
  },
  claude: {
    nlp: '/messages',
    // Claude 目前不支持其他类型
  }
};
```

**使用示例**:
```
提供商: OpenAI
Base URL: https://api.openai.com/v1
模型: text-embedding-ada-002 (embedding)
完整 URL: https://api.openai.com/v1/embeddings
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^
          从 base_config.baseURL      从端点映射
```

---

## 📊 数据示例

### 示例 1: OpenAI 提供商配置

**提供商记录**:
```json
{
  "id": 1,
  "provider": "openai",
  "name": "OpenAI",
  "description": "OpenAI GPT 系列模型和 Embeddings",
  "base_config": {
    "apiKey": "sk-xxx",
    "baseURL": "https://api.openai.com/v1",
    "timeout": 60000,
    "maxRetries": 3
  },
  "enabled": 1
}
```

**模型记录**:
```json
[
  {
    "id": 1,
    "provider_id": 1,
    "model_key": "gpt-4",
    "model_name": "GPT-4",
    "model_type": "nlp",
    "model_config": {
      "contextWindow": 128000,
      "maxTokens": 4096
    },
    "api_endpoint_suffix": "/chat/completions",
    "enabled": 1,
    "is_default": 1
  },
  {
    "id": 2,
    "provider_id": 1,
    "model_key": "text-embedding-ada-002",
    "model_name": "Ada Embeddings v2",
    "model_type": "embedding",
    "model_config": {
      "dimensions": 1536
    },
    "api_endpoint_suffix": "/embeddings",
    "enabled": 1,
    "is_default": 1
  }
]
```

---

## 🔄 迁移策略

### 从 v1 到 v2 的迁移

**v1 结构** (当前):
```
llm_providers 表:
  id | provider | name | config_json | enabled
  1  | deepseek | DeepSeek AI | {...} | 1
  2  | openai   | OpenAI GPT  | {...} | 0
```

**迁移到 v2**:
```
llm_providers 表:
  id | provider | name | base_config | enabled
  1  | deepseek | DeepSeek AI | {...} | 1
  2  | openai   | OpenAI | {...} | 0

llm_models 表:
  id | provider_id | model_key | model_type | ...
  1  | 1          | deepseek-chat | nlp | ...
  2  | 2          | gpt-3.5-turbo | nlp | ...
```

**迁移逻辑**:
1. 保留原提供商记录
2. `config_json` 重命名为 `base_config`
3. 从 `config_json.defaultModel` 创建模型记录
4. 默认类型为 `nlp`
5. 自动设置为默认模型

---

## 🎯 查询示例

### 查询 1: 获取所有 NLP 模型

```sql
SELECT 
  m.id,
  m.model_key,
  m.model_name,
  p.provider,
  p.name as provider_name
FROM llm_models m
JOIN llm_providers p ON m.provider_id = p.id
WHERE m.model_type = 'nlp'
  AND m.enabled = 1
  AND p.enabled = 1;
```

### 查询 2: 获取默认 Embedding 模型

```sql
SELECT 
  m.*,
  p.base_config,
  p.provider
FROM llm_models m
JOIN llm_providers p ON m.provider_id = p.id
WHERE m.model_type = 'embedding'
  AND m.is_default = 1
  AND m.enabled = 1
  AND p.enabled = 1
LIMIT 1;
```

### 查询 3: 获取某提供商的所有模型

```sql
SELECT *
FROM llm_models
WHERE provider_id = ?
ORDER BY model_type, display_order;
```

---

## 🔒 约束和规则

### 数据完整性约束

1. **唯一性约束**:
   - `llm_providers.provider` 必须唯一
   - `(provider_id, model_key)` 组合必须唯一

2. **外键约束**:
   - `llm_models.provider_id` 必须存在于 `llm_providers.id`
   - 级联删除：删除提供商时自动删除所有模型

3. **类型约束**:
   - `model_type` 必须是枚举值之一
   - `enabled` 和 `is_default` 必须是 0 或 1

### 业务规则

1. **默认模型规则**:
   - 每种模型类型只能有一个默认模型
   - 设置新默认模型时，自动取消旧的默认状态

2. **启用规则**:
   - 禁用提供商不影响其模型记录
   - 查询时需要同时检查提供商和模型的启用状态

3. **删除规则**:
   - 删除提供商时级联删除所有模型
   - 删除最后一个模型时不自动删除提供商

---

## 📚 SQL 脚本

### 完整创建脚本

```sql
-- ==================== 创建表 ====================

-- 1. 提供商表
CREATE TABLE IF NOT EXISTS llm_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  base_config TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(enabled IN (0, 1))
);

-- 2. 模型表
CREATE TABLE IF NOT EXISTS llm_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL,
  model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_type TEXT NOT NULL,
  model_config TEXT NOT NULL,
  api_endpoint_suffix TEXT,
  enabled INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE,
  UNIQUE(provider_id, model_key),
  CHECK(enabled IN (0, 1)),
  CHECK(is_default IN (0, 1)),
  CHECK(model_type IN ('nlp', 'embedding', 'rerank', 'image', 'audio', 'other'))
);

-- ==================== 创建索引 ====================

-- 提供商索引
CREATE INDEX IF NOT EXISTS idx_provider ON llm_providers(provider);
CREATE INDEX IF NOT EXISTS idx_provider_enabled ON llm_providers(enabled);

-- 模型索引
CREATE INDEX IF NOT EXISTS idx_model_provider ON llm_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_model_type ON llm_models(model_type);
CREATE INDEX IF NOT EXISTS idx_model_enabled ON llm_models(enabled);
CREATE INDEX IF NOT EXISTS idx_model_default ON llm_models(is_default);
CREATE INDEX IF NOT EXISTS idx_model_key ON llm_models(model_key);
CREATE INDEX IF NOT EXISTS idx_model_type_default ON llm_models(model_type, is_default);

-- ==================== 创建视图（可选）====================

-- 完整模型视图（包含提供商信息）
CREATE VIEW IF NOT EXISTS v_models_full AS
SELECT 
  m.id,
  m.provider_id,
  m.model_key,
  m.model_name,
  m.model_type,
  m.model_config,
  m.api_endpoint_suffix,
  m.enabled,
  m.is_default,
  m.display_order,
  p.provider,
  p.name as provider_name,
  p.base_config,
  p.enabled as provider_enabled,
  m.created_at,
  m.updated_at
FROM llm_models m
JOIN llm_providers p ON m.provider_id = p.id;

-- 默认模型视图
CREATE VIEW IF NOT EXISTS v_default_models AS
SELECT *
FROM v_models_full
WHERE is_default = 1
  AND enabled = 1
  AND provider_enabled = 1;
```

---

## 🔄 迁移脚本逻辑

### 迁移步骤

```javascript
// 伪代码
function migrateToV2(db) {
  // 1. 备份原表
  db.exec('ALTER TABLE llm_providers RENAME TO llm_providers_v1_backup');
  
  // 2. 创建新表
  createV2Tables(db);
  
  // 3. 迁移提供商数据
  const oldProviders = db.prepare('SELECT * FROM llm_providers_v1_backup').all();
  
  oldProviders.forEach(old => {
    const oldConfig = JSON.parse(old.config_json);
    
    // 3.1 提取基础配置
    const baseConfig = {
      apiKey: oldConfig.apiKey,
      baseURL: oldConfig.baseURL,
      timeout: oldConfig.timeout || 60000,
      maxRetries: oldConfig.maxRetries || 3
    };
    
    // 3.2 插入提供商
    const result = db.prepare(`
      INSERT INTO llm_providers (provider, name, base_config, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(old.provider, old.name, JSON.stringify(baseConfig), old.enabled, old.created_at, old.updated_at);
    
    const providerId = result.lastInsertRowid;
    
    // 3.3 创建默认 NLP 模型
    const modelConfig = {
      contextWindow: oldConfig.contextWindow,
      maxTokens: oldConfig.maxTokens
    };
    
    db.prepare(`
      INSERT INTO llm_models (
        provider_id, model_key, model_name, model_type, 
        model_config, api_endpoint_suffix, enabled, is_default,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      providerId,
      oldConfig.defaultModel,
      oldConfig.defaultModel,
      'nlp',
      JSON.stringify(modelConfig),
      '/chat/completions',
      1,
      1,
      Date.now(),
      Date.now()
    );
  });
  
  // 4. 验证迁移
  const newProvidersCount = db.prepare('SELECT COUNT(*) as count FROM llm_providers').get().count;
  const newModelsCount = db.prepare('SELECT COUNT(*) as count FROM llm_models').get().count;
  
  console.log(`✅ 迁移完成: ${newProvidersCount} 个提供商, ${newModelsCount} 个模型`);
}
```

---

## 🧪 测试数据

### 测试场景 1: 多模型提供商

```sql
-- OpenAI 提供商
INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
VALUES (
  'openai',
  'OpenAI',
  'OpenAI GPT 系列和 Embeddings',
  '{"apiKey":"sk-xxx","baseURL":"https://api.openai.com/v1","timeout":60000}',
  1,
  strftime('%s','now') * 1000,
  strftime('%s','now') * 1000
);

-- OpenAI 的 NLP 模型
INSERT INTO llm_models (provider_id, model_key, model_name, model_type, model_config, api_endpoint_suffix, enabled, is_default, created_at, updated_at)
VALUES 
(1, 'gpt-4', 'GPT-4', 'nlp', '{"contextWindow":128000,"maxTokens":4096}', '/chat/completions', 1, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
(1, 'gpt-3.5-turbo', 'GPT-3.5 Turbo', 'nlp', '{"contextWindow":16384,"maxTokens":4096}', '/chat/completions', 1, 0, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- OpenAI 的 Embedding 模型
INSERT INTO llm_models (provider_id, model_key, model_name, model_type, model_config, api_endpoint_suffix, enabled, is_default, created_at, updated_at)
VALUES 
(1, 'text-embedding-ada-002', 'Ada Embeddings v2', 'embedding', '{"dimensions":1536}', '/embeddings', 1, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
(1, 'text-embedding-3-small', 'Embeddings v3 Small', 'embedding', '{"dimensions":1536}', '/embeddings', 1, 0, strftime('%s','now') * 1000, strftime('%s','now') * 1000);
```

---

## 📈 性能优化

### 索引策略

1. **频繁查询优化**:
   - `model_type` 索引: 按类型查询
   - `is_default` 索引: 查询默认模型
   - `(model_type, is_default)` 复合索引: 查询默认模型

2. **关联查询优化**:
   - `provider_id` 索引: JOIN 查询优化

### 缓存策略

1. **ModelRegistry 内存缓存**:
   - 缓存所有启用的模型
   - 按类型索引
   - 定期刷新

2. **查询结果缓存**:
   - 缓存常用查询结果
   - TTL: 60 秒

---

## 🔒 安全考虑

### 敏感信息保护

1. **API Key 保护**:
   - 查询时不返回完整 API Key
   - 仅显示前 7 位和后 4 位
   - 更新时支持部分更新

2. **配置访问控制**:
   - 读取配置需要认证（如果启用）
   - 写入配置需要管理员权限（未来）

---

## 📚 相关文档

- [提案文档](./proposal.md)
- [任务清单](./tasks.md)
- [API 设计文档](./API_DESIGN_V2.md)（待创建）
- [迁移指南](./MIGRATION_GUIDE.md)（待创建）

---

**设计版本**: v2.0  
**最后更新**: 2025-11-18

