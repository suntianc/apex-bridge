/**
 * 配置接口统一导出
 *
 * 此文件统一导出所有配置接口，便于查找和维护。
 * 各模块的配置接口保留在各自的类型文件中，通过此文件统一导出。
 */

// ==================== 核心配置 ====================

// ConfigService 配置
export type {
  AdminConfig,
  RateLimitStrategyConfig,
  RateLimitMatcherConfig,
  RateLimitRuleConfig,
  RateLimitHeadersConfig,
  RedisConfig
} from '../services/ConfigService';

// ==================== LLM 配置 ====================

export type {
  LLMProviderConfig,
  LLMConfig
} from './index';

// ==================== Skills 配置 ====================

export type {
  SkillPermissionConfig,
  ExecutorCacheConfig,
  CacheConfig,
  SkillsCacheConfig,
  PreloadConfig,
  MemoryManagerConfig
} from './skills';

// ==================== ABP 配置 ====================

export type {
  ABPProtocolConfig
} from './abp';

// ==================== 服务配置 ====================

// PathService 配置
export type { PathConfig } from '../services/PathService';

// ==================== 核心模块配置 ====================

// Variable Providers 配置
export type {
  RAGProviderConfig
} from '../core/variable/providers';

// Skills ErrorHandler 配置
export type { ErrorHandlerConfig } from '../core/skills/ErrorHandler';

// ==================== 工具配置 ====================

// Cache 配置（注意：skills.ts 中也有 CacheConfig，使用别名避免冲突）
export type { CacheConfig as UtilsCacheConfig } from '../utils/cache';

// Retry 配置
export type { RetryConfig } from '../utils/retry';

// JWT 配置
export type { JWTConfig } from '../utils/jwt';

