/**
 * MCP Integration Service
 * 核心MCP功能集成服务
 * 负责MCP客户端管理、工具发现和执行
 * 集成 ToolRegistry 进行统一工具管理
 */

import { EventEmitter } from "events";
import { logger } from "../utils/logger";
import { MCPServerManager } from "./MCPServerManager";
import { MCPConfigService } from "./MCPConfigService";
import { getToolRetrievalService } from "./ToolRetrievalService";
import { toolRegistry, ToolType } from "../core/tool/registry";
import { convertMcpTool, cleanMcpToolResult } from "./mcp/convert";
import type { Tool } from "../core/tool/tool";
import type {
  MCPServerConfig,
  MCPServerStatus,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
} from "../types/mcp";

export interface MCPServerInfo {
  id: string;
  config: MCPServerConfig;
  status: MCPServerStatus;
  tools: MCPTool[];
  lastActivity?: Date;
}

export class MCPIntegrationService extends EventEmitter {
  private serverManagers: Map<string, MCPServerManager> = new Map();
  private toolIndex: Map<string, { serverId: string; toolName: string }> = new Map();
  private configService: MCPConfigService;
  private managerListeners: Map<
    string,
    {
      statusChanged?: (status: MCPServerStatus) => void;
      toolsChanged?: (tools: MCPTool[]) => void;
    }
  > = new Map();

  constructor() {
    super();
    this.configService = MCPConfigService.getInstance();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // 监听服务器状态变化
    this.on("server-status-changed", (data: { serverId: string; status: MCPServerStatus }) => {
      logger.info(`[MCP] Server ${data.serverId} status changed: ${data.status.phase}`);
      this.emit("mcp-event", {
        type: "server-status-changed",
        data,
      });
    });

    // 监听工具变化
    this.on("tools-changed", async (data: { serverId: string; tools: MCPTool[] }) => {
      logger.info(`[MCP] Server ${data.serverId} tools updated: ${data.tools.length} tools`);
      this.updateToolIndex(data.serverId, data.tools);
      // Re-vectorize tools to update vector search index
      // 向量化失败不影响服务器运行，但需要记录详细错误信息
      try {
        await this.vectorizeServerTools(data.serverId, data.tools);
      } catch (vectorError: any) {
        logger.error(
          `[MCP] Vectorization failed for server ${data.serverId}: ${vectorError.message}`,
          vectorError.stack
        );
        // 工具已注册但无法通过语义搜索检索
        // 服务器继续运行，但工具索引可能不完整
      }
    });
  }

  /**
   * 注册MCP服务器
   */
  async registerServer(
    config: MCPServerConfig
  ): Promise<{ serverId: string; success: boolean; error?: string }> {
    try {
      const serverId = config.id;
      const serverName = config.id;

      if (this.serverManagers.has(serverId)) {
        logger.warn(`[MCP] Server ${serverId} already exists`);
        return { serverId, success: false, error: "Server already exists" };
      }

      const manager = new MCPServerManager(config);

      // 设置事件监听并跟踪引用以便后续清理
      const listeners: {
        statusChanged?: (status: MCPServerStatus) => void;
        toolsChanged?: (tools: MCPTool[]) => void;
      } = {};

      listeners.statusChanged = (status: MCPServerStatus) => {
        this.emit("server-status-changed", { serverId, status });
      };
      listeners.toolsChanged = (tools: MCPTool[]) => {
        this.emit("tools-changed", { serverId, tools });
      };

      manager.on("status-changed", listeners.statusChanged);
      manager.on("tools-changed", listeners.toolsChanged);

      this.managerListeners.set(serverId, listeners);

      // 初始化服务器
      await manager.initialize();

      this.serverManagers.set(serverId, manager);

      // 保存到数据库
      this.configService.saveServer(config);
      logger.info(`[MCP] Server ${serverId} configuration saved to database`);

      // 向量化工具（容错处理：向量索引失败不影响服务器注册，但记录详细错误）
      try {
        await this.vectorizeServerTools(serverId, manager.getTools());
      } catch (vectorError: any) {
        logger.error(
          `[MCP] Vectorization failed for server ${serverId}: ${vectorError.message}`,
          vectorError.stack
        );
        // 向量化失败不影响服务器注册，但工具将无法通过语义搜索检索
      }

      // 注册工具到 ToolRegistry（使用 {clientName}_{toolName} 格式）
      const serverTools = manager.getTools();
      for (const tool of serverTools) {
        const toolInfo = convertMcpTool(serverId, serverName, tool);
        await toolRegistry.register(toolInfo, ToolType.MCP);
      }
      logger.info(
        `[MCP] Registered ${serverTools.length} tools to ToolRegistry for server ${serverId}`
      );

      logger.info(`[MCP] Server ${serverId} registered successfully`);
      return { serverId, success: true };
    } catch (error: any) {
      logger.error(`[MCP] Failed to register server:`, error);
      return {
        serverId: config.id,
        success: false,
        error: error.message || "Unknown error",
      };
    }
  }

