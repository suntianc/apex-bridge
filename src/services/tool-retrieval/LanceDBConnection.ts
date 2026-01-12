/**
 * LanceDBConnection - Database Connection Management
 *
 * Handles database connection, schema management, and table initialization.
 * Uses connection pooling for improved concurrency and stability.
 */

import * as lancedb from "@lancedb/lancedb";
import { Index } from "@lancedb/lancedb";
import * as arrow from "apache-arrow";
import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../../utils/logger";
import { LanceDBConfig, ConnectionStatus, ToolsTable } from "./types";
import { LanceDBConnectionPool } from "./LanceDBConnectionPool";
import { IndexConfigOptimizer, OptimizationResult } from "./IndexConfigOptimizer";

/**
 * LanceDB Connection interface
 */
export interface ILanceDBConnection {
  connect(config: LanceDBConfig): Promise<void>;
  disconnect(): Promise<void>;
  initializeTable(): Promise<void>;
  getTable(): Promise<lancedb.Table | null>;
  checkSchemaCompatibility(): Promise<boolean>;
  getStatus(): ConnectionStatus;
  getDb(): lancedb.Connection | null;
  addRecords(records: ToolsTable[]): Promise<void>;
  deleteById(id: string): Promise<void>;
  getCount(): Promise<number>;
}

/**
 * LanceDB Connection implementation with connection pooling
 */
export class LanceDBConnection implements ILanceDBConnection {
  private static pool: LanceDBConnectionPool | null = null;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private config: LanceDBConfig | null = null;
  private connected = false;
  private dbPath: string = "";
  private optimizer: IndexConfigOptimizer;

  /**
   * Initialize the optimizer
   */
  constructor() {
    this.optimizer = new IndexConfigOptimizer();
  }

  /**
   * Get the connection pool instance
   */
  static getPool(): LanceDBConnectionPool {
    if (!this.pool) {
      this.pool = new LanceDBConnectionPool();
    }
    return this.pool;
  }

  /**
   * Set a custom connection pool (for testing)
   */
  static setPool(pool: LanceDBConnectionPool): void {
    this.pool = pool;
  }

  /**
   * Reset the pool (for testing)
   */
  static resetPool(): void {
    this.pool = null;
  }

  /**
   * Connect to LanceDB using connection pool
   */
  async connect(config: LanceDBConfig): Promise<void> {
    try {
      // Ensure database directory exists
      await fs.mkdir(config.databasePath, { recursive: true });

      this.dbPath = config.databasePath;
      this.db = await LanceDBConnection.getPool().getConnection(config.databasePath);
      this.config = config;
      this.connected = true;

      logger.info(`[LanceDB] Connected to LanceDB at: ${config.databasePath}`);
    } catch (error) {
      logger.error("[LanceDB] Failed to connect to LanceDB:", error);
      this.connected = false;
      throw error;
    }
  }

  /**
   * Disconnect from LanceDB
   */
  async disconnect(): Promise<void> {
    try {
      this.table = null;
      if (this.dbPath && this.db) {
        await LanceDBConnection.getPool().releaseConnection(this.dbPath);
      }
      this.db = null;
      this.connected = false;
      logger.info("[LanceDB] Disconnected from LanceDB");
    } catch (error) {
      logger.warn("[LanceDB] Error during disconnect:", error);
    }
  }

  /**
   * Initialize the skills table
   */
  async initializeTable(): Promise<void> {
    if (!this.db || !this.config) {
      throw new Error("Database not connected");
    }

    try {
      const tableName = this.config.tableName;

      // Try to open existing table
      try {
        this.table = await this.db.openTable(tableName);
        logger.info(`[LanceDB] Table '${tableName}' exists, checking dimensions...`);

        // Check if dimensions match
        const dimensionsMatch = await this.checkTableDimensions();
        logger.info(`[LanceDB] Dimension check: ${dimensionsMatch ? "MATCH" : "MISMATCH"}`);

        if (!dimensionsMatch) {
          // Dimensions don't match, need to recreate
          logger.warn(
            `[LanceDB] Table dimensions mismatch. Dropping and recreating table: ${tableName}`
          );
          await this.dropTableCompletely(tableName);
          await this.createTable();
        } else {
          // Dimensions match, check for missing fields (MCP support)
          await this.checkAndAddMissingFields(tableName);
          await this.createVectorIndex();
        }

        return;
      } catch (openError) {
        logger.info(`[LanceDB] Table '${tableName}' does not exist, will create new table`);
      }

      // Create new table
      await this.createTable();
    } catch (error) {
      logger.error("[LanceDB] Failed to initialize table:", error);
      throw error;
    }
  }

