/**
 * ConfigService - 简化配置管理服务
 *
 * 重构说明：
 * - 类型定义迁移到 types/config/ 目录
 * - 配置加载逻辑迁移到 ConfigLoader
 * - 配置验证逻辑迁移到 ConfigValidator
 * - 配置写入逻辑迁移到 ConfigWriter
 * - 主服务仅保留协调逻辑
 *
 * ACE 功能已删除 (2026-01-11)
 */

import { logger } from "../utils/logger";
import { ConfigLoader, ConfigValidator, ConfigWriter } from "../utils/config";
import {
  DEFAULT_CONFIG,
  createDefaultRateLimitSettings,
  DEFAULT_REDIS_CONFIG,
} from "../utils/config-constants";
import type {
  AdminConfig,
  SystemConfig,
  FullConfig,
  SystemSecurityConfig,
  EnvironmentConfig,
  DatabaseConfig,
  PathsConfig,
  ApiKeyInfo,
  RateLimitSettings,
  RedisConfig,
  RateLimitStrategyType,
  RateLimitStrategyConfig,
  RateLimitMatcherConfig,
  RateLimitRuleConfig,
  RateLimitHeadersConfig,
} from "../types/config/index";

/**
 * 配置服务
 *
 * 单例模式，协调 ConfigLoader、ConfigValidator、ConfigWriter
 */
export class ConfigService {
  private static instance: ConfigService | null = null;
  private readonly loader: ConfigLoader;
  private readonly validator: ConfigValidator;
  private readonly writer: ConfigWriter;

