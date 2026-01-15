/**
 * HybridRetrievalEngine - Main Retrieval Engine
 *
 * Phase 1c: 混合检索引擎实现
 * Coordinates all retrieval methods and returns unified results
 */

import { logger } from "../../utils/logger";
import {
  HybridRetrievalConfig,
  UnifiedRetrievalResult,
  RetrievalResult,
  RetrievalMetrics,
  DisclosureStrategy,
  DisclosureLevel,
  DisclosureContent,
  HybridRetrievalError,
  HybridRetrievalErrorCode,
  DEFAULT_HYBRID_RETRIEVAL_CONFIG,
} from "../../types/enhanced-skill";
import { ToolRetrievalResult, ToolsTable } from "./types";
import { TagMatchingEngine, ITagMatchingEngine } from "./TagMatchingEngine";
import { UnifiedScoringEngine, IUnifiedScoringEngine } from "./UnifiedScoringEngine";
import {
  DisclosureManager,
  IDisclosureManager,
  DisclosureDecisionManager,
  IDisclosureDecisionManager,
  DisclosureCache,
  IDisclosureCache,
  DisclosureDecisionInput,
  DisclosureCacheKey,
  DisclosureManagerConfigV2,
  DisclosureMetrics,
} from "./DisclosureManager";
import { DisclosureConfigLoader } from "../../utils/config/disclosure-config";
import { ISearchEngine } from "./SearchEngine";
import { ILanceDBConnection } from "./LanceDBConnection";
import { IEmbeddingGenerator } from "./EmbeddingGenerator";

// ==================== Phase 2: New Interfaces ====================

/**
 * Disclosed result with disclosure content and metrics
 */
export interface DisclosedResult extends UnifiedRetrievalResult {
  /** Disclosure level applied */
  disclosureLevel: DisclosureLevel;
  /** Full disclosure content */
  disclosureContent: DisclosureContent;
  /** Performance metrics */
  metrics: DisclosureMetrics;
}

/**
 * Search result with disclosure decisions
 */
export interface DisclosureSearchResult {
  /** Disclosed results */
  results: DisclosedResult[];
  /** Total latency in milliseconds */
  totalLatencyMs: number;
  /** Cache statistics */
  cacheStats: { size: number; hits: number; misses: number };
}

/**
 * Search options for disclosure-aware search
 */
export interface SearchOptions {
  /** Maximum results */
  limit?: number;
  /** Minimum score threshold */
  minScore?: number;
  /** Maximum tokens for content */
  maxTokens?: number;
  /** Force disclosure level */
  forceLevel?: DisclosureLevel;
  /** Whether to use cache */
  useCache?: boolean;
}

/**
 * Hybrid retrieval query
 */
export interface HybridRetrievalQuery {
  /** Query text for vector/keyword/semantic search */
  query: string;
  /** Query tags for tag matching */
  tags?: string[];
  /** Maximum results */
  limit?: number;
  /** Minimum score threshold */
  minScore?: number;
  /** Disclosure level */
  disclosureLevel?: DisclosureLevel;
  /** Whether to use cache */
  useCache?: boolean;
}

/**
 * Hybrid retrieval engine interface
 */
export interface IHybridRetrievalEngine {
  search(query: HybridRetrievalQuery): Promise<UnifiedRetrievalResult[]>;
  searchWithCache(query: HybridRetrievalQuery): Promise<UnifiedRetrievalResult[]>;
  getMetrics(): RetrievalMetrics;
  clearCache(): void;
}

/**
 * Hybrid retrieval engine configuration
 */
export interface HybridRetrievalEngineConfig {
  /** Base hybrid retrieval configuration */
  hybridConfig: HybridRetrievalConfig;
  /** Search engine instance */
  searchEngine: ISearchEngine;
  /** Database connection */
  connection: ILanceDBConnection;
  /** Embedding generator */
  embeddingGenerator: IEmbeddingGenerator;
}

/**
 * HybridRetrievalEngine implementation
 * Coordinates vector, keyword, semantic, and tag-based retrieval
 */
export class HybridRetrievalEngine implements IHybridRetrievalEngine {
  private readonly _logger = logger;
  private readonly config: HybridRetrievalEngineConfig;
  private readonly tagMatchingEngine: ITagMatchingEngine;
  private readonly scoringEngine: IUnifiedScoringEngine;
  private readonly disclosureManager: IDisclosureManager;
  // Phase 2: New disclosure components
  private readonly decisionManager: IDisclosureDecisionManager;
  private readonly disclosureCache: IDisclosureCache;
  private readonly disclosureConfig: DisclosureManagerConfigV2;
  private readonly _cache: Map<string, { result: UnifiedRetrievalResult[]; expiresAt: number }> =
    new Map();
  private metrics: RetrievalMetrics;

