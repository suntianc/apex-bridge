/**
 * ABP (ApexBridge Protocol) Type Definitions
 *
 * ABP协议类型定义（ABP-only）
 */

/**
 * ABP消息角色
 */
export type ABPMessageRole = "system" | "user" | "assistant";

/**
 * ABP消息
 */
export interface ABPMessage {
  /** 消息角色（必需） */
  role: ABPMessageRole;
  /** 消息内容（必需） */
  content: string;
  /** 消息时间戳（可选） */
  timestamp?: number;
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
