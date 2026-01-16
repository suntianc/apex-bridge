/**
 * ModelRegistry - 模型注册表服务
 *
 * 提供快速的模型查询和缓存功能
 */

import { logger } from "../utils/logger";
import { LLMConfigService } from "./LLMConfigService";
import { LLMModelType, LLMModelFull } from "../types/llm-models";

/**
 * 模型注册表
 */
export class ModelRegistry {
  private static instance: ModelRegistry;
  private configService: LLMConfigService;
  private modelCache: Map<number, LLMModelFull>;
  private defaultModelCache: Map<LLMModelType, LLMModelFull>;
  private typeIndexCache: Map<LLMModelType, LLMModelFull[]>;
  private keyIndexCache: Map<string, LLMModelFull>; // 🆕 Key 索引: "provider:modelKey" -> model
  private lastRefreshTime: number;
  private refreshInterval: number;

  private constructor() {
    this.configService = LLMConfigService.getInstance();
    this.modelCache = new Map();
    this.defaultModelCache = new Map();
    this.typeIndexCache = new Map();
    this.keyIndexCache = new Map(); // 🆕 初始化 Key 索引
    this.lastRefreshTime = 0;
    this.refreshInterval = 60000; // 60 秒刷新间隔

    this.refreshCache();
    logger.debug("ModelRegistry initialized");
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  /**
   * 刷新缓存
   */
  public async refreshCache(): Promise<void> {
    try {
      // 清空旧缓存
      this.modelCache.clear();
      this.defaultModelCache.clear();
      this.typeIndexCache.clear();
      this.keyIndexCache.clear(); // 🆕 清空 Key 索引

      // 加载所有启用的模型
      const models = await this.configService.listModels({ enabled: true });

      // 构建缓存
      models.forEach((model) => {
        // 只缓存提供商也启用的模型
        if (!model.providerEnabled) {
          return;
        }

        // ID 索引
        this.modelCache.set(model.id, model);

        // 类型索引
        if (!this.typeIndexCache.has(model.modelType as LLMModelType)) {
          this.typeIndexCache.set(model.modelType as LLMModelType, []);
        }
        this.typeIndexCache.get(model.modelType as LLMModelType)!.push(model);

        // 默认模型索引
        if (model.isDefault) {
          this.defaultModelCache.set(model.modelType as LLMModelType, model);
        }

        // 🆕 Key 索引 (Provider + ModelKey) - 用于 O(1) 查找
        const uniqueKey = `${model.provider}:${model.modelKey}`;
        this.keyIndexCache.set(uniqueKey, model);
      });

      this.lastRefreshTime = Date.now();
      logger.debug(`✅ ModelRegistry cache refreshed: ${models.length} models`);
    } catch (error: any) {
      logger.error("❌ Failed to refresh ModelRegistry cache:", error);
    }
  }

  /**
   * 检查缓存是否需要刷新
   */
  private checkRefresh(): void {
    const now = Date.now();
    if (now - this.lastRefreshTime > this.refreshInterval) {
      this.refreshCache();
    }
  }

  /**
   * 根据 ID 获取模型
   */
  public getModelById(modelId: number): LLMModelFull | null {
    this.checkRefresh();
    return this.modelCache.get(modelId) || null;
  }

  /**
   * 获取默认模型
   */
  public getDefaultModel(modelType: LLMModelType): LLMModelFull | null {
    this.checkRefresh();
    return this.defaultModelCache.get(modelType) || null;
  }

  /**
   * 按类型获取所有模型
   */
  public getModelsByType(modelType: LLMModelType): LLMModelFull[] {
    this.checkRefresh();
    return this.typeIndexCache.get(modelType) || [];
  }

  /**
   * 获取所有模型
   */
  public getAllModels(): LLMModelFull[] {
    this.checkRefresh();
    return Array.from(this.modelCache.values());
  }

  /**
   * 获取所有 NLP 模型
   */
  public getNLPModels(): LLMModelFull[] {
    return this.getModelsByType(LLMModelType.NLP);
  }

  /**
   * 获取所有 Embedding 模型
   */
  public getEmbeddingModels(): LLMModelFull[] {
    return this.getModelsByType(LLMModelType.EMBEDDING);
  }

  /**
   * 获取所有 Rerank 模型
   */
  public getRerankModels(): LLMModelFull[] {
    return this.getModelsByType(LLMModelType.RERANK);
  }

  /**
   * 查找模型（按 provider + modelKey）
   * ⚡️ 优化为 O(1) 查找（使用 Key 索引）
   */
  public findModel(provider: string, modelKey: string): LLMModelFull | null {
    this.checkRefresh();

    // 🆕 使用 Key 索引实现 O(1) 查找
    const uniqueKey = `${provider}:${modelKey}`;
    return this.keyIndexCache.get(uniqueKey) || null;
  }

  /**
   * 获取缓存统计信息
   */
  public getStats() {
    this.checkRefresh();

    return {
      totalModels: this.modelCache.size,
      modelsByType: {
        nlp: this.getModelsByType(LLMModelType.NLP).length,
        embedding: this.getModelsByType(LLMModelType.EMBEDDING).length,
        rerank: this.getModelsByType(LLMModelType.RERANK).length,
        image: this.getModelsByType(LLMModelType.IMAGE).length,
        audio: this.getModelsByType(LLMModelType.AUDIO).length,
      },
      defaultModels: this.defaultModelCache.size,
      lastRefreshTime: this.lastRefreshTime,
      cacheAge: Date.now() - this.lastRefreshTime,
    };
  }

  /**
   * 强制刷新（立即）
   */
  public forceRefresh(): void {
    this.refreshCache();
  }

  /**
   * 设置刷新间隔
   */
  public setRefreshInterval(intervalMs: number): void {
    this.refreshInterval = intervalMs;
  }
}
