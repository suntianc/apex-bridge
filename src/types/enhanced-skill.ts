/**
 * Enhanced Skill Types - Hybrid Retrieval & Disclosure
 *
 * Phase 1: 混合检索框架和基础披露机制的类型定义
 */

// ==================== Hybrid Retrieval Types ====================

/**
 * Hybrid retrieval configuration
 */
export interface HybridRetrievalConfig {
  /** Weight for vector similarity (0-1) */
  vectorWeight: number;
  /** Weight for keyword matching (0-1) */
  keywordWeight: number;
  /** Weight for semantic matching (0-1) */
  semanticWeight: number;
  /** Weight for tag matching (0-1) */
  tagWeight: number;
  /** RRF fusion constant */
  rrfK: number;
  /** Minimum score threshold */
  minScore: number;
  /** Maximum results */
  maxResults: number;
  /** Enable tag matching */
  enableTagMatching: boolean;
  /** Enable keyword matching */
  enableKeywordMatching: boolean;
  /** Enable semantic matching */
  enableSemanticMatching: boolean;
  /** Cache TTL in seconds */
  cacheTTL: number;
  /** Disclosure strategy */
  disclosureStrategy: DisclosureStrategy;
  /** Tag hierarchy */
  tagHierarchy: TagHierarchy;
}

/**
 * Disclosure strategy
 */
export enum DisclosureStrategy {
  METADATA = "metadata",
  CONTENT = "content",
  RESOURCES = "resources",
  ADAPTIVE = "adaptive",
}

/**
 * Default hybrid retrieval configuration
 */
export const DEFAULT_HYBRID_RETRIEVAL_CONFIG: HybridRetrievalConfig = {
  vectorWeight: 0.5,
  keywordWeight: 0.3,
  semanticWeight: 0.2,
  tagWeight: 0.1,
  rrfK: 60,
  minScore: 0.1,
  maxResults: 10,
  enableTagMatching: true,
  enableKeywordMatching: true,
  enableSemanticMatching: true,
  cacheTTL: 300,
  disclosureStrategy: DisclosureStrategy.METADATA,
  tagHierarchy: {
    levels: ["category", "subcategory", "tag"],
    aliases: {
      cat: "category",
      sub: "subcategory",
      t: "tag",
    },
  },
};

/**
 * Unified retrieval result combining multiple retrieval methods
 */
export interface UnifiedRetrievalResult {
  /** Unique result ID */
  id: string;
  /** Tool/skill name */
  name: string;
  /** Tool description */
  description: string;
  /** Combined score from all methods */
  unifiedScore: number;
  /** Individual scores from each method */
  scores: {
    vector: number;
    keyword: number;
    semantic: number;
    tag: number;
  };
  /** RRF ranks from each method */
  ranks: {
    vector: number;
    keyword: number;
    semantic: number;
    tag: number;
  };
  /** Type tags */
  tags: string[];
  /** Tool type */
  toolType: "skill" | "mcp" | "builtin";
  /** Disclosure content */
  disclosure: DisclosureContent;
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Source path */
  path?: string;
  /** Version */
  version?: string;
}

/**
 * Individual retrieval result from a single method
 */
