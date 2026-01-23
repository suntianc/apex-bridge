/**
 * 管理员配置类型定义
 *
 * ACE 功能已删除 (2026-01-11)
 */

import type { ApiKeyInfo } from "./api-key";
import type { RateLimitSettings } from "./rate-limit";
import type { RedisConfig } from "./redis";

/**
 * API 配置
 */
export interface ApiConfig {
  /** 主机地址 */
  host?: string;
  /** 端口 */
  port?: number;
  /** CORS 配置 */
  cors?: {
    /** 允许的源 */
    origin?: string | string[];
    /** 是否支持凭证 */
    credentials?: boolean;
  };
}

/**
 * LLM 提供商配置项
 */
export interface LLMProviderItem {
  /** 提供商 ID */
  id: string;
  /** 提供商标识 */
  provider: string;
  /** 提供商名称 */
  name: string;
  /** 提供商配置 */
  config: Record<string, unknown>;
  /** 是否启用 */
  enabled: boolean;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
}

/**
 * LLM 配置
 */
export interface LLMConfig {
  /** LLM 提供商列表 */
  providers?: LLMProviderItem[];
  /** 默认提供商 */
  defaultProvider?: string;
  /** 备用提供商 */
  fallbackProvider?: string;
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
}

/**
 * 认证配置
 */
export interface AuthConfig {
  /** 是否启用认证 */
  enabled: boolean;
  /** API Key */
  apiKey?: string;
  /** JWT 密钥 */
  jwtSecret?: string;
  /** JWT 过期时间 */
  jwtExpiresIn?: string;
  /** API Key 列表 */
  apiKeys?: ApiKeyInfo[];
}

/**
 * 日志配置
 */
export interface LoggingConfig {
  /** 日志级别 */
  level?: string;
  /** 日志文件路径 */
  file?: string;
}

/**
 * 性能配置
 */
export interface PerformanceConfig {
  /** 工作线程池大小 */
  workerPoolSize?: number;
  /** 请求超时（毫秒） */
  requestTimeout?: number;
  /** 最大请求大小 */
  maxRequestSize?: string;
}

/**
 * 安全配置
 */
export interface SecurityConfig {
  /** 速率限制设置 */
  rateLimit?: RateLimitSettings;
}

/**
 * 管理员配置（主配置类型）
 */
export interface AdminConfig {
  /** API 配置 */
  api: ApiConfig;
  /** LLM 配置 */
  llm: LLMConfig;
  /** 认证配置 */
  auth: AuthConfig;
  /** 日志配置 */
  logging?: LoggingConfig;
  /** 性能配置 */
  performance?: PerformanceConfig;
  /** Redis 配置 */
  redis?: RedisConfig;
  /** 安全配置 */
  security?: SecurityConfig;
  /** 设置完成状态 */
  setup_completed?: boolean;
  /** 允许动态属性 */
  [key: string]: unknown;
}

/**
 * 路径配置
 */
export interface PathsConfig {
  /** 根目录 */
  rootDir: string;
  /** 配置目录 */
  configDir: string;
  /** 数据目录 */
  dataDir: string;
  /** 日志目录 */
  logDir: string;
  /** 向量存储目录 */
  vectorStoreDir: string;
}

/**
 * 安全配置（系统级）
 */
export interface SystemSecurityConfig {
  /** ABP API Key */
  abpApiKey: string;
  /** JWT 密钥 */
  jwtSecret: string;
  /** 宪法文件路径 */
  constitutionPath: string;
}

/**
 * 环境配置
 */
export interface EnvironmentConfig {
  /** Node 环境 */
  nodeEnv: string;
  /** 日志级别 */
  logLevel: string;
  /** 日志文件路径 */
  logFile: string;
  /** 最大请求大小 */
  maxRequestSize: string;
  /** 安全日志级别 */
  securityLogLevel: string;
  /** 是否启用安全日志 */
  securityLogEnabled: boolean;
  /** 是否详细日志 */
  verboseLogging: boolean;
}

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  /** SQLite 数据库路径 */
  sqlitePath: string;
}

/**
 * 系统级配置接口
 */
export interface SystemConfig {
  /** 服务端口 */
  port: number;
  /** 是否自动启动 */
  autostart: boolean;
  /** 路径配置 */
  paths: PathsConfig;
  /** 安全配置 */
  security: SystemSecurityConfig;
  /** 环境配置 */
  environment: EnvironmentConfig;
  /** 数据库配置 */
  database: DatabaseConfig;
}

/**
 * 完整配置接口（系统级 + 应用级）
 */
export interface FullConfig {
  /** 系统级配置 */
  port: number;
  autostart: boolean;
  paths: PathsConfig;
  systemSecurity: SystemSecurityConfig;
  environment: EnvironmentConfig;
  database: DatabaseConfig;
  /** 应用级配置 */
  setup_completed?: boolean;
  api?: ApiConfig;
  auth?: AuthConfig;
  performance?: PerformanceConfig;
  redis?: RedisConfig;
  appSecurity?: SecurityConfig;
}
