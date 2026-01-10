/**
 * SearchEngine - Search Logic
 *
 * Handles vector search, result formatting, and filtering.
 */

import { logger } from "../../utils/logger";
import {
  ToolRetrievalResult,
  RetrievalFilter,
  RetrievalSortingOptions,
  ToolsTable,
  ToolType,
} from "./types";
import { ILanceDBConnection } from "./LanceDBConnection";
import { IEmbeddingGenerator } from "./EmbeddingGenerator";
import { THRESHOLDS } from "../../constants";

/**
 * SearchEngine interface
 */
export interface ISearchEngine {
  search(query: string, limit?: number, minScore?: number): Promise<ToolRetrievalResult[]>;
  formatResults(results: unknown[]): ToolRetrievalResult[];
  applyFilters(results: ToolRetrievalResult[], filters: RetrievalFilter[]): ToolRetrievalResult[];
  sortResults(
    results: ToolRetrievalResult[],
    options: RetrievalSortingOptions
  ): ToolRetrievalResult[];
}

/**
 * SearchEngine implementation
 */
export class SearchEngine implements ISearchEngine {
  private readonly connection: ILanceDBConnection;
  private readonly embeddingGenerator: IEmbeddingGenerator;
  private readonly defaultLimit: number;
  private readonly defaultThreshold: number;

  constructor(
    connection: ILanceDBConnection,
    embeddingGenerator: IEmbeddingGenerator,
    defaultLimit: number = 5,
    defaultThreshold: number = THRESHOLDS.RELEVANT_SKILLS
  ) {
    this.connection = connection;
    this.embeddingGenerator = embeddingGenerator;
    this.defaultLimit = defaultLimit;
    this.defaultThreshold = defaultThreshold;
  }

  /**
   * Search for relevant skills
   */
  async search(query: string, limit?: number, minScore?: number): Promise<ToolRetrievalResult[]> {
    const effectiveLimit = limit ?? this.defaultLimit;
    const effectiveThreshold = minScore ?? this.defaultThreshold;

    try {
      logger.info(
        `[SearchEngine] Searching for: "${query}" (limit: ${effectiveLimit}, threshold: ${effectiveThreshold})`
      );

      // Generate query vector
      const queryVector = await this.embeddingGenerator.generateForText(query);

      // Get table
      const table = await this.connection.getTable();
      if (!table) {
        logger.warn("[SearchEngine] Table not initialized");
        return [];
      }

      // Execute vector search
      const vectorQuery = table
        .query()
        .nearestTo(queryVector.values)
        .distanceType("cosine")
        .limit(effectiveLimit * 2); // Get more results for threshold filtering

      const results = await vectorQuery.toArray();

      // Format and filter results
      const formattedResults = this.formatSearchResults(
        results,
        effectiveLimit,
        effectiveThreshold
      );

      logger.info(`[SearchEngine] Found ${formattedResults.length} relevant skill(s)`);
      return formattedResults;
    } catch (error) {
      logger.error(`[SearchEngine] Search failed for query "${query}":`, error);
      throw error;
    }
  }

  /**
   * Format search results
   */
  formatResults(results: unknown[]): ToolRetrievalResult[] {
    return this.formatSearchResults(results, this.defaultLimit, this.defaultThreshold);
  }

  /**
   * Format search results (internal)
   */
  private formatSearchResults(
    results: unknown[],
    limit: number,
    threshold: number
  ): ToolRetrievalResult[] {
    const formatted: ToolRetrievalResult[] = [];

    // Handle LanceDB result format
    const resultArray = Array.isArray(results) ? results : [results];

    for (const result of resultArray.slice(0, limit)) {
      try {
        const data = this.extractResultData(result);

        // Calculate score
        const score = this.calculateScore(result);

        // Apply threshold filter
        if (score < threshold) {
          logger.debug(
            `[SearchEngine] Filtered out result with score ${score.toFixed(4)} < threshold ${threshold}`
          );
          continue;
        }

        // Parse metadata
        const metadata = this.parseMetadata(data);

        // Format result based on tool type
        const tool = this.formatTool(data, metadata);

        formatted.push({
          id: data.id,
          name: data.name,
          description: data.description,
          score,
          toolType: data.toolType || "skill",
          metadata: tool as Record<string, unknown>,
          tags: data.tags || [],
        });
      } catch (error) {
        logger.warn("[SearchEngine] Failed to format search result:", error);
      }
    }

    return formatted;
  }

