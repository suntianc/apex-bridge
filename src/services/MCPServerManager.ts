/**
 * MCP Server Manager
 * 负责管理单个MCP服务器实例的生命周期
 * 包括连接管理、工具发现、调用执行等
 */

import { EventEmitter } from "events";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { logger } from "../utils/logger";
import {
  CallToolResult,
  Tool as MCPToolDefinition,
  JSONRPCMessage,
} from "@modelcontextprotocol/sdk/types.js";
import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  MCPServerConfig,
  MCPServerStatus,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
} from "../types/mcp";

export interface ServerMetrics {
  startTime: Date;
  endTime?: Date;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageResponseTime: number;
}

export class MCPServerManager extends EventEmitter {
  private status: MCPServerStatus;
  private tools: MCPTool[] = [];
  private lastActivity?: Date;
  private metrics: ServerMetrics;
  private config: MCPServerConfig;
  private client?: MCPClient;
  private process?: ReturnType<typeof spawn>;
  private transport?: StdioClientTransport;
  private monitoringTimer: NodeJS.Timeout | null = null;
  private processErrorListener?: (error: Error) => void;

  constructor(config: MCPServerConfig) {
    super();
    this.config = config;
    this.status = {
      phase: "not-started",
      message: "Server not started",
      uptime: 0,
      startTime: undefined,
    };
    this.metrics = {
      startTime: new Date(),
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageResponseTime: 0,
    };
  }

  /**
   * 初始化MCP服务器
   */
  async initialize(): Promise<void> {
    try {
      logger.info(`[MCP] Initializing server ${this.config.id}...`);

      this.status = {
        phase: "initializing",
        message: "Starting server...",
        uptime: 0,
        startTime: undefined,
      };
      this.emit("status-changed", this.status);

      // 启动MCP客户端
      await this.start();

      logger.info(`[MCP] Server ${this.config.id} initialized successfully`);
    } catch (error: any) {
      logger.error(`[MCP] Failed to initialize server ${this.config.id}:`, error);

      this.status = {
        phase: "error",
        message: error.message || "Initialization failed",
        error: error.message,
        uptime: 0,
        startTime: undefined,
      };

      this.emit("status-changed", this.status);
      throw error;
    }
  }

  /**
   * 启动MCP客户端
   */
  private async start(): Promise<void> {
    if (this.config.type !== "stdio") {
      throw new Error(`Unsupported transport type: ${this.config.type}`);
    }

    this.status = {
      phase: "starting",
      message: "Server starting...",
      uptime: 0,
      startTime: undefined,
    };
    this.emit("status-changed", this.status);

    // 创建子进程
    const env = {
      ...process.env,
      ...this.config.env,
    };

    this.process = spawn(this.config.command, this.config.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      cwd: this.config.cwd,
    });

    // 监听进程错误（保存引用以便在 shutdown 时移除）
    this.processErrorListener = (error: Error) => {
      logger.error(`[MCP] Process error for server ${this.config.id}:`, error);
      this.status = {
        phase: "error",
        message: `Process error: ${error.message}`,
        error: error.message,
        uptime: 0,
        startTime: undefined,
      };
      this.emit("status-changed", this.status);
    };
    this.process.on("error", this.processErrorListener);

