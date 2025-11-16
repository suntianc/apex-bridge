import { EventBus } from './EventBus';
import { logger } from '../utils/logger';
import {
  NodeInfo,
  NodeService,
  NodeStats,
  NodeStatus,
  RegisterNodeInput,
  NodeType
} from '../services/NodeService';
import { Message, ChatOptions, LLMResponse, LLMQuotaConfig } from '../types';
import { RuntimeConfigService } from '../services/RuntimeConfigService';
import { QuotaManager, QuotaDecision } from './QuotaManager';
import { LLMClient } from './LLMClient';

export interface NodeManagerConfig {
  nodeService: NodeService;
  eventBus?: EventBus;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  quotaConfig?: LLMQuotaConfig;
}

export interface NodeRegisterInfo extends RegisterNodeInput {
  nodeId?: string;
  connectionId?: string;
}

export interface HeartbeatPayload {
  status?: NodeStatus;
  stats?: Partial<NodeStats>;
}

export interface TaskAssignPayload {
  taskId?: string;
  capability?: string;
  toolName: string;
  toolArgs: Record<string, any>;
  timeout?: number;
  priority?: number;
  metadata?: Record<string, any>;
}

interface PendingTask {
  taskId: string;
  nodeId: string;
  assignedAt: number;
  expiresAt: number;
  timeout: NodeJS.Timeout;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}

export interface NodeFilter {
  status?: NodeStatus | NodeStatus[];
  type?: NodeType | NodeType[];
  capability?: string;
}

export interface PendingTaskInfo {
  taskId: string;
  nodeId: string;
  assignedAt: number;
  expiresAt: number;
}

export interface LLMRequestPayload {
  requestId: string;
  nodeId: string;
  model?: string;
  messages: Message[];
  options?: ChatOptions;
  streamObserver?: LLMStreamObserver;
}

interface LLMProxyResult {
  success: boolean;
  content?: string;
  usage?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
interface PendingStreamRequest {
  nodeId: string;
  abortController: AbortController;
  startedAt: number;
}

export interface LLMStreamChunk {
  requestId: string;
  nodeId: string;
  chunk: string;
  done: boolean;
  usage?: any;
  timestamp: number;
}

export interface LLMStreamObserver {
  onChunk: (data: LLMStreamChunk) => void;
  onCompleted?: (result: LLMProxyResult) => void;
  onError?: (error: any) => void;
}
interface ManagedNode {
  info: NodeInfo;
  lastHeartbeat: number;
  connectionId?: string;
}

export class NodeManager {
  private readonly nodeService: NodeService;
  private readonly eventBus?: EventBus;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly nodes: Map<string, ManagedNode> = new Map();
  private readonly pendingTasks: Map<string, PendingTask> = new Map();
  private readonly taskAssignments: Map<string, Set<string>> = new Map();
  private readonly runtimeConfig = RuntimeConfigService.getInstance();
  private readonly quotaManager: QuotaManager;
  private readonly pendingLLMRequests: Map<string, PendingStreamRequest> = new Map();
  private lastQuotaConfigSignature: string | null = null;

  constructor(config: NodeManagerConfig) {
    this.nodeService = config.nodeService;
    this.eventBus = config.eventBus;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? 30_000;
    this.heartbeatTimeoutMs = config.heartbeatTimeoutMs ?? 90_000;
    this.quotaManager = new QuotaManager(config.quotaConfig);

    this.bootstrapFromStorage();
  }

