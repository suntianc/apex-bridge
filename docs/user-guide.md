# ApexBridge 用户指南

**版本:** 2.0.0  
**最后更新:** 2026-01-12

本指南涵盖 ApexBridge 的日常使用场景，包括基础操作、技能管理、检索配置和常见问题解答。

---

## 目录

- [快速开始](#快速开始)
- [技能系统](#技能系统)
- [工具检索](#工具检索)
- [MCP 集成](#mcp-集成)
- [上下文管理](#上下文管理)
- [性能调优](#性能调优)
- [故障排查](#故障排查)

---

## 快速开始

### 安装与启动

```bash
# 克隆并安装
git clone https://github.com/suntianc/apex-bridge.git
cd apex-bridge
npm install

# 启动开发服务器
npm run dev

# 生产构建
npm run build
npm start
```

### 首次配置

1. **环境变量配置**

   创建 `.env` 文件：

   ```bash
   # .env 配置示例
   PORT=8088
   NODE_ENV=development
   LOG_LEVEL=info

   # API 认证
   ABP_API_KEY=your-api-key-here

   # LLM 提供商配置
   OPENAI_API_KEY=sk-your-openai-key
   ANTHROPIC_API_KEY=sk-ant-your-key
   DEEPSEEK_API_KEY=sk-your-key

   # 向量嵌入配置
   EMBEDDING_PROVIDER=openai
   EMBEDDING_MODEL=text-embedding-3-small
   ```

2. **应用配置**

   编辑 `config/admin-config.json`：

   ```json
   {
     "api": {
       "host": "0.0.0.0",
       "port": 8088
     },
     "llm": {
       "defaultProvider": "openai",
       "timeout": 30000,
       "maxRetries": 3
     },
     "auth": {
       "enabled": true,
       "apiKey": "your-api-key"
     }
   }
   ```

3. **运行数据库迁移**

   ```bash
   npm run migrations
   ```

### 基础聊天请求

```bash
# 基础聊天
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "messages": [
      {"role": "system", "content": "你是一个专业助手"},
      {"role": "user", "content": "请介绍一下 ApexBridge 的主要特性"}
    ],
    "model": "gpt-4",
    "stream": false
  }'
```

**响应示例：**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1699000000,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "ApexBridge 是一个高性能的 AI Agent 框架..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 120,
    "total_tokens": 170
  }
}
```

### 流式响应

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "messages": [{"role": "user", "content": "用 Python 写一个快速排序"}],
    "model": "gpt-4",
    "stream": true
  }'
```

**WebSocket 流式连接：**

```javascript
const ws = new WebSocket("ws://localhost:8088/ws/chat");

ws.onopen = () => {
  ws.send(
    JSON.stringify({
      type: "chat",
      messages: [{ role: "user", content: "你好！" }],
      model: "gpt-4",
    })
  );
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Received:", data.content || data.delta?.content);
};
```

---

## 技能系统

技能（Skills）是 ApexBridge 的可扩展能力单元，允许您通过 ZIP 包安装自定义功能模块。

### 技能结构

一个完整的技能包包含以下文件：

```
my-skill/
├── SKILL.md          # 技能定义文件（必需）
├── README.md         # 技能说明文档（可选）
├── src/              # 源代码目录（可选）
└── package.json      # 依赖配置（可选）
```

**SKILL.md 示例：**

````markdown
---
name: file-processor
description: 文件处理技能，支持读取、写入和管理文件
version: 1.0.0
tags: [utility, file-management, io]
allowedTools:
  - read-file
  - write-file
  - list-dir
context: inline
userInvocable: true
---

# File Processor Skill

This skill provides file operations capabilities.

## Usage

Use this skill when you need to:

- Read file contents
- Write files
- List directory contents

## Examples

```typescript
// Read a file
await readFile("path/to/file.txt");

// Write content to a file
await writeFile("path/to/file.txt", "content");
```
````

````

### 安装技能

**通过 API 安装：**

```bash
curl -X POST http://localhost:8088/api/skills/install \
  -H "Authorization: Bearer your-api-key" \
  -F "file=@my-skill.zip" \
  -F "overwrite=true"
````

**响应示例：**

```json
{
  "success": true,
  "data": {
    "name": "file-processor",
    "version": "1.0.0",
    "description": "文件处理技能",
    "tags": ["utility", "file-management"],
    "installedAt": "2026-01-12T10:00:00Z"
  }
}
```

### 技能管理

**列出所有技能：**

```bash
curl -X GET "http://localhost:8088/api/skills?page=1&limit=20&tags=utility" \
  -H "Authorization: Bearer your-api-key"
```

**获取技能详情：**

```bash
curl -X GET http://localhost:8088/api/skills/file-processor \
  -H "Authorization: Bearer your-api-key"
```

**更新技能描述：**

```bash
curl -X PUT http://localhost:8088/api/skills/file-processor/description \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"description": "更新的技能描述"}'
```

**卸载技能：**

```bash
curl -X DELETE http://localhost:8088/api/skills/file-processor \
  -H "Authorization: Bearer your-api-key"
```

**技能统计：**

```bash
curl -X GET http://localhost:8088/api/skills/stats \
  -H "Authorization: Bearer your-api-key"
```

### Claude Code Skill 兼容性

ApexBridge 支持 Claude Code Agent Skills 格式：

```markdown
---
name: data-analyzer
description: 数据分析技能，用于处理和分析结构化数据
version: 1.2.0
tags: [analytics, data-processing]
allowedTools:
  - read-file
  - write-file
model: claude-3-5-sonnet
userInvocable: true
context: inline
agent: data-analysis-agent
hooks:
  preExecution:
    - validate-input
  postExecution:
    - log-result
    - cleanup
---

# Data Analyzer Skill

Professional data analysis capabilities.

## Capabilities

- CSV/JSON data processing
- Statistical analysis
- Visualization generation
```

---

## 工具检索

### 混合检索配置

ApexBridge 提供多种检索策略的混合搜索能力：

```typescript
import { HybridRetrievalEngine } from "./services/tool-retrieval/HybridRetrievalEngine";

const retrievalEngine = new HybridRetrievalEngine({
  vectorWeight: 0.6, // 向量检索权重
  keywordWeight: 0.3, // 关键词检索权重
  semanticWeight: 0.1, // 语义检索权重
  rrfK: 60, // RRF 融合参数
});
```

**执行混合搜索：**

```typescript
const results = await retrievalEngine.hybridSearch("query", {
  topK: 10,
  vectorWeight: 0.6,
  keywordWeight: 0.3,
  semanticWeight: 0.1,
  rrfK: 60,
});
```

### 披露机制

披露机制控制检索结果的详细程度：

```typescript
import { DisclosureManager, DisclosureLevel } from "./services/tool-retrieval/DisclosureManager";

// 元数据级别（约 100 tokens）
const metaResults = await retrievalEngine.searchWithDisclosure("query", {
  level: DisclosureLevel.METADATA,
});

// 内容级别（< 5k tokens）
const contentResults = await retrievalEngine.searchWithDisclosure("query", {
  level: DisclosureLevel.CONTENT,
  maxTokens: 3000,
});

// 资源级别（按需加载）
const resourceResults = await retrievalEngine.searchWithDisclosure("query", {
  level: DisclosureLevel.RESOURCES,
  thresholds: { l2: 0.8, l3: 0.6 },
});
```

### 批量嵌入处理

处理大量文本时使用批量嵌入：

```typescript
import { BatchEmbeddingService } from './services/BatchEmbeddingService';

const batchService = new BatchEmbeddingService({
  batchSize: 100,          // 每批处理数量
  maxConcurrency: 5,       // 最大并发数
  timeoutMs: 60000,        // 超时时间
  retryAttempts: 3,        // 重试次数
  enableProgressCallback: true,
});

// 设置进度回调
batchService.setProgressCallback((progress) => {
  console.log(`Progress: ${progress.processed}/${progress.total}`);
  console.log(`Elapsed: ${progress.elapsedMs}ms`);
  console.log(`Estimated remaining: ${progress.estimatedRemainingMs}ms`);
});

// 执行批量嵌入
const result = await batchService.generateBatch(
  ['text1', 'text2', 'text3', ...],
  async (batch) => {
    // 调用实际的嵌入 API
    return await embeddingProvider.embed(batch);
  }
);

console.log(`Processed: ${result.totalProcessed}/${result.totalProcessed + result.failedCount}`);
console.log(`Duration: ${result.duration}ms`);
```

---

## MCP 集成

### 注册 MCP 服务器

**stdio 方式：**

```bash
curl -X POST http://localhost:8088/api/mcp/servers \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "filesystem-server",
    "name": "Filesystem MCP Server",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "./data"],
    "env": {
      "NODE_ENV": "development"
    }
  }'
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "id": "filesystem-server",
    "name": "Filesystem MCP Server",
    "type": "stdio",
    "status": "running",
    "tools": ["read_file", "write_file", "list_dir"]
  }
}
```

### 调用 MCP 工具

**直接调用：**

```bash
curl -X POST http://localhost:8088/api/mcp/tools/call \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "read_file",
    "arguments": {
      "path": "/some/file.txt"
    }
  }'
