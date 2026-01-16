# SurrealDB Migration Staging Verification Checklist

This checklist guides the team through staging verification of the SurrealDB migration.
Follow the phases in order and ensure each phase is stable before proceeding.

## Prerequisites

Before starting verification, ensure:

- [ ] Staging environment is accessible and configured
- [ ] SurrealDB instance is running and accessible
- [ ] Test data is available in staging database
- [ ] Monitoring tools are configured (logs, metrics)
- [ ] Team members are notified of the verification schedule
- [ ] Rollback procedure is documented and tested

---

## Phase 2: Low-Risk Domain Verification

### Day 1: Enable MCPConfig Dual-Write

**Objective:** Verify dual-write for MCP configuration data

| Step | Action                                              | Expected Result                      | Status |
| ---- | --------------------------------------------------- | ------------------------------------ | ------ |
| 1    | Deploy code to staging                              | Deployment successful                | [ ]    |
| 2    | Enable: `export APEX_SURREALDB_MCP_DUAL_WRITE=true` | Variable set                         | [ ]    |
| 3    | Restart ApexBridge service                          | Service restarts without errors      | [ ]    |
| 4    | Create new MCP Server via API                       | MCP Server created in SQLite         | [ ]    |
| 5    | Verify data in SQLite                               | Record exists in `mcp_servers` table | [ ]    |
| 6    | Verify data in SurrealDB                            | Record exists in `mcp_server` table  | [ ]    |
| 7    | Update MCP Server                                   | Changes saved to SQLite              | [ ]    |
| 8    | Verify update in SurrealDB                          | Changes reflected in SurrealDB       | [ ]    |
| 9    | Delete MCP Server                                   | Record removed from SQLite           | [ ]    |
| 10   | Verify deletion in SurrealDB                        | Record removed from SurrealDB        | [ ]    |
| 11   | Monitor for 24 hours                                | Error rate < 0.1%                    | [ ]    |
| 12   | Check dual-write logs                               | No persistent errors                 | [ ]    |

**Verification Commands:**

```bash
# Check MCP servers in SQLite
sqlite3 .data/apex.db "SELECT * FROM mcp_servers;"

# Check MCP servers in SurrealDB
curl -X POST "ws://localhost:8000/sql" \
  -H "NS: apexbridge" \
  -H "DB: staging" \
  -d "SELECT * FROM type::table('mcp_server');"
```

### Day 2: Enable Trajectory Dual-Write

**Objective:** Verify dual-write for trajectory/usage tracking data

| Step | Action                                                     | Expected Result                    | Status |
| ---- | ---------------------------------------------------------- | ---------------------------------- | ------ |
| 1    | Enable: `export APEX_SURREALDB_TRAJECTORY_DUAL_WRITE=true` | Variable set                       | [ ]    |
| 2    | Restart ApexBridge service                                 | Service restarts without errors    | [ ]    |
| 3    | Execute chat requests (5-10)                               | Trajectory data generated          | [ ]    |
| 4    | Verify trajectory in SQLite                                | Records exist in trajectory tables | [ ]    |
| 5    | Verify trajectory in SurrealDB                             | Records exist in trajectory tables | [ ]    |
| 6    | Monitor for 24 hours                                       | Error rate < 0.1%                  | [ ]    |
| 7    | Check data consistency                                     | Counts match between databases     | [ ]    |

**Verification Commands:**

```bash
# Run the verification script
./scripts/verify-migration.sh --quick

# Check trajectory counts
sqlite3 .data/apex.db "SELECT COUNT(*) FROM trajectory;"

curl -X POST "ws://localhost:8000/sql" \
  -H "NS: apexbridge" \
  -H "DB: staging" \
  -d "SELECT COUNT(*) FROM type::table('trajectory');"
```

---

## Phase 3: High-Risk Domain Verification

### Day 3-4: Enable LLMConfig Dual-Write

**Objective:** Verify dual-write for LLM configuration (providers, models)

| Step | Action                                                     | Expected Result                 | Status |
| ---- | ---------------------------------------------------------- | ------------------------------- | ------ |
| 1    | Enable: `export APEX_SURREALDB_LLM_CONFIG_DUAL_WRITE=true` | Variable set                    | [ ]    |
| 2    | Restart ApexBridge service                                 | Service restarts without errors | [ ]    |
| 3    | Create new Provider via API                                | Provider created in SQLite      | [ ]    |
| 4    | Create new Model via API                                   | Model created in SQLite         | [ ]    |
| 5    | Verify provider in SurrealDB                               | Provider record exists          | [ ]    |
| 6    | Verify model in SurrealDB                                  | Model record exists             | [ ]    |
| 7    | Update Provider configuration                              | Changes saved                   | [ ]    |
| 8    | Update Model configuration                                 | Changes saved                   | [ ]    |
| 9    | Verify updates in SurrealDB                                | All changes reflected           | [ ]    |
| 10   | Run provider/model API tests                               | All tests pass                  | [ ]    |
| 11   | Monitor for 24 hours                                       | No data corruption              | [ ]    |
| 12   | Check consistency verification                             | All checks pass                 | [ ]    |

