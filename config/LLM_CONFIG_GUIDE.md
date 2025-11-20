# LLM 厂商配置指南

> **存储方式**: SQLite 数据库 (`data/llm_providers.db`)  
> **管理服务**: LLMConfigService  
> **最后更新**: 2025-11-18

## 📋 配置概述

LLM 厂商配置**不存储在 JSON 配置文件中**，而是存储在 **SQLite 数据库**中，支持运行时动态管理。

### 配置存储位置

```
data/llm_providers.db (SQLite 数据库)
  └── llm_providers 表
      ├── id (主键)
      ├── provider (提供商标识，如 "deepseek")
      ├── name (显示名称，如 "DeepSeek AI")
      ├── config_json (JSON 配置)
      ├── enabled (是否启用，1=启用)
      ├── created_at (创建时间)
      └── updated_at (更新时间)
```

---

## 🚀 配置方式

### 方式 1: 使用 API 接口（推荐）⭐

通过 HTTP API 管理 LLM 提供商配置。

#### 1.1 列出所有提供商

```bash
curl http://localhost:8088/api/llm/providers
```

**响应示例**:
```json
{
  "success": true,
  "providers": [
    {
      "id": 1,
      "provider": "deepseek",
      "name": "DeepSeek AI",
      "enabled": true,
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ]
}
```

---

#### 1.2 添加新提供商

**OpenAI 配置示例**:

```bash
curl -X POST http://localhost:8088/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "name": "OpenAI GPT",
    "config": {
      "apiKey": "sk-your-openai-api-key",
      "baseURL": "https://api.openai.com/v1",
      "defaultModel": "gpt-3.5-turbo",
      "timeout": 60000,
      "maxRetries": 3
    },
    "enabled": true
  }'
```

**DeepSeek 配置示例**:

```bash
curl -X POST http://localhost:8088/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "deepseek",
    "name": "DeepSeek AI",
    "config": {
      "apiKey": "sk-your-deepseek-api-key",
      "baseURL": "https://api.deepseek.com",
      "defaultModel": "deepseek-chat",
      "timeout": 60000,
      "maxRetries": 3
    },
    "enabled": true
  }'
```

**智谱 AI 配置示例**:

```bash
curl -X POST http://localhost:8088/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "zhipu",
    "name": "智谱 AI",
    "config": {
      "apiKey": "your-zhipu-api-key",
      "baseURL": "https://open.bigmodel.cn/api/paas/v4",
      "defaultModel": "glm-4",
      "timeout": 60000,
      "maxRetries": 3
    },
    "enabled": true
  }'
```

**Ollama 本地模型配置示例**:

```bash
curl -X POST http://localhost:8088/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "ollama",
    "name": "Ollama 本地模型",
    "config": {
      "baseURL": "http://localhost:11434",
      "defaultModel": "llama2",
      "timeout": 120000
    },
    "enabled": true
  }'
```

---

#### 1.3 更新提供商配置

```bash
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "apiKey": "sk-new-api-key",
      "defaultModel": "gpt-4"
    }
  }'
```

---

#### 1.4 禁用/启用提供商

```bash
# 禁用
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# 启用
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

---

#### 1.5 删除提供商

```bash
curl -X DELETE http://localhost:8088/api/llm/providers/1
```

---

### 方式 2: 直接操作 SQLite 数据库

适用于脚本化配置或批量导入。

#### 2.1 使用 sqlite3 命令行

```bash
# 进入数据库
sqlite3 data/llm_providers.db

# 查看所有提供商
SELECT * FROM llm_providers;

# 插入新提供商（DeepSeek 示例）
INSERT INTO llm_providers (provider, name, config_json, enabled, created_at, updated_at)
VALUES (
  'deepseek',
  'DeepSeek AI',
  '{"apiKey":"sk-your-key","baseURL":"https://api.deepseek.com","defaultModel":"deepseek-chat","timeout":60000,"maxRetries":3}',
  1,
  strftime('%s','now') * 1000,
  strftime('%s','now') * 1000
);

# 更新提供商
UPDATE llm_providers 
SET config_json = '{"apiKey":"sk-new-key",...}',
    updated_at = strftime('%s','now') * 1000
WHERE provider = 'deepseek';

# 删除提供商
DELETE FROM llm_providers WHERE provider = 'deepseek';

