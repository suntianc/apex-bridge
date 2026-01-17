# AGENTS.md - src/core

**Generated:** 2026-01-17
**Core engines** - ProtocolEngine, LLMManager, adapters, EventBus, AceCore.

## WHERE TO LOOK

| Component | File                            | Purpose                                                          |
| --------- | ------------------------------- | ---------------------------------------------------------------- |
| Protocol  | `ProtocolEngine.ts`             | ABP protocol orchestration, RAG service, VariableEngine          |
| Parser    | `protocol/ABPProtocolParser.ts` | ABP JSON/text parsing, noise stripping, boundary validation      |
| LLM       | `LLMManager.ts`                 | Multi-provider adapter management, model registry, caching       |
| Adapters  | `llm/adapters/`                 | OpenAI, Claude, DeepSeek, Ollama, Custom, Zhipu implementations  |
| Stream    | `stream-orchestrator/`          | ReAct engine pool, tool executor, LLM adapter wrapper            |
| Events    | `EventBus.ts`                   | Singleton event emitter for cross-layer communication            |
| ACE       | `ace/AceCore.ts`                | Agent cognition engine: sessions, scratchpads, reflection cycles |
| Variables | `variable/VariableEngine.ts`    | Template variable substitution                                   |
| Tools     | `tool-action/`                  | Tool dispatcher, parameter converter, error handler              |
| Builtins  | `tools/builtin/`                | Vector search, file read/write, platform detector, skill reader  |

## KEY PATTERNS

- **Adapters**: Extend `BaseOpenAICompatibleAdapter`, implement `ILLMAdapter` interface
- **EventBus**: Singleton via `getInstance()`, northbound/southbound emitters in AceCore
- **Concurrency**: AceCore uses `ReadWriteLock` for session/scratchpad protection
- **Caching**: LLMManager两级缓存（提供商级+模型级），带TTL和LRU驱逐
- **Storage**: Multi-adapter layer with SQLite, SurrealDB, LanceDB support

## ANTI-PATTERNS (THIS SUBDIR)

- **Nested `opencode/` project**: Separate npm project causes import confusion and build issues
- **Storage migration in progress**: Phase 2/6 - dual-write patterns with SQLite/SurrealDB/LanceDB
- **Debug code present**: VariableEngine.ts:324 has debug code that should be removed
