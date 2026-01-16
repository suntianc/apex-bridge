/**
 * Read-Write Split Adapter for High Availability
 *
 * Provides read-write splitting where:
 * - Writes always go to primary (SQLite for migration safety)
 * - Reads can be routed to secondary (SurrealDB) after warmup
 * - Automatic fallback to primary on read failures
 */

import type { IStorageAdapter, IQueryableStorage } from "./interfaces";
import { logger } from "../../utils/logger";

export interface ReadWriteSplitConfig {
  domain: string;
  readFromSecondary: boolean;
  fallbackToPrimary: boolean;
}

export class ReadWriteSplitAdapter<T> implements IStorageAdapter<T> {
  protected primary: IStorageAdapter<T>;
  protected secondary: IStorageAdapter<T> | null;
  protected config: ReadWriteSplitConfig;

  constructor(
    primary: IStorageAdapter<T>,
    secondary: IStorageAdapter<T> | null,
    config: Partial<ReadWriteSplitConfig> = {}
  ) {
    this.primary = primary;
    this.secondary = secondary;
    this.config = {
      domain: config.domain || "Unknown",
      readFromSecondary: config.readFromSecondary ?? false,
      fallbackToPrimary: config.fallbackToPrimary ?? true,
    };
  }

  async get(id: string): Promise<T | null> {
    if (this.config.readFromSecondary && this.secondary) {
      try {
        const result = await this.secondary.get(id);
        if (result !== null) {
          return result;
        }
        if (this.config.fallbackToPrimary) {
          logger.debug(
            `[ReadWriteSplit][${this.config.domain}] Secondary miss, fallback to primary: ${id}`
          );
        }
      } catch (err) {
        if (this.config.fallbackToPrimary) {
          logger.warn(`[ReadWriteSplit][${this.config.domain}] Secondary read failed, fallback:`, {
            id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return this.primary.get(id);
  }

  async getMany(ids: string[]): Promise<Map<string, T>> {
    if (this.config.readFromSecondary && this.secondary) {
      try {
        const secondaryResults = await this.secondary.getMany(ids);
        if (secondaryResults.size === ids.length) {
          return secondaryResults;
        }
        logger.debug(
          `[ReadWriteSplit][${this.config.domain}] Partial secondary miss, mixing sources`
        );
      } catch (err) {
        logger.warn(`[ReadWriteSplit][${this.config.domain}] Secondary getMany failed:`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return this.primary.getMany(ids);
  }

  async save(entity: T): Promise<string> {
    return this.primary.save(entity);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.primary.delete(id);

    if (this.secondary) {
      this.secondary
        .delete(id)
        .then(() => {
          logger.debug(`[ReadWriteSplit][${this.config.domain}] Secondary delete succeeded: ${id}`);
        })
        .catch((err) => {
          logger.error(`[ReadWriteSplit][${this.config.domain}] Secondary delete failed:`, {
            id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    return result;
  }

  async deleteMany(ids: string[]): Promise<number> {
    const result = await this.primary.deleteMany(ids);

    if (this.secondary) {
      this.secondary
        .deleteMany(ids)
        .then((count) => {
          logger.debug(
            `[ReadWriteSplit][${this.config.domain}] Secondary deleteMany succeeded: ${count}`
          );
        })
        .catch((err) => {
          logger.error(`[ReadWriteSplit][${this.config.domain}] Secondary deleteMany failed:`, {
            count: ids.length,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    return result;
  }

  isSecondaryAvailable(): boolean {
    return this.secondary !== null;
  }

  isReadFromSecondary(): boolean {
    return this.config.readFromSecondary;
  }

  enableSecondaryReads(): void {
    if (this.secondary) {
      this.config.readFromSecondary = true;
      logger.info(`[ReadWriteSplit][${this.config.domain}] Secondary reads enabled`);
    }
  }

  disableSecondaryReads(): void {
    this.config.readFromSecondary = false;
    logger.info(`[ReadWriteSplit][${this.config.domain}] Secondary reads disabled`);
  }
}

export class ReadWriteSplitQueryableAdapter<T, Q = Record<string, unknown>>
  extends ReadWriteSplitAdapter<T>
  implements IQueryableStorage<T, Q>
{
  constructor(
    primary: IQueryableStorage<T, Q>,
    secondary: IQueryableStorage<T, Q> | null,
    config: Partial<ReadWriteSplitConfig> = {}
  ) {
    super(primary, secondary, config);
  }

  async find(query: Q): Promise<T[]> {
    if (this.config.readFromSecondary && this.secondary) {
      try {
        return await (this.secondary as IQueryableStorage<T, Q>).find(query);
      } catch (err) {
        logger.warn(`[ReadWriteSplit][${this.config.domain}] Secondary find failed, fallback:`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return (this.primary as IQueryableStorage<T, Q>).find(query);
  }

  async count(query: Q): Promise<number> {
    if (this.config.readFromSecondary && this.secondary) {
      try {
        return await (this.secondary as IQueryableStorage<T, Q>).count(query);
      } catch (err) {
        logger.warn(`[ReadWriteSplit][${this.config.domain}] Secondary count failed, fallback:`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return (this.primary as IQueryableStorage<T, Q>).count(query);
  }
}
