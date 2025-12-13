/**
 * ConfigService - 简化配置管理服务
 * 负责从JSON文件读取和写入配置，替代.env文件
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { PathService } from './PathService';

// 使用PathService管理路径
const pathService = PathService.getInstance();

/**
 * API Key 信息结构
 */
export interface ApiKeyInfo {
  id: string;                    // 唯一标识
  name: string;                  // 名称（如 "默认项目"、"cherry"）
  key: string;                   // 完整的 API Key
  createdAt: number;             // 创建时间戳
  lastUsedAt?: number;          // 上次使用时间戳（可选）
  ownerId?: string;              // 所属人ID（可选）
}

export type RateLimitStrategyType = 'ip' | 'apiKey' | 'user' | 'header';

export interface RateLimitStrategyConfig {
  type: RateLimitStrategyType | string;
  headerName?: string;
  description?: string;
}

export interface RateLimitMatcherConfig {
  path?: string;
  prefix?: string;
  regex?: string;
  methods?: string[];
}

export interface RateLimitRuleConfig {
  id: string;
  name?: string;
  description?: string;
  priority?: number;
  windowMs: number;
  maxRequests: number;
  strategy: RateLimitStrategyConfig;
  matcher: RateLimitMatcherConfig;
  matchers?: RateLimitMatcherConfig[];
  mode?: 'sliding' | 'fixed';
  strategyOrder?: RateLimitStrategyType[];
  responseHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  enabled?: boolean;
}

export interface RateLimitHeadersConfig {
  limit?: string;
  remaining?: string;
  reset?: string;
  retryAfter?: string;
}

export interface RateLimitSettings {
  enabled: boolean;
  windowMs: number;
  max: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  trustProxy?: boolean;
  rules?: RateLimitRuleConfig[];
  headers?: RateLimitHeadersConfig;
  defaultStrategyOrder?: RateLimitStrategyType[];
  provider?: 'auto' | 'redis' | 'memory';
  keyPrefix?: string;
}

export interface RedisConfig {
  enabled: boolean;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  url?: string;
  socket?: {
    host?: string;
    port?: number;
  };
  connectTimeout?: number;
  connectTimeoutMs?: number;
  lazyConnect?: boolean;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  username?: string;
  tls?: any;
}

export interface AdminConfig {
  // API 配置
  api: {
    host?: string;
    port?: number;
    cors?: {
      origin?: string | string[];
      credentials?: boolean;
    };
  };

  // LLM 配置
  llm: {
    providers?: Array<{
      id: string;
      provider: string;
      name: string;
      config: any;
      enabled: boolean;
      createdAt: number;
      updatedAt: number;
    }>;
    defaultProvider?: string;
    fallbackProvider?: string;
    timeout?: number;
    maxRetries?: number;
  };

  // 认证配置
  auth: {
    enabled: boolean;
    apiKey?: string;
    jwtSecret?: string;
    jwtExpiresIn?: string;
    apiKeys?: ApiKeyInfo[];
  };

  // 日志配置
  logging?: {
    level?: string;
    file?: string;
  };

  // 性能配置
  performance?: {
    workerPoolSize?: number;
    requestTimeout?: number;
    maxRequestSize?: string;
  };

  // Redis配置
  redis?: RedisConfig;

  // 安全配置
  security?: {
    rateLimit?: RateLimitSettings;
  };

  // ACE架构配置
  ace?: AceConfig;

  // 🆕 自我思考循环配置（ReAct模式）
  // 注意：ReAct 模式通过 XML 标签协议判断任务完成，不再需要独立的评估器配置
  // 所有配置通过 API 请求参数传递（systemPrompt, additionalPrompts, tools 等）

  [key: string]: any;
}

/**
 * ACE架构配置接口
 */
export interface AceConfig {
  enabled?: boolean;
  orchestration?: AceOrchestrationConfig;
  layers?: AceLayersConfig;
  memory?: AceMemoryConfig;
  optimization?: AceOptimizationConfig;
  skills?: AceSkillsConfig;
  localImplementation?: AceLocalImplementationConfig;
}

/**
 * ACE编排配置
 */
export interface AceOrchestrationConfig {
  enabled?: boolean;
  mode?: 'full' | 'minimal' | 'custom';
}

