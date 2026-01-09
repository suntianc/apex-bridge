/**
 * Tool Action 类型定义
 * 定义 <tool_action> 标签解析相关的类型接口
 */

/**
 * 工具类型枚举
 */
export enum ToolType {
  SKILL = "skill",
  MCP = "mcp",
  BUILTIN = "builtin",
}

/**
 * 工具调用解析结果
 */
export interface ToolActionCall {
  /** 工具名称 */
  name: string;
  /** 工具类型 */
  type: ToolType;
  /** 参数键值对 */
  parameters: Record<string, string>;
  /** 原始标签文本 */
  rawText: string;
  /** 在原文中的起始位置 */
  startIndex: number;
  /** 在原文中的结束位置 */
  endIndex: number;
}

/**
 * 文本段落（非工具调用部分）
 */
export interface TextSegment {
  /** 文本内容 */
  content: string;
  /** 起始位置 */
  startIndex: number;
  /** 结束位置 */
  endIndex: number;
}

/**
 * 解析结果
 */
export interface ParseResult {
  /** 解析出的工具调用列表 */
  toolCalls: ToolActionCall[];
  /** 非工具调用的文本段 */
  textSegments: TextSegment[];
  /** 未完成的标签文本（用于流式场景） */
  pendingText: string;
}

/**
 * 流式检测结果
 */
export interface DetectionResult {
  /** 是否检测到完整标签 */
  complete: boolean;
  /** 完整的工具调用（当 complete 为 true 时） */
  toolAction?: ToolActionCall;
  /** 可安全输出的文本 */
  textToEmit: string;
  /** 需要继续缓冲的文本 */
  bufferRemainder: string;
}

/**
 * 流式检测器状态
 */
export enum DetectorState {
  /** 正常状态，无标签检测中 */
  NORMAL = "NORMAL",
  /** 检测到标签开始 <tool_action */
  TAG_OPENING = "TAG_OPENING",
  /** 标签内容收集中 */
  TAG_CONTENT = "TAG_CONTENT",
  /** 检测到闭合标签 </tool_action> */
  TAG_CLOSING = "TAG_CLOSING",
}

/**
 * 工具调度器配置
 */
export interface DispatcherConfig {
  /** 工具执行超时时间（毫秒），默认 30000 */
  timeout?: number;
  /** 最大并发执行数，默认 3 */
  maxConcurrency?: number;
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  /** 执行是否成功 */
  success: boolean;
  /** 工具名称 */
  toolName: string;
  /** 执行结果（成功时） */
  result?: any;
  /** 错误信息（失败时） */
  error?: string;
  /** 执行耗时（毫秒） */
  executionTime: number;
  /** 是否对用户隐藏结果（仅用于内部 LLM 推理） */
  hiddenFromUser?: boolean;

  // 🆕 工具调用详情（成功时）
  tool_details?: {
    tool_name: string;
    input_params: Record<string, any>;
    output_content: string;
    output_metadata?: {
      token_count?: number;
      execution_time_ms?: number;
      rate_limit_remaining?: number;
      mode?: string;
    };
  };

  // 🆕 错误详情（失败时）
  error_details?: {
    error_type: string;
    error_message: string;
    error_stack?: string;
    context?: Record<string, any>;
  };
}

/**
 * 工具描述（用于生成提示词）
 */
export interface ToolDescription {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数定义 */
  parameters: {
    name: string;
    type: string;
    description: string;
    required: boolean;
  }[];
}
