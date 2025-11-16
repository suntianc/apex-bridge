/**
 * Independent WebSocket Manager
 * 
 * 独立的WebSocket管理器，兼容SDK的WebSocketManager接口
 * 独立于vcp-intellicore-sdk的实现
 * 
 * @module api/websocket
 */

import { Server as HTTPServer } from 'http';
import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { BaseDistributedServerChannel } from './channels/BaseDistributedServerChannel';

/**
 * WebSocketManager配置
 */
export interface WebSocketManagerConfig {
  enableHeartbeat?: boolean;
  heartbeatInterval?: number;
  enableCompression?: boolean;
  maxMessageSize?: number;
}

/**
 * 频道接口（兼容SDK的IWebSocketChannel）
 */
export interface IWebSocketChannel {
  name: string;
  pathPattern: RegExp;
  clientType: string;
  handleConnection(ws: WebSocket, connectionKey: string, request: IncomingMessage): Promise<void>;
  handleMessage(ws: WebSocket, message: any): Promise<void>;
  handleClose(ws: WebSocket): void;
  handleError(ws: WebSocket, error: Error): void;
  broadcast(message: any): void;
  getConnectedClients(): number;
  getStats(): any;
}

/**
 * 独立的WebSocket管理器
 * 
 * 兼容SDK的WebSocketManager接口
 */
export class IndependentWebSocketManager extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private channels: Map<string, IWebSocketChannel> = new Map();
  private config: Required<WebSocketManagerConfig>;
  
  constructor(config: WebSocketManagerConfig = {}) {
    super();
    this.config = {
      enableHeartbeat: config.enableHeartbeat ?? false,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      enableCompression: config.enableCompression ?? false,
      maxMessageSize: config.maxMessageSize ?? 10 * 1024 * 1024, // 10MB
    };
  }
  
  /**
   * 初始化WebSocket服务器
   */
  initialize(server: HTTPServer): void {
    // 创建WebSocket服务器（noServer模式，手动处理upgrade）
    this.wss = new WebSocketServer({ noServer: true });
    
    // 监听HTTP服务器的upgrade事件
    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      this.handleUpgrade(request, socket, head);
    });
    
    logger.info('[IndependentWebSocketManager] WebSocket server initialized');
  }
  
  /**
   * 注册频道
   */
  registerChannel(channel: IWebSocketChannel): void {
    this.channels.set(channel.name, channel);
    logger.info(`[IndependentWebSocketManager] Channel registered: ${channel.name}`);
  }
  
  /**
   * 获取频道（兼容SDK接口）
   */
  getChannel(name: string): IWebSocketChannel | null {
    return this.channels.get(name) || null;
  }
  
  /**
   * 处理WebSocket升级请求
   */
  private handleUpgrade(request: IncomingMessage, socket: any, head: Buffer): void {
    if (!this.wss) {
      logger.error('[IndependentWebSocketManager] WebSocket server not initialized');
      socket.destroy();
      return;
    }
    
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    
    // 查找匹配的频道
    let matchedChannel: IWebSocketChannel | null = null;
    let connectionKey: string | null = null;
    
    for (const channel of this.channels.values()) {
      const match = pathname.match(channel.pathPattern);
      if (match && match[1]) {
        matchedChannel = channel;
        connectionKey = match[1];
        break;
      }
    }
    
    if (!matchedChannel || !connectionKey) {
      logger.warn(`[IndependentWebSocketManager] No channel matched for path: ${pathname}`);
      socket.destroy();
      return;
    }
    
    // 执行WebSocket握手
    this.wss.handleUpgrade(request, socket, head, async (ws) => {
      logger.debug(`[IndependentWebSocketManager] Upgrade to ${matchedChannel!.name} channel`);
      
      // 设置消息处理
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await matchedChannel!.handleMessage(ws, message);
        } catch (error: any) {
          logger.error(`[IndependentWebSocketManager] Message handling error:`, error.message);
          matchedChannel!.handleError(ws, error);
        }
      });
      
      // 设置关闭处理
      ws.on('close', () => {
        matchedChannel!.handleClose(ws);
      });
      
      // 设置错误处理
      ws.on('error', (error) => {
        matchedChannel!.handleError(ws, error);
      });
      
      // 调用频道的连接处理
      try {
        await matchedChannel!.handleConnection(ws, connectionKey!, request);
      } catch (error: any) {
        logger.error(`[IndependentWebSocketManager] Connection handling error:`, error.message);
        ws.close();
      }
    });
  }
  
  /**
   * 广播消息（兼容SDK接口）
   */
  broadcast(message: any, targetChannel?: string): void {
    if (targetChannel) {
      const channel = this.channels.get(targetChannel);
      if (channel) {
        channel.broadcast(message);
      }
    } else {
      // 广播到所有频道
      this.channels.forEach((channel) => {
        channel.broadcast(message);
      });
    }
  }
  
  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    logger.info('[IndependentWebSocketManager] Shutting down...');
    
    // 关闭所有频道
    const closePromises: Promise<void>[] = [];
    this.channels.forEach((channel) => {
      if (typeof (channel as any).close === 'function') {
        closePromises.push((channel as any).close());
      } else if (typeof (channel as any).shutdown === 'function') {
        closePromises.push((channel as any).shutdown());
      }
    });
    
    await Promise.all(closePromises);
    
    // 关闭WebSocket服务器
    if (this.wss) {
      return new Promise((resolve) => {
        this.wss!.close(() => {
          logger.info('[IndependentWebSocketManager] WebSocket server closed');
          resolve();
        });
      });
    }
  }
}

