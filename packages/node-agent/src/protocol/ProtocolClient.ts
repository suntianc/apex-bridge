import EventEmitter from 'eventemitter3';
import { Logger } from 'winston';
import { ConnectionManager, ConnectionState } from '../connection/ConnectionManager';
import { NodeAgentConfig } from '../config/types';
import {
  HeartbeatMessage,
  HubMessage,
  NodeRegisterMessage,
  NodeStats,
  NodeStatus,
  TaskAssignMessage,
  LLMRequestMessage,
  LLMResponseMessage,
  LLMResponseStreamMessage
} from './types';
import { TaskResultMessage } from '../tasks/types';

type ProtocolEventPayloads = {
  registered: [string];
  registrationFailed: [string];
  heartbeatAck: [HeartbeatAck];
  taskAssign: [TaskAssignMessage['data']];
  llmStream: [LLMResponseStreamMessage['data']];
  llmResponse: [LLMResponseMessage['data']];
  message: [HubMessage];
  stateChange: [ConnectionState];
};

type HeartbeatAck = Extract<HubMessage, { type: 'heartbeat_ack' }>;

type ProtocolEvent = keyof ProtocolEventPayloads;

export interface ProtocolClientOptions {
  config: NodeAgentConfig;
  connection: ConnectionManager;
  logger: Logger;
  statsProvider?: () => NodeStats;
}

export class ProtocolClient extends EventEmitter<ProtocolEventPayloads> {
  private readonly config: NodeAgentConfig;
  private readonly connection: ConnectionManager;
  private readonly logger: Logger;
  private readonly statsProvider?: () => NodeStats;

  private currentNodeId?: string;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private shuttingDown = false;

  constructor(options: ProtocolClientOptions) {
    super();
    this.config = options.config;
    this.connection = options.connection;
    this.logger = options.logger;
    this.statsProvider = options.statsProvider;
    this.currentNodeId = this.config.node.id;
  }

  async start(): Promise<void> {
    this.subscribeConnectionEvents();
    await this.connection.start();
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    this.clearHeartbeat();
    await this.connection.stop();
  }

  getNodeId(): string | undefined {
    return this.currentNodeId;
  }

  send(payload: unknown): void {
    this.connection.send(payload);
  }

  sendTaskResult(message: TaskResultMessage): void {
    this.connection.send(message);
  }

  sendLLMRequest(data: LLMRequestMessage['data']): void {
    const message: LLMRequestMessage = {
      type: 'llm_request',
      data
    };
    this.connection.send(message);
  }

  private subscribeConnectionEvents(): void {
    this.connection.on('open', () => {
      this.logger.info('Connection established, sending node_register');
      this.emit('stateChange', 'connected');
      this.sendRegister();
    });

    this.connection.on('message', (payload) => {
      this.handleMessage(payload as HubMessage);
    });

    this.connection.on('close', () => {
      this.logger.warn('Connection closed, stopping heartbeat');
      this.emit('stateChange', 'disconnected');
      this.clearHeartbeat();
    });

    this.connection.on('stateChange', (state) => {
      this.emit('stateChange', state);
    });

    this.connection.on('error', (error) => {
      this.logger.error(`Connection error: ${error.message}`);
    });
  }

  private sendRegister(): void {
    const message: NodeRegisterMessage = {
      type: 'node_register',
      data: {
        nodeId: this.currentNodeId,
        name: this.config.node.name,
        type: this.config.node.type,
        capabilities: this.config.node.capabilities,
        tools: this.config.node.tools,
        config: {
          tasks: this.config.tasks,
          heartbeat: this.config.heartbeat
        },
        stats: {
          activeTasks: 0,
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0
        }
      }
    };

    this.connection.send(message);
  }

  private handleMessage(payload: HubMessage): void {
    if (!payload || typeof payload !== 'object' || !('type' in payload)) {
      this.logger.warn('Received malformed payload from Hub');
      return;
    }

    switch (payload.type) {
      case 'node_registered':
        this.handleNodeRegistered(payload as Extract<HubMessage, { type: 'node_registered' }>);
        break;
      case 'heartbeat_ack':
        this.emit('heartbeatAck', payload as HeartbeatAck);
        break;
      case 'task_assign':
        this.emit('taskAssign', (payload as TaskAssignMessage).data);
        break;
      case 'llm_response_stream':
        this.emit('llmStream', (payload as LLMResponseStreamMessage).data);
        break;
      case 'llm_response':
        this.emit('llmResponse', (payload as LLMResponseMessage).data);
        break;
      default:
        this.emit('message', payload);
    }
  }

  private handleNodeRegistered(payload: Extract<HubMessage, { type: 'node_registered' }>): void {
    if (!payload.data?.success) {
      const reason = payload.data?.message || 'Unknown registration failure';
      this.logger.error(`Node registration failed: ${reason}`);
      this.emit('registrationFailed', reason);
      return;
    }

    if (payload.data.nodeId) {
      this.currentNodeId = payload.data.nodeId;
    }

    this.logger.info('Node registration succeeded', {
      nodeId: this.currentNodeId
    });

    this.emit('registered', this.currentNodeId || '');
    this.scheduleHeartbeat();
  }

  private scheduleHeartbeat(): void {
    this.clearHeartbeat();
    const interval = this.config.heartbeat.intervalMs;
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, interval);
    this.sendHeartbeat();
  }

  private sendHeartbeat(): void {
    if (!this.currentNodeId) {
      return;
    }

    const heartbeat: HeartbeatMessage = {
      type: 'heartbeat',
      data: {
        nodeId: this.currentNodeId,
        status: this.shuttingDown ? 'offline' : this.deriveStatus(),
        stats: this.statsProvider ? this.statsProvider() : undefined
      }
    };

    this.connection.send(heartbeat);
  }

  private deriveStatus(): NodeStatus {
    return 'online';
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

