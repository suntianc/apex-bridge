# MCP 集成指南

ApexBridge 原生支持 Model Context Protocol (MCP)，可无缝集成外部 MCP 服务器，实现工具调用和数据访问。本指南涵盖 MCP 服务器管理、工具使用、配置和故障排查等各个方面。

## 概述

ApexBridge 的 MCP 集成提供完整的 MCP 协议支持，包括服务器注册与生命周期管理、工具发现与索引、统一的工具调用接口、以及持久化存储。系统采用模块化设计，`MCPIntegrationService` 作为核心协调器，`MCPServerManager` 负责单服务器管理，`MCPConfigService` 处理配置持久化，而 `MCPToolSupport` 则提供向量索引支持。

技术栈方面，ApexBridge 使用 `@modelcontextprotocol/sdk` (版本 ^1.24.3) 实现标准 MCP 协议通信，支持 JSON-RPC 2.0 消息格式。工具向量索引基于 SurrealDB，使用余弦相似度进行语义搜索。服务器配置持久化存储于 SurrealDB，采用事务保证一致性。

## 什么是 MCP

Model Context Protocol (MCP) 是由 Anthropic 提出的开放协议，旨在标准化 AI 助手与外部工具、数据源的通信方式。MCP 采用客户端-服务器架构，定义了工具发现、调用和结果返回的标准流程。使用 MCP 的优势在于标准化集成方式，开发者只需实现一次服务器，即可被任何支持 MCP 的客户端使用，同时协议设计注重安全性，支持资源隔离和权限控制。

MCP 的核心概念包括服务器 (Server)、工具 (Tools)、资源 (Resources) 和提示模板 (Prompt Templates)。服务器是提供工具和资源的进程，可以是本地进程或远程服务。工具是服务器暴露的可执行函数，具有名称、描述和输入模式。资源是服务器提供的数据文件或 API 响应。提示模板则是可复用的提示词模式。

## MCP 服务器管理

### 注册 MCP 服务器

注册 MCP 服务器是使用 MCP 功能的第一步。服务器通过 `POST /api/mcp/servers` 端点注册，需要提供服务器配置信息。配置必须包含 `id`（唯一标识符）、`type`（传输类型，支持 stdio/sse/websocket）、`command`（启动命令）、`args`（命令行参数）。可选配置包括 `env`（环境变量）、`cwd`（工作目录）和 `transportOptions`（传输层选项）。

以下是使用 curl 注册 MCP 服务器的示例：

```bash
curl -X POST http://localhost:8088/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "filesystem",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    "env": {
      "NODE_ENV": "production"
    },
    "cwd": "/Users/suntc/project/apex-bridge"
  }'
```

成功响应将返回服务器 ID 和注册确认信息：

```json
{
  "success": true,
  "data": {
    "serverId": "filesystem",
    "message": "Server registered successfully"
  }
}
```

当前版本仅支持 `stdio` 传输类型，适用于本地进程。对于需要 SSE 或 WebSocket 传输的远程服务器，配置结构相同，只需设置 `type` 为对应值即可。

### 查询服务器列表

获取所有已注册的 MCP 服务器列表使用 `GET /api/mcp/servers` 端点。响应包含每个服务器的完整信息，包括配置、状态、可用工具数量和最后活动时间：

```bash
curl http://localhost:8088/api/mcp/servers
```

```json
{
  "success": true,
  "data": [
    {
      "id": "filesystem",
      "config": {
        "id": "filesystem",
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        "env": {},
        "cwd": "/Users/suntc/project/apex-bridge"
      },
      "status": {
        "phase": "running",
        "message": "Server running",
        "uptime": 3600000,
        "startTime": "2026-01-10T10:00:00.000Z"
      },
      "tools": [
        {
          "name": "read_file",
          "description": "Read the contents of a file",
          "inputSchema": {
            "type": "object",
            "properties": {
              "path": {
                "type": "string",
                "description": "Path to the file"
              }
            },
            "required": ["path"]
          }
        }
      ],
      "lastActivity": "2026-01-10T11:00:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "timestamp": "2026-01-10T12:00:00.000Z"
  }
}
```

