import { BaseDistributedServerChannel } from './BaseDistributedServerChannel';
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { NodeManager, NodeRegisterInfo } from '../../../core/NodeManager';
import { NodeStats, NodeStatus } from '../../../services/NodeService';
import { Message } from '../../../types';
import { logger } from '../../../utils/logger';
import { EventBus } from '../../../core/EventBus';

interface NodeRegisterMessage {
  type: 'node_register';
  data?: {
    nodeId?: string;
    name?: string;
    type?: 'worker' | 'companion' | 'custom';
    version?: string;
    capabilities?: string[];
    tools?: string[];
    personality?: any;
    config?: any;
    stats?: any;
  };
}

interface NodeUnregisterMessage {
  type: 'node_unregister';
  data?: {
    nodeId?: string;
    reason?: string;
  };
}

interface NodeHeartbeatMessage {
  type: 'heartbeat';
  data?: {
    nodeId?: string;
    status?: NodeStatus;
    stats?: Partial<NodeStats>;
  };
}

interface NodeLLMRequestMessage {
  type: 'llm_request';
  data?: {
    requestId?: string;
    nodeId?: string;
    model?: string;
    messages?: Message[];
    options?: any;
  };
}

interface NodeTaskResultMessage {
  type: 'task_result';
  data?: {
    taskId?: string;
    nodeId?: string;
    success?: boolean;
    result?: any;
    error?: {
      message?: string;
    };
    executionTime?: number;
  };
}

type NodeAwareWebSocket = WebSocket & { serverId?: string; nodeId?: string };

export class NodeAwareDistributedServerChannel extends BaseDistributedServerChannel {
  private readonly eventBus: EventBus;
  private readonly nodeSockets = new Map<string, NodeAwareWebSocket>();

  constructor(private readonly nodeManager: NodeManager) {
    super();
    this.eventBus = EventBus.getInstance();
    this.attachTaskAssignmentListener();
  }

  /**
   * 连接建立后的处理
   */
  protected async onConnectionEstablished(
    ws: WebSocket,
    connectionKey: string,
    request: IncomingMessage,
    serverId: string
  ): Promise<void> {
    // 调用基类处理
    await super.onConnectionEstablished(ws, connectionKey, request, serverId);
    
    // NodeAware特定处理（如果需要）
    logger.debug(`[NodeAwareDistributedServerChannel] Connection established: ${serverId}`);
  }

  /**
   * 消息处理（重写基类方法）
   */
  protected async onMessage(ws: NodeAwareWebSocket, message: any): Promise<void> {
    // 处理NodeAware特定的消息类型（优先处理）
    const messageType = message?.type;

    if (messageType === 'node_register') {
      await this.handleNodeRegister(ws, message as NodeRegisterMessage);
      return; // 已处理，不传递给基类
    }

    if (messageType === 'node_unregister') {
      await this.handleNodeUnregister(ws, message as NodeUnregisterMessage);
      return; // 已处理，不传递给基类
    }

    if (messageType === 'heartbeat') {
      // 先处理NodeAware特定的心跳逻辑
      await this.handleNodeHeartbeat(ws, message as NodeHeartbeatMessage);
      // 基类也会处理heartbeat（更新lastActivity），这里不return，让基类也处理
      // 但我们需要确保不会重复处理
    }

    if (messageType === 'llm_request') {
      await this.handleLLMRequest(ws, message as NodeLLMRequestMessage);
      return; // 已处理，不传递给基类
    }

    if (messageType === 'task_result') {
      await this.handleTaskResult(ws, message as NodeTaskResultMessage);
      return; // 已处理，不传递给基类
    }

    // 其他消息类型（register_tools, tool_result, report_ip等）由基类处理
    // 基类的handleMessage会自动处理这些消息类型
  }

  private async handleNodeRegister(ws: NodeAwareWebSocket, message: NodeRegisterMessage): Promise<void> {
    const serverId = ws.serverId;
    const data = message.data || {};

    if (!serverId) {
      logger.warn('⚠️ Received node_register without serverId');
      return;
    }

    const validationErrors = this.validateRegisterPayload(data);
    if (validationErrors.length > 0) {
      this.send(ws, {
        type: 'node_registered',
        data: {
          nodeId: data.nodeId,
          success: false,
          message: validationErrors.join('; ')
        }
      });
      return;
    }

    const registerInfo: NodeRegisterInfo = {
      nodeId: data.nodeId,
      name: data.name!.trim(),
      type: data.type!,
      version: data.version,
      capabilities: data.capabilities || [],
      tools: data.tools,
      personality: data.personality,
      config: data.config,
      stats: data.stats,
      connectionId: serverId
    };

    try {
      const nodeInfo = await this.nodeManager.registerNode(registerInfo);

      this.send(ws, {
        type: 'node_registered',
        data: {
          nodeId: nodeInfo.id,
          success: true,
          message: 'Node registered successfully',
          hubInfo: {
            version: process.env.APEX_BRIDGE_VERSION || 'dev',
            llmAvailable: true
          }
        }
      });

      logger.info(`🤝 Node registered via WebSocket: ${nodeInfo.id} (${nodeInfo.name})`);
      ws.nodeId = nodeInfo.id;
      this.nodeSockets.set(nodeInfo.id, ws);
    } catch (error: any) {
      logger.error(`❌ Failed to register node ${data.name} via WebSocket:`, error);
      this.send(ws, {
        type: 'node_registered',
        data: {
          nodeId: data.nodeId,
          success: false,
          message: error?.message || 'Failed to register node'
        }
      });
    }
  }

