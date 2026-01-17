# SurrealDB 迁移计划

**ApexBridge 数据库现代化工程规范**

**最后更新**: 2026-01-17

---

## Progress Summary

| Phase                                  | Status      | Completion Date | Test Coverage                    |
| -------------------------------------- | ----------- | --------------- | -------------------------------- |
| Phase 0: Storage Interface Abstraction | ✅ COMPLETE | 2026-01-15      | 1305 tests, 100% pass            |
| Phase 1: SurrealDB v1 Client Wrapper   | ✅ COMPLETE | 2026-01-16      | 257 new tests, 99.9% overall     |
| Phase 1.x: TypeScript Error Fixes      | ✅ COMPLETE | 2026-01-16      | 0 compilation errors             |
| Phase 2: Low-risk Domain Migration     | ✅ COMPLETE | 2026-01-16      | LLM Config dual-write fixed      |
| Phase 3: High-risk Domain Migration    | ✅ COMPLETE | 2026-01-16      | Conversation, Trajectory         |
| Phase 4: Vector Storage Migration      | ✅ COMPLETE | 2026-01-17      | SurrealDB default (no migration) |

**Overall Progress: 6/6 Phases (100%)**

## Recent Changes (2026-01-17)

### Phase 4: Vector Storage Migration (COMPLETE - Simplified)

**Decision**: Skip dual-write/migration since no legacy vector data exists. SurrealDB used as default.

- ✅ SurrealDBVectorStorage implemented and tested
- ✅ Default adapter changed to SurrealDBVectorStorage
- ✅ Backward compatibility: `APEX_USE_LANCEDB_VECTOR=true` for legacy LanceDB
- ✅ Migration scripts kept for reference but not needed

### Key Files (Phase 4 - Simplified)

| File                                           | Purpose                                 |
| ---------------------------------------------- | --------------------------------------- |
| `src/core/storage/surrealdb/vector-storage.ts` | SurrealDB vector storage adapter        |
| `src/core/storage/adapter-factory.ts`          | Default to SurrealDB for vector storage |

### Configuration

```bash
# Default (recommended): SurrealDB vector storage
# No migration needed for new projects

# Legacy support: LanceDB (only if you have existing data)
APEX_USE_LANCEDB_VECTOR=true
```

### Exit Criteria (Simplified)

- [x] SurrealDBVectorStorage fully implemented
- [x] Default adapter uses SurrealDB
- [x] Backward compatibility preserved via environment variable

2. **Read-Write Splitting**:
   - Writes always go to LanceDB (primary)
   - Reads can be routed to SurrealDB after warmup
   - Automatic fallback to primary on read failures
   - Manual enable/disable of secondary reads

3. **Migration Script**:
   - Batch migration from LanceDB to SurrealDB
   - Progress logging and verification
   - Support for dual-write and RW-split modes

**Risk Mitigation**:

- All features disabled by default (feature flags)
- Primary = LanceDB for all writes during migration
- Read from SurrealDB only after explicit enablement
- Comprehensive logging of all migration operations
- Rollback via environment variable changes

### Phase 5: SDK v2 Upgrade Path (TBD)

Target: Allow switching to SurrealDB SDK v2 with embedded engines.

### Phase 4：向量存储迁移（IN PROGRESS）

**执行策略**：双写 → 迁移 → 读写分离

**实现内容**：

1. **向量双写适配器** (`VectorDualWriteAdapter`)
   - 同步写入 LanceDB（主），异步写入 SurrealDB（从）
   - 支持批量操作，配置批处理大小
   - 错误处理不阻塞主操作

2. **向量读写分离适配器** (`VectorReadWriteSplitAdapter`)
   - 写入始终到 LanceDB（主）
   - 预热后可读取到 SurrealDB
   - 读取失败自动回退到主库

3. **迁移脚本** (`scripts/migrate-vector-index.ts`)
   - 从 LanceDB 批量迁移到 SurrealDB
   - 进度日志和验证
   - 支持双写和读写分离模式

**环境变量**：

```bash
APEX_SURREALDB_VECTOR_DUAL_WRITE=true     # 启用向量双写
APEX_SURREALDB_VECTOR_RW_SPLIT=true       # 启用向量读写分离
APEX_SURREALDB_VECTOR_BATCH_SIZE=100      # 迁移批处理大小
```

**退出标准**：

- [x] 向量双写适配器已实现
- [x] 向量读写分离适配器已实现
- [x] 迁移脚本已创建
- [x] 功能标志已配置（默认禁用）
- [x] 向量迁移单元测试已创建
- [ ] 双写稳定运行 72 小时
- [ ] 向量搜索一致性 >= 99%
- [ ] 迁移脚本测试并验证
- [ ] 生产部署验证

### Phase 5：SDK v2 升级路径（待定）

目标：允许切换到 SurrealDB SDK v2（含嵌入式引擎）。

---

## 7. 测试策略（必须做，否则不迁移）

### 7.1 Contract Tests（关键）

同一套接口契约测试同时跑：

- SQLite/LanceDB adapter
- SurrealDB adapter

确保行为一致。

### 7.2 Integration Tests

覆盖：

- SurrealDB 连接、认证、namespace/database use
- CRUD + 查询
- 双写/读比较

### 7.3 性能基准

至少输出：P50/P95/P99、吞吐、错误率、重启恢复时间。

---

## 8. 回滚计划

- 所有切换点必须有开关
- 双写期间任何一侧异常必须报警
- 允许一键回退到 SQLite/LanceDB（重启服务生效）
- 迁移后保留 SQLite 数据 30 天作为只读回滚源

---

## 9. 时间线与人力估算

- Phase 0-4：约 11 周
- Phase 5：2-4 周（可选）
- Phase 6：取决于 SDK v2 稳定时间

---

## 10. 交付物清单

- 存储接口与适配器工厂
- SurrealDB v1 client wrapper
- 双写/读比较机制
- 数据迁移与一致性校验脚本
- 契约测试 + 集成测试 + 性能基准
- 回滚脚本与演练记录

---

## 11. 风险登记（摘要）

- SDK v2 延期：Phase 6 延后，不影响 v1 server-mode
- 数据一致性风险：双写 + compare + 校验脚本
- 性能不达标：向量域不迁移，保留 LanceDB

---

## 12. 参考

- SurrealDB 官方文档：https://docs.surrealdb.com
- surrealdb.js：https://github.com/surrealdb/surrealdb.js

---

**版本**：1.0
**日期**：2026-01-15
