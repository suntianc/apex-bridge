/**
 * VCP IntelliCore (智脑) - 分布式服务器WebSocket通道
 * 处理 /vcp-distributed-server 端点的连接和消息
 */

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { DistributedNode, DistributedServerMessage } from '../../../types';
import { logger } from '../../../utils/logger';

export class DistributedServerChannel extends EventEmitter {
  private nodes: Map<string, DistributedNode> = new Map();
  private nodeIdCounter: number = 0;
  
  constructor() {
    super();
  }
  
  /**
   * 处理新的分布式节点连接（兼容SDK接口）
   */
  async handleConnection(
    ws: WebSocket,
    connectionKey: string,
    request: any
  ): Promise<void> {
    const serverId = `dist-${++this.nodeIdCounter}-${Date.now()}`;
    
    logger.info(`📡 New distributed server connecting: ${serverId}`);
    
    // 创建节点记录
    const node: DistributedNode = {
      id: serverId,
      ws,
      name: serverId, // 初始名称，后续会通过report_ip更新
      tools: [],
      ips: {
        localIPs: [],
        publicIP: undefined
      },
      status: 'connected',
      lastHeartbeat: Date.now()
    };
    
    this.nodes.set(serverId, node);
    
    // 设置事件监听
    ws.on('message', (data) => {
      try {
        const message: DistributedServerMessage = JSON.parse(data.toString());
        this.handleMessage(serverId, message);
      } catch (error: any) {
        logger.error(`❌ Failed to parse message from ${serverId}:`, error);
      }
    });
    
    ws.on('close', () => {
      this.handleDisconnection(serverId);
    });
    
    ws.on('error', (error) => {
      logger.error(`❌ WebSocket error from ${serverId}:`, error);
    });
    
    // 发送连接确认
    this.sendToNode(serverId, {
      type: 'connection_ack',
      data: {
        serverId,
        message: 'Connected to VCP IntelliCore',
        timestamp: Date.now()
      }
    });
    
    logger.info(`✅ Distributed server ${serverId} connected`);
  }
  
  /**
   * 处理来自分布式节点的消息
   */
  private handleMessage(serverId: string, message: DistributedServerMessage): void {
    const node = this.nodes.get(serverId);
    if (!node) {
      logger.warn(`⚠️  Received message from unknown server: ${serverId}`);
      return;
    }
    
    // 更新心跳时间
    node.lastHeartbeat = Date.now();
    
    logger.debug(`📨 Message from ${serverId}: ${message.type}`);
    
    switch (message.type) {
      case 'register_tools':
        this.handleRegisterTools(serverId, message.data);
        break;
        
      case 'tool_result':
        this.handleToolResult(serverId, message.data);
        break;
        
      case 'report_ip':
        this.handleReportIP(serverId, message.data);
        break;
        
      case 'update_static_placeholders':
        this.handleUpdatePlaceholders(serverId, message.data);
        break;
        
      default:
        logger.warn(`⚠️  Unknown message type from ${serverId}: ${message.type}`);
    }
  }
  
  /**
   * 处理工具注册
   */
  private handleRegisterTools(serverId: string, data: any): void {
    const node = this.nodes.get(serverId);
    if (!node || !data || !Array.isArray(data.tools)) {
      return;
    }
    
    // 过滤掉内部工具（如internal_request_file）
    const externalTools = data.tools.filter((t: any) => t.name !== 'internal_request_file');
    
    // 更新节点的工具列表
    node.tools = externalTools;
    this.nodes.set(serverId, node);
    
    logger.info(`📦 Registered ${externalTools.length} tools from ${node.name || serverId}`);
    
    externalTools.forEach((tool: any) => {
      logger.debug(`   - ${tool.name} (${tool.pluginType})`);
    });
    
    // 🆕 发射register_tools事件（供server.ts连接到ProtocolEngine）
    this.emit('register_tools', { serverId, tools: externalTools });
  }
  
