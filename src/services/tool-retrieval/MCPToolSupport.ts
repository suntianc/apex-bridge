/**
 * MCPToolSupport - MCP Tool Support
 *
 * Handles MCP tool indexing, embedding generation, and search.
 */

import { createHash } from "crypto";
import { logger } from "../../utils/logger";
import { MCPTool, MCPToolRetrievalResult, EmbeddingVector, ToolsTable } from "./types";
import { IEmbeddingGenerator } from "./EmbeddingGenerator";
import type {
  IVectorStorage,
  VectorRecord,
  VectorSearchResult,
} from "../../core/storage/interfaces";

/**
 * MCPToolSupport interface
 */
export interface IMCPToolSupport {
  indexTools(tools: MCPTool[]): Promise<void>;
  getEmbeddingForTool(tool: MCPTool): Promise<EmbeddingVector>;
  removeTool(toolName: string): Promise<void>;
  searchTools(query: string, limit?: number): Promise<MCPToolRetrievalResult[]>;
}

/**
 * MCPToolSupport implementation
 */
export class MCPToolSupport implements IMCPToolSupport {
  private readonly embeddingGenerator: IEmbeddingGenerator;
  private readonly storage: IVectorStorage;
  private readonly defaultLimit: number;

  constructor(
    embeddingGenerator: IEmbeddingGenerator,
    storage: IVectorStorage,
    defaultLimit: number = 5
  ) {
    this.embeddingGenerator = embeddingGenerator;
    this.storage = storage;
    this.defaultLimit = defaultLimit;
  }

  /**
   * Index MCP tools
   */
  async indexTools(tools: MCPTool[]): Promise<void> {
    try {
      logger.info(`[MCPToolSupport] Indexing ${tools.length} MCP tools...`);

      const records: ToolsTable[] = [];

      for (const tool of tools) {
        try {
          // Generate unique ID
          const toolId = this.generateToolId(tool);

          // Generate vector embedding
          const vector = await this.getEmbeddingForTool(tool);

          // Prepare record
          const record: ToolsTable = {
            id: toolId,
            name: tool.name,
            description: tool.description,
            tags: this.extractToolTags(tool),
            path: null,
            version: null,
            source: (tool.metadata?.source as string) || tool.name,
            toolType: "mcp",
            metadata: JSON.stringify(tool.metadata || {}),
            vector: vector.values,
            indexedAt: new Date(),
          };

          records.push(record);
        } catch (error) {
          logger.error(`[MCPToolSupport] Failed to index tool ${tool.name}:`, error);
        }
      }

      if (records.length > 0) {
        // Remove existing records
        for (const record of records) {
          await this.removeToolById(record.id);
        }

        // Batch insert
        const vectorRecords = records.map((record) => this.toVectorRecord(record));
        await this.storage.upsertBatch(vectorRecords);
        logger.info(`[MCPToolSupport] Successfully indexed ${records.length} MCP tools`);
      } else {
        logger.warn("[MCPToolSupport] No tools were indexed");
      }
    } catch (error) {
      logger.error("[MCPToolSupport] Failed to index tools:", error);
      throw error;
    }
  }

  /**
   * Get embedding for an MCP tool
   */
  async getEmbeddingForTool(tool: MCPTool): Promise<EmbeddingVector> {
    return this.embeddingGenerator.generateForTool(tool);
  }

  /**
   * Remove a tool from the index
   */
  async removeTool(toolName: string): Promise<void> {
    const toolId = this.generateToolId({
      name: toolName,
      description: "",
      inputSchema: { schema: {} },
    });
    await this.removeToolById(toolId);
  }

  /**
   * Remove tool by ID
   */
  private async removeToolById(toolId: string): Promise<void> {
    try {
      await this.storage.delete(toolId);
      logger.debug(`[MCPToolSupport] Removed tool: ${toolId}`);
    } catch (error) {
      logger.error(`[MCPToolSupport] Failed to remove tool ${toolId}:`, error);
    }
  }

