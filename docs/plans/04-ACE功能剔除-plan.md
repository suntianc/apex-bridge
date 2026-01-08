# 开发计划：ACE 功能剔除

**需求编号**: R-004
**计划版本**: 1.0.0
**创建日期**: 2026-01-08
**关联需求**: [04-ACE功能剔除.md](../requirements/04-ACE功能剔除.md)
**关联功能设计**: [04-ACE功能剔除.md](../functionality-design/04-ACE功能剔除-func/04-ACE功能剔除.md)
**状态**: 待评审

---

## 变更版本记录

| 版本 | 日期 | 变更内容 | 变更人 |
|------|------|----------|--------|
| 1.0 | 2026-01-08 | 初始版本 | - |

---

## 关联文档

- 需求文档：[04-ACE功能剔除.md](../requirements/04-ACE功能剔除.md)
- 架构设计：[总体架构设计.md](../architecture-design/总体架构设计.md)
- 功能设计：[04-ACE功能剔除.md](../functionality-design/04-ACE功能剔除-func/04-ACE功能剔除.md)

---

## 1. 需求概述

### 1.1 业务目标

剔除所有 ACE（Adaptive Cognitive Engine，自适应认知引擎）相关功能，回归轻量级的 AI Protocol 聊天服务定位。简化后的架构将保留核心的 LLM 调用能力和工具执行能力，移除所有认知增强层，显著降低系统复杂度并提高可维护性。

### 1.2 功能范围

#### 1.2.1 移除范围

| 模块类别 | 移除内容 |
|----------|----------|
| ACE 框架模块 | AceCore、AceService、AceIntegrator、AceStrategyManager、AceStrategyOrchestrator、AceEthicsGuard、StrategicContextManager、WorldModelUpdater |
| 上下文压缩模块 | CompressionService、ContextManager（ACE相关）、TokenCounter、CompressionStrategy |
| Playbook 系统模块 | PlaybookManager、PlaybookMatcher、PlaybookInjector、PlaybookCurator、PlaybookSynthesizer |
| 轨迹和反思模块 | 轨迹记录、反思周期、WorldModel 更新功能 |

#### 1.2.2 保留范围

| 模块类别 | 保留模块 |
|----------|----------|
| LLM 调用能力 | LLMManager、OpenAIAdapter、ClaudeAdapter、DeepSeekAdapter、ZhipuAdapter、OllamaAdapter、CustomAdapter |
| 工具执行能力 | ToolDispatcher、UnifiedToolManager、BuiltInExecutor、SkillsSandboxExecutor |
| 基础服务 | ConversationHistoryService、ToolRetrievalService、SearchEngine、SkillManager、MCPIntegrationService |
| 策略层 | ReActStrategy、SingleRoundStrategy（适配） |

---

## 2. 任务分解与优先级

### 2.1 基础设施任务（必须优先）

| 序号 | 任务 | 优先级 | 交付标准 | 预计工时 |
|------|------|--------|----------|----------|
| 1 | 依赖关系分析 | P0 | 完整的依赖图，所有引用关系明确 | 4h |
| 2 | 备份策略制定 | P0 | 备份脚本可用，回滚方案完整 | 2h |
| 3 | 测试基准建立 | P0 | 现有测试通过率 100%，建立性能基准 | 4h |

### 2.2 核心移除任务

| 序号 | 任务 | 优先级 | 交付标准 | 预计工时 | 依赖 |
|------|------|--------|----------|----------|------|
| 1 | 移除 ACE 框架模块 | P0 | 所有 ACE 模块删除，TypeScript 编译通过 | 16h | 依赖分析 |
| 2 | 移除上下文压缩模块 | P0 | CompressionService 等删除 | 8h | ACE 框架移除 |
| 3 | 移除 Playbook 系统模块 | P0 | Playbook 相关模块删除 | 12h | ACE 框架移除 |
| 4 | 移除轨迹和反思模块 | P0 | 轨迹记录、WorldModel 相关删除 | 6h | ACE 框架移除 |

### 2.3 适配重构任务

| 序号 | 任务 | 优先级 | 交付标准 | 预计工时 | 依赖 |
|------|------|--------|----------|----------|------|
| 1 | ChatService 简化重构 | P0 | ChatService 直接协调策略层，编译通过 | 16h | 模块移除 |
| 2 | ReActStrategy 适配 | P0 | 直接响应 ChatService 调用 | 6h | ChatService 重构 |
| 3 | SingleRoundStrategy 适配 | P0 | 直接响应 ChatService 调用 | 4h | ChatService 重构 |
| 4 | 配置兼容性处理 | P0 | 废弃配置项正确处理 | 4h | 模块移除 |

