/**
 * ApexBridge (ABP-only) - LLM管理器
 * 统一的LLM提供商抽象层，支持多提供商切换
 * 配置从SQLite数据库加载，支持运行时热更新
 */

import { Message, ChatOptions, LLMResponse, LLMProviderConfig } from '../types';
import { logger } from '../utils/logger';
import { LLMConfigService, LLMProviderRecord, UpdateLLMProviderInput } from '../services/LLMConfigService';
import { LLMAdapterFactory, ILLMAdapter } from './llm/adapters';

/**
 * LLM管理器
 * 从SQLite加载配置，支持运行时更新
 */
export class LLMManager {
  private adapters: Map<string, ILLMAdapter> = new Map();
  private providerRecords: Map<string, LLMProviderRecord> = new Map();
  private defaultProvider: string | null = null;
  private configService: LLMConfigService;

  constructor(configService?: LLMConfigService) {
    this.configService = configService || LLMConfigService.getInstance();
    logger.info('🤖 Initializing LLM Manager...');

    // 从SQLite加载配置
    this.loadProvidersFromDatabase();
  }

  /**
   * 从数据库加载所有启用的厂商配置
   */
  private loadProvidersFromDatabase(): void {
    try {
      const providers = this.configService.listEnabled();

      if (providers.length === 0) {
        logger.warn('⚠️  No enabled LLM providers found in database');
        return;
      }

      // 为每个厂商创建适配器
      for (const provider of providers) {
        try {
          const adapter = LLMAdapterFactory.create(provider.provider, provider.config);
          this.adapters.set(provider.provider, adapter);
          this.providerRecords.set(provider.provider, provider);
          logger.info(`✅ Loaded provider: ${provider.provider} (${provider.name})`);
        } catch (error: any) {
          logger.error(`❌ Failed to create adapter for ${provider.provider}:`, error.message);
        }
      }

      // 设置默认提供商（第一个启用的）
      this.defaultProvider = providers[0]?.provider || null;

      if (!this.defaultProvider) {
        logger.warn('⚠️  No default provider available');
      } else {
        logger.info(`📌 Default provider: ${this.defaultProvider}`);
        logger.info(`📋 Available providers: ${Array.from(this.adapters.keys()).join(', ')}`);
      }
    } catch (error: any) {
      logger.error('❌ Failed to load providers from database:', error.message);
      throw error;
    }
  }

  /**
   * 根据模型名称自动检测提供商
   */
  private detectProvider(model?: string): string {
    if (!model) {
      return this.defaultProvider!;
    }

    // 根据模型名称前缀判断
    if (model.startsWith('gpt-')) return 'openai';
    if (model.startsWith('deepseek-')) return 'deepseek';
    if (model.startsWith('glm-')) return 'zhipu';
    if (model.startsWith('claude-')) return 'claude';
    if (model.startsWith('llama') || model.startsWith('qwen') || model.startsWith('mistral')) return 'ollama';

    // 如果无法判断，使用默认提供商
    return this.defaultProvider!;
  }

  /**
   * 获取指定提供商的适配器
   */
  private getAdapter(provider: string): ILLMAdapter {
    const adapter = this.adapters.get(provider);

    if (!adapter) {
      throw new Error(`LLM provider '${provider}' not configured. Available: ${Array.from(this.adapters.keys()).join(', ')}`);
    }

    return adapter;
  }

  /**
   * 更新现有厂商配置
   * 事务保证：先更新SQLite，成功后更新内存
   */
  async updateProvider(id: number, input: UpdateLLMProviderInput): Promise<void> {
    // 获取当前配置（用于回滚）
    const current = this.configService.getById(id);
    if (!current) {
      throw new Error(`Provider with id ${id} not found`);
    }

    try {
      // 1. 先更新SQLite数据库
      const updated = this.configService.update(id, input);
      logger.debug(`✅ SQLite updated for provider ${updated.provider} (id: ${id})`);

      // 2. SQLite成功后，更新内存中的适配器
      try {
        const provider = updated.provider;
        const adapter = LLMAdapterFactory.create(provider, updated.config);
        this.adapters.set(provider, adapter);
        this.providerRecords.set(provider, updated);

        logger.info(`✅ Updated provider in memory: ${provider} (id: ${id})`);
      } catch (memoryError: any) {
        // 内存更新失败，记录错误（SQLite已更新，无法回滚）
        logger.error(`❌ Failed to update provider in memory (SQLite already updated):`, memoryError.message);
        logger.warn(`⚠️  Provider ${updated.provider} configuration in SQLite is updated, but memory update failed. Consider reloading.`);
        throw new Error(`Memory update failed: ${memoryError.message}`);
      }
    } catch (error: any) {
      // SQLite更新失败，不更新内存（已满足事务要求）
      logger.error(`❌ Failed to update provider ${id} in SQLite:`, error.message);
      throw error;
    }
  }

  /**
   * 重新加载配置（从数据库）
   */
  async reloadConfig(): Promise<void> {
    logger.info('🔄 Reloading LLM providers from database...');
    
    // 清空现有适配器
    this.adapters.clear();
    this.providerRecords.clear();
    
    // 重新加载
    this.loadProvidersFromDatabase();
    
    logger.info('✅ LLM providers reloaded');
  }

  /**
   * 聊天接口（保持兼容性）
   */
  async chat(messages: Message[], options: ChatOptions = {}): Promise<LLMResponse> {
    const provider = options.provider || this.detectProvider(options.model);
    const adapter = this.getAdapter(provider);

    logger.debug(`💬 Calling LLM: ${provider}, model: ${options.model || 'default'}`);

    return await adapter.chat(messages, options);
  }

  /**
   * 流式聊天接口（保持兼容性）
   */
  async *streamChat(messages: Message[], options: ChatOptions = {}, signal?: AbortSignal): AsyncIterableIterator<string> {
    const provider = options.provider || this.detectProvider(options.model);
    const adapter = this.getAdapter(provider);

    logger.debug(`🌊 Streaming from LLM: ${provider}, model: ${options.model || 'default'}`);

    yield* adapter.streamChat(messages, options, signal);
  }

  /**
   * 获取所有模型（保持兼容性）
   */
  async getAllModels(): Promise<Array<{ id: string; provider: string }>> {
    const models: Array<{ id: string; provider: string }> = [];

    for (const [provider, adapter] of this.adapters) {
      try {
        const providerModels = await adapter.getModels();
        models.push(...providerModels.map(id => ({ id, provider })));
      } catch (error: any) {
        logger.warn(`⚠️  Failed to get models from ${provider}:`, error.message);
      }
    }

    return models;
  }

  /**
   * 获取可用的提供商列表（保持兼容性）
   */
  getAvailableProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 获取默认提供商（保持兼容性）
   */
  getDefaultProvider(): string | null {
    return this.defaultProvider;
  }

  /**
   * 获取厂商配置记录
   */
  getProviderRecord(provider: string): LLMProviderRecord | null {
    return this.providerRecords.get(provider) || null;
  }

  /**
   * 获取所有厂商配置记录
   */
  getAllProviderRecords(): LLMProviderRecord[] {
    return Array.from(this.providerRecords.values());
  }
}

// 向后兼容：导出LLMClient作为LLMManager的别名
export { LLMManager as LLMClient };
// 类型别名通过值导出自动推断，不需要单独的类型导出

