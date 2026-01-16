/**
 * LLMManager - LLM 管理器（新架构）
 *
 * 使用两级配置结构（提供商 + 模型）
 * 支持多模型类型（NLP, Embedding, Rerank 等）
 * 配置从 SQLite 数据库加载，支持运行时热更新
 */

import { Message, ChatOptions, LLMResponse } from "../types";
import { logger } from "../utils/logger";
import { LLMConfigService } from "../services/LLMConfigService";
import { ModelRegistry } from "../services/ModelRegistry";
import { LLMModelType, LLMModelFull } from "../types/llm-models";
import { buildApiUrl } from "../config/endpoint-mappings";
import { LLMAdapterFactory, ILLMAdapter } from "./llm/adapters";
import { LIMITS, TIMEOUT, DOOM_LOOP } from "../constants";

/**
 * 适配器缓存条目
 */
interface AdapterCacheEntry {
  adapter: ILLMAdapter;
  configHash: string;
  lastUsed: number;
}

/**
 * LLM 管理器（新架构）
 */
export class LLMManager {
  // 提供商级别适配器缓存（启动时加载）
  private adapters: Map<string, ILLMAdapter> = new Map();
  // 模型级别适配器缓存（动态创建，按需缓存）
  private modelAdapterCache: Map<string, AdapterCacheEntry> = new Map();
  private modelRegistry: ModelRegistry;
  private configService: LLMConfigService;

  // 缓存配置
  private readonly MAX_CACHE_SIZE = LIMITS.ADAPTER_CACHE_SIZE;
  private readonly CACHE_TTL_MS = TIMEOUT.ADAPTER_CACHE_TTL;

  constructor() {
    this.configService = LLMConfigService.getInstance();
    this.modelRegistry = ModelRegistry.getInstance();

    logger.debug("🤖 Initializing LLM Manager (new architecture)...");
    this.loadProviders();
  }

  /**
   * 从数据库加载所有启用的提供商
   */
  private async loadProviders(): Promise<void> {
    try {
      const providers = (await this.configService.listProviders()).filter((p) => p.enabled);

      if (providers.length === 0) {
        logger.warn("⚠️  No enabled LLM providers found");
        return;
      }

      // 为每个提供商创建适配器
      for (const provider of providers) {
        try {
          // 使用提供商的 baseConfig 创建适配器
          const adapter = LLMAdapterFactory.create(provider.provider, {
            apiKey: provider.baseConfig.apiKey,
            baseURL: provider.baseConfig.baseURL,
            defaultModel: "", // 模型由调用时指定
            timeout: provider.baseConfig.timeout,
            maxRetries: provider.baseConfig.maxRetries,
          });

          this.adapters.set(provider.provider, adapter);
          logger.debug(`Loaded provider: ${provider.provider} (${provider.name})`);
        } catch (error: any) {
          logger.error(`❌ Failed to create adapter for ${provider.provider}:`, error.message);
        }
      }

      logger.debug(`Loaded ${this.adapters.size} LLM providers`);
    } catch (error: any) {
      logger.error("❌ Failed to load providers:", error);
    }
  }