### 2.4 数据库迁移任务

| 序号 | 任务 | 优先级 | 交付标准 | 预计工时 | 依赖 |
|------|------|--------|----------|----------|------|
| 1 | 编写数据迁移脚本 | P1 | 迁移脚本可用，备份验证通过 | 8h | 模块移除 |
| 2 | 执行数据迁移 | P1 | 数据完整迁移，无丢失 | 4h | 迁移脚本 |
| 3 | 验证数据完整性 | P1 | 所有验证查询通过 | 2h | 数据迁移 |

### 2.5 测试验证任务

| 序号 | 任务 | 优先级 | 交付标准 | 预计工时 | 依赖 |
|------|------|--------|----------|----------|------|
| 1 | TypeScript 编译验证 | P0 | 编译无错误无警告 | 2h | 代码移除 |
| 2 | 单元测试执行 | P0 | 覆盖率 ≥ 80%，关键路径 100% | 8h | 代码适配 |
| 3 | API 接口测试 | P0 | 所有接口行为一致 | 8h | 代码适配 |
| 4 | 端到端测试 | P0 | 核心功能 100% 正常 | 8h | API 测试 |
| 5 | 性能测试 | P1 | 响应时间和资源使用达标 | 4h | E2E 测试 |

### 2.6 优先级说明

- **P0（必须完成）**：核心功能，缺失会导致系统不可用或编译失败
- **P1（应该完成）**：重要功能，确保数据完整性和性能达标
- **P2（可选完成）**：锦上添花，可延后实现

---

## 3. 阶段划分

### 阶段一：准备阶段

**目标**：完成依赖分析、备份和测试基准建立

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| 依赖关系分析 | 依赖图文档 | 所有 ACE 相关引用已识别 |
| 备份策略制定 | 备份脚本、回滚方案 | 备份可恢复，方案可执行 |
| 测试基准建立 | 测试报告、性能基准 | 现有测试通过率 100% |

**工时**：10 小时

### 阶段二：模块移除

**目标**：移除所有 ACE 相关模块

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| 移除 ACE 框架模块 | 删除的文件列表 | AceCore、AceService 等全部删除 |
| 移除上下文压缩模块 | 删除的文件列表 | CompressionService 等全部删除 |
| 移除 Playbook 系统模块 | 删除的文件列表 | PlaybookManager 等全部删除 |
| 移除轨迹和反思模块 | 删除的文件列表 | 轨迹记录、WorldModel 相关删除 |

**工时**：42 小时

### 阶段三：适配重构

**目标**：完成 ChatService 和策略层的适配

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| ChatService 简化重构 | 重构后的 ChatService | 直接协调策略层，编译通过 |
| ReActStrategy 适配 | 修改后的 ReActStrategy | 直接响应 ChatService 调用 |
| SingleRoundStrategy 适配 | 修改后的 SingleRoundStrategy | 直接响应 ChatService 调用 |
| 配置兼容性处理 | 配置处理逻辑 | 废弃配置项正确处理 |

**工时**：30 小时

### 阶段四：数据库迁移

**目标**：完成数据迁移和验证

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| 编写数据迁移脚本 | 迁移脚本 | 所有迁移脚本可用 |
| 执行数据迁移 | 迁移后的数据库 | Playbook、轨迹数据删除完成 |
| 验证数据完整性 | 验证报告 | 所有验证查询通过 |

**工时**：14 小时

### 阶段五：测试验证

**目标**：完成所有测试并修复问题

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| TypeScript 编译验证 | 编译结果 | 编译无错误无警告 |
| 单元测试执行 | 测试报告 | 覆盖率 ≥ 80%，关键路径 100% |
| API 接口测试 | 测试报告 | 所有接口行为一致 |
| 端到端测试 | 测试报告 | 核心功能 100% 正常 |
| 性能测试 | 性能报告 | 响应时间和资源使用达标 |
| 问题修复 | 修复记录 | 所有阻塞问题修复完成 |

**工时**：34 小时

---

## 4. 交付标准

### 4.1 代码交付标准

- [ ] 代码通过 Code Review
- [ ] 单元测试覆盖率 ≥ 80%（核心模块行覆盖率）
- [ ] 分支覆盖率 ≥ 70%
- [ ] 函数覆盖率 ≥ 85%
- [ ] 关键路径覆盖率 100%
- [ ] 无严重级别 Bug
- [ ] ESLint 检查通过
- [ ] Prettier 格式化通过

### 4.2 接口交付标准

