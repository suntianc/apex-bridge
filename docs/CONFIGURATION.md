---
title: 配置指南
type: documentation
module: configuration
priority: high
environment: all
last-updated: 2025-11-16
---

# ⚙️ 配置指南

本文档详细介绍了 ApexBridge 项目的配置方式和管理方法。

## 📋 配置文件结构

```
apex-bridge/
├── config/
│   ├── admin-config.json              # 主配置文件
│   ├── admin-config.json.template     # 配置模板
│   ├── nodes.json                     # 节点配置
│   └── preferences/                   # 用户偏好配置
│       ├── {user-id}.json
│       └── ...
└── env.template                       # 环境变量模板
```

## 🔧 核心配置

### config/admin-config.json

主配置文件，包含系统核心设置：

```json
{
  "general": {
    "server": {
      "port": 3000,
      "host": "localhost"
    },
    "debug": false,
    "logLevel": "info"
  },
  "llm": {
    "provider": "openai",
    "apiKey": "your-api-key-here",
    "model": "gpt-4",
    "max_tokens": 2000,
    "temperature": 0.7
  },
  "rag": {
    "enabled": true,
    "vectorStorePath": "./data/vectors",
    "maxResults": 10,
    "similarityThreshold": 0.7
  },
  "abp": {
    "skills": {
      "scanInterval": 60000,
      "cacheEnabled": true
    }
  },
  "setup_completed": false
}
```

#### 配置项说明

**general** - 通用设置
- `server.port` - HTTP服务端口（默认: 3000）
- `server.host` - 服务监听地址（默认: localhost）
- `debug` - 调试模式开关
- `logLevel` - 日志级别（debug/info/warn/error）

**llm** - LLM服务配置
- `provider` - LLM提供商（openai/deepseek/zhipu/ollama）
- `apiKey` - API密钥
- `model` - 模型名称
- `max_tokens` - 最大token数
- `temperature` - 随机度（0-1）

**rag** - RAG搜索配置
- `enabled` - 是否启用RAG服务
- `vectorStorePath` - 向量存储路径
- `maxResults` - 最大返回结果数
- `similarityThreshold` - 相似度阈值

**abp.skills** - Skills配置
- `scanInterval` - Skills扫描间隔（毫秒）
- `cacheEnabled` - 是否启用缓存

### config/nodes.json

节点配置文件：

```json
{
  "nodes": [
    {
      "id": "node-001",
      "name": "主节点",
      "type": "companion",
      "endpoint": "http://localhost:3001",
      "apiKey": "node-api-key"
    },
    {
      "id": "node-002",
      "name": "工作节点1",
      "type": "worker",
      "endpoint": "http://worker1.example.com:3001",
      "apiKey": "worker-api-key"
    }
  ]
}
```

### 用户偏好配置

位置: `config/preferences/{user-id}.json`

```json
{
  "userId": "user-123",
  "preferences": {
    "theme": "dark",
    "language": "zh-CN",
    "toolsDisclosure": "full"
  },
  "privacySettings": {
    "dataRetentionDays": 30,
    "allowAnalytics": true
  }
}
```

- `toolsDisclosure` - Skills披露级别（metadata/brief/full）
- `dataRetentionDays` - 数据保留天数
- `allowAnalytics` - 是否允许分析数据收集

## 🌍 环境变量

### .env 文件

复制 `env.template` 创建 `.env` 文件：

```bash
cp env.template .env
```

主要环境变量：

```bash
# LLM API Keys
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
ZHIPU_API_KEY=...

# Redis（可选）
REDIS_URL=redis://localhost:6379

# 数据库
DATABASE_URL=postgresql://user:pass@localhost:5432/apexbridge

# 日志
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

## 🚀 配置加载流程

1. **启动时加载**
   - 读取 `config/admin-config.json`
   - 验证配置完整性
   - 如果 `setup_completed=false`，进入设置向导

2. **动态配置**
   - 运行时可通过 AdminPanel 修改配置
   - 偏好配置支持用户级覆盖

3. **热更新**
   - Skills 扫描间隔自动检测变更
   - 部分配置无需重启即可生效

## ✅ 配置验证

系统启动时自动验证配置：

```typescript
import { loadConfig, validateConfig } from './src/config';

const config = loadConfig();
validateConfig(config); // 抛出错误如果配置无效
```

## 📝 最佳实践

1. **首次安装**
   - 使用 `config/admin-config.json.template` 作为起点
   - 完成设置向导（会自动设置 `setup_completed=true`）

2. **生产环境**
   - 使用环境变量管理敏感信息（API密钥等）
   - 定期备份配置文件
   - 使用配置管理工具（如 Consul、Etcd）

3. **开发环境**
   - 启用 `debug=true` 获取详细日志
   - 使用 `localhost` 和默认端口

4. **版本控制**
   - 提交模板文件（`*.template`）
   - 忽略实际配置文件（`*.json`）
   ```gitignore
   config/*.json
   !config/*.template
   config/preferences/*.json
   ```

## 🔐 安全建议

- 不要将 `.env` 文件提交到版本控制
- 使用强密码和API密钥
- 定期轮换敏感凭据
- 使用密钥管理服务（AWS Secrets Manager、HashiCorp Vault）

## ❓ 常见问题

**Q: 配置修改后需要重启吗？**
A: 大部分配置需要重启生效。Skills相关配置支持热更新。

**Q: 如何重置配置？**
A: 删除 `config/admin-config.json`，系统会使用模板重新生成。

**Q: 支持多环境配置吗？**
A: 目前通过不同的配置文件实现，建议使用 `config/admin-config.prod.json`、`config/admin-config.dev.json` 等命名。

## 📚 相关文档

- [🏗️ 架构设计](./ARCHITECTURE.md)
- [📦 部署指南](./DEPLOYMENT.md)
