/**
 * Admin Panel WebSocket Channel
 * 
 * 管理后台WebSocket通道，用于推送节点事件和系统通知
 */

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '../../../utils/logger';
import { IWebSocketChannel } from '../IndependentWebSocketManager';

/**
 * AdminPanel频道
 * 
 * 用于管理后台接收节点事件和系统通知
 */
export class AdminPanelChannel implements IWebSocketChannel {
  /** 频道名称 */
  readonly name = 'AdminPanel';
  
  /** 路径匹配模式（ABP-only） */
  readonly pathPattern = /^\/(?:abp-admin-panel|admin-panel)\/ABP_Key=(.+)$/;
  
  /** 客户端类型 */
  readonly clientType: 'AdminPanel' = 'AdminPanel';
  
  private clients: Set<WebSocket> = new Set();
  private clientIdCounter: number = 0;
  
  /** 统计信息 */
  private stats: {
    totalMessagesReceived: number;
    totalMessagesSent: number;
    lastActivity: Date;
  } = {
    totalMessagesReceived: 0,
    totalMessagesSent: 0,
    lastActivity: new Date(),
  };
  
  /**
   * 处理新的AdminPanel客户端连接
   */
  async handleConnection(
    ws: WebSocket,
    connectionKey: string,
    request: IncomingMessage
  ): Promise<void> {
    const clientId = `adminpanel-${++this.clientIdCounter}-${Date.now()}`;
    
    logger.info(`📡 New AdminPanel client connecting: ${clientId}`);
    
    // 添加到客户端列表
    this.clients.add(ws);
    
    // 存储clientId到WebSocket对象
    (ws as any).clientId = clientId;
    
    // 设置事件监听
    ws.on('close', () => {
      this.handleClose(ws);
    });
    
    ws.on('error', (error) => {
      this.handleError(ws, error);
    });
    
    // 发送连接确认
    this.sendToClient(ws, {
      type: 'connection_ack',
      data: {
        message: 'Connected to ApexBridge AdminPanel',
        timestamp: Date.now()
      }
    });
    
    logger.info(`✅ AdminPanel client ${clientId} connected (total: ${this.clients.size})`);
  }
  
  /**
   * 处理消息
   */
  async handleMessage(ws: WebSocket, message: any): Promise<void> {
    this.stats.totalMessagesReceived++;
    this.stats.lastActivity = new Date();
    
    const clientId = (ws as any).clientId || 'unknown';
    
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      logger.debug(`📨 AdminPanel message from ${clientId}:`, data);
      
      // 处理不同类型的消息
      // 这里可以添加具体的消息处理逻辑
      
    } catch (error) {
      logger.error(`❌ Failed to parse AdminPanel message from ${clientId}:`, error);
    }
  }
  
  /**
   * 处理断开连接
   */
  handleClose(ws: WebSocket): void {
    const clientId = (ws as any).clientId || 'unknown';
    this.clients.delete(ws);
    logger.info(`🔌 AdminPanel client ${clientId} disconnected (remaining: ${this.clients.size})`);
  }
  
  /**
   * 处理错误
   */
  handleError(ws: WebSocket, error: Error): void {
    const clientId = (ws as any).clientId || 'unknown';
    logger.error(`❌ AdminPanel error from ${clientId}:`, error);
  }
  
  /**
   * 广播消息到所有客户端
   */
  broadcast(message: any): void {
    if (this.clients.size === 0) {
      return;
    }
    
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    let sentCount = 0;
    
    for (const client of this.clients) {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageStr);
          sentCount++;
        } else {
          // 移除已关闭的连接
          this.clients.delete(client);
        }
      } catch (error) {
        logger.error(`❌ Failed to send message to AdminPanel client:`, error);
        this.clients.delete(client);
      }
    }
    
    if (sentCount > 0) {
      this.stats.totalMessagesSent += sentCount;
      this.stats.lastActivity = new Date();
      logger.debug(`📤 Broadcasted to ${sentCount} AdminPanel client(s)`);
    }
  }
  
  /**
   * 发送消息到单个客户端
   */
  private sendToClient(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
        ws.send(messageStr);
        this.stats.totalMessagesSent++;
        this.stats.lastActivity = new Date();
      } catch (error) {
        logger.error(`❌ Failed to send message to AdminPanel client:`, error);
      }
    }
  }
  
  /**
   * 获取已连接的客户端数量
   */
  getConnectedClients(): number {
    return this.clients.size;
  }
  
  /**
   * 获取统计信息
   */
  getStats(): any {
    return {
      name: this.name,
      connectedClients: this.clients.size,
      totalMessagesReceived: this.stats.totalMessagesReceived,
      totalMessagesSent: this.stats.totalMessagesSent,
      lastActivity: this.stats.lastActivity
    };
  }
}

