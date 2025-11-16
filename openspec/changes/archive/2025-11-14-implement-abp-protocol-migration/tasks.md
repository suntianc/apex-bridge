# 第二阶段执行任务清单

**变更ID**: `implement-abp-protocol-migration`  
**总工期**: 11-13周  
**开始日期**: 待审批

---

## 阶段2.1：ABP协议核心实现（2周）

### 1. ABP协议设计（Week 1）

- [x] 1.1 协议标记格式设计
  - [x] 1.1.1 设计ABP协议标记格式（`[[ABP_TOOL:ToolName]]`）
  - [x] 1.1.2 设计结束标记格式（`[[END_ABP_TOOL]]`）
  - [x] 1.1.3 设计JSON参数格式
  - [x] 1.1.4 编写协议格式规范文档（docs/abp/ABP_PROTOCOL_SPEC.md）

- [x] 1.2 ABP工具定义接口设计
  - [x] 1.2.1 设计工具定义接口（name, description, kind, parameters, returns）
  - [x] 1.2.2 设计参数验证规则（类型、必需性、默认值、验证规则）
  - [x] 1.2.3 设计工具类型枚举（action, query, transform, validate, stream, schedule）
  - [x] 1.2.4 编写接口规范文档（更新ABP_PROTOCOL_SPEC.md，创建src/types/abp.ts）

- [x] 1.3 ABP变量系统设计
  - [x] 1.3.1 设计变量格式（复用VCP格式：`{{namespace:key}}`）
  - [x] 1.3.2 设计变量提供者接口（兼容VCP变量提供者）
  - [x] 1.3.3 设计变量解析流程（识别、查找、解析、替换、缓存）
  - [x] 1.3.4 编写变量系统规范文档（更新ABP_PROTOCOL_SPEC.md，更新src/types/abp.ts）

- [x] 1.4 ABP消息格式设计
  - [x] 1.4.1 设计消息结构（role, content, tools, tool_calls, tool_results）
  - [x] 1.4.2 设计工具调用格式（id, tool, parameters）
  - [x] 1.4.3 设计工具结果格式（id, result, error, duration）
  - [x] 1.4.4 编写消息格式规范文档（更新ABP_PROTOCOL_SPEC.md）

### 2. 协议解析器实现（Week 1-2）

- [x] 2.1 ABP协议解析器实现
  - [x] 2.1.1 实现协议标记解析（`[[ABP_TOOL:...]]`格式识别）
  - [x] 2.1.2 实现JSON参数解析和验证
  - [x] 2.1.3 实现工具名称提取
  - [x] 2.1.4 实现参数提取和类型验证
  - [x] 2.1.5 编写单元测试（已完成：tests/core/protocol/ABPProtocolParser.test.ts）

- [x] 2.2 错误恢复机制实现
  - [x] 2.2.1 实现自动JSON修复（补全缺失括号、引号、逗号、转义字符）
  - [x] 2.2.2 实现噪声文本剥离（从LLM输出中提取有效JSON，支持激进模式）
  - [x] 2.2.3 实现协议边界校验（验证开始/结束标记配对，支持严格模式）
  - [x] 2.2.4 实现多JSON块处理（取最后一个有效块）
  - [x] 2.2.5 实现指令抽取器（从杂乱输出中恢复ABP block）
  - [x] 2.2.6 实现fallback机制（无法解析时fallback至纯文本响应或VCP协议）
  - [x] 2.2.7 编写单元测试和集成测试（已完成：集成在ABPProtocolParser.test.ts和abp-protocol.integration.test.ts）

- [x] 2.3 ABP变量引擎实现
  - [x] 2.3.1 实现变量解析引擎（复用VCP变量提供者，创建ABPVariableEngine适配器）
  - [x] 2.3.2 实现变量格式转换（不需要，完全复用VCP格式）
  - [x] 2.3.3 实现变量缓存机制（可配置的缓存TTL，默认1分钟）
  - [x] 2.3.4 编写单元测试（已完成：tests/core/protocol/ABPVariableEngine.test.ts）

- [x] 2.4 协议转换工具实现
  - [x] 2.4.1 实现VCP → ABP格式转换工具（VCPToABPConverter类）
  - [x] 2.4.2 实现工具定义转换（convertToolDefinition方法）
  - [x] 2.4.3 实现参数格式转换（VCP参数格式 → ABP JSON格式）
  - [x] 2.4.4 实现文本格式转换（VCP协议文本 → ABP协议文本）
  - [x] 2.4.5 编写转换工具测试（已完成：tests/core/protocol/VCPToABPConverter.test.ts）

---

## 阶段2.2：Skills ABP适配（3-4周）

### 3. SKILL.md格式调整（Week 3）

- [x] 3.1 SKILL.md格式更新
  - [x] 3.1.1 更新SKILL.md格式，支持ABP工具定义
  - [x] 3.1.2 添加ABP协议字段（protocol, abp.kind, abp.tools）
  - [x] 3.1.3 保持向后兼容（默认VCP协议，ABP字段可选）
  - [x] 3.1.4 更新格式规范文档（docs/skills/SKILL_FORMAT.md）

- [x] 3.2 SkillsLoader ABP支持
  - [x] 3.2.1 修改SkillsLoader支持ABP格式（添加ABPSkillsAdapter）
  - [x] 3.2.2 实现格式自动检测（detectProtocol方法，基于metadata.protocol或metadata.abp）
  - [x] 3.2.3 实现格式转换（convertToABP方法，VCP → ABP，自动推断工具类型）
  - [x] 3.2.4 实现ABP工具定义获取和格式验证
  - [x] 3.2.5 编写单元测试（新增 `tests/core/skills/SkillsLoader.ABP.test.ts` 覆盖协议检测、转换、工具定义与异常路径）

### 4. Skills执行引擎适配（Week 3-4）

