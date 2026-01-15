/**
 * SurrealDB LLMConfig Storage Adapter
 *
 * Implements ILLMConfigStorage interface using SurrealDB as the backend.
 */

import { SurrealDBClient } from "./client";
import type { ILLMConfigStorage, LLMConfigQuery } from "../interfaces";
import type { LLMProviderV2, LLMModelV2 } from "../../../types/llm-models";
import { logger } from "../../../utils/logger";
import { validatePagination, parseStorageIdAsNumber } from "../utils";

const TABLE_PROVIDERS = "llm_providers";

interface ProviderRecord {
  id: string;
  provider: string;
  name: string;
  description?: string;
  baseConfig: Record<string, unknown>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

interface ModelRecord {
  id: string;
  provider_id: string;
  key: string;
  name: string;
  type: string;
  [key: string]: unknown;
}

export class SurrealDBLLMConfigStorage implements ILLMConfigStorage {
  private client: SurrealDBClient;

  constructor() {
    this.client = SurrealDBClient.getInstance();
  }

  async get(id: string): Promise<LLMProviderV2 | null> {
    try {
      const result = await this.client.select<ProviderRecord>(`${TABLE_PROVIDERS}:${id}`);
      if (result.length === 0) {
        return null;
      }
      return this.recordToProvider(result[0]);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get provider:", { id, error });
      throw error;
    }
  }

  async getMany(ids: string[]): Promise<Map<string, LLMProviderV2>> {
    const map = new Map<string, LLMProviderV2>();
    if (ids.length === 0) {
      return map;
    }

    try {
      const placeholders = ids.map((_, i) => `$id${i}`).join(",");
      const vars: Record<string, unknown> = {};
      ids.forEach((id, i) => {
        vars[`$id${i}`] = `${TABLE_PROVIDERS}:${id}`;
      });

      const result = await this.client.query<ProviderRecord[]>(
        `SELECT * FROM ${TABLE_PROVIDERS} WHERE id IN [${placeholders}]`,
        vars
      );

      for (const record of result) {
        const provider = this.recordToProvider(record);
        const recordId = typeof record.id === "string" ? record.id : String(record.id || "");
        map.set(recordId.replace(`${TABLE_PROVIDERS}:`, ""), provider);
      }

      return map;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get many providers:", { ids, error });
      throw error;
    }
  }

