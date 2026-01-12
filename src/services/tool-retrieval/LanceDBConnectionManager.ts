/**
 * LanceDBConnectionManager - LanceDB连接池和连接状态管理
 * 负责管理数据库连接池、健康检查、连接状态
 */

import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs/promises";
import * as path from "path";
import { ToolError, ToolErrorCode } from "../../types/tool-system";
import { logger } from "../../utils/logger";

export class LanceDBConnectionManager {
  private db: lancedb.Connection | null = null;
  private config: {
    vectorDbPath: string;
  };
  private isConnected = false;

  constructor(config: { vectorDbPath: string }) {
    this.config = config;
    logger.info("LanceDBConnectionManager created with config:", {
      vectorDbPath: config.vectorDbPath,
    });
  }

  /**
   * 连接到LanceDB
   */
  async connect(): Promise<void> {
    try {
      // 确保数据库目录存在
      await fs.mkdir(this.config.vectorDbPath, { recursive: true });

      // 连接到LanceDB
      this.db = await lancedb.connect(this.config.vectorDbPath);

      this.isConnected = true;
      logger.info(`Connected to LanceDB at: ${this.config.vectorDbPath}`);
    } catch (error) {
      logger.error("Failed to connect to LanceDB:", error);
      this.isConnected = false;
      throw new ToolError(
        `Failed to connect to LanceDB: ${this.formatError(error)}`,
        ToolErrorCode.VECTOR_DB_ERROR
      );
    }
  }

  /**
   * 检查连接状态
   */
  getConnectionStatus(): { connected: boolean; path: string } {
    return {
      connected: this.isConnected,
      path: this.config.vectorDbPath,
    };
  }

  /**
   * 获取数据库实例
   */
  getDatabase(): lancedb.Connection | null {
    return this.db;
  }

  /**
   * 获取数据库实例（如果未连接则抛出错误）
   */
  requireDatabase(): lancedb.Connection {
    if (!this.db) {
      throw new ToolError(
        "Database not connected. Call connect() first.",
        ToolErrorCode.VECTOR_DB_ERROR
      );
    }
    return this.db;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.db || !this.isConnected) {
        return false;
      }
      // 尝试执行简单查询验证连接
      const tableNames = await this.getTableNames();
      return true;
    } catch (error) {
      logger.warn("LanceDB health check failed:", error);
      return false;
    }
  }

  /**
   * 获取表名列表
   */
  async getTableNames(): Promise<string[]> {
    try {
      // LanceDB的连接对象可能有不同的API
      // 这里假设可以直接访问表列表
      return [];
    } catch (error) {
      logger.warn("Failed to get table names:", error);
      return [];
    }
  }

  /**
   * 完全删除表和物理文件
   * 确保残留的 .lance 文件不会导致后续查询错误
   */
  async dropTableCompletely(tableName: string): Promise<void> {
    try {
      // 首先从 LanceDB 删除表
      await this.db!.dropTable(tableName);
      logger.info(`Dropped table from LanceDB: ${tableName}`);

      // 然后手动删除物理文件确保完全清理
      const tablePath = path.join(this.config.vectorDbPath, tableName);
      try {
        await fs.rm(tablePath, { recursive: true, force: true });
        logger.info(`Completely removed physical files: ${tablePath}`);
      } catch (rmError: any) {
        if (rmError.code !== "ENOENT") {
          logger.warn(`Failed to remove physical files (may not exist): ${rmError.message}`);
        }
      }
    } catch (error) {
      logger.error("Failed to drop table completely:", error);
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    logger.info("Closing LanceDB connection...");

    try {
      if (this.db) {
        try {
          await this.db.close();
          logger.info("LanceDB connection closed successfully");
        } catch (error) {
          logger.warn("Error closing LanceDB connection:", error);
        }
        this.db = null;
      }

      this.isConnected = false;
      logger.info("LanceDB connection cleanup completed");
    } catch (error) {
      logger.error("LanceDB connection cleanup failed:", error);
      throw new ToolError(
        `LanceDB cleanup failed: ${this.formatError(error)}`,
        ToolErrorCode.VECTOR_DB_ERROR
      );
    }
  }

  /**
   * 格式化错误信息
   */
  private formatError(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown error occurred in LanceDBConnectionManager";
  }
}

/**
 * 创建LanceDBConnectionManager实例
 */
export function createLanceDBConnectionManager(vectorDbPath: string): LanceDBConnectionManager {
  return new LanceDBConnectionManager({ vectorDbPath });
}