### 查询单个服务器

获取特定服务器的详细信息使用 `GET /api/mcp/servers/:serverId` 端点。如果服务器不存在，将返回 404 错误：

```bash
curl http://localhost:8088/api/mcp/servers/filesystem
```

### 获取服务器状态

监控服务器运行状态使用 `GET /api/mcp/servers/:serverId/status` 端点。服务器状态包含多个阶段：`not-started`（未启动）、`initializing`（初始化中）、`starting`（启动中）、`running`（运行中）、`stopping`（停止中）、`stopped`（已停止）、`error`（错误）和 `shutting-down`（关闭中）：

```bash
curl http://localhost:8088/api/mcp/servers/filesystem/status
```

```json
{
  "success": true,
  "data": {
    "serverId": "filesystem",
    "status": {
      "phase": "running",
      "message": "Server running",
      "uptime": 3600000,
      "startTime": "2026-01-10T10:00:00.000Z"
    }
  }
}
```

### 重启服务器

当服务器出现异常或需要重新加载配置时，可以重启服务器。重启操作会先关闭现有连接，再重新初始化：

```bash
curl -X POST http://localhost:8088/api/mcp/servers/filesystem/restart
```

```json
{
  "success": true,
  "data": {
    "serverId": "filesystem",
    "message": "Server restarted successfully"
  }
}
```

### 注销服务器

不再需要的服务器可以通过 `DELETE /api/mcp/servers/:serverId` 端点注销。注销操作会停止服务器进程、清理向量索引、移除工具缓存，并从数据库中删除配置：

```bash
curl -X DELETE http://localhost:8088/api/mcp/servers/filesystem
```

## MCP 工具使用

### 获取服务器工具列表

每个 MCP 服务器注册时会自动发现并索引其提供的工具。获取特定服务器的工具列表使用 `GET /api/mcp/servers/:serverId/tools` 端点：

```bash
curl http://localhost:8088/api/mcp/servers/filesystem/tools
```

```json
{
  "success": true,
  "data": {
    "serverId": "filesystem",
    "tools": [
      {
        "name": "read_file",
        "description": "Read the contents of a file",
        "inputSchema": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "Path to the file to read"
            }
          },
          "required": ["path"]
        }
      },
      {
        "name": "write_file",
        "description": "Write content to a file",
        "inputSchema": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "Path to the file"
            },
            "content": {
              "type": "string",
              "description": "Content to write"
            }
          },
          "required": ["path", "content"]
        }
      }
    ],
    "count": 2
  }
}
```

### 调用指定服务器的工具

调用特定服务器的工具使用 `POST /api/mcp/servers/:serverId/tools/:toolName/call` 端点。请求体包含工具参数，必须符合工具的 `inputSchema` 定义：

```bash
curl -X POST http://localhost:8088/api/mcp/servers/filesystem/tools/read_file/call \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tmp/example.txt"
  }'
```

```json
{
  "success": true,
  "data": {
    "success": true,
    "content": [
      {
        "type": "text",
        "text": "File content here..."
      }
    ],
    "duration": 150,
    "metadata": {
      "toolType": "mcp",
      "source": "filesystem",
      "toolName": "read_file"
    }
  }
}
```

### 自动发现工具调用

如果不确定工具属于哪个服务器，可以使用自动发现模式调用工具。系统会通过工具名称在所有已注册的服务器中查找并调用：

```bash
curl -X POST http://localhost:8088/api/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "read_file",
    "arguments": {
      "path": "/tmp/example.txt"
    }
  }'
```

如果存在同名工具，系统会按注册顺序选择第一个匹配的工具。建议在生产环境中使用指定服务器的调用方式，以避免名称冲突。

### 工具调用错误处理

工具调用可能因多种原因失败，包括参数错误、工具不存在、服务器错误等。错误响应包含错误码和详细信息：

```json
{
  "success": false,
  "error": {
    "code": "TOOL_CALL_FAILED",
    "message": "Tool read_file not found in server filesystem"
  }
}
```

常见错误码包括：`TOOL_CALL_FAILED`（工具调用失败）、`SERVER_NOT_FOUND`（服务器不存在）、`INVALID_CONFIG`（配置无效）和 `TOOL_EXECUTION_ERROR`（工具执行错误）。

