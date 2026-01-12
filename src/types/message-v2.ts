/**
 * Message V2 Types - 基于 opencode 的消息 Part 抽象体系
 */

// ==================== Part 基类 ====================

export interface PartBase {
  id: string;
  sessionID: string;
  messageID: string;
}

// ==================== Part 类型定义 ====================

export interface TextPart extends PartBase {
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
  time?: { start: number; end?: number };
  metadata?: Record<string, unknown>;
}

export interface ReasoningPart extends PartBase {
  type: "reasoning";
  text: string;
  metadata?: Record<string, unknown>;
  time: { start: number; end?: number };
}

export interface ToolPart extends PartBase {
  type: "tool";
  callID: string;
  tool: string;
  state: ToolState;
  metadata?: Record<string, unknown>;
}

export interface StepStartPart extends PartBase {
  type: "step-start";
  snapshot?: string;
}

export interface StepFinishPart extends PartBase {
  type: "step-finish";
  reason: string;
  snapshot?: string;
  cost: number;
  tokens: TokenStats;
}

export interface FilePart extends PartBase {
  type: "file";
  mime: string;
  filename?: string;
  url: string;
  source?: FileSource | SymbolSource | ResourceSource;
}

export interface SubtaskPart extends PartBase {
  type: "subtask";
  prompt: string;
  description: string;
  agent: string;
  command?: string;
}

export interface AgentPart extends PartBase {
  type: "agent";
  name: string;
  source?: { value: string; start: number; end: number };
}

export interface CompactionPart extends PartBase {
  type: "compaction";
  auto: boolean;
}

export interface RetryPart extends PartBase {
  type: "retry";
  attempt: number;
  error: APIError;
  time: { created: number };
}

export interface SnapshotPart extends PartBase {
  type: "snapshot";
  snapshot: string;
}

export interface PatchPart extends PartBase {
  type: "patch";
  hash: string;
  files: string[];
}

// ==================== Part 联合类型 ====================

export type Part =
  | TextPart
  | ReasoningPart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | FilePart
  | SubtaskPart
  | AgentPart
  | CompactionPart
  | RetryPart
  | SnapshotPart
  | PatchPart;

// ==================== File Part Source ====================

export interface FileSource {
  type: "file";
  path: string;
  text: { value: string; start: number; end: number };
}

export interface SymbolSource {
  type: "symbol";
  path: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  name: string;
  kind: number;
  text: { value: string; start: number; end: number };
}

export interface ResourceSource {
  type: "resource";
  clientName: string;
  uri: string;
  text: { value: string; start: number; end: number };
}

// ==================== Message Info ====================

export interface UserMessage {
  id: string;
  sessionID: string;
  role: "user";
  time: { created: number };
  summary?: { title?: string; body?: string; diffs?: unknown[] };
  agent: string;
  model: { providerID: string; modelID: string };
  system?: string;
  tools?: Record<string, boolean>;
  variant?: string;
}

export interface AssistantMessage {
  id: string;
  sessionID: string;
  role: "assistant";
  time: { created: number; completed?: number };
  parentID: string;
  modelID: string;
  providerID: string;
  agent: string;
  path: { cwd: string; root: string };
  summary?: boolean;
  cost: number;
  tokens: TokenStats;
  finish?: string;
  error?: APIError;
}

export type MessageInfo = UserMessage | AssistantMessage;

// ==================== WithParts ====================

export interface WithParts {
  info: MessageInfo;
  parts: Part[];
}

// ==================== Token Stats ====================

export interface TokenStats {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}

// ==================== API Error ====================

export interface APIError {
  message: string;
  statusCode?: number;
  isRetryable: boolean;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  metadata?: Record<string, string>;
}

// ==================== Tool State (前置声明) ====================
// ToolState 使用前置类型声明避免循环引用
export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;

export type ToolStatePending = {
  status: "pending";
  input: Record<string, unknown>;
  raw: string;
};

export type ToolStateRunning = {
  status: "running";
  input: Record<string, unknown>;
  title?: string;
  metadata?: Record<string, unknown>;
  time: { start: number };
};

