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
- **Legacy SkillManager wrapper** → ✅ RESOLVED - 统一通过 barrel 文件导入
- **Mixed TS/JS scripts** → ✅ RESOLVED (5 .ts files in `scripts/`)
- **Duplicate ChatController** → ✅ RESOLVED - 已通过模块化架构拆分解决

---

## TECHNICAL DEBT

### Critical Issues (Should Fix Immediately)

| Issue                       | Count | Files | Priority | Notes                                        |
| --------------------------- | ----- | ----- | -------- | -------------------------------------------- |
| Empty catch blocks          | 411   | 112   | Critical | ✅ All critical/high fixed, 30+ medium fixed |
| `as any` type assertions    | 0     | 0     | Critical | ✅ RESOLVED - No as any assertions in src    |
| Direct HTTP responses       | 53    | 15    | High     | DRY violations, inconsistent error responses |
| Console statements (source) | 17    | 12    | Medium   | Debug code in production                     |

### Technical Debt (Should Refactor)

| Issue                          | Status     | Files                                                                            | Impact                              |
| ------------------------------ | ---------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| Configuration duplication      | 🔴PENDING  | `config/` + `src/config/`                                                        | Maintenance burden, inconsistencies |
| Duplicate ChatController       | ✅RESOLVED | 通过模块化架构拆分解决 (`controllers/chat/` 目录包含 ChatController + 3个处理器) | ✅ 已解决                           |
| Legacy SkillManager wrapper    | ✅RESOLVED | 统一通过 barrel 文件导入 (8个导入路径已更新)                                     | ✅ 已解决                           |
| TODO comments                  | 🟡PENDING  | 27 items across 13 files                                                         | Technical debt tracking             |
| String-matching error handling | 🟡PENDING  | `ProviderController.ts`, `ModelController.ts`                                    | Brittle error handling, i18n issues |

### Resolved Issues

| Issue                    | Status     | Notes                                          |
| ------------------------ | ---------- | ---------------------------------------------- |
| Empty catch blocks       | ✅RESOLVED | 5 critical + 4 high + 30+ medium fixed         |
| `as any` type assertions | ✅RESOLVED | No as any, @ts-ignore, @ts-expect-error in src |
| Mixed TS/JS scripts      | ✅RESOLVED | 5 .ts files, 1 .sh file                        |
| Nested opencode project  | ✅RESOLVED | Directory does not exist                       |

### Empty Catch Block Details

**✅ RESOLVED - Critical (Promise.catch with empty handlers)**:

- `config-loader.ts:138, 141-143` - ✅ Added error logging
- `ChatChannel.ts:95` - ✅ Added error logging
- `CacheWarmupManager.ts:274, 307` - ✅ Added error logging (2 locations)
- `IndexPrewarmService.ts:190` - ✅ Added error logging

**✅ RESOLVED - High (Parameterless catch with "silent failure" comments)**:

- `redisRateLimiter.ts:126` - ✅ Added error logging
- `config-loader.ts:141, 143` - ✅ Added error logging (2 locations)
- `ContextModeExecutor.ts:233, 391` - ✅ Added error logging
- `RedisService.ts:63` - ✅ Added error logging

**✅ RESOLVED - Medium (Parameterless catch with fallback behavior)** (30+ files):

- `file-system.ts` (4 locations) ✅
- `error-utils.ts` (2 locations) ✅
- `error-serializer.ts` ✅
- `customValidators.ts` ✅
- `ParameterConverter.ts` (2 locations) ✅
- `ToolDispatcher.ts` (2 locations) ✅
- `AllowedToolsValidator.ts` ✅
- `SearchEngine.ts` ✅
- `vector-storage.ts` ✅
- `trajectory.ts` ✅
- `stream-parser.ts` ✅
- `mcpRoutes.ts` ✅
- `MCPToolSupport.ts` ✅
- `SkillIndexer.ts` (3 locations) ✅
- `LifecycleManager.ts` ✅
- `ScriptExecutor.ts` (2 locations) ✅
- `ConversationSaver.ts` ✅
- `ChatService.ts` ✅
- `convert.ts` ✅
- `SkillsSandboxExecutor.ts` (2 locations) ✅
- `ContextModeExecutor.ts:451` ✅
- `ClaudeCodeSkillParser.ts` ✅

### `as any` Violation Details

**✅ RESOLVED** - All `as any` type assertions have been removed from src/ directory.

**Verification**:

- Searched for `as any` patterns: 0 matches (only comment reference in ProtocolEngine.ts)
- Searched for `@ts-ignore`: 0 matches
- Searched for `@ts-expect-error`: 0 matches

The codebase now follows strict TypeScript conventions with no type safety violations in source files.

### Direct HTTP Response Patterns

**Files with violations** (should use `src/utils/http-response.ts`):

- `server.ts:454, 529` - Direct response sending
- Various controllers and route handlers - inline `res.json()` and `res.status().json()` patterns

**Total violations**: 53+ (35 `res.json()` + 18 `res.status().json()`)

### TODO Comments

**Found 27 items across 13 files**:

- `BuiltInToolsRegistry.ts:68` - "注册其他内置工具"
- `AllowedToolsValidator.test.ts:347` - "Fix Vitest module reset behavior"
- `SurrealDBClient.test.ts:108, 155, 191` - "Fix Vitest mock behavior" (3 locations)
- Multiple test files with DEBUG_TESTS environment variable checks

### Console Statement Usage (Source Code)

**Found ~17 console statements in source code**:

- `server.ts:18, 23` - Fatal error logging (should use logger)
- `PlatformDetectorTool.ts:360` - Debug console.log

---

## DEBUG CODE (Should Be Removed)

| File                        | Lines  | Status                                                     |
| --------------------------- | ------ | ---------------------------------------------------------- |
| `VariableEngine.ts`         | 324    | ⚠️ Remove - Cache hit logging                              |
| `ChatCompletionsHandler.ts` | 39     | ⚠️ Remove - Validation warning logging                     |
| `server.ts`                 | 248    | ✅ Verified - Legitimate middleware setup (NOT debug code) |
| `MessagePreprocessor.ts`    | 32, 59 | ✅ Verified - Legitimate business logic (NOT debug code)   |
| `ChatController.ts`         | 79, 94 | ✅ Verified - Legitimate API handlers (NOT debug code)     |

**Note**: Some previously listed "debug code" has been verified as legitimate business logic.
The only confirmed debug logging that should be removed is in VariableEngine.ts and ChatCompletionsHandler.ts.

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
