/**
 * LLMConfigService - LLM 配置管理服务
 *
 * 支持两级配置结构：提供商 + 模型
 * 支持多模型类型：NLP, Embedding, Rerank 等
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";
import { PathService } from "./PathService";
import {
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

/**
 * Database row type for provider queries
 */
interface ProviderRow {
  id: number;
  provider: string;
  name: string;
  description: string | null;
  base_config: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

/**
 * Database row type for model queries (single table)
 */
interface ModelRow {
  id: number;
  provider_id: number;
  model_key: string;
  model_name: string;
  model_type: string;
  model_config: string;
  api_endpoint_suffix: string | null;
  enabled: number;
  is_default: number;
  is_ace_evolution: number;
  display_order: number;
  created_at: number;
  updated_at: number;
}

/**
 * Database row type for joined model + provider queries
 */
interface ModelFullRow extends ModelRow {
  provider: string;
  name: string;
  base_config: string;
  provider_enabled: number;
}

/**
 * Database row type for count queries
 */
interface CountRow {
  count: number;
}

/**
 * LLM 配置服务
 */
export class LLMConfigService {
  private static instance: LLMConfigService;
  private db: Database.Database;
  private dbPath: string;

  private constructor() {
    const pathService = PathService.getInstance();
    const dataDir = pathService.getDataDir();

    // 确保数据目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, "llm_providers.db");
    this.db = new Database(this.dbPath);

    // 启用 WAL 模式提升性能
    this.db.pragma("journal_mode = WAL");
    // 启用外键约束
    this.db.pragma("foreign_keys = ON");

    this.initializeDatabase();
    logger.debug(`LLMConfigService initialized (database: ${this.dbPath})`);
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): LLMConfigService {
    if (!LLMConfigService.instance) {
      LLMConfigService.instance = new LLMConfigService();
    }
    return LLMConfigService.instance;
  }

