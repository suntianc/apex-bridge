/**
 * Compat Layer 类型定义
 */

import { SkillMetadata } from "../../types/tool-system";

/**
 * Claude Code Skill frontmatter 接口
 * 对应 Claude Code SKILL.md 文件的 YAML frontmatter
 */
export interface ClaudeCodeSkillFrontmatter {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  requires?: string[];
  allowedTools?: string[];
  model?: string;
  context?: "fork" | "inline";
  agent?: string;
  hooks?: Record<string, unknown>;
  userInvocable?: boolean;
}

/**
 * 解析后的 Claude Skill 结果
 */
export interface ParsedClaudeSkill {
  metadata: SkillMetadata;
  compatibility: {
    allowedTools?: string[];
    model?: string;
    context?: "fork" | "inline";
    agent?: string;
    hooks?: Record<string, unknown>;
    userInvocable?: boolean;
    source: "claude-code";
  };
  content: string;
}

/**
 * 脚本执行选项
 */
export interface ScriptExecutionOptions {
  timeoutMs?: number;
  maxOutputSize?: number;
  memoryLimitMb?: number;
  env?: Record<string, string>;
  network?: "allow" | "deny";
}

/**
 * 脚本执行结果
 */
export interface ScriptExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

/**
 * 脚本能力描述
 */
export interface ScriptCapabilities {
  languages: string[];
  hasNetworkAccess: boolean;
  hasFileSystemAccess: boolean;
  maxExecutionTimeMs: number;
  maxMemoryMb: number;
}

/**
 * 脚本验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  capabilities: ScriptCapabilities;
}

/**
 * 生命周期钩子定义
 */
export interface SkillLifecycleHooks {
  preInstall?(ctx: SkillLifecycleContext): Promise<void>;
  postInstall?(ctx: SkillLifecycleContext): Promise<void>;
  preUpdate?(ctx: SkillLifecycleContext): Promise<void>;
  postUpdate?(ctx: SkillLifecycleContext): Promise<void>;
  preUninstall?(ctx: SkillLifecycleContext): Promise<void>;
  postUninstall?(ctx: SkillLifecycleContext): Promise<void>;
}

/**
 * 生命周期钩子上下文
 */
export interface SkillLifecycleContext {
  skillName: string;
  skillPath: string;
  metadata?: SkillMetadata;
  compatibility?: Record<string, unknown>;
  validationLevel?: "strict" | "basic" | "none";
  dependencies?: string[];
}

/**
 * Context 模式类型定义
 */
export type ContextMode = "fork" | "inline";

/**
 * Context 模式配置
 */
export interface ContextModeConfig {
  mode: ContextMode;
  workspacePath?: string;
  isolated?: boolean;
  maxMemory?: number;
  timeout?: number;
}

/**
 * 技能执行上下文
 */
export interface SkillExecutionContext {
  skillName: string;
  skillPath: string;
  mode: ContextMode;
  workspace: string;
  env: Record<string, string>;
  files: string[];
  metadata: SkillMetadata;
}

/**
 * 执行选项
 */
export interface ExecutionOptions {
  timeout?: number;
  memoryLimit?: number;
  env?: Record<string, string>;
  files?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  durationMs: number;
  mode: ContextMode;
  metadata?: Record<string, unknown>;
}

/**
 * 依赖检查结果
 */
export interface DependencyCheckResult {
  satisfied: boolean;
  missing: string[];
  installed: string[];
}

/**
 * 解析错误代码枚举
 */
export enum ParseErrorCode {
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  INVALID_YAML = "INVALID_YAML",
  MISSING_NAME = "MISSING_NAME",
  INVALID_NAME_FORMAT = "INVALID_NAME_FORMAT",
  NAME_TOO_LONG = "NAME_TOO_LONG",
  MISSING_DESCRIPTION = "MISSING_DESCRIPTION",
  INVALID_VERSION = "INVALID_VERSION",
  INVALID_CONTEXT = "INVALID_CONTEXT",
  INVALID_ALLOWED_TOOLS = "INVALID_ALLOWED_TOOLS",
  RESERVED_NAME = "RESERVED_NAME",
  FRONTMATTER_MISSING = "FRONTMATTER_MISSING",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * 解析错误类型
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly code: ParseErrorCode,
    public readonly field?: string,
    public readonly suggestions?: string[]
  ) {
    super(message);
    this.name = "ParseError";
  }
}