  private constructor() {
    this.loader = ConfigLoader.getInstance();
    this.validator = new ConfigValidator();
    this.writer = new ConfigWriter();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  // ==================== 配置读取方法 ====================

  /**
   * 读取配置（同步）
   */
  public readConfig(): AdminConfig {
    return this.loader.loadSync();
  }

  /**
   * 读取配置（异步）
   */
  public async readConfigAsync(): Promise<AdminConfig> {
    return this.loader.loadAsync();
  }

  /**
   * 获取当前配置（兼容性方法）
   */
  public getCurrentConfig(): AdminConfig {
    return this.readConfig();
  }

  /**
   * 加载配置（兼容性方法）
   */
  public loadConfig(): AdminConfig {
    return this.readConfig();
  }

  // ==================== 配置写入方法 ====================

  /**
   * 写入配置（同步）
   */
  public writeConfig(config: AdminConfig): void {
    this.loader.writeSync(config);
  }

  /**
   * 写入配置（异步）
   */
  public async writeConfigAsync(config: AdminConfig): Promise<void> {
    await this.loader.writeAsync(config);
  }

  // ==================== 配置更新方法 ====================

  /**
   * 更新配置（异步）
   */
  public async updateConfigAsync(updates: Partial<AdminConfig>): Promise<AdminConfig> {
    return this.writer.updateAsync(updates);
  }

  /**
   * 更新配置（同步）
   */
  public updateConfig(updates: Partial<AdminConfig>): AdminConfig {
    return this.writer.update(updates);
  }

  // ==================== 配置重载方法 ====================

  /**
   * 重载配置（清除缓存）
   */
  public reloadConfig(): AdminConfig {
    this.loader.clearCache();
    return this.readConfig();
  }

  /**
   * 重载（兼容性方法）
   */
  public reload(): AdminConfig {
    return this.reloadConfig();
  }

  // ==================== 配置验证方法 ====================

  /**
   * 验证配置
   */
  public validateConfig(config: AdminConfig): {
    valid: boolean;
    errors: string[];
    warnings?: string[];
  } {
    return this.validator.validate(config);
  }

  /**
   * 验证系统配置（环境变量）
   */
  public validateSystemConfig(): { valid: boolean; errors: string[]; warnings: string[] } {
    const systemConfig = this.getSystemConfig();
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!systemConfig.security.abpApiKey) {
      errors.push("ABP_API_KEY 未设置（环境变量）");
    }

    if (!systemConfig.security.jwtSecret) {
      errors.push("JWT_SECRET 未设置（环境变量）");
    }

    if (systemConfig.port < 1 || systemConfig.port > 65535) {
      errors.push(`PORT 必须在 1-65535 范围内，当前值：${systemConfig.port}`);
    }

    if (!systemConfig.paths.rootDir) {
      errors.push("APEX_BRIDGE_ROOT_DIR 未设置");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==================== 系统配置方法 ====================

  /**
   * 检查是否已完成初始化设置
   */
  public isSetupCompleted(): boolean {
    try {
      const config = this.readConfig();
      return !!(config?.auth?.apiKey && config.auth.apiKey.trim() !== "");
    } catch (error) {
      logger.error("检查初始化状态失败:", error);
      return false;
    }
  }

  /**
   * 获取系统级配置（从环境变量读取）
   */
  public getSystemConfig(): SystemConfig {
    const { API } = require("../constants");
    const port = parseInt(process.env.PORT || String(API.DEFAULT_PORT), 10);
    const autostart = process.env.APEX_BRIDGE_AUTOSTART !== "false";

    return {
      port,
      autostart,
      paths: this.getPathsConfig(),
      security: this.getSystemSecurityConfig(),
      environment: this.getEnvironmentConfig(),
      database: this.getDatabaseConfig(),
    };
  }

  /**
   * 获取应用级配置（从 JSON 读取）
   */
  public getAppConfig(): Partial<AdminConfig> {
    const config = this.readConfig();
    return {
      setup_completed: config.setup_completed,
      api: config.api,
      llm: config.llm,
      auth: config.auth,
      performance: config.performance,
      redis: config.redis,
      security: config.security,
    };
  }

  /**
   * 获取完整配置（env 优先，JSON 作为后备）
   */
  public getFullConfig(): FullConfig {
    const systemConfig = this.getSystemConfig();
    const appConfig = this.getAppConfig();

    return {
      port: systemConfig.port,
      autostart: systemConfig.autostart,
      paths: systemConfig.paths,
      systemSecurity: systemConfig.security,
      environment: systemConfig.environment,
      database: systemConfig.database,
      setup_completed: appConfig.setup_completed,
      api: appConfig.api,
      auth: {
        ...appConfig.auth,
        apiKey: systemConfig.security.abpApiKey,
        jwtSecret: systemConfig.security.jwtSecret,
      },
      performance: appConfig.performance,
      redis: {
        ...appConfig.redis,
        enabled: this.parseBooleanEnv("APEX_CACHE_ENABLED", appConfig.redis?.enabled ?? false),
        host: process.env.REDIS_HOST || appConfig.redis?.host || "localhost",
        port: parseInt(process.env.REDIS_PORT || String(appConfig.redis?.port || 6379), 10),
        password: process.env.REDIS_PASSWORD || appConfig.redis?.password || "",
        db: appConfig.redis?.db ?? 0,
      },
      appSecurity: appConfig.security,
    };
  }

  // ==================== 私有辅助方法 ====================

  private getPathsConfig(): PathsConfig {
    return {
      rootDir: process.env.APEX_BRIDGE_ROOT_DIR || process.cwd(),
      configDir: process.env.APEX_BRIDGE_CONFIG_DIR || `${process.cwd()}/config`,
      dataDir: process.env.APEX_BRIDGE_DATA_DIR || `${process.cwd()}/.data`,
      logDir: process.env.APEX_BRIDGE_LOG_DIR || `${process.cwd()}/logs`,
      vectorStoreDir:
        process.env.APEX_BRIDGE_VECTOR_STORE_DIR || `${process.cwd()}/.data/vector-store`,
    };
  }

  private getSystemSecurityConfig(): SystemSecurityConfig {
    return {
      abpApiKey: process.env.ABP_API_KEY || "",
      jwtSecret: process.env.JWT_SECRET || "",
      constitutionPath: process.env.CONSTITUTION_PATH || "./config/constitution.md",
    };
  }

  private getEnvironmentConfig(): EnvironmentConfig {
    return {
      nodeEnv: process.env.NODE_ENV || "development",
      logLevel: process.env.LOG_LEVEL || "info",
      logFile: process.env.LOG_FILE || "./logs/apex-bridge.log",
      maxRequestSize: process.env.MAX_REQUEST_SIZE || "100mb",
      securityLogLevel: process.env.SECURITY_LOG_LEVEL || "warn",
      securityLogEnabled: process.env.SECURITY_LOG_ENABLED !== "false",
      verboseLogging: process.env.VERBOSE_LOGGING === "true",
    };
  }

  private getDatabaseConfig(): DatabaseConfig {
    return {
      sqlitePath: process.env.SQLITE_PATH || "./.data/llm_providers.db",
    };
  }

  /**
   * 解析布尔类型的环境变量
   */
  private parseBooleanEnv(envKey: string, defaultValue: boolean): boolean {
    const value = process.env[envKey];
    if (value === undefined || value === null) {
      return defaultValue;
    }
    return value === "true" || value === "1" || value === "yes";
  }
}

// ==================== 导出兼容 ====================

// 导出常量（保持原有导出位置）
export {
  DEFAULT_CONFIG,
  DEFAULT_REDIS_CONFIG,
  createDefaultRateLimitSettings,
} from "../utils/config-constants";

// 导出类型（保持原有导出位置）
export type {
  ApiKeyInfo,
  RateLimitSettings,
  RedisConfig,
  AdminConfig,
  RateLimitStrategyType,
  RateLimitStrategyConfig,
  RateLimitMatcherConfig,
  RateLimitRuleConfig,
  RateLimitHeadersConfig,
  SystemConfig,
  FullConfig,
} from "../types/config/index";
