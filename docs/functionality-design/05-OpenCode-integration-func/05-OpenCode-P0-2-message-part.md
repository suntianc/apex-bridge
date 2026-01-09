# R-005 P0-2: 消息结构 Part 抽象功能设计

> 所属需求：R-005 OpenCode 架构特性集成需求
> 所属阶段：P0（第一优先级）
> 功能模块：消息结构优化（Part 抽象）
> 文档版本：v1.0.0

---

## 1. 功能概述

### 1.1 功能描述

本功能旨在将 apex-bridge 的消息格式完整迁移到 Part 抽象结构，支持更丰富的消息语义。主要包括：
- **Part 基类**：定义所有 Part 类型的公共结构
- **Part 类型**：TextPart、ToolPart、ReasoningPart、StepStartPart、StepFinishPart 等
- **ToolState 状态机**：工具调用的状态管理
- **消息角色扩展**：User/Assistant 消息的元信息扩展

### 1.2 涉及文件

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/types/index.ts` | 修改 | 扩展 Message/ContentPart，添加 Part 基类 |
| `src/types/message-v2.ts` | 新建 | Part 抽象和类型定义（核心文件） |
| `src/types/tool-state.ts` | 新建 | ToolState 状态机定义 |
| `src/services/ConversationHistoryService.ts` | 修改 | 适配 WithParts 结构 |

### 1.3 依赖关系

```
Part 类型定义
    ├── PartBase（基类）
    ├── TextPart
    ├── ReasoningPart
    ├── ToolPart（依赖 ToolState）
    ├── StepStartPart
    └── StepFinishPart

Message 结构
    ├── User（扩展）
    └── Assistant（扩展）
```

---

## 2. 功能模块结构

```
消息结构 Part 抽象
├── Part 基类体系
│   ├── PartBase（公共字段）
│   └── 各类型 Part（Text/Reasoning/Tool/Step 等）
├── ToolState 状态机
│   ├── pending
│   ├── running
│   ├── completed
│   └── error
├── 消息角色扩展
│   ├── User 扩展（summary、agent、model 等）
│   └── Assistant 扩展（cost、tokens、path 等）
└── WithParts 容器
```

---

## 3. 数据结构设计

### 3.1 PartBase（所有 Part 的基类）

```typescript
interface PartBase {
  id: string;          // Part 唯一标识
  sessionID: string;   // 会话 ID
  messageID: string;   // 消息 ID
}
```

### 3.2 TextPart

```typescript
interface TextPart extends PartBase {
  type: "text";
  text: string;
  synthetic?: boolean;   // 是否为合成内容
  ignored?: boolean;     // 是否忽略（不传给 LLM）
  time?: {
    start?: number;
    end?: number;
  };
  metadata?: Record<string, any>;
}
```

### 3.3 ReasoningPart（已在 P0-1 中定义）

```typescript
interface ReasoningPart extends PartBase {
  type: "reasoning";
  text: string;
  metadata?: Record<string, any>;
  time: {
    start: number;
    end?: number;
  };
}
```

### 3.4 ToolState 状态机

```typescript
// pending 状态：工具调用待执行
interface ToolStatePending {
  status: "pending";
  input: Record<string, any>;
  raw: string;         // 原始调用参数
}

// running 状态：工具执行中
interface ToolStateRunning {
  status: "running";
  input: Record<string, any>;
  title?: string;      // 工具标题
  metadata?: Record<string, any>;
  time: {
    start: number;
  };
}

// completed 状态：工具执行完成
interface ToolStateCompleted {
  status: "completed";
  input: Record<string, any>;
  output: string;      // 执行结果
  title: string;       // 工具标题
  metadata: Record<string, any>;
  time: {
    start: number;
    end: number;
    compacted?: number;  // 压缩时间戳（可选）
  };
  attachments?: FilePart[];  // 附件列表
}

// error 状态：工具执行错误
interface ToolStateError {
  status: "error";
  input: Record<string, any>;
  error: string;       // 错误信息
  metadata?: Record<string, any>;
  time: {
    start: number;
    end: number;
  };
}