  async save(entity: LLMProviderV2): Promise<string> {
    const id =
      entity.id !== undefined && entity.id !== null && entity.id !== 0
        ? String(entity.id)
        : String(Date.now());
    const record: Omit<ProviderRecord, "id"> = {
      provider: entity.provider,
      name: entity.name,
      description: entity.description,
      baseConfig: entity.baseConfig as Record<string, unknown>,
      enabled: entity.enabled,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };

    try {
      await this.client.create(`${TABLE_PROVIDERS}:${id}`, record);
      return id;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to save provider:", { id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.delete(`${TABLE_PROVIDERS}:${id}`);
      return true;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to delete provider:", { id, error });
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
    const conditions: string[] = [];
    const vars: Record<string, unknown> = {};

    if (query.enabled !== undefined) {
      conditions.push("enabled = $enabled");
      vars["enabled"] = query.enabled;
    }

    if (query.provider) {
      conditions.push("provider = $provider");
      vars["provider"] = query.provider;
    }

    if (query.modelType) {
      conditions.push("models[?type = $modelType]");
      vars["modelType"] = query.modelType;
    }

    if (query.isDefault !== undefined) {
      conditions.push("is_default = $isDefault");
      vars["isDefault"] = query.isDefault;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const pagination = validatePagination({ limit: query.limit, offset: query.offset });
    const limitClause = pagination.limit > 0 ? `LIMIT ${pagination.limit}` : "";
    const offsetClause = pagination.offset > 0 ? `OFFSET ${pagination.offset}` : "";

    try {
      const result = await this.client.query<ProviderRecord[]>(
        `SELECT * FROM ${TABLE_PROVIDERS} ${whereClause} ${limitClause} ${offsetClause}`.trim(),
        vars
      );

      return result.map((record) => this.recordToProvider(record));
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to find providers:", { query, error });
      throw error;
    }
  }

  async count(query: LLMConfigQuery): Promise<number> {
    const conditions: string[] = [];
    const vars: Record<string, unknown> = {};

    if (query.enabled !== undefined) {
      conditions.push("enabled = $enabled");
      vars["enabled"] = query.enabled;
    }

    if (query.provider) {
      conditions.push("provider = $provider");
      vars["provider"] = query.provider;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const result = await this.client.query<{ count: number }[]>(
        `SELECT count() as count FROM ${TABLE_PROVIDERS} ${whereClause}`,
        vars
      );
      return result[0]?.count ?? 0;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to count providers:", { query, error });
      throw error;
    }
  }

  async getProviderByName(provider: string): Promise<LLMProviderV2 | null> {
    return this.find({ provider, limit: 1 }).then((results) => results[0] ?? null);
  }

  async getEnabledProviders(): Promise<string[]> {
    const providers = await this.find({ enabled: true });
    return providers.map((p) => p.provider);
  }

  async getModelsByProvider(providerId: string): Promise<LLMModelV2[]> {
    try {
      const result = await this.client.query<ModelRecord[]>(
        "SELECT * FROM llm_models WHERE provider_id = $providerId",
        { providerId }
      );
      return result.map((record) => this.modelRecordToModel(record, providerId));
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get models by provider:", { providerId, error });
      throw error;
    }
  }

  async getModelByKey(providerId: string, modelKey: string): Promise<LLMModelV2 | null> {
    try {
      const result = await this.client.query<ModelRecord[]>(
        "SELECT * FROM llm_models WHERE provider_id = $providerId AND key = $modelKey LIMIT 1",
        { providerId, modelKey }
      );
      if (result.length === 0) {
        return null;
      }
      return this.modelRecordToModel(result[0], providerId);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get model by key:", { providerId, modelKey, error });
      throw error;
    }
  }

  async getDefaultModelByType(modelType: string): Promise<LLMModelV2 | null> {
    try {
      const result = await this.client.query<ModelRecord[]>(
        "SELECT * FROM llm_models WHERE type = $modelType AND is_default = true LIMIT 1",
        { modelType }
      );
      if (result.length === 0) {
        return null;
      }
      const record = result[0];
      return this.modelRecordToModel(record, record.provider_id);
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get default model by type:", { modelType, error });
      throw error;
    }
  }

  async createProviderWithModels(provider: LLMProviderV2, models: LLMModelV2[]): Promise<string> {
    const providerId = await this.save(provider);

    for (const model of models) {
      const modelRecord: ModelRecord = {
        id: `${TABLE_PROVIDERS}:${providerId}:models:${model.modelKey}`,
        provider_id: providerId,
        key: model.modelKey,
        name: model.modelName,
        type: model.modelType,
      };
      await this.client.create("llm_models", modelRecord);
    }

    return providerId;
  }

  private recordToProvider(record: ProviderRecord): LLMProviderV2 {
    const idStr = record.id?.replace(`${TABLE_PROVIDERS}:`, "") || "0";
    return {
      id: parseStorageIdAsNumber(idStr),
      provider: record.provider,
      name: record.name,
      description: record.description,
      baseConfig: record.baseConfig as LLMProviderV2["baseConfig"],
      enabled: record.enabled,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private modelRecordToModel(record: ModelRecord, providerId: string): LLMModelV2 {
    const providerIdNum = parseStorageIdAsNumber(providerId);
    const idStr = record.id?.split(":").pop() || "0";
    return {
      id: parseStorageIdAsNumber(idStr),
      providerId: providerIdNum,
      modelKey: record.key,
      modelName: record.name,
      modelType: record.type as LLMModelV2["modelType"],
      modelConfig: {},
      enabled: true,
      isDefault: false,
      isAceEvolution: false,
      displayOrder: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
}