**Verification Commands:**

```bash
# Create test provider
curl -X POST http://localhost:8088/api/llm/providers \
  -H "Content-Type: application/json" \
  -d '{"provider": "test", "name": "Test Provider", "enabled": true}'

# Check dual-write status
./scripts/verify-migration.sh --full | grep -A5 "Data Consistency"
```

### Day 5-6: Enable Conversation Dual-Write

**Objective:** Verify dual-write for conversation history

| Step | Action                                                       | Expected Result                 | Status |
| ---- | ------------------------------------------------------------ | ------------------------------- | ------ |
| 1    | Enable: `export APEX_SURREALDB_CONVERSATION_DUAL_WRITE=true` | Variable set                    | [ ]    |
| 2    | Restart ApexBridge service                                   | Service restarts without errors | [ ]    |
| 3    | Send chat request with history                               | Conversation created            | [ ]    |
| 4    | Send follow-up message                                       | History preserved               | [ ]    |
| 5    | Verify conversation in SQLite                                | Records exist                   | [ ]    |
| 6    | Verify conversation in SurrealDB                             | Records exist and match         | [ ]    |
| 7    | Test conversation retrieval                                  | Historical messages retrieved   | [ ]    |
| 8    | Monitor for 24 hours                                         | Error rate < 0.1%               | [ ]    |
| 9    | Check message ordering                                       | Messages in correct order       | [ ]    |

**Verification Commands:**

```bash
# Send test conversation
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, this is a test"}
    ],
    "stream": false
  }'

# Verify conversation data
curl -X POST "ws://localhost:8000/sql" \
  -H "NS: apexbridge" \
  -H "DB: staging" \
  -d "SELECT * FROM type::table('conversation') LIMIT 5;"
```

---

## Phase 4: Vector Storage Migration

### Day 7-9: Enable Vector Dual-Write

**Objective:** Verify dual-write for vector storage (tools, skills)

| Step | Action                                                 | Expected Result                 | Status |
| ---- | ------------------------------------------------------ | ------------------------------- | ------ |
| 1    | Enable: `export APEX_SURREALDB_VECTOR_DUAL_WRITE=true` | Variable set                    | [ ]    |
| 2    | Restart ApexBridge service                             | Service restarts without errors | [ ]    |
| 3    | Run: `npm run migrate:vectors`                         | Migration completes             | [ ]    |
| 4    | Verify vector counts in LanceDB                        | Count preserved                 | [ ]    |
| 5    | Verify vector counts in SurrealDB                      | Count matches LanceDB           | [ ]    |
| 6    | Run retrieval tests                                    | Recall rate >= 94%              | [ ]    |
| 7    | Test semantic search                                   | Results relevant                | [ ]    |
| 8    | Monitor for 72 hours                                   | Error rate < 0.5%               | [ ]    |
| 9    | Check vector dual-write logs                           | No persistent errors            | [ ]    |

**Verification Commands:**

```bash
# Count vectors in LanceDB
ls -la .data/lancedb/*.parquet | wc -l

# Count vectors in SurrealDB
curl -X POST "ws://localhost:8000/sql" \
  -H "NS: apexbridge" \
  -H "DB: staging" \
  -d "SELECT COUNT(*) FROM type::table('vector');"

# Test retrieval
curl -X POST http://localhost:8088/api/tools/search \
  -H "Content-Type: application/json" \
  -d '{"query": "file operations", "limit": 5}'
```

### Day 10-12: Enable Vector Read-Write Split (Optional)

**Objective:** Verify read-write split for vector operations

| Step | Action                                               | Expected Result                 | Status |
| ---- | ---------------------------------------------------- | ------------------------------- | ------ |
| 1    | Enable: `export APEX_SURREALDB_VECTOR_RW_SPLIT=true` | Variable set                    | [ ]    |
| 2    | Restart ApexBridge service                           | Service restarts without errors | [ ]    |
| 3    | Verify reads come from SurrealDB                     | Read queries target SurrealDB   | [ ]    |
| 4    | Verify writes go to LanceDB                          | Write operations target LanceDB | [ ]    |
| 5    | Test fallback on error                               | Reads fallback to LanceDB       | [ ]    |
| 6    | Monitor for 72 hours                                 | No data loss                    | [ ]    |
| 7    | Compare performance metrics                          | Latency within baseline         | [ ]    |

**Verification Commands:**

```bash
# Check logs for read/write routing
grep -i "vector.*read\|vector.*write" logs/apex-bridge.log | tail -20

# Test fallback by stopping SurrealDB temporarily
# Verify reads still work from LanceDB
```

