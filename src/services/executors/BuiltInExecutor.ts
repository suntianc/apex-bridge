/**
 * 内置工具执行器
 * 通过直接方法调用执行内置工具，无进程开销
 */

import { BaseToolExecutor } from './ToolExecutor';
import { BuiltInTool, ToolExecuteOptions, ToolResult, ToolError, ToolErrorCode } from '../../types/tool-system';
import { getBuiltInToolsRegistry } from '../BuiltInToolsRegistry';
import { logger } from '../../utils/logger';

/**
 * 内置工具执行器
 * 提供高性能的内置工具执行能力
 */
export class BuiltInExecutor extends BaseToolExecutor {
  private registry = getBuiltInToolsRegistry();

  constructor() {
    super();
    logger.debug('BuiltInExecutor initialized');
  }

  /**
   * 执行内置工具
   * @param options 执行选项
   * @returns 执行结果
   */
  async execute(options: ToolExecuteOptions): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // 验证执行选项
      this.validateExecuteOptions(options);

      // 获取工具
      const tool = this.registry.getTool(options.name);
      if (!tool) {
        throw new ToolError(
          `Built-in tool not found: ${options.name}`,
          ToolErrorCode.TOOL_NOT_FOUND
        );
      }

      if (!tool.enabled) {
        throw new ToolError(
          `Built-in tool is disabled: ${options.name}`,
          ToolErrorCode.TOOL_NOT_FOUND
        );
      }

      logger.info(`Executing built-in tool: ${options.name}`);
      logger.debug(`Tool arguments:`, options.args);

      // 验证工具参数
      this.registry.validateToolParameters(tool, options.args);

      // 执行工具
      const result = await tool.execute(options.args);

      // 记录执行时间
      const duration = this.calculateDuration(startTime);
      logger.info(`Built-in tool ${options.name} completed in ${duration}ms`);

      return {
        ...result,
        duration: result.duration || duration
      };

    } catch (error) {
      const duration = this.calculateDuration(startTime);

      if (error instanceof ToolError) {
        logger.error(`Built-in tool ${options.name} failed: ${error.message}`);
        return this.createErrorResult(error.message, duration, error.code);
      }

      logger.error(`Built-in tool ${options.name} failed with unexpected error:`, error);
      return this.createErrorResult(
        `Built-in tool execution failed: ${this.formatError(error)}`,
        duration,
        ToolErrorCode.TOOL_EXECUTION_FAILED
      );
    }
  }

  /**
   * 获取支持的工具列表
   * @returns 工具列表
   */
  listTools(): BuiltInTool[] {
    return this.registry.listTools();
  }

  /**
   * 获取所有工具（包括禁用的）
   * @returns 所有工具列表
   */
  listAllTools(): BuiltInTool[] {
    return this.registry.listAllTools();
  }

  /**
   * 获取工具详情
   * @param name 工具名称
   * @returns 工具详情或undefined
   */
  getTool(name: string): BuiltInTool | undefined {
    return this.registry.getTool(name);
  }

  /**
   * 启用工具
   * @param name 工具名称
   * @returns 是否成功
   */
  enableTool(name: string): boolean {
    return this.registry.enableTool(name);
  }

  /**
   * 禁用工具
   * @param name 工具名称
   * @returns 是否成功
   */
  disableTool(name: string): boolean {
    return this.registry.disableTool(name);
  }

  /**
   * 批量启用工具
   * @param names 工具名称列表
   */
  enableTools(names: string[]): void {
    this.registry.enableTools(names);
  }

  /**
   * 批量禁用工具
   * @param names 工具名称列表
   */
  disableTools(names: string[]): void {
    this.registry.disableTools(names);
  }

  /**
   * 获取执行器统计信息
   * @returns 统计信息
   */
  getStatistics() {
    return {
      type: 'builtin',
      registryStats: this.registry.getStatistics()
    };
  }

  /**
   * 获取工具分类统计
   * @returns 分类统计
   */
  getCategoryStatistics() {
    const tools = this.listTools();
    const categories: Record<string, number> = {};

    tools.forEach(tool => {
      categories[tool.category] = (categories[tool.category] || 0) + 1;
    });

    return categories;
  }

  /**
   * 批量执行工具
   * @param optionsList 执行选项列表
   * @returns 执行结果列表
   */
  async executeBatch(optionsList: ToolExecuteOptions[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const options of optionsList) {
      try {
        const result = await this.execute(options);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: this.formatError(error),
          duration: 0,
          errorCode: ToolErrorCode.TOOL_EXECUTION_FAILED,
          exitCode: 1
        });
      }
    }

    return results;
  }

  /**
   * 并行执行工具
   * @param optionsList 执行选项列表
   * @param concurrency 并发数
   * @returns 执行结果列表
   */
  async executeParallel(
    optionsList: ToolExecuteOptions[],
    concurrency: number = 5
  ): Promise<ToolResult[]> {
    // 使用p-limit控制并发
    const pLimit = require('p-limit');
    const limit = pLimit(concurrency);

    const promises = optionsList.map(options =>
      limit(() => this.execute(options))
    );

    return Promise.all(promises);
  }

  /**
   * 验证工具是否存在且可用
   * @param name 工具名称
   * @returns 验证结果
   */
  validateTool(name: string): { valid: boolean; reason?: string } {
    const tool = this.registry.getTool(name);

    if (!tool) {
      return { valid: false, reason: `Tool '${name}' not found` };
    }

    if (!tool.enabled) {
      return { valid: false, reason: `Tool '${name}' is disabled` };
    }

    return { valid: true };
  }
}

/**
 * 内置工具执行器工厂
 */
export class BuiltInExecutorFactory {
  private static instance: BuiltInExecutor | null = null;

  /**
   * 获取内置工具执行器实例
   * @returns 执行器实例
   */
  static getInstance(): BuiltInExecutor {
    if (!this.instance) {
      this.instance = new BuiltInExecutor();
    }
    return this.instance;
  }

  /**
   * 重置实例（用于测试）
   */
  static resetInstance(): void {
    this.instance = null;
  }
}

/**
 * 获取默认的内置工具执行器
 * @returns 内置工具执行器实例
 */
export function getBuiltInExecutor(): BuiltInExecutor {
  return BuiltInExecutorFactory.getInstance();
}