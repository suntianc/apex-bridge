/**
 * 上下文压缩常量
 *
 * 集中管理上下文压缩相关的魔法数字
 */

/**
 * 摘要保留消息数
 * 生成摘要时保留最近的消息数量
 */
export const COMPRESSION = {
  /** 保留最近消息数（用于摘要生成） */
  KEEP_RECENT_MESSAGES: 10,

  /** 摘要最大字符长度（用于截断） */
  SUMMARY_MAX_CHARS: 200,

  /** 消息摘要最大 token 数 */
  SUMMARY_MAX_TOKENS: 500,
} as const;

/**
 * 压缩阈值配置
 */
export const COMPACTION = {
  /** 默认溢出检测阈值（Tokens） */
  OVERFLOW_THRESHOLD: 4000,

  /** 严重溢出阈值（上下文比例） */
  SEVERE_THRESHOLD: 0.8,

  /** 绝对最小 Token 限制 */
  ABSOLUTE_MIN_TOKENS: 1000,

  /** 默认输出保留空间（Tokens） */
  DEFAULT_OUTPUT_RESERVE: 4000,

  /** 默认模型上下文限制 */
  DEFAULT_CONTEXT_LIMIT: 8000,

  /** 百分比-based thresholds (P1 模型感知阈值) */
  OVERFLOW_RATIO: 0.3,
  OUTPUT_RESERVE_RATIO: 0.2,
  WARN_RATIO: 0.5,
  SEVERE_RATIO: 0.8,
} as const;
