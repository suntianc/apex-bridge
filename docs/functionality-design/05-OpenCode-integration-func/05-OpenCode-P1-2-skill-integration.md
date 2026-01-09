# R-005 P1-2: Skill 工具集成功能设计

> 所属需求：R-005 OpenCode 架构特性集成需求
> 所属阶段：P1（第二优先级）
> 功能模块：Skill 工具集成
> 文档版本：v1.0.0

---

## 1. 功能概述

### 1.1 功能描述

本功能旨在增强 apex-bridge 的 Skill 工具集成能力，改造现有 SkillManager 适配 Tool.define() 模式，并新增 Direct 模式支持。主要包括：
- **SkillManager 改造**：适配 Tool.define() 模式
- **SKILL.md 解析**：保留现有逻辑，扩展 Direct 模式
- **Skill 执行模式**：沙箱模式（默认）+ Direct 模式
- **Skill 工具注册**：从代理 BuiltInTool 改为统一工具定义

### 1.2 涉及文件

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/services/SkillManager.ts` | 修改 | 适配 Tool.define() 模式，增加 Direct 模式 |
| `src/core/tool/tool.ts` | 修改 | Skill 工具工厂函数 |
| `src/core/tool/registry.ts` | 修改 | Skill 工具注册集成 |
| `scripts/execute.js` | 修改 | 沙箱执行逻辑 |

### 1.3 依赖关系

```
SkillManager
    ├── Skill 解析（listSkills）
    ├── SKILL.md 解析（YAML frontmatter）
    ├── Skill 工具定义（适配 Tool.define()）
    └── Skill 执行器
            ├── 沙箱模式（scripts/execute.js）
            └── Direct 模式（直接返回 Markdown）

SkillManager
    └── ToolRegistry
            └── Tool.define()
```

---

## 2. 功能模块结构

```
Skill 工具集成
├── Skill 解析器
│   ├── 自动扫描（skills/ 目录）
│   └── SKILL.md 解析（YAML frontmatter）
├── Skill 定义转换器
│   ├── SKILL.md → Tool.Info
│   └── Direct 模式支持
├── Skill 执行器
│   ├── 沙箱模式（安全隔离）
│   └── Direct 模式（直接返回）
└── Skill 工具注册
    ├── 注册到 ToolRegistry
    └── 适配 Tool.define() 模式
```

---

## 3. 数据结构设计

### 3.1 Skill 元信息（from SKILL.md）

```typescript
interface SkillMetadata {
  /** Skill 名称 */
  name: string;

  /** Skill 描述 */
  description: string;

  /** 作者 */
  author?: string;

  /** 版本 */
  version?: string;

  /** 标签 */
  tags?: string[];

  /** 分类 */
  category?: string;

  /** 执行模式 */
  mode: "sandbox" | "direct";

  /** 权限要求 */
  permissions?: string[];

  /** 超时时间（毫秒） */
  timeout?: number;

  /** 危险操作标记 */
  dangerous?: boolean;

  /** 确认提示 */
  confirm?: string;
}
```

### 3.2 Skill 定义

```typescript
interface SkillDefinition {
  /** Skill 路径 */
  path: string;

  /** Skill 文件名 */
  filename: string;

  /** 元信息 */
  metadata: SkillMetadata;

  /** Markdown 内容 */
  content: string;

  /** 摘要（用于向量检索） */
  summary?: string;

  /** 向量嵌入（可选） */
  embedding?: number[];
}
```

### 3.3 Skill 执行结果

```typescript
interface SkillExecutionResult {
  /** 执行状态 */
  status: "success" | "error" | "timeout";

  /** 输出内容 */
  output: string;

  /** 执行时间（毫秒） */
  duration: number;

  /** 错误信息（如果失败） */
  error?: string;

  /** 产生的文件（如果有） */
  files?: string[];
}
```

### 3.4 Direct 模式结果

```typescript
interface DirectSkillResult {
  /** 模式标识 */
  mode: "direct";

  /** Markdown 内容 */
  content: string;

  /** 元信息 */
  metadata: {
    skillName: string;
    sourcePath: string;
    generatedAt: number;
  };
}
```

---

## 4. 接口设计

### 4.1 SkillManager（改造后）

```typescript
interface SkillManager {
  // 现有方法（保留）
  initialize(): Promise<void>;
  listSkills(): SkillDefinition[];
  getSkill(name: string): SkillDefinition | undefined;
  reloadSkill(name: string): Promise<SkillDefinition | undefined>;

  // 新增方法
  registerSkillTool(name: string): ToolInfo;
  registerAllSkillTools(): void;
  unregisterSkillTool(name: string): boolean;
  executeSkill(name: string, input: Record<string, any>, mode?: "sandbox" | "direct"): Promise<SkillExecutionResult | DirectSkillResult>;
  executeSkillDirect(name: string): DirectSkillResult;

  // 配置
  getConfig(): SkillManagerConfig;
  updateConfig(config: Partial<SkillManagerConfig>): void;
}

interface SkillManagerConfig {
  skillsPath: string;
  customPaths: string[];
  defaultMode: "sandbox" | "direct";
  sandboxTimeout: number;
  enableDirectMode: boolean;
}
```

### 4.2 Skill 工具工厂

```typescript
namespace SkillToolFactory {
  function createTool(definition: SkillDefinition): ToolInfo;
  function createSandboxTool(definition: SkillDefinition): ToolInfo;
  function createDirectTool(definition: SkillDefinition): ToolInfo;

  // 从 SKILL.md 创建 ToolInfo
  function fromSkillMarkdown(content: string, skillPath: string): ToolInfo;
}
```

### 4.3 Skill 执行器

```typescript
interface SkillExecutor {
  execute(name: string, input: Record<string, any>): Promise<SkillExecutionResult>;
  executeDirect(name: string): DirectSkillResult;
  validateInput(name: string, input: Record<string, any>): ValidationResult;
}