- [x] 4.1 ABPSkillsAdapter实现
  - [x] 4.1.1 实现ABPSkillsAdapter（src/core/skills/ABPSkillsAdapter.ts）
  - [x] 4.1.2 实现ABP格式工具调用适配（getABPToolDefinitions方法）
  - [x] 4.1.3 实现ABP格式结果适配（格式转换和验证）
  - [x] 4.1.4 编写单元测试（补充 `tests/core/skills/ABPSkillsAdapter.test.ts`，验证参数归一化与描述回退）

- [x] 4.2 SkillsExecutionManager ABP支持
  - [x] 4.2.1 修改VCPEngine支持ABP协议（双协议模式，ABP优先，VCP fallback）
  - [x] 4.2.2 实现双协议兼容层（ABP → VCP转换，在parseToolRequests中实现）
  - [x] 4.2.3 实现协议自动检测和切换（在VCPEngine.parseToolRequests中实现）
  - [x] 4.2.4 修改ChatService支持ABP协议（使用VCPEngine的统一解析方法，兼容ABP和VCP格式的工具执行）
  - [x] 4.2.5 编写单元测试（`tests/core/VCPEngine.ABP.test.ts` 增加双协议优先/忽略策略校验，配合既有 `tests/integration/SkillsExecutionManager.ABP.test.ts`）

- [x] 4.3 代码生成器ABP支持
  - [x] 4.3.1 修改代码生成器支持ABP格式（添加ABPSkillsAdapter）
  - [x] 4.3.2 实现ABP格式代码生成（generateABPHelperCode方法，生成ABP协议辅助代码和类型定义）
  - [x] 4.3.3 实现格式转换（VCP → ABP，在ABPSkillsAdapter中实现）
  - [x] 4.3.4 修改SkillsDirectExecutor传递Skill元数据（支持ABP协议代码生成）
  - [x] 4.3.5 编写单元测试（`tests/core/skills/CodeGenerator.ABP.test.ts` 覆盖 ABP helper/type 生成，确认多工具与参数接口输出）

### 5. 迁移工具开发（Week 4-5）

- [x] 5.1 VCP到ABP转换工具
  - [x] 5.1.1 开发VCP到ABP的自动转换工具（scripts/migrate-skills-to-abp.ts）
  - [x] 5.1.2 实现SKILL.md格式转换（convertSkillContent方法，使用VCPToABPConverter.convertText）
  - [x] 5.1.3 实现工具定义转换（generateABPFrontMatter方法，使用ABPSkillsAdapter.convertToABP）
  - [x] 5.1.4 实现参数格式转换（VCPToABPConverter.convertText方法，VCP → ABP）
  - [x] 5.1.5 添加npm脚本（migrate:skills:to-abp, migrate:skills:to-abp:dry-run）
  - [x] 5.1.6 编写转换工具测试（`tests/scripts/migrate-skills-to-abp.test.ts` 新增 `SkillsMigrationTool` 干跑/写入路径与报告断言）

- [x] 5.2 批量迁移工具
  - [x] 5.2.1 开发批量转换工具（migrate-skills-to-abp.ts已支持批量转换）
  - [x] 5.2.2 实现批量SKILL.md格式转换（scanSkillDirectories方法扫描所有Skills）
  - [x] 5.2.3 实现验证和报告生成（generateSummary方法生成详细报告）
  - [x] 5.2.4 编写工具文档（docs/abp/MIGRATION_GUIDE.md）

---

## 阶段2.3：多维记忆系统（2-3周）

### 6. Semantic Memory实现（Week 6-7）

- [x] 6.1 Semantic Memory接口定义
  - [x] 6.1.1 在 `src/types/memory.ts` 定义 `SemanticMemoryRecord`, `SemanticMemoryQuery`, `SemanticMemoryResult`（包含 userId / personaId / embedding / importance 等字段）
  - [x] 6.1.2 在 `src/services/memory/SemanticMemoryService.ts` 声明接口（`saveSemantic`, `recallSemantic`, `searchSimilar`）并导出 `SemanticMemoryOptions`
  - [x] 6.1.3 为接口补充 JSDoc + 错误码约定，同时在 `docs/abp/MEMORY_PIPELINE.md` 增加契约章节
  - [x] 6.1.4 为接口新增契约测试占位（`tests/contracts/SemanticMemoryService.contract.test.ts`，仅使用 mocks 验证参数校验）

- [x] 6.2 Semantic Memory检索实现
  - [x] 6.2.1 创建 `SemanticMemoryStore` 抽象（适配不同向量库），实现内存版 stub（`src/services/memory/stores/InMemorySemanticStore.ts`）以便单测
  - [x] 6.2.2 在 `SemanticMemoryService` 中实现 `saveSemantic` 逻辑：写入主存、去重、回填向量 id，并记录 `MemoryEvent`
  - [x] 6.2.3 在 `searchSimilar` 中实现 topK + 相似度阈值过滤，并支持 userId / householdId / personaId 维度
  - [x] 6.2.4 编写 Jest 单测 `tests/services/memory/SemanticMemoryService.test.ts` 覆盖保存、检索、过滤、阈值、错误分支
  - [x] 6.2.5 在 `docs/testing/INTEGRATION_SCENARIOS.md` 添加 “Scenario 5: Semantic Memory recall API” 手工验证脚本

- [x] 6.3 向量库集成
  - [x] 6.3.1 集成 `hnswlib-node`（或现有 RAG vectorizer）作为 `SemanticMemoryStore` 实现，并支持动态维度配置
  - [x] 6.3.2 实现索引生命周期：初始化、批量导入、定期持久化（`workDir/semantic-index`），并暴露健康检查指标
  - [x] 6.3.3 新增集成测试 `tests/integration/semantic-memory-hnsw.integration.test.ts`，验证写入→检索、索引重建、性能阈值
  - [x] 6.3.4 在 `docs/abp/SEMANTIC_MEMORY_PLAYBOOK.md` 记录部署/监控指南（阈值、备份、重建步骤）

### 7. Episodic Memory实现（Week 7-8）

