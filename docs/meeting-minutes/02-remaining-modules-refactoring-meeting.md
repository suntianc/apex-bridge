# 需求讨论纪要：剩余模块重构需求（R-002）

**会议日期**: 2025-12-30
**讨论需求**: R-002 剩余模块重构需求
**参与人员**: -
**记录状态**: 已评审

---

## 1. 讨论背景

在 ConfigService 重构试点完成后（R-001），项目仍有4个超大服务文件需要重构：
- PlaybookMatcher.ts (1326行)
- ChatService.ts (1190行)
- ToolRetrievalService.ts (1149行)
- AceStrategyManager.ts (1062行)

## 2. 重构顺序确认

### 2.1 推荐顺序

| 阶段 | 模块 | 工时 | 理由 |
|------|------|------|------|
| Phase 1 | PlaybookMatcher | 2周 | 问题最明确，收益高 |
| Phase 2 | ToolRetrievalService | 1.5周 | 相对独立，风险低 |
| Phase 3 | AceStrategyManager | 2周 | 与Playbook系统深度耦合 |
| Phase 4 | ChatService | 3周 | 核心服务，风险最高 |

**决策**: ✅ 同意此顺序

## 3. 拆分方案确认

### 3.1 PlaybookMatcher (1326行 → 5个文件)

| 拆分文件 | 职责 | 预估行数 |
|----------|------|----------|
| PlaybookMatcher.ts | 主协调器 | 200 |
| ScoreCalculator.ts | 统一评分算法 | 200 |
| DynamicTypeMatcher.ts | 动态类型匹配 | 250 |
| SequenceRecommender.ts | 序列推荐 | 200 |
| PlaybookCurator.ts | 知识库维护 | 250 |

**决策**: ✅ 同意此拆分

### 3.2 ToolRetrievalService (1149行 → 6个文件)

| 拆分文件 | 职责 | 预估行数 |
|----------|------|----------|
| ToolRetrievalService.ts | 主服务 | 200 |
| LanceDBConnection.ts | 数据库连接 | 150 |
| EmbeddingGenerator.ts | 嵌入生成 | 200 |
| SkillIndexer.ts | 技能索引 | 200 |
| SearchEngine.ts | 搜索逻辑 | 200 |
| MCPToolSupport.ts | MCP工具支持 | 150 |

**决策**: ✅ 同意此拆分

### 3.3 AceStrategyManager (1062行 → 5个文件)

| 拆分文件 | 职责 | 预估行数 |
|----------|------|----------|
| AceStrategyManager.ts | 主协调器 | 250 |
| StrategicContextManager.ts | 战略上下文管理 | 200 |
| WorldModelUpdater.ts | 世界模型更新 | 200 |
| PlaybookSynthesis.ts | Playbook自动提炼 | 250 |
| MemoryManager.ts | 内存管理 | 150 |

**关键决策**: ✅ AceStrategyManager 内部实例化的 PlaybookManager 和 PlaybookMatcher 改为**依赖注入**

### 3.4 ChatService (1190行 → 6个文件)

| 拆分文件 | 职责 | 预估行数 |
|----------|------|----------|
| ChatService.ts | 主协调器 | 300 |
| MessageProcessor.ts | 消息处理 | 250 |
| SessionCoordinator.ts | 会话协调 | 200 |
| StreamHandler.ts | 流式处理 | 200 |
| EthicsFilter.ts | 伦理审查 | 150 |
| ContextManager.ts | 上下文管理 | 200 |

**关键决策**: ✅ ChatService **不引入依赖注入容器**，保持现状仅拆分职责

## 4. 测试标准确认

### 4.1 单元测试覆盖率

**要求**: 单元测试覆盖率不低于 80%

**决策**: ✅ 80% 合理

### 4.2 验收标准

- [ ] 单个文件不超过 500 行
- [ ] 消除所有 `any` 类型
- [ ] 单元测试覆盖率 80%+
- [ ] TypeScript 编译无错误
- [ ] 现有功能 100% 正常
- [ ] 保持公共 API 不变

## 5. 兼容性约束确认

### 5.1 必须保持的接口

**PlaybookMatcher**:
```typescript
matchPlaybooks(), findSimilarPlaybooks(), recommendPlaybookSequence()
```

**ToolRetrievalService**:
```typescript
initialize(), findRelevantSkills(), indexSkill(), scanAndIndexAllSkills()
```

**AceStrategyManager**:
```typescript
loadStrategicContext(), updateWorldModel(), retrieveStrategicKnowledge()
```

**ChatService**:
```typescript
processMessage(), streamMessage(), getStatus()
```

### 5.2 迁移策略

- **并行运行**：新模块与旧代码并行运行
- **Feature Flag**：通过配置切换新旧实现
- **回滚机制**：发现问题可快速回滚

**决策**: ✅ 同意以上兼容性约束

## 6. 风险与缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 改动影响Playbook推荐准确性 | 高 | 建立功能测试基准，自动化回归测试 |
| 核心聊天逻辑中断 | 极高 | 建立完整集成测试，Feature Flag切换 |
| 向量检索功能中断 | 高 | 建立功能测试基准 |
| ACE战略功能中断 | 中 | 建立功能测试基准 |

## 7. 后续计划

| 阶段 | 模块 | 工时 |
|------|------|------|
| Phase 1 | PlaybookMatcher | 2周 |
| Phase 2 | ToolRetrievalService | 1.5周 |
| Phase 3 | AceStrategyManager | 2周 |
| Phase 4 | ChatService | 3周 |
| **合计** | | **8.5周** |

## 8. 关联文档

| 文档 | 路径 | 状态 |
|------|------|------|
| 需求清单 | `docs/requirements/02-remaining-modules-refactoring.md` | ✅ 已评审 |

---

## 讨论结论

本次讨论确认了以下关键决策：

1. ✅ 重构顺序：PlaybookMatcher → ToolRetrievalService → AceStrategyManager → ChatService
2. ✅ 拆分方案：每个模块按职责拆分为 4-6 个文件
3. ✅ AceStrategyManager 改为依赖注入模式
4. ✅ ChatService 不引入依赖注入容器
5. ✅ 单元测试覆盖率要求 80%
6. ✅ 保持所有公共 API 不变

---

**记录日期**: 2025-12-30
**状态**: 已评审
