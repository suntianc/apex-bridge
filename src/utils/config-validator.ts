/**
 * 配置验证器
 * 负责验证配置的正确性
 *
 * ACE 功能已删除 (2026-01-11)
 */

import { logger } from "./logger";
import type { AdminConfig } from "../types/config/index";

/**
 * 配置验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误列表 */
  errors: string[];
  /** 警告列表 */
  warnings?: string[];
}

export class ConfigValidator {
  /**
   * 验证完整配置
   */
  public validate(config: AdminConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 基础验证
      this.validateAuth(config.auth, errors, warnings);
      this.validateApi(config.api, errors, warnings);

      return {
        valid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      logger.error("配置验证失败:", error);
      return {
        valid: false,
        errors: ["配置验证过程中发生错误"],
      };
    }
  }

  /**
   * 验证认证配置
   */
  private validateAuth(auth: AdminConfig["auth"], errors: string[], warnings: string[]): void {
    if (!auth || typeof auth.enabled !== "boolean") {
      errors.push("auth.enabled 必须是布尔值");
    }

    if (auth?.enabled && !auth?.apiKey) {
      errors.push("启用认证时必须提供 apiKey");
    }
  }

  /**
   * 验证 API 配置
   */
  private validateApi(api: AdminConfig["api"], errors: string[], warnings: string[]): void {
    if (!api || typeof api.port !== "number") {
      errors.push("api.port 必须是数字");
    }

    if (api?.port && (api.port < 1 || api.port > 65535)) {
      errors.push("api.port 必须在 1-65535 范围内");
    }
  }
}