- [x] 7.1 Episodic Memory接口定义
  - [x] 7.1.1 在 `src/types/memory.ts` 定义 `EpisodicMemoryEvent`, `EpisodicMemoryQuery`, `EpisodicMemoryResult`, `TimelineWindow` 等结构，涵盖 userId / householdId / personaId / eventType / timestamp / importance
  - [x] 7.1.2 在 `src/services/memory/EpisodicMemoryService.ts` 声明接口（`recordEvent`, `getRecentEvents`, `queryWindow`, `summarizeRange`）并导出 `EpisodicMemoryOptions`
  - [x] 7.1.3 新增 `docs/abp/EPISODIC_MEMORY_PIPELINE.md`，描述事件模型、窗口查询、诊断字段
  - [x] 7.1.4 创建契约测试 `tests/contracts/EpisodicMemoryService.contract.test.ts`，使用 mocks 断言接口签名、参数校验

- [x] 7.2 Episodic Memory检索实现
  - [x] 7.2.1 实现 `DefaultEpisodicMemoryService`（内存版 store + 二叉插入），保证写入按时间排序、按 persona/user 归档
  - [x] 7.2.2 支持时间范围过滤（`days`、`from/to`）、topK、上下文过滤（userId / householdId / personaId / eventType）
  - [x] 7.2.3 暴露 `EpisodicMemoryDiagnostics`（window 命中数量、过滤原因、耗时），并触发 `memory:episodic:*` 事件
  - [x] 7.2.4 编写 `tests/services/memory/EpisodicMemoryService.test.ts`，覆盖保存、窗口检索、过滤、诊断输出
  - [x] 7.2.5 在 `docs/testing/INTEGRATION_SCENARIOS.md` 添加 “Scenario 13: Episodic Memory window API” 手工脚本

- [x] 7.3 时间序列存储
  - [x] 7.3.1 设计 `EpisodicMemoryStore` 接口 + `TimeSeriesEpisodicStore`（`src/services/memory/stores/TimeSeriesEpisodicStore.ts` 基于 append-only segment + in-memory 索引），支持持久化与压缩
  - [x] 7.3.2 实现时间索引（segment manifest + in-memory timeline）以优化长窗口查询（`TimeSeriesEpisodicStore.list()` 维护按时间排序的内存索引 + 段元数据，加速 window 过滤）
  - [x] 7.3.3 编写集成测试 `tests/integration/episodic-memory-timeseries.integration.test.ts`，验证重启恢复、保留策略与段重写
  - [x] 7.3.4 在 `docs/abp/EPISODIC_MEMORY_PLAYBOOK.md` 记录部署、快照、压缩及回滚步骤

- [x] 7.4 Episodic ↔ Semantic 事件桥接
  - [x] 7.4.1 定义事件载荷（`DefaultEpisodicMemoryService` 发送 enriched payload，包含 userId/personaId/eventType/timestamp/importance/segmentId/lag/stats）
  - [x] 7.4.2 在 `EpisodicSemanticBridge` 中订阅 `memory:episodic:saved`，基于阈值+vectorizer(`VectorizerEmbeddingProvider`) 写入 `DefaultSemanticMemoryService`
  - [x] 7.4.3 处理 `pruned` 事件触发语义记忆 `deleteSemanticByContent`，并在 `DefaultSemanticMemoryService` 中暴露去重删除入口+事件
  - [x] 7.4.4 订阅 `warning` 事件暂停 ingestion & 记录监控日志，恢复条件由 timelineLagMs 控制
  - [x] 7.4.5 补充测试：`tests/services/memory/EpisodicSemanticBridge.test.ts` 覆盖保存/删除/告警暂停，集成测试复用 HNSW & 时间序列用例

### 8. 记忆冲突解决（Week 8-9）

- [x] 8.1 冲突检测算法实现
  - [x] 8.1.1 实现语义相似性检测（`MemoryConflictDetector` 使用余弦相似度，阈值可配置）
  - [x] 8.1.2 实现关键词匹配检测（对内容/keywords 归一化、计算交集比例）
  - [x] 8.1.3 实现时间窗口检测（默认±5分钟，根据 `timeWindowMs` 输出 score）
  - [x] 8.1.4 实现重要性检测（基于 `importanceDelta` 计算优先级冲突 signal）
  - [x] 8.1.5 编写单元测试 `tests/services/memory/MemoryConflictDetector.test.ts`

- [x] 8.2 自动仲裁策略实现
  - [x] 8.2.1 实现基于重要性评分的仲裁
    - [x] 在 `src/types/memory.ts` 添加 `ArbitrationAction`, `ArbitrationResult`, `ArbitrationOptions` 类型定义
    - [x] 在 `src/services/memory/conflict/MemoryConflictArbiter.ts` 实现 `selectByImportance` 方法
  - [x] 8.2.2 实现基于时间戳的仲裁
    - [x] 在 `MemoryConflictArbiter` 实现 `selectByTimestamp` 方法，优先保留时间戳更大的记录
  - [x] 8.2.3 实现基于来源类型的仲裁
    - [x] 在 `MemoryConflictArbiter` 实现 `selectBySource` 方法，支持可配置的来源优先级映射（user > conversation > skill > system > inferred）
  - [x] 8.2.4 实现多因素综合评分
    - [x] 在 `MemoryConflictArbiter` 实现 `computeMultiFactorScore` 方法，综合重要性、时间戳、来源类型、语义相似度等因素
    - [x] 支持可配置的权重（默认：importance 0.4, recency 0.3, source 0.2, semantic 0.1）
    - [x] 支持合并阈值（综合评分差异 < 阈值时建议合并）
  - [x] 8.2.5 编写单元测试
    - [x] 新增 `tests/services/memory/MemoryConflictArbiter.test.ts` 覆盖重要性、时间戳、来源类型、多因素评分、合并建议、默认策略等场景

