/**
 * 内置工具注册表
 * 管理系统内置工具，提供统一的注册和调用接口
 * 同时集成 ToolRegistry 进行统一工具管理
 */

import {
  BuiltInTool,
  ToolResult,
  ToolExecuteOptions,
  ToolError,
  ToolErrorCode,
} from "../types/tool-system";
import { BaseToolExecutor } from "./executors/ToolExecutor";
import { createFileReadTool } from "../core/tools/builtin/FileReadTool";
import { createFileWriteTool } from "../core/tools/builtin/FileWriteTool";
import { createVectorSearchTool } from "../core/tools/builtin/VectorSearchTool";
import { createReadSkillTool } from "../core/tools/builtin/ReadSkillTool";
import { createPlatformDetectorTool } from "../core/tools/builtin/PlatformDetectorTool";
import { toolRegistry, ToolType } from "../core/tool/registry";
import type { Tool } from "../core/tool/tool";
import { logger } from "../utils/logger";

/**
 * 内置工具注册表
 * 负责管理所有内置工具的生命周期和调用
 */
export class BuiltInToolsRegistry extends BaseToolExecutor {
  private tools: Map<string, BuiltInTool> = new Map();
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    super();
    // 启动异步初始化
    this.initializationPromise = this.initializeBuiltinTools().catch((error) => {
      logger.error("Failed to initialize built-in tools:", error);
    });
  }

  /**
   * 等待初始化完成
   */
  async waitForInitialization(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * 初始化内置工具
   */
  private async initializeBuiltinTools(): Promise<void> {
    logger.debug("Initializing built-in tools registry...");

    // 注册文件系统工具
    await this.registerTool(createFileReadTool());
    await this.registerTool(createFileWriteTool());

    // 注册搜索工具
    await this.registerTool(createVectorSearchTool());

    // 注册 Skill 工具
    await this.registerTool(createReadSkillTool());

    // 注册系统工具
    await this.registerTool(createPlatformDetectorTool());

    // TODO: 注册其他内置工具
    // await this.registerTool(createDateTimeTool());
    // await this.registerTool(createCalculationTool());

    logger.debug(`Registered ${this.tools.size} built-in tools`);
  }

  /**
   * 将 BuiltInTool 转换为 Tool.Info 格式
   * @param tool BuiltInTool 定义
   * @returns Tool.Info 格式
   */
  private convertToToolInfo(tool: BuiltInTool): Tool.Info {
    return {
      id: tool.name,
      init: async () => ({
        description: tool.description,
        parameters: tool.parameters,
        execute: async (args, ctx) => {
          const result = await tool.execute(args);
          return {
            title: "",
            metadata: {},
            output: result.output || "",
          };
        },
      }),
    };
  }

  /**
   * 注册工具
   * 同时注册到 BuiltInToolsRegistry 和 ToolRegistry
   * @param tool 工具定义
   */
  async registerTool(tool: BuiltInTool): Promise<void> {
    if (!tool.name || !tool.execute) {
      throw new Error("Tool must have name and execute function");
    }

    this.tools.set(tool.name, tool);
    logger.debug(`Registered built-in tool: ${tool.name}`);

    // 同时注册到 ToolRegistry
    const toolInfo = this.convertToToolInfo(tool);
    await toolRegistry.register(toolInfo, ToolType.BUILTIN);
    logger.debug(`Registered built-in tool to ToolRegistry: ${tool.name}`);
  }

  /**
   * 注销工具
   * @param name 工具名称
   */
  unregisterTool(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      logger.debug(`Unregistered built-in tool: ${name}`);
    }
    return existed;
  }

  /**
   * 执行工具
   * @param options 执行选项
   * @returns 执行结果
   */
  async execute(options: ToolExecuteOptions): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // 验证执行选项
      this.validateExecuteOptions(options);

      // 获取工具
      const tool = this.tools.get(options.name);
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

      // 执行工具
      const result = await tool.execute(options.args);

      // 记录执行统计
      const duration = this.calculateDuration(startTime);
      logger.info(`Built-in tool ${options.name} completed in ${duration}ms`);

      return result;
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
    return Array.from(this.tools.values())
      .filter((tool) => tool.enabled)
      .sort((a, b) => a.level - b.level);
  }

  /**
   * 获取所有工具（包括禁用的）
   * @returns 所有工具列表
   */
  listAllTools(): BuiltInTool[] {
    return Array.from(this.tools.values()).sort((a, b) => a.level - b.level);
  }

  /**
   * 获取工具详情
   * @param name 工具名称
   * @returns 工具详情或undefined
   */
  getTool(name: string): BuiltInTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 启用工具
   * @param name 工具名称
   * @returns 是否成功
   */
  enableTool(name: string): boolean {
    const tool = this.tools.get(name);
    if (tool) {
      tool.enabled = true;
      logger.debug(`Enabled built-in tool: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * 禁用工具
   * @param name 工具名称
   * @returns 是否成功
   */
  disableTool(name: string): boolean {
    const tool = this.tools.get(name);
    if (tool) {
      tool.enabled = false;
      logger.debug(`Disabled built-in tool: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * 批量启用工具
   * @param names 工具名称列表
   */
  enableTools(names: string[]): void {
    names.forEach((name) => this.enableTool(name));
  }

  /**
   * 批量禁用工具
   * @param names 工具名称列表
   */
  disableTools(names: string[]): void {
    names.forEach((name) => this.disableTool(name));
  }

  /**
   * 获取工具统计信息
   * @returns 统计信息
   */
  getStatistics() {
    const allTools = this.listAllTools();
    const enabledTools = this.listTools();

    return {
      total: allTools.length,
      enabled: enabledTools.length,
      disabled: allTools.length - enabledTools.length,
      byCategory: this.groupByCategory(allTools),
      byLevel: this.groupByLevel(allTools),
    };
  }

  /**
   * 按分类分组工具
   */
  private groupByCategory(tools: BuiltInTool[]): Record<string, number> {
    const groups: Record<string, number> = {};
    tools.forEach((tool) => {
      groups[tool.category] = (groups[tool.category] || 0) + 1;
    });
    return groups;
  }

  /**
   * 按级别分组工具
   */
  private groupByLevel(tools: BuiltInTool[]): Record<string, number> {
    const groups: Record<string, number> = {};
    tools.forEach((tool) => {
      const level = `level_${tool.level}`;
      groups[level] = (groups[level] || 0) + 1;
    });
    return groups;
  }

  /**
   * 验证工具参数
   * @param tool 工具定义
   * @param args 参数对象
   * @throws 当参数无效时抛出错误
   */
  validateToolParameters(tool: BuiltInTool, args: Record<string, any>): void {
    if (!tool.parameters || !tool.parameters.properties) {
      return; // 没有参数模式，跳过验证
    }

    const { properties, required = [] } = tool.parameters;

    // 检查必需参数
    for (const param of required) {
      if (args[param] === undefined || args[param] === null) {
        throw new ToolError(
          `Missing required parameter: ${param}`,
          ToolErrorCode.TOOL_EXECUTION_FAILED
        );
      }
    }

    // 验证参数类型和约束
    for (const [key, value] of Object.entries(args)) {
      const schema = properties[key];
      if (!schema) {
        if (tool.parameters.additionalProperties === false) {
          throw new ToolError(`Unknown parameter: ${key}`, ToolErrorCode.TOOL_EXECUTION_FAILED);
        }
        continue;
      }

      this.validateParameter(key, value, schema);
    }
  }

  /**
   * 验证单个参数
   */
  private validateParameter(name: string, value: any, schema: any): void {
    // 类型验证
    if (schema.type && !this.validateType(value, schema.type)) {
      throw new ToolError(
        `Invalid type for parameter '${name}': expected ${schema.type}, got ${typeof value}`,
        ToolErrorCode.TOOL_EXECUTION_FAILED
      );
    }

    // 枚举验证
    if (schema.enum && !schema.enum.includes(value)) {
      throw new ToolError(
        `Invalid value for parameter '${name}': must be one of ${schema.enum.join(", ")}`,
        ToolErrorCode.TOOL_EXECUTION_FAILED
      );
    }

    // 数值约束
    if (schema.type === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) {
        throw new ToolError(
          `Value for parameter '${name}' must be >= ${schema.minimum}`,
          ToolErrorCode.TOOL_EXECUTION_FAILED
        );
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        throw new ToolError(
          `Value for parameter '${name}' must be <= ${schema.maximum}`,
          ToolErrorCode.TOOL_EXECUTION_FAILED
        );
      }
    }

    // 字符串约束
    if (schema.type === "string") {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        throw new ToolError(
          `Length of parameter '${name}' must be >= ${schema.minLength}`,
          ToolErrorCode.TOOL_EXECUTION_FAILED
        );
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        throw new ToolError(
          `Length of parameter '${name}' must be <= ${schema.maxLength}`,
          ToolErrorCode.TOOL_EXECUTION_FAILED
        );
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        throw new ToolError(
          `Value for parameter '${name}' does not match pattern: ${schema.pattern}`,
          ToolErrorCode.TOOL_EXECUTION_FAILED
        );
      }
    }
  }

  /**
   * 验证类型
   */
  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number";
      case "boolean":
        return typeof value === "boolean";
      case "array":
        return Array.isArray(value);
      case "object":
        return typeof value === "object" && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }
}

/**
 * 内置工具注册表单例
 */
let instance: BuiltInToolsRegistry | null = null;

/**
 * 获取内置工具注册表实例
 * @returns 注册表实例
 */
export function getBuiltInToolsRegistry(): BuiltInToolsRegistry {
  if (!instance) {
    instance = new BuiltInToolsRegistry();
  }
  return instance;
}

/**
 * 重置内置工具注册表实例（用于测试）
 */
export function resetBuiltInToolsRegistry(): void {
  instance = null;
}

/**
 * 内置工具名称常量
 */
export const BUILTIN_TOOL_NAMES = {
  FILE_READ: "file-read",
  FILE_WRITE: "file-write",
  VECTOR_SEARCH: "vector-search",
  READ_SKILL: "read-skill",
  PLATFORM_DETECTOR: "platform-detector",
  DATETIME: "datetime",
  CALCULATION: "calculation",
} as const;

export type BuiltinToolName = (typeof BUILTIN_TOOL_NAMES)[keyof typeof BUILTIN_TOOL_NAMES];