# 退出
.quit
```

---

#### 2.2 使用 Node.js 脚本

创建初始化脚本：

```javascript
// scripts/init-llm-providers.js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('./data/llm_providers.db');

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS llm_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// 插入提供商配置
const providers = [
  {
    provider: 'deepseek',
    name: 'DeepSeek AI',
    config: {
      apiKey: 'sk-your-deepseek-api-key',
      baseURL: 'https://api.deepseek.com',
      defaultModel: 'deepseek-chat',
      timeout: 60000,
      maxRetries: 3
    },
    enabled: true
  },
  {
    provider: 'openai',
    name: 'OpenAI GPT',
    config: {
      apiKey: 'sk-your-openai-api-key',
      baseURL: 'https://api.openai.com/v1',
      defaultModel: 'gpt-3.5-turbo',
      timeout: 60000,
      maxRetries: 3
    },
    enabled: false
  }
];

const stmt = db.prepare(`
  INSERT OR REPLACE INTO llm_providers (provider, name, config_json, enabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const now = Date.now();

providers.forEach(p => {
  stmt.run(
    p.provider,
    p.name,
    JSON.stringify(p.config),
    p.enabled ? 1 : 0,
    now,
    now
  );
  console.log(`✅ 已添加: ${p.name} (${p.provider})`);
});

db.close();
console.log('\n✅ LLM 提供商配置初始化完成！');
```

**运行脚本**:
```bash
node scripts/init-llm-providers.js
```

---

### 方式 3: 通过配置文件导入（待实现）

未来可以支持从 JSON 文件批量导入配置。

---

## 🎯 支持的 LLM 提供商

### 1. OpenAI

```json
{
  "provider": "openai",
  "name": "OpenAI GPT",
  "config": {
    "apiKey": "sk-xxx",
    "baseURL": "https://api.openai.com/v1",
    "defaultModel": "gpt-3.5-turbo",
    "timeout": 60000,
    "maxRetries": 3
  }
}
```

**支持的模型**:
- `gpt-3.5-turbo` (推荐)
- `gpt-4`
- `gpt-4-turbo`
- `gpt-4o`

---

### 2. DeepSeek

```json
{
  "provider": "deepseek",
  "name": "DeepSeek AI",
  "config": {
    "apiKey": "sk-xxx",
    "baseURL": "https://api.deepseek.com",
    "defaultModel": "deepseek-chat",
    "timeout": 60000,
    "maxRetries": 3
  }
}
```

**支持的模型**:
- `deepseek-chat` (通用对话)
- `deepseek-coder` (代码生成)

---

### 3. 智谱 AI (GLM)

```json
{
  "provider": "zhipu",
  "name": "智谱 AI",
  "config": {
    "apiKey": "your-zhipu-key",
    "baseURL": "https://open.bigmodel.cn/api/paas/v4",
    "defaultModel": "glm-4",
    "timeout": 60000,
    "maxRetries": 3
  }
}
```

**支持的模型**:
- `glm-4` (最新版)
- `glm-3-turbo`

---

### 4. Ollama (本地模型)

```json
{
  "provider": "ollama",
  "name": "Ollama 本地模型",
  "config": {
    "baseURL": "http://localhost:11434",
    "defaultModel": "llama2",
    "timeout": 120000
  }
}
```

**说明**:
- 无需 `apiKey`
- 需要先安装 Ollama: https://ollama.ai
- 下载模型: `ollama pull llama2`

**支持的模型**:
- `llama2`
- `mistral`
- `codellama`
- `phi`

---

### 5. Claude (Anthropic)

```json
{
  "provider": "claude",
  "name": "Claude AI",
  "config": {
    "apiKey": "sk-ant-xxx",
    "baseURL": "https://api.anthropic.com",
    "defaultModel": "claude-3-opus-20240229",
    "timeout": 60000,
    "maxRetries": 3
  }
}
```

**支持的模型**:
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`

---

## 🔧 配置字段说明

### 必需字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `provider` | string | 提供商标识（唯一） | "deepseek", "openai" |
| `name` | string | 显示名称 | "DeepSeek AI" |
| `config.baseURL` | string | API 基础地址 | "https://api.deepseek.com" |
| `config.defaultModel` | string | 默认模型 | "deepseek-chat" |

### 可选字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `config.apiKey` | string | - | API 密钥（Ollama 不需要） |
| `config.timeout` | number | 60000 | 超时时间（毫秒） |
| `config.maxRetries` | number | 3 | 最大重试次数 |
| `enabled` | boolean | true | 是否启用 |

---

## 📝 快速配置步骤

### 步骤 1: 启动服务

```bash
cd /home/suntc/project/ApexBridge/apex-bridge
npm run dev
```

服务启动时会自动创建数据库文件 `data/llm_providers.db`。

---

### 步骤 2: 添加 LLM 提供商

**方法 A: 使用 curl（推荐）**

```bash
# 添加 DeepSeek
curl -X POST http://localhost:8088/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "deepseek",
    "name": "DeepSeek AI",
    "config": {
      "apiKey": "sk-your-actual-deepseek-api-key",
      "baseURL": "https://api.deepseek.com",
      "defaultModel": "deepseek-chat",
      "timeout": 60000,
      "maxRetries": 3
    },
    "enabled": true
  }'
