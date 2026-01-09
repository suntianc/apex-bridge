# R-005 P2: 上下文压缩功能设计

> 所属需求：R-005 OpenCode 架构特性集成需求
> 所属阶段：P2（第三优先级，可选增强）
> 功能模块：上下文压缩机制
> 文档版本：v1.0.0

---

## 1. 功能概述

### 1.1 功能描述

本功能旨在实现长对话场景下的上下文自动压缩机制，在 token 溢出时自动压缩历史消息。主要包括：
- **溢出检测**：检测 token 数量是否超过阈值
- **双重检查**：LLM 调用前 + 工具执行后
- **压缩策略**：消息摘要生成、移除最早消息
- **压缩记录**：`time.compacted` 标记压缩时间点

### 1.2 涉及文件

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/services/SessionCompaction.ts` | 新建 | 上下文压缩服务 |
| `src/services/ConversationHistoryService.ts` | 修改 | 集成压缩触发 |
| `src/core/LLMManager.ts` | 修改 | LLM 调用前检查 |
| `src/core/tool-action/ToolDispatcher.ts` | 修改 | 工具执行后检查 |

### 1.3 依赖关系

```
SessionCompaction
    ├── Token 计数
    ├── 溢出检测
    ├── 消息摘要生成
    └── 消息压缩

ConversationHistoryService
    └── SessionCompaction

ReActEngine
    └── ToolDispatcher
            └── 工具执行后检查
```

---

## 2. 功能模块结构

```
上下文压缩
├── Token 管理
│   ├── Token 计数器
│   ├── Token 估算
│   └── Token 阈值配置
├── 溢出检测器
│   ├── LLM 调用前检查
│   └── 工具执行后检查
├── 压缩策略
│   ├── 消息摘要生成
│   ├── 移除最早消息
│   └── 保留关键信息
└── 压缩记录
    ├── time.compacted 标记
    └── 压缩历史追踪
```

---

## 3. 数据结构设计

### 3.1 压缩配置

```typescript
interface CompactionConfig {
  /** Token 溢出阈值（相对于 maxTokens 的百分比） */
  overflowThreshold: number;  // 默认 0.9 (90%)

  /** 压缩触发阈值（超过此比例时触发压缩） */
  compactionThreshold: number;  // 默认 0.8 (80%)

  /** 每次压缩保留的消息数 */
  keepRecentMessages: number;  // 默认 10

  /** 是否压缩系统消息 */
  compressSystemMessages: boolean;  // 默认 false

  /** 摘要生成配置 */
  summary: {
    /** 摘要最大长度 */
    maxLength: number;  // 默认 500
    /** 保留的消息部分 */
    partsToKeep: ("text" | "tool" | "reasoning")[];  // 默认 ["text"]
  };

  /** 压缩最大迭代次数 */
  maxIterations: number;  // 默认 3
}
```

### 3.2 压缩状态

```typescript
interface CompactionState {
  /** 是否正在压缩 */
  isCompacting: boolean;

  /** 最后压缩时间 */
  lastCompactionTime: number | null;

  /** 压缩次数 */
  compactionCount: number;

  /** 压缩前 token 数 */
  tokensBeforeCompaction: number;

  /** 压缩后 token 数 */
  tokensAfterCompaction: number;

  /** 压缩历史 */
  history: CompactionRecord[];
}
```

### 3.3 压缩记录

```typescript
interface CompactionRecord {
  /** 压缩时间 */
  timestamp: number;

  /** 压缩原因 */
  reason: "llm_call" | "tool_execution" | "manual";

  /** 压缩前消息数 */
  messageCountBefore: number;

  /** 压缩后消息数 */
  messageCountAfter: number;

  /** 压缩前 token 数 */
  tokensBefore: number;

  /** 压缩后 token 数 */
  tokensAfter: number;

  /** 被压缩的消息 ID 列表 */
  compactedMessageIds: string[];

  /** 摘要消息 ID（如果有） */
  summaryMessageId?: string;
}
```

### 3.4 消息摘要

```typescript
interface MessageSummary {
  /** 摘要 ID */
  id: string;

  /** 摘要标题 */
  title: string;

  /** 摘要内容 */
  body: string;

  /** 摘要生成时间 */
  generatedAt: number;

  /** 压缩的消息范围 */
  messageRange: {
    startMessageId: string;
    endMessageId: string;
  };

  /** 关键操作摘要 */
  keyActions: {
    tool: string;
    result: string;
  }[];