  /**
   * 聊天补全（自动选择 NLP 模型）- 使用适配器缓存优化性能
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
        const provider = await this.configService.getProviderByKey(options.provider);
        if (provider) {
          const models = await this.configService.listModels({
            providerId: provider.id,
            modelType: LLMModelType.NLP,
            isDefault: true,
            enabled: true,
          });
          model = models[0] || null;
        }
      } else {
        // 使用默认 NLP 模型
        model = this.modelRegistry.getDefaultModel(LLMModelType.NLP);
      }

      if (!model) {
        throw new Error("No NLP model available");
      }

      // 2. 获取或创建适配器（使用缓存）
      const adapter = await this.getOrCreateModelAdapter(model);

      // 3. 调用聊天
      logger.debug(`💬 Using model: ${model.modelName} (${model.provider}/${model.modelKey})`);

      return await adapter.chat(messages, {
        ...options,
        model: model.modelKey,
      });
    } catch (error: any) {
      logger.error("❌ Chat failed:", error);
      throw error;
    }
  }

  /**
   * 获取或创建模型级别的适配器（带缓存）
   */
  private async getOrCreateModelAdapter(model: LLMModelFull): Promise<ILLMAdapter> {
    const cacheKey = `${model.provider}:${model.modelKey}`;
    const configHash = this.computeConfigHash(model);

    let entry = this.modelAdapterCache.get(cacheKey);

    // 检查缓存是否有效
    if (
      entry &&
      entry.configHash === configHash &&
      Date.now() - entry.lastUsed < this.CACHE_TTL_MS
    ) {
      entry.lastUsed = Date.now();
      logger.debug(`[LLMManager] Cache hit for adapter: ${cacheKey}`);
      return entry.adapter;
    }

    // 创建新适配器
    const apiUrl = model.apiEndpointSuffix
      ? buildApiUrl(model.providerBaseConfig.baseURL, model.apiEndpointSuffix)
      : model.providerBaseConfig.baseURL;

    const adapter = LLMAdapterFactory.create(model.provider, {
      apiKey: model.providerBaseConfig.apiKey,
      baseURL: apiUrl,
      defaultModel: model.modelKey,
      timeout: model.providerBaseConfig.timeout || TIMEOUT.LLM_REQUEST,
      maxRetries: model.providerBaseConfig.maxRetries || DOOM_LOOP.THRESHOLD,
    });

    // 更新缓存
    if (this.modelAdapterCache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestEntry();
    }
    this.modelAdapterCache.set(cacheKey, {
      adapter,
      configHash,
      lastUsed: Date.now(),
    });

    logger.debug(`[LLMManager] Created new adapter for: ${cacheKey}`);
    return adapter;
  }

  /**
   * 计算模型配置哈希值（用于检测配置变化）
   */
  private computeConfigHash(model: LLMModelFull): string {
    const configStr = JSON.stringify({
      apiKey: model.providerBaseConfig.apiKey,
      baseURL: model.providerBaseConfig.baseURL,
      apiEndpointSuffix: model.apiEndpointSuffix,
      modelKey: model.modelKey,
      timeout: model.providerBaseConfig.timeout,
      maxRetries: model.providerBaseConfig.maxRetries,
    });
    return this.simpleHash(configStr);
  }

