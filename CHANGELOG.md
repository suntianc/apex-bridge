# Changelog

All notable changes to Apex Bridge will be documented in this file.

## [Unreleased]

### Added
- 偏好学习与参数默认值补全：`PreferenceService`（session > user > default 合并视图）、`SkillsToToolMapper.convertToolCallToExecutionRequestWithDefaults`
- 三段披露偏好覆盖：`toolsDisclosure=metadata|brief|full` 优先于置信度逻辑（`ToolDescriptionProvider` / `SkillsToolDescriptionGenerator`）
- 管理后台偏好管理页面：查询/分页/搜索（Key/Source）、导出/导入 JSON、基础审计列（createdAt/updatedAt）
- 后端偏好 API：`/api/admin/preferences` CRUD、`/api/admin/preferences/export`、`/api/admin/preferences/import`
- 管理员校验开关：`APEX_REQUIRE_ADMIN=true` 时写操作需管理员（`req.user.role==='admin'` 或 `x-admin-role: admin`）
- 统一角色注入中间件：`injectRoleMiddleware()` 注入 `req.user.role`（兼容头部与简化 Authorization）
- 端到端用例：偏好→参数默认值/披露→执行、HTTP 全链路（偏好 API → ChatController）、批量导入导出
- 基准测试：偏好链路 200 次 < 15ms/次（`tests/benchmark/preference-pipeline.benchmark.test.ts`）

### Changed
- README/CLAUDE 与文档补充偏好与披露说明，前端按角色隐藏偏好写操作按钮

### Housekeeping
- 标注 plugins 目录为历史示例（legacy）；建议仅作为兼容参考，功能能力以 Skills 体系为准
- 清理发布工作流：移除 `vcp-intellicore-*` 构建/发布矩阵与版本替换步骤（`.github/workflows/release.yml`）
- 文档与示例清理：更新 `config/README.md`、`QUICK_START_TEST.md` 与根 `README.md` 残留的 VCP/插件文案为 ABP/Skills 表述

### BREAKING CHANGES
- **VCP Protocol Removed**: 完全移除VCP协议支持，系统仅支持ABP协议
  - 移除 `VCPEngine`，重命名为 `ProtocolEngine`
  - 移除 `vcp-intellicore-sdk` 依赖，所有核心组件采用独立实现
  - 移除 `VCPToABPConverter`，不再支持VCP到ABP的转换
  - WebSocket路径迁移：`/VCPlog` → `/ABPlog`（兼容旧路径）
  - 环境变量迁移：`VCP_KEY` → `ABP_KEY`，`VCP_API_KEY` → `ABP_API_KEY`（兼容旧变量）

### Added
- 独立实现的核心组件：
  - `VariableEngine` - 独立变量引擎实现
  - `PluginRuntime` - 独立插件运行时实现
  - `BaseDistributedServerChannel` - 独立分布式服务器通道
  - `VCPLogChannel` - 独立日志通道
  - `IndependentWebSocketManager` - 独立WebSocket管理器
- 8个变量提供者（TimeProvider, EnvironmentProvider, PlaceholderProvider, AgentProvider, AsyncResultProvider, DiaryProvider, RAGProvider, ToolDescriptionProvider）

### Removed
- VCP协议解析器
- VCP协议fallback机制
- VCP到ABP转换器 (`VCPToABPConverter`)
- `vcp-intellicore-sdk` npm依赖
- `src/types/vcp-protocol-sdk.d.ts` 类型定义文件

### Changed
- `VCPEngine` → `ProtocolEngine`（重命名）
- WebSocket路径更新（向后兼容）：
  - `/VCPlog` → `/ABPlog` 或 `/log`（推荐使用新路径）
  - `/vcp-distributed-server` → `/abp-distributed-server` 或 `/distributed-server`（推荐使用新路径）
