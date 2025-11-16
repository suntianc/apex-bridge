export type NodeStatus = 'online' | 'offline' | 'busy' | 'unknown';

export interface NodeStats {
  activeTasks?: number;
  totalTasks?: number;
  completedTasks?: number;
  failedTasks?: number;
  averageResponseTime?: number;
  lastTaskAt?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface LLMRequestMessage {
  type: 'llm_request';
  data: {
    requestId: string;
    nodeId: string;
    model?: string;
    messages: LLMMessage[];
    options?: Record<string, unknown>;
  };
}

export interface LLMResponseMessage {
  type: 'llm_response';
  data: {
    requestId: string;
    nodeId: string;
    success: boolean;
    content?: unknown;
    usage?: unknown;
    error?: {
      code: string;
      message: string;
      details?: unknown;
    };
    stream?: boolean;
    timestamp: number;
  };
}

export interface LLMResponseStreamMessage {
  type: 'llm_response_stream';
  data: {
    requestId: string;
    nodeId: string;
    chunk: string;
    done: boolean;
    usage?: unknown;
    timestamp: number;
  };
}

export interface NodeRegisterMessage {
  type: 'node_register';
  data: {
    nodeId?: string;
    name: string;
    type: 'worker' | 'companion';
    version?: string;
    capabilities: string[];
    tools?: string[];
    personality?: Record<string, unknown>;
    config?: Record<string, unknown>;
    stats?: NodeStats;
  };
}

export interface NodeRegisteredResponse {
  type: 'node_registered';
  data: {
    nodeId?: string;
    success: boolean;
    message?: string;
    hubInfo?: Record<string, unknown>;
  };
}

export interface HeartbeatMessage {
  type: 'heartbeat';
  data: {
    nodeId: string;
    status: NodeStatus;
    stats?: NodeStats;
  };
}

export interface HeartbeatAckMessage {
  type: 'heartbeat_ack';
  data: {
    nodeId?: string;
    success: boolean;
    status?: NodeStatus;
    message?: string;
    timestamp: number;
  };
}

export interface TaskAssignMessage {
  type: 'task_assign';
  data: {
    taskId: string;
    nodeId: string;
    toolName: string;
    capability?: string;
    toolArgs: Record<string, unknown>;
    timeout?: number;
    priority?: number;
    metadata?: Record<string, unknown>;
  };
}

export type HubMessage =
  | NodeRegisteredResponse
  | HeartbeatAckMessage
  | TaskAssignMessage
  | LLMResponseMessage
  | LLMResponseStreamMessage
  | {
      type: string;
      data?: unknown;
    };

