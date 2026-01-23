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
├── core/             # Core engine (LLM adapters, tool-action)
├── services/         # Business services (ChatService, SkillManager, etc.)
├── strategies/       # Reasoning strategies (ReActStrategy, SingleRoundStrategy)
├── types/            # TypeScript type definitions
├── context/          # Context management
├── config/           # Configuration modules
└── server.ts         # Entry point
```

## Development Rules

### Code Style (Mandatory)

| Rule                    | Requirement                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **File Length**         | Services/Utils max 500 lines; Components max 300 lines                                    |
| **Nesting Depth**       | Max 4 levels - extract to functions if deeper                                             |
| **Explicit Imports**    | NEVER use `import *` - list imports explicitly                                            |
| **No Type Suppression** | NEVER use `as any`, `@ts-ignore`, `@ts-expect-error`                                      |
| **Naming**              | PascalCase (Components/Services), camelCase (functions), SCREAMING_SNAKE_CASE (constants) |

### Code Quality (Mandatory)

1. **After Every Edit**: Run `lsp_diagnostics` to verify no TypeScript/linting errors
2. **Never Suppress Types**: All exported functions and interfaces must have explicit types
3. **Fix Errors Immediately**: Do not proceed until all checks pass

### Security (Mandatory)

- **NEVER hardcode** API keys, passwords, or credentials in source code
- Use `.env` files for all sensitive configuration
- Maintain `.env.template` with placeholder values
- Use `process.env.VARIABLE_NAME` pattern

### Performance (Mandatory)

- **No N+1 Queries**: Always batch database operations
- **Pagination**: Use limit/offset for large result sets
- **Cleanup**: Properly clean up event listeners, subscriptions in `useEffect` cleanup

### Documentation Sync (Mandatory)

When code changes affect architecture, API, or user behavior:

- Update `docs/API.md` for API changes
- Update `docs/ARCHITECTURE.md` for architecture changes
- Update `.env.template` for new environment variables
- Verify type definitions match actual data models

### Context7 Query (Mandatory)

When using unfamiliar libraries or APIs:

- Query Context7 documentation first
- If unavailable, use GitHub examples
- Inform user before proceeding with implementation

### Refactoring Triggers

Alert user when:

- File exceeds 500 lines (services) or 300 lines (components)
- Duplicate code detected (>3 similar lines)
- Code nesting exceeds 4 levels
- Outdated dependencies or deprecated APIs found

## Key Entry Points

- [server.ts](src/server.ts) - Application entry point
- [ChatService.ts](src/services/ChatService.ts) - Main chat coordination
- [ReActStrategy.ts](src/strategies/ReActStrategy.ts) - Multi-round reasoning
- [ToolDispatcher.ts](src/core/tool-action/ToolDispatcher.ts) - Tool routing by type

## Design Patterns

| Pattern      | Usage                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| **Adapter**  | Unified LLM provider interface (OpenAI, Claude, DeepSeek, Zhipu, Ollama) |
| **Strategy** | Runtime switch between ReActStrategy and SingleRoundStrategy             |
| **Factory**  | Adapter and executor instantiation                                       |
| **Observer** | EventBus for MCP state monitoring                                        |