  private async handleStreamingLLMRequest(
    llmClient: LLMClient,
    params: {
      requestId: string;
      nodeId: string;
      messages: Message[];
      chatOptions: ChatOptions;
      streamObserver?: LLMStreamObserver;
    }
  ): Promise<LLMProxyResult> {
    const { requestId, nodeId, messages, chatOptions, streamObserver } = params;
    const abortController = new AbortController();
    const streamRequest: PendingStreamRequest = {
      nodeId,
      abortController,
      startedAt: Date.now()
    };
    this.pendingLLMRequests.set(requestId, streamRequest);

    let aggregatedContent = '';
    let chunkCount = 0;

    try {
      for await (const chunk of llmClient.streamChat(messages, chatOptions, abortController.signal)) {
        chunkCount += 1;
        if (chunk) {
          aggregatedContent += chunk;
        }

        const payload: LLMStreamChunk = {
          requestId,
          nodeId,
          chunk: chunk ?? '',
          done: false,
          timestamp: Date.now()
        };

        this.publishEvent('llm_proxy_stream_chunk', payload);
        streamObserver?.onChunk(payload);
      }

      const completedPayload: LLMStreamChunk = {
        requestId,
        nodeId,
        chunk: '',
        done: true,
        timestamp: Date.now()
      };

      this.publishEvent('llm_proxy_stream_completed', {
        requestId,
        nodeId,
        success: true,
        chunks: chunkCount,
        timestamp: completedPayload.timestamp
      });
      streamObserver?.onChunk(completedPayload);

      const result: LLMProxyResult = {
        success: true,
        content: aggregatedContent
      };

      streamObserver?.onCompleted?.(result);
      this.publishEvent('llm_proxy_completed', {
        requestId,
        nodeId,
        success: true,
        stream: true,
        timestamp: completedPayload.timestamp
      });

      return result;
    } catch (error: any) {
      const message = error?.message || 'LLM stream failed';
      logger.error(`❌ LLM stream failed: ${message}`);

      this.publishEvent('llm_proxy_stream_completed', {
        requestId,
        nodeId,
        success: false,
        error: message,
        timestamp: Date.now()
      });

      this.publishEvent('llm_proxy_completed', {
        requestId,
        nodeId,
        success: false,
        error: message,
        stream: true,
        timestamp: Date.now()
      });

      streamObserver?.onError?.(error);

      return {
        success: false,
        error: {
          code: 'llm_request_failed',
          message
        }
      };
    } finally {
      this.pendingLLMRequests.delete(requestId);
      const estimatedTokens = this.estimateTokens(aggregatedContent);
      this.quotaManager.completeRequest(nodeId, {
        stream: true,
        tokens: estimatedTokens
      });
    }
  }

  private refreshQuotaConfig(): void {
    let config = this.runtimeConfig.getCurrentConfig();
    if (!config) {
      try {
        config = this.runtimeConfig.loadConfig();
      } catch (error) {
        logger.debug(`⚠️ Failed to load runtime config for quota: ${error}`);
      }
    }

    const quotaConfig = config?.llm?.quota;
    const signature = quotaConfig ? JSON.stringify(quotaConfig) : null;

    if (signature !== this.lastQuotaConfigSignature) {
      this.quotaManager.updateConfig(quotaConfig);
      this.lastQuotaConfigSignature = signature;
      logger.debug(`[QuotaManager] Updated quota configuration: ${signature ?? 'default'}`);
    }
  }

  private mapQuotaDecisionToError(decision: QuotaDecision): { code: string; message: string } {
    switch (decision.code) {
      case 'requests_per_minute_exceeded':
        return {
          code: 'rate_limit_exceeded',
          message: 'Too many LLM requests per minute'
        };
      case 'token_quota_exceeded':
        return {
          code: 'quota_exceeded',
          message: 'Daily LLM token quota exceeded'
        };
      case 'stream_concurrency_exceeded':
        return {
          code: 'stream_limit_exceeded',
          message: 'Too many concurrent LLM streams'
        };
      default:
        return {
          code: 'quota_exceeded',
          message: decision.message || 'LLM quota exceeded'
        };
    }
  }

  private estimateTokens(content: string): number {
    if (!content) {
      return 0;
    }
    return Math.max(1, Math.ceil(content.length / 4));
  }

