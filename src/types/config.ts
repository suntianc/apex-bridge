/**
 * 配置接口统一导出
 *
 * 此文件统一导出所有配置接口，便于查找和维护。
 * 各模块的配置接口保留在各自的类型文件中，通过此文件统一导出。
 *
 * 注意：由于 types/config.ts 和 types/config/ 目录下的文件存在循环引用，
 * 此文件仅保留对 config 目录的引用，实际类型通过 types/config 导入
 */

// ==================== 默认值和工厂函数 ====================

export {
  DEFAULT_REDIS_CONFIG,
  DEFAULT_CONFIG,
  createDefaultRateLimitSettings
} from '../utils/config-constants';

// ==================== 验证结果类型 ====================

export type { ValidationResult } from '../utils/config-validator';

// ==================== LLM 配置 ====================

export type {
  LLMProviderConfig,
  LLMConfig
} from './index';

// ==================== ABP 配置 ====================

export type {
  ABPProtocolConfig
} from './abp';

// ==================== 服务配置 ====================

// PathService 配置
export type { PathConfig } from '../services/PathService';

// ==================== 核心模块配置 ====================

// ==================== 工具配置 ====================

// Cache 配置
export type { CacheConfig as UtilsCacheConfig } from '../utils/cache';

// Retry 配置
export type { RetryConfig } from '../utils/retry';

// JWT 配置
export type { JWTConfig } from '../utils/jwt';
