/**
 * Services Facade - ApexBridge Services Entry Point
 *
 * All external calls (API layer, Server) should access services through this facade.
 * Internal subsystem implementations are private.
 *
 * Usage:
 * ```typescript
 * import { getServices, type ServicesFacade } from "./services";
 * const services = getServices();
 * const skills = await services.skills.listSkills();
 * ```
 */

export { getServices, _setServices, _resetServices, type ServicesFacade } from "./facade";
export type {
  ChatServices,
  SkillServices,
  MCPServices,
  RetrievalServices,
  CompressionServices,
  LLMServices,
} from "./facade";

// ============================================================================
// Re-exports for backward compatibility
// ============================================================================

// Core
export { LLMManager } from "../core/LLMManager";
export { EventBus } from "../core/EventBus";
export { ProtocolEngine } from "../core/ProtocolEngine";

// Services
export { ConfigService } from "./ConfigService";
export { PathService } from "./PathService";
export { LLMConfigService } from "./LLMConfigService";

// Chat
export { ChatService } from "./ChatService";

// Skills - uses skill/ barrel
export { SkillManager, getSkillManager } from "./skill";
export { BuiltInSkillLoader } from "./skill";
export { UserSkillLoader } from "./skill";
export { DynamicSkillManager } from "./skill";
export { SkillValidator } from "./skill";

// Retrieval - uses tool-retrieval/ barrel
export { ToolRetrievalService, getToolRetrievalService } from "./tool-retrieval";
export { SearchEngine } from "./tool-retrieval";
export { EmbeddingGenerator } from "./tool-retrieval";
export { SkillIndexer } from "./tool-retrieval";
export * from "./tool-retrieval";

// Compression
export { ContextCompressionService } from "./context-compression";
export * from "./context-compression";

// MCP
export { MCPIntegrationService } from "./MCPIntegrationService";
export { MCPServerManager } from "./MCPServerManager";

// Warmup
export { ApplicationWarmupService } from "./warmup";
export { CacheWarmupManager } from "./warmup";
export { IndexPrewarmService } from "./warmup";

// Executors
export { SkillsSandboxExecutor } from "./executors/SkillsSandboxExecutor";
export { BuiltInExecutor } from "./executors/BuiltInExecutor";
