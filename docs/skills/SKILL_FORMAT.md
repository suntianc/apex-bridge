# Claude-Compatible Skills 包结构 & `SKILL.md` 格式

本文档定义 ApexBridge Skills 与 Claude Code Skills 对齐后的完整包结构：包括目录布局、`SKILL.md` YAML 前置元数据、Markdown 主体、脚本/资源目录约定，以及记忆写入和中间步骤追踪等规范。

## 目录

1. [技能包目录结构](#技能包目录结构)
2. [SKILL.md 基础结构](#skillmd-基础结构)
3. [YAML 前置元数据](#yaml-前置元数据)
4. [Markdown 主体内容](#markdown-主体内容)
5. [脚本、参考资料与资产](#脚本参考资料与资产)
6. [代码实现](#代码实现)
7. [记忆写入](#记忆写入)
8. [中间步骤追踪](#中间步骤追踪)
9. [最佳实践](#最佳实践)

---

## 技能包目录结构

每个技能包必须符合 Claude-Compatible 布局（文件夹名称可自定义，但下面的相对结构必须存在）：

```
skills/
└─ my-skill/
   ├─ SKILL.md                  # 核心说明（必需）
   ├─ scripts/                  # 执行脚本，至少包含一个入口（必需）
   │   ├─ execute.ts
   │   └─ helpers/
   ├─ references/               # 参考资料（可选）
   │   └─ api-guides.pdf
   ├─ assets/                   # 模板/静态资源（可选）
   │   └─ ppt-template.pptx
   ├─ tests/                    # 单元/回归测试（可选）
   └─ config/                   # 额外配置，如 schema JSON（可选）
```

> **注意**  
> - `SKILL.md` 缺失时技能视为无效。  
> - 所有可执行代码必须放在 `scripts/` 内；否则将被校验器阻止。  
> - 大体积参考/资产文件会按需懒加载，避免启动期占用。

---

## SKILL.md 基础结构

SKILL.md文件采用YAML前置元数据 + Markdown主体的结构：

```markdown
---
# YAML前置元数据（Frontmatter）
name: skill-name
description: Skill description
version: 1.0.0
type: direct
---

# Markdown主体内容
## 描述
...

## 代码
```typescript
...
```
```

---

## YAML 前置元数据

新的 frontmatter 统一遵循以下字段表。除必填字段外，其余字段可按业务需要扩展，但必须满足 JSON Schema 兼容格式。

| 字段 | 类型 | 说明 | 是否必填 |
| --- | --- | --- | --- |
| `name` | string | 技能唯一标识符，推荐小写+连字符 | ✅ |
| `displayName` | string | UI 显示名称 | ⭕ |
| `description` | string | 技能简介，≤1024字符 | ✅ |
| `version` | string | 语义化版本号 | ✅ |
| `type` | string | 执行类型：`direct`/`service`/`distributed`/`static`/`preprocessor`/`internal` | ✅ |
| `capabilities` | string[] | 描述该技能具备的具体能力（如 `["summarize","translate"]`） | ✅ |
| `tags` | string[] | 用于匹配触发条件的标签 | ✅ |
| `triggers` | object | 自动触发配置，详见下文 | ✅ |
| `domain` | string | 归属领域 | ⭕ |
| `category` | string | 分类 | ⭕ |
| `keywords` | string[] | 关键字 | ⭕ |
| `input_schema` | object | JSON Schema，定义输入参数 | ✅ |
| `output_schema` | object | JSON Schema，定义输出结构 | ✅ |
| `protocol` | string | `vcp` 或 `abp`，默认 `vcp` | ⭕ |
| `abp` | object | ABP 工具声明，含 `kind`、`tools` 等 | ⭕ |
| `security` | object | 沙箱策略，包含 `timeout_ms`、`memory_mb`、`network`（`none`/`allowlist`）、`requires_filesystem` 等 | ✅ |
| `resources` | object | 声明 `scripts` 入口、需要的参考/资产文件等 | ✅ |
| `cacheable` | boolean | 是否缓存 | ⭕ |
| `ttl` | number | 缓存 TTL（秒） | ⭕ |

### 触发配置 (`triggers`)

```yaml
triggers:
  intents:
    - summarize_documents
    - legal_review
  phrases:
    - "总结报告"
    - "法律条款分析"
  event_types:
    - abp.tool_request
  priority: 0.8         # 0-1，越高越优先
```

### 安全策略 (`security`)

```yaml
security:
  timeout_ms: 5000
  memory_mb: 128
  network: "none"          # 或 "allowlist"
  network_allowlist:
    - https://api.example.com
  filesystem: "read-only"  # none | read-only
  environment:
    ALLOWED_TIMEZONES: "UTC,Asia/Shanghai"
```

### 资源引用 (`resources`)

```yaml
resources:
  entry: "./scripts/execute.ts"
  helpers:
    - "./scripts/helpers/math.ts"
  references:
    - "./references/contract-guidelines.pdf"
  assets:
    - "./assets/report-template.docx"
```

> **迁移提示**：旧的 `permissions` 字段可迁移为 `security` 内的网络/文件系统策略。

### 示例

#### VCP格式（默认）

```yaml
---
name: weather-query
displayName: 天气查询
description: 查询指定城市的天气信息
version: 1.0.0
type: service
category: 实用工具
keywords:
  - 天气
  - weather
  - 查询
domain: utilities
permissions:
  network: true
  filesystem: none
cacheable: true
ttl: 300
---
```

#### ABP格式（新增）

```yaml
---
name: weather-query
displayName: 天气查询
description: 查询指定城市的天气信息
version: 1.0.0
type: service
protocol: abp
abp:
  kind: query
  tools:
    - name: getWeather
      description: 获取指定城市的天气信息
      parameters:
        location:
          type: string
          description: 城市名称
          required: true
        unit:
          type: string
          description: 温度单位（celsius/fahrenheit）
          required: false
          default: celsius
      returns:
        type: object
        description: 天气信息
category: 实用工具
keywords:
  - 天气
  - weather
  - 查询
domain: utilities
permissions:
  network: true
  filesystem: none
cacheable: true
ttl: 300
---
```

---

## Markdown 主体内容

### 必需章节

- **描述**: 技能的详细说明，补充 frontmatter 中的 `description`。
- **参数/输入**: 以自然语言解释 `input_schema` 中的参数含义、默认值、限制。
- **输出**: 解释 `output_schema` 的结构、状态字段等。
- **执行步骤**: 指导 Claude 如何一步步完成任务，可包含“安全检查”“失败时怎么办”等。
- **示例**: 输入/输出示例，帮助匹配触发场景。
- **安全/合规提示**: 若技能涉及敏感数据，必须注明处理规范。

### 可选章节

- **附录**: 相关指标、FAQ 等
- **脚本说明**: 介绍 `scripts/` 中关键文件用途
- **资源说明**: 列出 `references/`、`assets/` 的适用场景

---

## 脚本、参考资料与资产

| 目录 | 用途 | 要求 |
| --- | --- | --- |
| `scripts/` | TypeScript/Python/Shell 逻辑 | 必须至少存在一个入口脚本；可包含子目录；所有脚本默认在 Sandbox 中运行；如果有多入口，用 `resources.entry` 指定 |
| `references/` | 只读知识库，如 API 文档、政策、示例合同 | 被按需读取，建议采用轻量格式或分片 |
| `assets/` | 输出可直接使用的模板、图片、ZIP 等 | 系统只在需要时加载 |
| `tests/` | 可选的自动化测试 | 推荐使用 Jest/TS 或脚本，便于包发布前自检 |
| `config/` | JSON/YAML schema、常量等 | 可被脚本引用 |

---

## 代码实现

### 基本格式

```typescript
export async function execute(
  parameters: Record<string, unknown>,
  context?: {
    userId?: string;
    householdId?: string;
    sessionId?: string;
    [key: string]: unknown;
  },
  config?: Record<string, unknown>
): Promise<SkillExecutionOutcome> {
  // 实现代码
  return {
    output: result,
    format: 'object',
    status: 'success'
  };
}
```

### 返回值结构

`SkillExecutionOutcome`接口定义：

```typescript
interface SkillExecutionOutcome {
  output: unknown;                    // 必需：执行结果输出
  format?: SkillResultFormat;         // 可选：结果格式
  status?: SkillResultStatus;         // 可选：状态
  message?: string;                   // 可选：消息
  tokenUsage?: number;                // 可选：Token使用量
  warnings?: string[];                // 可选：警告信息
  memoryWrites?: MemoryWriteSuggestion[];  // 可选：记忆写入建议
  intermediateSteps?: StepTrace[];    // 可选：中间步骤追踪
}
```

---

## 记忆写入

### 概述

Skills可以通过返回`memoryWrites`数组来建议系统写入记忆。这些建议会被自动收集并提交到`IMemoryService`。

### MemoryWriteSuggestion接口

```typescript
interface MemoryWriteSuggestion {
  ownerType: 'user' | 'household' | 'task' | 'group';  // 记忆所有者类型
  ownerId: string;                                      // 记忆所有者ID
  type: 'preference' | 'fact' | 'event' | 'summary';   // 记忆类型
  importance: number;                                   // 重要性评分（1-5）
  content: string;                                      // 记忆内容
  metadata?: Record<string, any>;                       // 可选元数据
}
```

### ABP 格式记忆写入

ABP 协议支持在工具调用结果中包含记忆写入建议：

#### ABP 格式

```json
{
  "id": "abp_call_123",
  "tool": "PreferenceRecorder",
  "result": {
    "output": "已记录用户偏好",
    "memoryWrites": [
      {
        "type": "preference",
        "content": "用户喜欢喝拿铁",
        "importance": 0.8,
        "metadata": {
          "source": "skill",
          "skillName": "PreferenceRecorder",
          "category": "drink"
        }
      }
    ]
  }
}
```

#### VCP 格式（兼容）

```typescript
interface SkillResult {
  output: any;
  memoryWrites?: MemoryWriteSuggestion[];
  intermediateSteps?: StepTrace[];
}
```

### 记忆类型说明

- **preference**: 用户偏好（如"喜欢咖啡"、"偏好Python"）
- **fact**: 事实信息（如"用户住在北京"、"项目使用TypeScript"）
- **event**: 事件记录（如"今天完成了重构"、"参加了会议"）
- **summary**: 摘要信息（如"会话总结"、"项目状态"）

### 重要性评分

- **1**: 低重要性（临时信息）
- **2**: 较低重要性（短期信息）
- **3**: 中等重要性（中期信息）
- **4**: 较高重要性（长期信息）
- **5**: 高重要性（关键信息）

### 代码示例

```typescript
export async function execute(
  parameters: Record<string, unknown>,
  context?: { userId?: string; householdId?: string }
): Promise<SkillExecutionOutcome> {
  const userId = context?.userId || 'anonymous';
  const query = parameters.query as string;
  
  // 执行技能逻辑
  const result = await processQuery(query);
  
  // 返回结果，包含记忆写入建议
  return {
    output: result,
    format: 'object',
    status: 'success',
    memoryWrites: [
      {
        ownerType: 'user',
        ownerId: userId,
        type: 'preference',
        importance: 3,
        content: `用户查询了"${query}"相关的信息`,
        metadata: {
          query: query,
          timestamp: Date.now()
        }
      }
    ]
  };
}
```

### 记忆写入最佳实践

1. **选择合适的ownerType**
   - `user`: 个人相关信息
   - `household`: 家庭相关信息
   - `task`: 任务相关信息
   - `group`: 群组相关信息

2. **准确的重要性评分**
   - 关键信息使用4-5分
   - 一般信息使用2-3分
   - 临时信息使用1分

3. **清晰的记忆内容**
   - 使用简洁明了的语言
   - 包含关键信息
   - 避免冗余和歧义

4. **适当的元数据**
   - 添加必要的上下文信息
   - 便于后续检索和理解

---

## 中间步骤追踪

### 概述

Skills可以通过返回`intermediateSteps`数组来追踪执行过程中的中间步骤，用于调试和可观测性监控。

### StepTrace接口

```typescript
interface StepTrace {
  stepId: string;      // 步骤唯一标识符
  stepName: string;    // 步骤名称（人类可读）
  input: any;          // 步骤输入数据
  output: any;         // 步骤输出数据
  duration: number;    // 步骤执行耗时（毫秒）
  error?: Error;       // 步骤执行错误（如果有）
  timestamp?: number;  // 步骤执行时间戳（可选）
}
```

### 代码示例

```typescript
export async function execute(
  parameters: Record<string, unknown>
): Promise<SkillExecutionOutcome> {
  const steps: StepTrace[] = [];
  
  // 步骤1: 验证输入
  const step1Start = Date.now();
  try {
    validateInput(parameters);
    steps.push({
      stepId: 'step-1',
      stepName: '验证输入',
      input: parameters,
      output: { valid: true },
      duration: Date.now() - step1Start
    });
  } catch (error) {
    steps.push({
      stepId: 'step-1',
      stepName: '验证输入',
      input: parameters,
      output: null,
      duration: Date.now() - step1Start,
      error: error as Error
    });
    throw error;
  }
  
  // 步骤2: 处理数据
  const step2Start = Date.now();
  const processed = await processData(parameters);
  steps.push({
    stepId: 'step-2',
    stepName: '处理数据',
    input: parameters,
    output: processed,
    duration: Date.now() - step2Start
  });
  
  // 步骤3: 生成结果
  const step3Start = Date.now();
  const result = await generateResult(processed);
  steps.push({
    stepId: 'step-3',
    stepName: '生成结果',
    input: processed,
    output: result,
    duration: Date.now() - step3Start
  });
  
  return {
    output: result,
    format: 'object',
    status: 'success',
    intermediateSteps: steps
  };
}
```

### 中间步骤追踪最佳实践

1. **明确的步骤命名**
   - 使用描述性的步骤名称
   - 便于理解和调试

2. **完整的输入输出**
   - 记录关键输入数据
   - 记录关键输出数据
   - 便于问题排查

3. **准确的耗时记录**
   - 使用高精度时间戳
   - 便于性能分析

4. **错误信息记录**
   - 记录错误详情
   - 便于错误诊断

---

## 完整示例

### 示例1: 带记忆写入的技能

```markdown
---
name: preference-recorder
displayName: 偏好记录器
description: 记录用户偏好信息
version: 1.0.0
type: direct
---

# 偏好记录器

## 描述

记录用户的偏好信息到记忆系统中。

## 参数

- `preference` (string): 偏好内容
- `category` (string): 偏好类别
- `importance` (number): 重要性评分（1-5）

## 代码

```typescript
export async function execute(
  parameters: Record<string, unknown>,
  context?: { userId?: string }
): Promise<SkillExecutionOutcome> {
  const userId = context?.userId || 'anonymous';
  const preference = parameters.preference as string;
  const category = parameters.category as string;
  const importance = (parameters.importance as number) || 3;
  
  // 处理偏好信息
  const processed = processPreference(preference, category);
  
  return {
    output: {
      success: true,
      message: '偏好记录成功',
      preference: processed
    },
    format: 'object',
    status: 'success',
    memoryWrites: [
      {
        ownerType: 'user',
        ownerId: userId,
        type: 'preference',
        importance: importance,
        content: processed.content,
        metadata: {
          category: category,
          originalPreference: preference
        }
      }
    ]
  };
}
```
```

### 示例2: 带中间步骤追踪的技能

```markdown
---
name: data-processor
displayName: 数据处理器
description: 处理复杂数据的多步骤流程
version: 1.0.0
type: direct
---

# 数据处理器

## 描述

执行复杂的数据处理，包含多个中间步骤。

## 代码

```typescript
export async function execute(
  parameters: Record<string, unknown>
): Promise<SkillExecutionOutcome> {
  const steps: StepTrace[] = [];
  const data = parameters.data as any[];
  
  // 步骤1: 数据验证
  const step1Start = Date.now();
  const validated = validateData(data);
  steps.push({
    stepId: 'validate',
    stepName: '数据验证',
    input: { count: data.length },
    output: { valid: true, count: validated.length },
    duration: Date.now() - step1Start
  });
  
  // 步骤2: 数据清洗
  const step2Start = Date.now();
  const cleaned = cleanData(validated);
  steps.push({
    stepId: 'clean',
    stepName: '数据清洗',
    input: { count: validated.length },
    output: { count: cleaned.length, removed: validated.length - cleaned.length },
    duration: Date.now() - step2Start
  });
  
  // 步骤3: 数据分析
  const step3Start = Date.now();
  const analyzed = analyzeData(cleaned);
  steps.push({
    stepId: 'analyze',
    stepName: '数据分析',
    input: { count: cleaned.length },
    output: analyzed,
    duration: Date.now() - step3Start
  });
  
  return {
    output: analyzed,
    format: 'object',
    status: 'success',
    intermediateSteps: steps
  };
}
```
```

### 示例3: 同时使用记忆写入和中间步骤追踪

```markdown
---
name: user-profile-updater
displayName: 用户资料更新器
description: 更新用户资料并记录相关记忆
version: 1.0.0
type: direct
---

# 用户资料更新器

## 代码

```typescript
export async function execute(
  parameters: Record<string, unknown>,
  context?: { userId?: string }
): Promise<SkillExecutionOutcome> {
  const userId = context?.userId || 'anonymous';
  const steps: StepTrace[] = [];
  const updates = parameters.updates as Record<string, unknown>;
  
  // 步骤1: 验证更新
  const step1Start = Date.now();
  const validated = validateUpdates(updates);
  steps.push({
    stepId: 'validate',
    stepName: '验证更新',
    input: updates,
    output: validated,
    duration: Date.now() - step1Start
  });
  
  // 步骤2: 应用更新
  const step2Start = Date.now();
  const updated = await applyUpdates(userId, validated);
  steps.push({
    stepId: 'apply',
    stepName: '应用更新',
    input: validated,
    output: updated,
    duration: Date.now() - step2Start
  });
  
  // 构建记忆写入建议
  const memoryWrites = Object.entries(validated).map(([key, value]) => ({
    ownerType: 'user' as const,
    ownerId: userId,
    type: 'fact' as const,
    importance: key === 'name' || key === 'email' ? 5 : 3,
    content: `用户${key}更新为${value}`,
    metadata: {
      field: key,
      oldValue: updated.oldValues?.[key],
      newValue: value
    }
  }));
  
  return {
    output: updated,
    format: 'object',
    status: 'success',
    memoryWrites: memoryWrites,
    intermediateSteps: steps
  };
}
```
```

---

## 最佳实践

### 1. 代码组织

- 使用清晰的函数命名
- 添加必要的类型定义
- 实现完整的错误处理
- 添加必要的注释

### 2. 记忆写入

- 只在有意义时写入记忆
- 使用合适的重要性评分
- 保持记忆内容简洁明了
- 添加必要的元数据

### 3. 中间步骤追踪

- 记录关键步骤
- 使用描述性的步骤名称
- 记录重要的输入输出
- 准确记录耗时

### 4. 性能考虑

- 避免不必要的中间步骤
- 限制记忆写入数量
- 优化代码执行效率

### 5. 错误处理

- 实现完整的错误处理
- 在中间步骤中记录错误
- 提供清晰的错误信息

---

## 参考文档

- [Skills系统技术架构文档](./ARCHITECTURE.md)
- [开发者迁移指南](./MIGRATION_GUIDE.md)
- [最佳实践指南](./BEST_PRACTICES.md)
- [记忆系统接口文档](../../src/types/memory.ts)

---

*本文档将随着Skills系统的发展持续更新*

---

## 迁移与验证工具

如果现有技能仍沿用旧版“单 SKILL.md + scripts/main.ts”模式，可以使用 `scripts/migrate-skills-to-claude-package.ts` 自动迁移：

```bash
# 迁移指定目录（默认 ./skills）
npm run migrate:skills:to-claude -- --skill-dir=./skills

# 仅查看将要执行的操作
npm run migrate:skills:to-claude -- --dry-run

# 针对第三方技能包执行结构验证
npm run validate:skills:claude -- --skill-dir=./external-skills
```

迁移工具会：

1. 解析 `SKILL.md` / `METADATA.yml`，生成统一的 YAML front matter；
2. 抽取 TypeScript 代码块至 `scripts/execute.ts`（若缺失则生成占位模板）；
3. 创建 `scripts/`、`references/`、`assets/` 目录，并在 front matter 中补齐 `resources.entry`；
4. 填充 `triggers` / `input_schema` / `output_schema` / `security` 等必需字段，确保可被 `MetadataLoader` 校验；
5. 可选地执行 `--validate` 模式，对技能包结构进行静态检查并输出问题列表。

建议在批量迁移前开启备份（默认保留 `METADATA.yml.legacy`），并通过 `validate:skills:claude` 校验第三方技能包后再投入使用。

