/**
 * Tool Registry - 工具注册表
 * 管理工具的注册、注销和查询
 */

import { Tool } from "./tool";

/**
 * 工具类型枚举
 */
export enum ToolType {
  BUILTIN = "builtin",
  SKILL = "skill",
  MCP = "mcp",
}

/**
 * 工具状态枚举
 */
export enum ToolStatus {
  HEALTHY = "healthy",
  UNHEALTHY = "unhealthy",
  UNKNOWN = "unknown",
}

/**
 * 工具信息接口（用于 ToolDispatcher 兼容）
 */
export interface ToolInfo {
  /** 工具ID */
  id: string;
  /** 工具描述 */
  description: string;
  /** 参数模式 */
  parameters?: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  /** 执行函数 */
  execute: (args: Record<string, unknown>) => Promise<{
    output: string;
    metadata?: Record<string, any>;
  }>;
}

/**
 * 注册工具项（带类型信息和状态）
 */
interface RegisteredTool extends Tool.Info {
  type: ToolType;
  registeredAt: Date;
  status: ToolStatus;
  lastError?: string;
  lastCheckAt?: Date;
}

/**
 * 工具注册表
 * 管理工具的注册、注销和查询
 */
export interface ToolInfo {
  /** 工具ID */
  id: string;
  /** 工具描述 */
  description: string;
  /** 参数模式 */
  parameters?: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  /** 执行函数 */
  execute: (args: Record<string, unknown>) => Promise<{
    output: string;
    metadata?: Record<string, any>;
  }>;
}

/**
 * 注册工具项（带类型信息和状态）
 */
interface RegisteredTool extends Tool.Info {
  type: ToolType;
  registeredAt: Date;
  status: ToolStatus;
  lastError?: string;
  lastCheckAt?: Date;
}

/**
 * 工具注册表
 * 提供工具的注册、注销、查询等生命周期管理功能
 */
export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();
  private simpleTools: Map<string, ToolInfo> = new Map();

  /**
   * 注册工具
   * @param tool - 工具定义
   */
  async register(tool: Tool.Info, type: ToolType): Promise<void> {
    const existingTool = this.tools.get(tool.id);

    this.tools.set(tool.id, {
      ...tool,
      type,
      status: existingTool?.status ?? ToolStatus.UNKNOWN,
      registeredAt: existingTool?.registeredAt ?? new Date(),
    });
  }

  /**
   * 更新工具状态
   * @param id - 工具 ID
   * @param status - 新状态
   * @param error - 错误信息（如果状态为 unhealthy）
   */
  async updateStatus(id: string, status: ToolStatus, error?: string): Promise<boolean> {
    const tool = this.tools.get(id);
    if (!tool) {
      return false;
    }

    this.tools.set(id, {
      ...tool,
      status,
      lastError: status === ToolStatus.UNHEALTHY ? error : undefined,
      lastCheckAt: new Date(),
    });
    return true;
  }

  /**
   * 检查工具健康状态
   * @param id - 工具 ID
   * @returns 工具是否健康
   */
  async isHealthy(id: string): Promise<boolean> {
    const tool = this.tools.get(id);
    return tool?.status === ToolStatus.HEALTHY;
  }

  /**
   * 获取所有不健康的工具
   * @returns 不健康的工具列表
   */
  async getUnhealthyTools(): Promise<Tool.Info[]> {
    return Array.from(this.tools.values())
      .filter((tool) => tool.status === ToolStatus.UNHEALTHY)
      .map((tool) => ({
        id: tool.id,
        init: tool.init,
      }));
  }

  /**
   * 注销工具
   * @param id - 工具 ID
   * @returns 是否成功注销
   */
  async unregister(id: string): Promise<boolean> {
    // 同时清理 simpleTools
    this.simpleTools.delete(id);
    return this.tools.delete(id);
  }

  /**
   * 获取工具（自动过滤不健康的工具）
   * @param id - 工具 ID
   * @returns 工具定义或 undefined（不健康的工具返回 undefined）
   */
  async get(id: string): Promise<Tool.Info | undefined> {
    const tool = this.tools.get(id);
    // 如果工具状态为 unhealthy，返回 undefined
    if (tool?.status === ToolStatus.UNHEALTHY) {
      return undefined;
    }
    return tool;
  }

  /**
   * 获取简单工具（用于 ToolDispatcher 兼容）
   * @param id - 工具 ID
   * @returns 简单工具定义或 undefined
   */
  async getSimple(id: string): Promise<ToolInfo | undefined> {
    return this.simpleTools.get(id);
  }

  /**
   * 注册简单工具（用于 ToolDispatcher 兼容）
   * @param tool - 简单工具定义
   */
  async registerSimple(tool: ToolInfo): Promise<void> {
    this.simpleTools.set(tool.id, tool);
  }

  /**
   * 获取工具类型
   * @param id - 工具 ID
   * @returns 工具类型或 undefined
   */
  async getType(id: string): Promise<ToolType | undefined> {
    return this.tools.get(id)?.type;
  }

  /**
   * 获取所有工具
   * @returns 工具定义列表
   */
  async list(): Promise<Tool.Info[]> {
    return Array.from(this.tools.values());
  }

  /**
   * 按类型获取工具
   * @param type - 工具类型
   * @returns 工具定义列表
   */
  async listByType(type: ToolType): Promise<Tool.Info[]> {
    return Array.from(this.tools.values())
      .filter((tool) => tool.type === type)
      .map((tool) => ({
        id: tool.id,
        init: tool.init,
      }));
  }

  /**
   * 检查工具是否存在
   * @param id - 工具 ID
   * @returns 是否存在
   */
  async has(id: string): Promise<boolean> {
    return this.tools.has(id);
  }

  /**
   * 清空所有工具
   */
  async clear(): Promise<void> {
    this.tools.clear();
  }

  /**
   * 获取工具数量
   * @returns 工具数量
   */
  async size(): Promise<number> {
    return this.tools.size;
  }

  /**
   * 获取所有工具 ID
   * @returns 工具 ID 列表
   */
  async ids(): Promise<string[]> {
    return Array.from(this.tools.keys());
  }
}

/**
 * 工具注册表单例
 */
export const toolRegistry = new ToolRegistry();