  /**
   * Extract result data from LanceDB response
   */
  private extractResultData(result: unknown): ToolsTable {
    if (result && typeof result === "object") {
      const r = result as Record<string, unknown>;
      if ("item" in r) {
        return r.item as ToolsTable;
      }
    }
    return result as ToolsTable;
  }

  /**
   * Calculate similarity score from result
   */
  private calculateScore(result: unknown): number {
    if (result && typeof result === "object") {
      const r = result as Record<string, number>;

      if (r._distance !== undefined) {
        // LanceDB returns cosine distance, convert to similarity
        // Cosine distance range [0, 2], so similarity = 1 - distance
        return Math.max(0, 1 - r._distance);
      }
      if (r.score !== undefined) {
        return r.score;
      }
      if (r.similarity !== undefined) {
        return r.similarity;
      }
    }
    return 0;
  }

  /**
   * Parse metadata JSON string
   */
  private parseMetadata(data: ToolsTable): Record<string, unknown> {
    try {
      if (typeof data.metadata === "string") {
        return JSON.parse(data.metadata);
      }
      return data.metadata || {};
    } catch {
      logger.warn("[SearchEngine] Failed to parse metadata JSON");
      return {};
    }
  }

  /**
   * Format tool based on type
   */
  private formatTool(data: ToolsTable, metadata: Record<string, unknown>): Record<string, unknown> {
    if (data.toolType === "mcp") {
      // MCP tool format
      return {
        name: data.name,
        description: data.description,
        type: "mcp" as const,
        source: data.source,
        tags: data.tags,
        metadata: {
          ...metadata,
          version: data.version,
          path: data.path,
        },
      };
    }

    if (data.toolType === "builtin") {
      // Builtin tool format
      return {
        name: data.name,
        description: data.description,
        type: ToolType.BUILTIN,
        tags: data.tags,
        version: data.version,
        path: data.path,
        metadata: {
          ...metadata,
          builtin: true,
        },
      };
    }

    // Skill tool format (default)
    return {
      name: data.name,
      description: data.description,
      type: ToolType.SKILL,
      tags: data.tags,
      version: data.version,
      path: data.path,
      parameters: (metadata.parameters as Record<string, unknown>) || {
        type: "object",
        properties: {},
        required: [],
      },
      enabled: true,
      level: 1,
    };
  }

  /**
   * Apply filters to results
   */
  applyFilters(results: ToolRetrievalResult[], filters: RetrievalFilter[]): ToolRetrievalResult[] {
    if (!filters || filters.length === 0) {
      return results;
    }

    return results.filter((result) => {
      return filters.every((filter) => this.applyFilter(result, filter));
    });
  }

  /**
   * Apply single filter
   */
  private applyFilter(result: ToolRetrievalResult, filter: RetrievalFilter): boolean {
    const value = (result.metadata as Record<string, unknown>)?.[filter.field];
    return this.compareValues(value, filter.operator, filter.value);
  }

  /**
   * Compare values based on operator
   */
  private compareValues(
    actual: unknown,
    operator: RetrievalFilter["operator"],
    expected: unknown
  ): boolean {
    switch (operator) {
      case "eq":
        return actual === expected;
      case "ne":
        return actual !== expected;
      case "gt":
        return typeof actual === "number" && actual > (expected as number);
      case "lt":
        return typeof actual === "number" && actual < (expected as number);
      case "contains":
        return typeof actual === "string" && actual.includes(expected as string);
      case "in":
        return Array.isArray(expected) && expected.includes(actual);
      default:
        return true;
    }
  }

  /**
   * Sort results
   */
  sortResults(
    results: ToolRetrievalResult[],
    options: RetrievalSortingOptions
  ): ToolRetrievalResult[] {
    const sorted = [...results];

    sorted.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (options.field) {
        case "score":
          aValue = a.score;
          bValue = b.score;
          break;
        case "relevance":
          aValue = a.score;
          bValue = b.score;
          break;
        case "popularity":
          aValue = (a.metadata?.useCount as number) || 0;
          bValue = (b.metadata?.useCount as number) || 0;
          break;
        default:
          aValue = a.score;
          bValue = b.score;
      }

      if (options.order === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return sorted;
  }
}