  constructor(config: HybridRetrievalEngineConfig) {
    this.config = config;
    this.tagMatchingEngine = new TagMatchingEngine({
      hierarchy: config.hybridConfig.tagHierarchy,
      minScore: config.hybridConfig.minScore,
      maxDepth: 3,
      enableAliases: true,
    });
    this.scoringEngine = new UnifiedScoringEngine({
      rrfK: config.hybridConfig.rrfK,
      defaultWeights: {
        vector: config.hybridConfig.vectorWeight,
        keyword: config.hybridConfig.keywordWeight,
        semantic: config.hybridConfig.semanticWeight,
        tag: config.hybridConfig.tagWeight,
      },
      minScore: config.hybridConfig.minScore,
      maxResults: config.hybridConfig.maxResults,
    });
    this.disclosureManager = new DisclosureManager({
      strategy: config.hybridConfig.disclosureStrategy,
    });

    // Phase 2: Initialize disclosure config, decision manager, and cache
    this.disclosureConfig = DisclosureConfigLoader.getInstance().loadSync();
    this.decisionManager = new DisclosureDecisionManager(this.disclosureConfig.thresholds);
    this.disclosureCache = new DisclosureCache(this.disclosureConfig.cache);

    this.metrics = {
      totalTime: 0,
      vectorTime: 0,
      keywordTime: 0,
      semanticTime: 0,
      tagTime: 0,
      fusionTime: 0,
      resultCount: 0,
      cacheHit: false,
      cacheHits: 0,
      cacheMisses: 0,
    };

    this._logger.info("[HybridRetrievalEngine] Initialized", {
      vectorWeight: config.hybridConfig.vectorWeight,
      keywordWeight: config.hybridConfig.keywordWeight,
      semanticWeight: config.hybridConfig.semanticWeight,
      tagWeight: config.hybridConfig.tagWeight,
      rrfK: config.hybridConfig.rrfK,
    });
  }

