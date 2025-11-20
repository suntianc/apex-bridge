/**
 * ApexBridge (ABP-only) - TypeScript类型定义
 */

export interface Message {
  role: 'system' | 'user' | 'assistant';
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
  loopTimeout?: number; // 循环总超时时间（毫秒，默认5分钟）
  agentId?: string; // 🆕 Agent ID，用于指定人格（如"小文"、"default"）
  userId?: string; // 请求方可选 userId，用于记忆命名空间
  // 🆕 自我思考循环配置（ReAct模式）
  selfThinking?: {
    enabled?: boolean;           // 是否启用自我思考循环（ReAct模式）
    maxIterations?: number;      // 最大思考循环次数（默认5）
    enableTaskEvaluation?: boolean; // 是否启用任务完成评估（会使用LLM评估）
    completionPrompt?: string;   // 自定义任务完成评估提示
    includeThoughtsInResponse?: boolean; // 是否在响应中包含思考过程（默认true）
  };
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
  type: 'connection_ack' | 'abp_log' | 'notification' | 'ai_stream' | 'heartbeat' | 'proactive_message';
  data?: any;
}

// 配置接口统一导出（可选，也可以直接从各模块导入）
export * from './config';
