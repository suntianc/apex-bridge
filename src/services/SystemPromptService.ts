/**
 * SystemPromptService - 系统提示词服务
 * 极简实现：只有一份全局配置，通过{{variable}}占位符动态注入
 *
 * @author 浮浮酱
 * @date 2025-11-30
 */

import * as fs from "fs";
import * as path from "path";
import { VariableEngine } from "../core/variable/VariableEngine";
import { logger } from "../utils/logger";

/**
 * 系统提示词配置接口
 */
export interface SystemPromptConfig {
  /** 模板内容 (支持{{variable}}语法) */
  template: string;

  /** 是否启用 */
  enabled: boolean;

  /** 默认变量 */
  variables?: Record<string, any>;

  /** 版本 */
  version?: string;
}

/**
 * 系统提示词服务 - 极简实现
 *
 * 特点：
 * - 只有一份全局配置
 * - 启动时加载，无热更新
 * - 通过{{variable}}占位符动态注入
 * - 无管理接口，通过编辑配置文件修改
 */
export class SystemPromptService {
  private configPath: string;
  private config: SystemPromptConfig;
  private variableEngine: VariableEngine;

  constructor(configDir: string = "./config") {
    this.configPath = path.join(configDir, "system-prompt.md");

    // 初始化VariableEngine（简化版，无缓存）
    this.variableEngine = new VariableEngine();

    // 加载配置文件（仅一次）
    this.loadConfig();
  }

  /**
   * 加载配置文件
   */
  private loadConfig(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        logger.warn("[SystemPromptService] Config file not found:", this.configPath);
        this.config = {
          template: "",
          enabled: false,
        };
        return;
      }

      const content = fs.readFileSync(this.configPath, "utf-8");

      // 检查文件扩展名来确定解析方式
      const fileExt = path.extname(this.configPath).toLowerCase();

      if (fileExt === ".md") {
        // Markdown文件：直接使用内容作为模板
        this.config = {
          template: content,
          enabled: true,
          version: "1.0.0",
        };
        logger.debug("[SystemPromptService] Markdown config loaded");
      } else {
        // JSON文件：解析为配置对象
        this.config = JSON.parse(content);
        logger.info(
          `[SystemPromptService] JSON config loaded (version: ${this.config.version || "1.0.0"})`
        );
      }
    } catch (error) {
      logger.error("[SystemPromptService] Failed to load config:", error);
      this.config = {
        template: "",
        enabled: false,
      };
    }
  }

  /**
   * 获取系统提示词模板（原始模板，不进行变量替换）
   *
   * @returns 原始模板字符串，如果没有配置或禁用返回null
   */
  getSystemPromptTemplate(): string | null {
    // 检查全局配置是否启用
    if (this.config.enabled && this.config.template) {
      logger.debug("[SystemPromptService] Returning system prompt template");
      return this.config.template;
    }

    // 没有配置或已禁用
    logger.debug("[SystemPromptService] System prompt disabled or not configured");
    return null;
  }

  /**
   * 更新全局系统提示词配置（运行时）
   *
   * @param config 新配置
   * @param saveToFile 是否保存到文件（默认false）
   */
  updateConfig(config: SystemPromptConfig, saveToFile: boolean = false): void {
    this.config = {
      ...config,
      enabled: config.enabled ?? true,
    };

    logger.info("[SystemPromptService] Config updated");

    if (saveToFile) {
      this.saveConfigToFile();
    }
  }

  /**
   * 保存配置到文件
   */
  private saveConfigToFile(): void {
    try {
      const content = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(this.configPath, content, "utf-8");
      logger.info("[SystemPromptService] Config saved to file");
    } catch (error) {
      logger.error("[SystemPromptService] Failed to save config:", error);
    }
  }

  /**
   * 获取当前配置（调试用）
   */
  getConfig(): Readonly<SystemPromptConfig> {
    return { ...this.config };
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 无需清理（没有文件监听器）
    logger.debug("[SystemPromptService] Cleanup completed");
  }
}
