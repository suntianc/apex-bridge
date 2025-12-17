# Playbook 实施路线图

## 📋 文档概述

本目录包含 ApexBridge Playbook 机制的完整实施方案，按阶段拆解为可落地的详细设计文档。

## 🎯 实施阶段总览

| 阶段 | 文档 | 工作量 | 优先级 | 状态 |
|------|------|--------|--------|------|
| **Stage 0** | [01-stage0-verification.md](01-stage0-verification.md) | 2h | ⭐ 前置 | 📝 待开始 |
| **Stage 0.5** | [02-stage0.5-task-queue.md](02-stage0.5-task-queue.md) | 4h | 🔴 P0 | 📝 待开始 |
| **Stage 0.6** | [03-stage0.6-trajectory-quality.md](03-stage0.6-trajectory-quality.md) | 2h | 🔴 P0 | 📝 待开始 |
| **Stage 1** | [04-stage1-reflector-mvp.md](04-stage1-reflector-mvp.md) | 16h | 🔴 P0 | 📝 待开始 |
| **Stage 2** | [05-stage2-generator-upgrade.md](05-stage2-generator-upgrade.md) | 8h | 🟠 P1 | 📝 待开始 |
| **Stage 3** | [06-stage3-curator-maintenance.md](06-stage3-curator-maintenance.md) | 14h | 🟡 P2 | 📝 待开始 |
| **Stage 3.5** | [07-stage3.5-forced-execution.md](07-stage3.5-forced-execution.md) | 6h | 🟠 P1 | 📝 待开始 |

## 📊 工作量统计

### 最小可行路径 (MVP)
```
Stage 0 (2h) + Stage 0.5 (4h) + Stage 0.6 (2h) + Stage 1 (16h) = 24 小时
约 3 个周末，可体验完整 Playbook 循环
```

### 推荐完整路径
```
Stage 0-3.5 全部完成 = 52 小时
约 6-7 个周末，包含所有工程修正
```

## 🎯 核心目标

### 阶段 0：[现有功能验证](01-stage0-verification.md)
- **目标**: 确认 PlaybookManager 和 PlaybookMatcher 基础功能正常
- **关键产出**: 验证测试脚本，确认基础设施可用
- **决策点**: 如果验证失败，需先修复基础功能

### 阶段 0.5：[任务队列基础设施](02-stage0.5-task-queue.md)
- **目标**: 解决 Electron 应用运行环境冲突（无 Cron 任务）
- **关键产出**: SQLite 任务队列 + 事件驱动触发 + 闲时调度器
- **技术价值**: 消除启动卡顿风险，提升 100%

### 阶段 0.6：[Trajectory-质量提升](03-stage0.6-trajectory-quality.md)
- **目标**: 为 Reflector 准备高质量数据
- **关键产出**: 结构化错误类型（8 种 ErrorType）+ 详细工具调用元数据
- **技术价值**: Reflector 准确率从 40% → 80%

### 阶段 1：[补全-Reflector-(MVP)](04-stage1-reflector-mvp.md)
- **目标**: 实现失败案例对比分析，生成风险规避型 Playbook
- **关键产出**: 规则引擎 + 3-5 种常见错误模式硬编码
- **技术价值**: 80% 常见问题自动识别反模式

### 阶段 2：升级 [Generator-批量能力](05-stage2-generator-upgrade.md)
- **目标**: 从多个相似 Trajectory 聚类提取通用模式
- **关键产出**: 批量提取 API + 简单聚类算法
- **技术价值**: 减少 LLM 调用次数，提升提取质量

### 阶段 3：[完善-Curator-自动维护](06-stage3-curator-maintenance.md)
- **目标**: Playbook 去重、归档、混合检索
- **关键产出**: 自动维护定时任务 + BM25 + 向量混合检索
- **技术价值**: 检索精度从 70% → 85%

### 阶段 3.5：[Playbook-强制执行](07-stage3.5-forced-execution.md)
- **目标**: 将 Playbook 转换为强制执行的 Plan 对象
- **关键产出**: PlaybookExecutor + Plan 验证逻辑
- **技术价值**: 执行成功率从 60% → 85%

## 🔧 技术架构演进

### 第一阶段（MVP - 24h）
```
┌─────────────────────────────────────────┐
│  任务完成 → Trajectory 保存              │
│      ↓                                   │
│  SQLite 任务队列 (reflection_queue)      │
│      ↓                                   │
│  手动触发 / 闲时调度                     │
│      ↓                                   │
│  PlaybookReflector (规则引擎)            │
│      ↓                                   │
│  风险规避型 Playbook 生成                │
└─────────────────────────────────────────┘
```