  /** 文件变更摘要 */
  fileChanges: {
    path: string;
    action: "created" | "modified" | "deleted";
  }[];
}
```

---

## 4. 接口设计

### 4.1 SessionCompaction

```typescript
interface SessionCompaction {
  // 配置管理
  getConfig(): CompactionConfig;
  updateConfig(config: Partial<CompactionConfig>): void;
  resetConfig(): void;

  // 状态管理
  getState(): CompactionState;
  resetState(): void;

  // Token 管理
  countTokens(messages: WithParts[]): number;
  estimateTokenCount(message: WithParts): number;

  // 溢出检测
  isOverflow(messages: WithParts[], maxTokens: number): boolean;
  shouldCompact(messages: WithParts[], maxTokens: number): boolean;

  // 压缩执行
  compact(
    messages: WithParts[],
    maxTokens: number,
    reason: "llm_call" | "tool_execution" | "manual"
  ): CompactionResult;

  // 摘要生成
  generateSummary(messages: WithParts[]): MessageSummary;

  // 工具执行后检查
  checkAfterToolExecution(
    messages: WithParts[],
    maxTokens: number
  ): CompactionSuggestion | null;
}

interface CompactionResult {
  /** 压缩后的消息 */
  messages: WithParts[];

  /** 新增的摘要消息（如果有） */
  summaryMessage?: WithParts;

  /** 被移除的消息 ID */
  removedMessageIds: string[];

  /** 压缩统计 */
  stats: {
    originalCount: number;
    compactedCount: number;
    originalTokens: number;
    compactedTokens: number;
  };
}

interface CompactionSuggestion {
  /** 建议压缩 */
  shouldCompact: boolean;

  /** 预计可节省的 token */
  estimatedSavings: number;

  /** 建议原因 */
  reason: string;
}
```

### 4.2 ConversationHistoryService（扩展）

```typescript
interface ConversationHistoryService {
  // 现有方法...

  // 新增方法
  saveWithCompaction(
    messages: WithParts[],
    sessionId: string,
    maxTokens: number
  ): Promise<void>;

  getMessagesWithCompaction(
    sessionId: string,
    maxTokens: number,
    compactionConfig?: Partial<CompactionConfig>
  ): Promise<WithParts[]>;
}
```

### 4.3 Token 估算器

```typescript
namespace TokenEstimator {
  function countTextTokens(text: string): number;
  function countPartTokens(part: Part): number;
  function countMessageTokens(message: WithParts): number;
  function countMessagesTokens(messages: WithParts[]): number;

  // 估算 LLM 响应 token
  function estimateResponseTokens(promptTokens: number, maxTokens: number): number;
}
```

---

## 5. 业务规则

### 5.1 溢出检测规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-01 | 溢出判断：`currentTokens / maxTokens >= overflowThreshold` |
| BR-02 | 压缩判断：`currentTokens / maxTokens >= compactionThreshold` |
| BR-03 | 双重检查：LLM 调用前 + 工具执行后 |
| BR-04 | 系统消息不参与压缩（可配置） |

### 5.2 压缩策略规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-05 | 保留最近的 `keepRecentMessages` 条消息 |
| BR-06 | 生成的消息摘要插入到保留消息之前 |
| BR-07 | 被压缩的消息记录到 `compactedMessageIds` |
| BR-08 | 压缩后的消息标记 `time.compacted` |
| BR-09 | 压缩次数达到 `maxIterations` 后停止 |

### 5.3 摘要生成规则

| 规则编号 | 规则描述 |
|---------|---------|
| BR-10 | 摘要标题格式：`"Summary of conversation from {startTime} to {endTime}"` |
| BR-11 | 摘要内容包含关键工具调用和结果 |
| BR-12 | 摘要长度限制：`maxLength` |
| BR-13 | 保留的消息部分：`partsToKeep` |

---

## 6. 异常处理

### 6.1 异常类型

| 异常类型 | 触发条件 | 处理方式 |
|---------|---------|---------|
| `CompactionError` | 压缩过程异常 | 回滚，不压缩 |
| `SummaryGenerationError` | 摘要生成失败 | 跳过摘要，直接压缩 |
| `MaxCompactionReachedError` | 达到最大压缩次数 | 停止压缩，警告用户 |
| `TokenCountingError` | Token 计数失败 | 使用近似值 |

### 6.2 错误响应格式

```typescript
interface CompactionErrorResponse {
  name: "CompactionError";
  message: string;
  details: {
    sessionId: string;
    reason: string;
    canRetry: boolean;
  };
}
```

---

## 7. 关键逻辑指导

### 7.1 溢出检测实现

**实现思路**：
1. 统计当前消息的 token 数量
2. 估算 LLM 响应需要的 token
3. 计算预计总 token 使用量
4. 判断是否超过阈值

**关键步骤**：
```
获取当前消息
    |
    v
