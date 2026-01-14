/**
 * ToolRetrievalService - Legacy Implementation (To Be Migrated)
 *
 * NOTE: This file contains the legacy implementation that needs to be
 * migrated to the modular structure under tool-retrieval/.
 *
 * Current status: Wrapper points to authoritative implementation where possible.
 * Some methods (like indexBuiltinTools) are still only in this implementation.
 *
 * TODO: Add missing methods to src/services/tool-retrieval/ToolRetrievalService.ts
 * and update this wrapper to re-export from there.
 */

import * as lancedb from "@lancedb/lancedb";
import * as arrow from "apache-arrow";
import * as fs from "fs/promises";
import * as path from "path";
import { createHash } from "crypto";
import matter from "gray-matter";
import { LRUCache } from "lru-cache";
import {
  ToolRetrievalConfig,
  SkillTool,
  ToolRetrievalResult,
  ToolError,
  ToolErrorCode,
  ToolType,
} from "./tool-retrieval/types";
import { LLMModelType } from "../types/llm-models";
import { logger } from "../utils/logger";
import { LLMConfigService } from "./LLMConfigService";
import { VECTOR_RETRIEVAL } from "../constants/retrieval";
import { IndexConfigOptimizer } from "./tool-retrieval/IndexConfigOptimizer";

// LLMManager lazy import to avoid circular dependency
let llmManagerInstance: any = null;

// Async mutex to protect initialization
let initializationPromise: Promise<void> | null = null;

/**
 * Tools table interface (supports Skills and MCP tools)
 */
interface ToolsTable {
  id: string;
  name: string;
  description: string;
  tags: string[];
  path?: string; // Skills path, MCP tools may not have
  version?: string; // Skills version, MCP tools may not have
  source?: string; // MCP server ID or skill name
  toolType: "skill" | "mcp" | "builtin"; // Tool type
  metadata: string; // JSON string format
  vector: number[]; // Regular array, not Float32Array
  indexedAt: Date;
}

/**
 * ToolRetrievalService
 */
export class ToolRetrievalService {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private config: ToolRetrievalConfig;
  private isInitialized = false;
  private dimensionsCache: number | null = null;
  private llmConfigService: any = null;
  private optimizer: IndexConfigOptimizer;
  private embeddingCache: LRUCache<string, number[]>;
  private lastError: string | null = null;
  private startTime: number = Date.now();

  private readonly embeddingCacheConfig = {
    maxSize: 1000,
    ttl: 5 * 60 * 1000,
    maxQueryLength: 500,
  } as const;

  constructor(config: ToolRetrievalConfig) {
    this.config = config;
    this.optimizer = new IndexConfigOptimizer();
    this.embeddingCache = new LRUCache<string, number[]>({
      max: this.embeddingCacheConfig.maxSize,
      ttl: this.embeddingCacheConfig.ttl,
    });
    logger.info("ToolRetrievalService created with config:", {
      vectorDbPath: config.vectorDbPath,
      model: config.model,
      dimensions: config.dimensions,
    });
  }

  /**
   * Get actual vector dimensions (from database configured model)
   */
  private async getActualDimensions(): Promise<number> {
    if (this.dimensionsCache !== null) {
      return this.dimensionsCache;
    }

    try {
      if (!this.llmConfigService) {
        const { LLMConfigService } = await import("./LLMConfigService");
        this.llmConfigService = LLMConfigService.getInstance();
      }

      // Get default provider and extract embedding model dimensions
      const providers = await this.llmConfigService.listProviders();
      const defaultProvider = providers.find((p: any) => p.isDefault) || providers[0];

      if (defaultProvider?.models?.[0]?.embeddingModel) {
        const embeddingModel = defaultProvider.models.find(
          (m: any) => m.id === defaultProvider.models[0].embeddingModel?.id
        );

        if (embeddingModel?.embeddingModel?.dimensions) {
          this.dimensionsCache = embeddingModel.embeddingModel.dimensions;
          logger.info("[ToolRetrievalService] Using embedding dimensions from LLMConfig:", {
            dimensions: this.dimensionsCache,
          });
          return this.dimensionsCache;
        }
      }

      // Fallback to config
      logger.warn("[ToolRetrievalService] Could not get dimensions from LLMConfig, using config");
      this.dimensionsCache = this.config.dimensions;
    } catch (error) {
      logger.warn("[ToolRetrievalService] Failed to get dimensions from LLMConfig:", error);
      this.dimensionsCache = this.config.dimensions;
    }

    return this.dimensionsCache;
  }