    // 创建传输层
    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env,
      cwd: this.config.cwd,
    });

    // 创建MCP客户端
    this.client = new MCPClient({
      name: "apex-bridge",
      version: "1.0.0",
    });

    // 连接到服务器
    await this.client.connect(this.transport);

    // 发现工具
    await this.discoverTools();

    // 更新状态
    this.status = {
      phase: "running",
      message: "Server running",
      uptime: 0,
      startTime: new Date(),
    };

    this.emit("status-changed", this.status);

    // 启动运行监控
    this.startMonitoring();
  }

  /**
   * 发现可用工具
   */
  private async discoverTools(): Promise<void> {
    if (!this.client) {
      throw new Error("MCP client not initialized");
    }

    logger.debug(`[MCP] Discovering tools for server ${this.config.id}...`);

    try {
      const result = await this.client.listTools();

      if (result && result.tools) {
        this.tools = result.tools.map((tool) => ({
          name: tool.name,
          description: tool.description || "",
          inputSchema: tool.inputSchema,
        }));

        logger.info(`[MCP] Discovered ${this.tools.length} tools for server ${this.config.id}`);

        this.emit("tools-changed", this.tools);
      }
    } catch (error: any) {
      logger.error(`[MCP] Failed to discover tools:`, error);
      throw error;
    }
  }

  /**
   * 执行工具调用
   */
  async callTool(call: MCPToolCall): Promise<MCPToolResult> {
    if (!this.client) {
      throw new Error("MCP client not initialized");
    }

    const startTime = Date.now();

    try {
      // 检查工具是否存在
      const tool = this.tools.find((t) => t.name === call.tool);

      if (!tool) {
        throw new Error(`Tool ${call.tool} not found`);
      }

      this.updateLastActivity();

      logger.debug(`[MCP] Calling tool ${call.tool} on server ${this.config.id}`);

      // 调用工具
      const result = (await this.client.callTool({
        name: call.tool,
        arguments: call.arguments,
      })) as CallToolResult;

      const duration = Date.now() - startTime;

      // 更新指标
      this.updateMetrics(true, duration);

      // 转换结果格式
      const toolResult: MCPToolResult = {
        success: true,
        content: (result.content || []).map((content) => {
          if (content.type === "text") {
            return {
              type: "text" as const,
              text: content.text || "",
            };
          } else if (content.type === "image") {
            return {
              type: "image" as const,
              mimeType: content.mimeType,
              data: content.data,
            };
          } else {
            return {
              type: "resource" as const,
              text: (content as any).text,
            };
          }
        }),
        duration,
        metadata: {
          toolType: "mcp",
          source: this.config.id,
          toolName: call.tool,
        },
      };

      logger.debug(`[MCP] Tool ${call.tool} executed successfully in ${duration}ms`);

      return toolResult;
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // 更新指标
      this.updateMetrics(false, duration);

      logger.error(`[MCP] Tool ${call.tool} failed:`, error);

      return {
        success: false,
        content: [],
        duration,
        error: {
          code: "TOOL_EXECUTION_ERROR",
          message: error.message || "Unknown error",
        },
      };
    }
  }

  /**
   * 更新最后活动时间
   */
  updateLastActivity(): void {
    this.lastActivity = new Date();
  }

  /**
   * 更新指标
   */
  private updateMetrics(success: boolean, responseTime: number): void {
    this.metrics.totalCalls++;
    this.metrics.successfulCalls += success ? 1 : 0;
    this.metrics.failedCalls += success ? 0 : 1;

    // 计算平均响应时间
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.totalCalls - 1) + responseTime) /
      this.metrics.totalCalls;
  }

  /**
   * 启动监控
   */
  private startMonitoring(): void {
    // 更新运行时间
    this.monitoringTimer = setInterval(() => {
      if (this.status.phase === "running" && this.status.startTime) {
        this.status.uptime = Date.now() - this.status.startTime.getTime();
      }
    }, 1000);
  }

  /**
   * 获取服务器配置
   */
  getConfig(): MCPServerConfig {
    return this.config;
  }

  /**
   * 获取服务器状态
   */
  getStatus(): MCPServerStatus {
    return { ...this.status };
  }

  /**
   * 获取可用工具
   */
  getTools(): MCPTool[] {
    return [...this.tools];
  }

  /**
   * 获取最后活动时间
   */
  getLastActivity(): Date | undefined {
    return this.lastActivity;
  }

  /**
   * 获取指标
   */
  getMetrics(): ServerMetrics {
    return { ...this.metrics };
  }

  /**
   * 重启服务器
   */
  async restart(): Promise<void> {
    logger.info(`[MCP] Restarting server ${this.config.id}...`);

    await this.shutdown();
    await this.initialize();
  }

  /**
   * 关闭服务器
   */
  async shutdown(): Promise<void> {
    try {
      if (
        this.status.phase === "running" ||
        this.status.phase === "starting" ||
        this.status.phase === "initializing"
      ) {
        logger.info(`[MCP] Shutting down server ${this.config.id}...`);

        this.status = {
          phase: "shutting-down",
          message: "Shutting down...",
          uptime: this.status.startTime ? Date.now() - this.status.startTime.getTime() : 0,
          startTime: this.status.startTime,
        };

        this.emit("status-changed", this.status);

        // 清除监控定时器
        if (this.monitoringTimer) {
          clearInterval(this.monitoringTimer);
          this.monitoringTimer = null;
        }

        // 1. 先关闭 MCP 客户端连接（优雅关闭）
        if (this.client) {
          try {
            await this.client.close();
          } catch (e) {
            // 忽略关闭时的错误
            logger.debug(`[MCP] Client close error (ignored): ${e}`);
          }
          this.client = undefined;
        }

        // 2. 关闭传输层
        if (this.transport) {
          try {
            await this.transport.close();
          } catch (e) {
            // 忽略关闭时的错误
            logger.debug(`[MCP] Transport close error (ignored): ${e}`);
          }
          this.transport = undefined;
        }

        // 3. 移除进程事件监听器
        if (this.process && this.processErrorListener) {
          this.process.removeListener("error", this.processErrorListener);
          this.processErrorListener = undefined;
        }

        // 4. 优雅终止子进程
        if (this.process && !this.process.killed) {
          await this.gracefulKillProcess();
        }

        this.metrics.endTime = new Date();

        this.status = {
          phase: "stopped",
          message: "Server stopped",
          uptime: this.status.uptime,
          startTime: this.status.startTime,
        };

        this.emit("status-changed", this.status);

        logger.info(`[MCP] Server ${this.config.id} shut down`);
      }
    } catch (error: any) {
      logger.error(`[MCP] Error during shutdown of server ${this.config.id}:`, error);

      this.status = {
        phase: "error",
        message: "Shutdown failed",
        error: error.message,
        uptime: this.status.uptime,
        startTime: this.status.startTime,
      };

      this.emit("status-changed", this.status);
    }
  }

  /**
   * 优雅终止子进程
   * 先发送 SIGTERM，等待进程退出，超时后强制 SIGKILL
   */
  private async gracefulKillProcess(): Promise<void> {
    if (!this.process) return;

    const proc = this.process;
    const serverId = this.config.id;

    return new Promise<void>((resolve) => {
      let killed = false;

      // 监听进程退出
      const onExit = () => {
        killed = true;
        resolve();
      };

      proc.once("exit", onExit);
      proc.once("close", onExit);

      // 关闭 stdin 以通知子进程关闭
      if (proc.stdin && !proc.stdin.destroyed) {
        proc.stdin.end();
      }

      // 发送 SIGTERM
      proc.kill("SIGTERM");

      // 设置超时，3秒后强制 SIGKILL
      setTimeout(() => {
        if (!killed && proc && !proc.killed) {
          logger.warn(`[MCP] Server ${serverId} did not exit gracefully, forcing SIGKILL`);
          proc.kill("SIGKILL");
        }
        resolve();
      }, 3000);
    }).finally(() => {
      this.process = undefined;
    });
  }
}