  private async handleNodeUnregister(ws: NodeAwareWebSocket, message: NodeUnregisterMessage): Promise<void> {
    const serverId = ws.serverId;
    const nodeId = message.data?.nodeId;

    if (!nodeId) {
      this.send(ws, {
        type: 'node_unregistered',
        data: {
          nodeId: undefined,
          success: false,
          message: 'nodeId is required'
        }
      });
      return;
    }

    const success = await this.nodeManager.unregisterNode(nodeId);

    if (success) {
      logger.info(`🗑️ Node ${nodeId} unregistered via WebSocket${serverId ? ` (${serverId})` : ''}`);
      this.nodeSockets.delete(nodeId);
      if (ws.nodeId === nodeId) {
        delete ws.nodeId;
      }
    } else {
      logger.warn(`⚠️ Node unregister requested for unknown node ${nodeId}`);
    }

    this.send(ws, {
      type: 'node_unregistered',
      data: {
        nodeId,
        success
      }
    });
  }

  private async handleNodeHeartbeat(ws: NodeAwareWebSocket, message: NodeHeartbeatMessage): Promise<void> {
    const serverId = ws.serverId;
    const data = message.data || {};
    const nodeId = data.nodeId;

    if (!nodeId) {
      logger.warn('⚠️ Heartbeat without nodeId ignored');
      this.send(ws, {
        type: 'heartbeat_ack',
        data: {
          nodeId: null,
          success: false,
          message: 'nodeId is required',
          timestamp: Date.now()
        }
      });
      return;
    }

    const normalizedStatus: NodeStatus =
      data.status === 'busy' ? 'busy' :
      data.status === 'offline' ? 'offline' :
      data.status === 'unknown' ? 'unknown' : 'online';

    const nodeInfo = this.nodeManager.handleHeartbeat(
      nodeId,
      {
        status: normalizedStatus,
        stats: data.stats
      },
      serverId
    );

    const success = !!nodeInfo;

    if (!success) {
      logger.warn(`⚠️ Heartbeat received for unregistered node ${nodeId}`);
    } else {
      logger.debug(`💓 Heartbeat processed for node ${nodeId} (${normalizedStatus})`);
    }

    this.send(ws, {
      type: 'heartbeat_ack',
      data: {
        nodeId,
        success,
        status: nodeInfo?.status ?? 'unknown',
        timestamp: Date.now()
      }
    });
  }

  private async handleLLMRequest(ws: NodeAwareWebSocket, message: NodeLLMRequestMessage): Promise<void> {
    const data = message.data || {};
    const requestId = data.requestId;
    const nodeId = data.nodeId || ws.serverId;
    const messages = data.messages;

    if (!requestId || !nodeId) {
      this.send(ws, {
        type: 'llm_response',
        data: {
          requestId: requestId ?? null,
          nodeId: nodeId ?? null,
          success: false,
          error: {
            code: 'invalid_payload',
            message: 'requestId and nodeId are required'
          },
          timestamp: Date.now()
        }
      });
      return;
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      this.send(ws, {
        type: 'llm_response',
        data: {
          requestId,
          nodeId,
          success: false,
          error: {
            code: 'invalid_payload',
            message: 'messages array is required'
          },
          timestamp: Date.now()
        }
      });
      return;
    }

    const options = (typeof data.options === 'object' && data.options) || {};
    const isStream = options.stream === true;
    let streamError: any = null;

    logger.info('[NodeChannel] Handling llm_request', {
      requestId,
      nodeId,
      model: data.model ?? null,
      optionsModel: options?.model ?? null,
      provider: options?.provider ?? null,
      optionKeys: Object.keys(options || {})
    });

    try {
      const result = await this.nodeManager.handleLLMRequest({
        requestId,
        nodeId,
        model: data.model,
        messages,
        options,
        streamObserver: isStream
          ? {
              onChunk: (chunk) => {
                this.send(ws, {
                  type: 'llm_response_stream',
                  data: {
                    requestId: chunk.requestId,
                    nodeId: chunk.nodeId,
                    chunk: chunk.chunk,
                    done: chunk.done,
                    usage: chunk.usage,
                    timestamp: chunk.timestamp
                  }
                });
              },
              onError: (error) => {
                streamError = error;
                this.send(ws, {
                  type: 'llm_response',
                  data: {
                    requestId,
                    nodeId,
                    success: false,
                    error: {
                      code: 'llm_request_failed',
                      message: error?.message || 'LLM stream failed'
                    },
                    timestamp: Date.now()
                  }
                });
              }
            }
          : undefined
      });

      if (streamError) {
        return;
      }

      if (result.success) {
        this.send(ws, {
          type: 'llm_response',
          data: {
            requestId,
            nodeId,
            success: true,
            content: result.content,
            usage: result.usage,
            stream: isStream,
            timestamp: Date.now()
          }
        });
      } else {
        this.send(ws, {
          type: 'llm_response',
          data: {
            requestId,
            nodeId,
            success: false,
            error: result.error,
            stream: isStream,
            timestamp: Date.now()
          }
        });
      }
    } catch (error: any) {
      logger.error(`❌ Failed to proxy LLM request ${requestId}:`, error);
      this.send(ws, {
        type: 'llm_response',
        data: {
          requestId,
          nodeId,
          success: false,
          error: {
            code: 'llm_proxy_error',
            message: error?.message || 'LLM proxy failed'
          },
          timestamp: Date.now()
        }
      });
    }
  }