  /**
   * Create the table with schema
   */
  private async createTable(): Promise<void> {
    if (!this.db || !this.config) {
      throw new Error("Database not connected");
    }

    // Create schema with Apache Arrow
    const schema = new arrow.Schema([
      new arrow.Field("id", new arrow.Utf8(), false),
      new arrow.Field("name", new arrow.Utf8(), false),
      new arrow.Field("description", new arrow.Utf8(), false),
      new arrow.Field(
        "tags",
        new arrow.List(new arrow.Field("item", new arrow.Utf8(), true)),
        false
      ),
      new arrow.Field("path", new arrow.Utf8(), true),
      new arrow.Field("version", new arrow.Utf8(), true),
      new arrow.Field("source", new arrow.Utf8(), true),
      new arrow.Field("toolType", new arrow.Utf8(), false),
      new arrow.Field("metadata", new arrow.Utf8(), false),
      new arrow.Field(
        "vector",
        new arrow.FixedSizeList(
          this.config.vectorDimensions,
          new arrow.Field("item", new arrow.Float32(), true)
        ),
        false
      ),
      new arrow.Field("indexedAt", new arrow.Timestamp(arrow.TimeUnit.MICROSECOND), false),
    ]);

    this.table = await this.db.createTable(this.config.tableName, [], { schema });
    logger.info(
      `[LanceDB] Created new table: ${this.config.tableName} with ${this.config.vectorDimensions} dimensions`
    );

    // Create vector index
    await this.createVectorIndex();
  }

  /**
   * Check table dimensions compatibility
   */
  private async checkTableDimensions(): Promise<boolean> {
    if (!this.db || !this.table || !this.config) {
      return false;
    }

    try {
      // Create a test vector
      const testVector = new Array(this.config.vectorDimensions).fill(0.1);

      // Try to add a temporary record
      const tempId = `dimension-check-${Date.now()}`;
      const tempTable = await this.db.openTable(this.config.tableName);

      try {
        await tempTable.add([
          {
            id: tempId,
            name: "Dimension Check",
            description: "Temporary record for dimension validation",
            tags: [],
            path: "temp",
            version: "1.0",
            metadata: JSON.stringify({}),
            vector: testVector,
            indexedAt: new Date(),
          },
        ]);

        // If successful, delete test record
        await tempTable.delete(`id = '${tempId}'`);
        return true;
      } catch (insertError: any) {
        const errorMsg = insertError.message || "";
        if (
          errorMsg.includes("dimension") ||
          errorMsg.includes("length") ||
          errorMsg.includes("schema") ||
          errorMsg.includes("FixedSizeList")
        ) {
          logger.debug("[LanceDB] Dimension mismatch error:", errorMsg);
          return false;
        }
        throw insertError;
      }
    } catch (error) {
      logger.error("[LanceDB] Failed to check table dimensions:", error);
      return false;
    }
  }

  /**
   * Check and add missing fields (for MCP support)
   */
  private async checkAndAddMissingFields(tableName: string): Promise<void> {
    if (!this.table || !this.config) {
      return;
    }

    try {
      const testVector = new Array(this.config.vectorDimensions).fill(0.0);

      const testRecord = {
        id: `field-check-${Date.now()}`,
        name: "Field Check",
        description: "Checking for missing fields",
        tags: [],
        path: null,
        version: null,
        source: null,
        toolType: "mcp",
        metadata: "{}",
        vector: testVector,
        indexedAt: new Date(),
      };

      await this.table.add([testRecord]);
      logger.info("[LanceDB] All fields (including MCP fields) are present");

      // Delete test record
      await this.table.delete(`id == "${testRecord.id}"`);
    } catch (error: any) {
      if (error.message && error.message.includes("Found field not in schema")) {
        logger.warn("[LanceDB] Table is missing MCP-related fields. Recreating table...");

        // Drop and recreate
        await this.dropTableCompletely(tableName);
        await this.createTable();
      } else {
        throw error;
      }
    }
  }

