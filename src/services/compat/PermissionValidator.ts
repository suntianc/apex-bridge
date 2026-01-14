/**
 * PermissionValidator - 权限验证器
 * 验证 skill 执行时的工具调用权限
 */

import { ToolError, ToolErrorCode } from "../../types/tool-system";
import { logger } from "../../utils/logger";
import { getSkillManager } from "../skill/SkillManager";
import { ParsedClaudeSkill } from "./types";
import { LRUCache } from "lru-cache";

/**
 * 权限验证模式
 */
export type PermissionValidationMode = "strict" | "warn" | "disabled";

/**
 * 权限验证配置
 */
export interface PermissionValidationConfig {
  /** 是否启用权限验证 */
  enabled: boolean;
  /** 验证模式 */
  mode: PermissionValidationMode;
  /** 是否记录拒绝日志 */
  logDeniedRequests: boolean;
  /** 是否严格检查大小写 */
  caseSensitive: boolean;
}

/**
 * 权限验证结果
 */
export interface PermissionValidationResult {
  /** 是否允许 */
  allowed: boolean;
  /** 拒绝的工具列表 */
  deniedTools: string[];
  /** 原因 */
  reason?: string;
}

/**
 * 权限验证错误详情
 */
export interface PermissionDeniedDetails {
  skillName: string;
  requestedTools: string[];
  allowedTools: string[];
  missingTools: string[];
  mode: PermissionValidationMode;
  timestamp: string;
}

/**
 * 权限缓存配置
 */
interface PermissionCacheConfig {
  maxEntries: number;
  ttl: number;
}

/**
 * 权限验证器
 * 验证 skill 执行时的工具调用权限
 */
export class PermissionValidator {
  private config: PermissionValidationConfig;
  private permissionCache: LRUCache<string, PermissionValidationResult>;
  private cacheHits = 0;
  private cacheMisses = 0;
  private readonly permissionCacheConfig: PermissionCacheConfig = {
    maxEntries: 1000,
    ttl: 5 * 60 * 1000,
  };

  constructor(config?: Partial<PermissionValidationConfig>) {
    this.config = {
      enabled: true,
      mode: "strict",
      logDeniedRequests: true,
      caseSensitive: true,
      ...config,
    };

    this.permissionCache = new LRUCache<string, PermissionValidationResult>({
      max: this.permissionCacheConfig.maxEntries,
      ttl: this.permissionCacheConfig.ttl,
    });
  }

  /**
   * 验证工具调用权限
   * @param skillName skill 名称
   * @param requestedTools 请求的工具列表
   * @returns 验证结果
   */
  async validatePermissions(
    skillName: string,
    requestedTools: string[]
  ): Promise<PermissionValidationResult> {
    if (!this.config.enabled) {
      return {
        allowed: true,
        deniedTools: [],
      };
    }

    if (!requestedTools || requestedTools.length === 0) {
      return {
        allowed: true,
        deniedTools: [],
      };
    }

    const cacheKey = `${skillName}:${requestedTools.sort().join(",")}`;
    if (this.permissionCache.has(cacheKey)) {
      this.cacheHits++;
      return this.permissionCache.get(cacheKey)!;
    }

    this.cacheMisses++;

    try {
      const skillManager = getSkillManager();
      const skill = await skillManager.getSkillByName(skillName);

      if (!skill) {
        const result = this.handleSkillNotFound(skillName, requestedTools);
        this.permissionCache.set(cacheKey, result);
        return result;
      }

      const allowedTools = this.getAllowedToolsFromSkill(skill);

      if (!allowedTools || allowedTools.length === 0) {
        const result = {
          allowed: true,
          deniedTools: [],
        };
        this.permissionCache.set(cacheKey, result);
        return result;
      }

      const result = this.checkPermissions(requestedTools, allowedTools);

      if (!result.allowed && this.config.logDeniedRequests) {
        this.logDeniedRequest(skillName, requestedTools, allowedTools, result.deniedTools);
      }

      if (!result.allowed) {
        const handledResult = this.handlePermissionDenied(skillName, requestedTools, allowedTools);
        this.permissionCache.set(cacheKey, handledResult);
        return handledResult;
      }

      this.permissionCache.set(cacheKey, result);
      return result;
    } catch (error) {
      logger.error(`Permission validation failed for skill ${skillName}:`, error);
      if (this.config.mode === "strict") {
        throw new ToolError(
          `Permission validation failed: ${this.formatError(error)}`,
          ToolErrorCode.TOOL_EXECUTION_FAILED
        );
      }
      logger.warn(`Permission validation failed for skill ${skillName}, allowing execution`);
      const result = {
        allowed: true,
        deniedTools: [],
        reason: "Validation failed, allowing due to warn mode",
      };
      this.permissionCache.set(cacheKey, result);
      return result;
    }
  }

