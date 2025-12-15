# ApexBridge

> **AI Bridge Protocol** - 连接 LLM 与工具的轻量级智能桥梁

[![Version](https://img.shields.io/badge/Version-1.0.1-blue)](https://github.com/suntianc/apex-bridge/releases)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Apache--2.0-green.svg)](LICENSE)

```
┌─────────────────────────────────────────────────────────────┐
│                      ApexBridge                              │
├─────────────────────────────────────────────────────────────┤
│   LLM Providers      Skills System      MCP Integration     │
│   ┌───────────┐      ┌───────────┐      ┌───────────┐       │
│   │ OpenAI    │      │ Direct    │      │ stdio     │       │
│   │ DeepSeek  │      │ Internal  │      │ JSON-RPC  │       │
│   │ Zhipu     │      │ Sandbox   │      │ Tools     │       │
│   │ Ollama    │      └───────────┘      └───────────┘       │
│   │ Claude    │              │                │             │
│   └───────────┘              └────────┬───────┘             │
│          │                            │                     │
│          └─────────────┬──────────────┘                     │
│                        │                                    │
│              ┌─────────▼─────────┐                          │
│              │  Unified Search   │  ← LanceDB Vector        │
│              │  (vector-search)  │                          │
│              └─────────┬─────────┘                          │
│                        │                                    │
│              ┌─────────▼─────────┐                          │
│              │   <tool_action>   │  ← Unified Tool Calling  │
│              │   type=skill|mcp  │                          │
│              └───────────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

## What is ApexBridge?

ApexBridge 是一个**轻量级 AI 桥接服务**，让 LLM 与外部工具无缝对话。它不只是一个 API 代理，而是一个完整的智能体框架：

- **多轮思考** - ReAct 策略支持最多 50 轮迭代推理
- **工具发现** - 向量语义搜索自动匹配最佳工具
- **双轨并行** - Skills 本地工具 + MCP 远程工具统一调度
- **流式输出** - WebSocket 实时推送，支持中断

## Quick Start

```bash
# 安装
npm install

# 开发
npm run dev

# 测试
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
```

## Core Features

### 1. Multi-LLM Support

```typescript
// 6 个主流 LLM 提供商，统一适配器接口
const providers = ['openai', 'deepseek', 'zhipu', 'ollama', 'claude', 'custom'];

// 运行时热切换
POST /api/llm/providers
POST /api/llm/providers/:id/models
```

### 2. Skills System

```yaml
# .data/skills/my-skill/SKILL.md
---
name: my-skill
description: A custom skill
kind: Direct
tools:
  - name: execute
    parameters:
      - name: input
        type: string
---
Skill execution instructions...
```

### 3. MCP Integration

```bash
# 注册 MCP 服务器
curl -X POST http://localhost:8088/api/mcp/servers \
  -d '{"id": "minimax", "type": "stdio", "command": "uvx", "args": ["minimax-mcp"]}'

# 工具自动向量化，支持语义搜索
```

### 4. Unified Tool Calling

```xml
<!-- LLM 统一工具调用格式 -->
<tool_action name="web_search" type="mcp">
  <query value="latest AI news" />
</tool_action>

<tool_action name="file-read" type="builtin">
  <path value="/path/to/file" />
</tool_action>

<tool_action name="git-commit-helper" type="skill">
  <message value="feat: add feature" />
</tool_action>
```

### 5. ReAct Strategy

```
用户: "帮我查询北京天气并写入文件"

思考 → 发现工具 → 调用 weather-query → 思考 → 调用 file-write → 完成
  ↑                                                              │
  └──────────────────── 最多 50 轮迭代 ──────────────────────────┘
```

## Architecture

```
src/
├── core/                    # 核心引擎
│   ├── ProtocolEngine.ts    # ABP 协议解析
│   ├── LLMManager.ts        # LLM 适配器管理
│   ├── llm/adapters/        # 6 个 LLM 适配器
│   ├── tool-action/         # 工具调用系统
│   │   ├── ToolActionParser.ts   # <tool_action> 解析
│   │   └── ToolDispatcher.ts     # 类型路由调度
│   └── tools/builtin/       # 内置工具
│
├── services/                # 业务服务
│   ├── ChatService.ts       # 聊天协调器 (~200行)
│   ├── SkillManager.ts      # Skills 管理
│   ├── MCPIntegrationService.ts  # MCP 集成
│   └── ToolRetrievalService.ts   # 向量检索
│
├── strategies/              # 策略模式
│   ├── ReActStrategy.ts     # 多轮思考 (selfThinking=true)
│   └── SingleRoundStrategy.ts    # 单轮快速响应
│
└── api/                     # REST/WebSocket
    ├── controllers/         # 控制器
    ├── routes/              # 路由
    └── websocket/           # 实时通信
```

## API Reference

### Chat API (OpenAI Compatible)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/chat/completions` | 聊天完成 |
| POST | `/v1/chat/simple-stream` | 简化流式 |
| POST | `/v1/interrupt` | 中断请求 |
| GET | `/v1/models` | 模型列表 |

### LLM Config API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/llm/providers` | 提供商管理 |
| GET/POST | `/api/llm/providers/:id/models` | 模型管理 |
| GET | `/api/llm/models/default` | 默认模型 |

### MCP API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/mcp/servers` | 服务器管理 |
| GET | `/api/mcp/servers/:id/tools` | 工具列表 |
| POST | `/api/mcp/tools/call` | 调用工具 |
| GET | `/api/mcp/health` | 健康检查 |

### WebSocket

```javascript
// 连接
ws://localhost:8088/chat/api_key=your-key

// 消息
{ "type": "chat", "data": { "messages": [...] } }
```

## Configuration

```bash
# .env
API_KEY=your-api-key
PORT=8088
LOG_LEVEL=info

# config/admin-config.json - 主配置
# config/system-prompt.md - 系统提示词
```

## Data Storage

| Database | Location | Purpose |
|----------|----------|---------|
| SQLite | `.data/llm_providers.db` | LLM 配置 |
| SQLite | `.data/mcp_servers.db` | MCP 服务器 |
| SQLite | `.data/conversation_history.db` | 对话历史 |
| LanceDB | `.data/vector_store/` | 向量索引 |

## Development

```bash
# 开发服务器
npm run dev

# 构建
npm run build

# 测试
npm test
npm run test:coverage

# 代码质量
npm run lint
npm run format
```

## Design Patterns

| Pattern | Application |
|---------|-------------|
| **Adapter** | LLM 多提供商适配 |
| **Strategy** | ReAct/SingleRound 策略切换 |
| **Factory** | 适配器创建、执行器创建 |
| **Singleton** | ConfigService, EventBus |
| **Observer** | 事件总线、MCP 状态监控 |

## Docs

```
docs/
├── 00-README/           # 项目说明
├── 01-ARCHITECTURE/     # 架构设计
├── 02-IMPLEMENTATION/   # 实现细节
├── 03-CONFIGURATION/    # 配置指南
├── 04-TESTING/          # 测试指南
├── 05-TROUBLESHOOTING/  # 故障排查
├── 06-REFERENCES/       # 参考资料
└── 07-MCP/              # MCP 集成
```

## Tech Stack

- **Runtime**: Node.js ≥ 16
- **Language**: TypeScript 5.0+
- **Framework**: Express.js
- **Database**: SQLite + LanceDB
- **Protocol**: MCP (Model Context Protocol)

## License

[Apache License 2.0](LICENSE)

---

**Made with curiosity and caffeine** | [Issues](https://github.com/suntianc/apex-bridge/issues) | [Discussions](https://github.com/suntianc/apex-bridge/discussions)
