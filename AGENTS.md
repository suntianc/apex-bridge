# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-15
**Project:** ApexBridge - AI Agent Framework
**Stack:** TypeScript 5.0+ / Node.js 18+ / Express / SQLite / LanceDB

---

## OVERVIEW

ApexBridge is an enterprise-grade AI Agent framework with multi-model support (OpenAI, Claude, DeepSeek, Ollama), MCP protocol integration, and 4-layer context compression (Truncate/Prune/Summary/Hybrid). Entry point is `src/server.ts`, not `index.ts`.

---

## STRUCTURE

```
./
├── src/                      # Source code
│   ├── core/                 # Core engines (Protocol, LLM, adapters)
│   ├── services/             # Business services (Chat, Skills, MCP)
│   ├── strategies/           # Chat strategies (ReAct, SingleRound)
│   ├── api/                  # REST controllers + WebSocket
│   └── utils/                # Utilities (HTTP response, error, stream events)
├── config/                   # JSON config files
├── tests/                    # Unit + integration tests
├── scripts/                  # DB migration + validation scripts
└── .data/                    # SQLite + LanceDB (hidden directory)
```

---

## WHERE TO LOOK

| Task                | Location                                             | Notes                                                           |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Start server        | `src/server.ts`                                      | `npm run dev`                                                   |
| Chat logic          | `src/services/ChatService.ts`                        | Core message processing                                         |
| Context compression | `src/services/context-compression/`                  | 4 strategies (truncate/prune/summary/hybrid)                    |
| LLM adapters        | `src/core/llm/adapters/`                             | OpenAI, Claude, DeepSeek, Ollama                                |
| Tool retrieval      | `src/services/tool-retrieval/`                       | LanceDB vector search                                           |
| MCP integration     | `src/services/MCPIntegrationService.ts`              | MCP protocol client                                             |
| API routes          | `src/api/routes/`                                    | REST endpoints                                                  |
| **Utility modules** | `src/utils/`                                         | HTTP response, error, stream events, request parser, path utils |
| Config              | `config/admin-config.json` + `src/utils/config-*.ts` | JSON-based config                                               |

---

## CODE MAP

| Symbol                      | Type  | Location                                                        | Role                  |
| --------------------------- | ----- | --------------------------------------------------------------- | --------------------- |
| `ApexBridgeServer`          | class | `src/server.ts`                                                 | Main server           |
| `ChatService`               | class | `src/services/ChatService.ts`                                   | Chat orchestrator     |
| `ProtocolEngine`            | class | `src/core/ProtocolEngine.ts`                                    | ABP protocol parser   |
| `LLMManager`                | class | `src/core/LLMManager.ts`                                        | LLM adapter manager   |
| `ReActStrategy`             | class | `src/strategies/ReActStrategy.ts`                               | Multi-round reasoning |
| `ContextCompressionService` | class | `src/services/context-compression/ContextCompressionService.ts` | 4-layer compression   |

---

## CONVENTIONS

- **Quotes**: Single quotes (`'...'`) for TS, double for JSON
- **Semicolons**: Required
- **Indent**: 2 spaces (not 4)
- **Line width**: 100 chars
- **Private members**: `_` prefix (e.g., `_privateMethod`)
- **Imports**: Alphabetical, use `@/` alias → `src/`
- **Comments**: Chinese for public APIs, English for internal
- **Type safety**: NO `as any`, `@ts-ignore`, `@ts-expect-error`
- **Error handling**: NEVER empty catch blocks; use logger
- **TS config**: `noImplicitAny: false`, `strictNullChecks: false` (non-strict)

---

## ANTI-PATTERNS (THIS PROJECT)

- **Empty catch blocks** → Forbidden, always log errors
- `as any`, `@ts-ignore` → Forbidden, use explicit types (51 instances found)
- No `src/index.ts` → Entry is `src/server.ts`
- Config in two places → `config/` AND `src/config/` (confusing)
- `.data/` hidden directory → Contains SQLite + LanceDB
- **Duplicate HTTP response patterns** → Use `src/utils/http-response.ts` (33 violations found)
- **Duplicate error handling** → Use `src/utils/error-utils.ts`
- **Duplicate stream event serialization** → Use `src/utils/stream-events.ts`
- **Duplicate request parsing** → Use `src/utils/request-parser.ts`

### Known Bugs (High Priority)

| Bug                                 | Location                                  | Impact                                                                       |
| ----------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| Context compression never runs      | `ContextCompressionService.ts:137`        | `enabled: true` but `ChatOptions.contextCompression` defaults to `undefined` |
| MCP vectorization failures silent   | `MCPIntegrationService.ts:58-64, 103-109` | Index may be stale without warning                                           |
| ReActStrategy usage tracking broken | `ReActStrategy.ts:149`                    | `usage` field never populated                                                |
| ToolRetrievalService lazy init      | `ToolRetrievalService.ts`                 | Race conditions on startup                                                   |

### Debug Code (Should Be Removed)

| File                        | Lines  |
| --------------------------- | ------ |
| `MessagePreprocessor.ts`    | 32, 59 |
| `server.ts`                 | 248    |
| `VariableEngine.ts`         | 324    |
| `ChatController.ts`         | 79, 94 |
| `ChatCompletionsHandler.ts` | 39     |

---

## COMMANDS

```bash
# Build & Run
npm run dev          # Dev server with nodemon
npm run build        # Compile TypeScript → dist/
npm run start        # Run compiled server

# Testing
npm run test              # Run all tests
npm run test:coverage     # With coverage

# Code Quality
npm run lint         # ESLint
npm run lint:fix     # Auto-fix
npm run format       # Prettier
npm run format:check # Check

# Database
npm run migrations   # Run migrations
```

---

## RECENT REFACTORING (2026-01-15)

### Utility Modules Created

| Module         | File                          | Purpose                                 |
| -------------- | ----------------------------- | --------------------------------------- |
| HTTP Response  | `src/utils/http-response.ts`  | badRequest, notFound, serverError, etc. |
| Stream Events  | `src/utils/stream-events.ts`  | 10 SSE event serializers                |
| Request Parser | `src/utils/request-parser.ts` | parseIdParam, parsePaginationParams     |
| File System    | `src/utils/file-system.ts`    | readJsonFile, writeJsonFile             |
| Error Utils    | `src/utils/error-utils.ts`    | error formatting, type guards           |
| Path Utils     | `src/utils/path-utils.ts`     | SkillPaths, VectorDbPaths               |
| Barrel Export  | `src/utils/index.ts`          | Unified `export *`                      |

### Controllers Migrated

| Controller            | Reduced By | Tools Used                    |
| --------------------- | ---------- | ----------------------------- |
| ChatController.ts     | ~60 lines  | http-response, request-parser |
| ModelController.ts    | ~118 lines | handleErrorWithAutoDetection  |
| ProviderController.ts | ~106 lines | http-response tools           |
| SkillsController.ts   | ~93 lines  | http-response tools           |

---

## NOTES

- Auto-start: Set `APEX_BRIDGE_AUTOSTART=false` to disable
- Config is JSON-based (`config/admin-config.json`), NOT `.env`
- `.env` only for system-level (API keys, port)
- Context compression: 4 strategies, enabled via `contextCompression.enabled`
- MCP servers stored in SQLite, tools indexed in LanceDB
- Entry point is `src/server.ts` (not `index.ts`)
- `opencode/` is a SEPARATE nested project (ignore for main development)
