# AGENTS.md - src/services

**Generated:** 2026-01-17
**Services layer** - Chat, Skills, MCP, ToolRetrieval, ContextCompression.

## WHERE TO LOOK

| Task                | Location                   | Notes                                                        |
| ------------------- | -------------------------- | ------------------------------------------------------------ |
| Chat orchestration  | `ChatService.ts`           | Message processing, streaming, compression integration       |
| Context compression | `context-compression/`     | 4 strategies (truncate/prune/summary/hybrid), TokenEstimator |
| Skills lifecycle    | `SkillManager.ts`          | Install/uninstall/update via ZIP, integrates ToolRetrieval   |
| MCP integration     | `MCPIntegrationService.ts` | Server management, tool discovery/execution                  |
| Vector search       | `tool-retrieval/`          | LanceDB for tool/skill retrieval, embedding generation       |
| Chat helpers        | `chat/`                    | MessagePreprocessor, ConversationSaver, StrategySelector     |
| Tool execution      | `executors/`               | SkillsSandboxExecutor, BuiltInExecutor, ToolExecutor         |

## KEY STRUCTURES

**ChatService**

- `processMessage()` - Main entry, orchestrates strategy + compression
- `streamMessage()` - AsyncIterator for streaming responses
- `createChatCompletion()` / `createStreamChatCompletion()` - WebSocket adapters

**ContextCompressionService**

- `compress()` - OpenCode decision mechanism: protected prune → summary → strategy fallback
- `getStrategy()` - Caches strategy instances (truncate/prune/summary/hybrid)
- `defaultConfig.enabled: true` (line 137)

**SkillManager**

- `installSkill()` - ZIP extraction → validation → vectorization → ToolRegistry
- `listSkills()` - Pagination, filtering by name/tags, sorting
- `executeDirect()` - Direct SKILL.md content return (FR-37~40)

**MCPIntegrationService**

- `registerServer()` - Spawns MCPServerManager, vectors tools, registers to ToolRegistry
- `callTool()` - Auto-discovers tools via index, handles errors gracefully
- `loadServersFromDatabase()` - Restores MCP servers on startup

**ToolRetrievalService** (`tool-retrieval/`)

- `findRelevantSkills()` - LanceDB semantic search with threshold filtering
- `indexTools()` - Batch tool indexing (skills + MCP)
- `scanAndIndexAllSkills()` - Initial skills directory scan on startup

## CONVENTIONS

- Same as root: single quotes, 2-space indent, semicolons, 100-char width
- Private members: `_` prefix (e.g., `_strategyCache`)
- Comments: Chinese for public APIs, English for internal
- Error handling: NEVER empty catch blocks; use logger

## ANTI-PATTERNS (THIS SUBDIR)

- **ContextCompressionService** default `enabled: true` (line 137) but `ChatOptions.contextCompression` defaults to `undefined` → compression never runs unless explicitly set in options
- **ToolRetrievalService** singleton instance created on first `getToolRetrievalService()` call - not initialized until first use
- **MCPIntegrationService** vectorization failures are swallowed (lines 58-64, 103-109) - index may be stale without warning
- **Empty catch blocks**: ProcessPool.ts:410 has `.catch(() => {})` violation
