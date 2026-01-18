/**
 * SurrealDB LLMConfig Storage Adapter
 *
 * Implements ILLMConfigStorage interface using SurrealDB as the backend.
 */

import { SurrealDBClient } from "./client";
import { ensureSurrealDBConnected } from "./connection";
import type { ILLMConfigStorage, LLMConfigQuery } from "../interfaces";
import type { LLMProviderV2, LLMModelV2, LLMModelFull } from "../../../types/llm-models";
import { logger } from "../../../utils/logger";
import { validatePagination, parseStorageIdAsNumber } from "../utils";
import {
  SurrealDBErrorCode,
  isSurrealDBError,
  wrapSurrealDBError,
} from "../../../utils/surreal-error";

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

  /**
   * Ensure SurrealDB connection is established before operations
   */
  private async ensureConnected(): Promise<void> {
    await ensureSurrealDBConnected();
  }

  async get(id: string): Promise<LLMProviderV2 | null> {
    await this.ensureConnected();

    try {
      const result = await this.client.select<ProviderRecord>(`${TABLE_PROVIDERS}:${id}`);
      if (result.length === 0) {
        return null;
      }
      return this.recordToProvider(result[0]);
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to get provider:", { id, error });
      throw wrapSurrealDBError(error, "get", SurrealDBErrorCode.SELECT_FAILED, { id });
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

      const result = await this.client
        .query<
          ProviderRecord[]
        >(`SELECT * FROM ${TABLE_PROVIDERS} WHERE id IN [${placeholders}]`, vars)
        .then((r) => r.flat());

      for (const record of result) {
        const provider = this.recordToProvider(record);
        const recordId = typeof record.id === "string" ? record.id : String(record.id || "");
        map.set(recordId.replace(`${TABLE_PROVIDERS}:`, ""), provider);
      }

      return map;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to get many providers:", { ids, error });
      throw wrapSurrealDBError(error, "getMany", SurrealDBErrorCode.SELECT_FAILED, { ids });
    }
  }

  async save(entity: LLMProviderV2): Promise<string> {
    await this.ensureConnected();

    const providerId = typeof entity.id === "number" && entity.id > 0 ? entity.id : Date.now();
    const recordId = `${TABLE_PROVIDERS}:${providerId}`;

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
      // Use CREATE with explicit ID - SurrealDB's native record creation
      // This creates records in the table, never new tables
      logger.debug("[SurrealDB] Saving provider with CREATE:", {
        table: TABLE_PROVIDERS,
        recordId,
        provider: record.provider,
        name: record.name,
      });

      if (typeof entity.id === "number" && entity.id > 0) {
        await this.client.update<Omit<ProviderRecord, "id">>(recordId, record);
      } else {
        await this.client.create<Omit<ProviderRecord, "id">>(recordId, record);
      }

      const numericId = recordId.replace(`${TABLE_PROVIDERS}:`, "");
      logger.debug("[SurrealDB] Provider saved successfully:", { recordId, numericId });
      return numericId;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : "";
      logger.error("[SurrealDB] Failed to save provider:", {
        error: errorMessage,
        stack: errorStack,
        record,
        recordId,
      });

      throw wrapSurrealDBError(error, "save", SurrealDBErrorCode.CREATE_FAILED, { record });
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const providerId = id;

      await this.client.query("DELETE llm_models WHERE provider_id = $providerId", {
        providerId,
      });
      await this.client.delete(`${TABLE_PROVIDERS}:${providerId}`);

      return true;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
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
    await this.ensureConnected();

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
      const result = await this.client
        .query<
          ProviderRecord[]
        >(`SELECT * FROM ${TABLE_PROVIDERS} ${whereClause} ${limitClause} ${offsetClause}`.trim(), vars)
        .then((r) => r.flat());

      return result.map((record) => this.recordToProvider(record));
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to find providers:", { query, error });
      throw wrapSurrealDBError(error, "find", SurrealDBErrorCode.QUERY_FAILED, { query });
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
      const result = await this.client
        .query<
          { count: number }[]
        >(`SELECT count() as count FROM ${TABLE_PROVIDERS} ${whereClause}`, vars)
        .then((r) => r.flat());
      return result[0]?.count ?? 0;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to count providers:", { query, error });
      throw wrapSurrealDBError(error, "count", SurrealDBErrorCode.QUERY_FAILED, { query });
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
      const result = await this.client
        .query<
          ModelRecord[]
        >("SELECT * FROM llm_models WHERE provider_id = $providerId", { providerId })
        .then((r) => r.flat());
      const models: LLMModelV2[] = [];
      for (const record of result) {
        try {
          models.push(this.modelRecordToModel(record, providerId));
        } catch (error: unknown) {
          logger.warn("[SurrealDB] Skipping invalid llm_models record", {
            providerId,
            recordId: String(record.id || ""),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return models;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to get models by provider:", { providerId, error });
      throw wrapSurrealDBError(error, "getModelsByProvider", SurrealDBErrorCode.QUERY_FAILED, {
        providerId,
      });
    }
  }

  async getModelByKey(providerId: string, modelKey: string): Promise<LLMModelV2 | null> {
    try {
      const result = await this.client
        .query<
          ModelRecord[]
        >("SELECT * FROM llm_models WHERE provider_id = $providerId AND key = $modelKey LIMIT 1", { providerId, modelKey })
        .then((r) => r.flat());
      if (result.length === 0) {
        return null;
      }
      return this.modelRecordToModel(result[0], providerId);
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to get model by key:", { providerId, modelKey, error });
      throw wrapSurrealDBError(error, "getModelByKey", SurrealDBErrorCode.QUERY_FAILED, {
        providerId,
        modelKey,
      });
    }
  }

  async getDefaultModelByType(modelType: string): Promise<LLMModelV2 | null> {
    try {
      const result = await this.client
        .query<
          ModelRecord[]
        >("SELECT * FROM llm_models WHERE type = $modelType AND is_default = true LIMIT 1", { modelType })
        .then((r) => r.flat());
      if (result.length === 0) {
        return null;
      }
      const record = result[0];
      return this.modelRecordToModel(record, record.provider_id);
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to get default model by type:", { modelType, error });
      throw wrapSurrealDBError(error, "getDefaultModelByType", SurrealDBErrorCode.QUERY_FAILED, {
        modelType,
      });
    }
  }

  async createProviderWithModels(provider: LLMProviderV2, models: LLMModelV2[]): Promise<string> {
    return this.client.withTransaction(async () => {
      const providerId = await this.save(provider);

      for (const model of models) {
        const modelId = String(model.id && model.id > 0 ? model.id : Date.now());
        const recordId = `llm_models:${modelId}`;
        const modelRecord: Omit<ModelRecord, "id"> = {
          provider_id: providerId,
          key: model.modelKey,
          name: model.modelName,
          type: model.modelType,
        };
        await this.client.upsert(recordId, modelRecord);
      }

      return providerId;
    });
  }

  async deleteModel(modelId: string): Promise<boolean> {
    try {
      await this.ensureConnected();

      const recordId = `llm_models:${modelId}`;
      return await this.client.delete(recordId);
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to delete model:", { modelId, error });
      return false;
    }
  }

  async getAceEvolutionModel(): Promise<LLMModelFull | null> {
    try {
      const result = await this.client
        .query<ModelRecord[]>("SELECT * FROM llm_models WHERE is_ace_evolution = true LIMIT 1")
        .then((r) => r.flat());
      if (result.length === 0) {
        return null;
      }
      const record = result[0];

      const providerId = record.provider_id;
      const providerResult = await this.client
        .query<
          ProviderRecord[]
        >(`SELECT * FROM ${TABLE_PROVIDERS} WHERE id = $providerId LIMIT 1`, { providerId })
        .then((r) => r.flat());

      const provider = providerResult.length > 0 ? this.recordToProvider(providerResult[0]) : null;

      const providerBaseConfig = provider?.baseConfig ?? { baseURL: "" };

      return {
        id: parseStorageIdAsNumber(
          String(record.id || "")
            .split(":")
            .pop() || "0"
        ),
        providerId: parseStorageIdAsNumber(providerId),
        modelKey: record.key,
        modelName: record.name,
        modelType: record.type as LLMModelV2["modelType"],
        modelConfig: {},
        enabled: true,
        isDefault: false,
        isAceEvolution: true,
        displayOrder: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        provider: provider?.provider || "",
        providerName: provider?.name || "",
        providerBaseConfig,
        providerEnabled: provider?.enabled ?? false,
      };
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to get ACE evolution model:", { error });
      throw wrapSurrealDBError(error, "getAceEvolutionModel", SurrealDBErrorCode.QUERY_FAILED);
    }
  }

  private recordToProvider(record: ProviderRecord): LLMProviderV2 {
    // Handle SurrealDB v2 ID format: "table:⟨table:id⟩" or "table:⟨id⟩"
    let idStr = String(record.id || "");

    // Extract numeric ID from v2 format: ⟨table:id⟩ or ⟨id⟩
    const v2Match = idStr.match(/⟨(?:[^:]+:)?(\d+)⟩$/);
    if (v2Match) {
      idStr = v2Match[1];
    } else {
      // Fallback to v1 format: "table:id"
      idStr = idStr.replace(`${TABLE_PROVIDERS}:`, "");
    }

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

    let idStr = String(record.id || "");
    const v2Match = idStr.match(/⟨(?:[^:]+:)?(\d+)⟩$/);
    if (v2Match) {
      idStr = v2Match[1];
    } else {
      idStr = idStr.split(":").pop() || "0";
    }

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