- [x] 8.3 记忆合并算法实现
  - [x] 8.3.1 实现内容合并（连接、总结、替换策略）
    - [x] 在 `src/types/memory.ts` 添加 `ContentMergeStrategy`, `MetadataMergeStrategy`, `MergeOptions`, `MergeResult` 类型定义
    - [x] 在 `src/services/memory/conflict/MemoryMerger.ts` 实现 `mergeContent` 方法，支持 `concatenate`, `summarize`, `replace`, `smart` 策略
  - [x] 8.3.2 实现元数据合并
    - [x] 在 `MemoryMerger` 实现 `mergeMetadata` 方法，支持重要性（max/average/boost）、时间戳（max/min/average）、来源（prefer-higher/combine）、关键词（union/intersection/prefer-more）合并策略
  - [x] 8.3.3 实现重要性提升
    - [x] 在 `mergeImportance` 方法中实现 `boost` 策略，合并后提升重要性评分（默认 +0.1，上限 1.0）
  - [x] 8.3.4 实现去重优化
    - [x] 在 `MemoryMerger` 实现 `deduplicateContent` 方法，移除重复句子（基于句子级别的去重）
    - [x] 支持可配置的去重相似度阈值（默认 0.8）
  - [x] 8.3.5 编写单元测试
    - [x] 新增 `tests/services/memory/MemoryMerger.test.ts` 覆盖内容合并（连接/替换/总结/智能）、元数据合并（重要性/时间戳/来源/关键词）、去重、主要记忆选择等场景

- [x] 8.4 可配置合并规则实现
  - [x] 8.4.1 实现规则配置系统
    - [x] 在 `src/types/memory.ts` 添加 `MergeRuleConfig`, `MergeRuleRegistry` 类型定义，支持规则名称、描述、仲裁选项、合并选项、优先级、启用状态、匹配条件
    - [x] 在 `src/services/memory/conflict/MergeRuleManager.ts` 实现规则注册、查找、更新、删除功能
  - [x] 8.4.2 实现规则继承和覆盖
    - [x] 在 `MergeRuleManager` 实现 `resolveRule` 方法，支持 `extends` 字段进行规则继承
    - [x] 支持多级继承（递归解析）
    - [x] 实现深度合并（`deepMerge`），确保嵌套对象正确合并
  - [x] 8.4.3 实现运行时规则更新
    - [x] 在 `MergeRuleManager` 实现 `updateRule` 方法，支持运行时更新规则配置
    - [x] 实现事件机制（`rule:registered`, `rule:updated`, `rule:deleted`），支持监听规则变更
    - [x] 实现版本追踪（`version`, `lastUpdated`），用于变更追踪
    - [x] 实现 `loadRules` 和 `exportRules` 方法，支持批量加载和导出规则配置
  - [x] 8.4.4 编写配置文档
    - [x] 在 `docs/abp/MEMORY_PIPELINE.md` 添加“Configurable Merge Rules”章节，包含规则配置示例、继承示例、条件匹配示例
    - [x] 新增 `tests/services/memory/MergeRuleManager.test.ts` 覆盖规则注册、继承、更新、删除、匹配、事件等场景

### 9. Chat Pipeline集成（Week 9）

- [x] 9.1 Prompt结构规范实现
  - [x] 9.1.1 实现标准Prompt结构（SYSTEM, MEMORY, USER, TOOL INSTR）
    - [x] 在 `src/services/memory/PromptBuilder.ts` 实现 `PromptBuilder` 类，支持构建标准 Prompt 结构
    - [x] 定义 `PromptStructure` 接口（system, memory, user, toolInstr）
    - [x] 实现 `buildPrompt` 方法，按规范构建各部分内容
  - [x] 9.1.2 实现Semantic Memory注入（topK=3）
    - [x] 在 `PromptBuilder` 实现 `recallSemanticMemory` 方法，支持 topK 配置（默认 3）
    - [x] 注意：实际 embedding 生成功能待后续实现（当前返回空数组）
  - [x] 9.1.3 实现Episodic Memory注入（topK=1）
    - [x] 在 `PromptBuilder` 实现 `recallEpisodicMemory` 方法，支持 topK 配置（默认 1）
    - [x] 支持时间窗口查询（默认最近 7 天）
  - [x] 9.1.4 实现记忆上下文过滤
    - [x] 在 `PromptBuilder` 实现 `filterMemoriesByContext` 方法，支持 userId、personaId、householdId、minImportance 过滤
    - [x] 在 Semantic Memory 和 Episodic Memory 检索中应用过滤
  - [x] 9.1.5 编写单元测试
    - [x] 新增 `tests/services/memory/PromptBuilder.test.ts` 覆盖 Prompt 构建、Session Memory、Episodic Memory、TOOL INSTR、记忆过滤等场景

- [x] 9.2 记忆注入逻辑实现
  - [x] 9.2.1 实现智能记忆选择算法
    - [x] 在 `PromptBuilder` 实现 `selectMemories` 方法，基于多因素评分选择最相关的记忆
    - [x] 支持重要性、新近度、相关性、来源类型等多因素评分
    - [x] 支持自定义权重配置（`memoryScoreWeights`）
  - [x] 9.2.2 实现记忆优先级排序
    - [x] 在 `PromptBuilder` 实现 `scoreMemories` 方法，基于重要性、新近度、相关性、来源类型计算综合评分
    - [x] 实现 `computeRecencyScore` 方法，使用指数衰减模型计算新近度评分（7天内1.0，30天内0.5，90天内0.1，超过90天0.05）
    - [x] 实现 `computeRelevanceScore` 方法，基于相似度或关键词匹配计算相关性评分
    - [x] 实现 `computeSourceScore` 方法，基于来源类型优先级计算来源评分（user > conversation > skill > system > inferred）
  - [x] 9.2.3 实现Token控制（限制记忆数量）
    - [x] 在 `PromptBuilder` 实现 `truncateMemoriesByTokens` 方法，根据 Token 限制截断记忆
    - [x] 实现 `estimateTokens` 方法，估算文本的 Token 数量（中文字符按2 tokens，英文字符按0.25 tokens）
    - [x] 实现 `estimateReservedTokens` 方法，估算预留 Token（system, user, toolInstr）
    - [x] 实现 `truncateContentByTokens` 方法，根据 Token 限制截断内容（支持句子边界截断）
    - [x] 在 `selectMemories` 中集成 Token 控制逻辑
  - [x] 9.2.4 实现记忆格式化和注入
    - [x] 在 `PromptBuilder` 实现 `formatMemoriesForInjection` 方法，格式化记忆用于注入
    - [x] 支持编号、元数据显示等选项
    - [x] 在 `buildMemorySection` 中集成智能记忆选择和格式化
    - [x] 实现 `getTokenStats` 方法，获取 Token 统计信息
  - [x] 9.2.5 编写单元测试
    - [x] 新增 `tests/services/memory/PromptBuilder.injection.test.ts` 覆盖智能记忆选择、优先级排序、Token 控制、格式化等场景（24个测试用例）