```

**方法 B: 使用初始化脚本**

创建并运行初始化脚本（见下方"初始化脚本"章节）

---

### 步骤 3: 设置默认提供商

在 `config/admin-config.json` 中设置：

```json
{
  "llm": {
    "defaultProvider": "deepseek"
  }
}
```

---

### 步骤 4: 验证配置

```bash
# 查看所有提供商
curl http://localhost:8088/api/llm/providers

# 测试聊天
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

---

## 📜 完整初始化脚本

创建 `scripts/init-llm-providers.js`:

```javascript
#!/usr/bin/env node
/**
 * LLM 提供商配置初始化脚本
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 确保数据目录存在
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✅ 创建数据目录:', dataDir);
}

const dbPath = path.join(dataDir, 'llm_providers.db');
const db = new Database(dbPath);

console.log('📦 数据库路径:', dbPath);
console.log('');

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS llm_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_provider ON llm_providers(provider);
  CREATE INDEX IF NOT EXISTS idx_enabled ON llm_providers(enabled);
`);

console.log('✅ 数据库表结构已初始化\n');

// LLM 提供商配置
const providers = [
  {
    provider: 'deepseek',
    name: 'DeepSeek AI',
    config: {
      apiKey: process.env.DEEPSEEK_API_KEY || 'sk-your-deepseek-api-key',
      baseURL: 'https://api.deepseek.com',
      defaultModel: 'deepseek-chat',
      timeout: 60000,
      maxRetries: 3
    },
    enabled: true
  },
  {
    provider: 'openai',
    name: 'OpenAI GPT',
    config: {
      apiKey: process.env.OPENAI_API_KEY || 'sk-your-openai-api-key',
      baseURL: 'https://api.openai.com/v1',
      defaultModel: 'gpt-3.5-turbo',
      timeout: 60000,
      maxRetries: 3
    },
    enabled: false // 默认不启用，避免误用
  },
  {
    provider: 'zhipu',
    name: '智谱 AI',
    config: {
      apiKey: process.env.ZHIPU_API_KEY || 'your-zhipu-api-key',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      defaultModel: 'glm-4',
      timeout: 60000,
      maxRetries: 3
    },
    enabled: false
  },
  {
    provider: 'ollama',
    name: 'Ollama 本地模型',
    config: {
      baseURL: 'http://localhost:11434',
      defaultModel: 'llama2',
      timeout: 120000
    },
    enabled: false
  }
];

