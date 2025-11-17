/**
 * ABP (ApexBridge Protocol) Type Definitions
 * 
 * ABP协议类型定义（ABP-only）
 */

/**
 * ABP工具类型枚举
 */
export type ABPToolKind = 'action' | 'query' | 'transform' | 'validate' | 'stream' | 'schedule';

/**
 * ABP参数类型
 */
export type ABPParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';

/**
 * ABP参数定义
 */
export interface ABPParameterDefinition {
  /** 参数类型 */
  type: ABPParameterType;
  /** 参数描述 */
  description?: string;
  /** 是否必需 */
  required?: boolean;
  /** 默认值 */
  default?: any;
  /** 参数验证规则（可选） */
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
}

/**
 * ABP返回值定义
 */
export interface ABPReturnDefinition {
  /** 返回值类型 */
  type: ABPParameterType;
  /** 返回值描述 */
  description?: string;
}

/**
 * ABP工具定义
 */
export interface ABPToolDefinition {
  /** 工具名称（必需） */
  name: string;
  /** 工具描述（必需） */
  description: string;
  /** 工具类型（必需） */
  kind: ABPToolKind;
  /** 参数定义（必需） */
  parameters: {
    [key: string]: ABPParameterDefinition;
  };
  /** 返回值定义（可选） */
  returns?: ABPReturnDefinition;
  /** 工具版本（可选） */
  version?: string;
  /** 工具作者（可选） */
  author?: string;
}

/**
 * ABP工具调用
 */
export interface ABPToolCall {
  /** 调用ID（必需） */
  id: string;
  /** 工具名称（必需） */
  tool: string;
  /** 参数（必需） */
  parameters: Record<string, any>;
  /** 调用时间戳（可选） */
  timestamp?: number;
}

/**
 * ABP工具结果
 */
export interface ABPToolResult {
  /** 调用ID（必需） */
  id: string;
  /** 结果（必需） */
  result: any;
  /** 错误（可选） */
  error?: string;
  /** 执行时间（毫秒，可选） */
  duration?: number;
  /** 时间戳（可选） */
  timestamp?: number;
}

/**
 * ABP消息角色
 */
export type ABPMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * ABP消息
 */
export interface ABPMessage {
  /** 消息角色（必需） */
  role: ABPMessageRole;
  /** 消息内容（必需） */
  content: string;
  /** 工具定义列表（可选） */
  tools?: ABPToolDefinition[];
  /** 工具调用列表（可选） */
  tool_calls?: ABPToolCall[];
  /** 工具结果列表（可选） */
  tool_results?: ABPToolResult[];
  /** 消息时间戳（可选） */
  timestamp?: number;
}

/**
 * ABP协议解析结果
 */
export interface ABPParseResult {
  /** 是否成功 */
  success: boolean;
  /** 工具调用列表 */
  toolCalls: ABPToolCall[];
  /** 错误信息（如果有） */
  error?: string;
  /** 原始内容 */
  rawContent?: string;
  /** 是否使用了fallback（仅支持 plain-text） */
  fallback?: 'plain-text';
}

/**
 * ABP协议配置
 */
export interface ABPProtocolConfig {
  /** 是否启用双协议模式 */
  dualProtocolEnabled?: boolean;
  /** 是否启用错误恢复 */
  errorRecoveryEnabled?: boolean;
  /** JSON修复配置 */
  jsonRepair?: {
    enabled: boolean;
    strict: boolean;
  };
  /** 噪声文本剥离配置 */
  noiseStripping?: {
    enabled: boolean;
    aggressive: boolean;
  };
  /** 协议边界校验配置 */
  boundaryValidation?: {
    enabled: boolean;
    strict: boolean;
  };
  /** Fallback配置 */
  fallback?: {
    enabled: boolean;
    toPlainText: boolean;
  };
  /** 变量系统配置 */
  variable?: {
    /** 是否启用变量缓存 */
    cacheEnabled?: boolean;
    /** 缓存过期时间（毫秒） */
    cacheTTL?: number;
  };
}

