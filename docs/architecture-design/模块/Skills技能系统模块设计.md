# Skills 技能系统模块设计

> 所属模块：Skills
> 文档版本：v1.0.0
> 创建日期：2025-12-29

## 1. 模块概述

Skills 系统是 ApexBridge 的工具执行框架，支持通过 Skills 扩展系统的能力。

### 1.1 模块职责

- Skills 生命周期管理（安装、卸载、索引）
- Skills 执行（本地执行、沙箱执行）
- Skills 向量索引与检索
- ABP 协议工具调用映射

### 1.2 目录结构

```
skills/                          # Skills 根目录
├── {skill-id}/                  # 单个 Skill
│   ├── SKILL.md                 # Skill 定义文件
│   ├── scripts/
│   │   └── execute.ts           # 执行入口
│   ├── src/                     # 源代码
│   └── config/                  # 配置
│       └── skill.json
├── installed/                   # 已安装 Skills
├── builtin/                     # 内置 Skills
└── index/                       # 向量索引

src/services/
└── SkillManager.ts              # Skills 管理器

src/core/
├── skills/
│   ├── SkillsSandboxExecutor.ts # 沙箱执行器
│   ├── BuiltInExecutor.ts       # 内置执行器
│   ├── ToolDispatcher.ts        # 工具调度器
│   └── types.ts                 # 类型定义
```

---

## 2. Skill 结构

### 2.1 SKILL.md 格式

```markdown
---
name: {skill-name}
version: {semver}
description: {描述}
author: {作者}
tags: [tag1, tag2]
abp:
  tools:
    - name: {工具名}
      kind: {direct | internal}
      parameters:
        type: object
        properties:
          param1:
            type: string
            description: 参数描述
        required: [param1]
---

# Skill 主体

## 功能描述
...

## 使用示例
...
```

### 2.2 工具类型

| 类型 | 执行方式 | 用途 |
|------|----------|------|
| `direct` | 本地同步执行 | 简单工具 |
| `internal` | 核心系统内置 | 系统级功能 |

### 2.3 scripts/execute.ts

```typescript
// 直接执行类型
export interface DirectExecuteFunc {
  (params: Record<string, any>): Promise<ExecuteResult>;
}

// 内部执行类型
export interface InternalExecuteFunc {
  (context: ExecutionContext): Promise<ExecuteResult>;
}

export default async function execute(
  params: Record<string, any>
): Promise<ExecuteResult> {
  // 实现逻辑
  return { success: true, data: result };
}
```

---

## 3. 核心组件

### 3.1 SkillManager

**职责**：Skills 生命周期管理

**核心方法**：
- `getInstance()` - 单例获取
- `installSkill(skillPath: string)` - 安装 Skill
- `uninstallSkill(skillId: string)` - 卸载 Skill
- `listSkills()` - 列出所有 Skills
- `getSkill(skillId: string)` - 获取 Skill
- `reindexSkills()` - 重新索引
- `searchSkills(query: string)` - 搜索 Skills

### 3.2 BuiltInExecutor

**职责**：内置工具执行

**内置工具**：
| 工具名 | 功能 |
|--------|------|
| `file_read` | 读取文件 |
| `file_write` | 写入文件 |
| `vector_search` | 向量检索 |
| `web_search` | 网络搜索 |
| `shell_exec` | Shell 执行 |

### 3.3 SkillsSandboxExecutor

**职责**：隔离的 Skill 执行

**特性**：
- 进程隔离
- 资源限制
- 超时控制
- 错误捕获

### 3.4 ToolDispatcher

**职责**：工具调用分发

**流程**：
```
Tool Call --> ToolDispatcher
                    |
        ┌───────────┼───────────┐
        v           v           v
   BuiltInExec  SkillExec    External
```

---

## 4. 执行流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      Skill 执行流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LLM 生成 Tool Call                                             │
│         │                                                       │
│         v                                                       │
│  ReActEngine.processStep()                                      │
│         │                                                       │
│         v                                                       │
│  ToolDispatcher.dispatch(toolCall)                              │
│         │                                                       │
│    ┌────┴────┐                                                  │
│    v         v                                                  │
│ BuiltIn    Skill                                                │
│    │         │                                                  │
│    v         v                                                  │
│ Executor  SandboxExecutor                                       │
│    │         │                                                  │
│    └────┬────┘                                                  │
│         │                                                       │
│         v                                                       │
│  Observation 返回 LLM                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 向量索引

### 5.1 索引结构

```typescript
interface SkillIndex {
  skillId: string;
  skillName: string;
  description: string;
  tags: string[];
  embedding: number[];
  content: string;  // SKILL.md 内容
}
```

### 5.2 检索流程

```
用户查询 --> VectorSearch --> Top-K Skills --> ToolDispatcher
                                    │
                                    v
                            选择最匹配的 Skill 执行
```

---

## 6. 配置项

```typescript
interface SkillsConfig {
  installedPath: string;
  builtinPath: string;
  indexPath: string;
  sandbox: {
    enabled: boolean;
    timeout: number;
    memoryLimit: string;
    cpuLimit: string;
  };
  vectorSearch: {
    topK: number;
    scoreThreshold: number;
  };
}
```

---

## 7. 扩展点

### 7.1 新增内置工具

1. 在 `BuiltInExecutor` 中实现工具类
2. 在 `ToolDispatcher` 注册工具
3. 添加对应的 ABP 协议定义

### 7.2 新增执行类型

1. 实现 `ToolExecutor` 接口
2. 在 `ToolDispatcher` 添加分发逻辑

### 7.3 新增向量模型

1. 实现 `EmbeddingProvider` 接口
2. 更新 `SkillVectorStore` 配置
