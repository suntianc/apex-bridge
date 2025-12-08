/**
 * ReAct流式处理 - 基础类型定义
 */

// ── ReAct配置选项 ──────────────────────────────────────────────────────
export interface ReActOptions {
  /** 最大迭代次数，防止无限循环 (默认: 10) */
  maxIterations?: number;

  /** 总超时时间(ms) (默认: 300000, 5分钟) */
  timeoutMs?: number;

  /** 是否启用思考过程流式输出 (默认: true) */
  enableThinking?: boolean;

  /** 工具并发执行数 (默认: 3) */
  maxConcurrentTools?: number;

  /** 是否启用流式工具支持 (默认: false) */
  enableStreamingTools?: boolean;

  /** 是否启用 tool_action 标签解析 (默认: true) */
  enableToolActionParsing?: boolean;

  /** tool_action 工具执行超时时间(ms) (默认: 30000) */
  toolActionTimeout?: number;

  /** LLM提供商 (默认: 系统默认) */
  provider?: string;

  /** LLM模型 (默认: 系统默认) */
  model?: string;

  /** 温度参数 (默认: 0.7) */
  temperature?: number;

  /** 最大Token数 */
  maxTokens?: number;

  /** 其他LLM参数 */
  [key: string]: any;
}

// ── 流式事件定义 ────────────────────────────────────────────────────────
export interface StreamEvent {
  /** 事件类型 */
  type: 'reasoning' | 'content' | 'tool_start' | 'tool_progress' | 'tool_end' | 'error' | 'done';

  /** 事件数据 */
  data: any;

  /** 时间戳 */
  timestamp: number;

  /** ReAct迭代轮次 */
  iteration: number;
}

// ── 工具调用定义 ────────────────────────────────────────────────────────
export interface ToolCall {
  /** 工具调用ID */
  id: string;

  /** 工具索引 (用于合并分块) */
  index?: number;

  /** 函数信息 */
  function: {
    /** 工具名称 */
    name: string;

    /** 参数 (JSON字符串) */
    arguments: string;
  };

  /** 工具类型 */
  type: 'function';
}

// ── 工具结果定义 ────────────────────────────────────────────────────────
export interface ToolResult {
  /** 工具调用ID */
  toolCallId: string;

  /** 工具名称 */
  name: string;

  /** 执行状态 */
  status: 'success' | 'error';

  /** 执行结果 */
  result: any;

  /** 错误信息 (status为error时) */
  error?: string;

  /** 执行耗时(ms) */
  durationMs?: number;
}

// ── LLM适配器接口 ───────────────────────────────────────────────────────
export interface LLMOptions {
  /** 工具列表 */
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>;

  /** 是否启用思考过程 */
  enableThinking?: boolean;

  /** 模型名称 */
  model?: string;

  /** 温度参数 */
  temperature?: number;

  /** 最大Token数 */
  maxTokens?: number;

  /** 其他参数 */
  [key: string]: any;
}

/**
 * LLM适配器接口
 * 抽象不同LLM提供商的差异
 */
export interface LLMAdapter {
  /**
   * 流式聊天
   * @param messages 消息列表
   * @param options 选项
   * @param tools 可用工具列表
   * @param signal 中止信号
   */
  streamChat(
    messages: any[],
    options?: LLMOptions,
    tools?: any[],  // ✅ 新增：工具列表
    signal?: AbortSignal
  ): AsyncGenerator<any, void, void>;
}

// ── 工具接口定义 ────────────────────────────────────────────────────────
/**
 * 工具接口
 * 支持三种执行模式：同步、Promise、AsyncGenerator
 */
export interface Tool {
  /** 工具名称 (唯一标识) */
  name: string;

  /** 工具描述 */
  description: string;

  /** 参数JSON Schema */
  parameters: any;

  /**
   * 执行函数
   * @param args 参数对象
   * @param signal 中止信号
   * @returns 可以是同步值、Promise或AsyncGenerator(流式)
   */
  execute(args: any, signal?: AbortSignal): any | Promise<any> | AsyncGenerator<any>;

  /** 是否为流式工具 */
  isStreaming?: boolean;
}

// ── 运行时上下文 ────────────────────────────────────────────────────────
export interface ReActRuntimeContext {
  /** 当前迭代次数 */
  iteration: number;

  /** 最大迭代次数 */
  maxIterations: number;

  /** 是否启用思考流式输出 */
  enableThinking: boolean;

  /** 工具调用累积 */
  toolCalls: Map<number, ToolCall>;

  /** 累积内容 */
  accumulatedContent: string;

  /** 中止信号 */
  signal: AbortSignal;
}

// ── 批处理任务定义 ───────────────────────────────────────────────────────
export interface BatchTask {
  /** 任务ID */
  taskId: string;

  /** 消息列表 */
  messages: any[];

  /** ReAct选项 */
  options?: Partial<ReActOptions>;
}

export interface BatchResult {
  /** 任务ID */
  taskId: string;

  /** 执行结果 */
  result: any[];

  /** 时间戳 */
  timestamp: number;
}