- [ ] REST API 行为 100% 一致
- [ ] WebSocket API 行为 100% 一致
- [ ] 错误码和错误消息保持一致
- [ ] 超时和限流行为保持一致

### 4.3 功能交付标准

- [ ] 单轮对话正常响应
- [ ] 多轮对话上下文正确传递
- [ ] ReActStrategy 正常工作
- [ ] SingleRoundStrategy 正常工作
- [ ] 流式响应正常输出
- [ ] 内置工具正常执行
- [ ] Skill 工具正常执行
- [ ] MCP 工具正常执行

### 4.4 性能交付标准

- [ ] 简单对话请求平均响应时间 ≤ 2 秒
- [ ] 系统开销 ≤ 500 毫秒
- [ ] 流式响应首 token 延迟 ≤ 1 秒
- [ ] 并发处理能力 ≥ 100 请求/秒
- [ ] 内存使用空闲状态 ≤ 512 MB

---

## 5. 依赖关系

```
阶段一（准备）
    │
    ▼
阶段二（模块移除） ──────► 阶段三（适配重构）
    │                         │
    │                         ▼
    │                   阶段四（数据库迁移）
    │                         │
    │                         ▼
    └─────────────────► 阶段五（测试验证）
```

### 详细依赖

| 任务 | 前置依赖 |
|------|----------|
| 依赖关系分析 | 无 |
| 备份策略制定 | 依赖关系分析 |
| 测试基准建立 | 无 |
| 模块移除 | 依赖关系分析、备份策略 |
| ChatService 重构 | 模块移除 |
| 策略适配 | ChatService 重构 |
| 数据库迁移 | 模块移除、策略适配 |
| 测试验证 | 数据库迁移 |

---

## 6. 风险识别

| 风险 | 影响 | 可能性 | 应对措施 |
|------|------|--------|----------|
| 编译错误过多 | 项目无法启动 | 中 | 分批移除，每批编译验证 |
| API 行为不一致 | 客户端需要修改 | 低 | 建立接口契约测试 |
| 数据丢失 | 用户数据损失 | 低 | 执行完整备份，迁移前验证 |
| 性能下降 | 用户体验降低 | 中 | 建立性能基准，迁移后对比 |
| 回滚困难 | 问题无法快速恢复 | 中 | Git 备份完整，数据库备份可用 |
| 依赖链复杂 | 移除不完整 | 高 | 详细依赖分析，编译检查验证 |

---

## 7. 回滚计划

### 7.1 回滚触发条件

- TypeScript 编译失败且无法在 4 小时内修复
- 核心功能测试失败率超过 10%
- 生产环境出现严重问题

### 7.2 回滚执行步骤

1. 停止服务
2. 执行 Git 代码回滚
3. 恢复数据库（如需要）
4. 恢复配置文件
5. 启动服务
6. 验证服务正常

---

## 8. 工时汇总

| 阶段 | 工时（小时） |
|------|-------------|
| 阶段一：准备阶段 | 10 |
| 阶段二：模块移除 | 42 |
| 阶段三：适配重构 | 30 |
| 阶段四：数据库迁移 | 14 |
| 阶段五：测试验证 | 34 |
| **合计** | **130** |

---

## 9. 附录

### 9.1 移除文件清单

**ACE 框架模块**
```
src/services/ace/
├── AceCore.ts
├── AceService.ts
├── AceIntegrator.ts
├── AceStrategyManager.ts
├── AceStrategyOrchestrator.ts
├── AceEthicsGuard.ts
├── StrategicContextManager.ts
├── WorldModelUpdater.ts
└── types.ts
```

**上下文压缩模块**
```
src/services/compression/
├── CompressionService.ts
├── ContextManager.ts
├── TokenCounter.ts
└── CompressionStrategy.ts
```

**Playbook 系统模块**
```
src/services/playbook/
├── PlaybookManager.ts
├── PlaybookMatcher.ts
├── PlaybookInjector.ts
├── PlaybookCurator.ts
├── PlaybookSynthesizer.ts
└── types.ts
```

### 9.2 需要删除的数据库表

| 表类别 | 表名 |
|--------|------|
| Playbook 相关 | playbooks、playbook_versions、playbook_usage_stats、playbook_curation_queue |
| 轨迹相关 | reasoning_traces、execution_steps、trace_analytics |
| WorldModel 相关 | world_models、world_model_states、world_model_training_data |
| 压缩相关 | compression_history、compression_stats、token_usage_records |
| ACE 配置 | ace_configurations、ace_strategy_registry、ace_context_states |

---

**计划版本**: 1.0.0
**创建日期**: 2026-01-08
**状态**: 待评审
