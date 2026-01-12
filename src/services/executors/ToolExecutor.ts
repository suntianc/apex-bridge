/**
 * 工具执行器接口定义
 * 定义内置工具和Skills工具的通用执行接口
 */

import {
  ToolExecutor as IToolExecutor,
  ToolExecuteOptions,
  ToolResult,
  BuiltInTool,
  SkillTool,
} from "../../types/tool-system";
// 注意：不在这里导入 BuiltInToolsRegistry 以避免循环依赖

/**
 * 安全序列化函数 - 防止循环引用和特殊值导致的问题
 */
function safeStringify(obj: any): string {
  const seen: any[] = [];
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "object" && value !== null) {
      // 处理循环引用
      if (seen.includes(value)) {
        return "[Circular]";
      }
      seen.push(value);
    }
    // 处理特殊值
    if (value === undefined) {
      return null;
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "function") {
      return "[Function]";
    }
    return value;
  });
}

/**
 * 抽象工具执行器基类
 * 提供通用的工具执行接口和基础功能
 */
export abstract class BaseToolExecutor implements IToolExecutor {
  /**
   * 执行工具
   * @param options 执行选项
   * @returns 执行结果
   */
  abstract execute(options: ToolExecuteOptions): Promise<ToolResult>;

  /**
   * 获取支持的工具列表
   * @returns 工具列表
   */
  abstract listTools(): (BuiltInTool | SkillTool)[];

  /**
   * 检查工具是否存在
   * @param name 工具名称
   * @returns 是否存在
   */
  hasTool(name: string): boolean {
    return this.listTools().some((tool) => tool.name === name);
  }

  /**
   * 获取工具详情
   * @param name 工具名称
   * @returns 工具详情或undefined
   */
  getTool(name: string): BuiltInTool | SkillTool | undefined {
    return this.listTools().find((tool) => tool.name === name);
  }

  /**
   * 验证执行选项
   * @param options 执行选项
   * @throws 当选项无效时抛出错误
   */
  protected validateExecuteOptions(options: ToolExecuteOptions): void {
    if (!options.name || typeof options.name !== "string") {
      throw new Error("Tool name is required and must be a string");
    }

    if (!options.args || typeof options.args !== "object") {
      throw new Error("Tool arguments are required and must be an object");
    }

    if (options.timeout && (typeof options.timeout !== "number" || options.timeout <= 0)) {
      throw new Error("Timeout must be a positive number");
    }

    if (
      options.maxOutputSize &&
      (typeof options.maxOutputSize !== "number" || options.maxOutputSize <= 0)
    ) {
      throw new Error("Max output size must be a positive number");
    }

    if (
      options.concurrency &&
      (typeof options.concurrency !== "number" || options.concurrency <= 0)
    ) {
      throw new Error("Concurrency must be a positive number");
    }
  }

  /**
   * 创建成功的执行结果
   * @param output 输出内容
   * @param duration 执行耗时
   * @returns 成功结果
   */
  protected createSuccessResult(output: string, duration: number): ToolResult {
    return {
      success: true,
      output,
      duration,
      exitCode: 0,
    };
  }

  /**
   * 创建失败的执行结果
   * @param error 错误信息
   * @param duration 执行耗时
   * @param errorCode 错误代码
   * @returns 失败结果
   */
  protected createErrorResult(error: string, duration: number, errorCode?: string): ToolResult {
    return {
      success: false,
      error,
      duration,
      errorCode,
      exitCode: 1,
    };
  }

  /**
   * 计算执行耗时
   * @param startTime 开始时间
   * @returns 耗时（毫秒）
   */
  protected calculateDuration(startTime: number): number {
    return Date.now() - startTime;
  }

  /**
   * 格式化错误信息
   * @param error 原始错误
   * @returns 格式化的错误信息
   */
  protected formatError(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return safeStringify(error);
  }
}

/**
 * 工具执行器工厂
 */
export class ToolExecutorFactory {
  /**
   * 创建内置工具执行器
   * @returns 内置工具执行器实例
   */
  static createBuiltInExecutor(): IToolExecutor {
    // 使用延迟导入避免循环依赖
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBuiltInToolsRegistry } = require("../BuiltInToolsRegistry");
    return getBuiltInToolsRegistry();
  }

  /**
   * 创建Skills沙箱执行器
   * @returns Skills沙箱执行器实例（暂时返回空执行器）
   */
  static createSkillsSandboxExecutor(): IToolExecutor {
    // Skills 沙箱执行器暂未实现，返回空执行器
    return new EmptyToolExecutor();
  }
}

/**
 * 空工具执行器（占位用）
 * 用于 Skills 沙箱执行器未实现时的占位
 */
class EmptyToolExecutor extends BaseToolExecutor {
  async execute(options: ToolExecuteOptions): Promise<ToolResult> {
    return this.createErrorResult(
      `Skills sandbox executor not implemented. Tool: ${options.name}`,
      0,
      "NOT_IMPLEMENTED"
    );
  }

  listTools(): (BuiltInTool | SkillTool)[] {
    return [];
  }
}

/**
 * 工具执行器管理器
 * 统一管理多个执行器
 */
export class ToolExecutorManager {
  private executors: Map<string, IToolExecutor> = new Map();

  constructor() {
    this.registerExecutor("builtin", ToolExecutorFactory.createBuiltInExecutor());
    this.registerExecutor("skill", ToolExecutorFactory.createSkillsSandboxExecutor());
  }

  /**
   * 注册执行器
   * @param type 执行器类型
   * @param executor 执行器实例
   */
  registerExecutor(type: string, executor: IToolExecutor): void {
    this.executors.set(type, executor);
  }

  /**
   * 获取执行器
   * @param type 执行器类型
   * @returns 执行器实例
   */
  getExecutor(type: string): IToolExecutor | undefined {
    return this.executors.get(type);
  }

  /**
   * 执行工具
   * @param type 执行器类型
   * @param options 执行选项
   * @returns 执行结果
   */
  async execute(type: string, options: ToolExecuteOptions): Promise<ToolResult> {
    const executor = this.getExecutor(type);
    if (!executor) {
      throw new Error(`Executor type '${type}' not found`);
    }
    return executor.execute(options);
  }

  /**
   * 获取所有工具
   * @returns 所有工具列表
   */
  listAllTools(): (BuiltInTool | SkillTool)[] {
    const allTools: (BuiltInTool | SkillTool)[] = [];
    const executors = Array.from(this.executors.values());
    for (const executor of executors) {
      allTools.push(...executor.listTools());
    }
    return allTools;
  }

  /**
   * 查找工具
   * @param name 工具名称
   * @returns 工具详情
   */
  async findTool(
    name: string
  ): Promise<{ tool: BuiltInTool | SkillTool; type: string } | undefined> {
    const { toolRegistry } = await import("../../core/tool/registry");
    const tool = await toolRegistry.get(name);
    if (!tool) {
      return undefined;
    }
    const type = (await toolRegistry.getType(name)) || "unknown";
    return { tool: tool as unknown as BuiltInTool | SkillTool, type };
  }
}

/**
 * 工具执行器管理器实例
 */
let toolExecutorManagerInstance: ToolExecutorManager | null = null;

/**
 * 获取工具执行器管理器实例
 * @returns 管理器实例
 */
export function getToolExecutorManager(): ToolExecutorManager {
  if (!toolExecutorManagerInstance) {
    toolExecutorManagerInstance = new ToolExecutorManager();
  }
  return toolExecutorManagerInstance;
}