  assignTask(task: TaskAssignPayload): Promise<any> {
    if (!task || typeof task.toolName !== 'string' || task.toolName.trim().length === 0) {
      return Promise.reject(new Error('toolName is required'));
    }

    const selected = this.selectNodeForTask(task.capability);
    if (!selected) {
      return Promise.reject(new Error('No available node for task'));
    }

    const assignment = this.createTaskAssignment(selected.id, task);
    return assignment.result;
  }
  dispatchTaskToNode(nodeId: string, task: TaskAssignPayload): { taskId: string; result: Promise<any> } {
    if (!task || typeof task.toolName !== 'string' || task.toolName.trim().length === 0) {
      throw new Error('toolName is required');
    }
    if (!nodeId || typeof nodeId !== 'string') {
      throw new Error('nodeId is required');
    }

    return this.createTaskAssignment(nodeId, task);
  }

  private createTaskAssignment(nodeId: string, task: TaskAssignPayload): { taskId: string; result: Promise<any> } {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not registered`);
    }

    if (node.info.status === 'offline') {
      throw new Error(`Node ${nodeId} is offline`);
    }

    if (task.capability && !node.info.capabilities?.includes(task.capability)) {
      logger.warn('[TaskAssignment] Node does not declare requested capability', {
        nodeId,
        capability: task.capability,
        toolName: task.toolName
      });
    }

    const taskId = task.taskId || `task-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    const timeoutMs = task.timeout ?? 60_000;

    const result = new Promise<any>((resolve, reject) => {
      const assignedAt = Date.now();
      const expiresAt = assignedAt + timeoutMs;
      const timeout = setTimeout(() => {
        this.pendingTasks.delete(taskId);
        this.taskAssignments.get(nodeId)?.delete(taskId);
        this.updateNodeStatsAfterTask(nodeId, false);
        this.publishEvent('task_timeout', {
          taskId,
          nodeId,
          timeout: timeoutMs,
          timestamp: Date.now()
        });
        reject(new Error(`Task ${taskId} timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingTasks.set(taskId, {
        taskId,
        nodeId,
        assignedAt,
        expiresAt,
        timeout,
        resolve,
        reject
      });

      if (!this.taskAssignments.has(nodeId)) {
        this.taskAssignments.set(nodeId, new Set());
      }
      this.taskAssignments.get(nodeId)!.add(taskId);
      this.updateNodeStatsBeforeTask(nodeId);

      this.publishEvent('task_assigned', {
        taskId,
        nodeId,
        toolName: task.toolName,
        capability: task.capability,
        priority: task.priority ?? 5,
        timeout: timeoutMs,
        toolArgs: task.toolArgs,
        metadata: task.metadata,
        timestamp: Date.now()
      });
    });

    return {
      taskId,
      result
    };
  }


  handleTaskResult(nodeId: string, result: { taskId: string; success: boolean; result?: any; error?: { message?: string } }): void {
    const pending = this.pendingTasks.get(result.taskId);
    if (!pending) {
      logger.warn(`⚠️ Received task result for unknown taskId: ${result.taskId}`);
      return;
    }

    if (pending.nodeId !== nodeId) {
      logger.warn(`⚠️ Task ${result.taskId} result from mismatched node ${nodeId} (expected ${pending.nodeId})`);
    }

    clearTimeout(pending.timeout);
    this.pendingTasks.delete(result.taskId);
    this.taskAssignments.get(pending.nodeId)?.delete(result.taskId);
    this.updateNodeStatsAfterTask(pending.nodeId, result.success);

    this.publishEvent('task_completed', {
      taskId: result.taskId,
      nodeId: nodeId,
      success: result.success,
      timestamp: Date.now()
    });

    if (result.success) {
      pending.resolve(result.result);
      this.processDelegations(result.taskId, result.result).catch(error => {
        logger.error('[Delegation] Failed to process follow-up tasks', {
          sourceTaskId: result.taskId,
          error: (error as Error).message
        });
      });
    } else {
      pending.reject(new Error(result.error?.message || 'Task execution failed'));
    }
  }

  private async processDelegations(sourceTaskId: string, payload: any): Promise<void> {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.delegations) || payload.delegations.length === 0) {
      return;
    }

    for (let index = 0; index < payload.delegations.length; index += 1) {
      const delegation = payload.delegations[index];
      if (!delegation || typeof delegation !== 'object') {
        continue;
      }

      const toolName = delegation.toolName;
      if (typeof toolName !== 'string' || toolName.trim().length === 0) {
        logger.warn('[Delegation] Missing toolName in delegation', { sourceTaskId, delegation });
        continue;
      }

      const capability = typeof delegation.capability === 'string' ? delegation.capability : 'worker';
      const toolArgs = (delegation.args && typeof delegation.args === 'object') ? delegation.args : {};
      const timeout = typeof delegation.timeout === 'number' ? delegation.timeout : 60_000;
      const delegationTaskId = delegation.taskId && typeof delegation.taskId === 'string'
        ? delegation.taskId
        : `${sourceTaskId}-delegation-${index + 1}`;

      try {
        await this.assignTask({
          taskId: delegationTaskId,
          capability,
          toolName,
          toolArgs,
          timeout,
          metadata: {
            sourceTaskId,
            ...delegation.metadata
          }
        });
      } catch (error) {
        logger.error('[Delegation] Failed to assign follow-up task', {
          sourceTaskId,
          delegationTaskId,
          toolName,
          error: (error as Error).message
        });
      }
    }
  }

  getNodeStats(nodeId: string): NodeStats | null {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return null;
    }

    const stats = node.info.stats ? { ...node.info.stats } : this.ensureStats();
    return { ...stats };
  }

  getPendingTasks(nodeId?: string): PendingTaskInfo[] {
    const tasks = Array.from(this.pendingTasks.values());
    return tasks
      .filter(task => !nodeId || task.nodeId === nodeId)
      .map(task => ({
        taskId: task.taskId,
        nodeId: task.nodeId,
        assignedAt: task.assignedAt,
        expiresAt: task.expiresAt
      }));
  }

  async handleLLMRequest(payload: LLMRequestPayload): Promise<LLMProxyResult> {
    const { requestId, nodeId, messages, model, options, streamObserver } = payload;
    const node = this.nodes.get(nodeId);

    if (!node) {
      const message = `Node ${nodeId} not registered`;
      logger.warn(`⚠️ LLM request rejected: ${message}`);
      return {
        success: false,
        error: {
          code: 'node_not_found',
          message
        }
      };
    }

    if (!messages || messages.length === 0) {
      const message = 'messages array is required';
      logger.warn(`⚠️ LLM request rejected: ${message}`);
      return {
        success: false,
        error: {
          code: 'invalid_payload',
          message
        }
      };
    }

    this.refreshQuotaConfig();

    const llmClient = await this.runtimeConfig.getLLMClient();
    if (!llmClient) {
      const message = 'LLM client not configured';
      logger.error(`❌ LLM request failed: ${message}`);
      return {
        success: false,
        error: {
          code: 'llm_unavailable',
          message
        }
      };
    }

    const chatOptions: ChatOptions = {
      ...(options || {}),
      model: model || options?.model
    };
    const isStream = chatOptions.stream === true;

    const quotaDecision = this.quotaManager.consumeRequest(nodeId, { stream: isStream });
    if (!quotaDecision.allowed) {
      const quotaError = this.mapQuotaDecisionToError(quotaDecision);
      logger.warn(`⚠️ LLM request rate limited for node ${nodeId}: ${quotaError.message}`);
      this.publishEvent('llm_proxy_rate_limited', {
        requestId,
        nodeId,
        code: quotaError.code,
        message: quotaError.message,
        timestamp: Date.now()
      });
      streamObserver?.onError?.(new Error(quotaError.message));
      return {
        success: false,
        error: quotaError
      };
    }

    this.publishEvent('llm_proxy_started', {
      requestId,
      nodeId,
      model: chatOptions.model,
      provider: chatOptions.provider,
      stream: isStream,
      timestamp: Date.now()
    });

    if (isStream) {
      return await this.handleStreamingLLMRequest(llmClient, {
        requestId,
        nodeId,
        messages,
        chatOptions,
        streamObserver
      });
    }

    let tokensUsed = 0;
    try {
      const response: LLMResponse & { usage?: any } = await llmClient.chat(messages, chatOptions);
      const choice = response.choices?.[0];
      const content = choice?.message?.content || '';
      const usage = (response as any).usage;
      tokensUsed = usage?.total_tokens ?? this.estimateTokens(content);

      this.publishEvent('llm_proxy_completed', {
        requestId,
        nodeId,
        success: true,
        usage,
        stream: false,
        timestamp: Date.now()
      });

      return {
        success: true,
        content,
        usage
      };
    } catch (error: any) {
      logger.error(`❌ LLM request failed: ${error.message}`);
      this.publishEvent('llm_proxy_completed', {
        requestId,
        nodeId,
        success: false,
        error: error.message,
        stream: false,
        timestamp: Date.now()
      });

      return {
        success: false,
        error: {
          code: 'llm_request_failed',
          message: error.message,
          details: error.response?.data
        }
      };
    } finally {
      this.quotaManager.completeRequest(nodeId, { stream: false, tokens: tokensUsed });
    }
  }

  private updateNodeStatsBeforeTask(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return;
    }

    const stats = this.mergeStats(node.info.stats, {
      activeTasks: (node.info.stats?.activeTasks || 0) + 1
    });

    node.info.stats = stats;
    this.nodeService.updateNodeRuntime(nodeId, {
      stats,
      status: 'busy'
    });
    this.publishStatusChange(nodeId, node.info.status, 'busy');
    node.info.status = 'busy';
  }

  private updateNodeStatsAfterTask(nodeId: string, success: boolean): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return;
    }

    const active = Math.max((node.info.stats?.activeTasks || 1) - 1, 0);
    const stats = this.mergeStats(node.info.stats, {
      activeTasks: active,
      totalTasks: (node.info.stats?.totalTasks || 0) + 1,
      completedTasks: success ? (node.info.stats?.completedTasks || 0) + 1 : node.info.stats?.completedTasks,
      failedTasks: !success ? (node.info.stats?.failedTasks || 0) + 1 : node.info.stats?.failedTasks,
      lastTaskAt: Date.now()
    });

    node.info.stats = stats;
    const newStatus = active > 0 ? 'busy' : 'online';
    this.nodeService.updateNodeRuntime(nodeId, {
      stats,
      status: newStatus
    });
    this.publishStatusChange(nodeId, node.info.status, newStatus);
    node.info.status = newStatus;
  }

  private selectNodeForTask(capability?: string): NodeInfo | null {
    const candidates = this.listNodes({
      status: ['online', 'busy']
    }).filter(node => {
      if (node.status === 'offline') {
        return false;
      }
      if (capability) {
        return node.capabilities?.includes(capability);
      }
      return true;
    });

    if (candidates.length === 0) {
      return null;
    }

    const online = candidates.filter(node => node.status === 'online');
    if (online.length > 0) {
      return online.reduce((best, node) => {
        const bestLoad = (best.stats?.activeTasks || 0) / Math.max(best.config?.maxConcurrentTasks || 1, 1);
        const nodeLoad = (node.stats?.activeTasks || 0) / Math.max(node.config?.maxConcurrentTasks || 1, 1);
        return nodeLoad < bestLoad ? node : best;
      });
    }

    return candidates.reduce((best, node) => {
      const bestConcurrent = best.config?.maxConcurrentTasks || 1;
      const nodeConcurrent = node.config?.maxConcurrentTasks || 1;
      if (nodeConcurrent !== bestConcurrent) {
        return nodeConcurrent > bestConcurrent ? node : best;
      }
      const bestActive = best.stats?.activeTasks || 0;
      const nodeActive = node.stats?.activeTasks || 0;
      return nodeActive < bestActive ? node : best;
    });
  }

  /**
   * 注册节点（线程安全，使用分布式锁）
   */
  async registerNode(info: NodeRegisterInfo): Promise<NodeInfo> {
    const { nodeId, connectionId, ...rest } = info;
    const stats = this.mergeStats(undefined, rest.stats);
    const registerInput: RegisterNodeInput = {
      ...rest,
      id: nodeId ?? rest.id,
      status: rest.status ?? 'online',
      stats
    };

    const registered = await this.nodeService.registerNode(registerInput);
    const managed = this.prepareManagedNode({
      ...registered,
      status: registerInput.status ?? registered.status,
      stats
    }, connectionId);

    this.nodes.set(managed.info.id, managed);
    this.nodeService.updateNodeRuntime(managed.info.id, {
      status: managed.info.status,
      lastHeartbeat: managed.info.lastHeartbeat,
      lastSeen: managed.info.lastSeen,
      stats: managed.info.stats
    });

    this.publishEvent('node_registered', {
      node: this.cloneNodeInfo(managed.info),
      timestamp: managed.info.lastHeartbeat
    });

    logger.info(`✅ NodeManager registered node: ${managed.info.id} (${managed.info.name})${connectionId ? ` via ${connectionId}` : ''}`);
    return this.cloneNodeInfo(managed.info);
  }

  /**
   * 注销节点（线程安全，使用分布式锁）
   */
  async unregisterNode(nodeId: string): Promise<boolean> {
    const managed = this.nodes.get(nodeId);
    const existed = !!managed;
    if (existed) {
      this.nodes.delete(nodeId);
    }
    const removed = await this.nodeService.unregisterNode(nodeId);

    if (existed || removed) {
      this.publishEvent('node_unregistered', {
        nodeId,
        node: existed ? this.cloneNodeInfo(managed!.info) : undefined,
        timestamp: Date.now()
      });
      logger.info(`🗑️ NodeManager unregistered node: ${nodeId}`);
      return true;
    }

    logger.warn(`⚠️ NodeManager attempted to unregister unknown node: ${nodeId}`);
    return false;
  }

  /**
   * 处理心跳
   */
  handleHeartbeat(nodeId: string, payload: HeartbeatPayload = {}, connectionId?: string): NodeInfo | null {
    const managed = this.nodes.get(nodeId);
    if (!managed) {
      logger.warn(`⚠️ Received heartbeat from unknown node: ${nodeId}`);
      return null;
    }

    const now = Date.now();
    const previousStatus = managed.info.status;
    const nextStatus = payload.status ?? previousStatus ?? 'online';
    const mergedStats = this.mergeStats(managed.info.stats, payload.stats);

    managed.lastHeartbeat = now;
    managed.info = {
      ...managed.info,
      status: nextStatus,
      lastHeartbeat: now,
      lastSeen: now,
      stats: mergedStats
    };
    managed.connectionId = connectionId ?? managed.connectionId;

    this.nodeService.updateNodeRuntime(nodeId, {
      status: nextStatus,
      lastHeartbeat: now,
      lastSeen: now,
      stats: mergedStats
    });

    this.publishEvent('node_heartbeat', {
      nodeId,
      status: nextStatus,
      timestamp: now,
      stats: mergedStats
    });

    if (previousStatus !== nextStatus) {
      this.publishStatusChange(nodeId, previousStatus, nextStatus);
    }

    return this.cloneNodeInfo(managed.info);
  }

  /**
   * 更新节点状态
   */
  updateNodeStatus(nodeId: string, status: NodeStatus): NodeInfo | null {
    const managed = this.nodes.get(nodeId);
    const now = Date.now();

    if (managed) {
      const previousStatus = managed.info.status;
      managed.info = {
        ...managed.info,
        status,
        lastSeen: status === 'offline' ? managed.info.lastSeen : now
      };

      this.nodeService.updateNodeRuntime(nodeId, {
        status,
        lastSeen: managed.info.lastSeen
      });

      if (previousStatus !== status) {
        this.publishStatusChange(nodeId, previousStatus, status);
      }

      return this.cloneNodeInfo(managed.info);
    }

    const updated = this.nodeService.updateNodeRuntime(nodeId, { status, lastSeen: now });
    if (updated) {
      this.publishStatusChange(nodeId, 'unknown', status);
      return updated;
    }

    logger.warn(`⚠️ NodeManager attempted to update status for unknown node: ${nodeId}`);
    return null;
  }

  /**
   * 更新节点信息（线程安全，使用分布式锁）
   */
  async updateNode(id: string, updates: Partial<NodeInfo>): Promise<NodeInfo | null> {
    const managed = this.nodes.get(id);
    if (!managed) {
      return null;
    }

    const persisted = await this.nodeService.updateNode(id, updates);
    if (!persisted) {
      return null;
    }

    const updatedInfo: NodeInfo = {
      ...managed.info,
      ...persisted,
      lastHeartbeat: managed.info.lastHeartbeat,
      lastSeen: persisted.lastSeen ?? managed.info.lastSeen,
      stats: persisted.stats ?? managed.info.stats,
      config: persisted.config ?? managed.info.config,
      capabilities: persisted.capabilities ?? managed.info.capabilities,
      tools: persisted.tools ?? managed.info.tools,
      personality: persisted.personality ?? managed.info.personality
    };

    managed.info = updatedInfo;
    this.nodes.set(id, managed);

    return this.cloneNodeInfo(updatedInfo);
  }

  /**
   * 检查心跳超时
   */
  checkHeartbeatTimeout(): void {
    const now = Date.now();

    this.nodes.forEach((managed, nodeId) => {
      const elapsed = now - managed.lastHeartbeat;
      if (elapsed > this.heartbeatTimeoutMs && managed.info.status !== 'offline') {
        const previousStatus = managed.info.status;
        managed.info = {
          ...managed.info,
          status: 'offline'
        };
        this.nodeService.updateNodeRuntime(nodeId, { status: 'offline', lastSeen: managed.info.lastSeen ?? now });
        this.publishStatusChange(nodeId, previousStatus, 'offline');
        logger.warn(`⏸️ Node ${nodeId} marked offline (heartbeat timeout ${elapsed}ms)`);
      }
    });
  }

  /**
   * 启动心跳检测
   */
  start(): void {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => this.checkHeartbeatTimeout(), this.heartbeatIntervalMs);
    logger.info('🩺 NodeManager heartbeat monitor started');
  }

  /**
   * 停止心跳检测
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.info('🛑 NodeManager heartbeat monitor stopped');
    }
  }

  /**
   * 获取节点
   */
  getNode(nodeId: string): NodeInfo | null {
    const managed = this.nodes.get(nodeId);
    return managed ? this.cloneNodeInfo(managed.info) : null;
  }

  /**
   * 获取所有节点
   */
  listNodes(filter?: NodeFilter): NodeInfo[] {
    const result = Array.from(this.nodes.values())
      .map(managed => managed.info)
      .filter(info => this.applyFilter(info, filter));

    return result.map(info => this.cloneNodeInfo(info));
  }

  private bootstrapFromStorage(): void {
    const storedNodes = this.nodeService.getAllNodes();

    storedNodes.forEach(node => {
      const managed = this.prepareManagedNode(node);
      this.nodes.set(managed.info.id, managed);
    });

    logger.info(`📦 NodeManager loaded ${this.nodes.size} node(s) from storage`);
  }

  private applyFilter(info: NodeInfo, filter?: NodeFilter): boolean {
    if (!filter) {
      return true;
    }

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      if (!statuses.includes(info.status)) {
        return false;
      }
    }

    if (filter.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      if (!types.includes(info.type)) {
        return false;
      }
    }

    if (filter.capability) {
      const capabilities = info.capabilities || [];
      if (!capabilities.includes(filter.capability)) {
        return false;
      }
    }

    return true;
  }

  private prepareManagedNode(node: NodeInfo, connectionId?: string): ManagedNode {
    const stats = this.mergeStats(undefined, node.stats);
    const heartbeat = node.lastHeartbeat ?? node.lastSeen ?? node.registeredAt;
    const status = node.status ?? 'unknown';

    const info: NodeInfo = {
      ...node,
      status,
      stats,
      lastHeartbeat: heartbeat,
      lastSeen: node.lastSeen ?? heartbeat
    };

    return {
      info,
      lastHeartbeat: heartbeat,
      connectionId
    };
  }

  handleConnectionClosed(connectionId: string): void {
    const now = Date.now();
    this.nodes.forEach((managed, nodeId) => {
      if (managed.connectionId === connectionId) {
        managed.connectionId = undefined;
        const previousStatus = managed.info.status;
        managed.info = {
          ...managed.info,
          status: 'offline',
          lastSeen: managed.info.lastSeen ?? now
        };
        this.nodeService.updateNodeRuntime(nodeId, {
          status: 'offline',
          lastSeen: managed.info.lastSeen
        });
        if (previousStatus !== 'offline') {
          this.publishStatusChange(nodeId, previousStatus, 'offline');
        }
        this.publishEvent('node_disconnected', {
          nodeId,
          connectionId,
          timestamp: now
        });
        logger.warn(`🔌 Connection ${connectionId} closed, node ${nodeId} marked offline`);
      }
    });
  }

  private mergeStats(base?: NodeStats, updates?: Partial<NodeStats>): NodeStats {
    const ensuredBase = this.ensureStats(base);
    if (!updates) {
      return ensuredBase;
    }

    return this.ensureStats({
      ...ensuredBase,
      ...updates
    });
  }

  private ensureStats(stats?: NodeStats | Partial<NodeStats>): NodeStats {
    return {
      totalTasks: stats?.totalTasks ?? 0,
      completedTasks: stats?.completedTasks ?? 0,
      failedTasks: stats?.failedTasks ?? 0,
      activeTasks: stats?.activeTasks ?? 0,
      averageResponseTime: stats?.averageResponseTime ?? 0,
      lastTaskAt: stats?.lastTaskAt
    };
  }

  private publishStatusChange(nodeId: string, oldStatus: NodeStatus | undefined, newStatus: NodeStatus): void {
    if (!this.eventBus) {
      return;
    }

    const current = this.nodes.get(nodeId);
    this.eventBus.publish('node_status_changed', {
      nodeId,
      oldStatus,
      newStatus,
      timestamp: Date.now(),
      node: current ? this.cloneNodeInfo(current.info) : undefined
    });
  }

  private publishEvent(event: string, payload: any): void {
    if (!this.eventBus) {
      return;
    }

    this.eventBus.publish(event, payload);
  }

  private cloneNodeInfo(info: NodeInfo): NodeInfo {
    return {
      ...info,
      capabilities: info.capabilities ? [...info.capabilities] : undefined,
      tools: info.tools ? [...info.tools] : undefined,
      config: info.config
        ? {
            ...info.config,
            capabilities: info.config.capabilities ? [...info.config.capabilities] : undefined,
            metadata: info.config.metadata ? { ...info.config.metadata } : undefined,
            resources: info.config.resources ? { ...info.config.resources } : undefined
          }
        : undefined,
      stats: info.stats ? { ...info.stats } : undefined,
      personality: info.personality ? { ...info.personality } : undefined
    };
  }
}