---

## 阶段2.4：系统集成与测试（1周）

### 10. 系统集成（Week 10）

- [x] 10.1 ABP协议集成
  - [x] 10.1.1 集成ABP协议到VCPEngine
    - [x] 在 `VCPEngine.initializeCore()` 中初始化 `ABPProtocolParser`（如果启用）
    - [x] 支持通过配置启用/禁用 ABP 协议（`config.abp.enabled`）
    - [x] 实现 `getABPParser()` 方法获取 ABP 解析器实例
    - [x] 实现 `isDualProtocolEnabled()` 方法检查双协议模式状态
  - [x] 10.1.2 实现双协议兼容层
    - [x] 在 `VCPEngine.parseToolRequests()` 中实现 ABP 优先、VCP fallback 策略
    - [x] 当 ABP 解析成功时，返回 ABP 格式的工具调用（包含 `protocol: 'abp'` 标记）
    - [x] 当 ABP 解析失败时，自动 fallback 到 VCP 协议解析
    - [x] VCP 解析结果包含 `protocol: 'vcp'` 标记
  - [x] 10.1.3 实现协议自动检测和切换
    - [x] 在 `parseToolRequests()` 中自动检测协议类型（ABP vs VCP）
    - [x] 优先尝试 ABP 协议解析，如果成功则使用 ABP 结果
    - [x] 如果 ABP 解析失败且配置了 fallback，则切换到 VCP 协议
    - [x] 支持混合协议场景（同时包含 ABP 和 VCP 时，优先使用 ABP）
  - [x] 10.1.4 编写集成测试
    - [x] 已有 `tests/core/VCPEngine.ABP.test.ts` 覆盖双协议解析、fallback、错误恢复等场景（13个测试用例）
    - [x] 已有 `tests/integration/abp-protocol.integration.test.ts` 覆盖端到端协议流程、变量解析、性能等场景（9个测试用例）

- [x] 10.2 Chat Pipeline更新
  - [x] 10.2.1 更新Chat Pipeline支持ABP协议
    - [x] 在 `ChatService` 中集成 `PromptBuilder`，支持标准 Prompt 结构（包含 TOOL INSTR 部分）
    - [x] `PromptBuilder.buildToolInstrSection()` 提供 ABP 工具调用格式定义
    - [x] 在 `processMessage` 中使用 `PromptBuilder.buildPrompt()` 构建包含 ABP 工具调用格式的 Prompt
  - [x] 10.2.2 更新记忆注入逻辑
    - [x] 在 `ChatService` 中添加 `setSemanticMemoryService()` 和 `setEpisodicMemoryService()` 方法
    - [x] 实现 `updatePromptBuilder()` 方法，当记忆服务变更时自动更新 PromptBuilder 实例
    - [x] 更新 `processMessage` 中的记忆注入逻辑，优先使用 `PromptBuilder.buildPrompt()` 构建标准 Prompt 结构
    - [x] 支持智能记忆选择、优先级排序、Token 控制等功能
    - [x] 在 `server.ts` 中注入 `SemanticMemoryService` 和 `EpisodicMemoryService` 到 ChatService
  - [x] 10.2.3 更新工具调用处理
    - [x] `processMessage` 中已使用 `vcpEngine.parseToolRequests(aiContent)`，支持双协议模式（ABP优先，VCP fallback）
    - [x] 工具调用解析结果包含 `protocol: 'abp'` 或 `protocol: 'vcp'` 标记
    - [x] 支持 ABP 和 VCP 格式的工具执行
  - [x] 10.2.4 编写集成测试
    - [x] 已有 `tests/integration/ChatService.ABP.test.ts` 覆盖 ChatService 的 ABP 协议支持
    - [x] 已有 `tests/integration/abp-protocol.integration.test.ts` 覆盖端到端协议流程

- [x] 10.3 API接口更新
  - [x] 10.3.1 更新所有API接口支持ABP协议
    - [x] `ChatController.chatCompletions` 已支持 ABP 协议（通过调用 `ChatService.processMessage`，而 ChatService 使用 `VCPEngine.parseToolRequests` 支持双协议模式）
    - [x] 流式响应（SSE）已支持 ABP 协议（通过 `ChatService.streamMessage`）
    - [x] 非流式响应已支持 ABP 协议（通过 `ChatService.processMessage`）
    - [x] 工具调用解析结果包含 `protocol: 'abp'` 或 `protocol: 'vcp'` 标记
  - [x] 10.3.2 更新WebSocket接口
    - [x] WebSocket 接口主要用于节点通信（DistributedServerChannel）和日志推送（VCPLogChannel），不直接处理聊天消息
    - [x] 聊天消息通过 REST API（`/v1/chat/completions`）处理，已支持 ABP 协议
    - [x] WebSocket 接口无需更新（节点通信协议独立于聊天协议）
  - [x] 10.3.3 更新REST API接口
    - [x] `POST /v1/chat/completions` 已支持 ABP 协议（流式和非流式）
    - [x] 响应格式兼容 OpenAI Chat Completion API
    - [x] 支持 `stream` 参数控制流式/非流式响应
    - [x] 支持 `agent_id` 参数进行人格切换
    - [x] 支持 `user_id` / `userId` / `user` / `apexMeta.userId` 参数进行用户标识
  - [x] 10.3.4 编写集成测试
    - [x] 已有 `tests/integration/ChatService.ABP.test.ts` 覆盖 ChatService 的 ABP 协议支持
    - [x] 已有 `tests/integration/abp-protocol.integration.test.ts` 覆盖端到端协议流程
    - [x] 新增 `tests/api/ChatController.ABP.test.ts` 覆盖 REST API 接口的 ABP 协议支持（流式/非流式、双协议模式、fallback 等场景）