  /**
   * 获取权限缓存统计
   */
  getPermissionCacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
    return {
      size: this.permissionCache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0,
    };
  }

  /**
   * 清除权限缓存
   */
  clearPermissionCache(): void {
    this.permissionCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    logger.debug("Permission cache cleared");
  }

  /**
   * 验证单个工具调用
   * @param skillName skill 名称
   * @param toolName 工具名称
   * @returns 验证结果
   */
  async validateTool(skillName: string, toolName: string): Promise<PermissionValidationResult> {
    return this.validatePermissions(skillName, [toolName]);
  }

  /**
   * 检查工具是否被允许
   * @param skillName skill 名称
   * @param toolName 工具名称
   * @returns 是否允许
   */
  async isToolAllowed(skillName: string, toolName: string): Promise<boolean> {
    const result = await this.validateTool(skillName, toolName);
    return result.allowed;
  }

  /**
   * 获取允许的工具列表
   * @param skillName skill 名称
   * @returns 允许的工具列表
   */
  async getAllowedTools(skillName: string): Promise<string[]> {
    try {
      const skillManager = getSkillManager();
      const skill = await skillManager.getSkillByName(skillName);

      if (!skill) {
        return [];
      }

      return this.getAllowedToolsFromSkill(skill);
    } catch (error) {
      logger.error(`Failed to get allowed tools for skill ${skillName}:`, error);
      return [];
    }
  }

  /**
   * 更新配置
   * @param config 新配置
   */
  updateConfig(config: Partial<PermissionValidationConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
    logger.info("PermissionValidator config updated", { config: this.config });
  }

  /**
   * 获取当前配置
   * @returns 当前配置
   */
  getConfig(): PermissionValidationConfig {
    return { ...this.config };
  }

  /**
   * 从 skill 对象获取允许的工具列表
   */
  private getAllowedToolsFromSkill(skill: any): string[] {
    // 从兼容层获取 allowedTools
    if (skill.compatibility && skill.compatibility.allowedTools) {
      return skill.compatibility.allowedTools;
    }

    // 从 metadata 获取
    if (skill.metadata && skill.metadata.tools) {
      return skill.metadata.tools;
    }

    return [];
  }

  /**
   * 执行权限检查
   */
  private checkPermissions(
    requestedTools: string[],
    allowedTools: string[]
  ): PermissionValidationResult {
    const deniedTools: string[] = [];

    for (const tool of requestedTools) {
      const isAllowed = this.isToolInList(tool, allowedTools);
      if (!isAllowed) {
        deniedTools.push(tool);
      }
    }

    return {
      allowed: deniedTools.length === 0,
      deniedTools,
      reason:
        deniedTools.length > 0 ? `Tools not in allowed list: ${deniedTools.join(", ")}` : undefined,
    };
  }

  /**
   * 检查工具是否在列表中
   */
  private isToolInList(tool: string, list: string[]): boolean {
    if (this.config.caseSensitive) {
      return list.includes(tool);
    }

    // 不区分大小写比较
    const toolLower = tool.toLowerCase();
    return list.some((item) => item.toLowerCase() === toolLower);
  }

  /**
   * 处理 skill 不存在的情况
   */
  private handleSkillNotFound(
    skillName: string,
    requestedTools: string[]
  ): PermissionValidationResult {
    if (this.config.mode === "strict") {
      const error = new ToolError(`Skill not found: ${skillName}`, ToolErrorCode.SKILL_NOT_FOUND);
      throw error;
    }

    logger.warn(`Skill ${skillName} not found, allowing tool execution in warn mode`);
    return {
      allowed: true,
      deniedTools: [],
      reason: "Skill not found, allowing in warn mode",
    };
  }

  /**
   * 处理权限被拒绝的情况
   */
  private handlePermissionDenied(
    skillName: string,
    requestedTools: string[],
    allowedTools: string[]
  ): PermissionValidationResult {
    const missingTools = requestedTools.filter((tool) => !this.isToolInList(tool, allowedTools));

    const details: PermissionDeniedDetails = {
      skillName,
      requestedTools,
      allowedTools,
      missingTools,
      mode: this.config.mode,
      timestamp: new Date().toISOString(),
    };

    if (this.config.mode === "strict") {
      const error = new ToolError(
        `Permission denied: tools [${missingTools.join(", ")}] are not allowed for skill ${skillName}`,
        ToolErrorCode.TOOL_EXECUTION_FAILED,
        details
      );
      throw error;
    }

    // warn 模式：允许执行但记录警告
    logger.warn(`Permission denied for skill ${skillName}`, details);
    return {
      allowed: true,
      deniedTools: missingTools,
      reason: "Permission denied but allowed due to warn mode",
    };
  }

  /**
   * 记录拒绝请求日志
   */
  private logDeniedRequest(
    skillName: string,
    requestedTools: string[],
    allowedTools: string[],
    deniedTools: string[]
  ): void {
    logger.warn(`Permission denied for skill ${skillName}`, {
      skillName,
      requestedTools,
      allowedTools,
      deniedTools,
      missingTools: deniedTools,
      mode: this.config.mode,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 格式化错误信息
   */
  private formatError(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown error";
  }
}

// 默认实例
let defaultValidator: PermissionValidator | null = null;

/**
 * 获取默认权限验证器实例
 */
export function getPermissionValidator(
  config?: Partial<PermissionValidationConfig>
): PermissionValidator {
  if (!defaultValidator) {
    defaultValidator = new PermissionValidator(config);
  } else if (config) {
    defaultValidator.updateConfig(config);
  }
  return defaultValidator;
}

/**
 * 重置默认验证器实例（用于测试）
 */
export function resetPermissionValidator(): void {
  defaultValidator = null;
}