  /**
   * 注销MCP服务器
   */
  async unregisterServer(serverId: string): Promise<boolean> {
    try {
      const manager = this.serverManagers.get(serverId);

      if (!manager) {
        logger.warn(`[MCP] Server ${serverId} not found`);
        return false;
      }

      // 移除事件监听器
      const listeners = this.managerListeners.get(serverId);
      if (listeners) {
        if (listeners.statusChanged) {
          manager.removeListener("status-changed", listeners.statusChanged);
        }
        if (listeners.toolsChanged) {
          manager.removeListener("tools-changed", listeners.toolsChanged);
        }
        this.managerListeners.delete(serverId);
      }

      // 删除向量化的工具
      await this.removeVectorizedTools(serverId, manager.getTools());

      await manager.shutdown();
      this.serverManagers.delete(serverId);
      this.removeFromToolIndex(serverId);

      // 从数据库删除
      this.configService.deleteServer(serverId);
      logger.info(`[MCP] Server ${serverId} removed from database`);

      logger.info(`[MCP] Server ${serverId} unregistered`);
      return true;
    } catch (error: any) {
      logger.error(`[MCP] Failed to unregister server ${serverId}:`, error);
      return false;
    }
  }

  /**
   * 获取所有注册的服务器
   */
  getServers(): MCPServerInfo[] {
    return Array.from(this.serverManagers.entries()).map(([serverId, manager]) => ({
      id: serverId,
      config: manager.getConfig(),
      status: manager.getStatus(),
      tools: manager.getTools(),
      lastActivity: manager.getLastActivity(),
    }));
  }

  /**
   * 获取特定服务器信息
   */
  getServer(serverId: string): MCPServerInfo | undefined {
    const manager = this.serverManagers.get(serverId);

    if (!manager) {
      return undefined;
    }

    return {
      id: serverId,
      config: manager.getConfig(),
      status: manager.getStatus(),
      tools: manager.getTools(),
      lastActivity: manager.getLastActivity(),
    };
  }

  /**
   * 获取服务器状态
   */
  getServerStatus(serverId: string): MCPServerStatus | undefined {
    const manager = this.serverManagers.get(serverId);
    return manager?.getStatus();
  }

  /**
   * 获取所有可用工具
   */
  getAllTools(): { serverId: string; tools: MCPTool[] }[] {
    return Array.from(this.serverManagers.entries()).map(([serverId, manager]) => ({
      serverId,
      tools: manager.getTools(),
    }));
  }

  /**
   * 根据名称搜索工具
   */
  findToolByName(name: string): { serverId: string; tool: MCPTool } | undefined {
    const index = this.toolIndex.get(name);

    if (!index) {
      return undefined;
    }

    const manager = this.serverManagers.get(index.serverId);

    if (!manager) {
      return undefined;
    }

    const tool = manager.getTools().find((t) => t.name === index.toolName);

    if (!tool) {
      return undefined;
    }

    return { serverId: index.serverId, tool };
  }

