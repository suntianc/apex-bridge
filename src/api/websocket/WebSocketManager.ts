/**
 * ApexBridge (ABP-only) - WebSocket管理器
 * 统一管理所有WebSocket连接和通道
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { AdminConfig } from '../../services/ConfigService';
import { logger } from '../../utils/logger';
import { ChatChannel } from './channels/ChatChannel';

export class WebSocketManager {
  private wss!: WebSocketServer;
  private chatChannel: ChatChannel;

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
    
    logger.info('✅ WebSocket Server created and bound to HTTP server');
    
    // 设置连接处理器
    this.setupConnectionHandler();
    
    logger.info('✅ WebSocket Manager initialized');
  }
  
  /**
   * 设置WebSocket连接处理器
   */
  private setupConnectionHandler(): void {
    logger.info('🔧 Setting up WebSocket connection handler...');
    
    this.wss.on('connection', (ws, request) => {
      const url = request.url || '';
      
      logger.info(`📡 ========================================`);
      logger.info(`📡 WebSocket CONNECTION RECEIVED!`);
      logger.info(`📡 URL: ${url}`);
      logger.info(`📡 ========================================`);
      
      // 1. 匹配 /chat 或 /v1/chat
      const chatMatch = url.match(/^\/(?:chat|v1\/chat)\/api_key=(.+)$/);
      if (chatMatch) {
        const apiKey = chatMatch[1];
        logger.info(`🔑 Chat: API_Key = ${apiKey.substring(0, 15)}...`);

        if (this.validateApiKey(apiKey)) {
          logger.info('✅ API_Key validated, accepting chat connection');
          this.chatChannel.handleConnection(ws, apiKey, request);
        } else {
          logger.warn('⚠️  Chat connection denied: Invalid API_Key');
          ws.close(1008, 'Invalid API key');
        }
        return;
      }

      // 2. 未匹配的路径
      logger.warn(`⚠️  Unknown WebSocket path: ${url}`);
      ws.close(1003, 'Unknown path');
    });
    
    logger.info('✅ Connection handler registered');
  }
  
  /**
   * 验证 API Key
   */
  private validateApiKey(apiKey: string): boolean {
    const expectedKey = process.env.API_KEY || '';
    return apiKey === expectedKey;
  }
  
  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down WebSocket Manager...');
    
    // 关闭所有通道
    // 无需关闭通道，ChatChannel是无状态的
    
    // 关闭WebSocket服务器
    this.wss.close(() => {
      logger.info('✅ WebSocket server closed');
    });
  }
}

