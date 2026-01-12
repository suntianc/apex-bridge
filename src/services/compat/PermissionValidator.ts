/**
 * PermissionValidator - 权限验证器
 * 验证 skill 执行时的工具调用权限
 */

import { ToolError, ToolErrorCode } from "../../types/tool-system";
import { logger } from "../../utils/logger";
import { getSkillManager } from "../SkillManager";
import { ParsedClaudeSkill } from "./types";

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
 * 权限验证器
 * 验证 skill 执行时的工具调用权限
 */
export class PermissionValidator {
  private config: PermissionValidationConfig;

  constructor(config?: Partial<PermissionValidationConfig>) {
    this.config = {
      enabled: true,
      mode: "strict",
      logDeniedRequests: true,
      caseSensitive: true,
      ...config,
    };
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
    // 如果权限验证已禁用，直接返回允许
    if (!this.config.enabled) {
      return {
        allowed: true,
        deniedTools: [],
      };
    }

    // 如果没有请求任何工具，直接允许
    if (!requestedTools || requestedTools.length === 0) {
      return {
        allowed: true,
        deniedTools: [],
      };
    }

    try {
      // 获取 skill 兼容性信息
      const skillManager = getSkillManager();
      const skill = await skillManager.getSkillByName(skillName);

      if (!skill) {
        // Skill 不存在，根据模式决定行为
        return this.handleSkillNotFound(skillName, requestedTools);
      }

      // 获取 allowedTools 配置
      const allowedTools = this.getAllowedToolsFromSkill(skill);

      // 如果没有配置 allowedTools，允许所有工具
      if (!allowedTools || allowedTools.length === 0) {
        logger.debug(`Skill ${skillName} has no allowedTools configured, allowing all tools`, {
          requestedTools,
        });
        return {
          allowed: true,
          deniedTools: [],
        };
      }

      // 执行权限检查
      const result = this.checkPermissions(requestedTools, allowedTools);

      // 记录拒绝日志
      if (!result.allowed && this.config.logDeniedRequests) {
        this.logDeniedRequest(skillName, requestedTools, allowedTools, result.deniedTools);
      }

      // 根据模式处理拒绝情况
      if (!result.allowed) {
        return this.handlePermissionDenied(skillName, requestedTools, allowedTools);
      }

      return result;
    } catch (error) {
      logger.error(`Permission validation failed for skill ${skillName}:`, error);
      // 验证失败时，根据模式决定行为
      if (this.config.mode === "strict") {
        throw new ToolError(
          `Permission validation failed: ${this.formatError(error)}`,
          ToolErrorCode.TOOL_EXECUTION_FAILED
        );
      }
      // warn 模式下，允许执行但记录警告
      logger.warn(`Permission validation failed for skill ${skillName}, allowing execution`);
      return {
        allowed: true,
        deniedTools: [],
        reason: "Validation failed, allowing due to warn mode",
      };
    }
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
