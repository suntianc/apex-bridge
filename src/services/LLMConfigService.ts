/**
 * LLMConfigService - LLM 配置管理服务
 *
 * 支持两级配置结构：提供商 + 模型
 * 支持多模型类型：NLP, Embedding, Rerank 等
 *
 * Depends on ILLMConfigStorage interface for database operations.
 */

import type {
  LLMModelType,
  LLMProviderV2,
  LLMModelV2,
  LLMModelFull,
  CreateProviderInput,
  UpdateProviderInput,
  CreateModelInput,
  UpdateModelInput,
  ModelQueryParams,
  ProviderBaseConfig,
  ModelConfig,
} from "../types/llm-models";
import type { ILLMConfigStorage, LLMConfigQuery } from "../core/storage/interfaces";
import { logger } from "../utils/logger";
import { LLMModelType as LLMModelTypeEnum } from "../types/llm-models";

interface AsyncCloseable {
  close(): Promise<void>;
}

function isAsyncCloseable(obj: unknown): obj is AsyncCloseable {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "close" in obj &&
    typeof (obj as Record<string, unknown>).close === "function"
  );
}

export class LLMConfigService {
  private static instance: LLMConfigService;
  private storage: ILLMConfigStorage;

  private constructor(storage?: ILLMConfigStorage) {
    if (storage) {
      this.storage = storage;
    } else {
      const { StorageAdapterFactory } = require("../core/storage/adapter-factory");
      this.storage = StorageAdapterFactory.getLLMConfigStorage();
    }
  }

  public static getInstance(): LLMConfigService {
    if (!LLMConfigService.instance) {
      LLMConfigService.instance = new LLMConfigService();
    }
    return LLMConfigService.instance;
  }

  public static createInstance(storage: ILLMConfigStorage): LLMConfigService {
    LLMConfigService.instance = new LLMConfigService(storage);
    return LLMConfigService.instance;
  }

  public async initializeDefaultProviders(): Promise<void> {
    try {
      const existingProviders = await this.listProviders();
      if (existingProviders.length > 0) {
        logger.debug(
          `✅ Providers already exist (${existingProviders.length}), skipping initialization`
        );
        return;
      }

      logger.info("🔄 No providers found, initializing default providers...");

      const defaultProviders = [
        {
          provider: "openai",
          name: "OpenAI",
          description: "OpenAI GPT 系列模型 - 功能强大，支持多模态",
          baseConfig: {
            apiKey: process.env.OPENAI_API_KEY || "your-openai-api-key",
            baseURL: "https://api.openai.com/v1",
            timeout: 60000,
            maxRetries: 3,
          },
          enabled: true,
        },
        {
          provider: "deepseek",
          name: "DeepSeek",
          description: "DeepSeek AI - 高性价比聊天和代码模型",
          baseConfig: {
            apiKey: process.env.DEEPSEEK_API_KEY || "your-deepseek-api-key",
            baseURL: "https://api.deepseek.com/v1",
            timeout: 60000,
            maxRetries: 3,
          },
          enabled: true,
        },
        {
          provider: "zhipu",
          name: "智谱 AI",
          description: "智谱清言 - 国产大模型，支持中英文",
          baseConfig: {
            apiKey: process.env.ZHIPU_API_KEY || "your-zhipu-api-key",
            baseURL: "https://open.bigmodel.cn/api/paas/v4",
            timeout: 60000,
            maxRetries: 3,
          },
          enabled: true,
        },
        {
          provider: "claude",
          name: "Claude",
          description: "Anthropic Claude - 长上下文能力突出",
          baseConfig: {
            apiKey: process.env.CLAUDE_API_KEY || "your-claude-api-key",
            baseURL: "https://api.anthropic.com/v1",
            timeout: 60000,
            maxRetries: 3,
          },
          enabled: true,
        },
        {
          provider: "ollama",
          name: "Ollama (本地)",
          description: "Ollama 本地部署 - 无需 API Key，支持自定义模型",
          baseConfig: {
            apiKey: null,
            baseURL: "http://localhost:11434",
            timeout: 60000,
            maxRetries: 3,
          },
          enabled: true,
        },
        {
          provider: "custom",
          name: "Custom (自定义)",
          description: "自定义 OpenAI 兼容 API - 用于其他兼容服务",
          baseConfig: {
            apiKey: process.env.CUSTOM_API_KEY || "your-custom-api-key",
            baseURL: "https://api.openai.com/v1",
            timeout: 60000,
            maxRetries: 3,
          },
          enabled: true,
        },
      ];

      for (const p of defaultProviders) {
        try {
          await this.createProvider(p as CreateProviderInput);
          const status = p.enabled ? "✅" : "⚪";
          logger.info(`${status} Initialized provider: ${p.name} (${p.provider})`);
        } catch (error: any) {
          logger.error(`❌ Failed to initialize provider ${p.provider}:`, error.message);
        }
      }

      logger.info(
        `✅ Default providers initialized (${defaultProviders.length} providers, 0 models)`
      );
    } catch (error: any) {
      logger.error("❌ Failed to initialize default providers:", error);
    }
  }