  private async handleTaskResult(ws: NodeAwareWebSocket, message: NodeTaskResultMessage): Promise<void> {
    const data = message.data || {};
    const taskId = data.taskId;
    const nodeId = data.nodeId || ws.serverId;

    if (!taskId || !nodeId) {
      this.send(ws, {
        type: 'task_result_ack',
        data: {
          taskId: taskId ?? null,
          nodeId: nodeId ?? null,
          success: false,
          message: 'taskId and nodeId are required',
          timestamp: Date.now()
        }
      });
      return;
    }

    const success = data.success ?? true;
    try {
      this.nodeManager.handleTaskResult(nodeId, {
        taskId,
        success,
        result: data.result,
        error: data.error
      });

      this.send(ws, {
        type: 'task_result_ack',
        data: {
          taskId,
          nodeId,
          success: true,
          timestamp: Date.now()
        }
      });
    } catch (error: any) {
      logger.error(`❌ Failed to handle task result ${taskId}:`, error);
      this.send(ws, {
        type: 'task_result_ack',
        data: {
          taskId,
          nodeId,
          success: false,
          message: error?.message || 'Failed to handle task result',
          timestamp: Date.now()
        }
      });
    }
  }

  private validateRegisterPayload(data: NodeRegisterMessage['data']): string[] {
    const errors: string[] = [];

    if (!data?.name || typeof data.name !== 'string') {
      errors.push('name is required');
    }

    if (!data?.type || !['worker', 'companion', 'custom'].includes(data.type)) {
      errors.push('type must be worker, companion or custom');
    }

    if (!Array.isArray(data?.capabilities)) {
      errors.push('capabilities must be an array');
    }

    return errors;
  }

  /**
   * 发送消息（使用基类的sendToClient）
   */
  private send(ws: WebSocket, payload: any): void {
    this.sendToClient(ws, payload);
  }

  /**
   * 连接关闭时的处理（重写基类方法）
   */
  protected onConnectionClosed(ws: NodeAwareWebSocket): void {
    // 调用基类处理
    super.onConnectionClosed(ws);
    
    // NodeAware特定清理
    if (ws.serverId) {
      this.nodeManager.handleConnectionClosed(ws.serverId);
    }
    if (ws.nodeId) {
      this.nodeSockets.delete(ws.nodeId);
      delete ws.nodeId;
    }
  }

  private attachTaskAssignmentListener(): void {
    this.eventBus.subscribe('task_assigned', (payload: any) => {
      const nodeId = payload?.nodeId;
      if (typeof nodeId !== 'string') {
        return;
      }

      const ws = this.nodeSockets.get(nodeId);
      if (!ws) {
        logger.warn(`[TaskDispatch] No active socket for node ${nodeId}`);
        return;
      }

      try {
        this.send(ws, {
          type: 'task_assign',
          data: {
            taskId: payload.taskId,
            nodeId,
            toolName: payload.toolName,
            capability: payload.capability,
            toolArgs: payload.toolArgs,
            timeout: payload.timeout,
            metadata: payload.metadata
          }
        });
      } catch (error) {
        logger.error(`[TaskDispatch] Failed to send task ${payload?.taskId} to node ${nodeId}: ${(error as Error).message}`);
      }
    });
  }
}


