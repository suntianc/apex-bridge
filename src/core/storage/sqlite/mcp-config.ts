/**
 * SQLite MCP Config Storage Adapter
 *
 * Implements IMCPConfigStorage interface using MCPConfigService.
 */

import type { IMCPConfigStorage, MCPConfigQuery, MCPServerRecord } from "../interfaces";
import type { MCPServerConfig } from "../../../types/mcp";
import { MCPConfigService } from "../../../services/MCPConfigService";
import { logger } from "../../../utils/logger";

export class SQLiteMCPConfigStorage implements IMCPConfigStorage {
  private service: MCPConfigService;

  constructor() {
    this.service = MCPConfigService.getInstance();
  }

  async get(id: string): Promise<MCPServerRecord | null> {
    try {
      const record = await this.service.getServer(id);
      if (!record) {
        return null;
      }
      return {
        id: record.id,
        config: record.config,
        enabled: 1,
        created_at: record.created_at,
        updated_at: record.updated_at,
      };
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get MCP server:", { id, error });
      throw error;
    }
  }

  async getMany(ids: string[]): Promise<Map<string, MCPServerRecord>> {
    const map = new Map<string, MCPServerRecord>();
    if (ids.length === 0) {
      return map;
    }

    try {
      const allServers = await this.service.getAllServers();
      for (const record of allServers) {
        if (ids.includes(record.id)) {
          map.set(record.id, {
            id: record.id,
            config: record.config,
            enabled: 1,
            created_at: record.created_at,
            updated_at: record.updated_at,
          });
        }
      }
      return map;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get many MCP servers:", { ids, error });
      throw error;
    }
  }

  async save(entity: MCPServerRecord): Promise<string> {
    try {
      await this.service.saveServer(entity.config);
      return entity.id;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to save MCP server:", { id: entity.id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.service.deleteServer(id);
      return true;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to delete MCP server:", { id, error });
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
    try {
      let servers = await this.service.getAllServers();

      if (query.serverId) {
        servers = servers.filter((s) => s.id === query.serverId);
      }

      return servers.map((s) => ({
        id: s.id,
        config: s.config,
        enabled: 1,
        created_at: s.created_at,
        updated_at: s.updated_at,
      }));
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to find MCP servers:", { query, error });
      throw error;
    }
  }

  async count(query: MCPConfigQuery): Promise<number> {
    try {
      let servers = await this.service.getAllServers();
      return servers.length;
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to count MCP servers:", { query, error });
      throw error;
    }
  }

  async getByServerId(serverId: string): Promise<MCPServerRecord | null> {
    return this.get(serverId);
  }

  async getEnabledServers(): Promise<MCPServerRecord[]> {
    try {
      const servers = await this.service.getAllServers();
      return servers.map((s) => ({
        id: s.id,
        config: s.config,
        enabled: 1,
        created_at: s.created_at,
        updated_at: s.updated_at,
      }));
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to get enabled servers:", { error });
      throw error;
    }
  }

  async exists(serverId: string): Promise<boolean> {
    const server = await this.service.getServer(serverId);
    return server !== undefined;
  }

  async upsertServer(config: MCPServerConfig): Promise<void> {
    try {
      await this.service.saveServer(config);
    } catch (error: unknown) {
      logger.error("[SQLite] Failed to upsert server:", { id: config.id, error });
      throw error;
    }
  }
}
