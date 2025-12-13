# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- OPENSPEC:START -->
## OpenSpec Instructions

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding
<!-- OPENSPEC:END -->

## Project Overview

ApexBridge is a lightweight ABP (AI Bridge Protocol) chat service focused on LLM integration. Key features:
- Multi-LLM provider support (OpenAI, DeepSeek, Zhipu, Ollama) via adapter pattern
- Skills system for tool execution (Direct/Internal execution types)
- Strategy pattern for chat processing (ReAct multi-round thinking, SingleRound fast response)
- WebSocket real-time streaming with interrupt support
- SQLite-based LLM configuration management

## Common Commands

```bash
# Development
npm run dev              # Start dev server with hot reload (nodemon + ts-node)
npm run build            # TypeScript compilation
npm start                # Run compiled dist/server.js

# Testing
npm test                 # Run all Jest tests
npm run test:watch       # Watch mode for development
npm run test:coverage    # Generate coverage report
npm test -- <pattern>    # Run specific test (e.g., npm test -- ReActStrategy)

# Code Quality
npm run lint             # ESLint check
npm run lint:fix         # Auto-fix lint issues
npm run format           # Prettier format all files
npm run format:check     # Check formatting without changes

# Build
npm run build:all        # Build server + admin panel
npm run clean            # Remove dist directory
```

## Architecture

### Core Engines (`src/core/`)
- **ProtocolEngine** - ABP protocol parsing, tool call handling via Skills mapping, variable resolution
- **LLMManager** - Multi-provider adapter pattern, streaming support, retry with exponential backoff
- **VariableEngine** (`src/core/variable/`) - Dynamic variable resolution (time, environment, placeholders)
- **EventBus** - Internal event system

### Service Layer (`src/services/`)
- **ChatService** - Main orchestrator using strategy pattern (~200 lines after refactor)
- **SessionManager** - Conversation lifecycle, metadata management
- **RequestTracker** - Active request tracking, interrupt handling
- **LLMConfigService** - SQLite-based provider/model configuration
- **ConversationHistoryService** - Chat history persistence

### Strategy Layer (`src/strategies/`)
- **ChatStrategy** interface - Contract for chat strategies
- **ReActStrategy** - Multi-round thinking with tool calls (`options.selfThinking.enabled = true`)
- **SingleRoundStrategy** - Fast single response (default)

### API Layer (`src/api/`)
- **controllers/** - REST endpoints (Chat: `/v1/chat/completions`, LLM config: `/api/llm/*`)
- **websocket/** - WebSocket manager for streaming
- **middleware/** - 15+ middlewares (auth, rate limit, validation, security)

### Data Flow
```
Request → Controller → ChatService → Strategy Selection → LLMManager → Provider Adapter
                                  ↓
                           ProtocolEngine (tool calls) → Skills System
```

## Key Patterns

### Adding a New LLM Provider
1. Create adapter in `src/core/llm/adapters/`
2. Implement the adapter interface with `chat()` and `chatStream()` methods
3. Register in `LLMManager.initializeAdapters()`
4. Add configuration via `/api/llm/providers` endpoint

### Adding a New Chat Strategy
```typescript
// src/strategies/NewStrategy.ts
export class NewStrategy implements ChatStrategy {
  supports(options: ChatOptions): boolean { /* condition */ }
  async execute(messages: Message[], options: ChatOptions): Promise<ChatResult> { /* logic */ }
}

// Register in ChatService constructor
this.strategies = [...existing, new NewStrategy(...)];
```

### Skills Development
Skills are defined in `skills/` directories with:
- `SKILL.md` - Frontmatter with ABP config (tools/kind/parameters), body with execution instructions
- `scripts/execute.ts` - Execution entry point (default export)
- Execution types: **Direct** (local sync), **Internal** (core system built-in)

## Naming Conventions
- **Classes**: PascalCase (`ProtocolEngine`, `LLMManager`)
- **Functions/Variables**: camelCase (`loadConfig`, `systemPrompt`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_TIMEOUT`, `MAX_RETRIES`)
- **Files**: kebab-case (`protocol-engine.ts`, `chat-controller.ts`)

## Configuration
- Main config: `config/admin-config.json`
- LLM providers stored in SQLite: `data/llm_providers.db`
- Environment variables via `.env` (copy from `env.template`)

## Important Files
- `src/server.ts` - Application entry point
- `src/core/ProtocolEngine.ts` - Core ABP protocol handling
- `src/core/LLMManager.ts` - LLM provider orchestration
- `src/services/ChatService.ts` - Chat service with strategy pattern
- `src/strategies/ReActStrategy.ts` - Multi-round thinking implementation