interface SandboxExecutor extends SkillExecutor {
  execute(name: string, input: Record<string, any>): Promise<SkillExecutionResult>;
  setTimeout(ms: number): void;
}
```

---

## 5. 业务规则

### 5.1 Skill 解析规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-01 | Skill 必须包含 `name` 和 `description` 字段 |
| BR-02 | YAML frontmatter 必须位于文件顶部 |
| BR-03 | 未指定 `mode` 时使用默认模式（sandbox） |
| BR-04 | 多个目录扫描时，后面覆盖前面（同名 Skill） |

### 5.2 Skill 执行规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-05 | sandbox 模式使用 `scripts/execute.js` 执行 |
| BR-06 | direct 模式直接返回 Markdown 内容 |
| BR-07 | 执行超时自动中断（可配置） |
| BR-08 | 危险操作需要用户确认（可配置） |
| BR-09 | Skill 执行记录到 ToolState |

### 5.3 工具注册规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-10 | Skill 工具名称格式：`skill:{name}` |
| BR-11 | Skill 工具参数包含 `name`（Skill 标识符） |
| BR-12 | Skill 工具自动注册到 ToolRegistry |
| BR-13 | Skill 重载时自动更新工具定义 |

---

## 6. 异常处理

### 6.1 异常类型

| 异常类型 | 触发条件 | 处理方式 |
|---------|---------|---------|
| `SkillNotFoundError` | Skill 不存在 | 返回错误 |
| `SkillParseError` | SKILL.md 解析失败 | 跳过该 Skill |
| `SkillExecutionError` | Skill 执行异常 | 返回 error 状态 |
| `SkillTimeoutError` | Skill 执行超时 | 中断执行，返回超时错误 |

### 6.2 错误响应格式

```typescript
interface SkillErrorResponse {
  name: "SkillError";
  message: string;
  details: {
    skillName: string;
    mode: "sandbox" | "direct";
    cause?: string;
    duration?: number;
  };
}
```

---

## 7. 关键逻辑指导

### 7.1 SKILL.md 解析实现

**实现思路**：
1. 读取 Markdown 文件
2. 解析 YAML frontmatter
3. 提取 Skill 元信息
4. 返回 SkillDefinition

**关键步骤**：
```
读取 skill.md 文件
    |
    v
分离 frontmatter 和 content
    |
    v
解析 YAML frontmatter
    |
    +-- 使用 js-yaml 解析
    +-- 验证必需字段
    |
    v
生成 summary（取 content 前 200 字）
    |
    v
返回 SkillDefinition
```

**注意事项**：
- YAML 解析错误需要捕获并记录
- 必需字段缺失时使用默认值或跳过
- 路径分隔符需要统一处理

### 7.2 Direct 模式实现

**实现思路**：
1. 解析 SKILL.md 获取 Markdown 内容
2. 根据输入参数替换占位符
3. 返回处理后的 Markdown 内容

**关键步骤**：
```
获取 SkillDefinition
    |
    v
获取 input 参数
    |
    v
替换 content 中的占位符
    |
    +-- {{input.name}} -> 用户输入的值
    +-- {{input.xxx}} -> 递归替换
    |
    v
生成 DirectSkillResult
    |
    v
返回结果
```

**占位符格式**：
```
{{input.fieldName}}
{{input.nested.fieldName}}
{{system.cwd}}
{{system.timestamp}}
```

### 7.3 Sandbox 模式实现

**实现思路**：
1. 构建执行环境变量
2. 调用 `scripts/execute.js`
3. 捕获输出和错误
4. 返回执行结果

**关键步骤**：
```
准备环境变量
    |
    +-- SKILL_NAME
    +-- SKILL_PATH
    +-- INPUT_JSON
    +-- TIMEOUT
    |
    v
创建子进程执行 scripts/execute.js
    |
    v
捕获 stdout
    |
    v
捕获 stderr（作为错误信息）
    |
    v
返回执行结果
```

**注意事项**：
- 需要限制子进程的权限
- 超时需要正确处理
- 错误输出需要区分 stdout 和 stderr

---

## 8. 验收标准

### 8.1 功能验收

- [ ] SkillManager 适配 Tool.define() 模式
- [ ] 保留现有 SKILL.md 解析逻辑
- [ ] 增加 Skill Direct 模式支持
- [ ] Skill 工具调用正常（沙箱模式）
- [ ] Skill 工具调用正常（Direct 模式）
- [ ] Skill 工具注册到 ToolRegistry

### 8.2 质量验收

- [ ] TypeScript 编译无错误
- [ ] 单元测试覆盖率 80%+
- [ ] 现有功能 100% 正常（回归测试）
- [ ] 文档完整

---

## 9. 参考资料

| 类型 | 文件 | 说明 |
|-----|------|------|
| 参考实现 | `opencode/packages/opencode/src/tool/skill.ts` | Skill 工具定义 |
| 参考实现 | `opencode/packages/opencode/src/skill/skill.ts` | Skill 管理 |
| 现有实现 | `src/services/SkillManager.ts` | 当前 SkillManager |
| 现有实现 | `scripts/execute.js` | 沙箱执行脚本 |
| 架构设计 | `docs/architecture-design/模块/Core核心引擎模块设计.md` | Core 模块架构 |
| 架构设计 | `docs/architecture-design/模块/Skills技能系统模块设计.md` | Skills 模块架构 |
| 需求文档 | `docs/requirements/05-opencode-integration.md` | R-005 需求文档 |
| 前置设计 | `05-OpenCode-P1-1-tool-framework.md` | P1-1 工具框架设计 |