### 第二阶段（完整版 - 52h）
```
┌─────────────────────────────────────────┐
│  任务完成 → Trajectory (增强版)          │
│      ↓                                   │
│  SQLite 任务队列 (优先级/重试)           │
│      ↓                                   │
│  闲时调度器 (CPU < 30%)                  │
│      ↓                                   │
│  ┌───────────────────────────────┐      │
│  │ Generator (批量聚类)          │      │
│  │ Reflector (规则引擎 MVP)      │      │
│  │ Curator (去重/归档/混合检索)  │      │
│  └───────────────────────────────┘      │
│      ↓                                   │
│  Playbook 存储 (LanceDB + SQLite)        │
│      ↓                                   │
│  混合检索 (BM25 + Vector + RRF)          │
│      ↓                                   │
│  PlaybookExecutor → Plan 对象            │
│      ↓                                   │
│  强制执行 + 成功率追踪                   │
└─────────────────────────────────────────┘
```

## 📝 文档使用说明

### 每个阶段文档包含：

1. **目标与背景** - 为什么要做这个阶段
2. **技术方案** - 详细的实现设计
3. **数据结构** - 数据库表/TypeScript 接口
4. **核心代码** - 可直接使用的代码模板
5. **测试验收** - 具体的测试场景和验收标准
6. **时间估算** - 每个子任务的工作量
7. **依赖关系** - 前置条件和后续阶段

### 建议阅读顺序：

1. **先读本文档** (00-implementation-roadmap.md) - 了解全局
2. **按优先级阅读** - 从 Stage 0 → Stage 3.5
3. **边实施边调整** - 根据实际情况调整工作量
4. **记录问题** - 遇到问题在文档中补充说明

## 🎓 关键设计决策

### 决策 1：为什么先做 Reflector 而非 Generator？
**理由**：Generator 已有 40% 实现（PlaybookManager.extractPlaybookFromLearning()），但 Reflector 完全缺失（0%）。Reflector 的价值在于：
- 从失败中学习（比从成功中学习更有价值）
- 生成风险规避型 Playbook（防止重复犯错）
- 规则引擎 MVP 可快速交付价值（不依赖复杂 LLM 分析）

### 决策 2：为什么使用规则引擎而非 LLM-first？
**理由**：根据工程评审反馈：
- 80% 的错误是常见模式（Timeout, RateLimit, NetworkError）
- 规则引擎处理这 80% 的准确率可达 80-90%
- LLM 用于处理 20% 的长尾问题
- 节省成本，提升响应速度

### 决策 3：为什么需要 Stage 0.5 和 0.6？
**理由**：这是 v3.1 版本的关键修正：
- **Stage 0.5（任务队列）**: ApexBridge 是 Electron 应用，晚上会关机，Cron 任务不可行。必须使用事件驱动 + 持久化队列。
- **Stage 0.6（数据质量）**: Reflector 需要结构化错误信息才能有效工作。只有字符串错误无法推导反模式。

### 决策 4：为什么 AFS 是可选的？
**理由**：对于个人项目：
- Playbook 机制本身可以独立工作（不依赖 AFS）
- AFS 是架构升级（50h+），投入产出比较低
- 先验证 Playbook 价值，再决定是否引入 AFS

## 🚀 快速启动指南

### 本周末开始（2 小时）
```bash
# 1. 阅读 Stage 0 文档
open docs/08-playbook-implementation/01-stage0-verification.md

# 2. 运行验证测试
npm run test:playbook:verify

# 3. 如果验证通过，进入 Stage 0.5
open docs/08-playbook-implementation/02-stage0.5-task-queue.md
```

### 第一个月目标（24 小时）
- ✅ 完成 Stage 0 - 0.6（基础设施）
- ✅ 完成 Stage 1（Reflector MVP）
- ✅ 生成至少 3 个风险规避型 Playbook
- ✅ 验证 Playbook 在实际任务中的应用效果

### 三个月目标（52 小时）
- ✅ 完成所有阶段（0 - 3.5）
- ✅ Playbook 库积累 10+ 个
- ✅ 系统能够自主进化（自动生成、反思、优化）
- ✅ 混合检索精度达到 85%

## 📚 相关文档

- **可行性分析报告**: [ACE架构与EiC融合可行性分析报告.md](../../ACE架构与EiC融合可行性分析报告.md)
- **工程修正文档**: [playbook-implementation-fixes.md](../playbook-implementation-fixes.md)
- **项目架构**: [openspec/project.md](../../openspec/project.md)

## 🤝 贡献指南

如果你在实施过程中：
- 发现文档有误 → 直接修改对应的 markdown 文件
- 遇到技术难题 → 在文档末尾添加 "❓ 常见问题" 章节
- 找到更好的方案 → 更新 "技术方案" 章节并标注修改日期
- 完成某个阶段 → 更新本文档的 "状态" 列为 ✅ 已完成

---

**文档版本**: v1.0
**创建日期**: 2025-12-16
**最后更新**: 2025-12-16
**维护者**: ApexBridge Team
