/**
 * ApexBridge (ABP-only) - TypeScript类型定义
 */

// 重新导出 ace-core 类型
export type * from "./ace-core.d.ts";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
  name?: string;
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: string | { url: string };
}

export interface ChatOptions {
  provider?: string; // 指定使用的提供商（openai, deepseek, zhipu, claude, ollama, custom）
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  loopTimeout?: number; // 循环总超时时间（毫秒，默认5分钟）
  agentId?: string; // 🆕 Agent ID，用于指定人格（如"小文"、"default"）
  userId?: string; // 请求方可选 userId，用于记忆命名空间
  conversationId?: string; // 🆕 对话ID（前端传入）
  sessionId?: string; // 🆕 会话ID（内部使用，由 ChatService 自动生成）
  // 🆕 自我思考循环配置（ReAct模式）
  selfThinking?: {
    enabled?: boolean; // 是否启用自我思考循环（ReAct模式）
    maxIterations?: number; // 最大思考循环次数（默认50）
    includeThoughtsInResponse?: boolean; // 是否在响应中包含思考过程（默认true）
    systemPrompt?: string; // 可注入的基础系统提示词
    additionalPrompts?: string[]; // 额外的提示词段落
    tools?: ToolDefinition[]; // 工具定义
    enableStreamThoughts?: boolean; // 是否流式输出思考过程
    enableToolActionParsing?: boolean; // 是否启用 tool_action 标签解析（默认true）
    toolActionTimeout?: number; // tool_action 工具执行超时时间（毫秒，默认30000）
  };
  // 🆕 P1阶段：ACE编排模式配置（L4执行功能层）
  aceOrchestration?: {
    enabled?: boolean; // 是否启用ACE编排模式
    maxTasks?: number; // 最大任务数限制（默认100）
    taskTimeout?: number; // 任务执行超时（毫秒，默认30000）
    allowParallel?: boolean; // 是否允许并发执行（暂未实现）
    maxConcurrent?: number; // 最大并发任务数（默认3）
  };
  // 🆕 上下文压缩配置
  contextCompression?: {
    enabled?: boolean; // 是否启用上下文压缩（默认false）
    strategy?: "truncate" | "prune" | "summary" | "hybrid"; // 压缩策略
    contextLimit?: number; // 模型上下文限制（覆盖默认值）
    outputReserve?: number; // 输出保留空间（Tokens，默认4000）
    preserveSystemMessage?: boolean; // 是否保留系统消息（默认true）
    minMessageCount?: number; // 最小保留消息数（默认1）
    // 🆕 OpenCode压缩决策配置
    openCodeConfig?: {
      auto?: boolean; // 是否启用自动压缩（默认: true）
      prune?: boolean; // 是否启用受保护修剪（默认: true）
      overflowThreshold?: number; // 溢出检测阈值（Tokens，默认: 4000）
      protectTools?: boolean; // 是否保护关键工具输出（默认: true）
      summaryOnSevere?: boolean; // 严重溢出时是否生成摘要（默认: true）
      severeThreshold?: number; // 严重溢出阈值（上下文比例，默认: 0.8）
    };
  };
  // 注意: [key: string]: any 允许任意属性扩展
  // L-003 建议: 在使用时进行类型守卫检查
  [key: string]: any;
}

export interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message?: Message;
    delta?: Partial<Message>;
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface LLMProviderConfig {
  apiKey?: string;
  baseURL: string;
  defaultModel: string;
  timeout?: number;
  maxRetries?: number;
  proxy?: boolean | any; // 代理配置（false 表示禁用代理）
}

// ABP-only: 运行时直接使用 AdminConfig 作为配置源
// 为了避免核心层依赖 services/ConfigService，这里定义独立的 LLMConfig 类型
export interface LLMConfig {
  defaultProvider?: string;
  openai?: LLMProviderConfig;
  deepseek?: LLMProviderConfig;
  zhipu?: LLMProviderConfig & { mode?: "default" | "coding" };
  claude?: LLMProviderConfig;
  ollama?: Omit<LLMProviderConfig, "apiKey">; // 本地推理一般不需要 apiKey
  custom?: LLMProviderConfig;
}

// ==================== WebSocket相关类型 ====================

export interface WebSocketMessage {
  type: string;
  data?: any;
}

export interface ABPLogMessage extends WebSocketMessage {
  type:
    | "connection_ack"
    | "abp_log"
    | "notification"
    | "ai_stream"
    | "heartbeat"
    | "proactive_message";
  data?: any;
}

// 🆕 工具定义接口
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: { [key: string]: any };
}

// 配置接口统一导出（可选，也可以直接从各模块导入）
export * from "./config";

// 导出 Reflector 相关类型
export * from "./reflector";

// ==================== Message V2 类型 ====================
export * from "./message-v2";

// ==================== Tool State 类型 ====================
export * from "./tool-state";
