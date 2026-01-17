/**
 * MCPConfigService - MCP 配置管理服务
 *
 * 负责MCP服务器配置的持久化存储和管理
 * 直接使用 better-sqlite3，不通过 IMCPConfigStorage 避免循环依赖
 */

import type { MCPServerRecord } from "../core/storage/interfaces";
import type { MCPServerConfig } from "../types/mcp";
import { logger } from "../utils/logger";
import Database from "better-sqlite3";
import path from "path";

// 获取数据库路径
function getMcpDbPath(): string {
  const dataDir = process.env.APEX_BRIDGE_DATA_DIR || ".data";
  return path.join(dataDir, "mcp_servers.db");
}

export class MCPConfigService {
  private static instance: MCPConfigService | null = null;
  private db: Database.Database;
  private initialized: boolean = false;

  private constructor() {
    const dbPath = getMcpDbPath();
    this.db = new Database(dbPath);
    this.initializeDb();
    logger.debug("[MCPConfigService] Initialized with SQLite");
  }

  private initializeDb(): void {
    if (this.initialized) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        config TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK(enabled IN (0, 1))
      )
    `);
    this.initialized = true;
  }

  public static async initialize(): Promise<void> {
    if (!MCPConfigService.instance) {
      MCPConfigService.instance = new MCPConfigService();
    }
  }

  public static getInstance(): MCPConfigService {
    if (!MCPConfigService.instance) {
      throw new Error("[MCPConfigService] Not initialized. Call initialize() first.");
    }
    return MCPConfigService.instance;
  }

  public static resetInstance(): void {
    if (MCPConfigService.instance?.db) {
      MCPConfigService.instance.db.close();
    }
    MCPConfigService.instance = null;
  }

  async saveServer(config: MCPServerConfig): Promise<void> {
    try {
      const now = Date.now();
      const configJson = JSON.stringify(config);

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO mcp_servers (id, config, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      const existing = this.db
        .prepare("SELECT created_at, enabled FROM mcp_servers WHERE id = ?")
        .get(config.id) as { created_at: number; enabled: number } | undefined;
      const created_at = existing?.created_at || now;
      const enabled = existing?.enabled ?? 1; // Preserve existing enabled status or default to 1

      stmt.run(config.id, configJson, enabled, created_at, now);
      logger.debug(`[MCPConfigService] Server ${config.id} saved`);
    } catch (error: unknown) {
      logger.error(`[MCPConfigService] Failed to save server ${config.id}:`, error);
      throw error;
    }
  }

  async deleteServer(serverId: string): Promise<void> {
    try {
      const stmt = this.db.prepare("DELETE FROM mcp_servers WHERE id = ?");
      stmt.run(serverId);
      logger.debug(`[MCPConfigService] Server ${serverId} deleted`);
    } catch (error: unknown) {
      logger.error(`[MCPConfigService] Failed to delete server ${serverId}:`, error);
      throw error;
    }
  }

  async getAllServers(): Promise<MCPServerRecord[]> {
    try {
      const rows = this.db.prepare("SELECT * FROM mcp_servers").all() as Array<{
        id: string;
        config: string;
        enabled: number;
        created_at: number;
        updated_at: number;
      }>;

      return rows.map((row) => ({
        id: row.id,
        config: JSON.parse(row.config),
        enabled: row.enabled,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    } catch (error: unknown) {
      logger.error("[MCPConfigService] Failed to get all servers:", error);
      throw error;
    }
  }

  async getServer(serverId: string): Promise<MCPServerRecord | undefined> {
    try {
      const row = this.db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(serverId) as
        | {
            id: string;
            config: string;
            enabled: number;
            created_at: number;
            updated_at: number;
          }
        | undefined;

      if (!row) return undefined;

      return {
        id: row.id,
        config: JSON.parse(row.config),
        enabled: row.enabled,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    } catch (error: unknown) {
      logger.error(`[MCPConfigService] Failed to get server ${serverId}:`, error);
      throw error;
    }
  }

  async exists(serverId: string): Promise<boolean> {
    try {
      const row = this.db.prepare("SELECT 1 FROM mcp_servers WHERE id = ?").get(serverId);
      return !!row;
    } catch (error: unknown) {
      logger.error(`[MCPConfigService] Failed to check server ${serverId}:`, error);
      return false;
    }
  }
}
