# R-005 P0-1: 多轮思考机制功能设计

> 所属需求：R-005 OpenCode 架构特性集成需求
> 所属阶段：P0（第一优先级）
> 功能模块：多轮思考机制
> 文档版本：v1.0.0

---

## 1. 功能概述

### 1.1 功能描述

本功能旨在增强 apex-bridge 的多轮思考机制，集成 opencode 的成熟实现。主要包括：
- **思考事件流**：支持 reasoning-start/delta/end 事件流
- **思考时间戳**：记录思考内容的 start/end 时间戳
- **步骤边界**：支持 start-step/finish-step 步骤边界事件
- **Doom Loop 检测**：检测无限循环并中断

### 1.2 涉及文件

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/core/stream-orchestrator/ReActEngine.ts` | 修改 | 增加事件类型、Doom Loop 检测 |
| `src/strategies/ReActStrategy.ts` | 修改 | 适配新事件流 |
| `src/types/index.ts` | 修改 | 添加 Part 基类和 ReasoningPart |
| `src/types/message-v2.ts` | 新建 | Part 抽象和类型定义 |

### 1.3 依赖关系

```
ReActStrategy
    └── ReActEngine
            └── ToolDispatcher
                    └── ToolRegistry
```

---

## 2. 功能模块结构

```
多轮思考机制
├── 事件流处理器
│   ├── reasoning-start 事件
│   ├── reasoning-delta 事件
│   └── reasoning-end 事件
├── 步骤边界管理器
│   ├── start-step 事件
│   └── finish-step 事件
├── ReasoningPart 处理器
└── Doom Loop 检测器
```

---

## 3. 数据结构设计

### 3.1 ReasoningPart

```typescript
interface ReasoningPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "reasoning";
  text: string;
  metadata?: Record<string, any>;
  time: {
    start: number;  // 思考开始时间戳
    end?: number;   // 思考结束时间戳
  };
}
```

### 3.2 StepStartPart

```typescript
interface StepStartPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-start";
  snapshot?: string;  // 当前状态快照
}
```

### 3.3 StepFinishPart

```typescript
interface StepFinishPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-finish";
  reason: string;     // 结束原因
  snapshot?: string;  // 完成后状态快照
  cost: number;       // 步骤成本
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

### 3.4 StepContext（内部状态）

```typescript
interface StepContext {
  stepCount: number;
  startTime: number;
  reasoningStartTime?: number;
  toolCallHistory: ToolCallPattern[];
}

interface ToolCallPattern {
  toolName: string;
  parameters: Record<string, any>;
  timestamp: number;
}
```

---

## 4. 接口设计

### 4.1 ReActEngine

```typescript
interface ReActEngine {
  // 现有方法
  executeStep(messages: WithParts[]): Promise<WithParts>;
  dispatchTool(toolCall: ToolCall): Promise<Observation>;

  // 新增方法
  startReasoning(): void;
  appendReasoning(delta: string): void;
  finishReasoning(): void;
  startStep(): StepStartPart;
  finishStep(reason: string): StepFinishPart;
  detectDoomLoop(): DoomLoopDetectionResult;
}

interface DoomLoopDetectionResult {
  isDetected: boolean;
  pattern?: string;
  stepCount: number;
  suggestedAction: "continue" | "interrupt" | "warning";
}
```

### 4.2 Doom Loop 配置

```typescript
interface DoomLoopConfig {
  threshold: number;        // 默认 3 次相同模式触发检测
  checkInterval: number;    // 检查间隔（毫秒）
  maxIterations: number;    // 最大迭代次数（保护上限）
  ignoredTools: string[];   // 忽略的工具列表
}

const DEFAULT_DOOM_LOOP_CONFIG: DoomLoopConfig = {
  threshold: 3,
  checkInterval: 1000,
  maxIterations: 50,
  ignoredTools: ["todo-write", "todo-read"],
};
```

---

## 5. 业务规则

### 5.1 思考事件流规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-01 | `reasoning-start` 必须在 `reasoning-delta` 之前触发 |
| BR-02 | `reasoning-delta` 可以触发多次，累积思考内容 |
| BR-03 | `reasoning-end` 触发后，ReasoningPart 的 `time.end` 记录结束时间 |
| BR-04 | ReasoningPart 的 `time.start` 在 `reasoning-start` 时记录 |

### 5.2 步骤边界规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-05 | 每个 ReAct 循环对应一个步骤，stepCount 递增 |
| BR-06 | `start-step` 在工具调用前触发，记录当前快照 |
| BR-07 | `finish-step` 在工具执行完成后触发，记录成本和 token 统计 |
| BR-08 | stepCount 从 1 开始，每轮迭代 +1 |

### 5.3 Doom Loop 检测规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-09 | DOOM_LOOP_THRESHOLD = 3（可配置） |
| BR-10 | 检测最近 N 次工具调用模式是否重复（N = threshold） |
| BR-11 | 模式重复判定：工具名称 + 参数哈希相同 |
| BR-12 | 检测到循环时，触发中断并返回错误信息 |
| BR-13 | `ignoredTools` 中的工具不参与检测 |

