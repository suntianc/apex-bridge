# ApexBridge 配置文件说明

> **配置文件**: `config/admin-config.json`  
> **最后更新**: 2025-11-18  
> **版本**: v1.0.1 (精简版)

## 📋 配置概述

本配置文件是 ApexBridge 精简后的核心配置，仅保留实际使用的配置项。

### 配置来源

- ✅ **配置文件**: `config/admin-config.json` (JSON 格式)
- ❌ **环境变量**: 已完全移除 `.env` 配置读取
- ✅ **SQLite 数据库**: LLM 提供商配置存储在 `data/config.db`

---

## 🔧 配置项详解

### 1. `setup_completed` - 设置完成标志

```json
{
  "setup_completed": true
}
```

**说明**:
- `true`: 已完成初始设置，启动时进行严格配置验证
- `false`: 首次启动或未完成设置，跳过严格验证（用于设置向导，但管理后台已移除）

**建议**: 保持为 `true`

---

### 2. `api` - API 服务配置 ✅ 必需

```json
{
  "api": {
    "host": "0.0.0.0",      // 监听地址
    "port": 8088,           // 监听端口
    "cors": {
      "origin": "*",        // CORS 允许的来源
      "credentials": true   // 是否允许携带凭证
    }
  }
}
```

**必需字段**:
- `port`: 必须是 1-65535 之间的数字

**可选字段**:
- `host`: 默认 "0.0.0.0"
- `cors`: CORS 配置

**实际使用**:
- ✅ 配置验证: `ConfigService.validateConfig()` 验证 `api.port` 的有效性
- ✅ 服务启动: `server.ts:117-119` 使用 `api.host` 和 `api.port` 启动服务器

**说明**:
- 统一使用 `api` 配置，不再需要 `server` 配置
- 生产环境建议将 `cors.origin` 设置为具体域名数组

---

### 4. `auth` - 认证配置 ✅ 必需

```json
{
  "auth": {
    "enabled": false,       // 是否启用 API Key 认证
    "apiKey": "...",        // 主 API Key（用于 isSetupCompleted 检查）
    "apiKeys": []           // API Keys 列表（实际认证使用）
  }
}
```

**必需字段**:
- `enabled`: 必须是布尔值

**说明**:
- `enabled: false`: 不启用认证，所有 API 请求都可访问
- `enabled: true`: 启用认证，请求需要提供 `Authorization: Bearer <api-key>` 头
- `apiKey`: 用于 `isSetupCompleted()` 检查，判断是否已配置
- `apiKeys`: 实际的 API Keys 列表，格式为：
  ```json
  {
    "apiKeys": [
      {
        "id": "key-001",
        "key": "your-actual-api-key",
        "name": "客户端A",
        "createdAt": 1700000000000,
        "lastUsedAt": 0
      }
    ]
  }
  ```

**已移除的配置**:
- ❌ `auth.admin` - 管理后台已移除，无需管理员账号
- ❌ `auth.jwt.*` - JWT 相关配置已移除（如需要可通过代码生成）

---

### 5. `llm` - LLM 配置 ✅ 必需

```json
{
  "llm": {
    "providers": [],            // LLM 提供商列表（通过 SQLite 管理）
    "defaultProvider": "deepseek",  // 默认提供商名称
    "timeout": 60000,           // 超时时间（毫秒）
    "maxRetries": 3             // 最大重试次数
  }
}
```

**必需字段**:
- `defaultProvider`: 默认使用的 LLM 提供商

**说明**:
- `providers`: 从 SQLite 数据库加载，此处留空即可
- LLM 提供商的实际配置存储在 `data/config.db` 表 `llm_providers` 中
- 通过 `LLMConfigService` 管理提供商的增删改查

**已移除的配置**:
- ❌ `llm.quota` - LLM 配额限制功能未实现
- ❌ `llm.deepseek` 等具体提供商配置 - 改为 SQLite 管理
- ❌ `llm.fallbackProvider` - 备用提供商功能未实现

---

### 6. `rag` - RAG 向量检索配置 ⭕ 可选

```json
{
  "rag": {
    "enabled": true,        // 是否启用 RAG（可设为 false）
    "storagePath": "./vector_store",
    "workDir": "./vector_store",
    "vectorizer": {
      "baseURL": "https://api.siliconflow.cn/v1/embeddings",
      "apiKey": "sk-...",
      "model": "Qwen/Qwen3-Embedding-0.6B",
      "dimensions": 1023
    }
  }
}
```

**说明**:
- 如果不使用 RAG 功能，设置 `"enabled": false`
- 代码中通过 `(this.config as any).rag?.enabled` 判断是否启用
- `storagePath` 和 `workDir` 用于向量数据库存储

**已简化的配置**:
- ❌ `rag.defaultMode` - 详细检索模式配置
- ❌ `rag.defaultK` - 默认检索数量
- ❌ `rag.semanticWeight` - 语义权重
- ❌ `rag.rerank` - 重排序配置
- ❌ `rag.tagsConfig` - 标签配置
- ❌ `rag.diaryArchiveAfterDays` - 日记归档配置（功能已移除）

