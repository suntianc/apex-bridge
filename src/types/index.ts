/**
 * ApexBridge (ABP-only) - TypeScript类型定义
 */

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface ChatOptions {
  provider?: string; // 指定使用的提供商（openai, deepseek, zhipu, claude, ollama, custom）
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  maxRecursion?: number; // 工具调用循环最大深度（默认5）
  loopTimeout?: number; // 循环总超时时间（毫秒，默认5分钟）
  agentId?: string; // 🆕 Agent ID，用于指定人格（如"小文"、"default"）
  userId?: string; // 请求方可选 userId，用于记忆命名空间
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
}

export interface ToolRequest {
  name: string;
  args: Record<string, any>;
  archery?: boolean;
}

export interface ToolResult {
  status: 'success' | 'error';
  data?: any;
  error?: string;
}

export interface LLMProviderConfig {
  apiKey?: string;
  baseURL: string;
  defaultModel: string;
  timeout?: number;
  maxRetries?: number;
}

// ABP-only: 运行时直接使用 AdminConfig 作为配置源
// 为了避免核心层依赖 services/ConfigService，这里定义独立的 LLMConfig 类型
export interface LLMConfig {
  defaultProvider?: string;
  openai?: LLMProviderConfig;
  deepseek?: LLMProviderConfig;
  zhipu?: LLMProviderConfig & { mode?: 'default' | 'coding' };
  claude?: LLMProviderConfig;
  ollama?: Omit<LLMProviderConfig, 'apiKey'>; // 本地推理一般不需要 apiKey
  custom?: LLMProviderConfig;
}

// ==================== WebSocket相关类型 ====================

export interface WebSocketMessage {
  type: string;
  data?: any;
}

export interface ABPLogMessage extends WebSocketMessage {
  type: 'connection_ack' | 'abp_log' | 'tool_result' | 'tool_error' | 'notification' | 'ai_stream' | 'heartbeat' | 'proactive_message';
  data?: any;
}

export * from './skills';

// 配置接口统一导出（可选，也可以直接从各模块导入）
export * from './config';