type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;
```

### 3.5 ToolPart

```typescript
interface ToolPart extends PartBase {
  type: "tool";
  callID: string;      // 工具调用 ID
  tool: string;        // 工具名称
  state: ToolState;    // 工具状态
  metadata?: Record<string, any>;
}
```

### 3.6 StepStartPart / StepFinishPart（已在 P0-1 中定义）

```typescript
interface StepStartPart extends PartBase {
  type: "step-start";
  snapshot?: string;
}

interface StepFinishPart extends PartBase {
  type: "step-finish";
  reason: string;
  snapshot?: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
}
```

### 3.7 FilePart（用于附件）

```typescript
interface FilePart extends PartBase {
  type: "file";
  mime: string;        // MIME 类型
  filename?: string;   // 文件名
  url: string;         // 文件 URL
  source?: FilePartSource;
}

type FilePartSource = FileSource | SymbolSource | ResourceSource;
```

### 3.8 消息角色扩展

#### User 消息扩展

```typescript
interface UserMessageExtension {
  summary?: {
    title?: string;
    body?: string;
    diffs?: Snapshot.FileDiff[];
  };
  agent: string;
  model: {
    providerID: string;
    modelID: string;
  };
  system?: string;
  tools?: Record<string, boolean>;
  variant?: string;
}
```

#### Assistant 消息扩展

```typescript
interface AssistantMessageExtension {
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
  agent: string;
  path: {
    cwd: string;
    root: string;
  };
  time: {
    completed?: number;
  };
}
```

### 3.9 WithParts 容器

```typescript
interface MessageInfo {
  id: string;
  role: "user" | "assistant";
  time: {
    created: number;
    completed?: number;
  };
}

interface WithParts {
  info: MessageInfo & (UserMessageExtension | AssistantMessageExtension);
  parts: Part[];  // TextPart | ReasoningPart | ToolPart | StepStartPart | StepFinishPart | FilePart
}
```

---

## 4. 接口设计

### 4.1 Part 工厂函数

```typescript
namespace PartFactory {
  function createTextPart(sessionID: string, messageID: string, text: string): TextPart;
  function createReasoningPart(sessionID: string, messageID: string, text: string): ReasoningPart;
  function createToolPart(sessionID: string, messageID: string, callID: string, tool: string, state: ToolState): ToolPart;
  function createStepStartPart(sessionID: string, messageID: string): StepStartPart;
  function createStepFinishPart(sessionID: string, messageID: string, reason: string, cost: number, tokens: TokenStats): StepFinishPart;
}
```

### 4.2 ToolState 转换

```typescript
namespace ToolStateTransition {
  function createPending(input: Record<string, any>, raw: string): ToolStatePending;
  function createRunning(input: Record<string, any>, title?: string): ToolStateRunning;
  function createCompleted(input: Record<string, any>, output: string, title: string, metadata: Record<string, any>, startTime: number, endTime: number): ToolStateCompleted;
  function createError(input: Record<string, any>, error: string, startTime: number, endTime: number): ToolStateError;

  // 状态转换
  function pendingToRunning(state: ToolStatePending): ToolStateRunning;
  function runningToCompleted(state: ToolStateRunning, output: string, endTime: number): ToolStateCompleted;
  function runningToError(state: ToolStateRunning, error: string, endTime: number): ToolStateError;
}
```

### 4.3 Part 验证

```typescript
namespace PartValidator {
  function isTextPart(part: Part): part is TextPart;
  function isReasoningPart(part: Part): part is ReasoningPart;
  function isToolPart(part: Part): part is ToolPart;
  function isStepStartPart(part: Part): part is StepStartPart;
  function isStepFinishPart(part: Part): part is StepFinishPart;

