/**
 * VectorIndexManager - 向量索引操作管理
 * 负责索引创建、查询、更新、删除操作
 */

import * as arrow from "apache-arrow";
import * as lancedb from "@lancedb/lancedb";
import { Index } from "@lancedb/lancedb";
import { ToolError, ToolErrorCode } from "../../types/tool-system";
import { logger } from "../../utils/logger";
import { IndexConfigOptimizer } from "./IndexConfigOptimizer";
import { LanceDBConnectionManager } from "./LanceDBConnectionManager";

export interface VectorIndexConfig {
  numPartitions: number;
  numSubVectors: number;
}

export interface VectorSearchOptions {
  queryVector: number[];
  limit?: number;
  distanceType?: "cosine" | "l2" | "dot";
}

export interface VectorSearchResult {
  data: any[];
  rowCount: number;
}

export class VectorIndexManager {
  private connectionManager: LanceDBConnectionManager;
  private table: lancedb.Table | null = null;
  private dimensions: number;
  private optimizer: IndexConfigOptimizer;

  constructor(connectionManager: LanceDBConnectionManager, dimensions: number) {
    this.connectionManager = connectionManager;
    this.dimensions = dimensions;
    this.optimizer = new IndexConfigOptimizer();
    logger.info("VectorIndexManager created", {
      dimensions,
    });
  }

  /**
   * 初始化向量表
   */
  async initializeTable(tableName: string): Promise<lancedb.Table> {
    const db = this.connectionManager.requireDatabase();

    try {
      // 尝试直接打开表，如果失败则说明表不存在
      try {
        this.table = await db.openTable(tableName);
        logger.info(`Table '${tableName}' exists, checking dimensions...`);

        // 表已存在，检查维度是否匹配
        const dimensionsMatch = await this.checkTableDimensions(tableName);
        logger.info(`Dimension check result: ${dimensionsMatch ? "MATCH" : "MISMATCH"}`);

        if (!dimensionsMatch) {
          // 维度不匹配，需要重新创建表
          logger.warn(`Table dimensions mismatch. Dropping and recreating table: ${tableName}`);

          // 完全删除旧表（包括物理文件）
          await this.connectionManager.dropTableCompletely(tableName);

          // 继续创建新表
        } else {
          // 维度匹配，使用现有表
          logger.info(`Using existing table: ${tableName}`);

          // 获取表中的记录数
          const count = await this.getTableCount();
          logger.info(`Table contains ${count} vector records`);

          // 检查是否需要添加新字段（MCP支持）
          await this.checkAndAddMissingFields(tableName);

          const rowCount = await this.getTableCount();
          if (rowCount > 0) {
            await this.createVectorIndex();
          }
          return this.table;
        }
      } catch (openError: any) {
        // 表不存在，继续创建新表
        logger.info(
          `Table '${tableName}' does not exist (${openError.message}), will create new table`
        );
      }

      // 创建新表 - 使用 Apache Arrow Schema（支持 Skills 和 MCP 工具）
      const schema = new arrow.Schema([
        new arrow.Field("id", new arrow.Utf8(), false),
        new arrow.Field("name", new arrow.Utf8(), false),
        new arrow.Field("description", new arrow.Utf8(), false),
        new arrow.Field(
          "tags",
          new arrow.List(new arrow.Field("item", new arrow.Utf8(), true)),
          false
        ),
        new arrow.Field("path", new arrow.Utf8(), true), // 可选，Skill 才有
        new arrow.Field("version", new arrow.Utf8(), true), // 可选，Skill 才有
        new arrow.Field("source", new arrow.Utf8(), true), // MCP 服务器 ID 或 skill 名称
        new arrow.Field("toolType", new arrow.Utf8(), false), // 'skill' | 'mcp'
        new arrow.Field("metadata", new arrow.Utf8(), false), // 对象存储为JSON字符串
        new arrow.Field(
          "vector",
          new arrow.FixedSizeList(
            this.dimensions,
            new arrow.Field("item", new arrow.Float32(), true)
          ),
          false
        ),
        new arrow.Field("indexedAt", new arrow.Timestamp(arrow.TimeUnit.MICROSECOND), false),
      ]);

      // 创建空表
      this.table = await db.createTable(tableName, [], { schema });

      logger.info(`Created new table: ${tableName} with ${this.dimensions} dimensions`);

      const rowCount = await this.getTableCount();
      if (rowCount > 0) {
        await this.createVectorIndex();
      }

      return this.table;
    } catch (error) {
      logger.error("Failed to initialize vector table:", error);
      throw error;
    }
  }

