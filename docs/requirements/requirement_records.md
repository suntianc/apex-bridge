# 需求记录

**项目**: apex-bridge
**维护日期**: 2025-12-30

---

## 需求清单

| 序号 | 需求名称 | 优先级 | 状态 | 关联文档 |
|------|----------|--------|------|----------|
| R-001 | 项目重构需求（试点 ConfigService） | 高 | 评审通过 | 01-project-refactoring.md |
| FD-001 | ConfigService 重构功能设计 | 高 | 评审通过 | [01-ConfigService-refactoring.md](/Users/suntc/project/apex-bridge/docs/functionality-design/01-ConfigService-refactoring.md)|

---

## R-001: 项目重构需求（试点 ConfigService）

### 需求概述

对 apex-bridge 项目进行分阶段重构，解决代码臃肿、职责混乱、冗余代码、类型系统问题，以 ConfigService 为试点模块。

### 关键决策

1. **试点模块选择**: ConfigService
   - 理由：1050 行超大文件，问题明确，风险可控
   - 预估工时：4 周

2. **重构范围**:
   - 文件拆分：从 1 个 1050 行文件拆分为 7 个小文件
   - 类型独立：20+ 接口定义迁移到 types/config/ 目录
   - 服务拆分：ConfigLoader、ConfigValidator、ConfigWriter

3. **兼容性约束**:
   - API 接口保持不变
   - 配置 JSON 结构保持不变
   - 提供类型别名兼容层

### 验收标准

- [ ] 单个文件不超过 500 行
- [ ] 消除所有 `any` 类型
- [ ] 单元测试覆盖率 80%+
- [ ] TypeScript 编译无错误
- [ ] 现有功能 100% 正常

### 分阶段计划

| 阶段 | 内容 | 预估工时 |
|------|------|----------|
| 阶段一 | 准备阶段（测试基准、依赖分析） | 1 周 |
| 阶段二 | 类型拆分（配置类型独立） | 1 周 |
| 阶段三 | 服务拆分（ConfigLoader/Validator/Writer） | 1 周 |
| 阶段四 | 兼容性与优化 | 1 周 |

### 后续计划

ConfigService 重构完成后，推广经验至：
1. PlaybookMatcher (2周)
2. ChatService (3周)
3. UnifiedToolManager (2周)
4. 类型系统统一 (2周)

---

## FD-001: ConfigService 重构功能设计

### 文档位置

`docs/functionality-design/01-ConfigService-refactoring.md`

### 设计概述

基于 R-001 需求，对 ConfigService 模块进行功能级详细设计：

1. **模块结构设计**:
   - 目标目录结构：7 个文件分散职责
   - 文件职责划分清晰
   - 依赖关系图

2. **类型拆分方案**:
   - ApiKeyInfo -> types/config/api-key.ts
   - RateLimit* -> types/config/rate-limit.ts
   - RedisConfig -> types/config/redis.ts
   - Ace* -> types/config/ace.ts
   - AdminConfig/SystemConfig/FullConfig -> types/config/admin.ts

3. **服务拆分设计**:
   - ConfigLoader: 配置加载和缓存
   - ConfigValidator: 配置验证逻辑
   - ConfigWriter: 配置更新和合并
   - ConfigConstants: 默认配置常量

4. **接口兼容性设计**:
   - 类型别名兼容层
   - API 接口保持不变
   - 数据格式兼容性

### 关键设计决策

| 决策项 | 决策 | 理由 |
|--------|------|------|
| 类型文件位置 | types/config/ 子目录 | 与现有 types/ 目录结构一致 |
| 工具文件位置 | utils/config/ 子目录 | 与现有 utils/ 目录结构一致 |
| 默认常量位置 | utils/config-constants.ts | 避免循环依赖 |
| 主服务简化 | 使用组合而非继承 | 更灵活的依赖注入 |

### 迁移步骤

| 阶段 | 内容 | 预计工时 |
|------|------|----------|
| 第一阶段 | 创建 6 个类型文件 | 4h |
| 第二阶段 | 创建 4 个工具服务 | 6h |
| 第三阶段 | 重构 ConfigService 主服务 | 3h |
| 第四阶段 | 验证与测试 | 3h |

### 验收标准

- [ ] 单个文件不超过 300 行
- [ ] TypeScript 编译无错误
- [ ] API 接口行为 100% 一致
- [ ] 单元测试覆盖率 80%+
- [ ] 文档更新完整

### 关联需求

- R-001: 项目重构需求（试点 ConfigService）

---

## 版本历史

| 版本 | 日期 | 描述 |
|------|------|------|
| 1.0.0 | 2025-12-29 | 初始需求记录 |
| 1.1.0 | 2025-12-30 | 添加功能设计文档关联 (FD-001) |
| 1.2.0 | 2025-12-30 | 状态更新：评审通过 |