## 系统集成

### 核心服务架构

ApexBridge 的 MCP 集成采用分层架构设计，各组件职责明确。`MCPIntegrationService` 作为顶层协调器，负责管理所有服务器实例、处理工具调用请求、协调事件传播。`MCPServerManager` 封装单个服务器的生命周期，包括进程管理、客户端连接和工具发现。`MCPConfigService` 提供配置的持久化存储，确保服务器配置在重启后能够自动恢复。

系统使用 `@modelcontextprotocol/sdk` 实现标准 MCP 协议通信。SDK 核心类型包括 `Client`（MCP 客户端）、`StdioClientTransport`（标准输入输出传输层）、`CallToolResult`（工具调用结果）和 `Tool`（工具定义）。所有通信采用 JSON-RPC 2.0 格式，支持同步请求和异步响应模式。

### 事件系统

MCP 集成模块实现了完整的事件系统，用于监控服务器状态变化和工具调用统计。`MCPIntegrationService` 继承自 `EventEmitter`，支持以下事件类型：`server-status-changed` 在服务器状态变化时触发，包含服务器 ID 和新状态；`tools-changed` 在工具发现更新时触发，用于触发向量索引重建；`tool-called` 在工具执行完成后触发，包含服务器 ID、工具名称、执行结果和耗时统计。

服务器内部状态机定义了完整的生命周期：`not-started`（未启动）→`initializing`（初始化中）→`starting`（启动中）→`running`（运行中）→`stopping`（停止中）→`stopped`（已停止）。异常情况可能触发 `error` 或 `shutting-down` 状态。状态变化会实时广播给所有订阅者，便于前端界面实时更新。

### 与聊天服务集成

ApexBridge 的 `ChatService` 与 MCP 工具深度集成。当用户请求需要调用 MCP 工具时，系统会自动发现合适的工具并执行。工具执行结果会包含在聊天响应中，支持流式和非流式两种模式。

工具发现基于语义搜索，系统会分析用户意图并匹配最相关的 MCP 工具。搜索使用 SurrealDB 向量数据库，计算工具描述与用户查询的余弦相似度。

### 与工具注册表集成

MCP 工具会自动注册到 `ToolRegistry`，与本地技能 (Skills) 和内置工具统一管理。这意味着 MCP 工具可以通过统一的接口访问，无需关心其来源。

工具注册使用 `{serverId}_{toolName}` 格式作为唯一标识符，避免不同服务器间工具名称冲突。注册时同时会生成工具描述向量，用于后续的语义搜索。

### 向量索引与搜索

MCP 工具会自动索引到 SurrealDB 向量数据库，实现语义搜索功能。索引过程在服务器注册时自动进行，无需手动干预。工具的描述、名称和元数据会被转换为向量存储。索引使用余弦相似度计算工具与查询的语义相关性，支持灵活的相似度阈值过滤。

搜索 MCP 工具时，系统会：

1. 将查询文本转换为向量
2. 在向量数据库中搜索相似工具
3. 过滤出 MCP 类型的工具
4. 按相似度排序返回结果

索引维度取决于配置的 Embedding 模型，默认为 1536 维（OpenAI text-embedding-3-small）。

### SurrealDB Schema

MCP 工具在 SurrealDB 中的存储结构定义如下：`id`（MD5 哈希值，格式为 `mcp:{source}:{toolName}`）、`name`（工具名称）、`description`（工具描述）、`tags`（标签数组，包含 `mcp:{source}` 格式标签）、`path`（null，MCP 工具无文件路径）、`version`（null）、`source`（服务器 ID）、`toolType`（固定为 'mcp'）、`metadata`（JSON 字符串，包含 inputSchema 等元数据）、`vector`（向量数组）、`indexedAt`（索引时间戳）。

### 工具转换

