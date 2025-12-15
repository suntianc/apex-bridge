# MCP Management API Documentation

ApexBridge MCP (Model Context Protocol) 服务器管理 REST API 文档。

## Base URL

```
http://localhost:3000/api/mcp
```

## 通用响应格式

**成功响应**:
```json
{
  "success": true,
  "data": { ... },
  "meta": { ... }  // 可选
}
```

**错误响应**:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
```

---

## 服务器管理

### 获取服务器列表

获取所有已注册的 MCP 服务器。

```
GET /api/mcp/servers
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "minimax-mcp",
      "status": {
        "phase": "running",
        "message": "Server is running"
      },
      "tools": [
        {
          "name": "web_search",
          "description": "Search the web for information"
        }
      ],
      "lastActivity": "2024-01-15T10:30:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "timestamp": "2024-01-15T10:35:00.000Z"
  }
}
```

---

### 注册服务器

注册新的 MCP 服务器。

```
POST /api/mcp/servers
```

**请求体**:
```json
{
  "id": "minimax-mcp",
  "type": "stdio",
  "command": "uvx",
  "args": ["minimax-mcp"],
  "env": {
    "MINIMAX_API_KEY": "your-api-key",
    "MINIMAX_API_HOST": "https://api.minimaxi.com"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 服务器唯一标识 |
| type | string | 是 | 传输类型，目前支持 `stdio` |
| command | string | 是 | 启动命令 |
| args | string[] | 否 | 命令行参数 |
| env | object | 否 | 环境变量 |

**成功响应** (201):
```json
{
  "success": true,
  "data": {
    "serverId": "minimax-mcp",
    "message": "Server registered successfully"
  }
}
```

**错误响应** (400):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CONFIG",
    "message": "Missing required fields: id, type, command"
  }
}
```

---

### 获取服务器详情

获取特定 MCP 服务器的详细信息。

```
GET /api/mcp/servers/:serverId
```

**路径参数**:
| 参数 | 说明 |
|------|------|
| serverId | 服务器 ID |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "minimax-mcp",
    "status": {
      "phase": "running",
      "message": "Server is running"
    },
    "tools": [
      {
        "name": "web_search",
        "description": "Search the web for information",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": { "type": "string" }
          },
          "required": ["query"]
        }
      }
    ],
    "lastActivity": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### 删除服务器

注销并删除 MCP 服务器。

```
DELETE /api/mcp/servers/:serverId
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "serverId": "minimax-mcp",
    "message": "Server unregistered successfully"
  }
}
```

---

### 重启服务器

重启指定的 MCP 服务器。

```
POST /api/mcp/servers/:serverId/restart
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "serverId": "minimax-mcp",
    "message": "Server restarted successfully"
  }
}
```

---

### 获取服务器状态

获取 MCP 服务器的运行状态。

```
GET /api/mcp/servers/:serverId/status
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "serverId": "minimax-mcp",
    "status": {
      "phase": "running",
      "message": "Server is running",
      "startedAt": "2024-01-15T10:00:00.000Z"
    }
  }
}
```

**状态阶段 (phase)**:
| 值 | 说明 |
|------|------|
| starting | 服务器正在启动 |
| running | 服务器正常运行 |
| stopping | 服务器正在停止 |
| stopped | 服务器已停止 |
| error | 服务器出错 |

---

## 工具管理

### 获取服务器工具列表

获取指定 MCP 服务器提供的所有工具。

```
GET /api/mcp/servers/:serverId/tools
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "serverId": "minimax-mcp",
    "tools": [
      {
        "name": "web_search",
        "description": "Search the web for information",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Search query"
            }
          },
          "required": ["query"]
        }
      },
      {
        "name": "understand_image",
        "description": "Understand image content",
        "inputSchema": {
          "type": "object",
          "properties": {
            "prompt": { "type": "string" },
            "image_source": { "type": "string" }
          },
          "required": ["prompt", "image_source"]
        }
      }
    ],
    "count": 2
  }
}
```

---

### 调用工具 (指定服务器)

在指定的 MCP 服务器上调用工具。

```
POST /api/mcp/servers/:serverId/tools/:toolName/call
```

**路径参数**:
| 参数 | 说明 |
|------|------|
| serverId | 服务器 ID |
| toolName | 工具名称 |

**请求体** (工具参数):
```json
{
  "query": "latest AI news 2024"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "content": "Search results: ..."
  }
}
```

---

### 调用工具 (自动发现)

调用 MCP 工具，系统自动发现工具所在的服务器。

```
POST /api/mcp/tools/call
```

**请求体**:
```json
{
  "toolName": "web_search",
  "arguments": {
    "query": "latest AI news 2024"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| toolName | string | 是 | 工具名称 |
| arguments | object | 否 | 工具参数 |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "content": "Search results: ..."
  }
}
```

---

## 监控与统计

### 获取统计信息

获取 MCP 系统的统计信息。

```
GET /api/mcp/statistics
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "servers": {
      "total": 2,
      "running": 2,
      "stopped": 0,
      "error": 0
    },
    "tools": {
      "total": 5
    },
    "uptime": 3600
  }
}
```

---

### 健康检查

检查 MCP 系统的健康状态。

```
GET /api/mcp/health
```

**健康响应** (200):
```json
{
  "success": true,
  "data": {
    "healthy": true,
    "details": {
      "minimax-mcp": {
        "status": "running",
        "toolCount": 3
      }
    }
  }
}
```

**不健康响应** (503):
```json
{
  "success": false,
  "data": {
    "healthy": false,
    "details": {
      "minimax-mcp": {
        "status": "error",
        "error": "Connection timeout"
      }
    }
  }
}
```

---

## 错误码参考

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| INVALID_CONFIG | 400 | 配置无效或缺少必填字段 |
| REGISTRATION_FAILED | 400 | 服务器注册失败 |
| MISSING_TOOL_NAME | 400 | 缺少工具名称 |
| SERVER_NOT_FOUND | 404 | 服务器不存在 |
| GET_SERVERS_FAILED | 500 | 获取服务器列表失败 |
| GET_SERVER_FAILED | 500 | 获取服务器详情失败 |
| REGISTRATION_ERROR | 500 | 注册过程中发生错误 |
| UNREGISTRATION_ERROR | 500 | 注销过程中发生错误 |
| RESTART_ERROR | 500 | 重启过程中发生错误 |
| GET_STATUS_FAILED | 500 | 获取状态失败 |
| GET_TOOLS_FAILED | 500 | 获取工具列表失败 |
| TOOL_CALL_ERROR | 500 | 工具调用失败 |
| GET_STATISTICS_FAILED | 500 | 获取统计信息失败 |
| HEALTH_CHECK_FAILED | 503 | 健康检查失败 |

---

## 使用示例

### cURL 示例

**注册 MiniMax MCP 服务器**:
```bash
curl -X POST http://localhost:3000/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "minimax-mcp",
    "type": "stdio",
    "command": "uvx",
    "args": ["minimax-mcp"],
    "env": {
      "MINIMAX_API_KEY": "your-api-key"
    }
  }'
```

**调用 web_search 工具**:
```bash
curl -X POST http://localhost:3000/api/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "web_search",
    "arguments": {
      "query": "latest AI news"
    }
  }'
```

**删除服务器**:
```bash
curl -X DELETE http://localhost:3000/api/mcp/servers/minimax-mcp
```

---

## 与 LLM 集成

MCP 工具注册后会自动向量化，可通过 `vector-search` 内置工具发现。LLM 可使用统一的 `<tool_action>` 标签调用：

```xml
<tool_action name="web_search" type="mcp">
  <query value="latest AI news" />
</tool_action>
```

详见 [SKILL_DEVELOPMENT_SPECIFICATION.md](./SKILL_DEVELOPMENT_SPECIFICATION.md) 中的 MCP + Skill 双轨并行架构说明。