export type ToolStateCompleted = {
  status: "completed";
  input: Record<string, unknown>;
  output: string;
  title: string;
  metadata: Record<string, unknown>;
  time: { start: number; end: number; compacted?: number };
  attachments?: FilePart[];
};

export type ToolStateError = {
  status: "error";
  input: Record<string, unknown>;
  error: string;
  metadata?: Record<string, unknown>;
  time: { start: number; end: number };
};

// 重新导出以保持 API 一致性
export type {
  ToolState as IToolState,
  ToolStatePending as IToolStatePending,
  ToolStateRunning as IToolStateRunning,
  ToolStateCompleted as IToolStateCompleted,
  ToolStateError as IToolStateError,
};

// ==================== ID 生成器 ====================

/**
 * 生成唯一的消息 ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * 生成唯一的 Part ID
 */
export function generatePartId(): string {
  return `part_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// ==================== Part 工厂函数 ====================

export interface CreateTextPartOptions {
  id?: string;
  sessionID: string;
  messageID: string;
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
  time?: { start: number; end?: number };
  metadata?: Record<string, unknown>;
}

export interface CreateReasoningPartOptions {
  id?: string;
  sessionID: string;
  messageID: string;
  text: string;
  time: { start: number; end?: number };
  metadata?: Record<string, unknown>;
}

export interface CreateStepStartPartOptions {
  id?: string;
  sessionID: string;
  messageID: string;
  snapshot?: string;
}

export interface CreateStepFinishPartOptions {
  id?: string;
  sessionID: string;
  messageID: string;
  reason: string;
  snapshot?: string;
  cost: number;
  tokens: TokenStats;
}

/**
 * 创建 TextPart
 */
export function createTextPart(options: CreateTextPartOptions): TextPart {
  return {
    id: options.id || generatePartId(),
    sessionID: options.sessionID,
    messageID: options.messageID,
    type: "text",
    text: options.text,
    synthetic: options.synthetic,
    ignored: options.ignored,
    time: options.time,
    metadata: options.metadata,
  };
}

/**
 * 创建 ReasoningPart
 */
export function createReasoningPart(options: CreateReasoningPartOptions): ReasoningPart {
  return {
    id: options.id || generatePartId(),
    sessionID: options.sessionID,
    messageID: options.messageID,
    type: "reasoning",
    text: options.text,
    time: options.time,
    metadata: options.metadata,
  };
}

/**
 * 创建 StepStartPart
 */
export function createStepStartPart(options: CreateStepStartPartOptions): StepStartPart {
  return {
    id: options.id || generatePartId(),
    sessionID: options.sessionID,
    messageID: options.messageID,
    type: "step-start",
    snapshot: options.snapshot,
  };
}

/**
 * 创建 StepFinishPart
 */
export function createStepFinishPart(options: CreateStepFinishPartOptions): StepFinishPart {
  return {
    id: options.id || generatePartId(),
    sessionID: options.sessionID,
    messageID: options.messageID,
    type: "step-finish",
    reason: options.reason,
    snapshot: options.snapshot,
    cost: options.cost,
    tokens: options.tokens,
  };
}

/**
 * 创建 ToolPart
 */
export interface CreateToolPartOptions {
  id?: string;
  sessionID: string;
  messageID: string;
  callID: string;
  tool: string;
  state: ToolState;
  metadata?: Record<string, unknown>;
}

export function createToolPart(options: CreateToolPartOptions): ToolPart {
  return {
    id: options.id || generatePartId(),
    sessionID: options.sessionID,
    messageID: options.messageID,
    type: "tool",
    callID: options.callID,
    tool: options.tool,
    state: options.state,
    metadata: options.metadata,
  };
}

/**
 * 创建 FilePart
 */
export interface CreateFilePartOptions {
  id?: string;
  sessionID: string;
  messageID: string;
  mime: string;
  filename?: string;
  url: string;
  source?: FileSource | SymbolSource | ResourceSource;
}

export function createFilePart(options: CreateFilePartOptions): FilePart {
  return {
    id: options.id || generatePartId(),
    sessionID: options.sessionID,
    messageID: options.messageID,
    type: "file",
    mime: options.mime,
    filename: options.filename,
    url: options.url,
    source: options.source,
  };
}

/**
 * 创建 SubtaskPart
 */
export interface CreateSubtaskPartOptions {
  id?: string;
  sessionID: string;
  messageID: string;
  prompt: string;
  description: string;
  agent: string;
  command?: string;
}

export function createSubtaskPart(options: CreateSubtaskPartOptions): SubtaskPart {
  return {
    id: options.id || generatePartId(),
    sessionID: options.sessionID,
    messageID: options.messageID,
    type: "subtask",
    prompt: options.prompt,
    description: options.description,
    agent: options.agent,
    command: options.command,
  };
}

/**
 * 创建 AgentPart
 */
export interface CreateAgentPartOptions {
  id?: string;
  sessionID: string;
  messageID: string;
  name: string;
  source?: { value: string; start: number; end: number };
}

export function createAgentPart(options: CreateAgentPartOptions): AgentPart {
  return {
    id: options.id || generatePartId(),
    sessionID: options.sessionID,
    messageID: options.messageID,
    type: "agent",
    name: options.name,
    source: options.source,
  };
}

/**
 * 创建 CompactionPart
 */
export interface CreateCompactionPartOptions {
  id?: string;
  sessionID: string;
  messageID: string;
  auto: boolean;
}

export function createCompactionPart(options: CreateCompactionPartOptions): CompactionPart {
  return {
    id: options.id || generatePartId(),
    sessionID: options.sessionID,
    messageID: options.messageID,
    type: "compaction",
    auto: options.auto,
  };
}

/**
 * 创建 RetryPart
 */
export interface CreateRetryPartOptions {
  id?: string;
  sessionID: string;
  messageID: string;
  attempt: number;
  error: APIError;
  created?: number;
}

export function createRetryPart(options: CreateRetryPartOptions): RetryPart {
  return {
    id: options.id || generatePartId(),
    sessionID: options.sessionID,
    messageID: options.messageID,
    type: "retry",
    attempt: options.attempt,
    error: options.error,
    time: { created: options.created || Date.now() },
  };
}

// ==================== Message 工厂函数 ====================

export interface CreateUserMessageOptions {
  id?: string;
  sessionID: string;
  agent: string;
  providerID: string;
  modelID: string;
  system?: string;
  tools?: Record<string, boolean>;
  variant?: string;
  summary?: { title?: string; body?: string; diffs?: unknown[] };
}

export function createUserMessage(options: CreateUserMessageOptions): UserMessage {
  return {
    id: options.id || generateMessageId(),
    sessionID: options.sessionID,
    role: "user",
    time: { created: Date.now() },
    agent: options.agent,
    model: { providerID: options.providerID, modelID: options.modelID },
    system: options.system,
    tools: options.tools,
    variant: options.variant,
    summary: options.summary,
  };
}

export interface CreateAssistantMessageOptions {
  id?: string;
  sessionID: string;
  parentID: string;
  modelID: string;
  providerID: string;
  agent: string;
  cwd: string;
  root: string;
  summary?: boolean;
}

export function createAssistantMessage(options: CreateAssistantMessageOptions): AssistantMessage {
  return {
    id: options.id || generateMessageId(),
    sessionID: options.sessionID,
    role: "assistant",
    time: { created: Date.now() },
    parentID: options.parentID,
    modelID: options.modelID,
    providerID: options.providerID,
    agent: options.agent,
    path: { cwd: options.cwd, root: options.root },
    summary: options.summary,
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
  };
}

// ==================== UI Message 类型（用于 toModelMessage） ====================

/**
 * UI 消息部分类型
 */
export type UIPart =
  | { type: "text"; text: string; providerMetadata?: Record<string, unknown> }
  | { type: "reasoning"; text: string; providerMetadata?: Record<string, unknown> }
  | {
      type: `tool-${string}`;
      state: "output-available";
      toolCallId: string;
      input: Record<string, unknown>;
      output: string;
      callProviderMetadata?: Record<string, unknown>;
    }
  | {
      type: `tool-${string}`;
      state: "output-error";
      toolCallId: string;
      input: Record<string, unknown>;
      errorText: string;
      callProviderMetadata?: Record<string, unknown>;
    }
  | { type: "file"; url: string; mediaType: string; filename?: string };

/**
 * UI 消息接口
 */
export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  parts: UIPart[];
}

// ==================== toModelMessage 消息格式转换 ====================

/**
 * 将 WithParts[] 转换为 AI SDK 兼容的格式
 * @param input WithParts 数组
 * @returns UIMessage 数组（可直接传递给 AI SDK）
 */
export function toModelMessage(input: WithParts[]): UIMessage[] {
  const result: UIMessage[] = [];

  for (const msg of input) {
    if (msg.parts.length === 0) continue;

    // 处理 User 消息
    if (msg.info.role === "user") {
      const userMessage: UIMessage = {
        id: msg.info.id,
        role: "user",
        parts: [],
      };
      result.push(userMessage);

      for (const part of msg.parts) {
        if (part.type === "text" && !part.ignored) {
          userMessage.parts.push({
            type: "text",
            text: part.text,
          });
        }
        if (
          part.type === "file" &&
          part.mime !== "text/plain" &&
          part.mime !== "application/x-directory"
        ) {
          userMessage.parts.push({
            type: "file",
            url: part.url,
            mediaType: part.mime,
            filename: part.filename,
          });
        }
        if (part.type === "compaction") {
          userMessage.parts.push({
            type: "text",
            text: "What did we do so far?",
          });
        }
        if (part.type === "subtask") {
          userMessage.parts.push({
            type: "text",
            text: "The following tool was executed by the user",
          });
        }
      }
    }

    // 处理 Assistant 消息
    if (msg.info.role === "assistant") {
      // 过滤掉错误消息（除非有非 step-start/reasoning 的 parts）
      if (
        "error" in msg.info &&
        msg.info.error &&
        !msg.parts.some((part) => part.type !== "step-start" && part.type !== "reasoning")
      ) {
        continue;
      }

      const assistantMessage: UIMessage = {
        id: msg.info.id,
        role: "assistant",
        parts: [],
      };

      for (const part of msg.parts) {
        if (part.type === "text") {
          assistantMessage.parts.push({
            type: "text",
            text: part.text,
            providerMetadata: part.metadata,
          });
        }
        if (part.type === "tool") {
          if (part.state.status === "completed") {
            // 如果有附件，添加到结果中
            if (
              "attachments" in part.state &&
              part.state.attachments &&
              part.state.attachments.length > 0
            ) {
              result.push({
                id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                role: "user",
                parts: [
                  {
                    type: "text",
                    text: `Tool ${part.tool} returned an attachment:`,
                  },
                  ...part.state.attachments.map((attachment) => ({
                    type: "file" as const,
                    url: attachment.url,
                    mediaType: attachment.mime,
                    filename: attachment.filename,
                  })),
                ],
              });
            }
            assistantMessage.parts.push({
              type: `tool-${part.tool}` as const,
              state: "output-available" as const,
              toolCallId: part.callID,
              input: part.state.input,
              output:
                "time" in part.state && part.state.time && "compacted" in part.state.time
                  ? "[Old tool result content cleared]"
                  : part.state.output,
              callProviderMetadata: part.metadata,
            });
          }
          if (part.state.status === "error") {
            assistantMessage.parts.push({
              type: `tool-${part.tool}` as const,
              state: "output-error" as const,
              toolCallId: part.callID,
              input: part.state.input,
              errorText: part.state.error,
              callProviderMetadata: part.metadata,
            });
          }
        }
        if (part.type === "reasoning") {
          assistantMessage.parts.push({
            type: "reasoning",
            text: part.text,
            providerMetadata: part.metadata,
          });
        }
      }

      if (assistantMessage.parts.length > 0) {
        result.push(assistantMessage);
      }
    }
  }

  return result;
}