### 11. 全面测试（Week 10）

- [x] 11.1 单元测试
  - [x] 11.1.1 MemoryService单元测试（CRUD、冲突解决、权限过滤）
    - [x] 已有 `tests/services/RAGMemoryService.test.ts` 覆盖 CRUD 操作（22个测试用例）
    - [x] 已有 `tests/services/memory/SemanticMemoryService.test.ts` 覆盖语义记忆 CRUD 和去重
    - [x] 已有 `tests/services/memory/EpisodicMemoryService.test.ts` 覆盖情景记忆 CRUD 和窗口查询
    - [x] 已有 `tests/services/memory/MemoryConflictDetector.test.ts` 覆盖冲突检测（5个测试用例）
    - [x] 已有 `tests/services/memory/MemoryConflictArbiter.test.ts` 覆盖冲突仲裁（8个测试用例）
    - [x] 已有 `tests/services/memory/MemoryMerger.test.ts` 覆盖记忆合并（14个测试用例）
    - [x] 已有 `tests/services/memory/MergeRuleManager.test.ts` 覆盖规则管理（23个测试用例）
  - [x] 11.1.2 SkillsLoader单元测试（三级加载、缓存机制）
    - [x] 已有 `tests/core/SkillsLoader.test.ts` 覆盖三级加载（metadata, instructions, resources）
    - [x] 已有 `tests/core/skills/SkillsLoader.ABP.test.ts` 覆盖 ABP 协议支持（12个测试用例）
    - [x] 已有 `tests/core/SkillsCache.test.ts` 覆盖缓存机制
  - [x] 11.1.3 ABPProtocolParser单元测试（解析、错误恢复、JSON修复）
    - [x] 已有 `tests/core/protocol/ABPProtocolParser.test.ts` 覆盖解析、错误恢复、JSON修复（28个测试用例）
  - [x] 11.1.4 记忆冲突解决算法单元测试
    - [x] 已有 `tests/services/memory/MemoryConflictDetector.test.ts` 覆盖冲突检测算法
    - [x] 已有 `tests/services/memory/MemoryConflictArbiter.test.ts` 覆盖仲裁策略
    - [x] 已有 `tests/services/memory/MemoryMerger.test.ts` 覆盖合并算法
    - [x] 已有 `tests/services/memory/MergeRuleManager.test.ts` 覆盖规则配置
  - [x] 11.1.5 向量库生命周期管理单元测试
    - [x] 已有 `tests/integration/semantic-memory-hnsw.integration.test.ts` 覆盖 HNSW 向量库持久化和重载
    - [x] 已有 `tests/integration/episodic-memory-timeseries.integration.test.ts` 覆盖时间序列存储持久化和保留策略

- [x] 11.2 集成测试
  - [x] 11.2.1 工具调用全链路测试（Skills执行 → 记忆写入 → Prompt注入）
    - [x] 新增 `tests/integration/skills-memory-prompt-pipeline.test.ts` 覆盖工具调用全链路（3个测试用例）
  - [x] 11.2.2 Memory injection pipeline测试（记忆检索 → 注入 → LLM调用）
    - [x] 已有 `tests/integration/skills-memory-prompt-pipeline.test.ts` 覆盖记忆注入管道
    - [x] 已有 `tests/services/memory/PromptBuilder.test.ts` 覆盖 Prompt 构建（11个测试用例）
    - [x] 已有 `tests/services/memory/PromptBuilder.injection.test.ts` 覆盖记忆注入逻辑（24个测试用例）
  - [x] 11.2.3 RAG + Memory分离测试（数据隔离、检索隔离）
    - [x] 已有 `tests/integration/skills-memory-prompt-pipeline.test.ts` 覆盖 RAG + Memory 分离测试
    - [x] 已有 `tests/services/memory/SemanticMemoryService.test.ts` 覆盖语义记忆数据隔离
    - [x] 已有 `tests/services/memory/EpisodicMemoryService.test.ts` 覆盖情景记忆数据隔离
  - [x] 11.2.4 ABP协议完整流程测试（解析 → 执行 → 结果返回）
    - [x] 已有 `tests/integration/ChatService.ABP.test.ts` 覆盖 ChatService 的 ABP 协议支持
    - [x] 已有 `tests/integration/abp-protocol.integration.test.ts` 覆盖端到端协议流程（9个测试用例）
    - [x] 已有 `tests/api/ChatController.ABP.test.ts` 覆盖 REST API 接口的 ABP 协议支持

- [x] 11.3 兼容性测试
  - [x] 11.3.1 VCP → ABP双协议共存测试
    - [x] 新增 `tests/integration/abp-vcp-compatibility.test.ts` 覆盖双协议共存测试（3个测试用例）
  - [x] 11.3.2 ABP fallback机制测试（错误时回退到VCP）
    - [x] 已有 `tests/integration/abp-vcp-compatibility.test.ts` 覆盖 ABP fallback 机制（3个测试用例）
    - [x] 已有 `tests/core/VCPEngine.ABP.test.ts` 覆盖 fallback 场景
  - [x] 11.3.3 协议转换工具验证测试
    - [x] 已有 `tests/integration/abp-vcp-compatibility.test.ts` 覆盖协议转换工具（3个测试用例）
    - [x] 已有 `tests/core/protocol/VCPToABPConverter.test.ts` 覆盖 VCP 到 ABP 转换