---

### 7. `logging` - 日志配置 ⭕ 可选

```json
{
  "logging": {
    "level": "info",                    // 日志级别
    "file": "./logs/apexbridge.log"     // 日志文件路径
  }
}
```

**日志级别**:
- `error`: 仅错误
- `warn`: 警告及以上
- `info`: 信息及以上（推荐）
- `debug`: 调试信息（开发时使用）

---

### 8. `performance` - 性能配置 ⭕ 可选

```json
{
  "performance": {
    "workerPoolSize": 4,        // 工作池大小
    "requestTimeout": 60000,    // 请求超时（毫秒）
    "maxRequestSize": "50mb"    // 最大请求体大小
  }
}
```

**说明**: 这些是性能调优参数，使用默认值即可。

---

### 9. `redis` - Redis 配置 ⭕ 可选

```json
{
  "redis": {
    "enabled": false,           // 是否启用 Redis
    "host": "127.0.0.1",
    "port": 6379,
    "db": 0,
    "keyPrefix": "apex_bridge:",
    "connectTimeout": 10000,
    "lazyConnect": true,
    "maxRetriesPerRequest": 3,
    "retryDelayOnFailover": 100
  }
}
```

**说明**:
- `enabled: false`: 使用内存缓存（推荐，轻量级）
- `enabled: true`: 使用 Redis 缓存（分布式部署时使用）

---

### 10. `security` - 安全配置 ⭕ 可选

```json
{
  "security": {
    "rateLimit": {
      "enabled": true,          // 是否启用限流
      "windowMs": 900000,       // 时间窗口（15分钟）
      "max": 1000,              // 最大请求数
      "message": "请求过于频繁，请稍后再试",
      "standardHeaders": true,
      "legacyHeaders": false,
      "trustProxy": false
    }
  }
}
```

**说明**:
- 启用限流可防止 API 滥用
- 生产环境建议保持启用

**已简化的配置**:
- ❌ `security.rateLimit.rules` - 详细限流规则（复杂度过高）
- ❌ `security.rateLimit.provider` - 限流提供商选择
- ❌ `security.rateLimit.whitelist` - 白名单配置

---

## 🗑️ 已删除的配置（不再需要）

### 1. `plugins` - 插件配置 ❌

```json
// 已删除
{
  "plugins": {
    "directory": "./plugins",
    "autoLoad": true
  }
}
```

**删除原因**:
- 插件系统已完全移除，改为 Skills 体系
- Skills 路径硬编码为 `skills/`，不从配置读取
- PathService 中的 `pluginDir` 配置未被实际使用

---

### 2. `auth.admin` - 管理员配置 ❌

```json
// 已删除
{
  "auth": {
    "admin": {
      "username": "admin",
      "password": "123456"
    }
  }
}
```

**删除原因**:
- 管理后台已移除
- 无需管理员账号配置

---

### 3. `server` - 服务器配置 ❌

```json
// 已删除
{
  "server": {
    "port": 8088,
    "host": "0.0.0.0"
  }
}
```

**删除原因**:
- 与 `api` 配置重复
- 代码已统一使用 `api` 配置（v1.0.1）
- 保留会导致配置混淆和维护困难

---

### 4. `auth.jwt` - JWT 详细配置 ❌

```json
// 已删除
{
  "auth": {
    "jwt": {
      "secret": "...",
      "expiresIn": 604800,
      "algorithm": "HS256"
    },
    "jwtSecret": "...",
    "jwtExpiresIn": "7d"
  }
}
```

**删除原因**:
- JWT 功能在轻量级版本中不使用
- 如果代码中需要 JWT，会自动生成密钥
- 简化配置复杂度

**如果需要 JWT**: 代码会调用 `getOrGenerateJWTSecret()` 自动生成

---

### 4. 其他已删除的配置 ❌

- ❌ `protocol` - 空配置对象
- ❌ `memory` - 记忆系统配置
- ❌ `pluginCallback` - 插件回调配置
- ❌ `llm.quota` - LLM 配额配置
- ❌ `llm.fallbackProvider` - 备用提供商
- ❌ `rag` 的详细子配置 - 简化为基础配置

---

## 📊 配置精简对比

### 版本对比

| 版本 | 行数 | 大小 | 配置项 | 说明 |
|------|------|------|--------|------|
| **原始版本** | 219 行 | ~7.0 KB | ~30 项 | 包含大量管理后台、插件系统配置 |
| **第一次精简** | 67 行 | 1.6 KB | ~15 项 | 删除无用配置 |
| **第二次精简** | 57 行 | 1.4 KB | ~10 项 | 删除插件、管理后台、JWT 配置 |
| **精简比例** | **-74%** | **-80%** | **-67%** | |

---

## ✅ 最小可运行配置

如果要最小化配置，只需以下内容：

```json
{
  "setup_completed": true,
  "api": {
    "port": 8088
  },
  "server": {
    "port": 8088,
    "host": "0.0.0.0"
  },
  "auth": {
    "enabled": false,
    "apiKey": "default"
  },
  "llm": {
    "defaultProvider": "deepseek"
  }
}
```

