/**
 * UnifiedScoringEngine - RRF Fusion & Score Normalization
 *
 * Phase 1c: 统一评分引擎实现
 * Implements RRF fusion algorithm and weighted score combination
 */

import { logger } from "../../utils/logger";
import {
  UnifiedRetrievalResult,
  RetrievalResult,
  RetrievalMethod,
  FusionResult,
  HybridRetrievalError,
  HybridRetrievalErrorCode,
  DEFAULT_HYBRID_RETRIEVAL_CONFIG,
} from "../../types/enhanced-skill";

/**
 * Unified scoring engine interface
 */
export interface IUnifiedScoringEngine {
  fuseResults(
    vectorResults: RetrievalResult[],
    keywordResults: RetrievalResult[],
    semanticResults: RetrievalResult[],
    tagResults: RetrievalResult[]
  ): FusionResult;
  normalizeScores(results: RetrievalResult[]): RetrievalResult[];
  blendScores(result: RetrievalResult, weights: Record<RetrievalMethod, number>): number;
  deduplicateResults(results: UnifiedRetrievalResult[]): UnifiedRetrievalResult[];
  rerankResults(results: UnifiedRetrievalResult[], limit: number): UnifiedRetrievalResult[];
}

/**
 * Unified scoring engine configuration
 */
export interface UnifiedScoringEngineConfig {
  /** RRF constant k */
  rrfK: number;
  /** Score normalization method */
  normalizationMethod: "minmax" | "zscore" | "percentile";
  /** Default weights for each retrieval method */
  defaultWeights: Record<RetrievalMethod, number>;
  /** Minimum score threshold */
  minScore: number;
  /** Maximum results */
  maxResults: number;
}

/**
 * Default unified scoring engine configuration
 */
export const DEFAULT_SCORING_CONFIG: UnifiedScoringEngineConfig = {
  rrfK: DEFAULT_HYBRID_RETRIEVAL_CONFIG.rrfK,
  normalizationMethod: "minmax",
  defaultWeights: {
    vector: DEFAULT_HYBRID_RETRIEVAL_CONFIG.vectorWeight,
    keyword: DEFAULT_HYBRID_RETRIEVAL_CONFIG.keywordWeight,
    semantic: DEFAULT_HYBRID_RETRIEVAL_CONFIG.semanticWeight,
    tag: DEFAULT_HYBRID_RETRIEVAL_CONFIG.tagWeight,
  },
  minScore: DEFAULT_HYBRID_RETRIEVAL_CONFIG.minScore,
  maxResults: DEFAULT_HYBRID_RETRIEVAL_CONFIG.maxResults,
};

/**
 * UnifiedScoringEngine implementation
 * Handles RRF fusion, score normalization, and result deduplication
 */
export class UnifiedScoringEngine implements IUnifiedScoringEngine {
  private readonly _logger = logger;
  private readonly config: UnifiedScoringEngineConfig;

  constructor(config?: Partial<UnifiedScoringEngineConfig>) {
    this.config = { ...DEFAULT_SCORING_CONFIG, ...config };
    this._logger.info("[UnifiedScoringEngine] Initialized with config:", {
      rrfK: this.config.rrfK,
      normalizationMethod: this.config.normalizationMethod,
      defaultWeights: this.config.defaultWeights,
    });
  }

