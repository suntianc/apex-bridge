/**
 * ToolRetrievalService - Main Service
 *
 * Main service coordinating all tool retrieval modules.
 * Provides public API for tool/skill retrieval operations.
 */

import { logger } from "../../utils/logger";
import {
  ToolRetrievalConfig,
  ToolRetrievalResult,
  SkillData,
  ServiceStatus,
  ToolError,
  ToolErrorCode,
  SkillTool,
} from "./types";
import { LanceDBConnection, ILanceDBConnection } from "./LanceDBConnection";
import { EmbeddingGenerator, IEmbeddingGenerator } from "./EmbeddingGenerator";
import { SkillIndexer, ISkillIndexer } from "./SkillIndexer";
import { SearchEngine, ISearchEngine } from "./SearchEngine";
import { MCPToolSupport, IMCPToolSupport } from "./MCPToolSupport";

/**
 * ToolRetrievalService interface
 */
export interface IToolRetrievalService {
  initialize(): Promise<void>;
  findRelevantSkills(
    query: string,
    limit?: number,
    threshold?: number
  ): Promise<ToolRetrievalResult[]>;
  indexSkill(skill: SkillData): Promise<void>;
  removeSkill(skillId: string): Promise<void>;
  scanAndIndexAllSkills(skillsDir?: string): Promise<void>;
  getStatus(): ServiceStatus;
  cleanup(): Promise<void>;
  indexTools(tools: SkillTool[]): Promise<void>;
  removeTool(toolId: string): Promise<void>;
}

/**
 * ToolRetrievalService implementation
 * Coordinates all tool retrieval modules
 */
export class ToolRetrievalService implements IToolRetrievalService {
  private readonly config: ToolRetrievalConfig;
  private connection: ILanceDBConnection;
  private embeddingGenerator: IEmbeddingGenerator;
  private skillIndexer: ISkillIndexer;
  private searchEngine: ISearchEngine;
  private mcpToolSupport: IMCPToolSupport;
  private isInitialized = false;

  /**
   * Create ToolRetrievalService with dependencies
   */
  constructor(config: ToolRetrievalConfig) {
    this.config = config;

    // Initialize sub-modules
    this.connection = new LanceDBConnection();
    this.embeddingGenerator = new EmbeddingGenerator({
      provider: "openai", // Will be determined dynamically
      model: config.model,
      dimensions: config.dimensions,
    });
    this.skillIndexer = new SkillIndexer(this.connection, this.embeddingGenerator);
    this.searchEngine = new SearchEngine(
      this.connection,
      this.embeddingGenerator,
      config.maxResults,
      config.similarityThreshold
    );
    this.mcpToolSupport = new MCPToolSupport(this.embeddingGenerator, this.connection);

    logger.info("[ToolRetrievalService] Created with config:", {
      vectorDbPath: config.vectorDbPath,
      model: config.model,
      dimensions: config.dimensions,
      similarityThreshold: config.similarityThreshold,
      maxResults: config.maxResults,
    });
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug("[ToolRetrievalService] Already initialized");
      return;
    }

    const startTime = Date.now();

