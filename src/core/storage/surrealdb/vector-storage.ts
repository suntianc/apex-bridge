/**
 * SurrealDB Vector Storage Adapter
 *
 * Implements IVectorStorage interface using SurrealDB as the backend.
 * Supports vector storage and similarity search using SurrealQL.
 */

import { SurrealDBClient } from "./client";
import type {
  IVectorStorage,
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
} from "../interfaces";
import { logger } from "../../../utils/logger";
import {
  SurrealDBErrorCode,
  isSurrealDBError,
  wrapSurrealDBError,
} from "../../../utils/surreal-error";

const TABLE_VECTORS = "tool_vectors";

interface VectorSurrealRecord {
  id: string;
  vector: number[];
  metadata: string;
  created_at: number;
  updated_at: number;
  [key: string]: unknown;
}

export class SurrealDBVectorStorage implements IVectorStorage {
  private client: SurrealDBClient;
  private dimension: number;
  private initialized: boolean = false;

  constructor(dimension: number = 1536) {
    this.client = SurrealDBClient.getInstance();
    this.dimension = dimension;
  }

  getBackendType(): "surrealdb" {
    return "surrealdb";
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.ensureTable();
      this.initialized = true;
      logger.info("[SurrealDB] Vector storage initialized", { dimension: this.dimension });
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to initialize vector storage:", { error });
      throw wrapSurrealDBError(error, "initialize", SurrealDBErrorCode.INTERNAL_ERROR);
    }
  }

  private async ensureTable(): Promise<void> {
    try {
      await this.client.query(
        `DEFINE TABLE ${TABLE_VECTORS} SCHEMAFULL;
         DEFINE FIELD id ON ${TABLE_VECTORS} TYPE string;
         DEFINE FIELD vector ON ${TABLE_VECTORS} TYPE array<float>;
         DEFINE FIELD metadata ON ${TABLE_VECTORS} TYPE string;
         DEFINE FIELD created_at ON ${TABLE_VECTORS} TYPE number;
         DEFINE FIELD updated_at ON ${TABLE_VECTORS} TYPE number;
         DEFINE INDEX vector_idx ON ${TABLE_VECTORS} FIELDS vector;`
      );
    } catch (error: unknown) {
      logger.debug("[SurrealDB] Table/index may already exist:", { error });
    }
  }

  async upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void> {
    const recordId = `${TABLE_VECTORS}:${id}`;
    const record: Omit<VectorSurrealRecord, "id"> = {
      vector,
      metadata: JSON.stringify(metadata),
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    try {
      await this.client.upsert(recordId, record);
      logger.debug("[SurrealDB] Vector upserted", { id, dimension: vector.length });
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to upsert vector:", { id, error });
      throw wrapSurrealDBError(error, "upsert", SurrealDBErrorCode.CREATE_FAILED, { id });
    }
  }

  async upsertBatch(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    try {
      const now = Date.now();
      const surrealRecords: Array<{ recordId: string; data: Omit<VectorSurrealRecord, "id"> }> =
        records.map((record) => ({
          recordId: `${TABLE_VECTORS}:${record.id}`,
          data: {
            vector: record.vector,
            metadata: JSON.stringify(record.metadata),
            created_at: now,
            updated_at: now,
          },
        }));

      for (const record of surrealRecords) {
        await this.client.upsert(record.recordId, record.data);
      }

      logger.debug("[SurrealDB] Batch upsert completed", { count: records.length });
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to upsert batch:", { count: records.length, error });
      throw wrapSurrealDBError(error, "upsertBatch", SurrealDBErrorCode.CREATE_FAILED, {
        count: records.length,
      });
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.delete(`${TABLE_VECTORS}:${id}`);
      return true;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to delete vector:", { id, error });
      return false;
    }
  }

  async search(
    queryVector: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    const limit = options?.limit || 10;
    const threshold = options?.threshold ?? 0.0;
    const distanceType = options?.distanceType || "cosine";

    try {
      let searchQuery: string;
      const vars: Record<string, unknown> = {
        queryVector,
        limit,
        threshold,
      };

      switch (distanceType) {
        case "cosine":
          searchQuery = `
            SELECT id, metadata,
                   tf::cosine_similarity(vector, $queryVector) AS score
            FROM ${TABLE_VECTORS}
            WHERE score > $threshold
            ORDER BY score DESC
            LIMIT $limit
          `;
          break;
        case "l2":
          searchQuery = `
            SELECT id, metadata,
                   vector::distance(vector, $queryVector, 'euclidean') AS score
            FROM ${TABLE_VECTORS}
            ORDER BY score ASC
            LIMIT $limit
          `;
          break;
        case "dot":
          searchQuery = `
            SELECT id, metadata,
                   vector::dot(vector, $queryVector) AS score
            FROM ${TABLE_VECTORS}
            ORDER BY score DESC
            LIMIT $limit
          `;
          break;
        default:
          searchQuery = `
            SELECT id, metadata,
                   tf::cosine_similarity(vector, $queryVector) AS score
            FROM ${TABLE_VECTORS}
            WHERE score > $threshold
            ORDER BY score DESC
            LIMIT $limit
          `;
      }

      const result = await this.client
        .query<
          {
            id: string;
            score: number;
            metadata: string;
          }[]
        >(searchQuery, vars)
        .then((r) => r.flat());

      return result
        .filter((item) => item.score !== null)
        .map((item) => ({
          id: String(item.id).replace(`${TABLE_VECTORS}:`, ""),
          score: this.normalizeScore(item.score, distanceType),
          metadata: this.parseMetadata(item.metadata),
        }));
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Vector search failed:", { error });
      throw wrapSurrealDBError(error, "search", SurrealDBErrorCode.QUERY_FAILED);
    }
  }

  private normalizeScore(score: number, distanceType: string): number {
    if (distanceType === "l2") {
      return Math.max(0, 1 - score);
    }
    return Math.max(0, Math.min(1, score));
  }

  private parseMetadata(metadataStr: string): Record<string, unknown> {
    try {
      return JSON.parse(metadataStr || "{}");
    } catch {
      return {};
    }
  }

  getDimension(): number {
    return this.dimension;
  }

  isPersisted(): boolean {
    return true;
  }

  async count(): Promise<number> {
    try {
      const result = await this.client
        .query<{ count: number }[]>(`SELECT count() as count FROM ${TABLE_VECTORS}`, {})
        .then((r) => r.flat());
      return result[0]?.count ?? 0;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to count vectors:", { error });
      throw wrapSurrealDBError(error, "count", SurrealDBErrorCode.QUERY_FAILED);
    }
  }

  async clear(): Promise<void> {
    try {
      const result = await this.client
        .query<{ id: string }[]>(`SELECT id FROM ${TABLE_VECTORS}`, {})
        .then((r) => r.flat());
      for (const record of result) {
        await this.client.delete(record.id);
      }
      logger.info("[SurrealDB] Vector storage cleared", { count: result.length });
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to clear vectors:", { error });
      throw wrapSurrealDBError(error, "clear", SurrealDBErrorCode.DELETE_FAILED);
    }
  }
}
