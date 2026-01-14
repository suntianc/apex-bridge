/**
 * SkillManager - Legacy Compatibility Wrapper
 *
 * DEPRECATED: This file is a compatibility wrapper.
 *
 * All functionality has been migrated to the modular implementation at:
 * src/services/skill/SkillManager.ts
 *
 * This wrapper re-exports from the authoritative implementation for
 * backward compatibility during migration.
 *
 * NEW CODE SHOULD import from:
 * - src/services/skill/SkillManager
 * - or use the services facade: import { getServices } from "./services"
 */

// Re-export all exports from the authoritative implementation
export {
  SkillManager,
  getSkillManager,
  InstallResult,
  UninstallResult,
  UpdateResult,
} from "./skill/SkillManager";

// Also re-export types from the skill module barrel
export * from "./skill";

// ============================================================================
// Legacy re-exports (for imports that referenced specific internal types)
// ============================================================================

// Tool types that were exported from here
export type {
  SkillTool,
  SkillInstallOptions,
  SkillListOptions,
  SkillListResult,
  SkillMetadata,
} from "../types/tool-system";

// Tool system types
export { ToolError, ToolErrorCode, ToolType } from "../types/tool-system";
