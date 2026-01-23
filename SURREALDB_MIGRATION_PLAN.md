# SurrealDB Migration Plan (Completed)

**Last updated**: 2026-01-23

## Status

SurrealDB migration is complete. SQLite and LanceDB have been removed. SurrealDB is now the sole persistence backend for:

- LLM providers/models
- MCP server config
- Conversation history
- Trajectories
- Vector search

## Final Architecture

```
Storage
├── SurrealDB (all persistence)
└── Redis (cache, optional)
```

## Key Changes

- Removed all SQLite adapters and migrations
- MCPConfigService now uses StorageAdapterFactory
- StorageBackend only supports SurrealDB
- Removed better-sqlite3 dependency

## Verification

Run:

```bash
npm run build
npm run test
```

```sql
-- SurrealDB WebShell checks
SELECT * FROM mcp_servers;
SELECT * FROM llm_providers;
SELECT * FROM llm_models;
SELECT * FROM conversation_messages;
SELECT * FROM trajectories;
SELECT * FROM tool_vectors;
```
