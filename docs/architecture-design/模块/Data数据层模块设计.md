# Data 数据层模块设计

> 所属模块：Data
> 文档版本：v1.0.0
> 创建日期：2025-12-29

## 1. 模块概述

数据层负责 ApexBridge 的数据持久化、向量存储和缓存管理。

### 1.1 模块职责

- SQLite 配置和历史数据存储
- LanceDB 向量存储
- Redis 缓存和限流
- 文件系统存储（Skills、Playbook）

### 1.2 存储分布

| 数据类型 | 存储方式 | 位置 |
|----------|----------|------|
| LLM 配置 | SQLite | `.data/llm_providers.db` |
| 对话历史 | SQLite | `.data/conversation_history.db` |
| Skills 向量 | LanceDB | `.data/skills.lance` |
| Playbook 向量 | LanceDB | `.data/playbooks.lance` |
| 缓存 | Redis | 内存/Redis 服务器 |
| Skills 文件 | 文件系统 | `skills/` |
| Playbook 文件 | 文件系统 | `playbooks/` |

---

## 2. 核心组件

### 2.1 SQLite 数据源

**文件**：
- `src/core/llm/LLMConfigService.ts` - 提供商配置
- `src/services/ConversationHistoryService.ts` - 对话历史

**表结构**：

```sql
-- LLM 提供商表
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- openai, deepseek, zhipu, ollama
  base_url TEXT,
  api_key TEXT,
  enabled INTEGER DEFAULT 1,
  config TEXT,  -- JSON 配置
  created_at TEXT,
  updated_at TEXT
);

-- 模型表
CREATE TABLE models (
  id TEXT PRIMARY KEY,
  provider_id TEXT,
  model_id TEXT NOT NULL,
  name TEXT,
  capabilities TEXT,  -- JSON: chat, streaming, tools
  config TEXT,
  created_at TEXT,
  FOREIGN KEY (provider_id) REFERENCES providers(id)
);

-- 对话历史表
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  messages TEXT NOT NULL,  -- JSON 数组
  created_at TEXT,
  updated_at TEXT
);
```

### 2.2 LanceDB 向量存储

**文件**：
- `src/core/rag/SkillVectorStore.ts` - Skills 向量存储
- `src/services/PlaybookMatcher.ts` - Playbook 匹配

**Schema**：

```typescript
// Skills 向量
interface SkillVector {
  id: string;
  embedding: number[];  // 1536 维
  content: string;
  metadata: {
    skillId: string;
    skillName: string;
    category: string;
    tags: string[];
  };
}

// Playbook 向量
interface PlaybookVector {
  id: string;
  embedding: number[];  // 1536 维
  content: string;
  metadata: {
    playbookId: string;
    name: string;
    trigger: string;
    actions: string[];
  };
}
```

### 2.3 Redis 缓存

**用途**：
- API 请求限流
- 会话缓存
- 模型配置缓存
- 临时状态存储

**Key 模式**：
```
ratelimit:{userId}:{endpoint}  -- 限流计数
session:{sessionId}            -- 会话缓存
model:{provider}:{modelId}     -- 模型配置缓存
```

---

## 3. 依赖关系

```
┌─────────────────────────────────────────────────────────────────┐
│                      数据层架构                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   SQLite     │     │   LanceDB    │     │    Redis     │    │
│  │  (配置/历史) │     │   (向量)     │     │  (缓存/限流) │    │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘    │
│         │                    │                    │            │
│         v                    v                    v            │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │LLMConfigServ │     │SkillVector   │     │RateLimitServ │    │
│  │ConvHistoryServ│    │PlaybookMatch │     │CacheService  │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 配置项

```typescript
interface DataConfig {
  sqlite: {
    providersDb: string;
    historyDb: string;
    backupInterval: number;
  };
  lancedb: {
    skillsDb: string;
    playbooksDb: string;
    embeddingDim: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
  };
  fileStorage: {
    skillsPath: string;
    playbooksPath: string;
    maxFileSize: number;
  };
}
```

---

## 5. 数据迁移

### 5.1 备份策略

```typescript
interface BackupConfig {
  enabled: boolean;
  interval: number;  // 毫秒
  maxBackups: number;
  backupPath: string;
}
```

### 5.2 数据清理

```typescript
interface PurgeConfig {
  conversationRetention: number;  // 天数
  sessionRetention: number;       // 天数
  cacheTtl: number;               // 秒
  vectorCleanupInterval: number;  // 毫秒
}
```

---

## 6. 扩展点

### 6.1 新增数据源

1. 实现对应 Repository 接口
2. 在 Service 层注入新数据源
3. 更新配置和迁移脚本

### 6.2 更换向量数据库

1. 实现 `VectorStore` 接口
2. 更新 `SkillVectorStore` 和 `PlaybookMatcher`
3. 重新生成向量索引
