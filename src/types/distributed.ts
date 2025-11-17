/**
 * Distributed Communication Types
 * 
 * 分布式通信相关的类型定义
 
 */

import { WebSocket } from 'ws';

/**
 * 分布式工具信息
 */
export interface DistributedTool {
  /** 工具名称 */
  name: string;
  
  /** 工具描述 */
  description: string;
  
  /** 参数定义 */
  parameters?: Record<string, any>;
  
  /** 返回类型 */
  returns?: string;
  
  /** 服务器ID */
  serverId: string;
  
  /** 节点ID */
  nodeId?: string;
}

/**
 * 分布式消息
 */
export interface DistributedMessage {
  /** 消息类型 */
  type: string;
  
  /** 消息数据 */
  data?: any;
  
  /** 消息ID */
  messageId?: string;
  
  /** 时间戳 */
  timestamp?: number;
  
  /** 来源服务器ID */
  fromServerId?: string;
  
  /** 目标服务器ID */
  toServerId?: string;
  
  /** 节点ID */
  nodeId?: string;
}

/**
 * 分布式工具执行请求
 */
export interface DistributedToolExecutionRequest {
  /** 请求ID */
  requestId: string;
  
  /** 工具名称 */
  toolName: string;
  
  /** 执行参数 */
  args: Record<string, any>;
  
  /** 目标服务器ID */
  serverId: string;
  
  /** 目标节点ID */
  nodeId?: string;
  
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * 分布式工具执行响应
 */
export interface DistributedToolExecutionResponse {
  /** 请求ID */
  requestId: string;
  
  /** 是否成功 */
  success: boolean;
  
  /** 执行结果 */
  result?: any;
  
  /** 错误信息 */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  
  /** 执行时间（毫秒） */
  executionTime?: number;
}

/**
 * 分布式通道接口
 */
export interface IDistributedChannel {
  /** 处理WebSocket连接 */
  handleConnection(ws: WebSocket): void;
  
  /** 注册分布式工具 */
  registerTools(serverId: string, tools: DistributedTool[]): void;
  
  /** 执行分布式工具 */
  executeTool(request: DistributedToolExecutionRequest): Promise<DistributedToolExecutionResponse>;
  
  /** 广播消息 */
  broadcast(message: DistributedMessage): void;
  
  /** 发送消息到特定服务器 */
  sendToServer(serverId: string, message: DistributedMessage): boolean;
  
  /** 获取已注册的工具 */
  getRegisteredTools(): Map<string, DistributedTool[]>;
  
  /** 获取连接的服务器列表 */
  getConnectedServers(): string[];
  
  /** 关闭通道 */
  close(): Promise<void>;
}

/**
 * 分布式通道配置
 */
export interface DistributedChannelOptions {
  /** 服务器ID */
  serverId?: string;
  
  /** 超时时间（毫秒） */
  timeout?: number;
  
  /** 重试次数 */
  maxRetries?: number;
  
  /** 心跳间隔（毫秒） */
  heartbeatInterval?: number;
  
  /** 连接超时（毫秒） */
  connectionTimeout?: number;
}

