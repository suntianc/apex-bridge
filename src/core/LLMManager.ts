/**
 * LLMManager - LLM 管理器（新架构）
 * 
 * 使用两级配置结构（提供商 + 模型）
 * 支持多模型类型（NLP, Embedding, Rerank 等）
 * 配置从 SQLite 数据库加载，支持运行时热更新
 */

import { Message, ChatOptions, LLMResponse } from '../types';
import { logger } from '../utils/logger';
import { LLMConfigService } from '../services/LLMConfigService';
import { ModelRegistry } from '../services/ModelRegistry';
import { LLMModelType, LLMModelFull } from '../types/llm-models';
import { buildApiUrl } from '../config/endpoint-mappings';
import { LLMAdapterFactory, ILLMAdapter } from './llm/adapters';

/**
 * LLM 管理器（新架构）
 */
export class LLMManager {
  private adapters: Map<string, ILLMAdapter> = new Map();
  private modelRegistry: ModelRegistry;
  private configService: LLMConfigService;

  constructor() {
    this.configService = LLMConfigService.getInstance();
    this.modelRegistry = ModelRegistry.getInstance();
    
    logger.info('🤖 Initializing LLM Manager (new architecture)...');
    this.loadProviders();
  }

  /**
   * 从数据库加载所有启用的提供商
   */
  private loadProviders(): void {
    try {
      const providers = this.configService.listProviders().filter(p => p.enabled);

      if (providers.length === 0) {
        logger.warn('⚠️  No enabled LLM providers found');
        return;
      }

      // 为每个提供商创建适配器
      for (const provider of providers) {
        try {
          // 使用提供商的 baseConfig 创建适配器
          const adapter = LLMAdapterFactory.create(provider.provider, {
            apiKey: provider.baseConfig.apiKey,
            baseURL: provider.baseConfig.baseURL,
            defaultModel: '', // 模型由调用时指定
            timeout: provider.baseConfig.timeout,
            maxRetries: provider.baseConfig.maxRetries
          });
          
          this.adapters.set(provider.provider, adapter);
          logger.info(`✅ Loaded provider: ${provider.provider} (${provider.name})`);
        } catch (error: any) {
          logger.error(`❌ Failed to create adapter for ${provider.provider}:`, error.message);
        }
      }

      logger.info(`✅ Loaded ${this.adapters.size} LLM providers`);
    } catch (error: any) {
      logger.error('❌ Failed to load providers:', error);
    }
  }

  /**
   * 聊天补全（自动选择 NLP 模型）
   */
  async chat(messages: Message[], options?: ChatOptions): Promise<LLMResponse> {
    try {
      // 1. 确定使用哪个模型
      let model: LLMModelFull | null = null;

      if (options?.provider && options?.model) {
        // 指定了提供商和模型
        model = this.modelRegistry.findModel(options.provider, options.model);
      } else if (options?.provider) {
        // 只指定了提供商，使用该提供商的默认 NLP 模型
        const provider = this.configService.getProviderByKey(options.provider);
        if (provider) {
          const models = this.configService.listModels({
            providerId: provider.id,
            modelType: LLMModelType.NLP,
            isDefault: true,
            enabled: true
          });
          model = models[0] || null;
        }
      } else {
        // 使用默认 NLP 模型
        model = this.modelRegistry.getDefaultModel(LLMModelType.NLP);
      }

      if (!model) {
        throw new Error('No NLP model available');
      }

      // 2. 获取适配器
      const adapter = this.adapters.get(model.provider);
      if (!adapter) {
        throw new Error(`No adapter found for provider: ${model.provider}`);
      }

      // 3. 构建完整的 API URL
      const apiUrl = model.apiEndpointSuffix 
        ? buildApiUrl(model.providerBaseConfig.baseURL, model.apiEndpointSuffix)
        : model.providerBaseConfig.baseURL;

      // 4. 更新适配器配置（使用模型的完整配置）
      const adapterConfig = {
        apiKey: model.providerBaseConfig.apiKey,
        baseURL: apiUrl,
        defaultModel: model.modelKey,
        timeout: model.providerBaseConfig.timeout || 60000,
        maxRetries: model.providerBaseConfig.maxRetries || 3
      };

      // 重新创建适配器确保使用最新配置
      const freshAdapter = LLMAdapterFactory.create(model.provider, adapterConfig);

      // 5. 调用聊天
      logger.debug(`💬 Using model: ${model.modelName} (${model.provider}/${model.modelKey})`);
      
      return await freshAdapter.chat(messages, {
        ...options,
        model: model.modelKey
      });

    } catch (error: any) {
      logger.error('❌ Chat failed:', error);
      throw error;
    }
  }