  /**
   * Get embedding for text using LLMManager
   */
  async getEmbedding(input: {
    name: string;
    description: string;
    tags: string[];
  }): Promise<number[]> {
    const cacheKey = `${input.name}:${input.description.substring(0, 100)}:${input.tags.join(",")}`;

    // Check cache first
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      logger.debug(`[ToolRetrieval] Cache hit for "${input.name}"`);
      return cached;
    }

    // Check cache config
    if (input.description.length > this.embeddingCacheConfig.maxQueryLength) {
      logger.warn(
        `[ToolRetrieval] Query too long (${input.description.length} chars), skipping cache for "${input.name}"`
      );
    }

    try {
      // Lazy import LLMManager
      if (!llmManagerInstance) {
        const { LLMManager } = await import("../core/LLMManager");
        llmManagerInstance = new LLMManager();
      }

      const textToEmbed = `${input.name} ${input.description} ${input.tags.join(" ")}`;
      const embedding = await llmManagerInstance.embed(textToEmbed);

      // Cache the result
      if (input.description.length <= this.embeddingCacheConfig.maxQueryLength) {
        this.embeddingCache.set(cacheKey, embedding);
      }

      return embedding;
    } catch (error) {
      logger.error("[ToolRetrieval] Failed to get embedding:", error);
      throw error;
    }
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

      // Get actual embedding dimensions
      const actualDimensions = await this.getActualDimensions();

      // Check and update dimensions if needed
      if (actualDimensions !== this.config.dimensions) {
        logger.info(
          `[ToolRetrievalService] Updating dimensions from ${this.config.dimensions} to ${actualDimensions}`
        );
        this.config.dimensions = actualDimensions;
      }

      // Connect to LanceDB
      this.db = await lancedb.connect(this.config.vectorDbPath);

      // Create or open table
      await this.createOrOpenTable();