    try {
      logger.info("[ToolRetrievalService] Initializing...");

      // Get actual embedding dimensions from LLMConfigService
      const actualDimensions = await this.embeddingGenerator.getActualDimensions();
      if (actualDimensions !== this.config.dimensions) {
        logger.info(
          `[ToolRetrievalService] Updating dimensions from ${this.config.dimensions} to ${actualDimensions}`
        );
        this.config.dimensions = actualDimensions;
      }

      // Connect to LanceDB
      await this.connection.connect({
        databasePath: this.config.vectorDbPath,
        tableName: "skills",
        vectorDimensions: this.config.dimensions,
      });

      // Initialize table
      await this.connection.initializeTable();

      this.isInitialized = true;

      const duration = Date.now() - startTime;
      logger.debug(`[ToolRetrievalService] Initialized in ${duration}ms`);
    } catch (error) {
      logger.error("[ToolRetrievalService] Initialization failed:", error);
      throw new ToolError(
        `ToolRetrievalService initialization failed: ${this.formatError(error)}`,
        ToolErrorCode.VECTOR_DB_ERROR
      );
    }
  }

  /**
   * Find relevant skills for a query
   */
  async findRelevantSkills(
    query: string,
    limit?: number,
    threshold?: number
  ): Promise<ToolRetrievalResult[]> {
    try {
      // Ensure initialized
      if (!this.isInitialized) {
        logger.warn("[ToolRetrievalService] Not initialized, initializing now...");
        await this.initialize();
      }

      return this.searchEngine.search(query, limit, threshold);
    } catch (error) {
      logger.error(`[ToolRetrievalService] findRelevantSkills failed for "${query}":`, error);
      throw new ToolError(
        `Skills search failed: ${this.formatError(error)}`,
        ToolErrorCode.VECTOR_DB_ERROR
      );
    }
  }

  /**
   * Index a skill
   */
  async indexSkill(skill: SkillData): Promise<void> {
    await this.skillIndexer.addSkill(skill);
  }

  /**
   * Remove a skill from the index
   */
  async removeSkill(skillId: string): Promise<void> {
    await this.skillIndexer.removeSkill(skillId);
  }

  /**
   * Scan and index all skills in a directory
   */
  async scanAndIndexAllSkills(skillsDir?: string): Promise<void> {
    const dir = skillsDir || this.getDefaultSkillsDir();
    await this.skillIndexer.scanAndIndex(dir);
  }

  /**
   * Index tools (supports both skills and MCP tools)
   */
  async indexTools(tools: SkillTool[]): Promise<void> {
    try {
      logger.info(`[ToolRetrievalService] Indexing ${tools.length} tools...`);

      const records: import("./types").ToolsTable[] = [];

      for (const tool of tools) {
        try {
          // Generate ID based on tool type
          const toolId = this.generateToolId(tool);

          // Generate embedding
          const vector = await this.embeddingGenerator.generateForText(
            `${tool.name}\n${tool.description}`
          );

          // Prepare record
          const record: import("./types").ToolsTable = {
            id: toolId,
            name: tool.name,
            description: tool.description,
            tags: tool.tags || [],
            path: tool.path,
            version: tool.version,
            source: tool.path || tool.name,
            toolType: (tool.type as "skill" | "mcp") || "skill",
            metadata: JSON.stringify(tool.metadata || {}),
            vector: vector.values,
            indexedAt: new Date(),
          };

          records.push(record);
        } catch (error) {
          logger.error(`[ToolRetrievalService] Failed to index tool ${tool.name}:`, error);
        }
      }

      if (records.length > 0) {
        // Remove existing
        for (const record of records) {
          await this.connection.deleteById(record.id);
        }

        // Add new
        await this.connection.addRecords(records);
        logger.info(`[ToolRetrievalService] Successfully indexed ${records.length} tools`);
      }
    } catch (error) {
      logger.error("[ToolRetrievalService] Failed to index tools:", error);
      throw error;
    }
  }

  /**
   * Remove a tool from the index
   */
  async removeTool(toolId: string): Promise<void> {
    await this.connection.deleteById(toolId);
  }

  /**
   * Get service status
   */
  getStatus(): ServiceStatus {
    const dbStatus = this.connection.getStatus();
    return {
      databaseStatus: dbStatus,
      indexStatus: {
        indexedCount: 0,
        indexingCount: 0,
        pendingCount: 0,
      },
      ready: this.isInitialized && dbStatus.connected,
      healthy: this.isInitialized && dbStatus.connected,
    };
  }

  /**
   * Cleanup resources - 完整清理
   */
  async cleanup(): Promise<void> {
    logger.info("[ToolRetrievalService] Cleaning up...");

    try {
      // 关闭数据库连接
      if (this.connection) {
        await this.connection.disconnect();
        logger.debug("[ToolRetrievalService] Database connection closed");
      }

      // 清理状态
      this.isInitialized = false;

      // 清理模块级变量（通过导出的重置函数）
      resetToolRetrievalService();

      logger.info("[ToolRetrievalService] Cleanup completed");
    } catch (error) {
      logger.error("[ToolRetrievalService] Cleanup failed:", error);
      throw new ToolError(
        `ToolRetrievalService cleanup failed: ${this.formatError(error)}`,
        ToolErrorCode.VECTOR_DB_ERROR
      );
    }
  }

  /**
   * Get default skills directory
   */
  private getDefaultSkillsDir(): string {
    return "./.data/skills";
  }

  /**
   * Generate tool ID
   */
  private generateToolId(tool: SkillTool): string {
    const source = tool.path || tool.name;
    return require("crypto")
      .createHash("md5")
      .update(`${tool.type}:${source}:${tool.name}`)
      .digest("hex");
  }

  /**
   * Format error message
   */
  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown error occurred in ToolRetrievalService";
  }
}

// ==================== Singleton Instance ====================

let instance: ToolRetrievalService | null = null;

/**
 * Get tool retrieval service instance (singleton)
 */
export function getToolRetrievalService(config?: ToolRetrievalConfig): ToolRetrievalService {
  if (!instance) {
    if (!config) {
      config = {
        vectorDbPath: "./.data",
        model: "nomic-embed-text:latest",
        cacheSize: 1000,
        dimensions: 768,
        similarityThreshold: 0.4,
        maxResults: 10,
      };
    }
    instance = new ToolRetrievalService(config);
  }
  return instance;
}

/**
 * Reset tool retrieval service instance (for testing)
 */
export function resetToolRetrievalService(): void {
  instance = null;
}
