/**
 * ApexBridge (ABP-only) - WebSocket管理器
 * 统一管理所有WebSocket连接和通道
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as crypto from 'crypto';
import type { AdminConfig } from '../../services/ConfigService';
import { logger } from '../../utils/logger';
import { ChatChannel } from './channels/ChatChannel';

/**
 * 扩展 WebSocket 类型以支持 isAlive 标记
 */
interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

/**
 * WebSocket 管理器最小接口（用于 ChatService）
 */
export interface IWebSocketManager {
  getChannel?(name: string): {
    pushLog?(log: any): void;
  } | undefined;
}

export class WebSocketManager implements IWebSocketManager {
  /**
   * 获取通道（实现 IWebSocketManager 接口）
   * 当前实现中，ChatService 通过 ChatChannel 直接处理，此方法返回 undefined
   */
  getChannel?(name: string): {
    pushLog?(log: any): void;
  } | undefined {
    // 当前架构中，ChatService 通过 ChatChannel 直接处理 WebSocket 消息
    // 此方法保留以符合接口定义，但返回 undefined
    return undefined;
  }
  private wss!: WebSocketServer;
  private chatChannel: ChatChannel;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(
    private config: AdminConfig,
    chatChannel: ChatChannel
  ) {
    this.chatChannel = chatChannel;
    logger.info('🌐 Initializing WebSocket Manager...');
  }
  
  /**
   * 初始化WebSocket服务器
   */
  initialize(server: Server): void {
    // 创建WebSocket服务器（直接绑定到HTTP server）
    this.wss = new WebSocketServer({ server });
    
    logger.debug('WebSocket Server created');
    
    // 设置连接处理器
    this.setupConnectionHandler();
    
    // 🆕 启动心跳检测
    this.setupHeartbeat();
    
    logger.debug('WebSocket Manager initialized');
  }
  
  /**
   * 设置WebSocket连接处理器
   */
  private setupConnectionHandler(): void {
    logger.info('🔧 Setting up WebSocket connection handler...');
    
    this.wss.on('connection', (ws: ExtWebSocket, request) => {
      // 🆕 初始化活跃状态
      ws.isAlive = true;
      
      // 🆕 收到 pong 时标记活跃
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      const url = request.url || '';
      
      // 🛡️ 安全日志：脱敏 URL（隐藏 API Key）
      const maskedUrl = this.maskSensitiveUrl(url);
      logger.info(`📡 [WS] Connection received: ${maskedUrl}`);
      
      // 1. 优化正则：支持 v1/chat, 允许 query parameters
      // 匹配 /chat/api_key=xxx 或 /v1/chat/api_key=xxx
      // ([^/?&]+) 捕获 key 直到遇到 / 或 ? 或 &
      const chatMatch = url.match(/^\/(?:chat|v1\/chat)\/api_key=([^/?&]+)/);
      
      if (chatMatch) {
        const apiKey = chatMatch[1];
        
        // 🛡️ 安全日志：不打印 Key
        logger.debug('🔑 Verifying API Key...');

        if (this.validateApiKey(apiKey)) {
          logger.info('✅ API_Key validated, accepting chat connection');
          this.chatChannel.handleConnection(ws, apiKey, request);
        } else {
          logger.warn('⚠️ Chat connection denied: Invalid API_Key');
          ws.close(1008, 'Invalid API key');
        }
        return;
      }

      // 2. 未匹配的路径
      logger.warn(`⚠️ Unknown WebSocket path: ${maskedUrl}`);
      ws.close(1003, 'Unknown path');
    });
    
    logger.debug('Connection handler registered');
  }

  /**
   * 🛡️ 脱敏 URL，隐藏敏感信息（API Key）
   * 
   * @param url - 原始 URL
   * @returns 脱敏后的 URL
   */
  private maskSensitiveUrl(url: string): string {
    // 替换 api_key=xxx 为 api_key=***
    return url.replace(/api_key=([^/?&]+)/g, 'api_key=***');
  }
  
  /**
   * 🆕 心跳检测逻辑
   * 每 30 秒 Ping 一次，清理无响应的客户端
   */
  private setupHeartbeat(): void {
    const intervalMs = 30000; // 30 秒
    
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const extWs = ws as ExtWebSocket;
        
        if (extWs.isAlive === false) {
          logger.debug('✂️ Terminating inactive WebSocket connection');
          return extWs.terminate();
        }
        
        // 标记为假死，等待 pong 救活
        extWs.isAlive = false;
        extWs.ping();
      });
    }, intervalMs);
    
    logger.debug(`✅ Heartbeat mechanism started (interval: ${intervalMs}ms)`);
  }
  
  /**
   * 验证 API Key
   * 🛡️ 使用防时序攻击的比较方法
   * ✅ 修复：优先从配置文件读取，回退到环境变量
   */
  private validateApiKey(apiKey: string): boolean {
    // 优先从配置文件读取
    const configKey = this.config.auth?.apiKey || '';
    // 回退到环境变量（支持 API_KEY 和 ABP_API_KEY）
    const envKey = process.env.API_KEY || process.env.ABP_API_KEY || '';
    
    // 确定使用的 Key（配置文件优先）
    const expectedKey = configKey || envKey;
    
    // 如果未配置 Key，默认拒绝
    if (!expectedKey) {
      logger.warn('⚠️ API_KEY not configured (neither in config file nor environment), rejecting all connections');
      return false;
    }

    // 🛡️ 防时序攻击比较
    // 如果长度不同，直接返回 false (避免 timingSafeEqual 报错)
    if (apiKey.length !== expectedKey.length) {
      return false;
    }

    // 使用常量时间比较，防止时序攻击
    try {
      return crypto.timingSafeEqual(
        Buffer.from(apiKey),
        Buffer.from(expectedKey)
      );
    } catch (error) {
      // 如果比较失败（理论上不应该发生），记录并拒绝
      logger.error('❌ Error in API key comparison:', error);
      return false;
    }
  }
  
  /**
   * 优雅关闭
   * 在服务器关闭场景下，采用激进的关闭策略，避免等待客户端响应导致挂起
   */
  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down WebSocket Manager...');
    
    // 🆕 停止心跳检测
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.debug('✅ Heartbeat interval cleared');
    }
    
    // 关闭所有连接
    // 在服务器关闭场景下，使用 terminate() 直接断开 TCP 连接
    // 避免等待客户端响应导致关闭过程挂起
    const clientCount = this.wss.clients.size;
    if (clientCount > 0) {
      logger.debug(`Closing ${clientCount} WebSocket connection(s)...`);
      this.wss.clients.forEach((ws) => {
        // 先尝试优雅关闭，但设置短超时
        ws.close();
        
        // 如果 1 秒内客户端没有响应，强制断开
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            logger.debug('Force terminating unresponsive WebSocket connection');
            ws.terminate();
          }
        }, 1000);
      });
    }
    
    // 关闭WebSocket服务器
    return new Promise((resolve, reject) => {
      this.wss.close((err) => {
        if (err) {
          logger.error('❌ Error closing WebSocket server:', err);
          reject(err);
        } else {
          logger.info('✅ WebSocket server closed');
          resolve(undefined);
        }
      });
    });
  }
}