      this.isInitialized = true;
      logger.info(`[ToolRetrievalService] Initialized successfully in ${Date.now() - startTime}ms`);
    } catch (error) {
      logger.error("[ToolRetrievalService] Initialization failed:", error);
      throw error;
    }
  }

  /**
   * Create or open LanceDB table
   */
  private async createOrOpenTable(): Promise<void> {
    try {
      // Try to open existing table
      this.table = await this.db!.openTable("skills");
      logger.info("[ToolRetrievalService] Opened existing skills table");

      // Verify dimensions
      const schema = await this.table.schema();
      const vectorField = schema.fields.find((f: any) => f.name === "vector");

      if (!vectorField || vectorField.typeId !== 16) {
        logger.warn("[ToolRetrievalService] Unknown vector field type, will recreate");
        await this.db!.dropTable("skills");
        this.table = null;
      } else {
        const existingDimensions = (vectorField as any).listSize;
        if (existingDimensions !== this.config.dimensions) {
          logger.warn(
            `[ToolRetrievalService] Dimension mismatch: expected ${this.config.dimensions}, got ${existingDimensions}`
          );
          await this.db!.dropTable("skills");
          this.table = null;
        }
      }
    } catch (error: any) {
      if (error.message.includes("not found") || error.message?.includes("does not exist")) {
        logger.info("[ToolRetrievalService] Table not found, will create new one");
        this.table = null;
      } else {
        throw error;
      }
    }

    // Create table if needed
    if (!this.table) {
      await this.createTable();
    }
  }

  /**
   * Create new LanceDB table with optimized index
   */
  private async createTable(): Promise<void> {
    const embeddingDimension = this.config.dimensions;

    logger.info(`[ToolRetrievalService] Creating table with small preset`);

    // Create schema with Apache Arrow (matching authoritative implementation)
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
          embeddingDimension,
          new arrow.Field("item", new arrow.Float32(), true)
        ),
        false
      ),
      new arrow.Field("indexedAt", new arrow.Timestamp(arrow.TimeUnit.MICROSECOND), false),
    ]);

    this.table = await this.db!.createTable("skills", [], { schema });

    logger.info(
      `[ToolRetrievalService] Created skills table with ${embeddingDimension} dimensions`
    );
  }

  /**
   * Find relevant skills for a query
   */
  async findRelevantSkills(
    query: string,
    limit: number = 5,
    threshold: number = VECTOR_RETRIEVAL.SIMILARITY_THRESHOLD
  ): Promise<ToolRetrievalResult[]> {
    if (!this.isInitialized || !this.table) {
      throw new Error("ToolRetrievalService not initialized");
    }

    try {
      // Generate query embedding
      const queryEmbedding = await this.getEmbedding({
        name: "query",
        description: query,
        tags: ["query"],
      });

      // Search with threshold
      const results = await this.table
        .query()
        .limit(limit * 2) // Fetch more to filter by threshold
        .nearestTo(queryEmbedding as any)
        .where(`toolType == 'skill'`)
        .toArray();

      // Filter by threshold and limit
      const filtered = results.filter((r: any) => r.score >= threshold).slice(0, limit);

      return filtered.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        score: r.score,
        toolType: r.toolType as ToolType,
        metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
        tags: r.tags || [],
      }));
    } catch (error) {
      logger.error("[ToolRetrievalService] findRelevantSkills failed:", error);
      return [];
    }
  }

  /**
   * Index a skill
   */
  async indexSkill(skill: {
    name: string;
    description: string;
    tags: string[];
    path: string;
    version?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!this.isInitialized || !this.table) {
      throw new Error("ToolRetrievalService not initialized");
    }

    try {
      // Generate embedding
      const vector = await this.getEmbedding({
        name: skill.name,
        description: skill.description,
        tags: skill.tags,
      });

      // Upsert to table
      await this.table.add([
        {
          id: `skill:${skill.name}`,
          name: skill.name,
          description: skill.description,
          tags: skill.tags,
          path: skill.path,
          version: skill.version || "0.1.0",
          source: "local",
          toolType: "skill",
          metadata: JSON.stringify(skill.metadata || {}),
          vector,
          indexedAt: Date.now(),
        },
      ]);

      logger.debug(`[ToolRetrievalService] Indexed skill: ${skill.name}`);
    } catch (error) {
      logger.error(`[ToolRetrievalService] Failed to index skill ${skill.name}:`, error);
      throw error;
    }
  }

  /**
   * Remove a skill
   */
  async removeSkill(skillId: string): Promise<void> {
    if (!this.isInitialized || !this.table) {
      throw new Error("ToolRetrievalService not initialized");
    }

    try {
      await this.table.delete(`id == "${skillId}"`);
      logger.debug(`[ToolRetrievalService] Removed skill: ${skillId}`);
    } catch (error) {
      logger.error(`[ToolRetrievalService] Failed to remove skill ${skillId}:`, error);
      throw error;
    }
  }

  /**
   * Index tools (batch operation for skills and MCP tools)
   */
  async indexTools(tools: SkillTool[]): Promise<void> {
    if (!this.isInitialized || !this.table) {
      throw new Error("ToolRetrievalService not initialized");
    }

    for (const tool of tools) {
      try {
        const toolId = `skill:${tool.name}`;
        const vector = await this.getEmbedding({
          name: tool.name,
          description: tool.description,
          tags: tool.tags || [],
        });

        await this.table.add([
          {
            id: toolId,
            name: tool.name,
            description: tool.description,
            tags: tool.tags || [],
            path: tool.path,
            version: tool.version || "0.1.0",
            source: "local",
            toolType: "skill",
            metadata: JSON.stringify(tool.parameters || {}),
            vector,
            indexedAt: Date.now(),
          },
        ]);
        logger.debug(`[ToolRetrievalService] Indexed tool: ${tool.name}`);
      } catch (error) {
        logger.error(`[ToolRetrievalService] Failed to index tool ${tool.name}:`, error);
      }
    }
  }

  /**
   * Remove a tool by ID
   */
  async removeTool(toolId: string): Promise<void> {
    if (!this.isInitialized || !this.table) {
      throw new Error("ToolRetrievalService not initialized");
    }

    try {
      await this.table.delete(`id == "${toolId}"`);
      logger.debug(`[ToolRetrievalService] Removed tool: ${toolId}`);
    } catch (error) {
      logger.error(`[ToolRetrievalService] Failed to remove tool ${toolId}:`, error);
      throw error;
    }
  }

  /**
   * Get statistics about the retrieval service
   */
  async getStatistics(): Promise<Record<string, unknown>> {
    return {
      isInitialized: this.isInitialized,
      uptime: Date.now() - this.startTime,
      lastError: this.lastError,
      cacheSize: this.embeddingCache.size,
    };
  }

  /**
   * Scan and index all skills in a directory
   */
  async scanAndIndexAllSkills(skillsDir?: string): Promise<void> {
    if (!this.isInitialized || !this.table) {
      throw new Error("ToolRetrievalService not initialized");
    }

    const pathService = require("./PathService").PathService.getInstance();
    const dataDir = pathService.getDataDir();
    const basePath = skillsDir || path.join(dataDir, "skills");

    try {
      logger.info(`[ToolRetrieval] Scanning skills directory: ${basePath}`);

      if (!(await this.directoryExists(basePath))) {
        logger.info(`[ToolRetrieval] Skills directory does not exist: ${basePath}`);
        return;
      }

      const entries = await fs.readdir(basePath, { withFileTypes: true });
      const skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      let indexed = 0;
      let skipped = 0;
      let failed = 0;

      for (const skillName of skillDirs) {
        try {
          const skillPath = path.join(basePath, skillName);
          const skillMdPath = path.join(skillPath, "SKILL.md");

          if (!(await this.fileExists(skillMdPath))) {
            logger.warn(`[ToolRetrieval] SKILL.md not found for skill: ${skillName}`);
            skipped++;
            continue;
          }

          // Check if already indexed (by checking .vectorized file)
          const vectorizedFile = path.join(skillPath, ".vectorized");
          let needsReindex = true;

          if (await this.fileExists(vectorizedFile)) {
            try {
              const content = await fs.readFile(vectorizedFile, "utf8");
              const parsed = matter(content);
              if (parsed.data.version) {
                const currentContent = await fs.readFile(skillMdPath, "utf8");
                const currentParsed = matter(currentContent);
                if (currentParsed.data.version === parsed.data.version) {
                  const currentHash = createHash("md5").update(currentContent).digest("hex");
                  if (currentHash === parsed.data.hash) {
                    needsReindex = false;
                  }
                }
              }
            } catch {
              // If .vectorized file is corrupted, reindex
            }
          }

          if (needsReindex) {
            const content = await fs.readFile(skillMdPath, "utf8");
            const parsed = matter(content);
            const hash = createHash("md5").update(content).digest("hex");

            await this.indexSkill({
              name: skillName,
              description: parsed.data.description || "",
              tags: parsed.data.tags || [],
              path: skillPath,
              version: parsed.data.version,
              metadata: parsed.data,
            });

            // Update .vectorized file
            await fs.writeFile(
              vectorizedFile,
              `indexed: ${new Date().toISOString()}\nversion: ${parsed.data.version}\nhash: ${hash}`
            );

            indexed++;
          } else {
            skipped++;
          }
        } catch (error) {
          logger.error(`[ToolRetrieval] Failed to process skill ${skillName}:`, error);
          failed++;
        }
      }

      logger.info(
        `[ToolRetrieval] Skills scanning completed: ${indexed} indexed, ${skipped} skipped, ${failed} failed`
      );
    } catch (error) {
      logger.error("[ToolRetrieval] Failed to scan skills directory:", error);
      throw error;
    }
  }

  /**
   * Get service status
   */
  getStatus(): { status: string; details: Record<string, unknown> } {
    return {
      status: this.isInitialized ? "healthy" : "unhealthy",
      details: {
        isInitialized: this.isInitialized,
        uptime: Date.now() - this.startTime,
        lastError: this.lastError,
        cacheSize: this.embeddingCache.size,
      },
    };
  }

  /**
   * Index built-in tools
   */
  async indexBuiltinTools(): Promise<void> {
    if (!this.isInitialized || !this.table) {
      throw new Error("ToolRetrievalService not initialized");
    }

    try {
      // Lazy import BuiltInToolsRegistry to avoid circular dependency
      const { getBuiltInToolsRegistry } = await import("./BuiltInToolsRegistry");

      const builtInRegistry = getBuiltInToolsRegistry();
      const builtinTools = builtInRegistry.listAllTools();

      logger.info(`[ToolRetrieval] Found ${builtinTools.length} built-in tools to index`);

      if (builtinTools.length === 0) {
        logger.warn("[ToolRetrieval] No built-in tools found to index");
        return;
      }

      const records: ToolsTable[] = [];

      for (const tool of builtinTools) {
        try {
          // Generate unique ID (with builtin prefix)
          const toolId = `builtin:${tool.name}`;

          // Check if already exists
          const existingRecords = await this.table
            .query()
            .where(`id == "${toolId}"`)
            .limit(1)
            .toArray();

          if (existingRecords.length > 0) {
            logger.debug(`[ToolRetrieval] Built-in tool "${tool.name}" already indexed, skipping`);
            continue;
          }

          // Generate vector embedding
          const vector = await this.getEmbedding({
            name: tool.name,
            description: tool.description,
            tags: [tool.category],
          });

          records.push({
            id: toolId,
            name: tool.name,
            description: tool.description,
            tags: [tool.category],
            source: "builtin",
            toolType: "builtin",
            metadata: JSON.stringify({ parameters: tool.parameters }),
            vector,
            indexedAt: new Date(),
          });
        } catch (error) {
          logger.error(`[ToolRetrieval] Failed to prepare built-in tool ${tool.name}:`, error);
        }
      }

      if (records.length > 0) {
        await this.table.add(records as any);
        logger.info(`[ToolRetrieval] Successfully indexed ${records.length} built-in tools`);
      } else {
        logger.info("[ToolRetrieval] No new built-in tools to index (all already indexed)");
      }
    } catch (error) {
      logger.error("[ToolRetrieval] Failed to index built-in tools:", error);
      throw error;
    }
  }

  /**
   * Check if directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.table) {
        await this.table.close();
        this.table = null;
      }
      if (this.db) {
        await this.db.close();
        this.db = null;
      }
      this.isInitialized = false;
      logger.info("[ToolRetrievalService] Cleanup completed");
    } catch (error) {
      logger.error("[ToolRetrievalService] Cleanup failed:", error);
      throw error;
    }
  }
}

// Singleton instance
let instance: ToolRetrievalService | null = null;
let instanceConfig: ToolRetrievalConfig | null = null;

/**
 * Get ToolRetrievalService singleton instance
 */
export function getToolRetrievalService(config?: ToolRetrievalConfig): ToolRetrievalService {
  if (!instance) {
    if (!config) {
      throw new Error("ToolRetrievalService requires config for first initialization");
    }

    // Validate config
    if (!config.vectorDbPath) {
      throw new Error("ToolRetrievalConfig.vectorDbPath is required");
    }

    instanceConfig = config;
    instance = new ToolRetrievalService(config);
  } else if (config && JSON.stringify(config) !== JSON.stringify(instanceConfig)) {
    // Config changed, create new instance
    logger.info("[ToolRetrievalService] Config changed, creating new instance");
    instanceConfig = config;
    instance = new ToolRetrievalService(config);
  }

  return instance;
}

/**
 * Reset ToolRetrievalService singleton (for testing)
 */
export function resetToolRetrievalService(): void {
  if (instance) {
    instance.cleanup().catch(() => {});
    instance = null;
    instanceConfig = null;
  }
}
