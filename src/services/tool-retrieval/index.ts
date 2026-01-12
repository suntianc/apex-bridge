/**
 * ToolRetrieval Module - Unified Exports
 *
 * Main entry point for the tool retrieval service module.
 */

// Types
export * from "./types";

// Core Classes
export {
  ToolRetrievalService,
  IToolRetrievalService,
  getToolRetrievalService,
  resetToolRetrievalService,
} from "./ToolRetrievalService";

// Sub-modules
export { LanceDBConnection, ILanceDBConnection } from "./LanceDBConnection";
export {
  IndexConfigOptimizer,
  IndexConfig,
  OptimizationResult,
  INDEX_PRESETS,
} from "./IndexConfigOptimizer";
export {
  EmbeddingGenerator,
  IEmbeddingGenerator,
  getEmbeddingLLMManager,
  resetEmbeddingLLMManager,
  getBatchEmbeddingService,
  resetBatchEmbeddingService,
} from "./EmbeddingGenerator";
export {
  BatchEmbeddingService,
  BatchEmbeddingConfig,
  BatchEmbeddingResult,
} from "./BatchEmbeddingService";
export { SkillIndexer, ISkillIndexer } from "./SkillIndexer";
export { SearchEngine, ISearchEngine } from "./SearchEngine";
export { MCPToolSupport, IMCPToolSupport } from "./MCPToolSupport";

// Phase 1: Hybrid Retrieval Components
export {
  TagMatchingEngine,
  ITagMatchingEngine,
  TagMatchingEngineConfig,
  DEFAULT_TAG_MATCHING_CONFIG,
} from "./TagMatchingEngine";
export {
  UnifiedScoringEngine,
  IUnifiedScoringEngine,
  UnifiedScoringEngineConfig,
  DEFAULT_SCORING_CONFIG,
} from "./UnifiedScoringEngine";
export {
  HybridRetrievalEngine,
  IHybridRetrievalEngine,
  HybridRetrievalQuery,
  HybridRetrievalEngineConfig,
} from "./HybridRetrievalEngine";
export {
  DisclosureManager,
  IDisclosureManager,
  DisclosureManagerConfig,
  DEFAULT_DISCLOSURE_CONFIG,
  DEFAULT_DISCLOSURE_CONFIG_V2,
  DisclosureDecisionManager,
  IDisclosureDecisionManager,
  DisclosureCache,
  IDisclosureCache,
  DisclosureDecisionInput,
  DisclosureDecisionOutput,
  DisclosureCacheKey,
  DisclosureMetrics,
  DisclosureManagerConfigV2,
} from "./DisclosureManager";
