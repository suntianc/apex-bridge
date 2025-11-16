/**
 * RuntimeConfigService - 运行时配置管理服务
 * 
 * 负责在运行时动态加载和管理配置：
 * - 从JSON文件读取配置到内存
 * - 支持运行时修改配置
 * - 修改时同步更新JSON文件
 * - 支持配置热更新（部分配置无需重启）
 */

import { ConfigService } from './ConfigService';
import { } from '../types';
import { logger } from '../utils/logger';
import { LLMClient } from '../core/LLMClient';
import { Mutex } from '../utils/Mutex';
import { RaceDetector, createOperationId, createResourceId } from '../utils/RaceDetector';

export class RuntimeConfigService {
  private static instance: RuntimeConfigService;
  private configService: ConfigService;
  private cachedConfig: any | null = null;
  private llmClient: LLMClient | null = null;
  private initializing: boolean = false;
  private initializationPromise: Promise<LLMClient> | null = null;
  private initializationLock: Mutex = new Mutex();
  private raceDetector: RaceDetector;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.raceDetector = RaceDetector.getInstance();
  }

  public static getInstance(): RuntimeConfigService {
    if (!RuntimeConfigService.instance) {
      RuntimeConfigService.instance = new RuntimeConfigService();
    }
    return RuntimeConfigService.instance;
  }

  /**
   * 加载配置到内存（从JSON文件读取）
   */
  public loadConfig(): any {
    if (!this.cachedConfig) {
      const adminConfig = this.configService.readConfig();
      this.cachedConfig = adminConfig;
      logger.debug('✅ Configuration loaded into memory');
    }
    return this.cachedConfig;
  }

  /**
   * 获取LLM客户端（懒加载，仅在需要时初始化）
   * 使用双重检查锁定模式确保线程安全
   */
  public async getLLMClient(): Promise<LLMClient | null> {
    const resourceId = createResourceId('llm-client', 'initialization');
    const operationId = createOperationId('llm-init');

    return await this.raceDetector.withOperation(resourceId, operationId, async () => {
      // 第一次检查（无锁）
      if (this.llmClient) {
        return this.llmClient;
      }

      // 等待正在进行的初始化
      if (this.initializing && this.initializationPromise) {
        return this.initializationPromise;
      }

      // 获取初始化锁
      const release = await this.initializationLock.acquire();

      try {
        // 获取锁后双重检查
        if (this.llmClient) {
          return this.llmClient;
        }

        // 检查配置是否完整
        const config = this.loadConfig();
        const hasProvider = 
          config.llm.openai ||
          config.llm.deepseek ||
          config.llm.zhipu ||
          config.llm.claude ||
          config.llm.ollama ||
          config.llm.custom;

        if (!hasProvider) {
          logger.debug('⚠️ No LLM providers configured, LLMClient not available');
          return null;
        }

        // 设置初始化标志
        this.initializing = true;

        // 创建初始化 promise
        this.initializationPromise = this.initializeLLMClient(config.llm);

        // 等待初始化
        this.llmClient = await this.initializationPromise;

        return this.llmClient;
      } catch (error: any) {
        logger.error('❌ Failed to initialize LLMClient:', error.message);
        return null;
      } finally {
        this.initializing = false;
        this.initializationPromise = null;
        release();
      }
    });
  }

  /**
   * 初始化 LLM 客户端
   */
  private async initializeLLMClient(llmConfig: any): Promise<LLMClient> {
    logger.info('🔄 Initializing LLMClient...');
    const llmClient = new LLMClient(llmConfig);
    logger.info('✅ LLMClient initialized (lazy loading)');
    return llmClient;
  }

  /**
   * 重新加载配置（从JSON文件重新读取，清除缓存）
   */
  public reloadConfig(): any {
    this.cachedConfig = null;
    this.llmClient = null; // 清除LLMClient，下次获取时会重新初始化
    logger.info('🔄 Configuration reloaded from file');
    return this.loadConfig();
  }

  /**
   * 更新配置（同步更新内存和JSON文件）
   * 使用异步更新方法，确保线程安全
   */
  public async updateConfig(updates: any): Promise<any> {
    // 更新JSON文件（使用异步方法，确保线程安全）
    await this.configService.updateConfigAsync(updates);
    
    // 清除缓存，下次访问时重新加载
    this.cachedConfig = null;
    
    // 如果LLM配置变更，清除LLMClient缓存
    if (updates.llm) {
      this.llmClient = null;
      this.initializationPromise = null;
      logger.info('🔄 LLM configuration updated, LLMClient will be reinitialized on next use');
    }
    
    // 重新加载配置
    return this.loadConfig();
  }

  /**
   * 获取当前配置（不重新加载）
   */
  public getCurrentConfig(): VCPConfig | null {
    return this.cachedConfig;
  }

  /**
   * 检查配置是否已加载
   */
  public isConfigLoaded(): boolean {
    return this.cachedConfig !== null;
  }

  /**
   * 清除LLMClient（用于配置变更后重新初始化）
   */
  public clearLLMClient(): void {
    this.llmClient = null;
    logger.debug('🔄 LLMClient cleared');
  }
}

