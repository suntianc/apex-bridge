# AGENTS.md - src/services/tool-retrieval

Vector search & tool embedding using LanceDB.

## WHERE TO LOOK

| Component      | File                      | Role                                                                   |
| -------------- | ------------------------- | ---------------------------------------------------------------------- |
| Search logic   | `SearchEngine.ts`         | Vector similarity search, threshold filtering, result formatting       |
| Embedding gen  | `EmbeddingGenerator.ts`   | LLM embedding via `LLMManager.embed()`, lazy import pattern            |
| Skill indexing | `SkillIndexer.ts`         | Scan SKILL.md files, `.vectorized` file tracking, MD5 change detection |
| MCP tools      | `MCPToolSupport.ts`       | MCP tool indexing, tag extraction (`mcp:{source}`)                     |
| DB connection  | `LanceDBConnection.ts`    | LanceDB connect, IVF_PQ index, schema migration                        |
| Main service   | `ToolRetrievalService.ts` | Orchestrates search + indexing, singleton pattern                      |

## KEY PATTERNS

**Vector Search Flow**

```
query → EmbeddingGenerator.generateForText() → SearchEngine.search() → LanceDB query(nearestTo)
```

**Skill Indexing**

```
SKILL.md (YAML frontmatter) → md5 hash → .vectorized file → LanceDB upsert
```

**Lazy Import (circular dependency avoidance)**

```typescript
let llmManagerInstance: unknown = null;
// Then in method: const { LLMManager } = await import('../../core/LLMManager');
```

**Table Schema (Arrow)**

```
id, name, description, tags[], path, version, source, toolType, metadata, vector[], indexedAt
```

## CONVENTIONS

Same as root: single quotes, 2-space indent, semicolons, 100-char width, `_` prefix for private.

## ANTI-PATTERNS (THIS SUBDIR)

- **Requires EMBEDDING_PROVIDER + EMBEDDING_MODEL** env vars or SQLite LLMConfig lookup
- **Singleton instantiation**: `ToolRetrievalService.getInstance()` creates on first call - no lazy initialization hook
- **Vector dimensions mismatch**: LanceDB recreates table if embedding dimensions change
- **Silent vectorization failures**: `MCPToolSupport` errors are logged but don't block tool registration
