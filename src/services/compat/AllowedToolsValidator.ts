/**
 * AllowedToolsValidator - 工具权限验证器
 * 验证工具调用是否在允许的工具列表中，支持通配符和前缀匹配
 */

import { logger } from "../../utils/logger";

/**
 * 验证结果接口
 */
export interface ValidationResult {
  allowed: boolean;
  toolName: string;
  reason?: string;
}

/**
 * 批量验证结果接口
 */
export interface BatchValidationResult {
  allowed: boolean;
  validatedTools: ValidationResult[];
  deniedTools: string[];
  missingPermissions: string[];
}

/**
 * 权限验证器配置
 */
export interface AllowedToolsValidatorConfig {
  /** 严格模式：不允许未授权工具 */
  strictMode?: boolean;
  /** 默认允许的工具（系统级） */
  defaultAllowed?: string[];
  /** 工具前缀白名单 */
  allowedPrefixes?: string[];
  /** 是否区分大小写 */
  caseSensitive?: boolean;
  /** 是否记录详细日志 */
  logDetails?: boolean;
}

/**
 * 权限验证错误
 */
export class PermissionDeniedError extends Error {
  public readonly toolName: string;
  public readonly allowedTools: string[];
  public readonly missingPermissions: string[];

  constructor(
    toolName: string,
    allowedTools: string[],
    missingPermissions: string[],
    message?: string
  ) {
    const defaultMessage = `Permission denied: tool "${toolName}" is not in the allowed tools list`;
    super(message || defaultMessage);

    this.name = "PermissionDeniedError";
    this.toolName = toolName;
    this.allowedTools = allowedTools;
    this.missingPermissions = missingPermissions;
  }
}

/**
 * 工具权限验证器
 * 提供工具调用权限的同步验证功能，支持通配符和前缀匹配
 */
export class AllowedToolsValidator {
  private readonly config: Required<AllowedToolsValidatorConfig>;

  constructor(config: AllowedToolsValidatorConfig = {}) {
    this.config = {
      strictMode: config.strictMode ?? true,
      defaultAllowed: config.defaultAllowed ?? [],
      allowedPrefixes: config.allowedPrefixes ?? [],
      caseSensitive: config.caseSensitive ?? true,
      logDetails: config.logDetails ?? true,
    };
  }

  /**
   * 验证单个工具是否在 allowedTools 列表中
   * @param toolName 工具名称
   * @param allowedTools SKILL.md 中定义的 allowedTools 列表
   * @returns 验证结果
   */
  validate(toolName: string, allowedTools: string[]): ValidationResult {
    // 处理空工具名称
    if (!toolName || typeof toolName !== "string" || toolName.trim() === "") {
      return {
        allowed: false,
        toolName: toolName || "unknown",
        reason: "Invalid tool name",
      };
    }

    const normalizedToolName = this.config.caseSensitive ? toolName : toolName.toLowerCase();
    const normalizedAllowedTools = this.config.caseSensitive
      ? allowedTools
      : allowedTools.map((t) => t.toLowerCase());

    // 检查是否在默认允许列表中
    if (this.isInDefaultAllowed(normalizedToolName)) {
      return {
        allowed: true,
        toolName,
        reason: "Tool is in default allowed list",
      };
    }

    // 如果 allowedTools 为空且非严格模式，允许所有工具
    if (normalizedAllowedTools.length === 0 && !this.config.strictMode) {
      return {
        allowed: true,
        toolName,
        reason: "No allowedTools configured and not in strict mode",
      };
    }

    // 精确匹配检查
    if (this.hasExactMatch(normalizedToolName, normalizedAllowedTools)) {
      return {
        allowed: true,
        toolName,
        reason: "Tool found in allowedTools list",
      };
    }

    // 通配符匹配检查（如 "file:*" 匹配 "file-read"、"file-write"）
    if (this.hasWildcardMatch(normalizedToolName, normalizedAllowedTools)) {
      return {
        allowed: true,
        toolName,
        reason: "Tool matched wildcard pattern",
      };
    }

    // 前缀匹配检查（如 "file:" 前缀）
    if (this.hasPrefixMatch(normalizedToolName, normalizedAllowedTools)) {
      return {
        allowed: true,
        toolName,
        reason: "Tool matched allowed prefix",
      };
    }

    // 未找到匹配
    return {
      allowed: false,
      toolName,
      reason: `Tool "${toolName}" is not in the allowed tools list`,
    };
  }

  /**
   * 批量验证多个工具
   * @param toolNames 工具名称列表
   * @param allowedTools SKILL.md 中定义的 allowedTools 列表
   * @returns 批量验证结果
   */
  validateAll(toolNames: string[], allowedTools: string[]): BatchValidationResult {
    const validatedTools: ValidationResult[] = [];
    const deniedTools: string[] = [];
    const missingPermissions: string[] = [];

    for (const toolName of toolNames) {
      const result = this.validate(toolName, allowedTools);
      validatedTools.push(result);

      if (!result.allowed) {
        deniedTools.push(toolName);
        missingPermissions.push(toolName);
      }
    }

    const batchResult: BatchValidationResult = {
      allowed: deniedTools.length === 0,
      validatedTools,
      deniedTools,
      missingPermissions,
    };

    // 记录日志
    if (this.config.logDetails && deniedTools.length > 0) {
      logger.debug("Batch validation found denied tools", {
        requestedTools: toolNames,
        allowedTools,
        deniedTools,
        missingPermissions,
      });
    }

    return batchResult;
  }

