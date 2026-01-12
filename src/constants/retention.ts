/**
 * 保留和超时常量
 *
 * 集中管理技能保留、超时等时间相关配置
 */

/**
 * 技能自动注销配置
 */
export const SKILL_TIMEOUT_MS = 5 * 60 * 1000; // 5分钟

/**
 * 技能自动注销配置
 */
export const SKILL_RETENTION = {
  /** 技能超时时间（毫秒，5分钟） */
  TIMEOUT_MS: 5 * 60 * 1000,

  /** 清理定时器间隔（毫秒，1分钟） */
  CLEANUP_INTERVAL_MS: 60 * 1000,

  /** 缓存 TTL（毫秒，5分钟） */
  CACHE_TTL_MS: 5 * 60 * 1000,
} as const;

/**
 * 自动注销检查配置
 */
export const AUTO_UNREGISTER = {
  /** 检查间隔（毫秒） */
  CHECK_INTERVAL_MS: 60 * 1000,

  /** 超时时间（毫秒） */
  TIMEOUT_MS: 5 * 60 * 1000,
} as const;