  public async listProviders(): Promise<LLMProviderV2[]> {
    return this.storage.find({});
  }

  public async getProvider(id: number): Promise<LLMProviderV2 | null> {
    return this.storage.get(String(id));
  }

  public async getProviderByKey(provider: string): Promise<LLMProviderV2 | null> {
    return this.storage.getProviderByName(provider);
  }

  public async createProvider(input: CreateProviderInput): Promise<LLMProviderV2> {
    this.validateProviderInput(input);

    if (input.provider !== "custom") {
      const existing = await this.getProviderByKey(input.provider);
      if (existing) {
        throw new Error(
          `Provider already exists: ${input.provider}. Each provider type can only have one instance, except for Custom providers.`
        );
      }
    }

    const provider: LLMProviderV2 = {
      id: 0,
      provider: input.provider,
      name: input.name,
      description: input.description || null,
      baseConfig: input.baseConfig,
      enabled: input.enabled !== false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const id = await this.storage.save(provider);
    const created = await this.storage.get(id);
    if (!created) {
      throw new Error("Failed to create provider");
    }

    logger.info(`✅ Created provider: ${created.name} (${created.provider})`);
    return created;
  }

  public async updateProvider(id: number, input: UpdateProviderInput): Promise<LLMProviderV2> {
    const existing = await this.getProvider(id);
    if (!existing) {
      throw new Error(`Provider not found: ${id}`);
    }

    if (
      input.name !== undefined ||
      input.description !== undefined ||
      input.baseConfig !== undefined ||
      input.enabled !== undefined
    ) {
      const updated: LLMProviderV2 = {
        ...existing,
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        baseConfig:
          input.baseConfig !== undefined
            ? { ...existing.baseConfig, ...input.baseConfig }
            : existing.baseConfig,
        enabled: input.enabled ?? existing.enabled,
        updatedAt: Date.now(),
      };
      await this.storage.save(updated);
    }

    const updated = await this.getProvider(id);
    if (!updated) {
      throw new Error("Failed to update provider");
    }

    logger.info(`✅ Updated provider: ${updated.name} (id: ${id})`);
    return updated;
  }

  public async deleteProvider(id: number): Promise<void> {
    const existing = await this.getProvider(id);
    if (!existing) {
      throw new Error(`Provider not found: ${id}`);
    }

    await this.storage.delete(String(id));

    logger.info(`✅ Deleted provider: ${existing.name} (id: ${id})`);
  }

  public async listModels(params: ModelQueryParams = {}): Promise<LLMModelFull[]> {
    const allProviders = await this.storage.find({});
    const result: LLMModelFull[] = [];

    for (const provider of allProviders) {
      if (params.providerId !== undefined && provider.id !== params.providerId) {
        continue;
      }

      const models = await this.storage.getModelsByProvider(String(provider.id));
      for (const model of models) {
        if (params.modelType !== undefined && model.modelType !== params.modelType) {
          continue;
        }
        if (params.enabled !== undefined && model.enabled !== params.enabled) {
          continue;
        }
        if (params.isDefault !== undefined && model.isDefault !== params.isDefault) {
          continue;
        }

        result.push({
          ...model,
          provider: provider.provider,
          providerName: provider.name,
          providerBaseConfig: provider.baseConfig,
          providerEnabled: provider.enabled,
        } as LLMModelFull);
      }
    }

    return result;
  }

  public async getModel(modelId: number): Promise<LLMModelFull | null> {
    const allProviders = await this.storage.find({});
    for (const provider of allProviders) {
      const models = await this.storage.getModelsByProvider(String(provider.id));
      const model = models.find((m) => m.id === modelId);
      if (model) {
        return {
          ...model,
          provider: provider.provider,
          providerName: provider.name,
          providerBaseConfig: provider.baseConfig,
          providerEnabled: provider.enabled,
        } as LLMModelFull;
      }
    }
    return null;
  }

  public async getDefaultModel(modelType: LLMModelType): Promise<LLMModelFull | null> {
    const result = await this.storage.getDefaultModelByType(modelType);
    if (!result) return null;

    const allProviders = await this.storage.find({});
    const provider = allProviders.find((p) => p.id === result.providerId);
    if (!provider) return null;

    return {
      ...result,
      provider: provider.provider,
      providerName: provider.name,
      providerBaseConfig: provider.baseConfig,
      providerEnabled: provider.enabled,
    } as LLMModelFull;
  }

  public async createModel(providerId: number, input: CreateModelInput): Promise<LLMModelV2> {
    const provider = await this.getProvider(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    this.validateModelInput(input);

    const models = await this.storage.getModelsByProvider(String(providerId));
    const existing = models.find((m) => m.modelKey === input.modelKey);
    if (existing) {
      throw new Error(`Model already exists: ${input.modelKey}`);
    }

    const newModel: LLMModelV2 = {
      id: 0,
      providerId,
      modelKey: input.modelKey,
      modelName: input.modelName,
      modelType: input.modelType,
      modelConfig: input.modelConfig || {},
      apiEndpointSuffix: input.apiEndpointSuffix || null,
      enabled: input.enabled !== false,
      isDefault: input.isDefault || false,
      displayOrder: input.displayOrder || 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.storage.createProviderWithModels(provider, [newModel]);

    const updatedModels = await this.storage.getModelsByProvider(String(providerId));
    const created = updatedModels.find((m) => m.modelKey === input.modelKey);
    if (!created) {
      throw new Error("Failed to create model");
    }

    logger.info(
      `✅ Created model: ${created.modelName} (${created.modelKey}) [${created.modelType}]`
    );
    return created;
  }

  public async updateModel(modelId: number, input: UpdateModelInput): Promise<LLMModelV2> {
    const existing = await this.getModel(modelId);
    if (!existing) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const models = await this.storage.getModelsByProvider(String(existing.providerId));
    const modelIndex = models.findIndex((m) => m.id === modelId);
    if (modelIndex === -1) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const model = models[modelIndex];
    const updatedModel: LLMModelV2 = {
      ...model,
      modelName: input.modelName ?? model.modelName,
      modelConfig:
        input.modelConfig !== undefined
          ? { ...model.modelConfig, ...input.modelConfig }
          : model.modelConfig,
      apiEndpointSuffix: input.apiEndpointSuffix ?? model.apiEndpointSuffix,
      enabled: input.enabled ?? model.enabled,
      isDefault: input.isDefault ?? model.isDefault,
      displayOrder: input.displayOrder ?? model.displayOrder,
      updatedAt: Date.now(),
    };

    const provider = await this.getProvider(existing.providerId);
    if (provider) {
      await this.storage.createProviderWithModels(provider, [updatedModel]);
    }

    const updated = await this.getModel(modelId);
    if (!updated) {
      throw new Error("Failed to update model");
    }

    logger.info(`✅ Updated model: ${updated.modelName} (id: ${modelId})`);
    return updated;
  }

  public async deleteModel(modelId: number): Promise<void> {
    const existing = await this.getModel(modelId);
    if (!existing) {
      throw new Error(`Model not found: ${modelId}`);
    }

    await this.storage.deleteModel(String(existing.id));

    logger.info(`✅ Deleted model: ${existing.modelName} (id: ${modelId})`);
  }

  public async getProviderModels(providerId: number): Promise<LLMModelV2[]> {
    return this.storage.getModelsByProvider(String(providerId));
  }

  public async getModelsByType(modelType: LLMModelType): Promise<LLMModelFull[]> {
    return this.listModels({ modelType, enabled: true });
  }

  public async getAllDefaultModels(): Promise<Map<LLMModelType, LLMModelFull>> {
    const map = new Map<LLMModelType, LLMModelFull>();

    for (const mt of Object.values(LLMModelTypeEnum)) {
      const defaultModel = await this.getDefaultModel(mt);
      if (defaultModel) {
        map.set(mt, defaultModel);
      }
    }

    return map;
  }

  private validateProviderInput(input: CreateProviderInput): void {
    if (!input.provider || input.provider.trim().length === 0) {
      throw new Error("provider is required");
    }

    if (!input.name || input.name.trim().length === 0) {
      throw new Error("name is required");
    }

    if (!input.baseConfig || typeof input.baseConfig !== "object") {
      throw new Error("baseConfig is required and must be an object");
    }

    if (!input.baseConfig.baseURL) {
      throw new Error("baseConfig.baseURL is required");
    }
  }

  private validateModelInput(input: CreateModelInput): void {
    if (!input.modelKey || input.modelKey.trim().length === 0) {
      throw new Error("modelKey is required");
    }

    if (!input.modelName || input.modelName.trim().length === 0) {
      throw new Error("modelName is required");
    }

    if (!input.modelType) {
      throw new Error("modelType is required");
    }

    const validTypes = Object.values(LLMModelTypeEnum);
    if (!validTypes.includes(input.modelType)) {
      throw new Error(`Invalid modelType: ${input.modelType}`);
    }
  }

  public async close(): Promise<void> {
    if (isAsyncCloseable(this.storage)) {
      await this.storage.close();
    }
  }
}