  /**
   * Fuse results from multiple retrieval methods using RRF
   */
  fuseResults(
    vectorResults: RetrievalResult[],
    keywordResults: RetrievalResult[],
    semanticResults: RetrievalResult[],
    tagResults: RetrievalResult[]
  ): FusionResult {
    const startTime = Date.now();

    try {
      this._logger.info("[UnifiedScoringEngine] Fusing results from 4 retrieval methods", {
        vectorCount: vectorResults.length,
        keywordCount: keywordResults.length,
        semanticCount: semanticResults.length,
        tagCount: tagResults.length,
      });

      // Create result maps for each method
      const resultMaps: Map<string, RetrievalResult[]> = new Map();
      resultMaps.set("vector", vectorResults);
      resultMaps.set("keyword", keywordResults);
      resultMaps.set("semantic", semanticResults);
      resultMaps.set("tag", tagResults);

      // Collect all unique result IDs
      const allIds: Set<string> = new Set();
      for (const results of resultMaps.values()) {
        for (const result of results) {
          allIds.add(result.id);
        }
      }

      // Normalize scores for each method to 0-1 range
      const normalizedMaps: Map<string, RetrievalResult[]> = new Map();
      for (const [method, results] of resultMaps) {
        normalizedMaps.set(method, this.normalizeScores(results));
      }

      // Count active methods (methods with results)
      const activeMethods = Array.from(resultMaps.entries()).filter(
        ([, results]) => results.length > 0
      ).length;

      // Calculate RRF scores for each result
      const unifiedResults: UnifiedRetrievalResult[] = [];

      for (const id of allIds) {
        const ranks: { vector: number; keyword: number; semantic: number; tag: number } = {
          vector: 0,
          keyword: 0,
          semantic: 0,
          tag: 0,
        };
        const scores: { vector: number; keyword: number; semantic: number; tag: number } = {
          vector: 0,
          keyword: 0,
          semantic: 0,
          tag: 0,
        };

        // Get rank, original score, and normalized score from each method
        for (const [method, results] of resultMaps) {
          const rank = results.findIndex((r) => r.id === id) + 1;
          const normalizedResults = normalizedMaps.get(method) || [];
          const normalizedResult = normalizedResults.find((r) => r.id === id);

          if (rank > 0) {
            (ranks as Record<string, number>)[method] = rank;
            (scores as Record<string, number>)[method] = normalizedResult?.score || 0;
          }
        }

        // Calculate RRF score for each method
        const rrfScores: Record<RetrievalMethod, number> = {
          vector: ranks.vector > 0 ? 1 / (this.config.rrfK + ranks.vector) : 0,
          keyword: ranks.keyword > 0 ? 1 / (this.config.rrfK + ranks.keyword) : 0,
          semantic: ranks.semantic > 0 ? 1 / (this.config.rrfK + ranks.semantic) : 0,
          tag: ranks.tag > 0 ? 1 / (this.config.rrfK + ranks.tag) : 0,
        };

        // Calculate unified score combining normalized scores and RRF scores
        const unifiedScore = this.calculateHybridScore(scores, rrfScores, activeMethods);

        // Get tool info from any result that has it
        const toolInfo = this.getToolInfo(id, resultMaps);

        // Include all results
        unifiedResults.push({
          id,
          name: toolInfo.name || "",
          description: toolInfo.description || "",
          unifiedScore,
          scores,
          ranks,
          tags: toolInfo.tags || [],
          toolType: toolInfo.toolType || "skill",
          disclosure: {
            level: 0 as any,
            name: toolInfo.name || "",
            description: toolInfo.description || "",
            tokenCount: 0,
          },
          path: toolInfo.path,
          version: toolInfo.version,
          metadata: toolInfo.metadata,
        });
      }

      // Sort by unified score
      unifiedResults.sort((a, b) => b.unifiedScore - a.unifiedScore);

      // Apply intelligent filtering based on score distribution
      let filteredResults = unifiedResults;
      if (activeMethods > 1 && unifiedResults.length > 1) {
        const scores = unifiedResults.map((r) => r.unifiedScore);

        // Calculate score gap between consecutive results
        let maxGap = 0;
        for (let i = 0; i < scores.length - 1; i++) {
          const gap = scores[i] - scores[i + 1];
          if (gap > maxGap) {
            maxGap = gap;
          }
        }

        // If there's a large gap between top results and lower results, filter out the lower ones
        if (maxGap > 0.3) {
          // Find the cutoff point (where the large gap occurs)
          let cutoffIndex = 0;
          for (let i = 0; i < scores.length - 1; i++) {
            if (scores[i] - scores[i + 1] === maxGap) {
              cutoffIndex = i;
              break;
            }
          }
          filteredResults = unifiedResults.slice(0, cutoffIndex + 1);
        } else {
          // No large gap, keep all results
          filteredResults = unifiedResults;
        }
      } else if (activeMethods === 1 && unifiedResults.length > 1) {
        // For single method, use adaptive filtering based on original score range
        // Get the original scores directly from resultMaps
        let originalScores: number[] = [];
        for (const [method, results] of resultMaps) {
          if (results.length > 0) {
            originalScores = results.map((r) => r.score);
            break;
          }
        }
        const maxOriginalScore = Math.max(...originalScores);
        const minOriginalScore = Math.min(...originalScores);

        // If score range is large (max > 10x min), apply stricter filtering
        if (
          maxOriginalScore > 0 &&
          minOriginalScore > 0 &&
          maxOriginalScore / minOriginalScore > 10
        ) {
          // Apply minScore threshold
          filteredResults = unifiedResults.filter((r) => r.unifiedScore >= this.config.minScore);
        } else {
          // Score range is small, keep all results
          filteredResults = unifiedResults;
        }
      }

      // Apply deduplication
      const deduplicatedResults = this.deduplicateResults(filteredResults);

      // Apply reranking
      const rerankedResults = this.rerankResults(deduplicatedResults, this.config.maxResults);

      const duration = Date.now() - startTime;
      this._logger.debug(`[UnifiedScoringEngine] Fusion completed in ${duration}ms`, {
        inputCount: allIds.size,
        outputCount: rerankedResults.length,
      });

      return {
        results: rerankedResults,
        config: {
          k: this.config.rrfK,
          weights: this.config.defaultWeights,
          normalization: this.config.normalizationMethod,
        },
        duration,
        deduplicatedCount: allIds.size - deduplicatedResults.length,
      };
    } catch (error) {
      this._logger.error("[UnifiedScoringEngine] Fusion failed:", error);
      throw new HybridRetrievalError(
        `Score fusion failed: ${this.formatError(error)}`,
        HybridRetrievalErrorCode.FUSION_ERROR
      );
    }
  }