  /**
   * 简单的字符串哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * 驱逐最旧的缓存条目
   */
  private evictOldestEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.modelAdapterCache.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.modelAdapterCache.delete(oldestKey);
      logger.debug(`[LLMManager] Evicted oldest cache entry: ${oldestKey}`);
    }
  }

  /**
   * 流式聊天补全
   */
  async *streamChat(
    messages: Message[],
    options?: ChatOptions,
    abortSignal?: AbortSignal
  ): AsyncIterableIterator<string> {
    logger.debug(`[LLMManager.streamChat] Input options: ${JSON.stringify(options)}`);

    const model = await this.getActiveModel(options);

    if (!model) {
      throw new Error("No NLP model available");
    }

    const adapter = await this.getOrCreateAdapter(model);

    logger.debug(
      `💬 Streaming with model: ${model.modelName} (${model.provider}/${model.modelKey})`
    );

    // 调用适配器的 streamChat 方法
    // ✅ 修复：正确传递参数（没有tools）
    yield* adapter.streamChat(
      messages,
      {
        ...options,
        model: model.modelKey,
      },
      undefined,
      abortSignal
    );
  }

  /**
   * 获取活跃的模型（辅助方法）
   */
  private async getActiveModel(options?: ChatOptions): Promise<LLMModelFull | null> {
    logger.debug(
      `[LLMManager.getActiveModel] Input options: provider=${options?.provider}, model=${options?.model}`
    );

    if (options?.provider && options?.model) {
      logger.debug(
        `[LLMManager.getActiveModel] Searching for model: ${options.provider}/${options.model}`
      );
      const foundModel = this.modelRegistry.findModel(options.provider, options.model);
      logger.debug(`[LLMManager.getActiveModel] Found model: ${foundModel?.modelName || "null"}`);
      return foundModel;
    } else if (options?.provider) {
      const provider = await this.configService.getProviderByKey(options.provider);
      if (provider) {
        const models = await this.configService.listModels({
          providerId: provider.id,
          modelType: LLMModelType.NLP,
          isDefault: true,
          enabled: true,
        });
        return models[0] || null;
      }
    }

    logger.debug("[LLMManager.getActiveModel] Using system default model");
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
      timeout: model.providerBaseConfig.timeout || TIMEOUT.LLM_REQUEST,
      maxRetries: model.providerBaseConfig.maxRetries || DOOM_LOOP.THRESHOLD,
    });

    this.adapters.set(model.provider, freshAdapter);
    return freshAdapter;
  }

  /**
   * 文本向量化（使用 Embedding 模型）
   * 采用两级优先级选择模型：
   * 1. 优先级1：SQLite 中配置的默认 embedding 模型（is_default = 1）
   * 2. 优先级2：.env 配置中的 EMBEDDING_PROVIDER 和 EMBEDDING_MODEL
   */
  async embed(texts: string[]): Promise<number[][]> {
    try {
      // 1. 优先级1：SQLite 全局默认 embedding 模型
      let model = this.modelRegistry.getDefaultModel(LLMModelType.EMBEDDING);

      // 2. 优先级2：回退到 .env 配置
      if (!model) {
        const envProvider = process.env.EMBEDDING_PROVIDER;
        const envModel = process.env.EMBEDDING_MODEL;

        if (envProvider && envModel) {
          model = this.modelRegistry.findModel(envProvider, envModel);
          if (model) {
            logger.info(`[LLMManager] Using .env embedding config: ${envProvider}/${envModel}`);
          }
        } else if (envModel && !envProvider) {
          // 尝试从模型名称推断 provider
          const match = envModel.match(/^([a-zA-Z0-9]+)-/);
          if (match) {
            const inferredProvider = match[1];
            logger.info(
              `[LLMManager] Using .env model with inferred provider: ${inferredProvider}/${envModel}`
            );
            model = this.modelRegistry.findModel(inferredProvider, envModel);
          }
        }
      }

      // 3. 验证模型可用性
      if (!model) {
        throw new Error(
          "No embedding model available. " +
            "Please configure an embedding model in SQLite (set is_default=1) or set EMBEDDING_PROVIDER and EMBEDDING_MODEL in .env"
        );
      }

      // 4. 获取对应的适配器
      const adapter = this.adapters.get(model.provider);
      if (!adapter) {
        throw new Error(`No adapter found for provider: ${model.provider}`);
      }

      // 5. 检查适配器是否支持 embed 方法
      if (!adapter.embed) {
        throw new Error(`Adapter for ${model.provider} does not support embedding`);
      }

      // 6. 调用 Embedding API
      logger.debug(
        `🔢 Using embedding model: ${model.modelName} (${model.provider}/${model.modelKey})`
      );

      const embeddings = await adapter.embed(texts, model.modelKey);

      logger.debug(
        `✅ Generated ${embeddings.length} embeddings with ${embeddings[0]?.length || 0} dimensions`
      );

      return embeddings;
    } catch (error: any) {
      logger.error("❌ Embed failed:", error);
      throw error;
    }
  }

  /**
   * 刷新配置（重新加载提供商）
   */
  public refresh(): void {
    logger.info("🔄 Refreshing LLM Manager...");
    this.adapters.clear();
    this.modelAdapterCache.clear();
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
    return models.map((m) => ({
      id: `${m.provider}/${m.modelKey}`,
      provider: m.provider,
      model: m.modelKey,
      type: m.modelType,
    }));
  }
}