- 环境变量更新（向后兼容）：
  - `VCP_KEY` → `ABP_KEY`（推荐使用新变量）
  - `VCP_API_KEY` → `ABP_API_KEY`（推荐使用新变量）
  - `VCP_INTELLICORE_AUTOSTART` → `APEX_BRIDGE_AUTOSTART`（推荐使用新变量）
- `ABPVariableEngine.normalizePlaceholders()` 不再转换变量格式（直接支持 `Var:` 和 `Tar:` 格式）

### Updated
- 所有文档更新，反映新架构和路径变更
- 迁移文档添加VCP移除说明
- API文档更新WebSocket路径和配置项说明

### Document
- **归档VCP迁移文档** - 将5个VCP相关文档合并并归档到 `docs/historical/`
  - 合并文档：`docs/historical/VCP_MIGRATION_SUMMARY.md` (25KB)
  - 归档原因：VCP协议解析器已完全移除，项目实现完全独立
  - 节省空间：13.7KB
  - 删除的临时文档：
    - `INDEPENDENT_IMPLEMENTATION_PLAN.md`
    - `PLUGIN_RUNTIME_ARCHITECTURE_ANALYSIS.md`
    - `STAGE3_COMPLETION_SUMMARY.md`
    - `VCP_REMOVAL_CONFLICTS.md`
    - `VCP_REMOVAL_VERIFICATION.md`
- **归档活跃变更摘要**: docs/historical/ACTIVE_CHANGES_SUMMARY.md (7KB，记录了7个OpenSpec变更进度)
- **清理Skills阶段报告**: 删除12个临时报告 (44KB)，保留6个长期有效文档
  - 删除：`AB_TEST_REPORT.md`, `CHANGELOG_STAGE5.md`, `FINAL_SUMMARY.md`等
  - 保留：`MIGRATION_GUIDE.md`, `SKILL_FORMAT.md`, `ARCHITECTURE.md`, `BEST_PRACTICES.md`, `INTEGRATION_TESTS.md`, `PRODUCTION_MONITORING.md`
- **删除ABP实验性文档**: docs/abp/ 目录整体删除 (22个文件，256KB)
  - 删除原因：项目已转向完全独立实现，ABP协议不再使用
- **更新归档索引**: docs/historical/ARCHIVE_README.md (记录所有归档文档信息)

## [1.0.1] - 2025-11-11

### Fixed
- 更新 RAG 依赖到 `vcp-intellicore-rag@1.0.2`，支持索引动态扩容与查询参数边界保护。
- 调整 `VCPEngine` 向量化 API 的 URL 规范化策略，修复 SiliconFlow 嵌入请求 404。
- `RAGMemoryService` 规范化知识库名称，避免非法文件名导致的持久化失败。

### Changed
- Companion/Worker 节点对话统一区分人格注入与响应格式，改善节点一致性。
- 精简 `ChatService` 与 Worker 能力日志输出，降低默认运行噪声。
- 移除内置 `RAGDiaryPlugin`，默认改用向量库直接管理日记能力。

### Testing
- 扩充 `RAGMemoryService` 单测覆盖错误回退与空内容分支，确保补丁稳定性。

## [1.0.0] - 2025-11-01

### Initial Release

#### Features
- **Namespace Variable System** - 7 built-in providers with unified `{{namespace:key}}` syntax
- **RAG Advanced Search** - Time-aware, semantic group, and rerank capabilities
- **Async Tool Callback** - HTTP callback endpoint with WebSocket notifications
- **Request Interrupt API** - Graceful cancellation with AbortSignal propagation
- **Diary System** - WriteDiary and SearchDiary with auto-archive
- **Plugin System** - Direct, hybrid, and static plugin types
- **Multi-LLM Support** - DeepSeek, OpenAI, Zhipu, Ollama
- **VCPChat Integration** - Full compatibility with VCPChat client

#### Dependencies
- vcp-intellicore-sdk@2.0.0
- vcp-intellicore-rag@1.0.2