  /**
   * Normalize scores using min-max normalization
   */
  normalizeScores(results: RetrievalResult[]): RetrievalResult[] {
    if (results.length === 0) {
      return results;
    }

    // Find min and max scores
    const scores = results.map((r) => r.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const scoreRange = maxScore - minScore;

    // Apply min-max normalization
    if (scoreRange === 0) {
      // All scores are the same, set to 1
      return results.map((r) => ({ ...r, score: 1 }));
    }

    return results.map((r) => ({
      ...r,
      score: (r.score - minScore) / scoreRange,
    }));
  }

  /**
   * Blend multiple scores using weighted combination
   */
  blendScores(result: RetrievalResult, weights: Record<RetrievalMethod, number>): number {
    // This is a placeholder - actual blending happens in fuseResults
    return result.score;
  }

  /**
   * Deduplicate results by ID
   */
  deduplicateResults(results: UnifiedRetrievalResult[]): UnifiedRetrievalResult[] {
    const seen: Set<string> = new Set();
    const deduplicated: UnifiedRetrievalResult[] = [];

    for (const result of results) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        deduplicated.push(result);
      }
    }

    return deduplicated;
  }

  /**
   * Rerank results with diversity consideration
   */
  rerankResults(results: UnifiedRetrievalResult[], limit: number): UnifiedRetrievalResult[] {
    // Take top results with diversity consideration
    const selected: UnifiedRetrievalResult[] = [];
    const selectedTypes: Set<string> = new Set();

    for (const result of results) {
      if (selected.length >= limit) {
        break;
      }

      // Prefer results with different tool types for diversity
      if (!selectedTypes.has(result.toolType) || selected.length < limit / 2) {
        selected.push(result);
        selectedTypes.add(result.toolType);
      } else if (selected.length < limit) {
        selected.push(result);
      }
    }

    // Re-sort by unified score
    selected.sort((a, b) => b.unifiedScore - a.unifiedScore);

    return selected;
  }

  /**
   * Calculate unified score from RRF scores
   */
  private calculateUnifiedScore(
    rrfScores: Record<RetrievalMethod, number>,
    weights: Record<RetrievalMethod, number>
  ): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const method of Object.keys(rrfScores) as RetrievalMethod[]) {
      weightedSum += rrfScores[method] * weights[method];
      totalWeight += weights[method];
    }

    // Normalize by total weight
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Calculate hybrid score combining normalized scores and RRF scores
   * For single-method results: use normalized scores directly
   * For multi-method results: combine normalized scores with RRF-based fusion
   */
  private calculateHybridScore(
    normalizedScores: Record<RetrievalMethod, number>,
    rrfScores: Record<RetrievalMethod, number>,
    activeMethodCount: number
  ): number {
    if (activeMethodCount === 1) {
      // For single method, use the highest normalized score
      let maxScore = 0;
      for (const method of Object.keys(normalizedScores) as RetrievalMethod[]) {
        maxScore = Math.max(maxScore, normalizedScores[method]);
      }
      return maxScore;
    }

    // For multiple methods, combine normalized scores using weights
    let weightedScore = 0;
    let totalWeight = 0;

    for (const method of Object.keys(normalizedScores) as RetrievalMethod[]) {
      const weight = this.config.defaultWeights[method];
      weightedScore += normalizedScores[method] * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedScore / totalWeight : 0;
  }

  /**
   * Get tool info from result maps
   */
  private getToolInfo(
    id: string,
    resultMaps: Map<string, RetrievalResult[]>
  ): {
    name?: string;
    description?: string;
    tags?: string[];
    toolType?: "skill" | "mcp" | "builtin";
    path?: string;
    version?: string;
    metadata?: Record<string, unknown>;
  } {
    for (const results of resultMaps.values()) {
      const result = results.find((r) => r.id === id);
      if (result && result.metadata) {
        return result.metadata as any;
      }
    }

    return {};
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
    return "Unknown error occurred in UnifiedScoringEngine";
  }
}
