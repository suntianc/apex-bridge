# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ApexBridge** is an AI Protocol Server that connects LLMs with external tools. It provides a complete agent framework with multi-round reasoning (ReAct), tool discovery via vector search, and unified scheduling for local Skills and remote MCP services.

## Common Commands

```bash
# Development
npm run dev          # Start dev server with nodemon
npm run build        # Compile TypeScript
npm run start        # Run compiled server

# Testing
npm run test         # Run Jest tests
npm run test:watch   # Watch mode
npm run test:coverage # With coverage report

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix ESLint issues
npm run format       # Format with Prettier
npm run format:check # Check formatting

# Database
npm run migrations       # Run migrations
npm run migrations:status # Check migration status
npm run migrations:rollback # Rollback migrations
```

## Architecture

```
src/
├── api/              # REST/WebSocket layer (controllers, routes, middleware)
├── core/             # Core engine (LLM adapters, tool-action, playbook)
├── services/         # Business services (ChatService, SkillManager, etc.)
├── strategies/       # Reasoning strategies (ReActStrategy, SingleRoundStrategy)
├── types/            # TypeScript type definitions
├── context/          # Context management
├── config/           # Configuration modules
└── server.ts         # Entry point
```

### Key Layers

- **API Layer**: Express controllers and WebSocket handlers for `/v1/chat/completions` and `/api/mcp/*` endpoints
- **Core Layer**: LLM adapters (6 providers), tool-action parser/dispatcher, variable resolution
- **Services Layer**: ChatService (coordinator), SkillManager, MCPIntegrationService, ToolRetrievalService
- **Strategies Layer**: ReActStrategy for multi-round reasoning, SingleRoundStrategy for fast responses

### Design Patterns

| Pattern | Usage |
|---------|-------|
| **Adapter** | Unified interface for LLM providers (OpenAI, Claude, DeepSeek, Zhipu, Ollama, Custom) |
| **Strategy** | Runtime switch between ReActStrategy (50 iterations) and SingleRoundStrategy |
| **Factory** | Adapter and executor instantiation |
| **Observer** | EventBus for MCP state monitoring |

### Data Storage

- **SQLite**: Structured data (LLM config, MCP servers, chat history)
- **LanceDB**: Vector index for semantic tool matching
- **Redis**: Caching and session management

## Key Entry Points

- [server.ts](src/server.ts) - Application entry point
- [ChatService.ts](src/services/ChatService.ts) - Main chat coordination
- [ReActStrategy.ts](src/strategies/ReActStrategy.ts) - Multi-round reasoning
- [ToolDispatcher.ts](src/core/tool-action/ToolDispatcher.ts) - Tool routing by type (skill/mcp/builtin)