const stmt = db.prepare(`
  INSERT OR REPLACE INTO llm_providers (provider, name, config_json, enabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const now = Date.now();
let addedCount = 0;

console.log('📝 添加 LLM 提供商配置...\n');

providers.forEach(p => {
  try {
    stmt.run(
      p.provider,
      p.name,
      JSON.stringify(p.config),
      p.enabled ? 1 : 0,
      now,
      now
    );
    console.log(`✅ ${p.name} (${p.provider}) - ${p.enabled ? '已启用' : '未启用'}`);
    addedCount++;
  } catch (error) {
    console.error(`❌ 添加 ${p.name} 失败:`, error.message);
  }
});

db.close();

console.log('');
console.log('='.repeat(60));
console.log(`✅ 成功添加 ${addedCount}/${providers.length} 个 LLM 提供商配置`);
console.log('='.repeat(60));
console.log('');
console.log('📋 下一步操作：');
console.log('');
console.log('1. 编辑配置文件设置默认提供商：');
console.log('   编辑 config/admin-config.json');
console.log('   设置 "llm.defaultProvider": "deepseek"');
console.log('');
console.log('2. 或通过环境变量设置 API Key：');
console.log('   export DEEPSEEK_API_KEY="sk-your-actual-key"');
console.log('');
console.log('3. 重启服务：');
console.log('   npm run dev');
console.log('');
console.log('4. 验证配置：');
console.log('   curl http://localhost:8088/api/llm/providers');
console.log('');
```

**使用方法**:

```bash
# 1. 创建脚本
# 保存上述内容到 scripts/init-llm-providers.js

# 2. 设置环境变量（可选）
export DEEPSEEK_API_KEY="sk-your-actual-api-key"
export OPENAI_API_KEY="sk-your-openai-api-key"

# 3. 运行脚本
node scripts/init-llm-providers.js

# 4. 查看结果
sqlite3 data/llm_providers.db "SELECT provider, name, enabled FROM llm_providers;"
```

---

## 🧪 验证配置

### 查看已配置的提供商

```bash
# 方法 1: 使用 API
curl http://localhost:8088/api/llm/providers | jq

# 方法 2: 直接查询数据库
sqlite3 data/llm_providers.db "SELECT id, provider, name, enabled FROM llm_providers;"
```

### 测试提供商是否工作

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好，请介绍你自己"}
    ],
    "stream": false
  }'
```

---

## 🔄 动态切换提供商

### 临时切换（单次请求）

```bash
# 使用 OpenAI
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "provider": "openai"
  }'

# 使用 DeepSeek
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "provider": "deepseek"
  }'
```

### 永久切换（修改默认）

```bash
# 修改 config/admin-config.json
{
  "llm": {
    "defaultProvider": "openai"  // 改为 openai
  }
}

# 重启服务
npm run dev
```

---

## 🛠️ 常用操作

### 查看提供商详情

```bash
# 查看 ID 为 1 的提供商
curl http://localhost:8088/api/llm/providers/1
```

### 更新 API Key

```bash
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "apiKey": "sk-new-api-key"
    }
  }'
```

### 切换模型

```bash
curl -X PUT http://localhost:8088/api/llm/providers/1 \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "defaultModel": "gpt-4"
    }
  }'
```

### 备份配置

```bash
# 导出数据库
cp data/llm_providers.db data/llm_providers.db.backup

# 导出为 SQL
sqlite3 data/llm_providers.db .dump > llm_providers_backup.sql
```

### 恢复配置

```bash
# 从备份恢复
cp data/llm_providers.db.backup data/llm_providers.db

# 从 SQL 恢复
sqlite3 data/llm_providers.db < llm_providers_backup.sql
```

---

## ❓ 常见问题

### Q1: 首次启动如何配置 LLM？

**A**: 服务首次启动时数据库为空，需要通过以下方式之一添加：
1. 使用 API 接口添加（推荐）
2. 运行初始化脚本
3. 直接操作 SQLite 数据库

### Q2: 可以配置多个提供商吗？

**A**: 可以！支持配置多个提供商，通过以下方式切换：
- 修改 `llm.defaultProvider` 设置默认提供商
- 在请求中指定 `provider` 参数临时切换

### Q3: API Key 安全吗？

**A**: 
- ✅ API Key 存储在 SQLite 数据库中
- ✅ API 接口不返回完整 API Key
- ⚠️ 数据库文件应设置适当的文件权限
- ⚠️ 生产环境建议加密存储（待实现）

### Q4: 配置立即生效吗？

**A**: 
- ✅ 通过 API 更新配置后立即生效（热更新）
- ✅ 无需重启服务
- ℹ️ LLMManager 采用懒加载，首次聊天时从数据库加载

### Q5: 如何查看当前使用的提供商？

**A**:
```bash
# 查看配置
curl http://localhost:8088/api/llm/providers

# 查看日志
npm run dev | grep -i "LLM\|provider"
```

---

## 📚 相关文档

- [LLMConfigService.ts](../src/services/LLMConfigService.ts) - 配置服务实现
- [LLMManager.ts](../src/core/LLMManager.ts) - LLM 管理器
- [LLMController.ts](../src/api/controllers/LLMController.ts) - API 控制器
- [配置文件说明](./CONFIG_GUIDE.md) - 主配置文件说明

---

**最后更新**: 2025-11-18  
**维护者**: ApexBridge Team

