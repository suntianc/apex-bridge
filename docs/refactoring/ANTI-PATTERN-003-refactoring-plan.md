# ANTI-PATTERN-003 重构计划：大类/长函数重构

## 问题概述

以下文件超过 800 行，需要按职责拆分为多个类：

| 文件                                    | 行数 | 问题                                     |
| --------------------------------------- | ---- | ---------------------------------------- |
| `src/services/ToolRetrievalService.ts`  | 1359 | 混合职责：数据库连接、索引操作、嵌入逻辑 |
| `src/services/SkillManager.ts`          | 981  | 技能生命周期管理过于集中                 |
| `src/api/controllers/ChatController.ts` | 873  | 聊天控制逻辑复杂                         |

## 重构目标

将大类拆分为专注的、可维护的组件，遵循单一职责原则。

## 重构方案

### ToolRetrievalService.ts 重构

当前结构：

```
ToolRetrievalService
├── 数据库连接逻辑
├── 向量索引操作
├── 嵌入生成
├── 搜索逻辑
└── 工具索引
```

目标结构：

```
src/services/tool-retrieval/
├── ToolRetrievalService.ts      # 核心编排（精简版）
├── LanceDBConnectionManager.ts  # 数据库连接管理
├── VectorIndexManager.ts        # 索引操作
├── EmbeddingGenerator.ts        # 嵌入逻辑
└── ToolIndex.ts                 # 工具索引
```

### SkillManager.ts 重构

当前结构：

```
SkillManager
├── 技能安装
├── 技能卸载
├── 技能列表
├── 技能执行
└── 技能索引
```

目标结构：

```
src/services/skill/
├── SkillManager.ts              # 主服务（精简版）
├── SkillInstaller.ts            # ZIP 安装逻辑
├── SkillLifecycleManager.ts     # 生命周期管理
├── SkillRegistry.ts             # 技能注册表
└── SkillExecutor.ts             # 技能执行
```

### ChatController.ts 重构

当前结构：

```
ChatController
├── 聊天完成处理
├── 流式处理
├── SSE 设置
└── 响应解析
```

目标结构：

```
src/api/controllers/
├── ChatController.ts            # 主控制器（精简版）
├── ChatCompletionHandler.ts     # 完成处理
├── StreamHandler.ts             # 流式处理
└── ResponseParser.ts            # 响应解析
```

## 实施步骤

### 阶段 1：创建新文件（1-2 天）

1. 创建新的子模块目录
2. 创建精简版主服务
3. 创建独立的管理器类

### 阶段 2：迁移逻辑（2-3 天）

1. 将逻辑从大类迁移到新类
2. 更新导入和依赖
3. 保持向后兼容

### 阶段 3：测试和验证（2-3 天）

1. 运行单元测试
2. 运行集成测试
3. 验证功能完整性

### 阶段 4：清理（1 天）

1. 删除旧的大类
2. 更新文档
3. 删除未使用的代码

## 时间估算

| 阶段               | 时间       |
| ------------------ | ---------- |
| 阶段 1：创建新文件 | 1-2 天     |
| 阶段 2：迁移逻辑   | 2-3 天     |
| 阶段 3：测试和验证 | 2-3 天     |
| 阶段 4：清理       | 1 天       |
| **总计**           | **6-9 天** |

## 风险和注意事项

1. **向后兼容**：确保现有 API 端点保持不变
2. **测试覆盖**：确保有足够的测试覆盖
3. **性能影响**：新设计不应降低性能
4. **代码审查**：每个阶段需要代码审查

## 验收标准

1. 所有文件不超过 500 行
2. 每个类有明确的单一职责
3. 所有测试通过
4. 功能保持不变