  /**
   * 检查表的向量维度是否匹配
   */
  async checkTableDimensions(tableName: string): Promise<boolean> {
    try {
      logger.debug(`Checking table dimensions for: ${tableName}`);

      // 打开表
      const tempTable = await this.connectionManager.requireDatabase().openTable(tableName);

      // 从表的 schema 中获取实际的向量维度
      const actualDimension = await this.getTableVectorDimension(tempTable);

      if (actualDimension === null) {
        logger.warn(`Could not determine vector dimension from table schema`);
        return false;
      }

      const configDimension = this.dimensions;
      const matches = actualDimension === configDimension;

      if (matches) {
        logger.info(`Table dimensions match: config=${configDimension}, actual=${actualDimension}`);
      } else {
        logger.info(
          `Table dimensions mismatch: config=${configDimension}, actual=${actualDimension}`
        );
      }

      return matches;
    } catch (error) {
      logger.error("Failed to check table dimensions:", error);
      return false;
    }
  }

  /**
   * 从表的 schema 中获取向量字段的维度
   */
  private async getTableVectorDimension(table: lancedb.Table): Promise<number | null> {
    try {
      // 获取表的 Arrow schema
      const schema = await table.schema();

      // 查找 vector 字段
      const vectorField = schema.fields.find((f: { name: string }) => f.name === "vector");

      if (!vectorField) {
        logger.warn("No vector field found in table schema");
        return null;
      }

      // FixedSizeList 类型在 Arrow 中表示向量
      const type = vectorField.type;

      // 检查是否是 FixedSizeList 类型
      if (type && typeof type === "object" && "children" in type) {
        if (Array.isArray((type as { children: unknown }).children)) {
          const dimensionValue = (
            type as { children: [unknown, { value?: number; length?: number }] }
          ).children;
          if (dimensionValue[1] && typeof dimensionValue[1] === "object") {
            return dimensionValue[1].value || dimensionValue[1].length || null;
          }
        }
      }

      // 备选方案：直接从 type 对象获取维度
      if ("numChildren" in type) {
        return (type as { numChildren: number }).numChildren;
      }

      logger.warn(`Unknown vector field type: ${JSON.stringify(type)}`);
      return null;
    } catch (error) {
      logger.error("Failed to get table vector dimension:", error);
      return null;
    }
  }