**其他配置都有合理的默认值。**

---

## 🎯 实际代码使用情况

| 配置项 | 代码位置 | 是否必需 | 说明 |
|--------|----------|----------|------|
| `setup_completed` | `config/index.ts` | ✅ 是 | 用于跳过验证 |
| `api.port` | `services/ConfigService.ts` | ✅ 是 | 配置验证 |
| `server.port/host` | `server.ts:117-118` | ✅ 是 | 启动服务器 |
| `auth.enabled` | `services/ConfigService.ts` | ✅ 是 | 认证开关 |
| `auth.apiKey` | `services/ConfigService.ts` | ✅ 是 | 设置完成检查 |
| `auth.apiKeys` | `middleware/authMiddleware.ts` | ⭕ 可选 | API Key 认证列表 |
| `llm.*` | `core/LLMManager.ts` | ✅ 是 | LLM 基础配置 |
| `rag.*` | `core/ProtocolEngine.ts` | ⭕ 可选 | RAG 功能 |
| `logging.*` | - | ⭕ 可选 | 日志配置 |
| `performance.*` | - | ⭕ 可选 | 性能配置 |
| `redis.*` | `services/RedisService.ts` | ⭕ 可选 | Redis 缓存 |
| `security.*` | `middleware/rateLimitMiddleware.ts` | ⭕ 可选 | 限流配置 |

---

## 🚀 快速配置指南

### 开发环境配置

```json
{
  "setup_completed": true,
  "api": { "port": 8088 },
  "server": { "port": 8088, "host": "0.0.0.0" },
  "auth": { "enabled": false, "apiKey": "dev" },
  "llm": { "defaultProvider": "deepseek" },
  "rag": { "enabled": false }
}
```

### 生产环境配置

```json
{
  "setup_completed": true,
  "api": { "port": 8088 },
  "server": { "port": 8088, "host": "0.0.0.0" },
  "auth": { 
    "enabled": true, 
    "apiKey": "production-key",
    "apiKeys": [
      {
        "id": "client-001",
        "key": "sk-prod-xxx",
        "name": "生产客户端",
        "createdAt": 1700000000000
      }
    ]
  },
  "llm": { "defaultProvider": "deepseek" },
  "security": {
    "rateLimit": {
      "enabled": true,
      "trustProxy": true
    }
  }
}
```

---

## 📝 Skills 配置说明

### Skills 目录

Skills 目录路径：**硬编码为 `skills/`**

```typescript
// src/server.ts:201
const skillsRoot = path.join(ps.getRootDir(), 'skills');
```

**说明**:
- Skills 不从配置文件读取路径
- 固定使用项目根目录下的 `skills/` 目录
- 所有 Skills 放在 `skills/` 目录下即可自动扫描加载

### Skills 自动加载

- ✅ 启动时自动扫描 `skills/` 目录
- ✅ 查找 `SKILL.md` 或 `METADATA.yml` 文件
- ✅ 自动加载所有有效的 Skills
- ❌ 无需手动配置 Skills 列表

---

## 🔄 配置修改后

### 重启服务

配置文件更改后需要重启服务：

```bash
# 停止服务（Ctrl+C）
# 重新启动
npm run dev
```

### 清理缓存

如果配置未生效，可以清理缓存：

```bash
# ConfigService 的缓存在内存中，重启即可
# 如果有持久化缓存，删除相关文件
```

---

## 🧪 配置验证

### 验证配置格式

```bash
# 验证 JSON 格式
cat config/admin-config.json | jq .

# 如果有语法错误会提示
```

### 验证服务启动

```bash
# 启动服务
npm run dev

# 预期日志：
# ✅ Configuration loaded from JSON file
# ✅ Configuration loaded and validated
```

### 验证健康检查

```bash
curl http://localhost:8088/health

# 预期响应：
# {"status":"ok","uptime":...}
```

---

## 📚 相关文档

- [ConfigService.ts](../src/services/ConfigService.ts) - 配置服务实现
- [LLMConfigService.ts](../src/services/LLMConfigService.ts) - LLM 配置（SQLite）
- [authMiddleware.ts](../src/api/middleware/authMiddleware.ts) - 认证中间件
- [Skills 体系说明](../README.md) - Skills 与插件的区别

---

## 💡 配置优化建议

1. **禁用不使用的功能**:
   - 不用 RAG: `"rag": {"enabled": false}`
   - 不用 Redis: `"redis": {"enabled": false}`
   - 不用认证: `"auth": {"enabled": false}`

2. **生产环境安全**:
   - 启用认证: `"auth": {"enabled": true}`
   - 配置 API Keys: `"auth.apiKeys"`
   - 启用限流: `"security.rateLimit.enabled": true`
   - 设置 CORS: `"api.cors.origin": ["https://your-domain.com"]`

3. **性能优化**:
   - 调整工作池: `"performance.workerPoolSize"`
   - 调整超时: `"llm.timeout"`
   - 启用 Redis: `"redis.enabled": true` (分布式场景)

---

**最后更新**: 2025-11-18  
**维护者**: ApexBridge Team  
**配置版本**: v1.0.1 (精简版)
