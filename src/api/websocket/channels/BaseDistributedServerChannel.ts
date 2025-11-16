/**
 * Base Distributed Server Channel
 * 
 * 分布式服务器通道基类
 * 独立于vcp-intellicore-sdk的实现
 * 
 * @module api/websocket/channels
 */

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger';
import {
  DistributedTool,
  DistributedMessage,
  DistributedToolExecutionRequest,
  DistributedToolExecutionResponse,
} from '../../../types/distributed';

/**
 * 分布式服务器信息
 */
export interface DistributedServerInfo {
  serverId: string;
  ws: WebSocket;
  tools: string[];
  serverName: string;
  connectedAt: Date;
  lastActivity: Date;
  ips?: {
    localIPs?: string[];
    publicIP?: string;
  };
}

/**
 * 待处理的工具请求
 */
interface PendingToolRequest {
  requestId: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  createdAt: Date;
  serverId: string;
}

/**
 * 分布式服务器通道基类
 * 
 * 提供分布式节点连接、工具注册和工具执行功能
 * 兼容SDK的IWebSocketChannel接口
 */
export abstract class BaseDistributedServerChannel extends EventEmitter {
  /** 频道名称 */
  readonly name = 'DistributedServer';
  
  /** 路径匹配模式（支持新旧路径） */
  readonly pathPattern = /^\/(?:abp-distributed-server|distributed-server)\/ABP_Key=(.+)$/;
  
  /** 客户端类型（兼容SDK接口） */
  readonly clientType: 'DistributedServer' = 'DistributedServer';
  
  /** 分布式服务器信息Map */
  protected distributedServers: Map<string, DistributedServerInfo> = new Map();
  
  /** 待处理的工具请求Map */
  protected pendingRequests: Map<string, PendingToolRequest> = new Map();
  
  /** 默认超时时间（30秒） */
  protected readonly DEFAULT_TIMEOUT = 30000;
  
  /**
   * 处理WebSocket连接
   */
  async handleConnection(
    ws: WebSocket,
    connectionKey: string,
    request: IncomingMessage
  ): Promise<void> {
    // 生成服务器ID
    const serverId = this.generateServerId();
    (ws as any).serverId = serverId;
    
    // 创建服务器信息
    const serverInfo: DistributedServerInfo = {
      serverId,
      ws,
      tools: [],
      serverName: serverId,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };
    
    this.distributedServers.set(serverId, serverInfo);
    
    logger.info(`[DistributedServer] Node connected: ${serverId}`);
    
    // 发送连接确认
    this.sendToClient(ws, {
      type: 'connection_ack',
      data: {
        serverId,
        message: 'Connected to Apex Bridge',
      },
    });
    
    // 调用子类的连接建立处理
    await this.onConnectionEstablished(ws, connectionKey, request, serverId);
    
    // 发射连接事件
    this.emit('server_connected', { serverId, serverInfo });
  }
  
  /**
   * 处理消息
   */
  async handleMessage(ws: WebSocket, message: any): Promise<void> {
    const { type } = message;
    const serverId = (ws as any).serverId;
    
    if (!serverId) {
      logger.warn('[DistributedServer] Received message from unknown server');
      return;
    }
    
    // 更新活动时间
    const serverInfo = this.distributedServers.get(serverId);
    if (serverInfo) {
      serverInfo.lastActivity = new Date();
    }
    
    // 调用子类的消息处理
    await this.onMessage(ws, message);
    
    // 处理通用消息类型
    switch (type) {
      case 'register_tools':
        await this.handleRegisterTools(ws, serverId, message);
        break;
        
      case 'unregister_tools':
        await this.handleUnregisterTools(ws, serverId, message);
        break;
        
      case 'tool_result':
        this.handleToolResult(serverId, message);
        break;
        
      case 'report_ip':
        this.handleIPReport(serverId, message);
        break;
        
      case 'heartbeat':
        this.handleHeartbeat(serverId);
        break;
        
      default:
        // 其他消息类型由子类处理
        break;
    }
  }
  