/**
 * ACE层级配置（L1-L6）
 */
export interface AceLayersConfig {
  l1?: AceLayerL1Config;
  l2?: AceLayerL2Config;
  l3?: AceLayerL3Config;
  l4?: AceLayerL4Config;
  l5?: AceLayerL5Config;
  l6?: AceLayerL6Config;
}

/**
 * L1层级配置（渴望层 - 道德约束）
 */
export interface AceLayerL1Config {
  enabled?: boolean;
  constitutionPath?: string;
  modelSource?: 'sqlite';
}

/**
 * L2层级配置（全球战略层）
 */
export interface AceLayerL2Config {
  enabled?: boolean;
  modelSource?: 'sqlite';
}

/**
 * L3层级配置（代理模型层）
 */
export interface AceLayerL3Config {
  enabled?: boolean;
  modelSource?: 'sqlite';
}

/**
 * L4层级配置（执行功能层）
 */
export interface AceLayerL4Config {
  enabled?: boolean;
  modelSource?: 'sqlite';
}

/**
 * L5层级配置（认知控制层）
 */
export interface AceLayerL5Config {
  enabled?: boolean;
  modelSource?: 'sqlite';
  fallbackToEvolution?: boolean;
}

/**
 * L6层级配置（任务执行层）
 */
export interface AceLayerL6Config {
  enabled?: boolean;
  useLLM?: boolean;
}

/**
 * ACE内存配置
 */
export interface AceMemoryConfig {
  provider?: 'lancedb' | 'memory' | 'custom';
  vectorDbPath?: string;
  collectionPrefix?: string;
}

/**
 * ACE优化配置
 */
export interface AceOptimizationConfig {
  fastTrackSimpleTasks?: boolean;
  l5ScratchpadCompression?: boolean;
  l6NonLLMExecution?: boolean;
}

/**
 * ACE技能系统配置
 */
export interface AceSkillsConfig {
  autoCleanupEnabled?: boolean;
  cleanupTimeoutMs?: number;
  maxActiveSkills?: number;
}

/**
 * ACE本地化实现配置
 */
export interface AceLocalImplementationConfig {
  enabled?: boolean;
  aceCore?: {
    reflectionCycleInterval?: number;
    maxSessionAge?: number;
  };
  useEventBus?: boolean;
  useLLMManager?: boolean;
  useSQLiteConfig?: boolean;
}

