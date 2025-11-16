/**
 * Distributed Service
 * 
 * 负责执行分布式工具，管理与分布式节点的通信
 * 
 * 参考: VCPToolBox/WebSocketServer.js:401-444
 */

import { logger } from '../utils/logger';
import { BaseDistributedServerChannel } from '../api/websocket/channels/BaseDistributedServerChannel';

/**
 * 分布式执行器接口（独立实现，ABP-only）
 */
export interface IDistributedExecutor {
  execute(serverId: string, toolName: string, toolArgs: Record<string, any>): Promise<any>;
}

/**
 * 分布式服务
 * 
 * 实现IDistributedExecutor接口，为PluginRuntime提供分布式工具执行能力
 * 使用独立的BaseDistributedServerChannel实现
 */
export class DistributedService implements IDistributedExecutor {
  private channel: BaseDistributedServerChannel;
  
  constructor(channel: BaseDistributedServerChannel) {
    this.channel = channel;
    this.setupEventListeners();
  }
  
  /**
   * 执行分布式工具
   * 
   * @param serverIdOrName - 服务器ID或名称
   * @param toolName - 工具名称
   * @param toolArgs - 工具参数
   * @returns Promise<any> - 工具执行结果
   */
  async execute(
    serverIdOrName: string,
    toolName: string,
    toolArgs: Record<string, any>
  ): Promise<any> {
    logger.debug(`📤 Executing distributed tool: ${toolName} on ${serverIdOrName}`);
    
    // 直接使用SDK频道的executeDistributedTool方法
    // SDK已经处理了Promise包装、超时控制、requestId管理
    try {
      const result = await this.channel.executeDistributedTool(
        serverIdOrName,
        toolName,
        toolArgs,
        60000  // 60秒超时
      );
      
      logger.debug(`✅ Tool ${toolName} succeeded`);
      return result;
    } catch (error: any) {
      logger.error(`❌ Tool ${toolName} failed: ${error.message}`);
      throw error;
    }
  }
  
  // Note: handleToolResult不再需要，SDK频道内部已处理
  
  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // SDK频道内部已处理所有事件
    logger.debug('DistributedService initialized with independent channel');
  }
  
  /**
   * 清理资源
   */
  shutdown(): void {
    // SDK频道内部管理pending requests，这里无需清理
    logger.info('DistributedService shutdown complete');
  }
  
  /**
   * 获取分布式服务器信息
   */
  getDistributedServers() {
    return this.channel.getDistributedServers();
  }
  
  /**
   * 获取所有节点（兼容性方法）
   */
  getNodes() {
    return this.channel.getNodes();
  }
}

