/**
 * Tool Registry - 工具注册表
 * 管理工具的注册、注销和查询
 */

import { Tool } from './tool';

/**
 * 工具类型枚举
 */
export enum ToolType {
  BUILTIN = 'builtin',
  SKILL = 'skill',
  MCP = 'mcp',
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
    type: 'object';
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
 * 注册工具项（带类型信息）
 */
interface RegisteredTool extends Tool.Info {
  type: ToolType;
  registeredAt: Date;
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
      registeredAt: existingTool?.registeredAt ?? new Date(),
    });
  }

  /**
   * 注销工具
   * @param id - 工具 ID
   * @returns 是否成功注销
   */
  async unregister(id: string): Promise<boolean> {
    return this.tools.delete(id);
  }

  /**
   * 获取工具
   * @param id - 工具 ID
   * @returns 工具定义或 undefined
   */
  async get(id: string): Promise<Tool.Info | undefined> {
    return this.tools.get(id);
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
