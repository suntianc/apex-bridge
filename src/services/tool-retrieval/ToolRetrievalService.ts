/**
 * ToolRetrievalService - Main Service
 *
 * Main service coordinating all tool retrieval modules.
 * Provides public API for tool/skill retrieval operations.
 */

import { logger } from "../../utils/logger";
import * as path from "path";
import {
  ToolRetrievalConfig,
  ToolRetrievalResult,
  SkillData,
  ServiceStatus,
  ToolError,
  ToolErrorCode,
  SkillTool,
  ToolType,
} from "./types";
import type { IVectorStorage, VectorRecord } from "../../core/storage/interfaces";
import { StorageAdapterFactory } from "../../core/storage/adapter-factory";
import { EmbeddingGenerator, IEmbeddingGenerator } from "./EmbeddingGenerator";
import { SkillIndexer, ISkillIndexer } from "./SkillIndexer";
import { SearchEngine, ISearchEngine } from "./SearchEngine";
import { MCPToolSupport, IMCPToolSupport } from "./MCPToolSupport";
import { cacheService } from "../cache/CacheService";

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
  indexBuiltinTools(): Promise<void>;
  removeTool(toolId: string): Promise<void>;
  getStatistics(): Promise<Record<string, unknown>>;
}

/**
 * ToolRetrievalService implementation
 * Coordinates all tool retrieval modules
 */
export class ToolRetrievalService implements IToolRetrievalService {
  private readonly config: ToolRetrievalConfig;
  private storage: IVectorStorage | null = null;
  private embeddingGenerator: IEmbeddingGenerator;
  private skillIndexer: ISkillIndexer | null = null; // Lazy initialization
  private searchEngine: ISearchEngine | null = null; // Lazy initialization
  private mcpToolSupport: IMCPToolSupport | null = null; // Lazy initialization
  private isInitialized = false;
  private readonly startTime = Date.now();
  private lastConnected: Date | null = null;
  private lastError: string | null = null;

