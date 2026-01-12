/**
 * Trajectory 相关类型定义
 * Stage 0.6: Trajectory 质量提升
 */

/**
 * 错误类型枚举
 */
export enum ErrorType {
  /** 网络连接失败 */
  NETWORK_ERROR = "network",

  /** 请求超时 */
  TIMEOUT = "timeout",

  /** API 速率限制 */
  RATE_LIMIT = "rate_limit",

  /** 输入参数错误 */
  INVALID_INPUT = "invalid_input",

  /** 业务逻辑错误 */
  LOGIC_ERROR = "logic",

  /** 资源耗尽（内存/磁盘） */
  RESOURCE_EXHAUSTED = "resource",

  /** 权限不足 */
  PERMISSION_DENIED = "permission",

  /** 未知错误 */
  UNKNOWN = "unknown",
}

/**
 * 工具调用详情
 */
export interface ToolCallDetails {
  tool_name: string;
  input_params: Record<string, any>;
  output_content: string;
  output_metadata?: {
    token_count?: number;
    execution_time_ms?: number;
    rate_limit_remaining?: number;
  };
}

/**
 * 错误详情
 */
export interface ErrorDetails {
  error_type: ErrorType;
  error_message: string;
  error_stack?: string;
  context?: Record<string, any>;
}

/**
 * 轨迹步骤（增强版）
 */
export interface TrajectoryStep {
  thought: string;
  action: string;
  output: string;

  // 🆕 工具调用详情
  tool_details?: ToolCallDetails;

  // 🆕 错误详情
  error_details?: ErrorDetails;

  // 保留原有 duration 和 timestamp 字段
  duration?: number;
  timestamp?: number;
}

/**
 * 轨迹完整结构（增强版）
 */
export interface Trajectory {
  task_id: string;
  session_id?: string;
  user_input: string;
  steps: TrajectoryStep[];
  final_result: string;
  outcome: "SUCCESS" | "FAILURE";
  environment_feedback: string;
  used_rule_ids: string[];
  timestamp: number;
  duration_ms: number;
  evolution_status: "PENDING" | "COMPLETED" | "FAILED";
}