---

## 6. 异常处理

### 6.1 异常类型

| 异常类型 | 触发条件 | 处理方式 |
|---------|---------|---------|
| `DoomLoopError` | 检测到无限循环 | 中断执行，返回错误信息 |
| `ReasoningStateError` | reasoning 状态不正确 | 记录日志，忽略或重置状态 |
| `StepStateError` | 步骤状态不正确 | 记录日志，尝试恢复 |

### 6.2 Doom Loop 错误响应

```typescript
interface DoomLoopErrorResponse {
  error: {
    name: "DoomLoopDetected";
    message: string;
    details: {
      pattern: string;
      attemptCount: number;
      threshold: number;
      lastToolCalls: ToolCall[];
    };
  };
  suggestion: string;
}
```

---

## 7. 关键逻辑指导

### 7.1 Doom Loop 检测实现

**实现思路**：
1. 维护一个滑动窗口，存储最近 N 次工具调用记录
2. 每次工具调用时，将调用模式（工具名 + 参数哈希）加入窗口
3. 当窗口大小达到阈值时，检查是否存在重复模式
4. 如果检测到重复模式，触发 Doom Loop 中断

**关键步骤**：
```
1. 工具调用前：记录当前调用模式
2. 将模式推入滑动窗口（移除最旧的）
3. 如果窗口已满：
   a. 遍历窗口，查找重复模式
   b. 如果找到重复，计算重复次数
   c. 如果重复次数 >= threshold，触发中断
4. 返回检测结果
```

**注意事项**：
- 滑动窗口使用队列实现（FIFO）
- 参数哈希需要标准化（排序键）
- 忽略列表中的工具直接跳过
- 需要考虑工具调用的时间间隔

**边界条件**：
- 阈值设为 0 或负数：禁用 Doom Loop 检测
- 阈值设为 1：每次工具调用都检查
- maxIterations 作为兜底保护
- 空工具参数和空参数哈希需要特殊处理

### 7.2 思考事件流实现

**实现思路**：
1. 在 ReActEngine 中维护 `reasoningState` 状态
2. 通过流式事件接收 LLM 的思考内容增量
3. 实时聚合思考内容，生成 ReasoningPart

**关键步骤**：
```
LLM 流式响应
    |
    v
接收 reasoning-start 事件
    |
    v
初始化 reasoningState，设置 startTime
    |
    v
循环接收 reasoning-delta 事件
    |
    +-- 累积 text 内容
    +-- 可选：实时返回增量
    |
    v
接收 reasoning-end 事件
    |
    v
设置 time.end，生成完整的 ReasoningPart
    |
    v
返回 ReasoningPart
```

**注意事项**：
- `reasoning-delta` 可能是流式的，需要处理增量合并
- 长时间思考可能超过超时限制
- 思考内容可能非常大，需要分块处理

### 7.3 步骤边界实现

**实现思路**：
1. 维护全局 `stepCount` 计数器
2. 在每轮 ReAct 循环开始时触发 `start-step`
3. 在工具执行完成后触发 `finish-step`
4. 收集本轮的执行统计信息

**关键步骤**：
```
开始新一轮 ReAct 循环
    |
    v
stepCount++
    |
    v
生成 StepStartPart（包含当前快照）
    |
    v
执行工具调用
    |
    v
收集执行统计（tokens、耗时等）
    |
    v
生成 StepFinishPart
    |
    v
返回 StepStartPart + StepFinishPart
```

---

## 8. 验收标准

### 8.1 功能验收

- [ ] 支持 reasoning-start/delta/end 事件流
- [ ] ReasoningPart 类型支持时间戳记录
- [ ] 支持 start-step/finish-step 步骤边界
- [ ] 步骤计数器随每次工具调用递增
- [ ] Doom Loop 检测正常工作（DOOM_LOOP_THRESHOLD = 3）
- [ ] 检测到循环时正确触发中断

### 8.2 质量验收

- [ ] TypeScript 编译无错误
- [ ] 单元测试覆盖率 80%+
- [ ] 现有功能 100% 正常（回归测试）
- [ ] 文档完整

### 8.3 性能验收

- [ ] Doom Loop 检测延迟 < 10ms
- [ ] ReasoningPart 生成不影响 LLM 响应速度
- [ ] 滑动窗口内存占用可控（固定大小）

---

## 9. 参考资料

| 类型 | 文件 | 说明 |
|-----|------|------|
| 参考实现 | `opencode/packages/opencode/src/session/message-v2.ts` | ReasoningPart、StepStartPart、StepFinishPart 定义 |
| 现有实现 | `src/core/stream-orchestrator/ReActEngine.ts` | 当前 ReAct 引擎 |
| 现有实现 | `src/strategies/ReActStrategy.ts` | 当前 ReAct 策略 |
| 架构设计 | `docs/architecture-design/模块/Core核心引擎模块设计.md` | Core 模块架构 |
| 需求文档 | `docs/requirements/05-opencode-integration.md` | R-005 需求文档 |