  /**
   * Search for relevant tools using hybrid retrieval
   */
  async search(query: HybridRetrievalQuery): Promise<UnifiedRetrievalResult[]> {
    const startTime = Date.now();
    let cacheHit = false;

    try {
      // Check cache if enabled
      if (query.useCache !== false) {
        const cacheKey = this.getCacheKey(query);
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          this._logger.debug(`[HybridRetrievalEngine] Cache hit for query: "${query.query}"`);
          cacheHit = true;
          return cached;
        }
      }

      this._logger.info(`[HybridRetrievalEngine] Searching for: "${query.query}"`, {
        limit: query.limit ?? this.config.hybridConfig.maxResults,
        tags: query.tags,
      });

      // Execute parallel searches
      const [vectorResults, keywordResults, semanticResults] = await Promise.all([
        this.vectorSearch(query.query, query.limit),
        this.keywordSearch(query.query, query.limit),
        this.semanticSearch(query.query, query.limit),
      ]);

      // Execute tag search if tags provided
      let tagResults: RetrievalResult[] = [];
      if (query.tags && query.tags.length > 0 && this.config.hybridConfig.enableTagMatching) {
        const tagStartTime = Date.now();
        tagResults = await this.tagSearch(query.query, query.tags, query.limit);
        this.metrics.tagTime = Date.now() - tagStartTime;
      }

      // Fuse results using RRF
      const fusionResult = this.scoringEngine.fuseResults(
        vectorResults,
        keywordResults,
        semanticResults,
        tagResults
      );

      // Apply disclosure
      const disclosureLevel = query.disclosureLevel || DisclosureLevel.METADATA;
      const resultsWithDisclosure = this.disclosureManager.applyDisclosure(
        fusionResult.results,
        disclosureLevel
      );

      // Cache results if caching enabled
      if (query.useCache !== false) {
        const cacheKey = this.getCacheKey(query);
        this.addToCache(cacheKey, resultsWithDisclosure);
      }

      // Update metrics
      this.metrics.totalTime = Date.now() - startTime;
      this.metrics.fusionTime = fusionResult.duration;
      this.metrics.resultCount = resultsWithDisclosure.length;
      this.metrics.cacheHit = cacheHit;

      this._logger.debug(
        `[HybridRetrievalEngine] Search completed in ${this.metrics.totalTime}ms`,
        {
          resultCount: resultsWithDisclosure.length,
          cacheHit,
        }
      );

      return resultsWithDisclosure;
    } catch (error) {
      this._logger.error(`[HybridRetrievalEngine] Search failed for "${query.query}":`, error);
      throw new HybridRetrievalError(
        `Hybrid search failed: ${this.formatError(error)}`,
        HybridRetrievalErrorCode.CONFIG_ERROR,
        { query: query.query }
      );
    }
  }

  /**
   * Search with caching enabled (always uses cache)
   */
  async searchWithCache(query: HybridRetrievalQuery): Promise<UnifiedRetrievalResult[]> {
    return this.search({ ...query, useCache: true });
  }

  /**
   * Search with disclosure decision making (Phase 2)
   * Uses threshold-based disclosure and caching for optimal performance
   */
  async searchWithDisclosure(
    query: HybridRetrievalQuery,
    options?: SearchOptions
  ): Promise<DisclosureSearchResult> {
    const startTime = Date.now();

    try {
      this._logger.info(`[HybridRetrievalEngine] Searching with disclosure: "${query.query}"`, {
        limit: options?.limit ?? this.config.hybridConfig.maxResults,
        forceLevel: options?.forceLevel,
      });

      // Execute hybrid search
      const results = await this.performHybridSearch(query, options);

      // Process each result with disclosure decision
      const disclosedResults: DisclosedResult[] = [];
      const maxTokens = options?.maxTokens || this.disclosureConfig.l2MaxTokens;

      for (const result of results) {
        const resultStartTime = Date.now();

        // Make disclosure decision
        const decision = options?.forceLevel
          ? { level: options.forceLevel, reason: "always" as const }
          : this.decisionManager.decide({
              result,
              score: result.unifiedScore,
              maxTokens,
            });

        // Build cache key
        const cacheKey: DisclosureCacheKey = {
          id: result.id,
          level: decision.level,
          version: result.version,
          hash: this.generateContentHash(result),
        };

        // Check cache
        let content = this.disclosureCache.get(cacheKey);
        let fromCache = true;

        // Cache miss - load content
        if (!content) {
          fromCache = false;
          content = await this.loadDisclosureContent(result, decision.level);
          this.disclosureCache.set(cacheKey, content);
        }

        // Calculate latency
        const latency = Date.now() - resultStartTime;

        // Build metrics based on disclosure level
        const metrics: DisclosureMetrics = {
          l1Ms: decision.level === DisclosureLevel.METADATA ? latency : 0,
          l2Ms: decision.level === DisclosureLevel.CONTENT ? latency : 0,
          l3Ms: decision.level === DisclosureLevel.RESOURCES ? latency : 0,
          cacheHit: fromCache,
          disclosureLevel: decision.level,
        };

        disclosedResults.push({
          ...result,
          disclosureLevel: decision.level,
          disclosureContent: content,
          metrics,
        });
      }

      const totalLatency = Date.now() - startTime;

      this._logger.debug(
        `[HybridRetrievalEngine] Disclosure search completed in ${totalLatency}ms`,
        {
          resultCount: disclosedResults.length,
          cacheStats: this.disclosureCache.stats(),
        }
      );

      return {
        results: disclosedResults,
        totalLatencyMs: totalLatency,
        cacheStats: this.disclosureCache.stats(),
      };
    } catch (error) {
      this._logger.error(`[HybridRetrievalEngine] Disclosure search failed:`, error);
      throw new HybridRetrievalError(
        `Disclosure search failed: ${this.formatError(error)}`,
        HybridRetrievalErrorCode.DISCLOSURE_ERROR,
        { query: query.query }
      );
    }
  }

  /**
   * Perform hybrid search and return unified results
   */
  private async performHybridSearch(
    query: HybridRetrievalQuery,
    options?: SearchOptions
  ): Promise<UnifiedRetrievalResult[]> {
    // Check cache if enabled
    if (options?.useCache !== false) {
      const cacheKey = this.getDisclosureCacheKey(query, options);
      const cached = this.getFromDisclosureCache(cacheKey);
      if (cached) {
        this._logger.debug(
          `[HybridRetrievalEngine] Disclosure cache hit for query: "${query.query}"`
        );
        return cached;
      }
    }

    // Execute parallel searches
    const [vectorResults, keywordResults, semanticResults] = await Promise.all([
      this.vectorSearch(query.query, options?.limit),
      this.keywordSearch(query.query, options?.limit),
      this.semanticSearch(query.query, options?.limit),
    ]);

    // Execute tag search if tags provided
    let tagResults: RetrievalResult[] = [];
    if (query.tags && query.tags.length > 0 && this.config.hybridConfig.enableTagMatching) {
      tagResults = await this.tagSearch(query.query, query.tags, options?.limit);
    }

    // Fuse results using RRF
    const fusionResult = this.scoringEngine.fuseResults(
      vectorResults,
      keywordResults,
      semanticResults,
      tagResults
    );

    // Apply minimum score filter
    const minScore = options?.minScore || this.config.hybridConfig.minScore;
    const filteredResults = fusionResult.results.filter((r) => r.unifiedScore >= minScore);

    // Cache results if caching enabled
    if (options?.useCache !== false) {
      const cacheKey = this.getDisclosureCacheKey(query, options);
      this.addToDisclosureCache(cacheKey, filteredResults);
    }

    return filteredResults;
  }

  /**
   * Load disclosure content based on level
   */
  private async loadDisclosureContent(
    result: UnifiedRetrievalResult,
    level: DisclosureLevel
  ): Promise<DisclosureContent> {
    const baseContent: DisclosureContent = {
      level,
      name: result.name,
      description: result.description,
      tokenCount: this.estimateTokens(result.name) + this.estimateTokens(result.description),
    };

    switch (level) {
      case DisclosureLevel.METADATA:
        return baseContent;

      case DisclosureLevel.CONTENT:
        return {
          ...baseContent,
          inputSchema: this.extractInputSchema(result),
          outputSchema: this.extractOutputSchema(result),
          examples: this.extractExamples(result),
          tokenCount:
            baseContent.tokenCount +
            this.estimateTokens(JSON.stringify(baseContent.inputSchema || {})),
        };

      case DisclosureLevel.RESOURCES:
        return {
          ...baseContent,
          inputSchema: this.extractInputSchema(result),
          outputSchema: this.extractOutputSchema(result),
          resources: this.extractResources(result),
          examples: this.extractExamples(result),
          tokenCount:
            baseContent.tokenCount +
            this.estimateTokens(JSON.stringify(baseContent.inputSchema || {})) +
            this.estimateTokens(JSON.stringify(baseContent.outputSchema || {})) +
            this.estimateTokens((baseContent.resources || []).join(", ")),
        };

      default:
        return baseContent;
    }
  }

  /**
   * Generate content hash for cache key
   */
  private generateContentHash(result: UnifiedRetrievalResult): string {
    const content = `${result.id}:${result.name}:${result.description}:${result.version || ""}`;
    return require("crypto").createHash("md5").update(content).digest("hex");
  }

  /**
   * Generate cache key for disclosure search
   */
  private getDisclosureCacheKey(query: HybridRetrievalQuery, options?: SearchOptions): string {
    const parts = [
      query.query,
      query.tags?.join(",") || "",
      String(options?.limit ?? this.config.hybridConfig.maxResults),
      String(options?.minScore || this.config.hybridConfig.minScore),
      String(options?.forceLevel || "auto"),
    ];
    return require("crypto").createHash("md5").update(parts.join("|")).digest("hex");
  }

  /**
   * Get results from disclosure cache
   */
  private getFromDisclosureCache(cacheKey: string): UnifiedRetrievalResult[] | null {
    const entry = this._cache.get(cacheKey);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.result;
    }
    return null;
  }

  /**
   * Add results to disclosure cache
   */
  private addToDisclosureCache(cacheKey: string, results: UnifiedRetrievalResult[]): void {
    if (this._cache.size >= 1000) {
      const oldestKey = this._cache.keys().next().value;
      this._cache.delete(oldestKey);
    }

    const expiresAt = Date.now() + this.config.hybridConfig.cacheTTL * 1000;
    this._cache.set(cacheKey, { result: results, expiresAt });
  }

  /**
   * Extract input schema from result metadata
   */
  private extractInputSchema(result: UnifiedRetrievalResult): Record<string, unknown> | undefined {
    if (result.metadata && typeof result.metadata === "object") {
      const metadata = result.metadata as Record<string, unknown>;
      if (metadata.inputSchema) {
        return metadata.inputSchema as Record<string, unknown>;
      }
      if (metadata.parameters) {
        return metadata.parameters as Record<string, unknown>;
      }
      if (metadata.input) {
        return metadata.input as Record<string, unknown>;
      }
    }
    return undefined;
  }

  /**
   * Extract output schema from result metadata
   */
  private extractOutputSchema(result: UnifiedRetrievalResult): Record<string, unknown> | undefined {
    if (result.metadata && typeof result.metadata === "object") {
      const metadata = result.metadata as Record<string, unknown>;
      if (metadata.outputSchema) {
        return metadata.outputSchema as Record<string, unknown>;
      }
      if (metadata.output) {
        return metadata.output as Record<string, unknown>;
      }
    }
    return undefined;
  }

  /**
   * Extract examples from result metadata
   */
  private extractExamples(
    result: UnifiedRetrievalResult
  ): Array<{ input: string; output: string }> {
    if (result.metadata && typeof result.metadata === "object") {
      const metadata = result.metadata as Record<string, unknown>;
      if (Array.isArray(metadata.examples)) {
        const examples = metadata.examples as string[];
        return examples.map((ex, idx) => ({
          input: `Example ${idx + 1} input`,
          output: ex,
        }));
      }
      if (Array.isArray(metadata.example)) {
        const examples = metadata.example as string[];
        return examples.map((ex, idx) => ({
          input: `Example ${idx + 1} input`,
          output: ex,
        }));
      }
    }
    return [];
  }

  /**
   * Extract resources from result metadata
   */
  private extractResources(
    result: UnifiedRetrievalResult
  ): Array<{ type: string; path: string; description: string }> {
    if (result.metadata && typeof result.metadata === "object") {
      const metadata = result.metadata as Record<string, unknown>;
      if (Array.isArray(metadata.resources)) {
        const resources = metadata.resources as string[];
        return resources.map((res, idx) => ({
          type: "file",
          path: res,
          description: `Resource ${idx + 1}`,
        }));
      }
      if (Array.isArray(metadata.relatedFiles)) {
        const files = metadata.relatedFiles as string[];
        return files.map((file, idx) => ({
          type: "file",
          path: file,
          description: `Related file ${idx + 1}`,
        }));
      }
      if (Array.isArray(metadata.dependencies)) {
        const deps = metadata.dependencies as string[];
        return deps.map((dep, idx) => ({
          type: "dependency",
          path: dep,
          description: `Dependency ${idx + 1}`,
        }));
      }
    }
    return result.path ? [{ type: "file", path: result.path, description: "Main resource" }] : [];
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    if (!text) {
      return 0;
    }
    return Math.ceil(text.length / 4);
  }

  /**
   * Get retrieval metrics
   */
  getMetrics(): RetrievalMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this._cache.clear();
    this._logger.info("[HybridRetrievalEngine] Cache cleared");
  }

  /**
   * Perform vector search
   */
  private async vectorSearch(query: string, limit?: number): Promise<RetrievalResult[]> {
    const startTime = Date.now();

    try {
      const results = await this.config.searchEngine.search(query, {
        limit: limit ?? this.config.hybridConfig.maxResults,
        minScore: this.config.hybridConfig.minScore,
      });

      this.metrics.vectorTime = Date.now() - startTime;

      return results.map((r) => ({
        id: r.id,
        score: r.score,
        method: "vector" as const,
        metadata: {
          name: r.name,
          description: r.description,
          tags: r.tags,
          toolType: r.toolType,
          path: r.metadata?.path,
          version: r.metadata?.version,
        },
      }));
    } catch (error) {
      this._logger.error("[HybridRetrievalEngine] Vector search failed:", error);
      this.metrics.vectorTime = Date.now() - startTime;
      return [];
    }
  }

  /**
   * Perform keyword search
   */
  private async keywordSearch(query: string, limit?: number): Promise<RetrievalResult[]> {
    const startTime = Date.now();

    try {
      // Simple keyword matching - can be enhanced with full-text search
      const searchTerms = query.toLowerCase().split(/\s+/);
      const allTools = await this.getAllTools();

      const results = allTools
        .filter((tool) => {
          const searchableText =
            `${tool.name} ${tool.description} ${tool.tags?.join(" ")}`.toLowerCase();
          return searchTerms.some((term) => searchableText.includes(term));
        })
        .map((tool) => {
          // Calculate keyword match score
          const matchCount = searchTerms.filter((term) =>
            `${tool.name} ${tool.description}`.toLowerCase().includes(term)
          ).length;
          const score = matchCount / searchTerms.length;

          return {
            id: tool.id,
            score: Math.min(score, 1),
            method: "keyword" as const,
            metadata: {
              name: tool.name,
              description: tool.description,
              tags: tool.tags,
              toolType: tool.toolType,
              path: tool.path,
              version: tool.version,
            },
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit ?? this.config.hybridConfig.maxResults);

      this.metrics.keywordTime = Date.now() - startTime;

      return results;
    } catch (error) {
      this._logger.error("[HybridRetrievalEngine] Keyword search failed:", error);
      this.metrics.keywordTime = Date.now() - startTime;
      return [];
    }
  }

  /**
   * Perform semantic search
   */
  private async semanticSearch(query: string, limit?: number): Promise<RetrievalResult[]> {
    const startTime = Date.now();

    try {
      // Semantic search is essentially vector search with query embedding
      // Reuse vector search but mark as semantic
      const vectorResults = await this.vectorSearch(query, limit);

      this.metrics.semanticTime = Date.now() - startTime;

      return vectorResults.map((r) => ({
        ...r,
        method: "semantic" as const,
      }));
    } catch (error) {
      this._logger.error("[HybridRetrievalEngine] Semantic search failed:", error);
      this.metrics.semanticTime = Date.now() - startTime;
      return [];
    }
  }

  /**
   * Perform tag-based search
   */
  private async tagSearch(
    query: string,
    tags: string[],
    limit?: number
  ): Promise<RetrievalResult[]> {
    try {
      // Get candidates from vector search first
      const candidates = await this.config.searchEngine.search(query, {
        limit: (limit ?? this.config.hybridConfig.maxResults) * 2,
        minScore: 0.1, // Lower threshold for tag matching
      });

      // Match tags
      const tagMatchResults = await this.tagMatchingEngine.matchTags(
        tags,
        candidates as ToolRetrievalResult[]
      );

      // Convert to retrieval results
      return tagMatchResults
        .filter((match) => match.matched && match.score >= this.config.hybridConfig.minScore)
        .map((match) => {
          const candidate = candidates.find((c) => c.id === match.tag);
          return {
            id: match.tag || candidate?.id || "",
            score: match.score,
            method: "tag" as const,
            metadata: {
              name: candidate?.name,
              description: candidate?.description,
              tags: candidate?.tags,
              toolType: candidate?.toolType,
              path: candidate?.metadata?.path,
              version: candidate?.metadata?.version,
            },
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit ?? this.config.hybridConfig.maxResults);
    } catch (error) {
      this._logger.error("[HybridRetrievalEngine] Tag search failed:", error);
      return [];
    }
  }

  /**
   * Get all tools from database
   */
  private async getAllTools(): Promise<ToolsTable[]> {
    try {
      // This would typically query the database
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      this._logger.error("[HybridRetrievalEngine] Failed to get all tools:", error);
      return [];
    }
  }

  /**
   * Generate cache key for query
   */
  private getCacheKey(query: HybridRetrievalQuery): string {
    const parts = [
      query.query,
      query.tags?.join(",") || "",
      String(query.limit ?? this.config.hybridConfig.maxResults),
      String(query.disclosureLevel || DisclosureLevel.METADATA),
    ];
    return require("crypto").createHash("md5").update(parts.join("|")).digest("hex");
  }

  /**
   * Get results from cache
   */
  private getFromCache(cacheKey: string): UnifiedRetrievalResult[] | null {
    const entry = this._cache.get(cacheKey);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.result;
    }
    return null;
  }

  /**
   * Add results to cache
   */
  private addToCache(cacheKey: string, results: UnifiedRetrievalResult[]): void {
    // Check cache size limit
    if (this._cache.size >= 1000) {
      // Remove oldest entry
      const oldestKey = this._cache.keys().next().value;
      this._cache.delete(oldestKey);
    }

    const expiresAt = Date.now() + this.config.hybridConfig.cacheTTL * 1000;
    this._cache.set(cacheKey, { result: results, expiresAt });
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
    return "Unknown error occurred in HybridRetrievalEngine";
  }

  /**
   * Dispose of resources - cleanup disclosure cache
   */
  async dispose(): Promise<void> {
    if (this.disclosureCache && "dispose" in this.disclosureCache) {
      await this.disclosureCache.dispose();
    }
  }
}
