# Playbook 系统架构改造 - 设计文档索引

## 文档概览

本文档索引包含 Playbook 系统从"预设类型+强制执行"升级为"动态类型+提示词注入"的完整设计文档集合。

## 文档结构

### 📋 总览文档

| 文档 | 描述 | 状态 |
|------|------|------|
| [01-ARCHITECTURE-OVERVIEW.md](01-ARCHITECTURE-OVERVIEW.md) | 总体架构设计文档，包含改造目标、核心组件、数据流 | ✅ 完成 |
| [00-INDEX.md](00-INDEX.md) | 本文档，文档索引和导航 | ✅ 完成 |

### 🗄️ 数据与模型

| 文档 | 描述 | 状态 |
|------|------|------|
| [02-DATA-MODEL-DESIGN.md](02-DATA-MODEL-DESIGN.md) | 详细数据模型设计，包含新表结构、迁移策略、数据访问层 | ✅ 完成 |

### ⚙️ 核心组件

| 文档 | 描述 | 状态 |
|------|------|------|
| [03-CORE-COMPONENTS-DESIGN.md](03-CORE-COMPONENTS-DESIGN.md) | 核心组件详细设计：TypeInductionEngine、PlaybookTemplateManager、PlaybookInjector、增强的 PlaybookMatcher | ✅ 完成 |

### 🌐 API 与接口

| 文档 | 描述 | 状态 |
|------|------|------|
| [04-API-DESIGN.md](04-API-DESIGN.md) | API 接口设计，包含外部接口、内部接口、WebSocket 接口、错误处理 | ✅ 完成 |

### 📅 实施计划

| 文档 | 描述 | 状态 |
|------|------|------|
| [05-IMPLEMENTATION-PLAN.md](05-IMPLEMENTATION-PLAN.md) | 详细的 8 周实施计划，包含任务分解、里程碑、资源分配、风险应对 | ✅ 完成 |

### 🔄 迁移方案

| 文档 | 描述 | 状态 |
|------|------|------|
| [06-MIGRATION-GUIDE.md](06-MIGRATION-GUIDE.md) | 完整的迁移指南，包含数据迁移、代码改造、功能切换、验证清单 | ✅ 完成 |

### 🧪 测试策略

| 文档 | 描述 | 状态 |
|------|------|------|
| [07-TESTING-STRATEGY.md](07-TESTING-STRATEGY.md) | 全面的测试策略，包含单元测试、集成测试、端到端测试、性能测试、混沌测试 | ✅ 完成 |

## 快速导航

### 👨‍💼 管理者
如果您是项目管理者，建议阅读顺序：
1. [01-ARCHITECTURE-OVERVIEW.md](01-ARCHITECTURE-OVERVIEW.md) - 了解改造概览
2. [05-IMPLEMENTATION-PLAN.md](05-IMPLEMENTATION-PLAN.md) - 查看实施计划
3. [06-MIGRATION-GUIDE.md](06-MIGRATION-GUIDE.md) - 了解迁移风险

### 👨‍💻 开发者
如果您是后端/前端开发者，建议阅读顺序：
1. [02-DATA-MODEL-DESIGN.md](02-DATA-MODEL-DESIGN.md) - 理解数据模型
2. [03-CORE-COMPONENTS-DESIGN.md](03-CORE-COMPONENTS-DESIGN.md) - 掌握核心组件设计
3. [04-API-DESIGN.md](04-API-DESIGN.md) - 熟悉 API 接口
4. [07-TESTING-STRATEGY.md](07-TESTING-STRATEGY.md) - 了解测试要求

### 🧪 测试工程师
如果您是测试工程师，建议阅读顺序：
1. [07-TESTING-STRATEGY.md](07-TESTING-STRATEGY.md) - 了解测试策略
2. [06-MIGRATION-GUIDE.md](06-MIGRATION-GUIDE.md) - 了解验证清单
3. [05-IMPLEMENTATION-PLAN.md](05-IMPLEMENTATION-PLAN.md) - 查看测试时间表

### 🔄 运维工程师
如果您是运维工程师，建议阅读顺序：
1. [06-MIGRATION-GUIDE.md](06-MIGRATION-GUIDE.md) - 了解部署和回滚
2. [04-API-DESIGN.md](04-API-DESIGN.md) - 查看监控指标
3. [07-TESTING-STRATEGY.md](07-TESTING-STRATEGY.md) - 了解性能基准

## 文档依赖关系

```
01-ARCHITECTURE-OVERVIEW.md
    ↓
    ├─ 02-DATA-MODEL-DESIGN.md
    ├─ 03-CORE-COMPONENTS-DESIGN.md
    ├─ 04-API-DESIGN.md
    └─ 05-IMPLEMENTATION-PLAN.md
            ↓
    ├─ 06-MIGRATION-GUIDE.md
    └─ 07-TESTING-STRATEGY.md
```

## 核心概念速查

### 术语表

| 术语 | 定义 |
|------|------|
| **TypeInductionEngine** | 类型归纳引擎，从历史数据中自动归纳动态类型标签 |
| **PlaybookTemplateManager** | 提示词模板管理器，负责模板渲染和效果评估 |
| **PlaybookInjector** | 提示词注入器，将 Playbook 指导注入到 LLM 推理链 |
| **TypeVocabulary** | 类型词汇表，存储所有动态类型标签及其元数据 |
| **type_tags** | 多标签数组，每个 Playbook 可关联多个类型标签 |
| **type_confidence** | 类型置信度映射，记录每个标签的关联置信度 |
| **guidance_level** | 指导强度，分为 light/medium/intensive 三级 |
| **dynamic_type** | 动态类型，从历史数据中自然归纳，无预设层次 |
| **prompt_template** | 提示词模板，用于将 Playbook 转换为可读指导 |
| **injection_point** | 注入点，支持 system_prompt/user_message/thinking_chain |

### 关键数字

| 指标 | 目标值 |
|------|--------|
| 类型归纳置信度阈值 | ≥ 0.8 |
| Playbook 匹配准确率 | ≥ 85% |
| 提示词注入成功率 | ≥ 95% |
| 单元测试覆盖率 | ≥ 90% |
| 响应时间 P95 | < 200ms |
| 项目周期 | 8 周 |

### 重要路径

| 路径 | 描述 |
|------|------|
| `src/core/playbook/` | 核心组件目录 |
| `src/services/` | 服务层目录 |
| `src/strategies/` | 策略层目录 |
| `src/database/migrations/` | 数据库迁移脚本 |
| `tests/unit/` | 单元测试 |
| `tests/integration/` | 集成测试 |
| `tests/e2e/` | 端到端测试 |
| `tests/performance/` | 性能测试 |
| `scripts/migration/` | 迁移脚本 |

## 版本历史

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| v1.0.0 | 2025-12-18 | 初始版本，完成所有设计文档 |

## 反馈与贡献

如果您对这些设计文档有任何建议或发现问题，请：

1. 在项目仓库中创建 Issue
2. 联系项目维护者
3. 参与设计评审会议

## 许可

本设计文档遵循项目整体的开源许可证。

---

**最后更新**: 2025-12-18
**维护者**: 系统架构团队
**状态**: ✅ 完成