  /**
   * 处理连接关闭
   */
  handleClose(ws: WebSocket): void {
    const serverId = (ws as any).serverId;
    
    if (serverId) {
      const serverInfo = this.distributedServers.get(serverId);
      
      if (serverInfo) {
        // 发射工具注销事件
        if (serverInfo.tools.length > 0) {
          this.emit('tools_unregistered', {
            serverId,
            tools: serverInfo.tools,
          });
        }
        
        // 清理所有待处理请求
        this.cleanupPendingRequests(serverId);
        
        // 移除服务器信息
        this.distributedServers.delete(serverId);
        
        logger.info(`[DistributedServer] Node disconnected: ${serverId}, ${serverInfo.tools.length} tools unregistered`);
      }
    }
    
    // 调用子类的连接关闭处理
    this.onConnectionClosed(ws);
  }
  
  /**
   * 处理错误
   */
  handleError(ws: WebSocket, error: Error): void {
    const serverId = (ws as any).serverId;
    logger.error(`[DistributedServer] Error on connection ${serverId || 'unknown'}:`, error.message);
    this.onError(ws, error);
  }
  
  /**
   * 执行分布式工具（Promise包装）
   */
  async executeDistributedTool(
    serverId: string,
    toolName: string,
    args: any,
    timeout: number = this.DEFAULT_TIMEOUT
  ): Promise<any> {
    const serverInfo = this.distributedServers.get(serverId);
    
    if (!serverInfo) {
      throw new Error(`Distributed server ${serverId} not connected`);
    }
    
    if (serverInfo.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Distributed server ${serverId} connection not open`);
    }
    
    // 生成请求ID
    const requestId = this.generateRequestId();
    
    // 创建Promise
    return new Promise((resolve, reject) => {
      // 设置超时
      const timeoutTimer = setTimeout(() => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Tool execution timeout after ${timeout}ms`));
        }
      }, timeout);
      
      // 存储待处理请求
      this.pendingRequests.set(requestId, {
        requestId,
        resolve,
        reject,
        timeout: timeoutTimer,
        createdAt: new Date(),
        serverId,
      });
      
      // 发送执行请求
      this.sendToClient(serverInfo.ws, {
        type: 'execute_tool',
        data: {
          requestId,
          toolName,
          toolArgs: args,
        },
      });
      
      logger.debug(`[DistributedServer] Tool execution sent: ${toolName} on ${serverId} (${requestId})`);
    });
  }
  
  /**
   * 获取所有分布式服务器信息
   */
  getDistributedServers(): Map<string, DistributedServerInfo> {
    return new Map(this.distributedServers);
  }
  
  /**
   * 获取所有节点（别名，兼容性）
   */
  getNodes(): Map<string, any> {
    // 返回服务器信息的简化版本
    const nodes = new Map();
    for (const [serverId, serverInfo] of this.distributedServers) {
      nodes.set(serverId, {
        id: serverId,
        name: serverInfo.serverName,
        ws: serverInfo.ws,
        tools: serverInfo.tools,
        connectedAt: serverInfo.connectedAt,
        lastActivity: serverInfo.lastActivity,
      });
    }
    return nodes;
  }
  
  /**
   * 获取特定服务器的工具列表
   */
  getServerTools(serverId: string): string[] {
    const serverInfo = this.distributedServers.get(serverId);
    return serverInfo ? [...serverInfo.tools] : [];
  }
  
  /**
   * 发送消息给客户端
   */
  protected sendToClient(ws: WebSocket, message: any): void {
    if (ws.readyState !== WebSocket.OPEN) {
      logger.warn(`[DistributedServer] Cannot send message, connection not open`);
      return;
    }
    
    try {
      const messageStr = typeof message === 'string' 
        ? message 
        : JSON.stringify(message);
      ws.send(messageStr);
    } catch (error: any) {
      logger.error(`[DistributedServer] Failed to send message:`, error);
    }
  }
  
  /**
   * 广播消息到所有客户端
   */
  broadcast(message: any): void {
    const messageStr = typeof message === 'string' 
      ? message 
      : JSON.stringify(message);
    
    let successCount = 0;
    
    this.distributedServers.forEach((serverInfo, serverId) => {
      if (serverInfo.ws.readyState === WebSocket.OPEN) {
        try {
          serverInfo.ws.send(messageStr);
          successCount++;
        } catch (error: any) {
          logger.error(`[DistributedServer] Failed to broadcast to ${serverId}:`, error);
        }
      }
    });
    
    if (successCount > 0) {
      logger.debug(`[DistributedServer] Broadcast to ${successCount}/${this.distributedServers.size} servers`);
    }
  }
  
  /**
   * 获取连接的客户端数量（兼容SDK接口）
   */
  getConnectedClients(): number {
    return this.distributedServers.size;
  }
  
  /**
   * 获取频道统计信息（兼容SDK接口）
   */
  getStats(): {
    name: string;
    connectedClients: number;
    totalMessagesReceived: number;
    totalMessagesSent: number;
    lastActivity: Date;
  } {
    const totalMessagesReceived = 0;
    const totalMessagesSent = 0;
    let lastActivity = new Date(0);
    
    // 从各个服务器信息中汇总统计
    this.distributedServers.forEach((serverInfo) => {
      if (serverInfo.lastActivity > lastActivity) {
        lastActivity = serverInfo.lastActivity;
      }
    });
    
    return {
      name: this.name,
      connectedClients: this.distributedServers.size,
      totalMessagesReceived,
      totalMessagesSent,
      lastActivity: lastActivity.getTime() === 0 ? new Date() : lastActivity,
    };
  }
  
  /**
   * 关闭通道
   */
  async close(): Promise<void> {
    logger.info(`[DistributedServer] Closing ${this.distributedServers.size} connections...`);
    
    const closePromises: Promise<void>[] = [];
    
    this.distributedServers.forEach((serverInfo, serverId) => {
      if (serverInfo.ws.readyState === WebSocket.OPEN) {
        closePromises.push(
          new Promise((resolve) => {
            serverInfo.ws.once('close', () => resolve());
            serverInfo.ws.close();
          })
        );
      }
    });
    
    await Promise.all(closePromises);
    this.distributedServers.clear();
    this.pendingRequests.clear();
    
    logger.info('[DistributedServer] All connections closed');
  }
  
  // ========== 抽象方法（子类实现） ==========
  
  /**
   * 连接建立后的处理（子类可重写）
   */
  protected async onConnectionEstablished(
    ws: WebSocket,
    connectionKey: string,
    request: IncomingMessage,
    serverId: string
  ): Promise<void> {
    // 默认实现为空，子类可重写
  }
  
  /**
   * 消息处理（子类可重写）
   */
  protected async onMessage(ws: WebSocket, message: any): Promise<void> {
    // 默认实现为空，子类可重写
  }
  
  /**
   * 连接关闭时的处理（子类可重写）
   */
  protected onConnectionClosed(ws: WebSocket): void {
    // 默认实现为空，子类可重写
  }
  
  /**
   * 错误处理（子类可重写）
   */
  protected onError(ws: WebSocket, error: Error): void {
    // 默认实现为空，子类可重写
  }
  
  // ========== 私有方法 ==========
  
  /**
   * 处理工具注册
   */
  private async handleRegisterTools(ws: WebSocket, serverId: string, message: any): Promise<void> {
    const tools = message.data?.tools;
    
    if (!Array.isArray(tools)) {
      logger.error(`[DistributedServer] Invalid tools format from ${serverId}, expected data.tools array`);
      return;
    }
    
    const serverInfo = this.distributedServers.get(serverId);
    if (!serverInfo) {
      logger.error(`[DistributedServer] Server info not found: ${serverId}`);
      return;
    }
    
    // 更新工具列表
    const toolNames = tools.map((t: any) => t.id || t.name || t);
    serverInfo.tools = toolNames;
    serverInfo.lastActivity = new Date();
    
    logger.info(`[DistributedServer] ${serverId} registered ${tools.length} tools: ${toolNames.join(', ')}`);
    
    // 发送确认
    this.sendToClient(ws, {
      type: 'register_ack',
      data: {
        tools: toolNames,
        count: tools.length,
      },
    });
    
    // 发射工具注册事件
    this.emit('tools_registered', {
      serverId,
      tools,
      serverInfo,
    });
  }
  
  /**
   * 处理工具注销
   */
  private async handleUnregisterTools(ws: WebSocket, serverId: string, message: any): Promise<void> {
    const { tools } = message.data || message;
    
    const serverInfo = this.distributedServers.get(serverId);
    if (!serverInfo) {
      return;
    }
    
    // 从工具列表中移除
    serverInfo.tools = serverInfo.tools.filter((t: string) => !tools.includes(t));
    serverInfo.lastActivity = new Date();
    
    logger.info(`[DistributedServer] ${serverId} unregistered ${tools?.length || 0} tools`);
    
    // 发射工具注销事件
    this.emit('tools_unregistered', {
      serverId,
      tools,
    });
  }
  
  /**
   * 处理工具执行结果
   */
  private handleToolResult(serverId: string, message: any): void {
    const { requestId, status, result, error } = message.data || {};
    
    if (!requestId) {
      // 无requestId的结果 = 异步工具推送结果
      logger.info(`[DistributedServer] Async tool result from ${serverId}`);
      this.emit('async_tool_result', { serverId, result: message.data || message });
      return;
    }
    
    // 查找待处理请求
    const pending = this.pendingRequests.get(requestId);
    
    if (!pending) {
      logger.warn(`[DistributedServer] Received result for unknown requestId: ${requestId}`);
      return;
    }
    
    // 清除超时
    clearTimeout(pending.timeout);
    
    // 移除待处理请求
    this.pendingRequests.delete(requestId);
    
    // 解析Promise
    if (status === 'success' || status === undefined) {
      pending.resolve(result);
    } else {
      pending.reject(new Error(error?.message || 'Tool execution failed'));
    }
    
    logger.debug(`[DistributedServer] Tool result received for ${requestId}`);
  }
  
  /**
   * 处理IP上报
   */
  private handleIPReport(serverId: string, message: any): void {
    const { localIPs, publicIP } = message.data || {};
    
    const serverInfo = this.distributedServers.get(serverId);
    if (serverInfo) {
      serverInfo.ips = { localIPs, publicIP };
      serverInfo.lastActivity = new Date();
    }
    
    logger.debug(`[DistributedServer] IP report from ${serverId}: ${localIPs?.join(', ')}`);
    
    // 发射IP上报事件
    this.emit('ip_report', {
      serverId,
      localIPs,
      publicIP,
    });
  }
  
  /**
   * 处理心跳
   */
  private handleHeartbeat(serverId: string): void {
    const serverInfo = this.distributedServers.get(serverId);
    if (serverInfo) {
      serverInfo.lastActivity = new Date();
    }
  }
  
  /**
   * 生成服务器ID
   */
  protected generateServerId(): string {
    const instanceId = Math.floor(Math.random() * 10000);
    return `dist-${instanceId}-${Date.now()}`;
  }
  
  /**
   * 生成请求ID
   */
  protected generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`;
  }
  
  /**
   * 清理特定服务器的待处理请求
   */
  protected cleanupPendingRequests(serverId: string): void {
    let cleanedCount = 0;
    
    this.pendingRequests.forEach((pending, requestId) => {
      if (pending.serverId === serverId) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`Server ${serverId} disconnected`));
        this.pendingRequests.delete(requestId);
        cleanedCount++;
      }
    });
    
    if (cleanedCount > 0) {
      logger.info(`[DistributedServer] Cleaned ${cleanedCount} pending requests for ${serverId}`);
    }
  }
}

