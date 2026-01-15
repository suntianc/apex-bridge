/**
 * LanceDB Vector Storage Adapter
 *
 * Implements IVectorStorage interface using existing VectorIndexManager.
 */

import type {
  IVectorStorage,
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
} from "../interfaces";
import { VectorIndexManager } from "../../../services/tool-retrieval/VectorIndexManager";
import { LanceDBConnectionManager } from "../../../services/tool-retrieval/LanceDBConnectionManager";
import { logger } from "../../../utils/logger";
import { escapeSingleQuotes } from "../utils";
import * as path from "path";

const DEFAULT_DIMENSIONS = 1536;
const TABLE_NAME = "tools";

export class LanceDBVectorStorage implements IVectorStorage {
  private indexManager: VectorIndexManager | null = null;
  private connectionManager: LanceDBConnectionManager;
  private dimensions: number;
  private initialized: boolean = false;

  constructor(connectionManager?: LanceDBConnectionManager, dimensions?: number) {
    const dataDir = path.resolve(process.cwd(), ".data");
    this.connectionManager =
      connectionManager || new LanceDBConnectionManager({ vectorDbPath: dataDir });
    this.dimensions = dimensions || DEFAULT_DIMENSIONS;
  }

  private async requireIndexManager(): Promise<VectorIndexManager> {
    if (!this.indexManager) {
      this.indexManager = new VectorIndexManager(this.connectionManager, this.dimensions);
    }
    if (!this.initialized) {
      await this.indexManager.initializeTable(TABLE_NAME);
      this.initialized = true;
    }
    return this.indexManager;
  }

  getBackendType(): "lance" | "surrealdb" {
    return "lance";
  }

  async upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void> {
    try {
      const manager = await this.requireIndexManager();
      await manager.addRecords([
        {
          id,
          name: (metadata.name as string) || id,
          description: (metadata.description as string) || "",
          tags: (metadata.tags as string[]) || [],
          path: (metadata.path as string) || "",
          version: (metadata.version as string) || "1.0.0",
          source: (metadata.source as string) || "local",
          toolType: (metadata.toolType as string) || "skill",
          metadata: JSON.stringify(metadata),
          vector,
          indexedAt: Date.now(),
        },
      ]);
    } catch (error: unknown) {
      logger.error("[LanceDB] Failed to upsert vector:", { id, error });
      throw error;
    }
  }

  async upsertBatch(records: VectorRecord[]): Promise<void> {
    try {
      const manager = await this.requireIndexManager();

      const arrowRecords = records.map((record) => ({
        id: record.id,
        name: (record.metadata.name as string) || record.id,
        description: (record.metadata.description as string) || "",
        tags: (record.metadata.tags as string[]) || [],
        path: (record.metadata.path as string) || "",
        version: (record.metadata.version as string) || "1.0.0",
        source: (record.metadata.source as string) || "local",
        toolType: (record.metadata.toolType as string) || "skill",
        metadata: JSON.stringify(record.metadata),
        vector: record.vector,
        indexedAt: Date.now(),
      }));

      await manager.addRecords(arrowRecords);
    } catch (error: unknown) {
      logger.error("[LanceDB] Failed to upsert batch:", { count: records.length, error });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const manager = await this.requireIndexManager();
      const escapedId = escapeSingleQuotes(id);
      await manager.deleteRecords(`id = '${escapedId}'`);
      return true;
    } catch (error: unknown) {
      logger.error("[LanceDB] Failed to delete vector:", { id, error });
      return false;
    }
  }

  async search(
    queryVector: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    try {
      const manager = await this.requireIndexManager();

      const searchOptions: VectorSearchOptions & { queryVector: number[] } = {
        queryVector,
        limit: options?.limit || 10,
        distanceType: "cosine",
      };

      const result = await manager.search(searchOptions);

      return result.data.map((item: Record<string, unknown>) => ({
        id: String(item.id),
        score: item.score as number,
        metadata: this.parseMetadata(item.metadata as string),
      }));
    } catch (error: unknown) {
      logger.error("[LanceDB] Failed to search vectors:", { error });
      throw error;
    }
  }

  getDimension(): number {
    return this.dimensions;
  }

  isPersisted(): boolean {
    return true;
  }

  async count(): Promise<number> {
    try {
      const manager = await this.requireIndexManager();
      return await manager.getTableCount();
    } catch (error: unknown) {
      logger.error("[LanceDB] Failed to get count:", { error });
      throw error;
    }
  }

  private parseMetadata(metadataStr: string): Record<string, unknown> {
    try {
      return JSON.parse(metadataStr || "{}");
    } catch {
      return {};
    }
  }
}