  /**
   * 检查并添加缺失的字段（为MCP支持）
   */
  private async checkAndAddMissingFields(tableName: string): Promise<void> {
    try {
      if (!this.table) {
        return;
      }

      // 尝试插入一个包含所有字段的测试记录
      const testVector = new Array(this.dimensions).fill(0.0);

      const testRecord = {
        id: `field-check-${Date.now()}`,
        name: "Field Check",
        description: "Checking for missing fields",
        tags: [],
        path: null,
        version: null,
        source: null, // MCP 字段
        toolType: "mcp", // MCP 字段
        metadata: "{}",
        vector: testVector,
        indexedAt: new Date(),
      };

      await this.table.add([testRecord]);
      logger.info("All fields (including MCP fields) are present");

      // 删除测试记录
      await this.table.delete(`id == "${testRecord.id}"`);
    } catch (error: any) {
      // 检查是否是字段缺失错误
      if (error.message && error.message.includes("Found field not in schema")) {
        logger.warn("Table is missing MCP-related fields. Recreating table...");

        // 删除旧表并重新创建
        await this.connectionManager.requireDatabase().dropTable(tableName);
        logger.info(`Dropped existing table for recreation: ${tableName}`);

        // 重新创建表
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
          new arrow.Field("source", new arrow.Utf8(), true), // MCP 服务器 ID 或 skill 名称
          new arrow.Field("toolType", new arrow.Utf8(), false), // 'skill' | 'mcp'
          new arrow.Field("metadata", new arrow.Utf8(), false),
          new arrow.Field(
            "vector",
            new arrow.FixedSizeList(
              this.dimensions,
              new arrow.Field("item", new arrow.Float32(), true)
            ),
            false
          ),
          new arrow.Field("indexedAt", new arrow.Timestamp(arrow.TimeUnit.MICROSECOND), false),
        ]);

        this.table = await this.connectionManager.requireDatabase().createTable(tableName, [], {
          schema,
        });
        logger.info(`Recreated table: ${tableName} with MCP support`);

        // 重新创建索引
        await this.createVectorIndex();
      } else {
        // 其他错误，重新抛出
        throw error;
      }
    }
  }

  /**
   * 创建向量索引
   */
  async createVectorIndex(): Promise<void> {
    if (!this.table) {
      return;
    }

    try {
      const rowCount = await this.table.countRows();
      const dimension = this.dimensions;

      const optimizationResult = this.optimizer.calculateOptimalConfig(
        rowCount,
        dimension,
        0.95,
        false
      );

      logger.info(`[VectorIndexManager] ${optimizationResult.reasoning}`);

      await this.table.createIndex("vector", {
        config: Index.ivfPq({
          numPartitions: optimizationResult.config.numPartitions,
          numSubVectors: optimizationResult.config.numSubVectors,
        }),
        replace: true,
      });

      logger.info(
        `[VectorIndexManager] Created optimized vector index: ${optimizationResult.config.numPartitions} partitions, ` +
          `${optimizationResult.config.numSubVectors} sub-vectors, ` +
          `est. recall: ${(optimizationResult.estimatedRecall * 100).toFixed(1)}%`
      );
    } catch (error) {
      logger.debug("Vector index may already exist:", error);
    }
  }

  /**
   * 获取表的记录数
   */
  async getTableCount(): Promise<number> {
    try {
      if (!this.table) {
        return 0;
      }

      // 使用count查询
      const count = await this.table.countRows();
      return count;
    } catch (error) {
      logger.warn("Failed to get table count:", error);
      return 0;
    }
  }

  /**
   * 执行向量搜索
   */
  async search(options: VectorSearchOptions): Promise<VectorSearchResult> {
    if (!this.table) {
      throw new ToolError(
        "Vector table is not initialized. Call initializeTable() first.",
        ToolErrorCode.VECTOR_DB_ERROR
      );
    }

    const limit = options.limit || 10;
    const distanceType = options.distanceType || "cosine";

    // 执行向量搜索
    const vectorQuery = this.table
      .query()
      .nearestTo(options.queryVector) // 使用nearestTo进行向量搜索
      .distanceType(distanceType) // 设置距离类型
      .limit(limit * 2); // 获取多一些结果以应用阈值过滤

    const results = await vectorQuery.toArray();

    return {
      data: results,
      rowCount: results.length,
    };
  }

  /**
   * 添加记录到向量表
   */
  async addRecords(records: Record<string, unknown>[]): Promise<void> {
    if (!this.table) {
      throw new ToolError(
        "Vector table is not initialized. Call initializeTable() first.",
        ToolErrorCode.VECTOR_DB_ERROR
      );
    }

    await this.table.add(records);
  }

  /**
   * 从向量表删除记录
   */
  async deleteRecords(filter: string): Promise<void> {
    if (!this.table) {
      return;
    }

    await this.table.delete(filter);
  }

  /**
   * 获取当前表
   */
  getTable(): lancedb.Table | null {
    return this.table;
  }

  /**
   * 更新维度配置
   */
  updateDimensions(dimensions: number): void {
    this.dimensions = dimensions;
    logger.info(`Updated VectorIndexManager dimensions to: ${dimensions}`);
  }
}