```

**通过服务器调用：**

```bash
curl -X POST http://localhost:8088/api/mcp/servers/filesystem-server/tools/read_file/call \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/some/file.txt"
  }'
```

### MCP 服务器管理

**列出所有服务器：**

```bash
curl -X GET http://localhost:8088/api/mcp/servers \
  -H "Authorization: Bearer your-api-key"
```

**获取服务器状态：**

```bash
curl -X GET http://localhost:8088/api/mcp/servers/filesystem-server/status \
  -H "Authorization: Bearer your-api-key"
```

**重启服务器：**

```bash
curl -X POST http://localhost:8088/api/mcp/servers/filesystem-server/restart \
  -H "Authorization: Bearer your-api-key"
```

**获取服务器工具列表：**

```bash
curl -X GET http://localhost:8088/api/mcp/servers/filesystem-server/tools \
  -H "Authorization: Bearer your-api-key"
```

**删除服务器：**

```bash
curl -X DELETE http://localhost:8088/api/mcp/servers/filesystem-server \
  -H "Authorization: Bearer your-api-key"
```

---

## 上下文管理

### 上下文压缩策略

ApexBridge 提供 4 层上下文压缩策略：

```typescript
// Truncate - 截断策略（最快）
const truncateResult = await chatService.processMessage(messages, {
  contextCompression: {
    enabled: true,
    strategy: "truncate",
  },
});

