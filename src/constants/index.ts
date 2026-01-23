/**
 * ApexBridge 常量定义
 *
 * 集中管理所有魔法数字，提高代码可维护性
 * 使用 as const 确保类型安全
 */

// ==================== 工具超时配置 ====================

export interface ToolTimeoutConfig {
  default: number;
  byType: Record<string, number>;
}

export const TOOL_TIMEOUT: ToolTimeoutConfig = {
  default: 30000,
  byType: {
    skill: 30000,
    mcp: 60000,
    builtin: 10000,
    file_read: 15000,
    file_write: 15000,
    vector_search: 20000,
    web_search: 30000,
  },
} as const;

// ==================== 超时常量 ====================

export const TIMEOUT = {
  /** 工具执行超时 (毫秒, 默认30秒) */
  TOOL_EXECUTION: 30000,

  /** LLM 请求超时 (毫秒, 默认60秒) */
  LLM_REQUEST: 60000,

  /** 清理定时器间隔 (毫秒) */
  CLEANUP_INTERVAL: 60000,

  /** Skills 缓存 TTL (毫秒, 5分钟) */
  SKILL_CACHE_TTL: 5 * 60 * 1000,

  /** 适配器缓存 TTL (毫秒, 5分钟) */
  ADAPTER_CACHE_TTL: 5 * 60 * 1000,

  /** 技能自动注销时间 (毫秒, 5分钟) */
  SKILL_AUTO_UNREGISTER: 5 * 60 * 1000,

  /** 清理定时器执行间隔 (毫秒, 1分钟) */
  CLEANUP_TIMER_INTERVAL: 60 * 1000,
} as const;

// ==================== 限制常量 ====================

export const LIMITS = {
  /** 最大迭代次数 (ReAct 循环) */
  MAX_ITERATIONS: 50,

  /** 最大并发工具数 */
  MAX_CONCURRENT_TOOLS: 3,

  /** 适配器缓存大小 */
  ADAPTER_CACHE_SIZE: 20,

  /** 向量搜索返回数量限制 */
  VECTOR_SEARCH_LIMIT: 10,

  /** 请求 ID 生成长度 */
  REQUEST_ID_LENGTH: 32,

  /** 会话历史最大消息数 */
  SESSION_HISTORY_MAX_MESSAGES: 100,

  /** 单次向量搜索的最大结果数 */
  VECTOR_SEARCH_MAX_RESULTS: 10,
} as const;

// ==================== 阈值常量 ====================

export const THRESHOLDS = {
  /** 向量搜索相似度阈值 (过滤噪声) */
  VECTOR_SEARCH: 0.4,

  /** 相关 Skills 检索阈值 (降低以提高召回率) */
  RELEVANT_SKILLS: 0.4,

  /** Doom Loop 检测阈值 (相同调用次数) */
  DOOM_LOOP_THRESHOLD: 3,
} as const;

// ==================== Doom Loop 常量 ====================

export const DOOM_LOOP = {
  /** 检测阈值 */
  THRESHOLD: 3,

  /** 历史记录最大长度 (阈值 * 2) */
  MAX_HISTORY_LENGTH: 6,
} as const;

// ==================== 向量常量 ====================

export const VECTOR = {
  /** 默认向量维度 */
  DEFAULT_DIMENSIONS: 768,

  /** 向量索引分区数 */
  INDEX_PARTITIONS: 64,

  /** 向量子向量数 */
  INDEX_SUB_VECTORS: 8,

  /** IVF_PQ 索引类型 */
  INDEX_TYPE: "ivf_pq" as const,
} as const;

// ==================== LLM 常量 ====================

export const LLM = {
  /** 默认温度参数 */
  DEFAULT_TEMPERATURE: 0.7,

  /** 默认最大 Token 数 */
  DEFAULT_MAX_TOKENS: 4096,

  /** 默认重试次数 */
  DEFAULT_MAX_RETRIES: 3,

  /** 默认超时时间 (毫秒) */
  DEFAULT_TIMEOUT: 60000,
} as const;

// ==================== API 常量 ====================

export const API = {
  /** 默认端口 */
  DEFAULT_PORT: 8088,

  /** API 路径前缀 */
  V1_PREFIX: "/v1",

  /** API 路径前缀 */
  API_PREFIX: "/api",

  /** WebSocket 路径 */
  WS_PATH: "/chat",

  /** 健康检查路径 */
  HEALTH_PATH: "/health",

  /** 最大请求体大小 */
  MAX_REQUEST_SIZE: "100mb" as const,
} as const;

// ==================== 数据库常量 ====================

export const DATABASE = {
  /** 向量数据库路径 */
  VECTOR_DB_PATH: "./.data",

  /** 向量数据库表名 */
  VECTOR_TABLE_NAME: "skills",

  /** MCP 配置表名 */
  MCP_CONFIG_TABLE: "mcp_servers",

  /** LLM 配置表名 */
  LLM_CONFIG_TABLE: "llm_config",
} as const;

// ==================== 日志常量 ====================

export const LOG = {
  /** 默认日志级别 */
  DEFAULT_LEVEL: "info" as const,

  /** 安全日志级别 */
  SECURITY_LEVEL: "warn" as const,

  /** 日志格式时间戳格式 */
  TIMESTAMP_FORMAT: "YYYY-MM-DD HH:mm:ss" as const,
} as const;

// ==================== 安全常量 ====================

export const SECURITY = {
  /** API 密钥长度 */
  API_KEY_LENGTH: 64,

  /** 速率限制时间窗口 (毫秒) */
  RATE_LIMIT_WINDOW: 60000,

  /** 默认速率限制次数 */
  RATE_LIMIT_MAX_REQUESTS: 100,

  /** JWT 过期时间 (天) */
  JWT_EXPIRY_DAYS: 7,
} as const;

// ==================== 导出辅助函数 ====================

/**
 * 检查值是否在有效范围内
 */
export function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * 格式化时间间隔
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * 获取常量值 (用于需要动态值的场景)
 */
export function getTimeoutValue(key: keyof typeof TIMEOUT): number {
  return TIMEOUT[key];
}

export function getLimitValue(key: keyof typeof LIMITS): number {
  return LIMITS[key];
}

export function getThresholdValue(key: keyof typeof THRESHOLDS): number {
  return THRESHOLDS[key];
}

// ==================== 进程池常量 ====================

export const PROCESS_POOL = {
  DEFAULT_MIN_SIZE: 2,
  DEFAULT_MAX_SIZE: 10,
  DEFAULT_TTL: 5 * 60 * 1000,
  DEFAULT_IDLE_TIMEOUT: 30 * 1000,
  DEFAULT_HEALTH_CHECK: 30 * 1000,
} as const;

// ==================== 检索常量 ====================
// 从专门的 retrieval 常量文件导入，保持关注点分离
export * from "./retrieval";

// ==================== 压缩常量 ====================
export * from "./compression";

// ==================== 保留常量 ====================
export * from "./retention";
