/**
 * ConfigService - 配置管理服务
 * 负责从JSON文件读取和写入配置，替代.env文件
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { PathService } from './PathService';
import { Mutex } from '../utils/Mutex';
import { TransactionManager, TransactionOperation } from '../utils/TransactionManager';
import { RaceDetector, createOperationId, createResourceId } from '../utils/RaceDetector';

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

export interface RateLimitWhitelistConfig {
  ips?: string[];
  apiKeys?: string[];
  users?: string[];
}

export interface RateLimitRuleConfig {
  id: string;
  name?: string;
  description?: string;
  priority?: number;
  windowMs: number;
  maxRequests: number;
  mode?: 'sliding' | 'fixed';
  burstMultiplier?: number;
  matchers?: RateLimitMatcherConfig[];
  strategyOrder?: Array<string | RateLimitStrategyConfig>;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  whitelist?: RateLimitWhitelistConfig;
  responseHeaders?: boolean;
  metadata?: Record<string, any>;
}

export interface RateLimitHeadersConfig {
  limit?: string;
  remaining?: string;
  reset?: string;
  retryAfter?: string;
}

export interface RateLimitSettings {
  enabled: boolean;
  provider?: 'auto' | 'redis' | 'memory';
  trustProxy?: boolean;
  keyPrefix?: string;
  defaultStrategyOrder?: Array<string | RateLimitStrategyConfig>;
  whitelist?: RateLimitWhitelistConfig;
  headers?: RateLimitHeadersConfig;
  rules: RateLimitRuleConfig[];
}

const DEFAULT_RATE_LIMIT_SETTINGS: RateLimitSettings = {
  enabled: true,
  provider: 'auto',
  trustProxy: true,
  keyPrefix: 'rate_limit',
  headers: {
    limit: 'X-RateLimit-Limit',
    remaining: 'X-RateLimit-Remaining',
    reset: 'X-RateLimit-Reset',
    retryAfter: 'Retry-After'
  },
  defaultStrategyOrder: ['apiKey', 'ip'],
  whitelist: {
    ips: [],
    apiKeys: [],
    users: []
  },
  rules: [
    {
      id: 'chat-api',
      name: 'Chat Completions API',
      description: '限制聊天相关端点，优先按照 API Key 识别',
      windowMs: 60_000,
      maxRequests: 60,
      mode: 'sliding',
      burstMultiplier: 1.5,
      priority: 10,
      matchers: [
        { prefix: '/v1/chat', methods: ['POST'] }
      ],
      strategyOrder: ['apiKey', 'ip'],
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      responseHeaders: true
    },
    {
      id: 'models-api',
      name: 'Models Listing API',
      description: '限制模型列表端点，按 IP 区分',
      windowMs: 60_000,
      maxRequests: 120,
      mode: 'fixed',
      priority: 20,
      matchers: [
        { path: '/v1/models', methods: ['GET'] }
      ],
      strategyOrder: ['ip'],
      skipSuccessfulRequests: true,
      responseHeaders: true
    },
    {
      id: 'admin-api',
      name: 'Admin Panel API',
      description: '保护管理后台接口，按用户ID或IP限流',
      windowMs: 60_000,
      maxRequests: 120,
      mode: 'fixed',
      priority: 5,
      matchers: [
        { prefix: '/api/admin' }
      ],
      strategyOrder: ['user', 'ip'],
      skipFailedRequests: true,
      responseHeaders: true
    },
    {
      id: 'plugin-callback',
      name: 'Plugin Callback Endpoint',
      description: '限制插件回调接口，按 API Key/IP 控制',
      windowMs: 60_000,
      maxRequests: 90,
      mode: 'sliding',
      priority: 15,
      matchers: [
        { prefix: '/plugin-callback' }
      ],
      strategyOrder: ['apiKey', 'ip'],
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      responseHeaders: true
    }
  ]
};

export function createDefaultRateLimitSettings(): RateLimitSettings {
  return JSON.parse(JSON.stringify(DEFAULT_RATE_LIMIT_SETTINGS));
}

export interface RedisConfig {
  enabled: boolean;
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: boolean;
  keyPrefix?: string;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
  maxRetriesPerRequest?: number;
}

const DEFAULT_REDIS_CONFIG: RedisConfig = {
  enabled: false,
  host: '127.0.0.1',
  port: 6379,
  tls: false,
  keyPrefix: 'apexbridge',
  connectTimeoutMs: 5000,
  commandTimeoutMs: 3000,
  maxRetriesPerRequest: 2
};

export interface AdminConfig {
  setup_completed?: boolean;
  server: {
    port: number;
    host: string;
    nodeEnv: 'development' | 'production' | 'test';
    debugMode: boolean;
  };
  auth: {
    apiKey: string; // 节点之间的认证（WebSocket）
    apiKeys: ApiKeyInfo[];       // 🆕 从 string[] 改为 ApiKeyInfo[]，用于客户端HTTP API认证
    admin?: {
      username: string;
      password: string;
    };
    jwt?: {
      secret: string;
      expiresIn: number;          // seconds
      algorithm?: 'HS256' | 'HS384' | 'HS512';
    };
  };
  protocol?: {
    // 历史字段已弃用，保留为可选以兼容旧文件
    startMarker?: string;
    endMarker?: string;
    paramStartMarker?: string;
    paramEndMarker?: string;
  };
  plugins: {
    directory: string;
    autoLoad: boolean;
  };
  llm: {
    defaultProvider?: string;
    openai?: {
      apiKey: string;
      baseURL: string;
      defaultModel: string;
      timeout: number;
      maxRetries: number;
    };
    deepseek?: {
      apiKey: string;
      baseURL: string;
      defaultModel: string;
      timeout: number;
      maxRetries: number;
    };
    zhipu?: {
      apiKey: string;
      baseURL: string;
      defaultModel: string;
      timeout: number;
      maxRetries: number;
      mode?: 'default' | 'coding';
    };
    claude?: {
      apiKey: string;
      baseURL: string;
      defaultModel: string;
      timeout: number;
      maxRetries: number;
    };
    ollama?: {
      baseURL: string;
      defaultModel: string;
      timeout: number;
      maxRetries: number;
    };
    custom?: {
      apiKey?: string;
      baseURL: string;
      defaultModel: string;
      timeout: number;
      maxRetries: number;
    };
    quota?: {
      maxRequestsPerMinute?: number;
      maxTokensPerDay?: number;
      maxConcurrentStreams?: number;
      burstMultiplier?: number;
    };
  };
  rag?: {
    enabled: boolean;
    storagePath: string;
    vectorizer?: {
      provider?: string;
      baseURL?: string;
      apiKey: string;
      model: string;
      dimensions?: number;
      dim?: number;
      batch?: number;
      timeout?: number;
    };
    // 🆕 RAG 检索模式配置
    defaultMode?: 'basic' | 'time' | 'group' | 'rerank';
    defaultK?: number;
    maxK?: number;
    maxMultiplier?: number;
    semanticWeight?: number;
    timeWeight?: number;
    similarityThreshold?: number;
    // 🆕 语义组配置
    semanticGroup?: {
      configPath?: string;
      weight?: number;
    };
    // 🆕 Rerank 配置
    rerank?: {
      enabled?: boolean;
      baseURL?: string;
      apiKey?: string;
      model?: string;
      multiplier?: number;
      timeout?: number;
    };
    // 🆕 Tag 配置
    tagsConfig?: string;
    // 🆕 日记归档配置
    diaryArchiveAfterDays?: number;
  };
  memory?: {
    system?: string;
    verifyMemoryService?: boolean;
  };
  logging?: {
    level?: string;
    file?: string;
  };
  performance?: {
    workerPoolSize?: number;
    requestTimeout?: number;
    maxRequestSize?: string;
  };
  redis?: RedisConfig;
  pluginCallback?: {
    hmacWindowSeconds?: number;
    rateLimit?: {
      enabled?: boolean;
      windowMs?: number;
      max?: number;
    };
  };
  security?: {
    rateLimit?: RateLimitSettings;
  };
  [key: string]: any;
}

export class ConfigService {
  private static instance: ConfigService;
  private configCache: AdminConfig | null = null;
  private updateLock: Mutex = new Mutex(); // 配置更新锁，防止并发更新
  private raceDetector: RaceDetector;

  private constructor() {
    // 确保config目录存在
    const configDir = pathService.getConfigDir();
    pathService.ensureDir(configDir);
    this.raceDetector = RaceDetector.getInstance();
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * 检查配置文件和首次启动状态（同步版本，用于启动时检查）
   * 注意：为了保持向后兼容，提供同步版本，但实际读取文件仍使用同步操作
   */
  public isSetupCompleted(): boolean {
    const configFilePath = pathService.getConfigFilePath();
    
    if (!fs.existsSync(configFilePath)) {
      return false;
    }
    
    try {
      // 直接读取文件，不依赖缓存，确保获取最新状态
      // 使用同步操作，因为此方法在启动时被调用且需要立即返回结果
      const fileContent = fs.readFileSync(configFilePath, 'utf-8');
      const config = JSON.parse(fileContent) as AdminConfig;
      return config.setup_completed === true;
    } catch (error) {
      logger.warn('⚠️ Failed to read config file, setup not completed:', error);
      return false;
    }
  }

  /**
   * 异步检查配置文件和首次启动状态
   */
  public async isSetupCompletedAsync(): Promise<boolean> {
    const configFilePath = pathService.getConfigFilePath();
    
    try {
      await fsPromises.access(configFilePath);
      const fileContent = await fsPromises.readFile(configFilePath, 'utf-8');
      const config = JSON.parse(fileContent) as AdminConfig;
      return config.setup_completed === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 创建默认配置模板
   */
  public createDefaultConfig(): AdminConfig {
    const defaultConfig: AdminConfig = {
      setup_completed: false,
      server: {
        port: 8088,
        host: '0.0.0.0',
        nodeEnv: 'development',
        debugMode: false
      },
      auth: {
        apiKey: '',
        apiKeys: [],              // 🆕 现在是 ApiKeyInfo[]，初始为空数组
        admin: {
          username: 'admin',
          password: 'admin'
        }
      },
      protocol: {},
      plugins: {
        directory: './plugins',
        autoLoad: true
      },
      llm: {
        defaultProvider: 'openai',
        // 各提供商配置为空，需要用户填写
        quota: {
          maxRequestsPerMinute: 30,
          maxTokensPerDay: 200_000,
          maxConcurrentStreams: 3,
          burstMultiplier: 2
        }
      },
      rag: {
        enabled: false,
        storagePath: './vector_store',
        vectorizer: undefined,
        // 🆕 RAG 检索模式配置默认值
        defaultMode: 'basic',
        defaultK: 5,
        maxK: 20,
        maxMultiplier: 5.0,
        semanticWeight: 0.7,
        timeWeight: 0.3,
        similarityThreshold: 0.6,
        // 🆕 语义组配置
        semanticGroup: {
          configPath: './config/semantic_groups.json',
          weight: 0.5
        },
        // 🆕 Rerank 配置
        rerank: {
          enabled: false,
          baseURL: '',
          apiKey: '',
          model: 'rerank-english-v2.0',
          multiplier: 2.0,
          timeout: 5000
        },
        // 🆕 Tag 配置
        tagsConfig: './config/rag_tags.json',
        // 🆕 日记归档配置
        diaryArchiveAfterDays: 0
      },
      memory: {
        system: 'rag',
        verifyMemoryService: false
      },
      logging: {
        level: 'info',
        file: './logs/intellicore.log'
      },
      performance: {
        workerPoolSize: 4,
        requestTimeout: 60000,
        maxRequestSize: '50mb'
      },
      redis: {
        ...DEFAULT_REDIS_CONFIG
      },
      pluginCallback: {
        hmacWindowSeconds: 60,
        rateLimit: {
          enabled: true,
          windowMs: 60_000,
          max: 60
        }
      },
      security: {
        rateLimit: createDefaultRateLimitSettings()
      }
    };

    return this.normalizeConfigShape(defaultConfig);
  }

  /**
   * 读取配置文件（同步版本，保持向后兼容）
   */
  public readConfig(): AdminConfig {
    // 如果缓存存在，直接返回
    if (this.configCache) {
      return this.configCache;
    }

    const configFilePath = pathService.getConfigFilePath();
    
    // 如果文件不存在，创建默认配置
    if (!fs.existsSync(configFilePath)) {
      logger.info('📋 Config file not found, creating default config...');
      const defaultConfig = this.createDefaultConfig();
      this.writeConfig(defaultConfig);
      this.configCache = defaultConfig;
      return defaultConfig;
    }

    try {
      const fileContent = fs.readFileSync(configFilePath, 'utf-8');
      const config = JSON.parse(fileContent) as AdminConfig;
      
      // 合并默认配置，确保所有字段都存在
      const defaultConfig = this.createDefaultConfig();
      const mergedConfig = this.mergeConfig(defaultConfig, config);
      
      this.configCache = mergedConfig;
      return mergedConfig;
    } catch (error: any) {
      logger.error('❌ Failed to read config file:', error);
      
      // 尝试从备份恢复
      const configBackupPath = pathService.getConfigBackupPath();
      if (fs.existsSync(configBackupPath)) {
        logger.warn('⚠️ Attempting to restore from backup...');
        try {
          const backupContent = fs.readFileSync(configBackupPath, 'utf-8');
          const backupConfig = JSON.parse(backupContent) as AdminConfig;
          this.writeConfig(backupConfig);
          this.configCache = backupConfig;
          logger.info('✅ Restored config from backup');
          return backupConfig;
        } catch (backupError) {
          logger.error('❌ Failed to restore from backup:', backupError);
        }
      }
      
      // 恢复失败，使用默认配置
      logger.warn('⚠️ Using default config due to error');
      const defaultConfig = this.createDefaultConfig();
      this.writeConfig(defaultConfig);
      this.configCache = defaultConfig;
      return defaultConfig;
    }
  }

  /**
   * 异步读取配置文件（推荐使用，不阻塞事件循环）
   */
  public async readConfigAsync(): Promise<AdminConfig> {
    // 如果缓存存在，直接返回
    if (this.configCache) {
      return this.configCache;
    }

    const configFilePath = pathService.getConfigFilePath();
    
    try {
      // 检查文件是否存在
      try {
        await fsPromises.access(configFilePath);
      } catch {
        // 文件不存在，创建默认配置
        logger.info('📋 Config file not found, creating default config...');
        const defaultConfig = this.createDefaultConfig();
        await this.writeConfigAsync(defaultConfig);
        this.configCache = defaultConfig;
        return defaultConfig;
      }

      const fileContent = await fsPromises.readFile(configFilePath, 'utf-8');
      const config = JSON.parse(fileContent) as AdminConfig;
      
      // 合并默认配置，确保所有字段都存在
      const defaultConfig = this.createDefaultConfig();
      const mergedConfig = this.mergeConfig(defaultConfig, config);
      
      this.configCache = mergedConfig;
      return mergedConfig;
    } catch (error: any) {
      logger.error('❌ Failed to read config file:', error);
      
      // 尝试从备份恢复
      const configBackupPath = pathService.getConfigBackupPath();
      try {
        await fsPromises.access(configBackupPath);
        logger.warn('⚠️ Attempting to restore from backup...');
        const backupContent = await fsPromises.readFile(configBackupPath, 'utf-8');
        const backupConfig = JSON.parse(backupContent) as AdminConfig;
        await this.writeConfigAsync(backupConfig);
        this.configCache = backupConfig;
        logger.info('✅ Restored config from backup');
        return backupConfig;
      } catch (backupError) {
        logger.error('❌ Failed to restore from backup:', backupError);
      }
      
      // 恢复失败，使用默认配置
      logger.warn('⚠️ Using default config due to error');
      const defaultConfig = this.createDefaultConfig();
      await this.writeConfigAsync(defaultConfig);
      this.configCache = defaultConfig;
      return defaultConfig;
    }
  }

  /**
   * 写入配置文件（带备份，同步版本，保持向后兼容）
   */
  public writeConfig(config: AdminConfig): void {
    try {
      const configForWrite = this.normalizeConfigShape(JSON.parse(JSON.stringify(config)));
      const configFilePath = pathService.getConfigFilePath();
      const configBackupPath = pathService.getConfigBackupPath();
      
      // 创建备份
      if (fs.existsSync(configFilePath)) {
        const currentConfig = fs.readFileSync(configFilePath, 'utf-8');
        fs.writeFileSync(configBackupPath, currentConfig, 'utf-8');
        logger.debug('✅ Config backup created');
      }

      // 写入新配置
      const configJson = JSON.stringify(configForWrite, null, 2);
      fs.writeFileSync(configFilePath, configJson, 'utf-8');
      
      // 🆕 验证写入是否成功（读取回写的内容，特别是 apiKeys）
      try {
        const verifyConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
        if (configForWrite.auth?.apiKeys && verifyConfig.auth?.apiKeys) {
          if (verifyConfig.auth.apiKeys.length !== configForWrite.auth.apiKeys.length) {
            logger.warn(`⚠️ Config file write verification failed: apiKeys count mismatch (expected ${configForWrite.auth.apiKeys.length}, got ${verifyConfig.auth.apiKeys.length})`);
          } else {
            logger.debug(`✅ Config file write verified: ${configForWrite.auth.apiKeys.length} API keys saved`);
          }
        }
      } catch (verifyError) {
        logger.warn('⚠️ Failed to verify config file write:', verifyError);
      }
      
      // 清除缓存
      this.configCache = null;
      
      logger.info('✅ Config file saved');
    } catch (error: any) {
      logger.error('❌ Failed to write config file:', error);
      throw new Error(`Failed to save config: ${error.message}`);
    }
  }

  /**
   * 异步写入配置文件（带备份，推荐使用，不阻塞事件循环）
   * 使用原子写入机制防止竞态条件
   * 注意：此方法不获取锁，调用者应确保线程安全
   */
  public async writeConfigAsync(config: AdminConfig): Promise<void> {
    const configForWrite = this.normalizeConfigShape(JSON.parse(JSON.stringify(config)));
    const configFilePath = pathService.getConfigFilePath();
    const configBackupPath = pathService.getConfigBackupPath();
    
    // 创建临时文件路径
    const tempPath = `${configFilePath}.${Date.now()}.tmp`;
    
    // 创建备份
    let backupCreated = false;
    try {
      await fsPromises.access(configFilePath);
      const currentConfig = await fsPromises.readFile(configFilePath, 'utf-8');
      await fsPromises.writeFile(configBackupPath, currentConfig, 'utf-8');
      backupCreated = true;
      logger.debug('✅ Config backup created');
    } catch {
      // 文件不存在，跳过备份
    }

    try {
      // 写入临时文件
      const configJson = JSON.stringify(configForWrite, null, 2);
      await fsPromises.writeFile(tempPath, configJson, 'utf-8');
      
      // 验证临时文件内容
      const verifyContent = await fsPromises.readFile(tempPath, 'utf-8');
      const verifyConfig = JSON.parse(verifyContent);
      if (configForWrite.auth?.apiKeys && verifyConfig.auth?.apiKeys) {
        if (verifyConfig.auth.apiKeys.length !== configForWrite.auth.apiKeys.length) {
          throw new Error(`Config verification failed: apiKeys count mismatch (expected ${configForWrite.auth.apiKeys.length}, got ${verifyConfig.auth.apiKeys.length})`);
        }
      }
      
      // 原子重命名（在大多数文件系统上是原子的）
      await fsPromises.rename(tempPath, configFilePath);
      
      logger.debug(`✅ Config file write verified: ${configForWrite.auth?.apiKeys?.length || 0} API keys saved`);
      
      // 清除缓存
      this.configCache = null;
      
      logger.info('✅ Config file saved atomically');
      
      // 清理备份（成功写入后）
      if (backupCreated) {
        await fsPromises.unlink(configBackupPath).catch(() => {
          // 忽略清理备份的错误
        });
      }
    } catch (error: any) {
      // 清理临时文件
      await fsPromises.unlink(tempPath).catch(() => {});
      
      // 如果写入失败且有备份，尝试回滚
      if (backupCreated) {
        try {
          const backupExists = await fsPromises.access(configBackupPath).then(() => true).catch(() => false);
          if (backupExists) {
            const backupContent = await fsPromises.readFile(configBackupPath, 'utf-8');
            await fsPromises.writeFile(configFilePath, backupContent, 'utf-8');
            logger.warn('⚠️ Rolled back to backup config');
          }
        } catch (rollbackError) {
          logger.error('❌ Failed to rollback configuration:', rollbackError);
        }
      }
      
      throw error;
    }
  }

  /**
   * 更新配置（部分更新，同步版本）
   * 注意：同步版本无法使用锁，建议使用异步版本
   */
  public updateConfig(updates: Partial<AdminConfig>): AdminConfig {
    const currentConfig = this.readConfig();
    const updatedConfig = this.mergeConfig(currentConfig, updates);
    this.writeConfig(updatedConfig);
    return updatedConfig;
  }

  /**
   * 异步更新配置（部分更新，推荐使用）
   * 使用锁机制防止并发更新，确保原子性
   */
  public async updateConfigAsync(updates: Partial<AdminConfig>): Promise<AdminConfig> {
    const resourceId = createResourceId('config', 'update');
    const operationId = createOperationId('config-update');

    return await this.raceDetector.withOperation(resourceId, operationId, async () => {
      const release = await this.updateLock.acquire();
      
      try {
        // 在锁内读取配置，确保获取最新值
        const currentConfig = await this.readConfigAsync();
        const updatedConfig = this.mergeConfig(currentConfig, updates);
        
        // 验证更新后的配置
        const validation = this.validateConfig(updatedConfig);
        if (!validation.valid) {
          throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
        }
        
        // 原子写入
        await this.writeConfigAsync(updatedConfig);
        
        return updatedConfig;
      } finally {
        release();
      }
    });
  }

  /**
   * 重置为默认配置
   */
  public resetConfig(): AdminConfig {
    const defaultConfig = this.createDefaultConfig();
    this.writeConfig(defaultConfig);
    return defaultConfig;
  }

  /**
   * 使用事务更新多个配置项（原子操作）
   * 适用于需要同时更新多个配置项的场景，确保所有更新一起成功或一起失败
   * 
   * @param operations 配置更新操作列表，每个操作包含执行函数和描述
   * @returns 更新后的配置
   */
  public async updateConfigTransaction(
    operations: Array<{
      execute: (config: AdminConfig) => Promise<AdminConfig> | AdminConfig;
      description?: string;
    }>
  ): Promise<AdminConfig> {
    const release = await this.updateLock.acquire();
    const transaction = new TransactionManager();
    let currentConfig: AdminConfig;
    let originalConfig: AdminConfig;

    try {
      // 读取当前配置
      currentConfig = await this.readConfigAsync();
      originalConfig = JSON.parse(JSON.stringify(currentConfig)); // 深拷贝原始配置

      // 为每个操作创建事务操作
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const operationDescription = op.description || `config update ${i + 1}`;
        const configBeforeOperation = JSON.parse(JSON.stringify(currentConfig)); // 保存操作前的配置
        
        transaction.addOperation({
          execute: async () => {
            // 执行配置更新
            const updatedConfig = await op.execute(currentConfig);
            
            // 验证更新后的配置
            const validation = this.validateConfig(updatedConfig);
            if (!validation.valid) {
              throw new Error(`Configuration validation failed for ${operationDescription}: ${validation.errors.join(', ')}`);
            }
            
            // 更新当前配置（用于下一个操作）
            currentConfig = updatedConfig;
          },
          rollback: async () => {
            // 回滚到操作前的配置
            currentConfig = configBeforeOperation;
            logger.debug(`✅ Rolled back ${operationDescription}`);
          },
          description: operationDescription
        });
      }

      // 提交事务
      const result = await transaction.commit();

      if (!result.success) {
        // 事务失败，回滚到原始配置
        try {
          await this.writeConfigAsync(originalConfig);
          logger.info('✅ Configuration rolled back to original state');
        } catch (rollbackError: any) {
          logger.error('❌ Failed to rollback configuration:', rollbackError);
        }
        
        throw new Error(`Transaction failed: ${result.errors?.map(e => e.error.message).join(', ')}`);
      }

      // 所有操作成功，写入最终配置
      await this.writeConfigAsync(currentConfig);

      logger.info(`✅ Configuration transaction committed successfully (${result.executedCount} operations)`);
      return currentConfig;
    } catch (error: any) {
      logger.error('❌ Configuration transaction failed:', error);
      throw error;
    } finally {
      release();
    }
  }

  // ABP-only: 使用 AdminConfig 作为运行时配置源

  /**
   * 验证配置完整性
   */
  public validateConfig(config: AdminConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 节点认证 Key（ABP-only）不是必需的（可在管理界面后续配置）
    // if (!config.auth.apiKey) {
    //   errors.push('API_KEY (node authentication key) is required');
    // }

    // 验证至少有一个LLM提供商已配置
    const hasAnyProvider = 
      config.llm.openai ||
      config.llm.deepseek ||
      config.llm.zhipu ||
      config.llm.claude ||
      config.llm.ollama ||
      config.llm.custom;

    if (!hasAnyProvider) {
      errors.push('At least one LLM provider must be configured');
    }

    // 验证默认提供商是否已配置
    if (config.llm.defaultProvider) {
      const defaultProviderConfig = config.llm[config.llm.defaultProvider as keyof typeof config.llm];
      if (!defaultProviderConfig) {
        errors.push(`Default provider '${config.llm.defaultProvider}' is not configured`);
      }
    }

    // 验证端口范围
    if (config.server.port < 1 || config.server.port > 65535) {
      errors.push('Server port must be between 1 and 65535');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 清除配置缓存（用于热更新）
   */
  public clearCache(): void {
    this.configCache = null;
  }

  /**
   * 规范化历史字段（apiUrl/baseUrl -> baseURL）
   */
  private normalizeConfigShape(config: AdminConfig): AdminConfig {
    if (config?.rag?.vectorizer) {
      const vectorizer: any = config.rag.vectorizer;
      const baseURL =
        vectorizer.baseURL ??
        vectorizer.baseUrl ??
        vectorizer.apiUrl ??
        undefined;
      if (baseURL !== undefined) {
        vectorizer.baseURL = baseURL;
      }
      delete vectorizer.apiUrl;
      delete vectorizer.baseUrl;
    }

    if (config?.rag?.rerank) {
      const rerank: any = config.rag.rerank;
      const baseURL =
        rerank.baseURL ??
        rerank.baseUrl ??
        rerank.apiUrl ??
        undefined;
      if (baseURL !== undefined) {
        rerank.baseURL = baseURL;
      }
      delete rerank.apiUrl;
      delete rerank.baseUrl;
    }

    if (!config.security) {
      config.security = {};
    }
    if (!config.security.rateLimit) {
      config.security.rateLimit = createDefaultRateLimitSettings();
    }
    // 补齐缺省的限流规则（确保存在 chat-api 规则以满足集成测试期望）
    if (!config.security.rateLimit.rules || config.security.rateLimit.rules.length === 0) {
      config.security.rateLimit.rules = createDefaultRateLimitSettings().rules;
    } else {
      const hasChatApi = config.security.rateLimit.rules.some((r: any) => r?.id === 'chat-api');
      if (!hasChatApi) {
        const defaults = createDefaultRateLimitSettings();
        const chatRule = defaults.rules.find((r) => r.id === 'chat-api');
        if (chatRule) {
          config.security.rateLimit.rules.push(chatRule);
        }
      }
    }

    if (!config.redis) {
      config.redis = { ...DEFAULT_REDIS_CONFIG };
    } else {
      config.redis = {
        ...DEFAULT_REDIS_CONFIG,
        ...config.redis
      };
    }

    if (!config.security.rateLimit.keyPrefix) {
      config.security.rateLimit.keyPrefix = 'rate_limit';
    }
    if (!config.security.rateLimit.provider) {
      config.security.rateLimit.provider = 'auto';
    }

    return config;
  }

  /**
   * 深度合并配置对象
   */
  private mergeConfig(base: AdminConfig, updates: Partial<AdminConfig>): AdminConfig {
    const merged = { ...base };

    for (const key in updates) {
      if (updates[key] !== undefined) {
        // 🆕 特殊处理数组：对于数组类型（如 apiKeys），直接替换
        if (Array.isArray(updates[key])) {
          merged[key] = updates[key] as any;
        }
        // 深度合并对象
        else if (
          typeof updates[key] === 'object' &&
          updates[key] !== null &&
          typeof base[key] === 'object' &&
          base[key] !== null &&
          !Array.isArray(base[key])
        ) {
          merged[key] = this.mergeConfig(base[key] as AdminConfig, updates[key] as Partial<AdminConfig>) as any;
        } 
        // 其他类型直接替换
        else {
          merged[key] = updates[key] as any;
        }
      }
    }

    return this.normalizeConfigShape(merged);
  }
}