  /**
   * Search MCP tools
   */
  async searchTools(query: string, limit?: number): Promise<MCPToolRetrievalResult[]> {
    const effectiveLimit = limit ?? this.defaultLimit;

    try {
      logger.info(`[MCPToolSupport] Searching MCP tools for: "${query}"`);

      // Generate query embedding
      const vector = await this.embeddingGenerator.generateForText(query);

      // Execute search
      const results = await this.storage.search(vector.values, {
        limit: effectiveLimit * 2,
        distanceType: "cosine",
      });

      // Format results
      const formatted: MCPToolRetrievalResult[] = [];

      for (const result of results.slice(0, effectiveLimit)) {
        try {
          const data = this.extractResultData(result);
          const score = this.calculateScore(result);

          // Only include MCP tools
          if (data.toolType === "mcp") {
            formatted.push({
              name: data.name,
              score,
              description: data.description,
              parameters: this.extractParameters(data.metadata),
            });
          }
        } catch (error) {
          logger.warn("[MCPToolSupport] Failed to format search result:", error);
        }
      }

      logger.info(`[MCPToolSupport] Found ${formatted.length} MCP tool(s)`);
      return formatted;
    } catch (error) {
      logger.error(`[MCPToolSupport] Search failed for query "${query}":`, error);
      throw error;
    }
  }

  /**
   * Generate unique tool ID
   */
  private generateToolId(tool: MCPTool): string {
    const source = (tool.metadata?.source as string) || tool.name;
    return createHash("md5").update(`mcp:${source}:${tool.name}`).digest("hex");
  }

  /**
   * Extract tool tags (internal)
   */
  private extractToolTags(tool: MCPTool): string[] {
    const tags: string[] = [];

    if (tool.metadata) {
      if (Array.isArray(tool.metadata.tags)) {
        tags.push(...(tool.metadata.tags as string[]));
      }
      if (tool.metadata.source) {
        tags.push(`mcp:${tool.metadata.source}`);
      }
    }

    return tags;
  }

  /**
   * Extract parameters from metadata
   */
  private extractParameters(metadata: string | Record<string, unknown>): Record<string, unknown> {
    try {
      if (typeof metadata === "string") {
        const parsed = JSON.parse(metadata);
        return parsed.inputSchema?.properties || {};
      }
      if (metadata && typeof metadata === "object") {
        const data = metadata as Record<string, unknown>;
        const inputSchema = data.inputSchema as Record<string, unknown> | undefined;
        const properties = inputSchema?.properties as Record<string, unknown> | undefined;
        return properties || {};
      }
      return {};
    } catch {
      return {};
    }
  }

  /**
   * Extract result data
   */
  private extractResultData(result: unknown): ToolsTable {
    if (result && typeof result === "object") {
      const r = result as Record<string, unknown>;
      if ("item" in r) {
        return r.item as ToolsTable;
      }
      if ("metadata" in r && "id" in r && !("name" in r)) {
        return this.mapVectorResultToToolsTable(r as unknown as VectorSearchResult);
      }
    }
    return result as ToolsTable;
  }

  /**
   * Calculate similarity score
   */
  private calculateScore(result: unknown): number {
    if (result && typeof result === "object") {
      const r = result as Record<string, number>;
      if (r.score !== undefined) {
        return r.score;
      }
    }
    return 0;
  }

  private toVectorRecord(record: ToolsTable): VectorRecord {
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

  private mapVectorResultToToolsTable(result: VectorSearchResult): ToolsTable {
    const metadata = (result.metadata || {}) as Record<string, unknown>;
    const indexedAt = this.parseIndexedAt(metadata.indexedAt);
    const metadataValue = metadata.metadata ?? {};

    return {
      id: result.id,
      name: (metadata.name as string) || result.id,
      description: (metadata.description as string) || "",
      tags: (metadata.tags as string[]) || [],
      path: metadata.path as string | undefined,
      source: metadata.source as string | undefined,
      version: metadata.version as string | undefined,
      toolType: (metadata.toolType as "skill" | "mcp" | "builtin") || "mcp",
      metadata: metadataValue as string | Record<string, unknown>,
      vector: (metadata.vector as number[]) || [],
      indexedAt,
    };
  }

  private parseIndexedAt(value: unknown): Date {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === "number") {
      return new Date(value);
    }
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed);
      }
    }
    return new Date();
  }
}