/**
 * 创建默认限流设置
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
 * 创建默认Redis配置
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

export class ConfigService {
  private static instance: ConfigService;
  private configCache: AdminConfig | null = null;
  private configPath: string;

  private constructor() {
    this.configPath = pathService.getConfigFilePath();
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * 检查是否已完成初始化设置
   */
  public isSetupCompleted(): boolean {
    try {
      const config = this.readConfig();
      return !!(config?.auth?.apiKey && config.auth.apiKey.trim() !== '');
    } catch (error) {
      logger.error('检查初始化状态失败:', error);
      return false;
    }
  }

  /**
   * 读取配置（同步）
   * 
   * 修复：区分文件不存在和解析错误
   * - 文件不存在：创建默认配置（首次启动）
   * - 解析错误：抛出异常，防止覆盖用户配置
   */
  public readConfig(): AdminConfig {
    if (this.configCache) {
      return this.configCache;
    }

    try {
      // 直接读取，通过错误码判断是否存在
      const configData = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(configData) as AdminConfig;

      // 缓存配置
      this.configCache = config;

      return config;
    } catch (error: any) {
      // 1. 文件不存在：创建默认配置（首次启动）
      if (error.code === 'ENOENT') {
        logger.warn(`配置文件不存在: ${this.configPath}，创建默认配置`);
        this.writeConfig(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }

      // 2. JSON 解析错误或其他 IO 错误：这是严重故障，不能覆盖文件！
      logger.error(`❌ 配置文件损坏或无法读取: ${this.configPath}`);
      logger.error(`错误详情: ${error.message}`);
      // 抛出错误，阻止应用在配置错误的情况下启动
      throw new Error(`Configuration load failed: ${error.message}`);
    }
  }

  /**
   * 读取配置（异步）
   * 
   * 修复：区分文件不存在和解析错误
   * - 文件不存在：创建默认配置（首次启动）
   * - 解析错误：抛出异常，防止覆盖用户配置
   */
  public async readConfigAsync(): Promise<AdminConfig> {
    if (this.configCache) {
      return this.configCache;
    }

    try {
      // 直接读取，通过错误码判断是否存在（避免 TOCTOU 竞态条件）
      const configData = await fsPromises.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData) as AdminConfig;

      // 缓存配置
      this.configCache = config;

      return config;
    } catch (error: any) {
      // 1. 文件不存在：创建默认配置（首次启动）
      if (error.code === 'ENOENT') {
        logger.warn(`配置文件不存在: ${this.configPath}，创建默认配置`);
        await this.writeConfigAsync(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }

      // 2. JSON 解析错误或其他 IO 错误：这是严重故障，不能覆盖文件！
      logger.error(`❌ 配置文件损坏或无法读取: ${this.configPath}`, error);
      // 抛出错误，阻止应用在配置错误的情况下启动
      throw new Error(`Configuration load failed: ${error.message}`);
    }
  }

  /**
   * 写入配置（同步 - 原子写入）
   * 
   * 修复：使用临时文件+重命名策略，防止断电导致配置文件损坏
   */
  public writeConfig(config: AdminConfig): void {
    try {
      // 确保目录存在
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const configData = JSON.stringify(config, null, 2);
      const tempPath = `${this.configPath}.tmp`;

      // 1. 先写入临时文件
      fs.writeFileSync(tempPath, configData, 'utf-8');
      
      // 2. 原子重命名（操作系统级别的原子操作）
      fs.renameSync(tempPath, this.configPath);

      // 更新缓存
      this.configCache = config;

      logger.info(`配置已保存: ${this.configPath}`);
    } catch (error) {
      logger.error(`写入配置失败: ${this.configPath}`, error);
      // 清理可能的临时文件
      try {
        const tempPath = `${this.configPath}.tmp`;
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (cleanupError) {
        // 忽略清理错误
      }
      throw error;
    }
  }

  /**
   * 写入配置（异步 - 原子写入）
   * 
   * 修复：使用临时文件+重命名策略，防止断电导致配置文件损坏
   */
  public async writeConfigAsync(config: AdminConfig): Promise<void> {
    try {
      // 确保目录存在
      const configDir = path.dirname(this.configPath);
      await fsPromises.mkdir(configDir, { recursive: true });

      const configData = JSON.stringify(config, null, 2);
      const tempPath = `${this.configPath}.tmp`;

      // 1. 先写入临时文件
      await fsPromises.writeFile(tempPath, configData, 'utf-8');
      
      // 2. 原子重命名（操作系统级别的原子操作）
      await fsPromises.rename(tempPath, this.configPath);

      // 更新缓存
      this.configCache = config;

      logger.info(`配置已保存: ${this.configPath}`);
    } catch (error) {
      logger.error(`写入配置失败: ${this.configPath}`, error);
      // 清理可能的临时文件
      try {
        const tempPath = `${this.configPath}.tmp`;
        await fsPromises.unlink(tempPath).catch(() => {
          // 忽略清理错误
        });
      } catch (cleanupError) {
        // 忽略清理错误
      }
      throw error;
    }
  }

  /**
   * 更新配置（部分更新）
   */
  public async updateConfigAsync(updates: Partial<AdminConfig>): Promise<AdminConfig> {
    const currentConfig = await this.readConfigAsync();
    const updatedConfig = this.mergeConfig(currentConfig, updates);
    await this.writeConfigAsync(updatedConfig);
    return updatedConfig;
  }

  /**
   * 重载配置（清除缓存）
   */
  public reloadConfig(): AdminConfig {
    this.configCache = null;
    return this.readConfig();
  }

  /**
   * 递归合并配置对象（深层合并）
   * 
   * 修复：支持多层级配置更新，防止嵌套配置丢失
   * 例如：更新 redis.socket.host 不会丢失 redis.socket.port
   */
  private mergeConfig(base: AdminConfig, updates: Partial<AdminConfig>): AdminConfig {
    const result = { ...base };

    Object.keys(updates).forEach(key => {
      const updateValue = updates[key];
      const baseValue = base[key];

      // 如果更新值和基础值都是对象（非数组），进行递归合并
      if (
        updateValue !== undefined &&
        updateValue !== null &&
        typeof updateValue === 'object' &&
        !Array.isArray(updateValue) &&
        baseValue !== undefined &&
        baseValue !== null &&
        typeof baseValue === 'object' &&
        !Array.isArray(baseValue)
      ) {
        // 递归合并对象
        result[key] = this.mergeConfig(baseValue as any, updateValue as any);
      } else if (updateValue !== undefined) {
        // 数组或基本类型直接覆盖
        result[key] = updateValue as any;
      }
    });

    return result;
  }

  // 兼容性方法
  loadConfig() {
    return this.readConfig();
  }

  getCurrentConfig() {
    return this.readConfig();
  }

  reload() {
    return this.reloadConfig();
  }

  /**
   * 更新配置（同步版本）
   */
  public updateConfig(updates: Partial<AdminConfig>): AdminConfig {
    const currentConfig = this.readConfig();
    const updatedConfig = this.mergeConfig(currentConfig, updates);
    this.writeConfig(updatedConfig);
    return updatedConfig;
  }

  /**
   * 验证配置
   */
  public validateConfig(config: AdminConfig): { valid: boolean; errors: string[]; warnings?: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 基础验证
      if (!config.auth || typeof config.auth.enabled !== 'boolean') {
        errors.push('auth.enabled 必须是布尔值');
      }

      if (config.auth.enabled && !config.auth.apiKey) {
        errors.push('启用认证时必须提供 apiKey');
      }

      if (!config.api || typeof config.api.port !== 'number') {
        errors.push('api.port 必须是数字');
      }

      if (config.api.port && (config.api.port < 1 || config.api.port > 65535)) {
        errors.push('api.port 必须在 1-65535 范围内');
      }

      // ACE配置验证
      if (config.ace) {
        this.validateAceConfig(config.ace, errors, warnings);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      logger.error('配置验证失败:', error);
      return {
        valid: false,
        errors: ['配置验证过程中发生错误']
      };
    }
  }

  /**
   * 验证ACE配置
   */
  private validateAceConfig(aceConfig: AceConfig, errors: string[], warnings: string[]): void {
    // 验证层级配置
    if (aceConfig.layers) {
      this.validateAceLayers(aceConfig.layers, errors, warnings);
    }

    // 验证内存配置
    if (aceConfig.memory) {
      this.validateAceMemory(aceConfig.memory, errors, warnings);
    }

    // 验证优化配置
    if (aceConfig.optimization) {
      this.validateAceOptimization(aceConfig.optimization, errors, warnings);
    }

    // 验证技能配置
    if (aceConfig.skills) {
      this.validateAceSkills(aceConfig.skills, errors, warnings);
    }

    // 验证本地化实现配置
    if (aceConfig.localImplementation) {
      this.validateAceLocalImplementation(aceConfig.localImplementation, errors, warnings);
    }
  }

  /**
   * 验证ACE层级配置
   */
  private validateAceLayers(layers: AceLayersConfig, errors: string[], warnings: string[]): void {
    const layerNames = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];

    for (const layerName of layerNames) {
      const layer = (layers as any)[layerName];
      if (layer && layer.enabled) {
        // 验证L1层宪法文件路径
        if (layerName === 'l1' && layer.constitutionPath) {
          if (typeof layer.constitutionPath !== 'string') {
            errors.push(`ace.layers.${layerName}.constitutionPath 必须是字符串`);
          } else if (!layer.constitutionPath.startsWith('./')) {
            warnings.push(`ace.layers.${layerName}.constitutionPath 建议使用相对路径`);
          }
        }

        // 验证模型来源
        if (layer.modelSource && layer.modelSource !== 'sqlite') {
          errors.push(`ace.layers.${layerName}.modelSource 只支持 sqlite`);
        }

        // L5层fallbackToEvolution验证
        if (layerName === 'l5' && typeof layer.fallbackToEvolution !== 'boolean') {
          warnings.push(`ace.layers.${layerName}.fallbackToEvolution 建议设置为布尔值`);
        }

        // L6层useLLM验证
        if (layerName === 'l6' && typeof layer.useLLM !== 'boolean') {
          warnings.push(`ace.layers.${layerName}.useLLM 建议设置为布尔值`);
        }
      }
    }
  }

  /**
   * 验证ACE内存配置
   */
  private validateAceMemory(memory: AceMemoryConfig, errors: string[], warnings: string[]): void {
    if (memory.provider) {
      const validProviders = ['lancedb', 'memory', 'custom'];
      if (!validProviders.includes(memory.provider)) {
        errors.push(`ace.memory.provider 必须是: ${validProviders.join(', ')} 中的一个`);
      }
    }

    if (memory.vectorDbPath && typeof memory.vectorDbPath !== 'string') {
      errors.push('ace.memory.vectorDbPath 必须是字符串');
    }

    if (memory.collectionPrefix && typeof memory.collectionPrefix !== 'string') {
      errors.push('ace.memory.collectionPrefix 必须是字符串');
    }
  }

  /**
   * 验证ACE优化配置
   */
  private validateAceOptimization(optimization: AceOptimizationConfig, errors: string[], warnings: string[]): void {
    if (typeof optimization.fastTrackSimpleTasks !== 'boolean') {
      warnings.push('ace.optimization.fastTrackSimpleTasks 建议设置为布尔值');
    }

    if (typeof optimization.l5ScratchpadCompression !== 'boolean') {
      warnings.push('ace.optimization.l5ScratchpadCompression 建议设置为布尔值');
    }

    if (typeof optimization.l6NonLLMExecution !== 'boolean') {
      warnings.push('ace.optimization.l6NonLLMExecution 建议设置为布尔值');
    }
  }

  /**
   * 验证ACE技能配置
   */
  private validateAceSkills(skills: AceSkillsConfig, errors: string[], warnings: string[]): void {
    if (typeof skills.autoCleanupEnabled !== 'boolean') {
      warnings.push('ace.skills.autoCleanupEnabled 建议设置为布尔值');
    }

    if (skills.cleanupTimeoutMs && typeof skills.cleanupTimeoutMs !== 'number') {
      errors.push('ace.skills.cleanupTimeoutMs 必须是数字');
    } else if (skills.cleanupTimeoutMs && skills.cleanupTimeoutMs < 0) {
      errors.push('ace.skills.cleanupTimeoutMs 必须大于0');
    }

    if (skills.maxActiveSkills && typeof skills.maxActiveSkills !== 'number') {
      errors.push('ace.skills.maxActiveSkills 必须是数字');
    } else if (skills.maxActiveSkills && skills.maxActiveSkills < 1) {
      errors.push('ace.skills.maxActiveSkills 必须大于0');
    }
  }

  /**
   * 验证ACE本地化实现配置
   */
  private validateAceLocalImplementation(localImpl: AceLocalImplementationConfig, errors: string[], warnings: string[]): void {
    if (typeof localImpl.enabled !== 'boolean') {
      warnings.push('ace.localImplementation.enabled 建议设置为布尔值');
    }

    // 验证AceCore配置
    if (localImpl.aceCore) {
      if (localImpl.aceCore.reflectionCycleInterval && typeof localImpl.aceCore.reflectionCycleInterval !== 'number') {
        errors.push('ace.localImplementation.aceCore.reflectionCycleInterval 必须是数字');
      } else if (localImpl.aceCore.reflectionCycleInterval && localImpl.aceCore.reflectionCycleInterval < 1000) {
        warnings.push('ace.localImplementation.aceCore.reflectionCycleInterval 建议大于1000毫秒');
      }

      if (localImpl.aceCore.maxSessionAge && typeof localImpl.aceCore.maxSessionAge !== 'number') {
        errors.push('ace.localImplementation.aceCore.maxSessionAge 必须是数字');
      } else if (localImpl.aceCore.maxSessionAge && localImpl.aceCore.maxSessionAge < 60000) {
        warnings.push('ace.localImplementation.aceCore.maxSessionAge 建议大于60000毫秒');
      }
    }

    if (typeof localImpl.useEventBus !== 'boolean') {
      warnings.push('ace.localImplementation.useEventBus 建议设置为布尔值');
    }

    if (typeof localImpl.useLLMManager !== 'boolean') {
      warnings.push('ace.localImplementation.useLLMManager 建议设置为布尔值');
    }

    if (typeof localImpl.useSQLiteConfig !== 'boolean') {
      warnings.push('ace.localImplementation.useSQLiteConfig 建议设置为布尔值');
    }
  }
}