// Prune - 剪枝策略
const pruneResult = await chatService.processMessage(messages, {
  contextCompression: {
    enabled: true,
    strategy: "prune",
    preserveSystemMessage: true,
  },
});

// Summary - 摘要策略
const summaryResult = await chatService.processMessage(messages, {
  contextCompression: {
    enabled: true,
    strategy: "summary",
    auto: true,
  },
});

// Hybrid - 混合策略（推荐）
const hybridResult = await chatService.processMessage(messages, {
  contextCompression: {
    enabled: true,
    strategy: "hybrid",
    auto: true,
    preserveSystemMessage: true,
  },
});
```

**请求示例：**

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "messages": [
      {"role": "system", "content": "你是一个专业助手"},
      {"role": "user", "content": "这是第 1 条消息"},
      {"role": "assistant", "content": "第 1 条回复"},
      {"role": "user", "content": "这是第 2 条消息"},
      {"role": "assistant", "content": "第 2 条回复"}
    ],
    "model": "gpt-4",
    "contextCompression": {
      "enabled": true,
      "strategy": "hybrid",
      "auto": true,
      "preserveSystemMessage": true
    }
  }'
```

### 压缩效果对比

| 策略     | 处理速度 | 信息保留度 | 适用场景               |
| -------- | -------- | ---------- | ---------------------- |
| Truncate | 最快     | 低         | 简单对话、速度优先场景 |
| Prune    | 快       | 中         | 中等复杂度对话         |
| Summary  | 慢       | 高         | 需要保留关键信息的对话 |
| Hybrid   | 中       | 最高       | 复杂长对话（推荐使用） |

---

## 性能调优

### 启动预热配置

启用启动预热以减少首次请求延迟：

```bash
# 环境变量配置
WARMUP_ENABLED=true
WARMUP_TIMEOUT_MS=60000
```

**程序化配置：**

```typescript
import { ApplicationWarmupService } from "./services/warmup/ApplicationWarmupService";

const warmupService = new ApplicationWarmupService({
  enabled: true,
  timeoutMs: 60000,
  databaseWarmup: {
    enabled: true,
    priority: ["sqlite"],
  },
  indexWarmup: {
    enabled: true,
    queryCount: 100,
  },
  embeddingCacheWarmup: {
    enabled: true,
    sampleCount: 100,
  },
  searchCacheWarmup: {
    enabled: true,
    queryCount: 100,
  },
});

// 执行预热
await warmupService.warmup();

// 检查预热状态
const status = warmupService.getStatus();
console.log("Warmup completed:", status.isComplete);
console.log("Total duration:", status.totalDuration, "ms");
```

### 索引配置优化

```typescript
import { IndexConfigOptimizer } from "./services/tool-retrieval/IndexConfigOptimizer";

const optimizer = new IndexConfigOptimizer();

// 根据数据规模自动优化配置
const config = optimizer.calculateOptimalConfig(
  50000, // 50K 向量
  384, // 向量维度
  0.95 // 目标召回率
);

console.log("Optimal config:", config);
```