  /**
   * 处理工具执行结果
   */
  private handleToolResult(serverId: string, data: any): void {
    if (data.requestId) {
      // 同步工具结果：响应某个execute_tool请求
      logger.debug(`📬 Sync tool result received: ${data.requestId}`);
      
      // 发射tool_result事件（供DistributedService处理）
      this.emit('tool_result', data);
    } else {
      // 异步工具结果：Archery工具主动推送，没有requestId
      logger.info(`🏹 Async tool result received from ${serverId}: ${data.plugin || 'Unknown'}`);
      
      // 直接发射async_tool_result事件（转发到VCPLog）
      this.emit('async_tool_result', {
        serverId,
        ...data
      });
    }
  }
  
  /**
   * 处理IP报告
   */
  private handleReportIP(serverId: string, data: any): void {
    const node = this.nodes.get(serverId);
    if (!node || !data) {
      return;
    }
    
    // 更新节点信息
    node.name = data.serverName || node.name;
    node.ips = {
      localIPs: data.localIPs || [],
      publicIP: data.publicIP
    };
    this.nodes.set(serverId, node);
    
    logger.info(`🌐 IP Report from ${node.name}:`);
    logger.info(`   Local IPs: [${node.ips.localIPs.join(', ')}]`);
    logger.info(`   Public IP: ${node.ips.publicIP || 'N/A'}`);
  }
  
  /**
   * 处理静态占位符更新
   */
  private handleUpdatePlaceholders(serverId: string, data: any): void {
    const node = this.nodes.get(serverId);
    if (!node || !data || !data.placeholders) {
      return;
    }
    
    logger.debug(`📌 Static placeholders updated from ${node.name || serverId}`);
    
    // TODO: 在Day 2实现 - 需要更新到PlaceholderProvider
  }
  
  /**
   * 发送消息到指定节点
   */
  sendToNode(serverId: string, message: any): boolean {
    const node = this.nodes.get(serverId);
    
    if (!node || node.ws.readyState !== WebSocket.OPEN) {
      logger.warn(`⚠️  Cannot send message to ${serverId}: not connected`);
      return false;
    }
    
    try {
      node.ws.send(JSON.stringify(message));
      return true;
    } catch (error: any) {
      logger.error(`❌ Failed to send message to ${serverId}:`, error);
      return false;
    }
  }
  
  /**
   * 处理节点断开连接
   */
  private handleDisconnection(serverId: string): void {
    const node = this.nodes.get(serverId);
    
    if (node) {
      logger.info(`🔌 Distributed server ${node.name || serverId} disconnected`);
      
      // 标记为断开
      node.status = 'disconnected';
      
      // 🆕 发射disconnect事件（供server.ts注销工具）
      this.emit('disconnect', { serverId });
      
      // 移除节点
      this.nodes.delete(serverId);
    }
  }
  
  /**
   * 获取所有节点
   */
  getNodes(): Map<string, DistributedNode> {
    return this.nodes;
  }
  
  /**
   * 获取指定节点
   */
  getNode(serverId: string): DistributedNode | undefined {
    return this.nodes.get(serverId);
  }
  
  /**
   * 根据节点名称查找
   */
  findNodeByName(name: string): DistributedNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.name === name) {
        return node;
      }
    }
    return undefined;
  }
  
  /**
   * 广播消息到所有节点
   */
  broadcast(message: any): void {
    const data = JSON.stringify(message);
    let successCount = 0;
    
    this.nodes.forEach((node, serverId) => {
      if (node.ws.readyState === WebSocket.OPEN) {
        try {
          node.ws.send(data);
          successCount++;
        } catch (error: any) {
          logger.error(`❌ Failed to broadcast to ${serverId}:`, error);
        }
      }
    });
    
    logger.debug(`📡 Broadcasted to ${successCount}/${this.nodes.size} nodes`);
  }
  
  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    logger.info(`🛑 Closing ${this.nodes.size} distributed server connections...`);
    
    const closePromises: Promise<void>[] = [];
    
    this.nodes.forEach((node, serverId) => {
      if (node.ws.readyState === WebSocket.OPEN) {
        closePromises.push(
          new Promise((resolve) => {
            node.ws.once('close', () => resolve());
            node.ws.close();
          })
        );
      }
    });
    
    await Promise.all(closePromises);
    this.nodes.clear();
    
    logger.info('✅ All distributed server connections closed');
  }
}

