/**
 * skill module - Unified Exports
 *
 * Main entry point for the skill management service module.
 */

// Types
export * from "../../types/tool-system";

// Main service
export { SkillManager, getSkillManager } from "./SkillManager";
export type { InstallResult, UninstallResult, UpdateResult } from "./SkillManager";

// Sub-modules
export { BuiltInSkillLoader, createBuiltInSkillLoader } from "./BuiltInSkillLoader";
export type { BuiltInSkillInfo } from "./BuiltInSkillLoader";

export { UserSkillLoader, createUserSkillLoader } from "./UserSkillLoader";
export type { UserSkillLoadResult } from "./UserSkillLoader";

export { DynamicSkillManager, createDynamicSkillManager } from "./DynamicSkillManager";
export type { DynamicSkillUpdate, DynamicSkillStats } from "./DynamicSkillManager";

export { SkillValidator, createSkillValidator } from "./SkillValidator";
export type { ValidationResult, SkillValidationConfig } from "./SkillValidator";