### 连接池配置

```typescript
import { LanceDBConnectionPool } from "./services/tool-retrieval/LanceDBConnectionPool";

const pool = new LanceDBConnectionPool({
  maxInstances: 4, // 最大连接数
  instanceTTL: 300000, // 连接存活时间（毫秒）
  healthCheckInterval: 60000, // 健康检查间隔
});

// 获取连接
const connection = await pool.getConnection("/path/to/database");

// 获取连接池统计
const stats = pool.getStats();
console.log("Active connections:", stats.activeConnections);
console.log("Pool size:", stats.poolSize);
```

---

## 故障排查

### 常见问题

#### Q1: API 请求返回 401 错误？

**解决方案：**

```bash
# 验证 API 密钥配置
cat .env | grep ABP_API_KEY

# 检查请求头格式
curl -H "Authorization: Bearer your-api-key" http://localhost:8088/health
```

#### Q2: 模型调用失败？

**排查步骤：**

1. 检查对应提供商的 API 密钥是否有效
2. 确认网络连接正常
3. 查看服务器日志：

   ```bash
   tail -f logs/apex-bridge.log
   ```

4. 测试提供商连接：

   ```bash
   curl -X POST http://localhost:8088/api/llm/providers/test-connect \
     -H "Content-Type: application/json" \
     -d '{
       "type": "openai",
       "apiKey": "your-api-key",
       "baseUrl": "https://api.openai.com/v1"
     }'
   ```

#### Q3: 向量检索返回空结果？

**排查步骤：**

1. 检查技能是否已索引：

   ```bash
   curl -X GET http://localhost:8088/api/skills/stats \
     -H "Authorization: Bearer your-api-key"
   ```

2. 重新索引所有技能：

   ```bash
   curl -X POST http://localhost:8088/api/skills/reindex \
     -H "Authorization: Bearer your-api-key"
   ```

3. 检查向量维度配置：

   ```bash
   # 确认 EMBEDDING_MODEL 和 LLMConfig 配置一致
   echo $EMBEDDING_MODEL
   ```

#### Q4: 端口被占用？

**解决方案：**

```bash
# 查看占用端口的进程
lsof -i :8088

# 修改 .env 中的端口配置
PORT=8089
```

#### Q5: MCP 服务器启动失败？

**排查步骤：**

1. 检查 MCP 服务器配置是否正确
2. 验证命令和参数是否有效：

   ```bash
   # 测试命令直接执行
   npx -y @modelcontextprotocol/server-filesystem ./data
   ```

3. 查看 MCP 健康状态：

   ```bash
   curl -X GET http://localhost:8088/api/mcp/health \
     -H "Authorization: Bearer your-api-key"
   ```

### 日志级别配置

| 级别  | 用途             |
| ----- | ---------------- |
| error | 错误信息         |
| warn  | 警告信息         |
| info  | 一般信息（默认） |
| debug | 调试信息         |
| trace | 详细追踪信息     |

```bash
# 设置日志级别
LOG_LEVEL=debug
```

### 性能监控

**查看服务器状态：**

```bash
curl http://localhost:8088/health
```

**响应示例：**

```json
{
  "status": "ok",
  "version": "2.0.0",
  "uptime": 3600,
  "plugins": 5,
  "activeRequests": 2
}
```

**查看 MCP 统计：**

```bash
curl -X GET http://localhost:8088/api/mcp/statistics \
  -H "Authorization: Bearer your-api-key"
```

---

## 最佳实践

### 1. 技能设计

- 保持技能职责单一
- 使用清晰的命名和描述
- 合理设置 `allowedTools` 权限
- 提供完整的 SKILL.md 文档

### 2. 性能优化

- 启用启动预热（生产环境）
- 合理设置批量处理大小
- 使用混合检索策略
- 定期清理无用技能

### 3. 安全建议

- 启用 API 认证
- 使用强 API 密钥
- 限制 `allowedTools` 权限范围
- 定期更新技能和依赖

### 4. 监控告警

- 监控 API 响应时间
- 设置错误率告警
- 跟踪资源使用情况
- 记录关键操作日志

---

## 获取帮助

- **项目仓库**: https://github.com/suntianc/apex-bridge
- **问题反馈**: https://github.com/suntianc/apex-bridge/issues
- **文档更新**: 欢迎提交 PR 完善文档
