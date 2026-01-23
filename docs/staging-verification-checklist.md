# Staging Verification Checklist (SurrealDB Only)

This checklist verifies staging after removing SQLite. All persistence uses SurrealDB.

## Prerequisites

- [ ] SurrealDB is running and reachable
- [ ] Namespace and database exist
- [ ] Environment variables for SurrealDB are configured
- [ ] Staging data seeded (optional)

## Phase 1: MCP Config

| Step | Action                      | Expected Result            | Status |
| ---- | --------------------------- | -------------------------- | ------ |
| 1    | Register MCP server via API | Server stored in SurrealDB | [ ]    |
| 2    | Update MCP server config    | Update persisted           | [ ]    |
| 3    | Delete MCP server           | Record removed             | [ ]    |

Verification (SurrealDB WebShell):

```sql
SELECT * FROM mcp_servers;
```

## Phase 2: LLM Config

| Step | Action                  | Expected Result              | Status |
| ---- | ----------------------- | ---------------------------- | ------ |
| 1    | Create provider via API | Provider stored in SurrealDB | [ ]    |
| 2    | Create model via API    | Model stored in SurrealDB    | [ ]    |
| 3    | Update provider/model   | Updates persisted            | [ ]    |

Verification:

```sql
SELECT * FROM llm_providers;
SELECT * FROM llm_models;
```

## Phase 3: Conversation History

| Step | Action             | Expected Result  | Status |
| ---- | ------------------ | ---------------- | ------ |
| 1    | Send chat requests | Messages stored  | [ ]    |
| 2    | Fetch history      | Results returned | [ ]    |

Verification:

```sql
SELECT * FROM conversation_messages;
```

## Phase 4: Trajectories

| Step | Action             | Expected Result     | Status |
| ---- | ------------------ | ------------------- | ------ |
| 1    | Run task flows     | Trajectories stored | [ ]    |
| 2    | Query trajectories | Results returned    | [ ]    |

Verification:

```sql
SELECT * FROM trajectories;
```

## Phase 5: Vector Search

| Step | Action                 | Expected Result  | Status |
| ---- | ---------------------- | ---------------- | ------ |
| 1    | Trigger skill indexing | Vectors stored   | [ ]    |
| 2    | Run search queries     | Results returned | [ ]    |

Verification:

```sql
SELECT * FROM tool_vectors;
```

## Final Checks

- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] Server starts without SQLite dependencies