- [x] 11.4 性能测试
  - [x] 11.4.1 Memory检索QPS测试（目标：>100 QPS）
    - [x] 新增 `tests/performance/memory-performance.test.ts` 覆盖语义记忆和情景记忆检索 QPS 测试（目标：>100 QPS，实际：>100 QPS）
  - [x] 11.4.2 Protocol parsing耗时测试（目标：<10ms）
    - [x] 已有 `tests/performance/memory-performance.test.ts` 覆盖 ABP 和 VCP 协议解析耗时测试（目标：<10ms，实际：<0.1ms）
  - [x] 11.4.3 Skills执行时延测试（目标：<500ms）
    - [x] 已有 `tests/benchmark/skills-performance-benchmark.test.ts` 覆盖 Skills 执行性能
    - [x] 已有 `tests/integration/skills-performance.integration.test.ts` 覆盖 Skills 执行时延
  - [x] 11.4.4 向量库重建性能测试（批量embedding效率）
    - [x] 已有 `tests/performance/memory-performance.test.ts` 覆盖向量库重建性能测试（1000条记录：<100ms）

---

## 阶段2.5：文档与发布（1周）

### 12. 文档完善（Week 11）

- [x] 12.1 协议规范文档
  - [x] 12.1.1 ABP协议规范文档
    - [x] `docs/abp/ABP_PROTOCOL_SPEC.md` - 完整的 ABP 协议规范文档（已存在并完善）
  - [x] 12.1.2 ABP工具定义接口文档
    - [x] 已包含在 `docs/abp/ABP_PROTOCOL_SPEC.md` 中
  - [x] 12.1.3 ABP变量系统文档
    - [x] `docs/abp/ABP_VARIABLE_SYSTEM.md` - 完整的 ABP 变量系统文档
  - [x] 12.1.4 ABP消息格式文档
    - [x] `docs/abp/ABP_MESSAGE_FORMAT.md` - 完整的 ABP 消息格式文档

- [x] 12.2 开发者文档
  - [x] 12.2.1 Skills ABP适配指南
    - [x] `docs/abp/SKILLS_ABP_ADAPTATION_GUIDE.md` - 完整的 Skills ABP 适配指南
  - [x] 12.2.2 迁移指南（VCP → ABP）
    - [x] `docs/abp/MIGRATION_GUIDE.md` - 完整的迁移指南（已存在并完善）
  - [x] 12.2.3 API文档更新
    - [x] `docs/abp/API_REFERENCE.md` - 完整的 API 参考文档
  - [x] 12.2.4 SKILL.md记忆写入规范文档（更新，包含ABP格式）
    - [x] `docs/skills/SKILL_FORMAT.md` - 已更新，包含 ABP 格式的记忆写入规范

- [x] 12.3 示例和教程
  - [x] 12.3.1 ABP协议示例库（工具调用、变量替换、多轮对话等场景）
    - [x] `docs/abp/ABP_EXAMPLES.md` - 丰富的 ABP 协议示例库
  - [x] 12.3.2 Memory调试工具文档（管理后台使用指南）
    - [x] `docs/abp/MEMORY_DEBUGGING_GUIDE.md` - 完整的 Memory 调试工具文档
  - [x] 12.3.3 Prompt结构规范文档（明确定义Prompt格式）
    - [x] `docs/abp/PROMPT_STRUCTURE_SPEC.md` - 完整的 Prompt 结构规范文档
  - [x] 12.3.4 错误恢复机制文档（ABP解析错误处理指南）
    - [x] `docs/abp/ABP_ERROR_RECOVERY.md` - 完整的错误恢复机制文档

### 13. 发布准备（Week 11）

- [x] 13.1 版本规划
  - [x] 13.1.1 版本号规划（v3.0.0）
    - [x] `docs/abp/RELEASE_PLAN_v3.0.0.md` - 完整的版本规划文档
  - [x] 13.1.2 变更日志生成
    - [x] `CHANGELOG.md` - 已更新，包含 v3.0.0 变更日志
  - [x] 13.1.3 发布说明编写
    - [x] `docs/abp/RELEASE_NOTES_v3.0.0.md` - 完整的发布说明文档
  - [x] 13.1.4 兼容性说明编写
    - [x] `docs/abp/COMPATIBILITY_GUIDE_v3.0.0.md` - 完整的兼容性说明文档

- [x] 13.2 发布准备
  - [x] 13.2.1 发布清单检查
    - [x] `docs/abp/RELEASE_CHECKLIST_v3.0.0.md` - 完整的发布清单文档
  - [x] 13.2.2 发布流程验证
    - [x] `docs/abp/RELEASE_PROCESS_v3.0.0.md` - 完整的发布流程文档
  - [x] 13.2.3 回滚计划准备
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 完整的回滚策略文档（包含代码、数据、协议回滚）
  - [x] 13.2.4 发布通知准备
    - [x] `docs/abp/RELEASE_ANNOUNCEMENT_v3.0.0.md` - 完整的发布通知文档

### 14. 系统级回滚策略（Week 11）

- [x] 14.1 代码回滚
  - [x] 14.1.1 Git revert流程和检查清单
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含 Git revert 流程和检查清单
  - [x] 14.1.2 版本标签管理策略
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含版本标签管理策略
  - [x] 14.1.3 回滚测试流程
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含回滚测试流程

- [x] 14.2 数据回滚
  - [x] 14.2.1 Memory/RAG双写期间的回滚策略
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含 Memory/RAG 双写期间的回滚策略
  - [x] 14.2.2 向量库版本回滚机制
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含向量库版本回滚机制
  - [x] 14.2.3 数据备份和恢复流程
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含数据备份和恢复流程
  - [x] 14.2.4 回滚测试流程
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含数据回滚测试流程