---

## Final Verification

Before production deployment, complete these checks:

### Data Integrity

| Check                 | Method            | Threshold    | Status |
| --------------------- | ----------------- | ------------ | ------ |
| No data corruption    | Manual inspection | 0 corruption | [ ]    |
| No data loss          | Count comparison  | 0 loss       | [ ]    |
| Referential integrity | Constraint checks | 0 violations | [ ]    |
| Index consistency     | Query performance | Optimal      | [ ]    |

### Performance

| Check             | Method             | Threshold    | Status |
| ----------------- | ------------------ | ------------ | ------ |
| Response latency  | P95 API latency    | < 500ms      | [ ]    |
| Query performance | Vector search time | < 100ms      | [ ]    |
| Throughput        | Requests/second    | Baseline met | [ ]    |
| Memory usage      | RSS size           | < 2GB        | [ ]    |

### Monitoring & Observability

| Check                   | Status |
| ----------------------- | ------ |
| All metrics exported    | [ ]    |
| Alerts configured       | [ ]    |
| Dashboards updated      | [ ]    |
| Log aggregation working | [ ]    |

### Rollback Test

| Check                     | Status |
| ------------------------- | ------ |
| Rollback procedure tested | [ ]    |
| Rollback time measured    | [ ]    |
| Data recovery verified    | [ ]    |

---

## Troubleshooting Guide

### Common Issues

#### Issue: SurrealDB connection refused

**Symptoms:** `WebSocket connection failed` errors in logs

**Solution:**

```bash
# Check if SurrealDB is running
docker ps | grep surrealdb

# Restart SurrealDB
docker restart surrealdb

# Verify connection
curl ws://localhost:8000/status
```

#### Issue: Dual-write errors

**Symptoms:** High rate of dual-write failure logs

**Solution:**

1. Check SurrealDB logs for detailed errors
2. Verify schema compatibility
3. Increase retry interval: `APEX_CONSISTENCY_CHECK_INTERVAL_MS=120000`
4. Check rate limiting on SurrealDB

#### Issue: Vector count mismatch

**Symptoms:** LanceDB and SurrealDB vector counts differ

**Solution:**

```bash
# Re-run migration
npm run migrate:vectors -- --force

# Manual sync for missing vectors
curl -X POST "ws://localhost:8000/sql" \
  -H "NS: apexbridge" \
  -H "DB: staging" \
  -d "INSERT INTO type::table('vector') * FROM <migration query>;"
```

#### Issue: Performance degradation

**Symptoms:** Increased latency after enabling SurrealDB

**Solution:**

1. Check SurrealDB resource usage
2. Add connection pooling
3. Reduce dual-write scope temporarily
4. Enable query caching

### Emergency Contacts

| Role           | Contact        | Notes                 |
| -------------- | -------------- | --------------------- |
| Tech Lead      | @team-lead     | Primary escalation    |
| DevOps         | @devops-oncall | Infrastructure issues |
| Database Admin | @dba-team      | SurrealDB specific    |
| Security       | @security-team | Data breach concerns  |

---

## Sign-Off

After completing all verification steps, obtain approvals:

| Role          | Name               | Date         | Signature          |
| ------------- | ------------------ | ------------ | ------------------ |
| Tech Lead     | ********\_******** | ****\_\_**** | ********\_******** |
| QA Lead       | ********\_******** | ****\_\_**** | ********\_******** |
| DevOps Lead   | ********\_******** | ****\_\_**** | ********\_******** |
| Product Owner | ********\_******** | ****\_\_**** | ********\_******** |

---

## Quick Reference

### Environment Variables

```bash
# Phase 2
export APEX_SURREALDB_MCP_DUAL_WRITE=true
export APEX_SURREALDB_TRAJECTORY_DUAL_WRITE=true

# Phase 3
export APEX_SURREALDB_LLM_CONFIG_DUAL_WRITE=true
export APEX_SURREALDB_CONVERSATION_DUAL_WRITE=true

# Phase 4
export APEX_SURREALDB_VECTOR_DUAL_WRITE=true
export APEX_SURREALDB_VECTOR_RW_SPLIT=true

# Master switch
export APEX_SURREALDB_ENABLED=true
```

### Key Commands

```bash
# Run verification
./scripts/verify-migration.sh --quick
./scripts/verify-migration.sh --full

# Check SurrealDB status
curl ws://localhost:8000/status
curl ws://localhost:8000/version

# Query SurrealDB
curl -X POST "ws://localhost:8000/sql" \
  -H "NS: apexbridge" \
  -H "DB: staging" \
  -d "SELECT * FROM type::table('provider');"

# View logs
tail -f logs/apex-bridge.log | grep -i error
```

### Related Documentation

- [Architecture Overview](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [Release Checklist](docs/release-checklist.md)
- [Performance Guide](docs/performance-guide.md)