export interface RetrievalResult {
  /** Result ID */
  id: string;
  /** Score (0-1 for normalized, rank for RRF) */
  score: number;
  /** Retrieval method */
  method: RetrievalMethod;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Retrieval method enumeration
 */
export type RetrievalMethod = "vector" | "keyword" | "semantic" | "tag";

// ==================== Tag Matching Types ====================

/**
 * Tag match result
 */
export interface TagMatchResult {
  /** Whether tag matched */
  matched: boolean;
  /** Matched tag */
  tag: string;
  /** Matched tag hierarchy level */
  level: string;
  /** Match score (0-1) */
  score: number;
  /** Alias expansion applied */
  expandedFrom?: string;
}

/**
 * Tag hierarchy configuration
 */
export interface TagHierarchy {
  /** Hierarchy levels from general to specific */
  levels: string[];
  /** Tag aliases for matching */
  aliases: Record<string, string>;
  /** Inherited tags per level */
  inheritTags?: boolean;
}

/**
 * Tag matching options
 */
export interface TagMatchingOptions {
  /** Query tags to match */
  queryTags: string[];
  /** Maximum hierarchy depth */
  maxDepth?: number;
  /** Enable alias expansion */
  enableAliases?: boolean;
  /** Minimum match score */
  minScore?: number;
}

// ==================== Disclosure Types ====================

/**
 * Disclosure level enumeration
 */
export enum DisclosureLevel {
  /** Only metadata (name, description) */
  METADATA = "metadata",
  /** Include input/output schema */
  CONTENT = "content",
  /** Include resources and references */
  RESOURCES = "resources",
}

/**
 * Disclosure content
 */
export interface DisclosureContent {
  /** Disclosure level */
  level: DisclosureLevel;
  /** Name */
  name: string;
  /** Description */
  description: string;
  /** Version */
  version?: string;
  /** Author */
  author?: string;
  /** Tags */
  tags?: string[];
  /** Input schema */
  inputSchema?: Record<string, unknown>;
  /** Output schema */
  outputSchema?: Record<string, unknown>;
  /** Parameters (for CONTENT level) */
  parameters?: Array<{ name: string; type: string; required?: boolean; description?: string }>;
  /** Examples (for CONTENT/RESOURCES level) */
  examples?: Array<{ input: string; output: string }>;
  /** Scripts (for RESOURCES level) */
  scripts?: Array<{ name: string; language: string; content: string }>;
  /** Dependencies (for RESOURCES level) */
  dependencies?: Array<{ name: string; version: string }>;
  /** Resources (for RESOURCES level) */
  resources?: Array<{ type: string; path: string; description: string }>;
  /** Token count estimate */
  tokenCount: number;
}

/**
 * Disclosure options
 */
export interface DisclosureOptions {
  /** Target disclosure level */
  level: DisclosureLevel;
  /** Include examples */
  includeExamples?: boolean;
  /** Include resources */
  includeResources?: boolean;
  /** Max token limit */
  maxTokens?: number;
  /** Adaptive strategy config */
  adaptiveConfig?: {
    minTokens: number;
    maxTokens: number;
    preferMetadataBelow: number;
  };
}

// ==================== Performance & Metrics ====================

/**
 * Retrieval performance metrics
 */
export interface RetrievalMetrics {
  /** Total retrieval time in ms */
  totalTime: number;
  /** Vector search time in ms */
  vectorTime: number;
  /** Keyword search time in ms */
  keywordTime: number;
  /** Semantic matching time in ms */
  semanticTime: number;
  /** Tag matching time in ms */
  tagTime: number;
  /** Fusion time in ms */
  fusionTime: number;
  /** Number of results retrieved */
  resultCount: number;
  /** Cache hit status */
  cacheHit: boolean;
  /** Number of cache hits */
  cacheHits: number;
  /** Number of cache misses */
  cacheMisses: number;
}

/**
 * Engine performance metrics
 */
export interface EngineMetrics {
  /** Operation name */
  operation: string;
  /** Duration in ms */
  duration: number;
  /** Success status */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Additional metrics */
  details?: Record<string, unknown>;
}

// ==================== Error Types ====================

/**
 * Hybrid retrieval error codes
 */
export enum HybridRetrievalErrorCode {
  CONFIG_ERROR = "CONFIG_ERROR",
  VECTOR_SEARCH_ERROR = "VECTOR_SEARCH_ERROR",
  KEYWORD_SEARCH_ERROR = "KEYWORD_SEARCH_ERROR",
  SEMANTIC_MATCH_ERROR = "SEMANTIC_MATCH_ERROR",
  TAG_MATCH_ERROR = "TAG_MATCH_ERROR",
  FUSION_ERROR = "FUSION_ERROR",
  DISCLOSURE_ERROR = "DISCLOSURE_ERROR",
  CACHE_ERROR = "CACHE_ERROR",
}

/**
 * Hybrid retrieval error
 */
export class HybridRetrievalError extends Error {
  code: HybridRetrievalErrorCode;
  details?: Record<string, unknown>;

  constructor(message: string, code: HybridRetrievalErrorCode, details?: Record<string, unknown>) {
    super(message);
    this.name = "HybridRetrievalError";
    this.code = code;
    this.details = details;
  }
}

// ==================== Cache Types ====================

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  /** Cached data */
  data: T;
  /** Creation timestamp */
  createdAt: number;
  /** Expiration timestamp */
  expiresAt: number;
  /** Access count */
  accessCount: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total entries */
  size: number;
  /** Hit count */
  hits: number;
  /** Miss count */
  misses: number;
  /** Hit rate */
  hitRate: number;
  /** Memory usage estimate */
  memoryUsage: number;
}

// ==================== Fusion Types ====================

/**
 * RRF (Reciprocal Rank Fusion) configuration
 */
export interface RRFConfig {
  /** RRF constant k */
  k: number;
  /** Weights for each method */
  weights: Record<RetrievalMethod, number>;
  /** Normalization method */
  normalization: "minmax" | "zscore" | "percentile";
}

/**
 * Fusion result
 */
export interface FusionResult {
  /** Fused results */
  results: UnifiedRetrievalResult[];
  /** Applied fusion config */
  config: RRFConfig;
  /** Total fusion time */
  duration: number;
  /** Number of deduplicated items */
  deduplicatedCount: number;
}