  /**
   * 初始化数据库表结构
   */
  private initializeDatabase(): void {
    this.db.exec(`
      -- 提供商表
      CREATE TABLE IF NOT EXISTS llm_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        base_config TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK(enabled IN (0, 1))
      );

      -- 模型表
      CREATE TABLE IF NOT EXISTS llm_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        model_key TEXT NOT NULL,
        model_name TEXT NOT NULL,
        model_type TEXT NOT NULL,
        model_config TEXT NOT NULL,
        api_endpoint_suffix TEXT,
        enabled INTEGER DEFAULT 1,
        is_default INTEGER DEFAULT 0,
        is_ace_evolution INTEGER DEFAULT 0,
        display_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE,
        UNIQUE(provider_id, model_key),
        CHECK(enabled IN (0, 1)),
        CHECK(is_default IN (0, 1)),
        CHECK(is_ace_evolution IN (0, 1))
        -- ⚠️ 移除 model_type 的 CHECK 约束，避免扩展枚举时数据库报错
        -- 完全依赖 TypeScript 层面的校验（validateModelInput）
      );

      -- 提供商索引
      CREATE INDEX IF NOT EXISTS idx_provider ON llm_providers(provider);
      CREATE INDEX IF NOT EXISTS idx_provider_enabled ON llm_providers(enabled);

      -- 模型索引
      CREATE INDEX IF NOT EXISTS idx_model_provider ON llm_models(provider_id);
      CREATE INDEX IF NOT EXISTS idx_model_type ON llm_models(model_type);
      CREATE INDEX IF NOT EXISTS idx_model_enabled ON llm_models(enabled);
      CREATE INDEX IF NOT EXISTS idx_model_default ON llm_models(is_default);
      CREATE INDEX IF NOT EXISTS idx_model_key ON llm_models(model_key);
      CREATE INDEX IF NOT EXISTS idx_model_type_default ON llm_models(model_type, is_default);
    `);

    // 扩展模型表，添加ACE层级标记字段（先检查列是否存在）
    const columns = this.db.prepare("PRAGMA table_info(llm_models)").all() as Array<{
      name: string;
    }>;
    const columnNames = new Set(columns.map((c) => c.name));

    const aceLayerColumns = [
      "is_ace_layer_l1",
      "is_ace_layer_l2",
      "is_ace_layer_l3",
      "is_ace_layer_l4",
      "is_ace_layer_l5",
      "is_ace_layer_l6",
    ];

    for (const col of aceLayerColumns) {
      if (!columnNames.has(col)) {
        this.db.exec(`ALTER TABLE llm_models ADD COLUMN ${col} INTEGER DEFAULT 0`);
      }
    }

    // ACE层级索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_model_ace_l1 ON llm_models(is_ace_layer_l1);
      CREATE INDEX IF NOT EXISTS idx_model_ace_l2 ON llm_models(is_ace_layer_l2);
      CREATE INDEX IF NOT EXISTS idx_model_ace_l3 ON llm_models(is_ace_layer_l3);
      CREATE INDEX IF NOT EXISTS idx_model_ace_l4 ON llm_models(is_ace_layer_l4);
      CREATE INDEX IF NOT EXISTS idx_model_ace_l5 ON llm_models(is_ace_layer_l5);
      CREATE INDEX IF NOT EXISTS idx_model_ace_l6 ON llm_models(is_ace_layer_l6);
    `);

    logger.debug(
      "✅ LLM v2 tables initialized (ACE layer support retained for backward compatibility)"
    );
  }

  /**
   * 初始化默认提供商（如果不存在）
   * 在服务器启动时调用，确保有可用的提供商配置
   * 仅插入提供商，不包含模型（模型需单独配置）
   */
  public initializeDefaultProviders(): void {
    try {
      // 检查是否已存在提供商
      const existingProviders = this.listProviders();
      if (existingProviders.length > 0) {
        logger.debug(
          `✅ Providers already exist (${existingProviders.length}), skipping initialization`
        );
        return;
      }

      logger.info("🔄 No providers found, initializing default providers...");

      const now = Date.now();
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

      const insertStmt = this.db.prepare(`
        INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const p of defaultProviders) {
        try {
          insertStmt.run(
            p.provider,
            p.name,
            p.description,
            JSON.stringify(p.baseConfig),
            p.enabled ? 1 : 0,
            now,
            now
          );
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

  // ==================== 提供商管理 ====================

  /**
   * 列出所有提供商
   */
  public listProviders(): LLMProviderV2[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, provider, name, description, base_config, enabled, created_at, updated_at
      FROM llm_providers
      ORDER BY id ASC
    `
      )
      .all() as Array<{
      id: number;
      provider: string;
      name: string;
      description: string | null;
      base_config: string;
      enabled: number;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map((row) => this.mapProviderRow(row));
  }

  /**
   * 获取单个提供商
   */
  public getProvider(id: number): LLMProviderV2 | null {
    const row = this.db
      .prepare(
        `
      SELECT id, provider, name, description, base_config, enabled, created_at, updated_at
      FROM llm_providers
      WHERE id = ?
    `
      )
      .get(id) as ProviderRow | undefined;

    return row ? this.mapProviderRow(row) : null;
  }

  /**
   * 根据标识获取提供商
   */
  public getProviderByKey(provider: string): LLMProviderV2 | null {
    const row = this.db
      .prepare(
        `
      SELECT id, provider, name, description, base_config, enabled, created_at, updated_at
      FROM llm_providers
      WHERE provider = ?
    `
      )
      .get(provider) as ProviderRow | undefined;

    return row ? this.mapProviderRow(row) : null;
  }

  /**
   * 创建提供商
   */
  public createProvider(input: CreateProviderInput): LLMProviderV2 {
    // 验证输入
    this.validateProviderInput(input);

    // 检查是否已存在（非Custom类型只允许一个实例）
    if (input.provider !== "custom") {
      const existing = this.getProviderByKey(input.provider);
      if (existing) {
        throw new Error(
          `Provider already exists: ${input.provider}. Each provider type can only have one instance, except for Custom providers.`
        );
      }
    }

    const now = Date.now();
    const result = this.db
      .prepare(
        `
      INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        input.provider,
        input.name,
        input.description || null,
        JSON.stringify(input.baseConfig),
        input.enabled !== false ? 1 : 0,
        now,
        now
      );

    const created = this.getProvider(result.lastInsertRowid as number);
    if (!created) {
      throw new Error("Failed to create provider");
    }

    logger.info(`✅ Created provider: ${created.name} (${created.provider})`);
    return created;
  }

  /**
   * 更新提供商
   */
  public updateProvider(id: number, input: UpdateProviderInput): LLMProviderV2 {
    const existing = this.getProvider(id);
    if (!existing) {
      throw new Error(`Provider not found: ${id}`);
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      updates.push("name = ?");
      values.push(input.name);
    }

    if (input.description !== undefined) {
      updates.push("description = ?");
      values.push(input.description);
    }

    if (input.baseConfig !== undefined) {
      // 合并配置
      const mergedConfig = {
        ...existing.baseConfig,
        ...input.baseConfig,
      };
      updates.push("base_config = ?");
      values.push(JSON.stringify(mergedConfig));
    }

    if (input.enabled !== undefined) {
      updates.push("enabled = ?");
      values.push(input.enabled ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push("updated_at = ?");
    values.push(Date.now());
    values.push(id);

    this.db
      .prepare(
        `
      UPDATE llm_providers
      SET ${updates.join(", ")}
      WHERE id = ?
    `
      )
      .run(...values);

    const updated = this.getProvider(id)!;
    logger.info(`✅ Updated provider: ${updated.name} (id: ${id})`);
    return updated;
  }

  /**
   * 删除提供商（级联删除所有模型）
   */
  public deleteProvider(id: number): void {
    const existing = this.getProvider(id);
    if (!existing) {
      throw new Error(`Provider not found: ${id}`);
    }

    // 检查关联的模型数量
    const modelCount = this.db
      .prepare("SELECT COUNT(*) as count FROM llm_models WHERE provider_id = ?")
      .get(id) as CountRow;

    this.db.prepare("DELETE FROM llm_providers WHERE id = ?").run(id);

    logger.info(
      `✅ Deleted provider: ${existing.name} (id: ${id}), cascaded ${modelCount.count} models`
    );
  }

  // ==================== 模型管理 ====================

  /**
   * 列出模型（支持多种筛选）
   */
  public listModels(params: ModelQueryParams = {}): LLMModelFull[] {
    let sql = `
      SELECT 
        m.id, m.provider_id, m.model_key, m.model_name, m.model_type,
        m.model_config, m.api_endpoint_suffix, m.enabled, m.is_default, m.is_ace_evolution,
        m.display_order, m.created_at, m.updated_at,
        p.provider, p.name as provider_name, p.base_config, p.enabled as provider_enabled
      FROM llm_models m
      JOIN llm_providers p ON m.provider_id = p.id
      WHERE 1=1
    `;

    const conditions: string[] = [];
    const values: any[] = [];

    if (params.providerId !== undefined) {
      conditions.push("m.provider_id = ?");
      values.push(params.providerId);
    }

    if (params.modelType !== undefined) {
      conditions.push("m.model_type = ?");
      values.push(params.modelType);
    }

    if (params.enabled !== undefined) {
      conditions.push("m.enabled = ?");
      values.push(params.enabled ? 1 : 0);
    }

    if (params.isDefault !== undefined) {
      conditions.push("m.is_default = ?");
      values.push(params.isDefault ? 1 : 0);
    }

    if (conditions.length > 0) {
      sql += " AND " + conditions.join(" AND ");
    }

    sql += " ORDER BY m.provider_id, m.model_type, m.display_order, m.id";

    const rows = this.db.prepare(sql).all(...values) as ModelFullRow[];
    return rows.map((row) => this.mapModelFullRow(row));
  }

  /**
   * 获取单个模型
   */
  public getModel(modelId: number): LLMModelFull | null {
    const row = this.db
      .prepare(
        `
      SELECT 
        m.id, m.provider_id, m.model_key, m.model_name, m.model_type,
        m.model_config, m.api_endpoint_suffix, m.enabled, m.is_default, m.is_ace_evolution,
        m.display_order, m.created_at, m.updated_at,
        p.provider, p.name as provider_name, p.base_config, p.enabled as provider_enabled
      FROM llm_models m
      JOIN llm_providers p ON m.provider_id = p.id
      WHERE m.id = ?
    `
      )
      .get(modelId) as ModelFullRow | undefined;

    return row ? this.mapModelFullRow(row) : null;
  }

  /**
   * 获取默认模型
   */
  public getDefaultModel(modelType: LLMModelType): LLMModelFull | null {
    const row = this.db
      .prepare(
        `
      SELECT 
        m.id, m.provider_id, m.model_key, m.model_name, m.model_type,
        m.model_config, m.api_endpoint_suffix, m.enabled, m.is_default, m.is_ace_evolution,
        m.display_order, m.created_at, m.updated_at,
        p.provider, p.name as provider_name, p.base_config, p.enabled as provider_enabled
      FROM llm_models m
      JOIN llm_providers p ON m.provider_id = p.id
      WHERE m.model_type = ?
        AND m.is_default = 1
        AND m.enabled = 1
        AND p.enabled = 1
      LIMIT 1
    `
      )
      .get(modelType) as ModelFullRow | undefined;

    return row ? this.mapModelFullRow(row) : null;
  }

  /**
   * 创建模型
   */
  public createModel(providerId: number, input: CreateModelInput): LLMModelV2 {
    // 验证提供商存在
    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    // 验证输入
    this.validateModelInput(input);

    // 检查是否已存在
    const existing = this.db
      .prepare(
        `
      SELECT id FROM llm_models WHERE provider_id = ? AND model_key = ?
    `
      )
      .get(providerId, input.modelKey);

    if (existing) {
      throw new Error(`Model already exists: ${input.modelKey}`);
    }

    // ✅ 使用事务确保原子性：如果插入失败，清除默认模型的操作也会回滚
    const createTransaction = this.db.transaction(() => {
      // 1. 如果设置为默认模型，先取消同类型的其他默认模型
      if (input.isDefault) {
        this.clearDefaultModel(input.modelType);
      }

      // 2. 插入新模型
      const now = Date.now();
      const result = this.db
        .prepare(
          `
        INSERT INTO llm_models (
          provider_id, model_key, model_name, model_type,
          model_config, api_endpoint_suffix, enabled, is_default, is_ace_evolution,
          display_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          providerId,
          input.modelKey,
          input.modelName,
          input.modelType,
          JSON.stringify(input.modelConfig || {}),
          input.apiEndpointSuffix || null,
          input.enabled !== false ? 1 : 0,
          input.isDefault ? 1 : 0,
          input.isAceEvolution ? 1 : 0,
          input.displayOrder || 0,
          now,
          now
        );

      return result.lastInsertRowid;
    });

    const newModelId = createTransaction();

    const created = this.getModel(newModelId as number);
    if (!created) {
      throw new Error("Failed to create model");
    }

    logger.info(
      `✅ Created model: ${created.modelName} (${created.modelKey}) [${created.modelType}]`
    );
    return created;
  }

  /**
   * 更新模型
   */
  public updateModel(modelId: number, input: UpdateModelInput): LLMModelV2 {
    const existing = this.getModel(modelId);
    if (!existing) {
      throw new Error(`Model not found: ${modelId}`);
    }

    // ✅ 使用事务确保原子性：如果更新失败，清除默认模型的操作也会回滚
    const updateTransaction = this.db.transaction(() => {
      const updates: string[] = [];
      const values: any[] = [];

      if (input.modelName !== undefined) {
        updates.push("model_name = ?");
        values.push(input.modelName);
      }

      if (input.modelConfig !== undefined) {
        // 合并配置
        const mergedConfig = {
          ...existing.modelConfig,
          ...input.modelConfig,
        };
        updates.push("model_config = ?");
        values.push(JSON.stringify(mergedConfig));
      }

      if (input.apiEndpointSuffix !== undefined) {
        updates.push("api_endpoint_suffix = ?");
        values.push(input.apiEndpointSuffix);
      }

      if (input.enabled !== undefined) {
        updates.push("enabled = ?");
        values.push(input.enabled ? 1 : 0);
      }

      if (input.isDefault !== undefined) {
        // 如果设置为默认模型，且当前不是默认模型，先取消同类型的其他默认模型
        if (input.isDefault && !existing.isDefault) {
          this.clearDefaultModel(existing.modelType);
        }
        updates.push("is_default = ?");
        values.push(input.isDefault ? 1 : 0);
      }

      if (input.isAceEvolution !== undefined) {
        // 如果设置为ACE进化模型，先取消其他模型的标记
        if (input.isAceEvolution && !existing.isAceEvolution) {
          this.clearAceEvolutionModel();
        }
        updates.push("is_ace_evolution = ?");
        values.push(input.isAceEvolution ? 1 : 0);
      }

      if (input.displayOrder !== undefined) {
        updates.push("display_order = ?");
        values.push(input.displayOrder);
      }

      if (updates.length === 0) {
        return; // 没有更新，直接返回
      }

      updates.push("updated_at = ?");
      values.push(Date.now());
      values.push(modelId);

      this.db
        .prepare(
          `
        UPDATE llm_models
        SET ${updates.join(", ")}
        WHERE id = ?
      `
        )
        .run(...values);
    });

    updateTransaction();

    const updated = this.getModel(modelId)!;
    logger.info(`✅ Updated model: ${updated.modelName} (id: ${modelId})`);
    return updated;
  }

  /**
   * 删除模型
   */
  public deleteModel(modelId: number): void {
    const existing = this.getModel(modelId);
    if (!existing) {
      throw new Error(`Model not found: ${modelId}`);
    }

    this.db.prepare("DELETE FROM llm_models WHERE id = ?").run(modelId);

    logger.info(`✅ Deleted model: ${existing.modelName} (id: ${modelId})`);
  }

  // ==================== 查询方法 ====================

  /**
   * 获取提供商的所有模型
   */
  public getProviderModels(providerId: number): LLMModelV2[] {
    return this.listModels({ providerId }).map((full) => this.fullToModel(full));
  }

  /**
   * 按类型获取所有模型
   */
  public getModelsByType(modelType: LLMModelType): LLMModelFull[] {
    return this.listModels({ modelType, enabled: true });
  }

  /**
   * 获取所有默认模型
   */
  public getAllDefaultModels(): Map<LLMModelType, LLMModelFull> {
    const models = this.listModels({ isDefault: true, enabled: true });
    const map = new Map<LLMModelType, LLMModelFull>();

    models.forEach((model) => {
      map.set(model.modelType as LLMModelType, model);
    });

    return map;
  }

  // ==================== 辅助方法 ====================

  /**
   * 清除某类型的默认模型标记
   */
  private clearDefaultModel(modelType: LLMModelType): void {
    this.db
      .prepare(
        `
      UPDATE llm_models
      SET is_default = 0, updated_at = ?
      WHERE model_type = ? AND is_default = 1
    `
      )
      .run(Date.now(), modelType);
  }

  /**
   * 清除ACE进化模型标记
   */
  private clearAceEvolutionModel(): void {
    this.db
      .prepare(
        `
      UPDATE llm_models
      SET is_ace_evolution = 0, updated_at = ?
      WHERE is_ace_evolution = 1
    `
      )
      .run(Date.now());
  }

  /**
   * 获取ACE进化专用模型
   */
  public getAceEvolutionModel(): LLMModelFull | null {
    const row = this.db
      .prepare(
        `
      SELECT 
        m.id, m.provider_id, m.model_key, m.model_name, m.model_type,
        m.model_config, m.api_endpoint_suffix, m.enabled, m.is_default, m.is_ace_evolution,
        m.display_order, m.created_at, m.updated_at,
        p.provider, p.name as provider_name, p.base_config, p.enabled as provider_enabled
      FROM llm_models m
      JOIN llm_providers p ON m.provider_id = p.id
      WHERE m.is_ace_evolution = 1
        AND m.enabled = 1
        AND p.enabled = 1
      LIMIT 1
    `
      )
      .get() as ModelFullRow | undefined;

    return row ? this.mapModelFullRow(row) : null;
  }

  /**
   * 验证提供商输入
   */
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

  /**
   * 验证模型输入
   */
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

    // 验证模型类型
    const validTypes = Object.values(LLMModelType);
    if (!validTypes.includes(input.modelType)) {
      throw new Error(`Invalid modelType: ${input.modelType}`);
    }
  }

  /**
   * 映射提供商行数据
   */
  private mapProviderRow(row: any): LLMProviderV2 {
    return {
      id: row.id,
      provider: row.provider,
      name: row.name,
      description: row.description,
      baseConfig: JSON.parse(row.base_config),
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 映射完整模型行数据
   */
  private mapModelFullRow(row: any): LLMModelFull {
    return {
      id: row.id,
      providerId: row.provider_id,
      modelKey: row.model_key,
      modelName: row.model_name,
      modelType: row.model_type as LLMModelType,
      modelConfig: JSON.parse(row.model_config),
      apiEndpointSuffix: row.api_endpoint_suffix,
      enabled: row.enabled === 1,
      isDefault: row.is_default === 1,
      isAceEvolution: row.is_ace_evolution === 1,
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      provider: row.provider,
      providerName: row.provider_name,
      providerBaseConfig: JSON.parse(row.base_config),
      providerEnabled: row.provider_enabled === 1,
    };
  }

  /**
   * 从完整模型提取模型信息
   */
  private fullToModel(full: LLMModelFull): LLMModelV2 {
    const { provider, providerName, providerBaseConfig, providerEnabled, ...model } = full;
    return model;
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    this.db.close();
  }
}
