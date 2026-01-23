/**
 * SearchEngine - Search Logic
 *
 * Handles vector search, result formatting, and filtering.
 * Includes semantic caching for improved performance.
 */

import { logger } from "../../utils/logger";
import {
  ToolRetrievalResult,
  RetrievalFilter,
  RetrievalSortingOptions,
  ToolsTable,
  ToolType,
} from "./types";
import type { IVectorStorage, VectorSearchResult } from "../../core/storage/interfaces";
import { IEmbeddingGenerator } from "./EmbeddingGenerator";
import { THRESHOLDS } from "../../constants";
import { SemanticCache } from "../cache/SemanticCache";

/**
 * Search options extended with caching control
 */
export interface SearchOptions {
  limit?: number;
  minScore?: number;
  /** Disable cache lookup for this search */
  skipCache?: boolean;
  /** Disable caching the result */
  noCache?: boolean;
}

/**
 * SearchEngine interface
 */
export interface ISearchEngine {
  search(query: string, options?: SearchOptions): Promise<ToolRetrievalResult[]>;
  keywordSearch(query: string, limit?: number, threshold?: number): Promise<ToolRetrievalResult[]>;
  formatResults(results: VectorSearchResult[]): ToolRetrievalResult[];
  applyFilters(results: ToolRetrievalResult[], filters: RetrievalFilter[]): ToolRetrievalResult[];
  sortResults(
    results: ToolRetrievalResult[],
    options: RetrievalSortingOptions
  ): ToolRetrievalResult[];
  /** Get cache statistics (if caching is enabled) */
  getCacheStats?: () => ReturnType<SemanticCache["getStats"]>;
}

/**
 * SearchEngine implementation
 */
export class SearchEngine implements ISearchEngine {
  private readonly storage: IVectorStorage;
  private readonly embeddingGenerator: IEmbeddingGenerator;
  private readonly defaultLimit: number;
  private readonly defaultThreshold: number;
  private readonly semanticCache: SemanticCache | null;
  private readonly dimension: number;

  constructor(
    storage: IVectorStorage,
    embeddingGenerator: IEmbeddingGenerator,
    options?: {
      defaultLimit?: number;
      defaultThreshold?: number;
      semanticCache?: SemanticCache;
    }
  ) {
    this.storage = storage;
    this.embeddingGenerator = embeddingGenerator;
    this.defaultLimit = options?.defaultLimit ?? 5;
    this.defaultThreshold = options?.defaultThreshold ?? THRESHOLDS.RELEVANT_SKILLS;
    this.semanticCache = options?.semanticCache ?? null;
    this.dimension = storage.getDimension();

    // Set up embedding service for cache if available
    if (this.semanticCache) {
      this.semanticCache.setEmbeddingService({
        generateForText: (text: string) => this.embeddingGenerator.generateForText(text),
      });
    }
  }

  /**
   * Search for relevant skills (with optional caching and fallback)
   */
  async search(query: string, options?: SearchOptions): Promise<ToolRetrievalResult[]> {
    const effectiveLimit = options?.limit ?? this.defaultLimit;
    const effectiveThreshold = options?.minScore ?? this.defaultThreshold;

    // Try semantic cache first
    if (this.semanticCache && !options?.skipCache) {
      const cachedResult = await this.semanticCache.findSimilar(query);
      if (cachedResult) {
        logger.info(
          `[SearchEngine] Cache hit for query "${query.substring(0, 50)}..." (similarity: ${cachedResult.similarity.toFixed(4)})`
        );
        return cachedResult.cachedQuery.result as ToolRetrievalResult[];
      }
    }

    try {
      logger.info(
        `[SearchEngine] Searching for: "${query}" (limit: ${effectiveLimit}, threshold: ${effectiveThreshold})`
      );

      // Generate query vector
      const queryVector = await this.embeddingGenerator.generateForText(query);

      // Execute vector search
      const results = await this.storage.search(queryVector.values, {
        limit: effectiveLimit * 2,
        threshold: effectiveThreshold,
        distanceType: "cosine",
      });

      // Format and filter results
      const formattedResults = this.formatSearchResults(
        results,
        effectiveLimit,
        effectiveThreshold
      );

      // Store the result in cache
      if (this.semanticCache && !options?.noCache) {
        await this.semanticCache.store(query, formattedResults);
      }

      logger.info(`[SearchEngine] Found ${formattedResults.length} relevant skill(s)`);
      return formattedResults;
    } catch (error) {
      logger.error(`[SearchEngine] Vector search failed for query "${query}":`, error);
      logger.warn(`[SearchEngine] Falling back to keyword search for query "${query}"`);

      // Fallback to keyword search
      return this.fallbackKeywordSearch(query, effectiveLimit, effectiveThreshold);
    }
  }

