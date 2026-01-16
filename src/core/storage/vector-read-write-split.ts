/**
 * Vector Read-Write Split Adapter
 *
 * Provides read-write splitting for vector storage with:
 * - Writes always go to primary (LanceDB) for migration safety
 * - Reads can be routed to secondary (SurrealDB) after warmup
 * - Automatic fallback to primary on read failures
 */

import type {
  IVectorStorage,
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
} from "./interfaces";
import { logger } from "../../utils/logger";

export interface VectorReadWriteSplitConfig {
  domain: string;
  readFromSecondary: boolean;
  fallbackToPrimary: boolean;
  secondaryWarmup: boolean;
}

export class VectorReadWriteSplitAdapter implements IVectorStorage {
  private primary: IVectorStorage;
  private secondary: IVectorStorage | null;
  private config: VectorReadWriteSplitConfig;
  private secondaryReady: boolean = false;

  constructor(
    primary: IVectorStorage,
    secondary: IVectorStorage | null,
    config?: Partial<VectorReadWriteSplitConfig>
  ) {
    this.primary = primary;
    this.secondary = secondary;
    this.config = {
      domain: config?.domain || "Vector",
      readFromSecondary: config?.readFromSecondary ?? false,
      fallbackToPrimary: config?.fallbackToPrimary ?? true,
      secondaryWarmup: config?.secondaryWarmup ?? false,
    };
  }

  getBackendType(): "lance" | "surrealdb" {
    return "lance";
  }

  async upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void> {
    await this.primary.upsert(id, vector, metadata);

    if (this.secondary) {
      this.secondary.upsert(id, vector, metadata).catch((error: unknown) => {
        logger.error(`[VectorRWSplit][${this.config.domain}] Secondary upsert failed:`, {
          id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  async upsertBatch(records: VectorRecord[]): Promise<void> {
    await this.primary.upsertBatch(records);

    if (this.secondary && records.length > 0) {
      this.secondary.upsertBatch(records).catch((error: unknown) => {
        logger.error(`[VectorRWSplit][${this.config.domain}] Secondary batch upsert failed:`, {
          count: records.length,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.primary.delete(id);

    if (this.secondary) {
      this.secondary.delete(id).catch((error: unknown) => {
        logger.error(`[VectorRWSplit][${this.config.domain}] Secondary delete failed:`, {
          id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return result;
  }

  async search(
    queryVector: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    if (this.config.readFromSecondary && this.secondary && this.secondaryReady) {
      try {
        const results = await this.secondary.search(queryVector, options);
        if (results.length > 0) {
          logger.debug(`[VectorRWSplit][${this.config.domain}] Secondary read succeeded`);
          return results;
        }
        if (this.config.fallbackToPrimary) {
          logger.debug(
            `[VectorRWSplit][${this.config.domain}] Secondary empty, fallback to primary`
          );
        }
      } catch (error: unknown) {
        if (this.config.fallbackToPrimary) {
          logger.warn(`[VectorRWSplit][${this.config.domain}] Secondary search failed, fallback:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return this.primary.search(queryVector, options);
  }

  getDimension(): number {
    return this.primary.getDimension();
  }

  isPersisted(): boolean {
    return true;
  }

  async count(): Promise<number> {
    if (this.config.readFromSecondary && this.secondary && this.secondaryReady) {
      try {
        return await this.secondary.count();
      } catch (error: unknown) {
        logger.warn(`[VectorRWSplit][${this.config.domain}] Secondary count failed, fallback:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.primary.count();
  }

  isSecondaryAvailable(): boolean {
    return this.secondary !== null;
  }

  isSecondaryReady(): boolean {
    return this.secondaryReady;
  }

  isReadFromSecondary(): boolean {
    return this.config.readFromSecondary;
  }

  async warmup(): Promise<void> {
    if (!this.secondary || this.config.secondaryWarmup) {
      return;
    }

    if (this.secondaryReady) {
      return;
    }

    try {
      await this.secondary.count();
      this.secondaryReady = true;
      logger.info(`[VectorRWSplit][${this.config.domain}] Secondary warmup complete`);
    } catch (error: unknown) {
      this.secondaryReady = false;
      logger.error(`[VectorRWSplit][${this.config.domain}] Secondary warmup failed:`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  enableSecondaryReads(): void {
    if (this.secondary) {
      this.config.readFromSecondary = true;
      logger.info(`[VectorRWSplit][${this.config.domain}] Secondary reads enabled`);
    } else {
      logger.warn(`[VectorRWSplit][${this.config.domain}] Cannot enable reads - no secondary`);
    }
  }

  disableSecondaryReads(): void {
    this.config.readFromSecondary = false;
    this.secondaryReady = false;
    logger.info(`[VectorRWSplit][${this.config.domain}] Secondary reads disabled`);
  }

  getConfig(): VectorReadWriteSplitConfig {
    return this.config;
  }
}
