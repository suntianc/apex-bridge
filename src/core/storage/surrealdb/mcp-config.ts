/**
 * SurrealDB MCP Config Storage Adapter
 *
 * Implements IMCPConfigStorage interface using SurrealDB as the backend.
 */

import { SurrealDBClient } from "./client";
import type { IMCPConfigStorage, MCPConfigQuery, MCPServerRecord } from "../interfaces";
import type { MCPServerConfig } from "../../../types/mcp";
import { logger } from "../../../utils/logger";

const TABLE_MCP_SERVERS = "mcp_servers";

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
      logger.error("[SurrealDB] Failed to get MCP server:", { id, error });
      throw error;
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

      const result = await this.client.query<MCPServerSurrealRecord[]>(
        `SELECT * FROM ${TABLE_MCP_SERVERS} WHERE id IN [${placeholders}]`,
        vars
      );

      for (const record of result) {
        const serverRecord = this.recordToServerRecord(record);
        const recordId = typeof record.id === "string" ? record.id : String(record.id || "");
        map.set(recordId.replace(`${TABLE_MCP_SERVERS}:`, ""), serverRecord);
      }

      return map;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to get many MCP servers:", { ids, error });
      throw error;
    }
  }

  async save(entity: MCPServerRecord): Promise<string> {
    const record: MCPServerSurrealRecord = {
      id: `${TABLE_MCP_SERVERS}:${entity.id}`,
      config: entity.config,
      enabled: entity.enabled,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };

    try {
      await this.client.create(`${TABLE_MCP_SERVERS}:${entity.id}`, record);
      return entity.id;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to save MCP server:", { id: entity.id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.delete(`${TABLE_MCP_SERVERS}:${id}`);
      return true;
    } catch (error: unknown) {
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
      const result = await this.client.query<MCPServerSurrealRecord[]>(
        `SELECT * FROM ${TABLE_MCP_SERVERS} ${whereClause}`.trim(),
        vars
      );

      return result.map((record) => this.recordToServerRecord(record));
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to find MCP servers:", { query, error });
      throw error;
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
      const result = await this.client.query<{ count: number }[]>(
        `SELECT count() as count FROM ${TABLE_MCP_SERVERS} ${whereClause}`,
        vars
      );
      return result[0]?.count ?? 0;
    } catch (error: unknown) {
      logger.error("[SurrealDB] Failed to count MCP servers:", { query, error });
      throw error;
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
    const existing = await this.get(config.id);
    const now = Date.now();

    const record: MCPServerRecord = {
      id: config.id,
      config,
      enabled: 1,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };

    await this.save(record);
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
