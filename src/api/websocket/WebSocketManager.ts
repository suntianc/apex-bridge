/**
 * ApexBridge (ABP-only) - WebSocket管理器
 * 统一管理所有WebSocket连接和通道
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { AdminConfig } from '../../services/ConfigService';
import { logger } from '../../utils/logger';
import { DistributedServerChannel } from './channels/DistributedServerChannel';
import { ABPLogChannel } from './channels/ABPLogChannel';

export class WebSocketManager {
  private wss!: WebSocketServer;
  private distributedServerChannel: DistributedServerChannel;
  private abpLogChannel: ABPLogChannel;
  
  constructor(
    private config: AdminConfig,
    distributedServerChannel: DistributedServerChannel,
    abpLogChannel: ABPLogChannel
  ) {
    this.distributedServerChannel = distributedServerChannel;
    this.abpLogChannel = abpLogChannel;
    
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
      
      // 1. 匹配 /abp-distributed-server 或 /distributed-server
      const distServerMatch = url.match(/^\/(?:abp-distributed-server|distributed-server)\/ABP_Key=(.+)$/);
      if (distServerMatch) {
        const abpKey = distServerMatch[1];
        logger.info(`🔑 Distributed Server: ABP_Key = ${abpKey.substring(0, 15)}...`);
        const nodeKey = this.config.auth.apiKey || '';
        logger.info(`🔑 Expected Key: ${nodeKey.substring(0, 15)}...`);
        
        if (this.validateABPKey(abpKey)) {
          logger.info('✅ ABP_Key validated, accepting connection');
          this.distributedServerChannel.handleConnection(ws, abpKey, request);
        } else {
          logger.warn('⚠️  Distributed Server connection denied: Invalid ABP_Key');
          ws.close(1008, 'Invalid ABP_Key');
        }
        return;
      }
      
      // 2. 匹配 /ABPlog 或 /log
      const abpLogMatch = url.match(/^\/(?:ABPlog|log)\/ABP_Key=(.+)$/);
      if (abpLogMatch) {
        const abpKey = abpLogMatch[1];
        logger.info(`🔑 ABPLog: ABP_Key = ${abpKey.substring(0, 15)}...`);
        
        if (this.validateABPKey(abpKey)) {
          logger.info('✅ ABP_Key validated, accepting connection');
          this.abpLogChannel.handleConnection(ws, abpKey, request);
        } else {
          logger.warn('⚠️  ABPLog connection denied: Invalid ABP_Key');
          ws.close(1008, 'Invalid ABP_Key');
        }
        return;
      }
      
      // 3. 未匹配的路径
      logger.warn(`⚠️  Unknown WebSocket path: ${url}`);
      ws.close(1003, 'Unknown path');
    });
    
    logger.info('✅ Connection handler registered');
  }
  
  /**
   * 验证 ABP Key（节点之间的认证）
   */
  private validateABPKey(providedKey: string): boolean {
    const nodeKey = this.config.auth.apiKey || '';
    if (nodeKey && providedKey === nodeKey) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down WebSocket Manager...');
    
    // 关闭所有通道
    await this.distributedServerChannel.shutdown();
    await this.abpLogChannel.shutdown();
    
    // 关闭WebSocket服务器
    this.wss.close(() => {
      logger.info('✅ WebSocket server closed');
    });
  }
}