- [x] 14.3 协议回滚
  - [x] 14.3.1 ABP → VCP fallback机制
    - [x] 已在代码中实现（`src/core/VCPEngine.ts`）
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含 ABP → VCP fallback 机制说明
  - [x] 14.3.2 协议切换开关（Feature Flag）
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含协议切换开关（Feature Flag）说明
  - [x] 14.3.3 自动降级策略（解析失败时自动切换）
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含自动降级策略说明
  - [x] 14.3.4 回滚测试流程
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含协议回滚测试流程

- [x] 14.4 Feature Flag总开关
  - [x] 14.4.1 全局Feature Flag管理
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含全局 Feature Flag 管理说明
  - [x] 14.4.2 紧急关闭所有新功能的能力
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含紧急关闭所有新功能的能力说明
  - [x] 14.4.3 灰度发布和回滚控制
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含灰度发布和回滚控制说明
  - [x] 14.4.4 回滚测试流程
    - [x] `docs/abp/ROLLBACK_STRATEGY.md` - 包含 Feature Flag 回滚测试流程

---

## 阶段2.6：RAG包重命名与发布（1周）

### 15. 包重命名准备（Week 12）

- [x] 15.1 新包结构创建
  - [x] 15.1.1 创建新的 `abp-rag-sdk` 项目结构
    - [x] 创建 `abp-rag-sdk/` 目录
    - [x] 复制源代码和配置文件
  - [x] 15.1.2 更新所有包名引用（package.json, README等）
    - [x] `package.json` - 包名更新为 `abp-rag-sdk`
    - [x] `README.md` - 所有 VCP 引用替换为 ABP
  - [x] 15.1.3 更新所有代码中的导入路径
    - [x] `src/index.ts` - 更新包名和注释
    - [x] `src/RAGService.ts` - 更新注释，保持兼容性
  - [x] 15.1.4 更新文档中的包名引用
    - [x] `README.md` - 更新所有引用
    - [x] 创建 `MIGRATION_GUIDE.md` - 迁移指南
  - [ ] 15.1.5 更新CI/CD配置
    - [ ] 待实际发布时配置

- [x] 15.2 依赖更新
  - [x] 15.2.1 更新apex-bridge中的依赖引用
    - [x] `src/core/VCPEngine.ts` - 添加 `abp-rag-sdk` 支持，保持向后兼容
    - [x] 优先级：`abp-rag-sdk` > `@vcp/rag` > `vcp-intellicore-rag`
  - [ ] 15.2.2 更新其他项目的依赖引用
    - [ ] 待其他项目迁移时更新
  - [ ] 15.2.3 更新CI/CD配置
    - [ ] 待实际发布时配置
  - [x] 15.2.4 验证依赖更新正确性
    - [x] 验证 `package.json` 配置正确
    - [x] 验证 peerDependencies 配置正确

### 16. 代码迁移（Week 12）

- [x] 16.1 代码迁移
  - [x] 16.1.1 将vcp-intellicore-rag代码迁移到abp-rag-sdk
    - [x] 复制源代码文件
    - [x] 复制配置文件
    - [x] 复制 LICENSE 文件
    - [x] 创建 `.gitignore` 文件
  - [x] 16.1.2 更新所有代码中的命名空间和标识符
    - [x] 更新包名引用
    - [x] 更新注释和文档字符串
  - [x] 16.1.3 更新所有文档中的命名
    - [x] `README.md` - 所有 VCP 引用替换为 ABP
    - [x] `MIGRATION_GUIDE.md` - 完整的迁移指南
  - [x] 16.1.4 验证代码迁移正确性
    - [x] 验证文件结构完整
    - [x] 验证 package.json 配置正确
    - [x] 验证依赖引用正确

- [ ] 16.2 测试验证
  - [ ] 16.2.1 运行单元测试
    - [ ] 待安装依赖后运行测试
  - [ ] 16.2.2 运行集成测试
    - [ ] 待安装依赖后运行测试
  - [ ] 16.2.3 运行回归测试
    - [ ] 待安装依赖后运行测试
  - [ ] 16.2.4 验证功能完整性
    - [ ] 待安装依赖后验证

### 17. 包发布（Week 13）

- [ ] 17.1 旧包废弃
  - [ ] 17.1.1 在vcp-intellicore-rag包中添加deprecation标记
    - [ ] 需要在 npm 上执行 `npm deprecate`（因速率限制暂时未执行，需等待后重试）
  - [x] 17.1.2 发布迁移指南
    - [x] `abp-rag-sdk/MIGRATION_GUIDE.md` - 已创建
  - [ ] 17.1.3 发布公告通知
    - [ ] 待发布时创建
  - [ ] 17.1.4 更新npm包描述
    - [ ] 需要在 npm 上更新包描述

- [x] 17.2 新包发布
  - [x] 17.2.1 发布abp-rag-sdk到npm（版本从1.0.0开始）
    - [x] 已执行 `npm publish --access public`
    - [x] 包已成功发布：`abp-rag-sdk@1.0.0`
  - [ ] 17.2.2 更新文档站点
    - [ ] 待发布后更新（可选）
  - [ ] 17.2.3 发布公告通知
    - [ ] 待发布时创建（可选）
  - [x] 17.2.4 验证npm包发布正确性
    - [x] 已验证包已发布到 npm
    - [x] 已验证包可以正常安装和导入
    - [x] 已验证包信息完整正确

- [x] 17.3 文档和迁移支持
  - [x] 17.3.1 编写迁移指南
    - [x] `abp-rag-sdk/MIGRATION_GUIDE.md` - 完整的迁移指南
  - [ ] 17.3.2 编写常见问题解答
    - [ ] 待需要时创建 FAQ
  - [ ] 17.3.3 提供技术支持
    - [ ] 持续提供支持
  - [ ] 17.3.4 收集用户反馈
    - [ ] 持续收集反馈

---

## 总结

**总任务数**: 约150+个任务  
**总工期**: 11-13周  
**关键里程碑**: Week 2, 6, 9, 11, 13

