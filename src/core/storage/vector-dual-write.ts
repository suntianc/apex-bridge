/**
 * Vector Dual-Write Adapter
 *
 * Implements dual-write strategy for vector storage migration.
 * Writes to both primary (LanceDB) and secondary (SurrealDB).
 * Reads only from primary storage during migration.
 */

import type {
  IVectorStorage,
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
} from "./interfaces";
import { logger } from "../../utils/logger";

export interface VectorDualWriteConfig {
  domain: string;
  batchSize: number;
  asyncWrite: boolean;
}

export class VectorDualWriteAdapter implements IVectorStorage {
  private primary: IVectorStorage;
  private secondary: IVectorStorage;
  private config: VectorDualWriteConfig;

  constructor(
    primary: IVectorStorage,
    secondary: IVectorStorage,
    config?: Partial<VectorDualWriteConfig>
  ) {
    this.primary = primary;
    this.secondary = secondary;
    this.config = {
      domain: config?.domain || "Vector",
      batchSize: config?.batchSize || 100,
      asyncWrite: config?.asyncWrite ?? true,
    };
  }

  getBackendType(): "lance" | "surrealdb" {
    return "lance";
  }

  async upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void> {
    await this.primary.upsert(id, vector, metadata);

    if (this.config.asyncWrite) {
      this.secondary.upsert(id, vector, metadata).catch((error: unknown) => {
        logger.error(`[VectorDualWrite][${this.config.domain}] Secondary upsert failed:`, {
          id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    } else {
      await this.secondary.upsert(id, vector, metadata);
    }
  }

  async upsertBatch(records: VectorRecord[]): Promise<void> {
    await this.primary.upsertBatch(records);

    if (records.length === 0) {
      return;
    }

    if (this.config.asyncWrite) {
      this.upsertBatchAsync(records).catch((error: unknown) => {
        logger.error(`[VectorDualWrite][${this.config.domain}] Secondary batch upsert failed:`, {
          count: records.length,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    } else {
      await this.upsertBatchSync(records);
    }
  }

  private async upsertBatchAsync(records: VectorRecord[]): Promise<void> {
    const batches: VectorRecord[][] = [];
    for (let i = 0; i < records.length; i += this.config.batchSize) {
      batches.push(records.slice(i, i + this.config.batchSize));
    }

    await Promise.all(
      batches.map((batch) =>
        this.secondary.upsertBatch(batch).catch((error: unknown) => {
          logger.error(`[VectorDualWrite][${this.config.domain}] Batch upsert failed:`, {
            batchSize: batch.length,
            error: error instanceof Error ? error.message : String(error),
          });
        })
      )
    );
  }

  private async upsertBatchSync(records: VectorRecord[]): Promise<void> {
    const batches: VectorRecord[][] = [];
    for (let i = 0; i < records.length; i += this.config.batchSize) {
      batches.push(records.slice(i, i + this.config.batchSize));
    }

    for (const batch of batches) {
      await this.secondary.upsertBatch(batch);
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.primary.delete(id);

    this.secondary.delete(id).catch((error: unknown) => {
      logger.error(`[VectorDualWrite][${this.config.domain}] Secondary delete failed:`, {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return result;
  }

  async search(
    queryVector: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    return this.primary.search(queryVector, options);
  }

  getDimension(): number {
    return this.primary.getDimension();
  }

  isPersisted(): boolean {
    return true;
  }

  async count(): Promise<number> {
    return this.primary.count();
  }

  getConfig(): VectorDualWriteConfig {
    return this.config;
  }
}
