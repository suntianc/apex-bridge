/**
 * TagMatchingEngine - Tag-based Matching Engine
 *
 * Phase 1b: 标签匹配引擎实现
 * Supports tag hierarchy, alias expansion, and batch matching
 */

import { logger } from "../../utils/logger";
import {
  TagMatchResult,
  TagHierarchy,
  TagMatchingOptions,
  HybridRetrievalError,
  HybridRetrievalErrorCode,
} from "../../types/enhanced-skill";
import { ToolRetrievalResult } from "./types";

/**
 * Tag matching engine interface
 */
export interface ITagMatchingEngine {
  matchTags(queryTags: string[], candidates: ToolRetrievalResult[]): Promise<TagMatchResult[]>;
  matchSingleTool(tool: ToolRetrievalResult, queryTags: string[]): Promise<TagMatchResult>;
  calculateTagScore(toolTags: string[], queryTags: string[], hierarchy: TagHierarchy): number;
  expandAliases(tag: string, hierarchy: TagHierarchy): string[];
}

/**
 * Tag matching engine configuration
 */
export interface TagMatchingEngineConfig {
  /** Tag hierarchy configuration */
  hierarchy: TagHierarchy;
  /** Minimum match score threshold */
  minScore: number;
  /** Maximum hierarchy depth */
  maxDepth: number;
  /** Enable alias expansion */
  enableAliases: boolean;
}

/**
 * Default tag matching engine configuration
 */
export const DEFAULT_TAG_MATCHING_CONFIG: TagMatchingEngineConfig = {
  hierarchy: {
    levels: ["category", "subcategory", "tag"],
    aliases: {
      cat: "category",
      sub: "subcategory",
      t: "tag",
      c: "category",
      s: "subcategory",
    },
  },
  minScore: 0.5,
  maxDepth: 3,
  enableAliases: true,
};

/**
 * TagMatchingEngine implementation
 * Handles tag-based matching with hierarchy support
 */
export class TagMatchingEngine implements ITagMatchingEngine {
  private readonly _logger = logger;
  private readonly config: TagMatchingEngineConfig;

  constructor(config?: Partial<TagMatchingEngineConfig>) {
    this.config = { ...DEFAULT_TAG_MATCHING_CONFIG, ...config };
    this._logger.info("[TagMatchingEngine] Initialized with config:", {
      minScore: this.config.minScore,
      maxDepth: this.config.maxDepth,
      enableAliases: this.config.enableAliases,
      hierarchyLevels: this.config.hierarchy.levels,
    });
  }

  /**
   * Match tags against multiple candidate tools
   */
  async matchTags(
    queryTags: string[],
    candidates: ToolRetrievalResult[]
  ): Promise<TagMatchResult[]> {
    const startTime = Date.now();

    try {
      this._logger.info(
        `[TagMatchingEngine] Matching ${candidates.length} tools by ${queryTags.length} query tags`
      );

      // Return empty array if query tags are empty
      if (queryTags.length === 0) {
        return [];
      }

      const results: TagMatchResult[] = [];

      for (const candidate of candidates) {
        const matchResult = await this.matchSingleTool(candidate, queryTags);
        results.push(matchResult);
      }

      const duration = Date.now() - startTime;
      this._logger.debug(`[TagMatchingEngine] Tag matching completed in ${duration}ms`, {
        resultCount: results.length,
      });

      return results;
    } catch (error) {
      this._logger.error("[TagMatchingEngine] Tag matching failed:", error);
      throw new HybridRetrievalError(
        `Tag matching failed: ${this.formatError(error)}`,
        HybridRetrievalErrorCode.TAG_MATCH_ERROR,
        { queryTags, candidateCount: candidates.length }
      );
    }
  }

  /**
   * Match tags for a single tool
   */
  async matchSingleTool(tool: ToolRetrievalResult, queryTags: string[]): Promise<TagMatchResult> {
    try {
      const toolTags = tool.tags || [];
      const matchScore = this.calculateTagScore(toolTags, queryTags, this.config.hierarchy);

      // Find the best matching tag
      const matchedTag = this.findBestMatchingTag(toolTags, queryTags, this.config.hierarchy);

      const expandedFrom = this.isExpandedFromAlias(matchedTag, queryTags, this.config.hierarchy);

      return {
        matched: matchScore >= this.config.minScore,
        tag: matchedTag || "",
        level: this.getTagLevel(matchedTag, this.config.hierarchy),
        score: matchScore,
        expandedFrom,
      };
    } catch (error) {
      this._logger.error(`[TagMatchingEngine] Failed to match tool ${tool.name}:`, error);
      throw new HybridRetrievalError(
        `Single tool matching failed: ${this.formatError(error)}`,
        HybridRetrievalErrorCode.TAG_MATCH_ERROR,
        { toolId: tool.id, toolName: tool.name }
      );
    }
  }

