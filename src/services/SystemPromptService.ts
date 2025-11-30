/**
 * SystemPromptService - 系统提示词服务
 * 极简实现：只有一份全局配置，通过{{variable}}占位符动态注入
 *
 * @author 浮浮酱
 * @date 2025-11-30
 */

import * as fs from 'fs';
import * as path from 'path';
import { VariableEngine } from '../core/variable/VariableEngine';
import { logger } from '../utils/logger';
import type { IVariableProvider, VariableContext } from '../types/variable';

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

  constructor(configDir: string = './config') {
    this.configPath = path.join(configDir, 'system-prompt.json');

    // 初始化VariableEngine（启用缓存）
    this.variableEngine = new VariableEngine({
      enableCache: true,
      cacheTTL: 60000 // 60秒缓存
    });

    // 注册默认变量处理器
    this.registerDefaultVariables();

    // 加载配置文件（仅一次）
    this.loadConfig();
  }

  /**
   * 加载配置文件
   */
  private loadConfig(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        logger.warn('[SystemPromptService] Config file not found:', this.configPath);
        this.config = {
          template: '',
          enabled: false
        };
        return;
      }

      const content = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(content);

      logger.info(`[SystemPromptService] Config loaded (version: ${this.config.version || '1.0.0'})`);

    } catch (error) {
      logger.error('[SystemPromptService] Failed to load config:', error);
      this.config = {
        template: '',
        enabled: false
      };
    }
  }

  /**
   * 注册默认变量提供者
   */
  private registerDefaultVariables(): void {
    // 时间变量提供者
    const timeProvider: IVariableProvider = {
      name: 'time',
      resolve: async (key: string, context?: VariableContext) => {
        if (key === 'current_time') {
          return new Date().toISOString();
        }
        return null;
      },
      getSupportedKeys: () => ['current_time']
    };

    // 日期变量提供者
    const dateProvider: IVariableProvider = {
      name: 'date',
      resolve: async (key: string, context?: VariableContext) => {
        if (key === 'current_date') {
          return new Date().toLocaleDateString('zh-CN');
        }
        return null;
      },
      getSupportedKeys: () => ['current_date']
    };

    this.variableEngine.registerProvider(timeProvider);
    this.variableEngine.registerProvider(dateProvider);
  }

  /**
   * 获取系统提示词（核心方法）
   *
   * 极简设计：只有一份全局配置，通过{{variable}}占位符动态注入
   *
   * @param context 上下文变量（用于变量渲染，如model、时间等）
   * @returns 渲染后的系统提示词，如果没有配置或禁用返回null
   */
  async getSystemPrompt(context: Record<string, any> = {}): Promise<string | null> {
    // 检查全局配置是否启用
    if (this.config.enabled && this.config.template) {
      logger.debug('[SystemPromptService] Rendering system prompt template');
      return await this.renderTemplate(this.config.template, context);
    }

    // 没有配置或已禁用
    logger.debug('[SystemPromptService] System prompt disabled or not configured');
    return null;
  }

  /**
   * 渲染模板（变量替换）
   *
   * @param template 模板字符串
   * @param context 上下文变量
   * @returns 渲染后的字符串
   */
  private async renderTemplate(template: string, context: Record<string, any>): Promise<string> {
    try {
      // 合并配置中的默认变量和上下文变量
      // context的优先级高于config.variables
      const variables: VariableContext = {
        ...(this.config.variables || {}),
        ...context
      };

      // 使用VariableEngine渲染模板
      return await this.variableEngine.resolveAll(template, variables);

    } catch (error) {
      logger.warn('[SystemPromptService] Failed to render template:', error);
      return template; // 渲染失败返回原模板
    }
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
      enabled: config.enabled ?? true
    };

    logger.info('[SystemPromptService] Config updated');

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
      fs.writeFileSync(this.configPath, content, 'utf-8');
      logger.info('[SystemPromptService] Config saved to file');
    } catch (error) {
      logger.error('[SystemPromptService] Failed to save config:', error);
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
    logger.debug('[SystemPromptService] Cleanup completed');
  }
}
