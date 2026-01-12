/**
 * Compat Layer - 兼容层组件
 * 提供 Claude Code Skill 格式转换、脚本执行和生命周期管理
 */

export {
  ClaudeCodeSkillParser,
  getClaudeCodeSkillParser,
  type ParseResult,
} from "./ClaudeCodeSkillParser";
export { ParseError, ParseErrorCode } from "./types";
export { ScriptExecutor, getScriptExecutor } from "./ScriptExecutor";
export { ContextModeExecutor, getContextModeExecutor } from "./ContextModeExecutor";
export { LifecycleManager, getLifecycleManager } from "./LifecycleManager";
export {
  AllowedToolsValidator,
  PermissionDeniedError,
  type ValidationResult,
  type BatchValidationResult,
  type AllowedToolsValidatorConfig,
  getAllowedToolsValidator,
  resetAllowedToolsValidator,
  default,
} from "./AllowedToolsValidator";
export type {
  ClaudeCodeSkillFrontmatter,
  ParsedClaudeSkill,
  ScriptExecutionOptions,
  ExecutionResult,
  ScriptCapabilities,
  ValidationResult as ScriptValidationResult,
  SkillLifecycleHooks,
  SkillLifecycleContext,
  DependencyCheckResult,
  ContextMode,
  ContextModeConfig,
  SkillExecutionContext,
  ExecutionOptions,
} from "./types";
