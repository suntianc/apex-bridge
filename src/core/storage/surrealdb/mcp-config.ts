/**
 * SurrealDB MCP Config Storage Adapter
 *
 * Implements IMCPConfigStorage interface using SurrealDB as the backend.
 */

import { SurrealDBClient } from "./client";
import type { IMCPConfigStorage, MCPConfigQuery, MCPServerRecord } from "../interfaces";
import type { MCPServerConfig } from "../../../types/mcp";
import { logger } from "../../../utils/logger";
import { retry } from "../../../utils/retry";
import {
  SurrealDBErrorCode,
  isSurrealDBError,
  wrapSurrealDBError,
} from "../../../utils/surreal-error";

const TABLE_MCP_SERVERS = "mcp_servers";

/**
 * 判断 SurrealDB 错误是否可重试（读写冲突类错误）
 */
function isSurrealDBConflictRetryable(error: unknown): boolean {
  if (!isSurrealDBError(error)) {
    // 检查原始错误消息中是否包含 "read or write conflict" 或 "can be retried"
    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();
    return (
      lowerMessage.includes("read or write conflict") ||
      lowerMessage.includes("can be retried") ||
      lowerMessage.includes("failed to commit transaction")
    );
  }

  // SDB_QUERY_001 通常是查询执行失败，可能包含冲突
  if (error.code === SurrealDBErrorCode.QUERY_FAILED) {
    const message = error.message.toLowerCase();
    return (
      message.includes("read or write conflict") ||
      message.includes("can be retried") ||
      message.includes("failed to commit transaction")
    );
  }

  // 事务失败错误通常可重试
  if (error.code === SurrealDBErrorCode.TRANSACTION_FAILED) {
    return true;
  }

  return false;
}

interface MCPServerSurrealRecord {
  id: string;
  config: MCPServerConfig;
  enabled: number;
  created_at: number;
  updated_at: number;
  [key: string]: unknown;
}

export class SurrealDBMCPConfigStorage implements IMCPConfigStorage {
  private client: SurrealDBClient;

  constructor() {
    this.client = SurrealDBClient.getInstance();
  }

  async get(id: string): Promise<MCPServerRecord | null> {
    try {
      const result = await this.client.select<MCPServerSurrealRecord>(`${TABLE_MCP_SERVERS}:${id}`);
      if (result.length === 0) {
        return null;
      }
      return this.recordToServerRecord(result[0]);
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to get MCP server:", { id, error });
      throw wrapSurrealDBError(error, "get", SurrealDBErrorCode.SELECT_FAILED, { id });
    }
  }

  async getMany(ids: string[]): Promise<Map<string, MCPServerRecord>> {
    const map = new Map<string, MCPServerRecord>();
    if (ids.length === 0) {
      return map;
    }

    try {
      const placeholders = ids.map((_, i) => `$id${i}`).join(",");
      const vars: Record<string, unknown> = {};
      ids.forEach((id, i) => {
        vars[`$id${i}`] = `${TABLE_MCP_SERVERS}:${id}`;
      });

      const result = await this.client
        .query<
          MCPServerSurrealRecord[]
        >(`SELECT * FROM ${TABLE_MCP_SERVERS} WHERE id IN [${placeholders}]`, vars)
        .then((r) => r.flat());

      for (const record of result) {
        const serverRecord = this.recordToServerRecord(record);
        const recordId = typeof record.id === "string" ? record.id : String(record.id || "");
        map.set(recordId.replace(`${TABLE_MCP_SERVERS}:`, ""), serverRecord);
      }

      return map;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to get many MCP servers:", { ids, error });
      throw wrapSurrealDBError(error, "getMany", SurrealDBErrorCode.SELECT_FAILED, { ids });
    }
  }

  async save(entity: MCPServerRecord): Promise<string> {
    const record: Omit<MCPServerSurrealRecord, "id"> = {
      config: entity.config,
      enabled: entity.enabled,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };

    try {
      await this.client.upsert(`${TABLE_MCP_SERVERS}:${entity.id}`, record);
      return entity.id;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to save MCP server:", { id: entity.id, error });
      throw wrapSurrealDBError(error, "save", SurrealDBErrorCode.CREATE_FAILED, {
        id: entity.id,
      });
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.delete(`${TABLE_MCP_SERVERS}:${id}`);
      return true;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to delete MCP server:", { id, error });
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

  async find(query: MCPConfigQuery): Promise<MCPServerRecord[]> {
    const conditions: string[] = [];
    const vars: Record<string, unknown> = {};

    if (query.enabled !== undefined) {
      conditions.push("enabled = $enabled");
      vars["enabled"] = query.enabled ? 1 : 0;
    }

    if (query.serverId) {
      conditions.push("id = $serverId");
      vars["serverId"] = `${TABLE_MCP_SERVERS}:${query.serverId}`;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const result = await this.client
        .query<
          MCPServerSurrealRecord[]
        >(`SELECT * FROM ${TABLE_MCP_SERVERS} ${whereClause}`.trim(), vars)
        .then((r) => r.flat());

      return result.map((record) => this.recordToServerRecord(record));
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to find MCP servers:", { query, error });
      throw wrapSurrealDBError(error, "find", SurrealDBErrorCode.QUERY_FAILED, { query });
    }
  }

  async count(query: MCPConfigQuery): Promise<number> {
    const conditions: string[] = [];
    const vars: Record<string, unknown> = {};

    if (query.enabled !== undefined) {
      conditions.push("enabled = $enabled");
      vars["enabled"] = query.enabled ? 1 : 0;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const result = await this.client
        .query<
          { count: number }[]
        >(`SELECT count() as count FROM ${TABLE_MCP_SERVERS} ${whereClause}`, vars)
        .then((r) => r.flat());
      return result[0]?.count ?? 0;
    } catch (error: unknown) {
      if (isSurrealDBError(error)) {
        throw error;
      }
      logger.error("[SurrealDB] Failed to count MCP servers:", { query, error });
      throw wrapSurrealDBError(error, "count", SurrealDBErrorCode.QUERY_FAILED, { query });
    }
  }

  async getByServerId(serverId: string): Promise<MCPServerRecord | null> {
    return this.get(serverId);
  }

  async getEnabledServers(): Promise<MCPServerRecord[]> {
    return this.find({ enabled: true });
  }

  async exists(serverId: string): Promise<boolean> {
    const server = await this.get(serverId);
    return server !== null;
  }

  async upsertServer(config: MCPServerConfig): Promise<void> {
    const now = Date.now();

    // 使用原子 UPSERT 语句，避免 read-modify-write 竞态
    // created_at = created_at ?? $now 表示：如果已存在则保留原值，否则使用当前时间
    await retry(
      () =>
        this.client.query(
          `UPSERT ${TABLE_MCP_SERVERS}:${config.id} SET
            config = $config,
            enabled = 1,
            created_at = created_at ?? $now,
            updated_at = $now`,
          { config, now }
        ),
      {
        maxRetries: 3,
        initialDelay: 100,
        maxDelay: 5000,
        backoffMultiplier: 2,
        jitter: true,
        shouldRetry: isSurrealDBConflictRetryable,
      }
    );
  }

  private recordToServerRecord(record: MCPServerSurrealRecord): MCPServerRecord {
    const recordId = typeof record.id === "string" ? record.id : String(record.id || "");
    return {
      id: recordId.replace(`${TABLE_MCP_SERVERS}:`, ""),
      config: record.config,
      enabled: record.enabled,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }
}
