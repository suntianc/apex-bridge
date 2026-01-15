# SurrealDB 迁移计划

**ApexBridge 数据库现代化工程规范**

---

## 1. 执行摘要

本计划详细描述了将 ApexBridge 从当前 SQLite + LanceDB 架构迁移至 SurrealDB 的完整技术路径。考虑到 SDK v2 仍处于 alpha 阶段且不够稳定，我们采用渐进式迁移策略：首先使用 SurrealDB SDK v1 以 server 模式运行，验证核心功能后再规划向 SDK v2（embedded 模式）的升级路径。

整体迁移采用"先外围后核心、先低风险后高风险"的六阶段推进模式，确保每个阶段均可验证、可回滚。通过引入存储接口抽象层和依赖注入机制，实现新旧存储层的透明切换，最大限度降低对现有业务逻辑的冲击。向量存储的迁移将基于严格的性能基准测试结果单独决策，不与其他域的迁移耦合。

---

## 2. 背景与现状分析

### 2.1 当前技术栈

ApexBridge 当前采用双数据库架构，SQLite 用于结构化数据持久化，LanceDB 用于向量相似性检索。两个存储层在代码中存在较强耦合，Service 层直接依赖具体的存储实现，这导致：

- 数据模型分散在多个 `.db` 文件中（`.data/` 目录下），缺乏统一的命名空间管理
- 跨域查询需要应用层自行聚合，效率较低且易出错
- 每次数据库 Schema 变更需手动管理迁移，缺乏版本控制
- 向量索引与结构化数据分离，工具检索（ToolRetrievalService）需要双重查询

### 2.2 已知耦合模块

以下模块与 SQLite/LanceDB 存在直接依赖，在迁移过程中需要重点处理：

| 模块                                | 依赖类型         | 迁移复杂度 | 说明                                    |
| ----------------------------------- | ---------------- | ---------- | --------------------------------------- |
| `LLMConfigService`                  | SQLite 读/写     | 高         | 存储 LLM 提供商配置、API 密钥等敏感信息 |
| `MCPConfigService`                  | SQLite 读/写     | 中         | 存储 MCP 服务器配置、连接参数           |
| `ChatService`                       | SQLite 读/写     | 高         | 存储对话历史、状态信息                  |
| `ToolRetrievalService/SearchEngine` | LanceDB 向量查询 | 高         | 存储工具向量索引，支持语义检索          |
| `ProtocolEngine`                    | SQLite 读/写     | 中         | 存储 ABP 协议解析状态                   |
| `SkillsSandboxExecutor`             | SQLite 读/写     | 中         | 存储技能沙箱执行历史                    |

### 2.3 迁移动机

迁移至 SurrealDB 的核心驱动力包括：

- **统一数据层**：结构化数据与向量数据存储于同一数据库，支持复杂的混合查询
- **Schema 演进**：SurrealDB 的灵活 Schema 特性简化了领域模型的迭代
- **分布式能力**：为后续多节点部署、实时同步奠定基础
- **查询能力**：内置的图查询、复杂条件筛选能力可简化应用层逻辑
- **运维简化**：单一数据库实例替代多个 SQLite 文件，降低运维复杂度

---

## 3. 目标与非目标

### 3.1 目标 (Goals)

- **G1**：建立 SurrealDB 适配层，实现与现有 SQLite/LanceDB 的透明切换
- **G2**：完成核心业务域（LLMConfig、MCPConfig、Chat 等）的数据迁移
- **G3**：迁移过程中保持服务可用性，支持双写回读验证
- **G4**：建立完整的测试覆盖，包括契约测试、集成测试、性能基准测试
- **G5**：制定清晰的回滚策略，确保任何阶段均可安全回退
- **G6**：为未来 SDK v2 升级预留平滑迁移路径

### 3.2 非目标 (Non-Goals)

- **NG1**：本次迁移不强制要求向量存储迁移至 SurrealDB（可能保留 LanceDB）
- **NG2**：不重构上层业务逻辑，仅替换数据访问层
- **NG3**：不涉及现有 API 接口的变更，对外保持向后兼容
- **NG4**：不处理多租户隔离，该功能在后续版本规划中
- **NG5**：SDK v2 的嵌入式模式升级不在本次计划范围内，作为 Phase 6 单独规划

### 3.3 假设条件

- **A1**：SurrealDB Server 稳定运行于本地环境，版本为当前稳定版
- **A2**：Node.js 版本维持在 18+，TypeScript 版本支持 5.0+
- **A3**：团队对 SurrealDB 查询语言（SurQL）有基本了解或可获得培训
- **A4**：生产环境可部署独立的 SurrealDB 实例（有资源配额）
- **A5**：迁移期间有足够的测试环境资源支持并行验证

### 3.4 约束条件

- **C1**：严格禁止使用 `as any` 绕过类型检查
- **C2**：严格禁止使用 `@ts-ignore`、`@ts-expect-error` 抑制类型错误
- **C3**：所有配置通过环境变量注入，不硬编码连接信息
- **C4**：每次数据库操作必须包含适当的错误处理，禁止空 catch 块
- **C5**：代码风格遵循项目现有规范（单引号、分号、2 空格缩进）