  /**
   * Fallback keyword-based search when vector search fails
   * @param query Search query
   * @param limit Maximum results to return
   * @param threshold Minimum score threshold
   * @returns Tool retrieval results from keyword matching
   */
  private async fallbackKeywordSearch(
    query: string,
    limit: number,
    threshold: number
  ): Promise<ToolRetrievalResult[]> {
    try {
      logger.info(`[SearchEngine] Executing fallback keyword search for: "${query}"`);

      // Get all tools for keyword matching
      const searchTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);

      const allRecords = await this.getAllRecordsForKeywordSearch(limit * 3);

      // Filter by keyword matching
      const results: ToolRetrievalResult[] = [];

      for (const record of allRecords) {
        try {
          const data = this.extractResultData(record);

          // Calculate keyword match score
          const searchableText =
            `${data.name} ${data.description} ${(data.tags || []).join(" ")}`.toLowerCase();
          const matchCount = searchTerms.filter((term) => searchableText.includes(term)).length;

          if (matchCount === 0) {
            continue;
          }

          // Calculate score based on match quality
          const nameMatches = searchTerms.filter((term) =>
            data.name.toLowerCase().includes(term)
          ).length;
          const score = (nameMatches * 0.6 + matchCount * 0.4) / searchTerms.length;

          // Apply threshold filter
          if (score < threshold) {
            logger.debug(
              `[SearchEngine] Fallback filtered out result "${data.name}" with score ${score.toFixed(4)} < threshold ${threshold}`
            );
            continue;
          }

          // Parse metadata
          const metadata = this.parseMetadata(data);

          // Format result
          results.push({
            id: data.id,
            name: data.name,
            description: data.description,
            score: Math.min(score, 1),
            toolType: data.toolType || "skill",
            metadata: this.formatFallbackTool(data, metadata),
            tags: data.tags || [],
          });
        } catch (formatError) {
          logger.warn("[SearchEngine] Failed to format fallback result:", formatError);
        }
      }

      // Sort by score and limit results
      const sortedResults = results.sort((a, b) => b.score - a.score).slice(0, limit);

      logger.info(`[SearchEngine] Fallback keyword search found ${sortedResults.length} result(s)`);
      return sortedResults;
    } catch (fallbackError) {
      logger.error("[SearchEngine] Fallback keyword search also failed:", fallbackError);
      // Return empty array as last resort - never throw from search
      return [];
    }
  }

  /**
   * Format tool data for fallback results
   */
  private formatFallbackTool(
    data: ToolsTable,
    metadata: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      name: data.name,
      description: data.description,
      type: data.toolType || "skill",
      source: data.source,
      tags: data.tags,
      metadata: {
        ...metadata,
        version: data.version,
        path: data.path,
      },
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.semanticCache?.getStats();
  }

  /**
   * Public keyword search method for fallback scenarios
   * @param query Search query
   * @param limit Maximum results to return
   * @param threshold Minimum score threshold
   * @returns Tool retrieval results from keyword matching
   */
  async keywordSearch(
    query: string,
    limit?: number,
    threshold?: number
  ): Promise<ToolRetrievalResult[]> {
    const effectiveLimit = limit ?? this.defaultLimit;
    const effectiveThreshold = threshold ?? this.defaultThreshold;

    try {
      logger.info(`[SearchEngine] Executing keyword search for: "${query}"`);

      // Get all tools for keyword matching
      const searchTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);

      if (searchTerms.length === 0) {
        return [];
      }

      const allRecords = await this.getAllRecordsForKeywordSearch(effectiveLimit * 3);

      // Filter by keyword matching
      const results: ToolRetrievalResult[] = [];

      for (const record of allRecords) {
        try {
          const data = this.extractResultData(record);

          // Calculate keyword match score
          const searchableText =
            `${data.name} ${data.description} ${(data.tags || []).join(" ")}`.toLowerCase();
          const matchCount = searchTerms.filter((term) => searchableText.includes(term)).length;

          if (matchCount === 0) {
            continue;
          }

          // Calculate score based on match quality
          const nameMatches = searchTerms.filter((term) =>
            data.name.toLowerCase().includes(term)
          ).length;
          const score = (nameMatches * 0.6 + matchCount * 0.4) / searchTerms.length;

          // Apply threshold filter
          if (score < effectiveThreshold) {
            continue;
          }

          // Parse metadata
          const metadata = this.parseMetadata(data);

          // Format result
          results.push({
            id: data.id,
            name: data.name,
            description: data.description,
            score: Math.min(score, 1),
            toolType: data.toolType || "skill",
            metadata: this.formatTool(data, metadata) as Record<string, unknown>,
            tags: data.tags || [],
          });
        } catch (formatError) {
          logger.warn("[SearchEngine] Failed to format keyword search result:", formatError);
        }
      }

      // Sort by score and limit results
      const sortedResults = results.sort((a, b) => b.score - a.score).slice(0, effectiveLimit);

      logger.info(`[SearchEngine] Keyword search found ${sortedResults.length} result(s)`);
      return sortedResults;
    } catch (error) {
      logger.error("[SearchEngine] Keyword search failed:", error);
      return [];
    }
  }

  /**
   * Format search results
   */
  formatResults(results: VectorSearchResult[]): ToolRetrievalResult[] {
    return this.formatSearchResults(results, this.defaultLimit, this.defaultThreshold);
  }

  /**
   * Format search results (internal)
   */
  private formatSearchResults(
    results: VectorSearchResult[],
    limit: number,
    threshold: number
  ): ToolRetrievalResult[] {
    const formatted: ToolRetrievalResult[] = [];

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
   * Extract result data from vector search response
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
   * Calculate similarity score from result
   */
  private calculateScore(result: unknown): number {
    if (result && typeof result === "object") {
      const r = result as Record<string, number>;

      if (r.score !== undefined) {
        return r.score;
      }
      if (r.similarity !== undefined) {
        return r.similarity;
      }
    }
    return 0;
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
      toolType: (metadata.toolType as "skill" | "mcp" | "builtin") || "skill",
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

  private async getAllRecordsForKeywordSearch(limit: number): Promise<VectorSearchResult[]> {
    try {
      const totalCount = await this.storage.count();

      if (totalCount === 0) {
        return [];
      }

      if (totalCount > 10000) {
        logger.warn("[SearchEngine] Too many records for keyword search");
        return [];
      }

      const queryVector = new Array(this.dimension).fill(0);
      return await this.storage.search(queryVector, {
        limit: Math.min(totalCount, limit),
      });
    } catch (error) {
      logger.error("[SearchEngine] Failed to load records for keyword search:", error);
      return [];
    }
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