统计消息 token 数
    |
    v
估算响应 token（maxTokens - 消息 token * 安全系数）
    |
    v
计算预计总使用量
    |
    v
与 maxTokens 比较
    |
    +-- >= overflowThreshold → 溢出
    +-- >= compactionThreshold → 建议压缩
    |
    v
返回检测结果
```

**Token 估算算法**：
```typescript
// 简化的 token 估算（基于字符数）
function estimateTokens(text: string): number {
  // 平均 4 个字符 = 1 token
  return Math.ceil(text.length / 4);
}

// 消息 token 估算
function estimateMessageTokens(message: WithParts): number {
  let total = 0;
  for (const part of message.parts) {
    if (part.type === "text") {
      total += estimateTokens(part.text);
    } else if (part.type === "tool") {
      total += estimateTokens(JSON.stringify(part.state.input));
    }
  }
  return total;
}
```

### 7.2 压缩执行实现

**实现思路**：
1. 检查是否需要压缩
2. 生成消息摘要
3. 移除早期消息
4. 插入摘要消息
5. 更新压缩记录

**关键步骤**：
```
检查是否达到最大压缩次数
    |
    v
生成消息摘要
    |
    v
保留最近的 N 条消息
    |
    v
移除早期消息
    |
    v
插入摘要消息
    |
    v
标记压缩时间 `time.compacted`
    |
    v
记录压缩历史
    |
    v
返回结果
```

**注意事项**：
- 保留系统消息（除非配置压缩）
- 保留当前轮次的所有消息
- ToolPart 的状态需要保持完整

### 7.3 摘要生成实现

**实现思路**：
1. 收集被压缩消息中的关键信息
2. 提取工具调用和结果
3. 提取文件变更
4. 生成摘要文本

**关键步骤**：
```
获取要压缩的消息范围
    |
    v
遍历消息，收集信息
    |
    +-- 工具调用 → keyActions
    +-- 文件变更 → fileChanges
    +-- 重要文本片段 → body
    |
    v
生成摘要标题
    |
    v
组装摘要内容
    |
    v
限制摘要长度
    |
    v
返回摘要
```

**摘要内容示例**：
```markdown
# Summary of conversation from 10:00 to 10:30

**Key Actions:**
- Used `readFile` to read package.json
- Used `grep` to search for "TODO"
- Used `edit` to modify src/index.ts

**Files Changed:**
- src/index.ts (modified)
- docs/README.md (created)

**Summary:**
User asked to analyze the codebase and identify areas for improvement.
Analysis completed with 3 files read and 2 files modified.
```

---

## 8. 验收标准

### 8.1 功能验收

- [ ] 上下文压缩在 LLM 调用前触发
- [ ] 上下文压缩在工具执行后触发
- [ ] 溢出检测正常工作
- [ ] 消息摘要生成正确
- [ ] 压缩后消息保持可读性
- [ ] `time.compacted` 标记正确
- [ ] 压缩历史记录正确

### 8.2 质量验收

- [ ] TypeScript 编译无错误
- [ ] 单元测试覆盖率 80%+
- [ ] 现有功能 100% 正常（回归测试）
- [ ] 文档完整

### 8.3 性能验收

- [ ] Token 计数延迟 < 10ms
- [ ] 压缩操作延迟 < 100ms
- [ ] 摘要生成延迟 < 500ms

---

## 9. 参考资料

| 类型 | 文件 | 说明 |
|-----|------|------|
| 参考实现 | `opencode/packages/opencode/src/session/prompt.ts` | SessionCompaction 参考 |
| 现有实现 | `src/services/ConversationHistoryService.ts` | 当前对话历史服务 |
| 架构设计 | `docs/architecture-design/总体架构设计.md` | 总体架构 |
| 需求文档 | `docs/requirements/05-opencode-integration.md` | R-005 需求文档 |
| 前置设计 | `05-OpenCode-P0-2-message-part.md` | P0-2 消息结构设计 |
