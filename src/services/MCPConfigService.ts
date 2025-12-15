/**
 * MCPConfigService - MCP 配置管理服务
 *
 * 负责MCP服务器配置的持久化存储和管理
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { PathService } from './PathService';
import type { MCPServerConfig } from '../types/mcp';

export interface MCPServerRecord {
  id: string;
  config: MCPServerConfig;
  created_at: number;
  updated_at: number;
}

/**
 * MCP 配置服务
 */
export class MCPConfigService {
  private static instance: MCPConfigService;
  private db: Database.Database;
  private dbPath: string;

  private constructor() {
    const pathService = PathService.getInstance();
    const dataDir = pathService.getDataDir();

    // 确保数据目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, 'mcp_servers.db');
    this.db = new Database(this.dbPath);

    // 启用 WAL 模式提升性能
    this.db.pragma('journal_mode = WAL');
    // 启用外键约束
    this.db.pragma('foreign_keys = ON');

    this.initializeDatabase();
    logger.debug(`MCPConfigService initialized (database: ${this.dbPath})`);
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): MCPConfigService {
    if (!MCPConfigService.instance) {
      MCPConfigService.instance = new MCPConfigService();
    }
    return MCPConfigService.instance;
  }

  /**
   * 初始化数据库表结构
   */
  private initializeDatabase(): void {
    this.db.exec(`
      -- MCP 服务器配置表
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        config TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK(enabled IN (0, 1))
      );

      -- 创建索引
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_updated ON mcp_servers(updated_at);
    `);

    logger.debug('[MCPConfigService] Database tables initialized');
  }

  /**
   * 保存 MCP 服务器配置
   */
  saveServer(config: MCPServerConfig): void {
    try {
      const now = Date.now();
      const configJson = JSON.stringify(config);

      const stmt = this.db.prepare(`
        INSERT INTO mcp_servers (id, config, enabled, created_at, updated_at)
        VALUES (@id, @config, 1, @now, @now)
        ON CONFLICT(id) DO UPDATE SET
          config = @config,
          updated_at = @now
      `);

      stmt.run({
        id: config.id,
        config: configJson,
        now
      });

      logger.debug(`[MCPConfigService] Server ${config.id} saved`);
    } catch (error: any) {
      logger.error(`[MCPConfigService] Failed to save server ${config.id}:`, error);
      throw error;
    }
  }

  /**
   * 删除 MCP 服务器配置
   */
  deleteServer(serverId: string): void {
    try {
      const stmt = this.db.prepare('DELETE FROM mcp_servers WHERE id = ?');
      const result = stmt.run(serverId);

      if (result.changes > 0) {
        logger.debug(`[MCPConfigService] Server ${serverId} deleted`);
      } else {
        logger.warn(`[MCPConfigService] Server ${serverId} not found in database`);
      }
    } catch (error: any) {
      logger.error(`[MCPConfigService] Failed to delete server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * 获取所有启用的服务器配置
   */
  getAllServers(): MCPServerRecord[] {
    try {
      const stmt = this.db.prepare(`
        SELECT id, config, created_at, updated_at
        FROM mcp_servers
        WHERE enabled = 1
        ORDER BY updated_at DESC
      `);

      const rows = stmt.all() as Array<{
        id: string;
        config: string;
        created_at: number;
        updated_at: number;
      }>;

      return rows.map(row => ({
        id: row.id,
        config: JSON.parse(row.config),
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
    } catch (error: any) {
      logger.error('[MCPConfigService] Failed to get all servers:', error);
      throw error;
    }
  }

  /**
   * 获取特定服务器配置
   */
  getServer(serverId: string): MCPServerRecord | undefined {
    try {
      const stmt = this.db.prepare(`
        SELECT id, config, created_at, updated_at
        FROM mcp_servers
        WHERE id = ? AND enabled = 1
      `);

      const row = stmt.get(serverId) as {
        id: string;
        config: string;
        created_at: number;
        updated_at: number;
      } | undefined;

      if (!row) {
        return undefined;
      }

      return {
        id: row.id,
        config: JSON.parse(row.config),
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error: any) {
      logger.error(`[MCPConfigService] Failed to get server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * 检查服务器是否存在
   */
  exists(serverId: string): boolean {
    try {
      const stmt = this.db.prepare('SELECT 1 FROM mcp_servers WHERE id = ? AND enabled = 1');
      const row = stmt.get(serverId);
      return !!row;
    } catch (error: any) {
      logger.error(`[MCPConfigService] Failed to check server ${serverId}:`, error);
      return false;
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      logger.debug('[MCPConfigService] Database connection closed');
    }
  }
}