  /**
   * Create ToolRetrievalService with dependencies
   */
  constructor(config: ToolRetrievalConfig) {
    this.config = config;

    this.embeddingGenerator = new EmbeddingGenerator({
      provider: "openai", // Will be determined dynamically
      model: config.model,
      dimensions: config.dimensions,
    });

    logger.info("[ToolRetrievalService] Created with config:", {
      model: config.model,
      dimensions: config.dimensions,
      similarityThreshold: config.similarityThreshold,
      maxResults: config.maxResults ?? 10,
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

      this.storage = await StorageAdapterFactory.getVectorStorage(this.config.dimensions);
      await this.initializeStorage(this.storage);

      const maxResults = this.config.maxResults ?? 10;
      this.skillIndexer = new SkillIndexer(this.storage, this.embeddingGenerator);
      this.searchEngine = new SearchEngine(this.storage, this.embeddingGenerator, {
        defaultLimit: maxResults,
        defaultThreshold: this.config.similarityThreshold,
      });
      this.mcpToolSupport = new MCPToolSupport(this.embeddingGenerator, this.storage);

      this.lastConnected = new Date();
      this.lastError = null;

      this.isInitialized = true;

      const duration = Date.now() - startTime;
      logger.debug(`[ToolRetrievalService] Initialized in ${duration}ms`);
    } catch (error) {
      logger.error("[ToolRetrievalService] Initialization failed:", error);
      this.lastError = this.formatError(error);
      throw new ToolError(
        `ToolRetrievalService initialization failed: ${this.formatError(error)}`,
        ToolErrorCode.VECTOR_DB_ERROR
      );
    }
  }

  /**
   * Find relevant skills for a query with graceful degradation
   * Implements fallback strategy: vector search -> keyword search -> empty array
   */
  async findRelevantSkills(
    query: string,
    limit?: number,
    threshold?: number
  ): Promise<ToolRetrievalResult[]> {
    const startTime = Date.now();
    let fallbackTriggered = false;
    let fallbackReason = "";

    try {
      // Ensure initialized
      if (!this.isInitialized) {
        logger.warn("[ToolRetrievalService] Not initialized, initializing now...");
        await this.initialize();
      }

      // Try cache first (only for exact match queries without complex filters)
      const cacheKey = `skill_search:${query.toLowerCase().trim()}:${limit || ""}:${threshold || ""}`;
      const cachedResults = await cacheService.get<ToolRetrievalResult[]>(cacheKey);
      if (cachedResults) {
        logger.debug(`[ToolRetrievalService] Cache hit for query: "${query.substring(0, 50)}..."`);
        return cachedResults;
      }

      // Try vector search (with internal fallback to keyword search)
      if (!this.searchEngine) {
        logger.warn(
          "[ToolRetrievalService] Search engine not available, using fallback keyword search"
        );
        throw new ToolError("Vector search engine not initialized", ToolErrorCode.VECTOR_DB_ERROR);
      }
      const results = await this.searchEngine.search(query, { limit, minScore: threshold });

      // Cache the results (only successful results)
      await cacheService.set(cacheKey, results, 300); // 5 minute TTL

      const duration = Date.now() - startTime;
      logger.debug(`[ToolRetrievalService] Search completed in ${duration}ms`, {
        query: query.substring(0, 50),
        resultCount: results.length,
      });

      return results;
    } catch (error) {
      fallbackTriggered = true;

      // Determine fallback reason
      if (error instanceof ToolError && error.code === ToolErrorCode.VECTOR_DB_ERROR) {
        fallbackReason = "vector_db_error";
      } else if (this.formatError(error).includes("embedding")) {
        fallbackReason = "embedding_failure";
      } else {
        fallbackReason = "unknown_error";
      }

      // Log fallback trigger
      logger.warn(
        `[ToolRetrievalService] Search fallback triggered for query "${query.substring(0, 50)}..."`,
        {
          errorType: error instanceof ToolError ? error.code : "UNKNOWN_ERROR",
          fallbackReason,
          query: query.substring(0, 100),
          limit,
          threshold,
          duration: Date.now() - startTime,
        }
      );

      // Try keyword search fallback
      try {
        const fallbackResults = await this.keywordSearchFallback(query, limit, threshold);

        logger.info(
          `[ToolRetrievalService] Fallback keyword search returned ${fallbackResults.length} results`,
          {
            originalQuery: query.substring(0, 50),
            fallbackResultCount: fallbackResults.length,
          }
        );

        return fallbackResults;
      } catch (fallbackError) {
        // All methods failed - return empty array as last resort
        logger.error(
          `[ToolRetrievalService] All search methods failed for query "${query.substring(0, 50)}..."`,
          {
            originalError: this.formatError(error),
            fallbackError: this.formatError(fallbackError),
            query: query.substring(0, 100),
          }
        );

        // Return empty array instead of throwing - ensures service availability
        return [];
      }
    }
  }

  /**
   * Keyword search fallback implementation
   * Used when vector search fails completely
   */
  private async keywordSearchFallback(
    query: string,
    limit?: number,
    threshold?: number
  ): Promise<ToolRetrievalResult[]> {
    // Check if searchEngine is available
    if (!this.searchEngine) {
      logger.warn(
        "[ToolRetrievalService] Keyword search fallback skipped - search engine not available"
      );
      return [];
    }

    const effectiveLimit = limit || this.config.maxResults;
    const effectiveThreshold = threshold || this.config.similarityThreshold;

    try {
      logger.info(`[ToolRetrievalService] Executing fallback keyword search for: "${query}"`);

      // Use the SearchEngine's keyword search method
      const results = await this.searchEngine.keywordSearch(
        query,
        effectiveLimit,
        effectiveThreshold
      );

      logger.info(
        `[ToolRetrievalService] Fallback keyword search completed with ${results.length} results`
      );

      return results;
    } catch (error) {
      logger.error("[ToolRetrievalService] Keyword fallback search failed:", error);
      throw error;
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

  async indexBuiltinTools(): Promise<void> {
    const { BuiltInToolsRegistry } = await import("../BuiltInToolsRegistry");
    const registry = new BuiltInToolsRegistry();
    await registry.waitForInitialization();
    const builtinTools = registry.listAllTools();

    await this.indexTools(
      builtinTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        type: ToolType.BUILTIN,
        tags: [tool.category],
        source: "builtin",
        metadata: { parameters: tool.parameters, category: tool.category },
      }))
    );
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
            source: tool.source || tool.path || tool.name,
            toolType: (tool.type as unknown as "skill" | "mcp" | "builtin") || "skill",
            metadata: JSON.stringify({ ...(tool.metadata || {}), parameters: tool.parameters }),
            vector: vector.values,
            indexedAt: new Date(),
          };