  /**
   * Calculate tag matching score between tool tags and query tags
   */
  calculateTagScore(toolTags: string[], queryTags: string[], hierarchy: TagHierarchy): number {
    if (queryTags.length === 0) {
      return 0;
    }

    let totalScore = 0;
    let matchCount = 0;

    for (const queryTag of queryTags) {
      const expandedQueryTags = this.config.enableAliases
        ? this.expandAliases(queryTag, hierarchy)
        : [queryTag];

      let bestMatchScore = 0;

      for (const toolTag of toolTags) {
        const expandedToolTags = this.config.enableAliases
          ? this.expandAliases(toolTag, hierarchy)
          : [toolTag];

        // Check for exact match or alias match
        for (const et of expandedToolTags) {
          for (const eq of expandedQueryTags) {
            if (et === eq) {
              // Exact match - highest score
              bestMatchScore = Math.max(bestMatchScore, 1.0);
              break;
            }

            // Check hierarchy level match
            const etLevel = this.getTagLevel(et, hierarchy);
            const eqLevel = this.getTagLevel(eq, hierarchy);

            if (
              etLevel === eqLevel &&
              etLevel !== "unknown" &&
              et.toLowerCase() === eq.toLowerCase()
            ) {
              // Same level partial match (only if the tag names are similar, not just same level)
              bestMatchScore = Math.max(bestMatchScore, 0.8);
            }

            // Check if one tag is a prefix/suffix of another
            if (et.startsWith(eq) || eq.startsWith(et)) {
              bestMatchScore = Math.max(bestMatchScore, 0.6);
            }
          }
        }
      }

      if (bestMatchScore > 0) {
        totalScore += bestMatchScore;
        matchCount++;
      }
    }

    // Return weighted average score
    return matchCount > 0 ? totalScore / queryTags.length : 0;
  }

  /**
   * Expand a tag to all its aliases
   */
  expandAliases(tag: string, hierarchy: TagHierarchy): string[] {
    const expanded = [tag];

    // Check if tag is in format "level:value"
    const colonIndex = tag.indexOf(":");
    if (colonIndex > 0) {
      const levelPart = tag.substring(0, colonIndex);
      const valuePart = tag.substring(colonIndex + 1);

      // Check if levelPart is an alias
      for (const [alias, canonical] of Object.entries(hierarchy.aliases)) {
        if (levelPart === alias) {
          // Expand to canonical level
          expanded.push(`${canonical}:${valuePart}`);
        }
      }

      // Also check if levelPart is a canonical level name
      for (const level of hierarchy.levels) {
        if (levelPart === level) {
          // Add all aliases for this level
          for (const [alias, canonical] of Object.entries(hierarchy.aliases)) {
            if (canonical === level) {
              expanded.push(`${alias}:${valuePart}`);
            }
          }
        }
      }
    } else {
      // Original logic for simple tags
      for (const [alias, canonical] of Object.entries(hierarchy.aliases)) {
        if (tag === alias) {
          expanded.push(canonical);
        } else if (tag === canonical) {
          // Find all aliases for this canonical
          for (const [a, c] of Object.entries(hierarchy.aliases)) {
            if (c === canonical) {
              expanded.push(a);
            }
          }
        }
      }
    }

    return [...new Set(expanded)];
  }

  /**
   * Find the best matching tag from tool tags
   */
  private findBestMatchingTag(
    toolTags: string[],
    queryTags: string[],
    hierarchy: TagHierarchy
  ): string {
    let bestMatch = "";
    let bestScore = 0;

    for (const toolTag of toolTags) {
      for (const queryTag of queryTags) {
        const expandedQueryTags = this.config.enableAliases
          ? this.expandAliases(queryTag, hierarchy)
          : [queryTag];

        for (const eq of expandedQueryTags) {
          if (toolTag === eq) {
            if (1.0 > bestScore) {
              bestScore = 1.0;
              bestMatch = toolTag;
            }
          } else if (
            toolTag.toLowerCase().includes(eq.toLowerCase()) ||
            eq.toLowerCase().includes(toolTag.toLowerCase())
          ) {
            if (0.7 > bestScore) {
              bestScore = 0.7;
              bestMatch = toolTag;
            }
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Check if match was expanded from an alias
   */
  private isExpandedFromAlias(
    matchedTag: string,
    queryTags: string[],
    hierarchy: TagHierarchy
  ): string | undefined {
    if (!this.config.enableAliases) {
      return undefined;
    }

    for (const queryTag of queryTags) {
      if (queryTag !== matchedTag) {
        // Check if queryTag is an alias of matchedTag
        for (const [alias, canonical] of Object.entries(hierarchy.aliases)) {
          if (alias === queryTag && canonical === matchedTag) {
            return queryTag;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Get the hierarchy level of a tag
   */
  private getTagLevel(tag: string, hierarchy: TagHierarchy): string {
    if (!tag) {
      return "unknown";
    }

    // Check if tag is in format "level:value" (e.g., "category:file")
    const colonIndex = tag.indexOf(":");
    if (colonIndex > 0) {
      const levelPart = tag.substring(0, colonIndex).toLowerCase();
      // Check if it's a valid level name or alias
      for (const level of hierarchy.levels) {
        if (levelPart === level.toLowerCase()) {
          return level;
        }
      }
      // Check if it's an alias
      for (const [alias, canonical] of Object.entries(hierarchy.aliases)) {
        if (levelPart === alias.toLowerCase()) {
          return canonical;
        }
      }
    }

    // Check if tag is a canonical level name
    for (const level of hierarchy.levels) {
      if (tag.toLowerCase() === level.toLowerCase()) {
        return level;
      }
    }

    // Check if tag is an alias
    for (const [alias, canonical] of Object.entries(hierarchy.aliases)) {
      if (tag.toLowerCase() === alias.toLowerCase()) {
        return canonical;
      }
    }

    return "tag"; // Default to lowest level
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
    return "Unknown error occurred in TagMatchingEngine";
  }
}