---

## 4. 配置与环境

### 4.1 环境变量规范

迁移后的 SurrealDB 配置通过以下环境变量管理：

```bash
# SurrealDB 连接配置（必填）
SURREAL_URL="ws://localhost:8000"      # SurrealDB Server WebSocket 地址
SURREAL_NS="apexbridge"               # 命名空间
SURREAL_DB="production"               # 数据库名称

# 认证配置（推荐使用 SurrealDB 内置的 root 用户或创建专用账号）
SURREAL_USER="root"                   # 用户名
SURREAL_PASS="${SURREALDB_ROOT_PASSWORD}" # 密码（从安全存储读取）

# 可选配置
SURREAL_TLS_CERT=""                   # TLS 证书路径（如使用 wss）
SURREAL_CONNECTION_TIMEOUT="5000"     # 连接超时（毫秒）
SURREAL_MAX_RETRIES="3"               # 重试次数
SURREAL_LOG_LEVEL="info"              # 日志级别：debug, info, warn, error
```

### 4.2 配置文件结构

在 `config/` 目录下新增 `surrealdb-config.json`（建议）：

```json
{
  "enabled": false,
  "server": {
    "url": "${SURREAL_URL}",
    "namespace": "${SURREAL_NS}",
    "database": "${SURREAL_DB}",
    "auth": {
      "username": "${SURREAL_USER}",
      "password": "${SURREAL_PASS}"
    }
  },
  "connection": {
    "timeout": 5000,
    "maxRetries": 3,
    "retryInterval": 1000
  },
  "featureFlags": {
    "dualWrite": false,
    "vectorMigration": false,
    "sdkV2Upgrade": false
  },
  "thresholds": {
    "p95LatencyMs": 100,
    "maxConcurrentConnections": 100
  }
}
```

---

## 5. 架构设计

### 5.1 存储接口抽象层

为了实现存储层可替换性，定义统一的存储接口。所有业务 Service 必须依赖接口而非具体实现。

建议按领域拆分：

- 结构化域：`ILLMConfigStorage`、`IMCPConfigStorage`、`IConversationStorage`、`ITrajectoryStorage`
- 向量域：`IVectorStorage`

### 5.2 适配器与工厂

通过工厂模式创建存储适配器实例，并用 Feature Flag 控制使用哪个实现。

```
业务层(Service)
  ↓ 依赖接口
存储接口层(interfaces)
  ↓
SQLiteAdapter / LanceAdapter（现状实现）
SurrealAdapter（新实现）
```

### 5.3 Feature Flags 设计

建议提供这些开关（通过 env + JSON 配置注入）：

- `SURREALDB_ENABLED`: 是否启用 SurrealDB
- `SURREALDB_DUAL_WRITE`: 是否启用双写
- `SURREALDB_DUAL_READ_STRATEGY`: `primary|surreal|compare`
- `SURREALDB_VECTOR_EVAL`: 是否启用向量迁移评估

---

## 6. 实施阶段计划（含准入/退出标准）

### Phase 0：库存盘点与接口提取（2 周）

**目标**：建立接口抽象层，把当前 SQLite/LanceDB 包一层 adapter，保证行为不变。

**退出标准**：

- 所有业务 Service 不再直接依赖 `better-sqlite3` / `@lancedb/lancedb`
- 测试套件 100% 通过

### Phase 1：SurrealDB v1 客户端封装（2 周）

**目标**：封装 SDK v1 server-mode 连接（connect/use/signin/query），包含重试、健康检查、日志、超时。

**退出标准**：

- 连接异常/服务重启场景测试通过
- 集成测试覆盖 SurrealDB 基本 CRUD

### Phase 2：低风险域迁移（2 周）

建议优先迁移：`MCPConfig`、`Trajectory`（可双写 + read-compare）。

**退出标准**：

- 双写稳定运行 24h
- 一致性 >= 99.9%
- 读切换后功能通过

### Phase 3：高风险域迁移（3 周）

迁移 `LLMConfig`、`ConversationHistory` 等核心域，采用：双写 → 回填 → 分批切读 → 切主。

**退出标准**：

- 生产环境稳定 72h
- 回滚演练通过（5 分钟内回滚）

### Phase 4：向量迁移评估（2 周）

只做 PoC + 基准测试，不承诺迁移。

**硬门禁建议**：

- P95 latency < 100ms（以你现有基线为准，需在 Phase 1/2 期间测出）
- Recall 与 LanceDB 对比 >= 95%
- 重启后索引恢复/重建成本可接受（需明确机制）

### Phase 5：向量迁移执行（可选，2-4 周）

只有 Phase 4 达标才进入。否则保留 LanceDB。

### Phase 6：SDK v2 升级路径（等待 v2 稳定后）

目标：允许在同一封装层下切换到 v2（含 embedded engines）。

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