  /**
   * 执行工具调用
   */
  async callTool(params: {
    toolName: string;
    arguments: Record<string, any>;
    serverId?: string;
  }): Promise<MCPToolResult> {
    try {
      const { toolName, arguments: args, serverId } = params;

      let manager: MCPServerManager | undefined;
      let tool: MCPTool | undefined;

      if (serverId) {
        // 指定服务器ID
        manager = this.serverManagers.get(serverId);

        if (!manager) {
          throw new Error(`Server ${serverId} not found`);
        }

        tool = manager.getTools().find((t) => t.name === toolName);

        if (!tool) {
          throw new Error(`Tool ${toolName} not found in server ${serverId}`);
        }
      } else {
        // 自动发现
        const result = this.findToolByName(toolName);

        if (!result) {
          throw new Error(`Tool ${toolName} not found`);
        }

        manager = this.serverManagers.get(result.serverId);
        tool = result.tool;
      }

      if (!manager || !tool) {
        throw new Error(`Tool or manager not found`);
      }

      // 检查服务器状态
      const status = manager.getStatus();

      if (status.phase === "error") {
        throw new Error(`Server error: ${status.message}`);
      }

      if (status.phase === "shutting-down") {
        throw new Error(`Server is shutting down`);
      }

      // 更新最后活动时间
      manager.updateLastActivity();

      // 执行工具调用
      const toolCall: MCPToolCall = {
        tool: tool.name,
        arguments: args,
      };

      const result = await manager.callTool(toolCall);

      // 清理 MCP 工具返回结果中的技术元数据
      if (result.success && result.content && result.content.length > 0) {
        result.content = result.content.map((item) => {
          if (item.type === "text" && typeof item.text === "string") {
            return {
              ...item,
              text: cleanMcpToolResult(item.text),
            };
          }
          return item;
        });
      }

      // 记录调用统计
      this.emit("tool-called", {
        serverId: manager.getConfig().id,
        toolName,
        success: result.success,
        duration: result.duration,
      });

      return result;
    } catch (error: any) {
      logger.error(`[MCP] Tool call failed:`, error);

      return {
        success: false,
        content: [],
        duration: 0,
        error: {
          code: "TOOL_CALL_FAILED",
          message: error.message || "Unknown error",
        },
      };
    }
  }

  /**
   * 重启服务器
   */
  async restartServer(serverId: string): Promise<boolean> {
    try {
      const manager = this.serverManagers.get(serverId);

      if (!manager) {
        logger.warn(`[MCP] Server ${serverId} not found`);
        return false;
      }

      logger.info(`[MCP] Restarting server ${serverId}...`);

      await manager.shutdown();
      await manager.initialize();

      logger.info(`[MCP] Server ${serverId} restarted successfully`);
      return true;
    } catch (error: any) {
      logger.error(`[MCP] Failed to restart server ${serverId}:`, error);
      return false;
    }
  }

  /**
   * 更新工具索引
   */
  private updateToolIndex(serverId: string, tools: MCPTool[]): void {
    // 清除该服务器的工具索引
    const toRemove: string[] = [];

    for (const [toolName, index] of this.toolIndex.entries()) {
      if (index.serverId === serverId) {
        toRemove.push(toolName);
      }
    }

    toRemove.forEach((name) => this.toolIndex.delete(name));

    // 添加新工具索引
    for (const tool of tools) {
      this.toolIndex.set(tool.name, { serverId, toolName: tool.name });
    }

    logger.debug(`[MCP] Tool index updated for server ${serverId}: ${tools.length} tools`);
  }

  /**
   * 从索引中移除服务器的工具
   */
  private removeFromToolIndex(serverId: string): void {
    const toRemove: string[] = [];

    for (const [toolName, index] of this.toolIndex.entries()) {
      if (index.serverId === serverId) {
        toRemove.push(toolName);
      }
    }

    toRemove.forEach((name) => this.toolIndex.delete(name));
  }