系统提供 `convertMcpTool()` 函数将 MCP 工具定义转换为统一的 `Tool.Info` 格式。转换过程包括：生成唯一工具 ID（格式为 `{serverName}_{toolName}`）、提取工具描述和参数模式、创建执行函数包装器以调用 `mcpIntegration.callTool()`。此外还提供辅助函数：`parseMcpResourceUri()` 解析 `mcp://{clientName}/{resourcePath}` 格式的资源 URI、`createMcpToolUri()` 生成工具 URI、`parseMcpToolId()` 从工具 ID 提取服务器名称和工具名称、`cleanMcpToolResult()` 清理工具返回结果中的技术元数据。

## API 参考

### 服务器管理端点

| 方法   | 路径                                 | 描述                          |
| ------ | ------------------------------------ | ----------------------------- |
| GET    | `/api/mcp/servers`                   | 获取所有注册的 MCP 服务器列表 |
| POST   | `/api/mcp/servers`                   | 注册新的 MCP 服务器           |
| GET    | `/api/mcp/servers/:serverId`         | 获取特定 MCP 服务器的详细信息 |
| DELETE | `/api/mcp/servers/:serverId`         | 注销 MCP 服务器               |
| POST   | `/api/mcp/servers/:serverId/restart` | 重启 MCP 服务器               |
| GET    | `/api/mcp/servers/:serverId/status`  | 获取 MCP 服务器状态           |
| GET    | `/api/mcp/servers/:serverId/tools`   | 获取 MCP 服务器的工具列表     |

### 工具调用端点

| 方法 | 路径                                              | 描述                      |
| ---- | ------------------------------------------------- | ------------------------- |
| POST | `/api/mcp/servers/:serverId/tools/:toolName/call` | 调用指定服务器的工具      |
| POST | `/api/mcp/tools/call`                             | 调用 MCP 工具（自动发现） |

### 系统管理端点

| 方法 | 路径                  | 描述              |
| ---- | --------------------- | ----------------- |
| GET  | `/api/mcp/statistics` | 获取 MCP 统计信息 |
| GET  | `/api/mcp/health`     | MCP 健康检查      |

### 请求与响应格式

注册服务器的请求体结构如下：

```typescript
interface MCPServerConfig {
  id: string; // 服务器唯一标识符
  type: "stdio" | "sse" | "websocket"; // 传输类型
  command: string; // 启动命令
  args: string[]; // 命令行参数
  env?: Record<string, string>; // 环境变量
  cwd?: string; // 工作目录
  transportOptions?: Record<string, any>; // 传输选项
}
```

工具调用的请求体结构如下：

```typescript
interface MCPToolCall {
  toolName: string; // 工具名称
  arguments: Record<string, any>; // 工具参数
  serverId?: string; // 服务器 ID（可选，自动发现模式）
}
```

工具调用响应结构如下：

```typescript
interface MCPToolResult {
  success: boolean; // 是否成功
  content: MCPToolContent[]; // 返回内容
  duration: number; // 执行耗时（毫秒）
  metadata?: {
    toolType: "mcp";
    source: string; // 服务器 ID
    toolName: string; // 工具名称
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

interface MCPToolContent {
  type: "text" | "image" | "resource";
  text?: string;
  mimeType?: string;
  data?: string | Uint8Array;
}
```

## 配置说明

### 环境变量

MCP 功能相关的环境变量包括：`EMBEDDING_PROVIDER`（设置 Embedding 模型提供商，默认为 openai）、`EMBEDDING_MODEL`（设置 Embedding 模型名称，默认为 text-embedding-3-small）。此外还需要配置对应 LLM 提供商的 API Key。

### 配置文件

MCP 服务器配置存储在 `config/admin-config.json` 中，但服务器配置通过 API 动态管理。服务器配置持久化存储在 SurrealDB 中，包含服务器 ID、配置 JSON、启用状态和创建/更新时间戳。

### 传输类型配置

当前支持三种传输类型配置，但实现程度不同：

**stdio 传输**适用于本地进程，通过标准输入输出通信。这是当前唯一完全实现的传输类型。配置示例：`type: "stdio"`、`command: "npx"`、`args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]`。服务器进程作为子进程启动，通过 stdin/stdout 进行 JSON-RPC 通信。

