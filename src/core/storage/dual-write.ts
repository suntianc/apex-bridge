/**
 * DualWriteAdapter - implements dual-write strategy for migration
 * Writes to both primary (SQLite) and secondary (SurrealDB)
 * Reads only from primary storage
 */

import type {
  IStorageAdapter,
  IQueryableStorage,
  IMCPConfigStorage,
  ITrajectoryStorage,
  MCPConfigQuery,
  MCPServerRecord,
  TrajectoryQuery,
  Trajectory,
} from "./interfaces";
import { logger } from "../../utils/logger";

export class DualWriteAdapter<T> implements IStorageAdapter<T> {
  protected primary: IStorageAdapter<T>;
  private secondary: IStorageAdapter<T>;
  private domain: string;

  constructor(primary: IStorageAdapter<T>, secondary: IStorageAdapter<T>, domain: string) {
    this.primary = primary;
    this.secondary = secondary;
    this.domain = domain;
  }

  async get(id: string): Promise<T | null> {
    return this.primary.get(id);
  }

  async getMany(ids: string[]): Promise<Map<string, T>> {
    return this.primary.getMany(ids);
  }

  async save(entity: T): Promise<string> {
    const result = await this.primary.save(entity);

    this.secondary
      .save(entity)
      .then(() => {
        logger.debug(`[DualWrite] ${this.domain} secondary create succeeded`);
      })
      .catch((error: unknown) => {
        logger.error(`[DualWrite] ${this.domain} secondary create failed:`, {
          error: error instanceof Error ? error.message : String(error),
          entityId: result,
        });
      });

    return result;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.primary.delete(id);

    this.secondary
      .delete(id)
      .then(() => {
        logger.debug(`[DualWrite] ${this.domain} secondary delete succeeded`);
      })
      .catch((error: unknown) => {
        logger.error(`[DualWrite] ${this.domain} secondary delete failed:`, {
          error: error instanceof Error ? error.message : String(error),
          entityId: id,
        });
      });

    return result;
  }

  async deleteMany(ids: string[]): Promise<number> {
    const result = await this.primary.deleteMany(ids);

    this.secondary
      .deleteMany(ids)
      .then((count) => {
        logger.debug(`[DualWrite] ${this.domain} secondary deleteMany succeeded: ${count}`);
      })
      .catch((error: unknown) => {
        logger.error(`[DualWrite] ${this.domain} secondary deleteMany failed:`, {
          error: error instanceof Error ? error.message : String(error),
          count: ids.length,
        });
      });

    return result;
  }
}

export class DualWriteQueryableAdapter<T, Q = Record<string, unknown>>
  extends DualWriteAdapter<T>
  implements IQueryableStorage<T, Q>
{
  constructor(
    primary: IQueryableStorage<T, Q>,
    secondary: IQueryableStorage<T, Q>,
    domain: string
  ) {
    super(primary, secondary, domain);
  }

  async find(query: Q): Promise<T[]> {
    return (this.primary as IQueryableStorage<T, Q>).find(query);
  }

  async count(query: Q): Promise<number> {
    return (this.primary as IQueryableStorage<T, Q>).count(query);
  }
}

export class DualWriteMCPConfigAdapter
  extends DualWriteQueryableAdapter<MCPServerRecord, MCPConfigQuery>
  implements IMCPConfigStorage
{
  private primaryMCP: IMCPConfigStorage;

  constructor(primary: IMCPConfigStorage, secondary: IMCPConfigStorage) {
    super(primary, secondary, "MCPConfig");
    this.primaryMCP = primary;
  }

  async getByServerId(serverId: string): Promise<MCPServerRecord | null> {
    return this.primaryMCP.getByServerId(serverId);
  }

  async getEnabledServers(): Promise<MCPServerRecord[]> {
    return this.primaryMCP.getEnabledServers();
  }

  async exists(serverId: string): Promise<boolean> {
    return this.primaryMCP.exists(serverId);
  }

  async upsertServer(config: unknown): Promise<void> {
    await this.primaryMCP.upsertServer(
      config as Parameters<typeof this.primaryMCP.upsertServer>[0]
    );
  }
}

export class DualWriteTrajectoryAdapter
  extends DualWriteQueryableAdapter<Trajectory, TrajectoryQuery>
  implements ITrajectoryStorage
{
  private primaryTrajectory: ITrajectoryStorage;

  constructor(primary: ITrajectoryStorage, secondary: ITrajectoryStorage) {
    super(primary, secondary, "Trajectory");
    this.primaryTrajectory = primary;
  }

  async getByTaskId(taskId: string): Promise<Trajectory | null> {
    return this.primaryTrajectory.getByTaskId(taskId);
  }

  async getRecentByOutcome(outcome: "SUCCESS" | "FAILURE", limit?: number): Promise<Trajectory[]> {
    return this.primaryTrajectory.getRecentByOutcome(outcome, limit);
  }

  async getStats(): Promise<{
    total: number;
    success: number;
    failure: number;
    pending: number;
    completed: number;
    failed: number;
  }> {
    return this.primaryTrajectory.getStats();
  }

  async cleanup(olderThanDays: number): Promise<number> {
    return this.primaryTrajectory.cleanup(olderThanDays);
  }
}

export function parseEnvBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return value.toLowerCase() === "true" || value === "1";
}