  /**
   * 获取缺失的权限列表
   * @param requestedTools 请求的工具列表
   * @param allowedTools SKILL.md 中定义的 allowedTools 列表
   * @returns 未授权的工具列表
   */
  getMissingPermissions(requestedTools: string[], allowedTools: string[]): string[] {
    const missing: string[] = [];

    for (const toolName of requestedTools) {
      const result = this.validate(toolName, allowedTools);
      if (!result.allowed) {
        missing.push(toolName);
      }
    }

    return missing;
  }

  /**
   * 同步验证工具调用，如果被拒绝则抛出异常
   * @param toolName 工具名称
   * @param allowedTools SKILL.md 中定义的 allowedTools 列表
   * @throws PermissionDeniedError 当工具未被授权时
   */
  validateOrThrow(toolName: string, allowedTools: string[]): void {
    const result = this.validate(toolName, allowedTools);

    if (!result.allowed) {
      const missing = this.getMissingPermissions([toolName], allowedTools);

      // 记录拒绝日志
      logger.warn("Permission denied for tool", {
        toolName,
        allowedTools,
        reason: result.reason,
      });

      throw new PermissionDeniedError(
        toolName,
        allowedTools,
        missing,
        `Permission denied: tool "${toolName}" requires explicit permission`
      );
    }
  }

  /**
   * 检查工具名称是否匹配允许的前缀
   * @param toolName 工具名称
   * @param prefixes 允许的前缀列表
   * @returns 是否匹配
   */
  private hasPrefixMatch(toolName: string, allowedTools: string[]): boolean {
    // 检查工具是否匹配任何允许的前缀
    for (const prefix of this.config.allowedPrefixes) {
      if (toolName.startsWith(prefix)) {
        // 同时检查该前缀是否在 allowedTools 中
        // 如果允许前缀 "file:"，那么 "file:read" 应该是被允许的
        const prefixedTool = prefix + toolName.slice(prefix.length);
        if (allowedTools.includes(prefixedTool) || allowedTools.includes(prefix + "*")) {
          return true;
        }
      }
    }

    // 检查 allowedTools 中是否包含纯前缀（如 "file:"）
    for (const allowedTool of allowedTools) {
      if (allowedTool.endsWith(":") && toolName.startsWith(allowedTool)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查是否在默认允许列表中
   * @param toolName 工具名称
   * @returns 是否在默认列表中
   */
  private isInDefaultAllowed(toolName: string): boolean {
    const normalizedDefaults = this.config.caseSensitive
      ? this.config.defaultAllowed
      : this.config.defaultAllowed.map((t) => t.toLowerCase());

    return normalizedDefaults.includes(toolName);
  }

  /**
   * 检查是否精确匹配
   * @param toolName 工具名称
   * @param allowedTools 允许的工具列表
   * @returns 是否精确匹配
   */
  private hasExactMatch(toolName: string, allowedTools: string[]): boolean {
    return allowedTools.includes(toolName);
  }

  /**
   * 检查是否通配符匹配
   * 支持模式如 "file:*" 匹配 "file-read"、"file-write" 等
   * @param toolName 工具名称
   * @param allowedTools 允许的工具列表
   * @returns 是否通配符匹配
   */
  private hasWildcardMatch(toolName: string, allowedTools: string[]): boolean {
    for (const allowedTool of allowedTools) {
      // 处理尾部通配符（如 "file:*"）
      if (allowedTool.endsWith("*")) {
        const prefix = allowedTool.slice(0, -1); // 移除 '*'
        // 移除前缀后的常见分隔符（如 "file:" -> "file"）
        const normalizedPrefix = prefix.replace(/[:\-\_]$/, "");
        if (toolName.startsWith(normalizedPrefix) || toolName.startsWith(prefix)) {
          return true;
        }
      }

      // 处理头部通配符（如 "*file"）
      if (allowedTool.startsWith("*")) {
        const suffix = allowedTool.slice(1); // 移除 '*'
        // 移除前缀后的常见分隔符（如 ":file" -> "file"）
        const normalizedSuffix = suffix.replace(/^[:\-\_]/, "");
        if (toolName.endsWith(suffix) || toolName.endsWith(normalizedSuffix)) {
          return true;
        }
      }

      // 处理中间通配符（如 "file-*-operation"）
      if (allowedTool.includes("*")) {
        const regexPattern = allowedTool
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // 转义正则特殊字符
          .replace(/\*/g, ".*"); // 将 * 替换为 .* 用于正则匹配

        try {
          const regex = new RegExp(`^${regexPattern}$`);
          if (regex.test(toolName)) {
            return true;
          }
        } catch (error) {
          logger.warn(`[AllowedToolsValidator] Invalid regex pattern: ${allowedTool}`, error);
          continue;
        }
      }
    }

    return false;
  }

  /**
   * 获取当前配置
   * @returns 当前配置
   */
  getConfig(): Readonly<Required<AllowedToolsValidatorConfig>> {
    return { ...this.config };
  }

  /**
   * 更新配置
   * @param config 新配置
   */
  updateConfig(config: Partial<AllowedToolsValidatorConfig>): void {
    Object.assign(this.config, config);
    logger.debug("AllowedToolsValidator config updated", { config: this.config });
  }
}

/**
 * 默认验证器实例
 */
let defaultValidator: AllowedToolsValidator | null = null;

/**
 * 获取默认权限验证器实例
 */
export function getAllowedToolsValidator(
  config?: AllowedToolsValidatorConfig
): AllowedToolsValidator {
  if (!defaultValidator) {
    defaultValidator = new AllowedToolsValidator(config);
  } else if (config) {
    defaultValidator.updateConfig(config);
  }
  return defaultValidator;
}

/**
 * 重置默认验证器实例（用于测试）
 */
export function resetAllowedToolsValidator(): void {
  defaultValidator = null;
}

// 默认导出
export default AllowedToolsValidator;
