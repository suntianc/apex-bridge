# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-24
**Commit:** 633ad86
**Branch:** main

---

## OVERVIEW

ApexBridge is an enterprise-grade AI Agent framework with multi-model support (OpenAI, Claude, DeepSeek, Ollama), MCP protocol integration, and 4-layer context compression (Truncate/Prune/Summary/Hybrid). Entry point is `src/server.ts`, NOT `index.ts`.

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
└── scripts/                  # Migration and utility scripts
```

---

## WHERE TO LOOK

| Task                | Location                                             | Notes                                                           |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Start server        | `src/server.ts`                                      | `npm run dev`                                                   |
| Chat logic          | `src/services/ChatService.ts`                        | Core message processing                                         |
| Context compression | `src/services/context-compression/`                  | 4 strategies (truncate/prune/summary/hybrid)                    |
| LLM adapters        | `src/core/llm/adapters/`                             | OpenAI, Claude, DeepSeek, Ollama                                |
| Tool retrieval      | `src/services/tool-retrieval/`                       | SurrealDB vector search                                         |
| MCP integration     | `src/services/MCPIntegrationService.ts`              | MCP protocol client                                             |
| API routes          | `src/api/routes/`                                    | REST endpoints                                                  |
| **Utility modules** | `src/utils/`                                         | HTTP response, error, stream events, request parser, path utils |
| Config              | `config/admin-config.json` + `src/utils/config-*.ts` | JSON-based config                                               |

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
- `as any`, `@ts-ignore` → Forbidden, use explicit types
- **No `src/index.ts`** → Entry is `src/server.ts`
- **Config in two places** → `config/` AND `src/config/` (confusing)
- **Duplicate ChatController** → `api/controllers/ChatController.ts` (1155 lines) AND `api/controllers/chat/ChatController.ts` (461 lines)
- **Legacy SkillManager wrapper** → `services/SkillManager.ts` wrapper re-exports from `services/skill/SkillManager.ts`
- **Mixed TS/JS scripts** → 6 .ts and 14 .js files in `scripts/`

---

## TECHNICAL DEBT

| Issue                            | Status    | Notes                                |
| -------------------------------- | --------- | ------------------------------------ |
| Empty catch blocks in tests      | 🔴PENDING | 4+ violations in ProcessPool.ts      |
| `as any` type assertions         | 🔴PENDING | 130+ violations across files         |
| Duplicate HTTP response patterns | 🔴PENDING | 44+ violations using inline patterns |
| Duplicate ChatController         | 🔴PENDING | Should be consolidated               |
| Config in two places             | 🔴PENDING | `config/` AND `src/config/`          |
| Mixed TS/JS scripts              | 🔴PENDING | Convert .js to .ts                   |

---

## DEBUG CODE (Should Be Removed)

| File                        | Lines  |
| --------------------------- | ------ |
| `MessagePreprocessor.ts`    | 32, 59 |
| `server.ts`                 | 248    |
| `VariableEngine.ts`         | 324    |
| `ChatController.ts`         | 79, 94 |
| `ChatCompletionsHandler.ts` | 39     |

---

## CI/CD ANTI-PATTERNS

| Workflow                               | Issues                                 | Status   |
| -------------------------------------- | -------------------------------------- | -------- |
| `.github/workflows/ci.yml`             | Chinese comments                       | RESOLVED |
| `.github/workflows/release.yml`        | Deprecated actions (create-release@v1) | RESOLVED |
| `.github/workflows/security-tests.yml` | Working-directory inconsistency        | VERIFIED |

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

## NOTES

- Auto-start: Set `APEX_BRIDGE_AUTOSTART=false` to disable
- Config is JSON-based (`config/admin-config.json`), NOT `.env`
- `.env` only for system-level (API keys, port)
- MCP servers stored in SurrealDB, tools indexed in SurrealDB
- `opencode/` is a SEPARATE nested project (ignore for main development)

---

## TEST PATTERNS

| Aspect      | Convention                                       |
| ----------- | ------------------------------------------------ |
| Framework   | Vitest (not Jest)                                |
| File naming | `*.test.ts` (NOT `*.spec.ts`)                    |
| Setup       | Global in `tests/setup.ts`                       |
| Mocking     | ViMock (`vi.mock()`, `vi.spyOn()`)               |
| Structure   | Mirrors source: `tests/unit/[feature]/*.test.ts` |

---

## SUBMODULES

Detailed documentation exists for:

- `src/core/AGENTS.md` - Core engines, Protocol, LLM, adapters
- `src/services/AGENTS.md` - Services layer, Chat, Skills, MCP
- `src/api/AGENTS.md` - API layer, controllers, routes
- `src/utils/AGENTS.md` - Utility modules
- `src/strategies/AGENTS.md` - Strategy patterns
- `src/api/middleware/AGENTS.md` - Middleware
- `src/services/tool-retrieval/AGENTS.md` - Vector search