  function validatePart(part: Part): ValidationResult;
}
```

---

## 5. 业务规则

### 5.1 Part 通用规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-01 | 每个 Part 必须包含 `id`、`sessionID`、`messageID` |
| BR-02 | Part 的 `id` 必须在同一消息内唯一 |
| BR-03 | Part 的 `type` 字段用于类型判别，必须为字符串字面量 |
| BR-04 | `sessionID` 和 `messageID` 必须为有效的 UUID 格式 |

### 5.2 ToolState 状态机规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-05 | 状态转换顺序：pending → running → (completed \| error) |
| BR-06 | pending 状态必须有 `raw` 字段存储原始调用参数 |
| BR-07 | running 状态的 `time.start` 记录开始时间 |
| BR-08 | completed/error 状态的 `time.end` 记录结束时间 |
| BR-09 | completed 状态的 `output` 字段不能为空字符串 |
| BR-10 | error 状态的 `error` 字段必须包含错误描述 |

### 5.3 消息角色规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-11 | User 消息的 `summary` 字段按需生成（仅上下文压缩时） |
| BR-12 | Assistant 消息的 `cost` 从 provider 响应获取 |
| BR-13 | Assistant 消息的 `tokens` 包含 input/output/reasoning/cache |
| BR-14 | Assistant 消息的 `time.completed` 在消息完成时设置 |

---

## 6. 异常处理

### 6.1 异常类型

| 异常类型 | 触发条件 | 处理方式 |
|---------|---------|---------|
| `PartValidationError` | Part 验证失败 | 记录日志，抛出异常 |
| `InvalidStateTransition` | 非法的状态转换 | 记录日志，抛出异常 |
| `MissingRequiredField` | 缺少必需字段 | 记录日志，返回 undefined |

### 6.2 状态转换异常响应

```typescript
interface InvalidStateTransitionError {
  name: "InvalidStateTransition";
  message: string;
  details: {
    currentStatus: ToolState["status"];
    attemptedStatus: string;
    validTransitions: string[];
  };
}
```

---

## 7. 关键逻辑指导

### 7.1 ToolState 状态转换实现

**实现思路**：
1. 定义清晰的状态边界
2. 实现不可变的状态转换函数
3. 提供类型安全的转换验证

**关键步骤**：
```
创建 ToolState（初始为 pending）
    |
    v
开始执行工具（pending → running）
    |
    v
执行完成（running → completed）
    |
    +-- 正常完成：设置 output、title、endTime
    |
    v
执行出错（running → error）
    |
    v
设置 error、endTime
    |
    v
返回最终状态
```

**注意事项**：
- 状态转换应该是不可变的（返回新对象）
- 需要验证转换的合法性
- 时间戳使用 Date.now() 获取毫秒级时间
- metadata 需要正确传递和更新

**边界条件**：
- 重复转换到同一状态：应该被允许（幂等性）
- 超时场景：自动从 running 转换为 error
- 并发调用：需要考虑线程安全

### 7.2 WithParts 构建实现

**实现思路**：
1. 创建消息 info 对象
2. 按顺序添加 Part 到 parts 数组
3. 提供工厂方法简化构建过程

**关键步骤**：
```
创建 MessageInfo
    |
    v
创建 Parts 数组
    |
    +-- 添加 User 的 TextPart
    +-- 添加 StepStartPart
    +-- 添加 ToolPart（循环）
    +-- 添加 StepFinishPart
    |
    v
组装 WithParts 对象
    |
    v
返回 WithParts
```

**注意事项**：
- Parts 的顺序很重要（影响 LLM 理解）
- TextPart 的 `ignored` 字段影响是否传给 LLM
- ToolPart 的 state 状态需要保持同步

---

## 8. 验收标准

### 8.1 功能验收

- [ ] Part 基类 PartBase 定义正确
- [ ] 消息支持 TextPart、ToolPart、ReasoningPart、StepStartPart、StepFinishPart 等 Part 类型
- [ ] ToolState 状态机工作正常（pending/running/completed/error）
- [ ] 状态转换符合规则（pending → running → completed/error）
- [ ] Part 验证函数工作正常
- [ ] WithParts 容器结构正确

### 8.2 质量验收

- [ ] TypeScript 编译无错误
- [ ] 单元测试覆盖率 80%+
- [ ] 现有功能 100% 正常（回归测试）
- [ ] 文档完整

---

## 9. 参考资料

| 类型 | 文件 | 说明 |
|-----|------|------|
| 参考实现 | `opencode/packages/opencode/src/session/message-v2.ts` | Part 完整定义 |
| 现有实现 | `src/types/index.ts` | 当前类型定义 |
| 架构设计 | `docs/architecture-design/模块/Core核心引擎模块设计.md` | Core 模块架构 |
| 需求文档 | `docs/requirements/05-opencode-integration.md` | R-005 需求文档 |
| 前置设计 | `05-OpenCode-P0-1-multi-round-thinking.md` | P0-1 多轮思考设计 |
