# LanceDB Deprecation Notice

## Timeline

| Date       | Milestone                                         |
| ---------- | ------------------------------------------------- |
| 2026-01-15 | SurrealDB vector storage implementation completed |
| 2026-01-16 | Phase 4 migration begins (dual-write)             |
| TBD        | Complete migration, remove LanceDB dependency     |

## Overview

ApexBridge is migrating vector storage from LanceDB to SurrealDB as part of the SurrealDB migration plan. This document outlines the migration strategy, timeline, and impact on existing deployments.

## Migration Strategy

### Phase 4: Vector Storage Migration (IN PROGRESS)

1. **Dual-Write Phase**
   - Enable: `APEX_SURREALDB_VECTOR_DUAL_WRITE=true`
   - Writes go to both LanceDB (primary) and SurrealDB (secondary)
   - Reads still from LanceDB
   - No breaking changes

2. **Warmup Phase**
   - Run migration script: `npm run migrate:vectors`
   - Verify vector counts match
   - Monitor search consistency

3. **Read-Write Split Phase**
   - Enable: `APEX_SURREALDB_VECTOR_RW_SPLIT=true`
   - Reads can be routed to SurrealDB after warmup
   - Automatic fallback to LanceDB on failures
   - Gradual traffic migration

4. **Full Migration**
   - Disable LanceDB entirely
   - Remove LanceDB dependency from package.json
   - Update ToolRetrievalService to use SurrealDB directly

## Environment Variables

| Variable                           | Description              | Default | Phase   |
| ---------------------------------- | ------------------------ | ------- | ------- |
| `APEX_SURREALDB_VECTOR_DUAL_WRITE` | Enable dual-write mode   | `false` | Phase 4 |
| `APEX_SURREALDB_VECTOR_RW_SPLIT`   | Enable read-write split  | `false` | Phase 4 |
| `APEX_SURREALDB_VECTOR_BATCH_SIZE` | Batch size for migration | `100`   | Phase 4 |

## Migration Commands

```bash
# 1. Enable dual-write (optional - for testing)
export APEX_SURREALDB_VECTOR_DUAL_WRITE=true
npm run dev

# 2. Run migration script
npm run migrate:vectors

# 3. Enable RW-split (after migration verification)
export APEX_SURREALDB_VECTOR_RW_SPLIT=true
npm run dev

# 4. Full migration (after stability period)
# Disable LanceDB in configuration
```

## Rollback Plan

If issues arise during migration:

1. **Dual-Write Phase**: Disable `APEX_SURREALDB_VECTOR_DUAL_WRITE` - LanceDB continues to work
2. **RW-Split Phase**: Disable `APEX_SURREALDB_VECTOR_RW_SPLIT` - Falls back to LanceDB reads
3. **Full Migration**: Re-enable LanceDB adapter and restart

## Impact Assessment

### Benefits of SurrealDB Vector Storage

- **Unified Database**: Single database for all storage needs (SQL, vector, document)
- **Better Performance**: Native vector indexing with HNSW
- **Simplified Architecture**: Remove LanceDB dependency
- **Better Consistency**: ACID transactions across all data types

### Known Limitations

- SurrealDB vector search may have different recall characteristics
- Index building time may vary
- Query latency may differ from LanceDB

## Support

For questions or issues during migration:

- Check logs: `[VectorDualWrite]`, `[VectorRWSplit]`, `[VectorMigration]`
- Enable debug logging: `LOG_LEVEL=debug`
- Review migration status in `/metrics` endpoint

## References

- [SurrealDB Migration Plan](/SURREALDB_MIGRATION_PLAN.md)
- [SurrealDB Vector Search Documentation](https://docs.surrealdb.com)
- [Phase 4 Implementation](../src/core/storage/vector-dual-write.ts)
