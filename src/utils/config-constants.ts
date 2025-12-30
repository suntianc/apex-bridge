import type {
  AdminConfig,
  RateLimitSettings,
  RedisConfig,
  SystemConfig,
  FullConfig
} from '../types/config/index';
import type { ApiKeyInfo } from '../types/config/api-key';

/**
 * 默认 API Key 信息
 */
export const DEFAULT_API_KEY: ApiKeyInfo = {
  id: 'default',
  name: '默认项目',
  key: '',
  createdAt: Date.now()
};

/**
 * 创建默认速率限制设置
 */
export function createDefaultRateLimitSettings(): RateLimitSettings {
  return {
    enabled: true,
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 1000, // 限制每个IP 15分钟内最多1000个请求
    message: '请求过于频繁，请稍后再试',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: false
  };
}

/**
 * 默认 Redis 配置
 */
export const DEFAULT_REDIS_CONFIG: RedisConfig = {
  enabled: false,
  host: 'localhost',
  port: 6379,
  db: 0,
  keyPrefix: 'apex_bridge:',
  connectTimeout: 10000,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100
};

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: AdminConfig = {
  api: {
    host: '0.0.0.0',
    port: 3000,
    cors: {
      origin: '*',
      credentials: true
    }
  },
  llm: {
    providers: [],
    defaultProvider: 'openai',
    timeout: 30000,
    maxRetries: 3
  },
  auth: {
    enabled: true,
    apiKey: process.env.ABP_API_KEY || '',
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    jwtExpiresIn: '24h'
  },
  performance: {
    workerPoolSize: 4,
    requestTimeout: 60000,
    maxRequestSize: '50mb'
  },
  redis: {
    ...DEFAULT_REDIS_CONFIG
  },
  security: {
    rateLimit: createDefaultRateLimitSettings()
  }
};
