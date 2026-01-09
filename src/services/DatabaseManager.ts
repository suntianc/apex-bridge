/**
 * DatabaseManager - 数据库连接管理器
 * 统一管理所有 SQLite 数据库连接
 */

import Database from "better-sqlite3";
import { logger } from "../utils/logger";
import { PathService } from "./PathService";

export interface DatabaseConfig {
  name: string;
  path: string;
  options?: {
    wal?: boolean;
    foreignKeys?: boolean;
  };
}

export class DatabaseManager {
  private static _instance: DatabaseManager | null = null;
  private connections: Map<string, Database.Database> = new Map();
  private configs: Map<string, DatabaseConfig> = new Map();

  private constructor() {
    this.initializeDefaultDatabases();
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager._instance) {
      DatabaseManager._instance = new DatabaseManager();
    }
    return DatabaseManager._instance;
  }

  /**
   * 初始化默认数据库配置
   */
  private initializeDefaultDatabases(): void {
    const pathService = PathService.getInstance();
    const dataPath = pathService.getDataDir();

    this.register({
      name: "llm_config",
      path: `${dataPath}/llm_config.db`,
      options: { wal: true, foreignKeys: true },
    });

    this.register({
      name: "conversations",
      path: `${dataPath}/conversations.db`,
      options: { wal: true, foreignKeys: true },
    });

    this.register({
      name: "mcp_servers",
      path: `${dataPath}/mcp_servers.db`,
      options: { wal: true, foreignKeys: true },
    });

    this.register({
      name: "trajectory",
      path: `${dataPath}/trajectory.db`,
      options: { wal: true, foreignKeys: true },
    });

    logger.debug("[DatabaseManager] Initialized default database configurations");
  }

  /**
   * 注册数据库配置
   */
  register(config: DatabaseConfig): void {
    this.configs.set(config.name, config);
    logger.debug(`[DatabaseManager] Registered database: ${config.name}`);
  }

  /**
   * 获取数据库连接
   */
  getConnection(name: string): Database.Database {
    if (!this.connections.has(name)) {
      const config = this.configs.get(name);
      if (!config) {
        throw new Error(`Database not registered: ${name}`);
      }
      this.connections.set(name, this.createConnection(config));
    }
    return this.connections.get(name)!;
  }

  /**
   * 创建数据库连接
   */
  private createConnection(config: DatabaseConfig): Database.Database {
    const db = new Database(config.path);

    if (config.options?.wal !== false) {
      db.pragma("journal_mode = WAL");
    }

    if (config.options?.foreignKeys !== false) {
      db.pragma("foreign_keys = ON");
    }

    logger.debug(`[DatabaseManager] Connected to ${config.name}: ${config.path}`);
    return db;
  }

  /**
   * 检查数据库连接是否存在
   */
  hasConnection(name: string): boolean {
    return this.connections.has(name);
  }

  /**
   * 关闭指定数据库连接
   */
  async close(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (connection) {
      connection.close();
      this.connections.delete(name);
      logger.debug(`[DatabaseManager] Closed connection: ${name}`);
    }
  }

  /**
   * 关闭所有数据库连接
   */
  async closeAll(): Promise<void> {
    for (const [name, connection] of this.connections) {
      connection.close();
      logger.debug(`[DatabaseManager] Closed connection: ${name}`);
    }
    this.connections.clear();
  }

  /**
   * 获取所有已注册的数据库名称
   */
  getDatabaseNames(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * 获取所有活动连接数量
   */
  getActiveConnectionCount(): number {
    return this.connections.size;
  }
}