  /**
   * Drop table and completely remove physical files
   * This ensures no leftover .lance files cause "Not found" errors
   */
  private async dropTableCompletely(tableName: string): Promise<void> {
    if (!this.db || !this.config) {
      throw new Error("Database not connected");
    }

    try {
      // First, drop the table from LanceDB
      await this.db.dropTable(tableName);
      logger.info(`[LanceDB] Dropped table: ${tableName}`);

      // Then, manually remove physical files to ensure complete cleanup
      const tablePath = path.join(this.config.databasePath, tableName);
      try {
        await fs.rm(tablePath, { recursive: true, force: true });
        logger.info(`[LanceDB] Completely removed physical files: ${tablePath}`);
      } catch (rmError: any) {
        if (rmError.code !== "ENOENT") {
          logger.warn(
            `[LanceDB] Failed to remove physical files (may not exist): ${rmError.message}`
          );
        }
      }
    } catch (error) {
      logger.error("[LanceDB] Failed to drop table completely:", error);
      throw error;
    }
  }

  /**
   * Create vector index for faster search
   * Uses optimized IVF_PQ configuration based on expected data scale
   */
  private async createVectorIndex(rowCount?: number): Promise<void> {
    if (!this.table || !this.config) {
      return;
    }

    try {
      // Use provided row count or estimate from table
      const estimatedRows = rowCount || (await this.getCount()) || 10000;
      const dimension = this.config.vectorDimensions;

      // Calculate optimal configuration
      const optimizationResult = this.optimizer.calculateOptimalConfig(
        estimatedRows,
        dimension,
        0.95, // target recall
        false // prefer accuracy over speed
      );

      // Log the optimization reasoning
      logger.info(`[LanceDB] ${optimizationResult.reasoning}`);

      // Create index with optimized configuration
      await this.table.createIndex("vector", {
        config: Index.ivfPq({
          numPartitions: optimizationResult.config.numPartitions,
          numSubVectors: optimizationResult.config.numSubVectors,
        }),
        replace: true,
      });

      logger.info(
        `[LanceDB] Created optimized vector index: ${optimizationResult.config.numPartitions} partitions, ` +
          `${optimizationResult.config.numSubVectors} sub-vectors, ` +
          `est. recall: ${(optimizationResult.estimatedRecall * 100).toFixed(1)}%`
      );
    } catch (error) {
      // Index may already exist, ignore error
      logger.debug("[LanceDB] Vector index may already exist:", error);
    }
  }

  /**
   * Get table instance
   */
  async getTable(): Promise<lancedb.Table | null> {
    return this.table;
  }

  /**
   * Get database instance
   */
  getDb(): lancedb.Connection | null {
    return this.db;
  }

  /**
   * Check schema compatibility
   */
  async checkSchemaCompatibility(): Promise<boolean> {
    return this.checkTableDimensions();
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus {
    return {
      connected: this.connected,
      lastConnected: this.connected ? new Date() : undefined,
      error: this.connected ? undefined : "Not connected",
    };
  }

  /**
   * Add records to table
   */
  async addRecords(records: ToolsTable[]): Promise<void> {
    if (!this.table) {
      throw new Error("Table not initialized");
    }

    await this.table.add(records as unknown as Record<string, unknown>[]);
  }

  /**
   * Delete record by ID
   */
  async deleteById(id: string): Promise<void> {
    if (!this.table) {
      throw new Error("Table not initialized");
    }

    await this.table.delete(`id = "${id}"`);
  }

  /**
   * Get table count
   */
  async getCount(): Promise<number> {
    if (!this.table) {
      return 0;
    }

    try {
      return await this.table.countRows();
    } catch (error) {
      logger.warn("[LanceDB] Failed to get table count:", error);
      return 0;
    }
  }
}