**SSE 传输**适用于 HTTP 长连接服务器，通过 Server-Sent Events 通信。配置结构已定义但实现待完善。配置示例：`type: "sse"`、`command: "python"`、`args: ["server.py"]`、`transportOptions: { url: "http://localhost:8080/sse" }`。

**WebSocket 传输**适用于双向实时通信场景。配置结构已定义但实现待完善。配置示例：`type: "websocket"`、`transportOptions: { url: "ws://localhost:8080/ws" }`。

### 服务器生命周期管理

在 ApexBridge 服务器启动时，所有已注册的 MCP 服务器会自动从 SurrealDB 恢复。恢复过程按数据库中服务器的注册顺序依次执行，每个服务器会重新初始化 `MCPServerManager` 实例、建立 MCP 客户端连接、执行工具发现。恢复过程中的任何错误不会阻止其他服务器的加载，系统会记录错误并继续处理下一个服务器。

在服务器关闭时，系统执行优雅关闭流程：向所有 MCP 服务器发送关闭信号、等待服务器完成清理工作（超时 3 秒）、必要时强制终止未响应的进程、关闭 MCP 客户端连接和传输层、清理向量索引和工具缓存。关闭过程按注册顺序逆序执行，确保资源正确释放。

### 监控指标

`MCPServerManager` 维护服务器执行指标，包括：`startTime`（服务器启动时间）、`endTime`（服务器关闭时间）、`totalCalls`（总调用次数）、`successfulCalls`（成功调用次数）、`failedCalls`（失败调用次数）、`averageResponseTime`（平均响应时间）。这些指标可通过 `GET /api/mcp/statistics` 端点获取，用于监控系统健康状况和性能趋势。

### 已知限制

当前版本存在以下已知限制：向量索引失败会静默跳过，不影响服务器注册和工具调用，但可能导致工具语义搜索结果不完整；SSE 和 WebSocket 传输类型已定义配置结构但尚未完整实现。

## 完整示例

### 示例 1：注册文件系统服务器

以下示例展示如何注册并使用 `@modelcontextprotocol/server-filesystem` 服务器：

```bash
# 注册文件系统服务器
curl -X POST http://localhost:8088/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "filesystem",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    "cwd": "/Users/suntc/project/apex-bridge"
  }'

# 检查服务器状态
curl http://localhost:8088/api/mcp/servers/filesystem/status

# 列出可用工具
curl http://localhost:8088/api/mcp/servers/filesystem/tools

# 读取文件
curl -X POST http://localhost:8088/api/mcp/servers/filesystem/tools/read_file/call \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tmp/test.txt"
  }'
```

### 示例 2：注册 GitHub 服务器

使用 MCP GitHub 服务器管理仓库：

```bash
# 注册 GitHub 服务器（需要 GITHUB_TOKEN 环境变量）
curl -X POST http://localhost:8088/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "github",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "your-github-token-here"
    }
  }'

# 搜索仓库
curl -X POST http://localhost:8088/api/mcp/servers/github/tools/search_repositories/call \
  -H "Content-Type: application/json" \
  -d '{
    "query": "apex-bridge",
    "max_results": 5
  }'
```

### 示例 3：批量注册多个服务器

以下脚本演示如何批量注册常用 MCP 服务器：

```bash
#!/bin/bash
# register-mcp-servers.sh

API_URL="http://localhost:8088/api/mcp/servers"

# 文件系统服务器
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "filesystem",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
  }'

# Git 服务器
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "git",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-git"]
  }'

# PostgreSQL 服务器
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "postgres",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgresql"],
    "env": {
      "DATABASE_URL": "postgresql://user:password@localhost:5432/mydb"
    }
  }'

echo "All servers registered!"
```

### 示例 4：健康检查与监控

监控系统健康状态：

```bash
#!/bin/bash
# mcp-monitor.sh

echo "=== MCP 系统健康检查 ==="
curl -s http://localhost:8088/api/mcp/health | jq .

echo -e "\n=== MCP 统计信息 ==="
curl -s http://localhost:8088/api/mcp/statistics | jq .

echo -e "\n=== 服务器状态 ==="
curl -s http://localhost:8088/api/mcp/servers | jq '.data[] | {id: .id, status: .status.phase, tools: (.tools | length)}'
```