  /**
   * 流式聊天补全
   */
  async *streamChat(messages: Message[], options?: ChatOptions, abortSignal?: AbortSignal): AsyncIterableIterator<string> {
    const model = await this.getActiveModel(options);
    
    if (!model) {
      throw new Error('No NLP model available');
    }

    const adapter = await this.getOrCreateAdapter(model);
    
    logger.debug(`💬 Streaming with model: ${model.modelName} (${model.provider}/${model.modelKey})`);
    
    // 调用适配器的 streamChat 方法
    yield* adapter.streamChat(messages, {
      ...options,
      model: model.modelKey
    }, abortSignal);
  }

  /**
   * 获取活跃的模型（辅助方法）
   */
  private async getActiveModel(options?: ChatOptions): Promise<LLMModelFull | null> {
    if (options?.provider && options?.model) {
      return this.modelRegistry.findModel(options.provider, options.model);
    } else if (options?.provider) {
      const provider = this.configService.getProviderByKey(options.provider);
      if (provider) {
        const models = this.configService.listModels({
          providerId: provider.id,
          modelType: LLMModelType.NLP,
          isDefault: true,
          enabled: true
        });
        return models[0] || null;
      }
    }
    
    return this.modelRegistry.getDefaultModel(LLMModelType.NLP);
  }

  /**
   * 获取或创建适配器（辅助方法）
   */
  private async getOrCreateAdapter(model: LLMModelFull): Promise<ILLMAdapter> {
    const adapter = this.adapters.get(model.provider);
    if (adapter) {
      return adapter;
    }

    // 动态创建适配器
    const apiUrl = model.apiEndpointSuffix 
      ? buildApiUrl(model.providerBaseConfig.baseURL, model.apiEndpointSuffix)
      : model.providerBaseConfig.baseURL;

    const freshAdapter = LLMAdapterFactory.create(model.provider, {
      apiKey: model.providerBaseConfig.apiKey,
      baseURL: apiUrl,
      defaultModel: model.modelKey,
      timeout: model.providerBaseConfig.timeout || 60000,
      maxRetries: model.providerBaseConfig.maxRetries || 3
    });

    this.adapters.set(model.provider, freshAdapter);
    return freshAdapter;
  }

  /**
   * 文本向量化（使用 Embedding 模型）
   */
  async embed(texts: string[], options?: { provider?: string; model?: string }): Promise<number[][]> {
    try {
      // 1. 确定使用哪个 Embedding 模型
      let model: LLMModelFull | null = null;

      if (options?.provider && options?.model) {
        model = this.modelRegistry.findModel(options.provider, options.model);
      } else if (options?.provider) {
        const provider = this.configService.getProviderByKey(options.provider);
        if (provider) {
          const models = this.configService.listModels({
            providerId: provider.id,
            modelType: LLMModelType.EMBEDDING,
            isDefault: true,
            enabled: true
          });
          model = models[0] || null;
        }
      } else {
        model = this.modelRegistry.getDefaultModel(LLMModelType.EMBEDDING);
      }

      if (!model) {
        throw new Error('No Embedding model available');
      }

      // 2. 构建 API URL
      const apiUrl = model.apiEndpointSuffix 
        ? buildApiUrl(model.providerBaseConfig.baseURL, model.apiEndpointSuffix)
        : model.providerBaseConfig.baseURL;

      // 3. 调用 Embedding API
      logger.debug(`🔢 Using embedding model: ${model.modelName} (${model.provider}/${model.modelKey})`);
      
      // TODO: 实现实际的 embedding 调用
      // 这里需要根据不同提供商的 API 格式调用
      
      throw new Error('Embedding not yet implemented');
    } catch (error: any) {
      logger.error('❌ Embed failed:', error);
      throw error;
    }
  }

  /**
   * 刷新配置（重新加载提供商）
   */
  public refresh(): void {
    logger.info('🔄 Refreshing LLM Manager...');
    this.adapters.clear();
    this.loadProviders();
    this.modelRegistry.forceRefresh();
  }

  /**
   * 获取可用的提供商列表
   */
  public getAvailableProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 检查提供商是否可用
   */
  public hasProvider(provider: string): boolean {
    return this.adapters.has(provider);
  }

  /**
   * 更新提供商配置（数据库 + 内存）
   */
  async updateProvider(id: number, input: any): Promise<void> {
    // 更新数据库
    this.configService.updateProvider(id, input);
    
    // 刷新内存
    this.refresh();
  }

  /**
   * 获取所有模型（用于 API）
   */
  public getAllModels(): Array<{ id: string; provider: string; model: string; type: string }> {
    const models = this.modelRegistry.getAllModels();
    return models.map(m => ({
      id: `${m.provider}/${m.modelKey}`,
      provider: m.provider,
      model: m.modelKey,
      type: m.modelType
    }));
  }
}