  /**
   * 获取服务器统计信息
   */
  getStatistics() {
    const servers = this.getServers();

    const stats = {
      totalServers: servers.length,
      serversByStatus: {} as Record<string, number>,
      totalTools: 0,
      servers: servers.map((s) => ({
        id: s.id,
        status: s.status.phase,
        toolCount: s.tools.length,
        lastActivity: s.lastActivity,
      })),
    };

    for (const server of servers) {
      stats.totalTools += server.tools.length;
      stats.serversByStatus[server.status.phase] =
        (stats.serversByStatus[server.status.phase] || 0) + 1;
    }

    return stats;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    details: Record<string, any>;
  }> {
    const servers = this.getServers();
    const details: Record<string, any> = {};

    let healthy = true;

    for (const server of servers) {
      const serverHealthy = server.status.phase === "running";
      details[server.id] = {
        healthy: serverHealthy,
        status: server.status.phase,
        toolCount: server.tools.length,
        uptime: server.status.uptime,
        lastActivity: server.lastActivity,
      };

      if (!serverHealthy) {
        healthy = false;
      }
    }

    return { healthy, details };
  }

  /**
   * 向量化服务器工具
   */
  public async vectorizeServerTools(serverId: string, tools: MCPTool[]): Promise<void> {
    try {
      const retrievalService = getToolRetrievalService();
      await retrievalService.initialize();

      const unifiedTools = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        type: "mcp" as const,
        source: serverId,
        tags: [],
        metadata: {
          inputSchema: tool.inputSchema,
        },
      }));

      await retrievalService.indexTools(unifiedTools);
      logger.info(`[MCP] Vectorized ${tools.length} tools for server ${serverId}`);
    } catch (error: any) {
      logger.error(`[MCP] Failed to vectorize tools for server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * 删除服务器向量化工具
   */
  private async removeVectorizedTools(serverId: string, tools: MCPTool[]): Promise<void> {
    try {
      const retrievalService = getToolRetrievalService();
      await retrievalService.initialize();

      for (const tool of tools) {
        const toolId = `${serverId}:${tool.name}`;
        await retrievalService.removeTool(toolId);
      }

      logger.info(`[MCP] Removed vectorized tools for server ${serverId}`);
    } catch (error: any) {
      logger.error(`[MCP] Failed to remove vectorized tools for server ${serverId}:`, error);
      // 不抛出错误，避免影响服务器注销流程
    }
  }

  /**
   * 从数据库加载所有已注册的MCP服务器
   */
  async loadServersFromDatabase(): Promise<void> {
    try {
      const records = this.configService.getAllServers();

      logger.info(`[MCP] Loading ${records.length} MCP servers from database`);

      for (const record of records) {
        try {
          // 检查服务器是否已经在内存中
          if (this.serverManagers.has(record.id)) {
            logger.debug(`[MCP] Server ${record.id} already loaded, skipping`);
            continue;
          }

          logger.info(`[MCP] Loading server ${record.id} from database`);

          const result = await this.registerServer(record.config);

          if (!result.success) {
            logger.error(
              `[MCP] Failed to reload server ${record.id} from database: ${result.error}`
            );
          }
        } catch (error: any) {
          logger.error(`[MCP] Error loading server ${record.id}:`, error);
          // 继续加载其他服务器
        }
      }

      logger.info(`[MCP] Completed loading MCP servers from database`);
    } catch (error: any) {
      logger.error("[MCP] Failed to load servers from database:", error);
      throw error;
    }
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    logger.info("[MCP] Shutting down integration service...");

    // 移除所有事件监听器
    this.removeAllListeners();

    // 关闭所有服务器并移除监听器
    const shutdownPromises = Array.from(this.serverManagers.values()).map(async (manager) => {
      // 获取服务器 ID 以便从 managerListeners 中移除
      const serverId = Array.from(this.serverManagers.entries()).find(
        ([, m]) => m === manager
      )?.[0];

      if (serverId) {
        const listeners = this.managerListeners.get(serverId);
        if (listeners) {
          if (listeners.statusChanged) {
            manager.removeListener("status-changed", listeners.statusChanged);
          }
          if (listeners.toolsChanged) {
            manager.removeListener("tools-changed", listeners.toolsChanged);
          }
          this.managerListeners.delete(serverId);
        }
      }

      await manager.shutdown();
    });

    await Promise.all(shutdownPromises);

    this.serverManagers.clear();
    this.managerListeners.clear();
    this.toolIndex.clear();

    logger.info("[MCP] Integration service shut down");
  }
}

// 导出单例实例
export const mcpIntegration = new MCPIntegrationService();