          records.push(record);
        } catch (error) {
          logger.error(`[ToolRetrievalService] Failed to index tool ${tool.name}:`, error);
        }
      }

      if (records.length > 0) {
        if (!this.storage) {
          logger.warn("[ToolRetrievalService] Cannot index tools - storage not available");
          return;
        }
        for (const record of records) {
          await this.storage.delete(record.id);
        }

        const vectorRecords = records.map((record) => this.toVectorRecord(record));
        await this.storage.upsertBatch(vectorRecords);
        logger.info(`[ToolRetrievalService] Successfully indexed ${records.length} tools`);
      }
    } catch (error) {
      logger.error("[ToolRetrievalService] Failed to index tools:", error);
      // Don't throw - allow server to continue
    }
  }

  /**
   * Remove a tool from the index
   */
  async removeTool(toolId: string): Promise<void> {
    if (!this.storage) {
      logger.warn("[ToolRetrievalService] Cannot remove tool - storage not available");
      return;
    }
    await this.storage.delete(toolId);
  }

  /**
   * Get service statistics
   */
  async getStatistics(): Promise<Record<string, unknown>> {
    if (!this.storage) {
      return {
        isInitialized: this.isInitialized,
        databaseConnected: false,
        error: this.lastError || "Vector storage not available",
      };
    }
    const recordCount = await this.storage.count();
    return {
      isInitialized: this.isInitialized,
      databaseConnected: true,
      uptime: Date.now() - this.startTime,
      lastError: this.lastError,
      recordCount,
    };
  }

  /**
   * Get service status
   */
  getStatus(): ServiceStatus {
    const connected = this.isInitialized && this.storage !== null;
    const dbStatus = {
      connected,
      lastConnected: this.lastConnected || undefined,
      error: this.lastError || undefined,
    };
    return {
      databaseStatus: dbStatus,
      indexStatus: {
        indexedCount: 0,
        indexingCount: 0,
        pendingCount: 0,
      },
      ready: connected,
      healthy: connected,
    };
  }

  /**
   * Cleanup resources - 完整清理
   */
  async cleanup(): Promise<void> {
    logger.info("[ToolRetrievalService] Cleaning up...");

    try {
      this.storage = null;

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

  private async initializeStorage(storage: IVectorStorage): Promise<void> {
    const storageWithInit = storage as { initialize?: () => Promise<void> };
    if (typeof storageWithInit.initialize === "function") {
      await storageWithInit.initialize();
    }
  }

  private toVectorRecord(record: import("./types").ToolsTable): VectorRecord {
    return {
      id: record.id,
      vector: record.vector,
      metadata: {
        name: record.name,
        description: record.description,
        tags: record.tags,
        path: record.path,
        version: record.version,
        source: record.source,
        toolType: record.toolType,
        metadata: record.metadata,
        indexedAt: record.indexedAt.getTime(),
      },
    };
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
      const pathService = require("../PathService").PathService.getInstance();
      const dataDir = pathService.getDataDir();

      config = {
        vectorDbPath: path.join(dataDir, "vector-store"),
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
