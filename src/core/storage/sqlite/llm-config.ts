/**
 * SQLite LLMConfig Storage Adapter
 *
 * Implements ILLMConfigStorage interface using better-sqlite3.
 * This is the concrete implementation that LLMConfigService depends on.
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import type { ILLMConfigStorage, LLMConfigQuery } from "../interfaces";
import type {
  LLMProviderV2,
  LLMModelV2,
  LLMModelType,
  LLMModelFull,
  CreateProviderInput,
  UpdateProviderInput,
  CreateModelInput,
  UpdateModelInput,
  ModelQueryParams,
  ProviderBaseConfig,
  ModelConfig,
} from "../../../types/llm-models";
import { logger } from "../../../utils/logger";
import { PathService } from "../../../services/PathService";

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
  display_order: number;
  created_at: number;
  updated_at: number;
}

interface ModelFullRow extends ModelRow {
  provider: string;
  name: string;
  base_config: string;
  provider_enabled: number;
}

interface CountRow {
  count: number;
}

export class SQLiteLLMConfigStorage implements ILLMConfigStorage {
  private db: Database.Database;
  private dbPath: string;

  constructor(customPath?: string) {
    const pathService = PathService.getInstance();
    const dataDir = pathService.getDataDir();

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (customPath) {
      this.dbPath = customPath;
    } else {
      this.dbPath = path.join(dataDir, "llm_providers.db");
    }
    this.db = new Database(this.dbPath);

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.initializeDatabase();
    logger.debug(`SQLiteLLMConfigStorage initialized (database: ${this.dbPath})`);
  }

  private initializeDatabase(): void {
    this.db.exec(`
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
      );

      CREATE INDEX IF NOT EXISTS idx_provider ON llm_providers(provider);
      CREATE INDEX IF NOT EXISTS idx_provider_enabled ON llm_providers(enabled);

      CREATE INDEX IF NOT EXISTS idx_model_provider ON llm_models(provider_id);
      CREATE INDEX IF NOT EXISTS idx_model_type ON llm_models(model_type);
      CREATE INDEX IF NOT EXISTS idx_model_enabled ON llm_models(enabled);
      CREATE INDEX IF NOT EXISTS idx_model_default ON llm_models(is_default);
      CREATE INDEX IF NOT EXISTS idx_model_key ON llm_models(model_key);
      CREATE INDEX IF NOT EXISTS idx_model_type_default ON llm_models(model_type, is_default);
    `);

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

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_model_ace_l1 ON llm_models(is_ace_layer_l1);
      CREATE INDEX IF NOT EXISTS idx_model_ace_l2 ON llm_models(is_ace_layer_l2);
      CREATE INDEX IF NOT EXISTS idx_model_ace_l3 ON llm_models(is_ace_layer_l3);
      CREATE INDEX IF NOT EXISTS idx_model_ace_l4 ON llm_models(is_ace_layer_l4);
      CREATE INDEX IF NOT EXISTS idx_model_ace_l5 ON llm_models(is_ace_layer_l5);
      CREATE INDEX IF NOT EXISTS idx_model_ace_l6 ON llm_models(is_ace_layer_l6);
    `);

    logger.debug("✅ SQLiteLLMConfigStorage tables initialized");
  }

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
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      provider: row.provider,
      providerName: row.name,
      providerBaseConfig: JSON.parse(row.base_config),
      providerEnabled: row.provider_enabled === 1,
    };
  }

  private fullToModel(full: LLMModelFull): LLMModelV2 {
    const { provider, providerName, providerBaseConfig, providerEnabled, ...model } = full;
    return model;
  }

  async get(id: string): Promise<LLMProviderV2 | null> {
    try {
      const numericId = parseInt(id, 10);
      const row = this.db
        .prepare(
          `
        SELECT id, provider, name, description, base_config, enabled, created_at, updated_at
        FROM llm_providers
        WHERE id = ?
      `
        )
        .get(numericId) as ProviderRow | undefined;
      return row ? this.mapProviderRow(row) : null;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get provider:", { id, error });
      throw error;
    }
  }

  async getMany(ids: string[]): Promise<Map<string, LLMProviderV2>> {
    const map = new Map<string, LLMProviderV2>();
    if (ids.length === 0) {
      return map;
    }

    try {
      const rows = this.db
        .prepare(
          `
        SELECT id, provider, name, description, base_config, enabled, created_at, updated_at
        FROM llm_providers
        WHERE id IN (${ids.map(() => "?").join(",")})
      `
        )
        .all(...ids.map((id) => parseInt(id, 10))) as ProviderRow[];

      for (const row of rows) {
        const provider = this.mapProviderRow(row);
        map.set(String(provider.id), provider);
      }
      return map;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get many providers:", { ids, error });
      throw error;
    }
  }

  async save(entity: LLMProviderV2): Promise<string> {
    try {
      if (entity.id) {
        const updates: string[] = [];
        const values: any[] = [];

        if (entity.name !== undefined) {
          updates.push("name = ?");
          values.push(entity.name);
        }
        if (entity.description !== undefined) {
          updates.push("description = ?");
          values.push(entity.description);
        }
        if (entity.baseConfig !== undefined) {
          updates.push("base_config = ?");
          values.push(JSON.stringify(entity.baseConfig));
        }
        if (entity.enabled !== undefined) {
          updates.push("enabled = ?");
          values.push(entity.enabled ? 1 : 0);
        }

        if (updates.length > 0) {
          updates.push("updated_at = ?");
          values.push(Date.now());
          values.push(entity.id);

          this.db
            .prepare(
              `
            UPDATE llm_providers
            SET ${updates.join(", ")}
            WHERE id = ?
          `
            )
            .run(...values);
        }

        return String(entity.id);
      } else {
        const now = Date.now();
        const result = this.db
          .prepare(
            `
          INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            entity.provider,
            entity.name,
            entity.description || null,
            JSON.stringify(entity.baseConfig),
            entity.enabled ? 1 : 0,
            now,
            now
          );

        return String(result.lastInsertRowid);
      }
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to save provider:", { id: entity.id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const numericId = parseInt(id, 10);
      const result = this.db.prepare("DELETE FROM llm_providers WHERE id = ?").run(numericId);
      return result.changes > 0;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to delete provider:", { id, error });
      return false;
    }
  }

  async deleteMany(ids: string[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.delete(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  async find(query: LLMConfigQuery): Promise<LLMProviderV2[]> {
    try {
      let sql = `
        SELECT id, provider, name, description, base_config, enabled, created_at, updated_at
        FROM llm_providers
        WHERE 1=1
      `;
      const values: any[] = [];

      if (query.enabled !== undefined) {
        sql += " AND enabled = ?";
        values.push(query.enabled ? 1 : 0);
      }
      if (query.provider) {
        sql += " AND provider = ?";
        values.push(query.provider);
      }

      sql += " ORDER BY id ASC";

      const rows = this.db.prepare(sql).all(...values) as ProviderRow[];
      let result = rows.map((row) => this.mapProviderRow(row));

      if (query.offset) {
        result = result.slice(query.offset);
      }
      if (query.limit) {
        result = result.slice(0, query.limit);
      }

      return result;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to find providers:", { query, error });
      throw error;
    }
  }

  async count(query: LLMConfigQuery): Promise<number> {
    try {
      let sql = "SELECT COUNT(*) as count FROM llm_providers WHERE 1=1";
      const values: any[] = [];

      if (query.enabled !== undefined) {
        sql += " AND enabled = ?";
        values.push(query.enabled ? 1 : 0);
      }
      if (query.provider) {
        sql += " AND provider = ?";
        values.push(query.provider);
      }

      const row = this.db.prepare(sql).get(...values) as CountRow;
      return row.count;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to count providers:", { query, error });
      throw error;
    }
  }

  async getProviderByName(provider: string): Promise<LLMProviderV2 | null> {
    try {
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
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get provider by name:", { provider, error });
      throw error;
    }
  }

  async getEnabledProviders(): Promise<string[]> {
    try {
      const rows = this.db
        .prepare(
          `
        SELECT provider FROM llm_providers WHERE enabled = 1 ORDER BY id ASC
      `
        )
        .all() as Array<{ provider: string }>;
      return rows.map((row) => row.provider);
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get enabled providers:", { error });
      throw error;
    }
  }

  async getModelsByProvider(providerId: string): Promise<LLMModelV2[]> {
    try {
      const numericId = parseInt(providerId, 10);
      const rows = this.db
        .prepare(
          `
        SELECT 
          m.id, m.provider_id, m.model_key, m.model_name, m.model_type,
          m.model_config, m.api_endpoint_suffix, m.enabled, m.is_default,
          m.display_order, m.created_at, m.updated_at,
          p.provider, p.name as provider_name, p.base_config, p.enabled as provider_enabled
        FROM llm_models m
        JOIN llm_providers p ON m.provider_id = p.id
        WHERE m.provider_id = ?
        ORDER BY m.provider_id, m.model_type, m.display_order, m.id
      `
        )
        .all(numericId) as ModelFullRow[];
      return rows.map((row) => this.fullToModel(this.mapModelFullRow(row)));
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get models by provider:", { providerId, error });
      throw error;
    }
  }

  async getModelByKey(providerId: string, modelKey: string): Promise<LLMModelV2 | null> {
    try {
      const numericId = parseInt(providerId, 10);
      const row = this.db
        .prepare(
          `
        SELECT 
          m.id, m.provider_id, m.model_key, m.model_name, m.model_type,
          m.model_config, m.api_endpoint_suffix, m.enabled, m.is_default,
          m.display_order, m.created_at, m.updated_at,
          p.provider, p.name as provider_name, p.base_config, p.enabled as provider_enabled
        FROM llm_models m
        JOIN llm_providers p ON m.provider_id = p.id
        WHERE m.provider_id = ? AND m.model_key = ?
      `
        )
        .get(numericId, modelKey) as ModelFullRow | undefined;
      return row ? this.fullToModel(this.mapModelFullRow(row)) : null;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get model by key:", { providerId, modelKey, error });
      throw error;
    }
  }

  async getDefaultModelByType(modelType: string): Promise<LLMModelV2 | null> {
    try {
      const row = this.db
        .prepare(
          `
        SELECT 
          m.id, m.provider_id, m.model_key, m.model_name, m.model_type,
          m.model_config, m.api_endpoint_suffix, m.enabled, m.is_default,
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
      return row ? this.fullToModel(this.mapModelFullRow(row)) : null;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get default model by type:", { modelType, error });
      throw error;
    }
  }

  async createProviderWithModels(provider: LLMProviderV2, models: LLMModelV2[]): Promise<string> {
    try {
      const createTransaction = this.db.transaction(() => {
        const now = Date.now();

        const existingProvider = this.db
          .prepare("SELECT id FROM llm_providers WHERE provider = ? LIMIT 1")
          .get(provider.provider) as { id: number } | undefined;

        let providerId: number;
        if (existingProvider) {
          providerId = existingProvider.id;

          this.db
            .prepare(
              `
              UPDATE llm_providers
              SET name = ?, description = ?, base_config = ?, enabled = ?, updated_at = ?
              WHERE id = ?
            `
            )
            .run(
              provider.name,
              provider.description || null,
              JSON.stringify(provider.baseConfig),
              provider.enabled ? 1 : 0,
              now,
              providerId
            );
        } else {
          const result = this.db
            .prepare(
              `
              INSERT INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `
            )
            .run(
              provider.provider,
              provider.name,
              provider.description || null,
              JSON.stringify(provider.baseConfig),
              provider.enabled ? 1 : 0,
              now,
              now
            );

          providerId = Number(result.lastInsertRowid);
        }

        for (const model of models) {
          this.db
            .prepare(
              `
              INSERT INTO llm_models (
                provider_id, model_key, model_name, model_type,
                model_config, api_endpoint_suffix, enabled, is_default,
                display_order, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(provider_id, model_key) DO UPDATE SET
                model_name = excluded.model_name,
                model_type = excluded.model_type,
                model_config = excluded.model_config,
                api_endpoint_suffix = excluded.api_endpoint_suffix,
                enabled = excluded.enabled,
                is_default = excluded.is_default,
                display_order = excluded.display_order,
                updated_at = excluded.updated_at
            `
            )
            .run(
              providerId,
              model.modelKey,
              model.modelName,
              model.modelType,
              JSON.stringify(model.modelConfig || {}),
              model.apiEndpointSuffix || null,
              model.enabled ? 1 : 0,
              model.isDefault ? 1 : 0,
              model.displayOrder || 0,
              now,
              now
            );

          if (model.isDefault) {
            this.clearDefaultModel(model.modelType);
            this.db
              .prepare(
                `
                UPDATE llm_models
                SET is_default = 1, updated_at = ?
                WHERE provider_id = ? AND model_key = ?
              `
              )
              .run(now, providerId, model.modelKey);
          }
        }

        return providerId;
      });

      const providerId = createTransaction();
      return String(providerId);
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to create provider with models:", { error });
      throw error;
    }
  }

  async deleteModel(modelId: string): Promise<boolean> {
    try {
      const numericId = parseInt(modelId, 10);
      if (isNaN(numericId)) {
        return false;
      }

      const result = this.db.prepare("DELETE FROM llm_models WHERE id = ?").run(numericId);
      return result.changes > 0;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to delete model:", { modelId, error });
      return false;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private clearDefaultModel(modelType: string): void {
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
}