## 故障排查

### 服务器无法启动

如果服务器启动失败，首先检查服务器状态：

```bash
curl http://localhost:8088/api/mcp/servers/{serverId}/status
```

常见原因包括：命令不存在或路径错误（确认 command 和 args 正确）、权限不足（检查文件执行权限）、依赖缺失（确保服务器所需依赖已安装）。查看服务器日志获取详细错误信息。

### 工具调用失败

工具调用失败可能由以下原因导致：参数不符合 `inputSchema` 定义（检查工具参数类型和必填字段）、工具不存在（确认工具名称拼写正确）、服务器状态异常（检查服务器 phase 是否为 running）。错误响应会包含具体错误信息。

### 向量索引失败

如果工具无法被语义搜索发现，可能是向量索引失败。索引失败不会阻止工具注册和调用，但会影响工具发现功能。检查服务器启动日志中的 `[MCP] Vectorization failed` 错误信息。常见原因包括 Embedding 服务不可用或向量维度不匹配。

### 性能问题

如果 MCP 调用响应缓慢，考虑以下优化：减少同时运行的服务器数量、检查网络延迟（对于远程服务器）、监控服务器资源使用情况。使用 `GET /api/mcp/statistics` 获取调用统计信息，分析性能瓶颈。

### 数据库问题

如果服务器配置无法持久化或加载失败，检查 SurrealDB 连接配置是否正确。SurrealDB 数据库损坏或不可用时，修复连接后重启服务。

### 日志查看

MCP 相关日志前缀为 `[MCP]`，可以在日志中搜索查看详细运行信息：

```bash
# 查看 MCP 相关日志
tail -f logs/app.log | grep "\[MCP\]"

# 查看特定服务器的日志
tail -f logs/app.log | grep "\[MCP\] filesystem"
```

### 常见错误码

| 错误码                 | 说明               | 解决方案                           |
| ---------------------- | ------------------ | ---------------------------------- |
| `REGISTRATION_FAILED`  | 服务器注册失败     | 检查配置是否正确，服务器是否已存在 |
| `SERVER_NOT_FOUND`     | 服务器不存在       | 确认服务器 ID 正确                 |
| `TOOL_CALL_FAILED`     | 工具调用失败       | 检查参数和服务器状态               |
| `TOOL_EXECUTION_ERROR` | 工具执行错误       | 查看详细错误信息                   |
| `GET_SERVERS_FAILED`   | 获取服务器列表失败 | 检查数据库连接                     |
| `HEALTH_CHECK_FAILED`  | 健康检查失败       | 查看服务器日志                     |

### 获取帮助

如果问题仍未解决，收集以下信息后寻求支持：服务器配置、错误日志、复现步骤、环境信息（Node.js 版本、操作系统）。

```bash
# 收集诊断信息
echo "=== 环境信息 ==="
node --version
uname -a

echo -e "\n=== 服务器列表 ==="
curl -s http://localhost:8088/api/mcp/servers | jq .

echo -e "\n=== 健康状态 ==="
curl -s http://localhost:8088/api/mcp/health | jq .
```

## 最佳实践

### 服务器管理

推荐为每个功能模块创建独立的 MCP 服务器，便于管理和隔离。使用描述性的服务器 ID，如 `filesystem`、`github`、`database` 等。定期检查服务器状态，及时重启或更新异常服务器。

### 工具发现

使用自动发现功能时，确保工具名称具有唯一性，或始终指定服务器 ID。定期审查工具列表，移除不再使用的工具。

### 安全性

敏感信息（如 API Key）通过 `env` 字段传递时，确保环境变量不被泄露。生产环境中使用最小权限原则，只授予必要的访问权限。定期更新 MCP 服务器到最新版本，修复安全漏洞。

### 性能优化

限制并发工具调用数量，避免服务器过载。对于高频调用的工具，考虑添加缓存层。监控服务器资源使用，必要时扩容或优化配置。

### 监控告警

建议配置监控告警，跟踪关键指标包括：服务器状态变化、工具调用失败率、响应时间延迟。设置阈值告警，及时发现和处理异常情况。
