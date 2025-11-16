import { Logger } from 'winston';
import { TaskAssignment, TaskContext, TaskHandler, TaskOrchestratorStats, TaskResult, TaskResultMessage } from './types';
import { TaskRegistry } from './TaskRegistry';

export interface TaskOrchestratorOptions {
  logger: Logger;
  maxConcurrent: number;
  defaultTimeoutMs: number;
  sendResult: (message: TaskResultMessage) => void;
  getNodeId: () => string | undefined;
  onStatsChange?: (stats: TaskOrchestratorStats) => void;
}

interface PendingTask {
  assignment: TaskAssignment;
  createdAt: number;
  timeoutMs: number;
  resolve: () => void;
}

export class TaskOrchestrator {
  private readonly logger: Logger;
  private readonly maxConcurrent: number;
  private readonly defaultTimeoutMs: number;
  private readonly sendResult: (message: TaskResultMessage) => void;
  private readonly getNodeId: () => string | undefined;
  private readonly onStatsChange?: (stats: TaskOrchestratorStats) => void;
  private readonly registry = new TaskRegistry();

  private readonly queue: PendingTask[] = [];
  private activeCount = 0;
  private totalCompleted = 0;
  private totalFailed = 0;
  private stopping = false;

  constructor(options: TaskOrchestratorOptions) {
    this.logger = options.logger.child({ component: 'TaskOrchestrator' });
    this.maxConcurrent = options.maxConcurrent;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
    this.sendResult = options.sendResult;
    this.getNodeId = options.getNodeId;
    this.onStatsChange = options.onStatsChange;
  }

  registerTool(toolName: string, handler: TaskHandler): void {
    this.registry.register(toolName, handler);
    this.logger.info(`Registered tool handler`, { toolName });
  }

  unregisterTool(toolName: string): void {
    this.registry.unregister(toolName);
    this.logger.info(`Unregistered tool handler`, { toolName });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.queue.length = 0;
    this.notifyStats();
  }

  getStats(): TaskOrchestratorStats {
    return {
      activeTasks: this.activeCount,
      queuedTasks: this.queue.length,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed
    };
  }

  handleAssignment(assignment: TaskAssignment): void {
    if (this.stopping) {
      this.logger.warn('Ignoring task assignment because orchestrator is stopping', {
        taskId: assignment.taskId
      });
      return;
    }

    const pending: PendingTask = {
      assignment,
      createdAt: Date.now(),
      timeoutMs: assignment.timeout ?? this.defaultTimeoutMs,
      resolve: () => {
        this.processQueue();
      }
    };

    this.queue.push(pending);
    this.queue.sort((a, b) => {
      const priorityA = a.assignment.priority ?? 5;
      const priorityB = b.assignment.priority ?? 5;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      return a.createdAt - b.createdAt;
    });

    this.logger.info('Task queued', {
      taskId: assignment.taskId,
      toolName: assignment.toolName,
      priority: assignment.priority
    });

    this.notifyStats();
    this.processQueue();
  }

  private processQueue(): void {
    if (this.activeCount >= this.maxConcurrent) {
      return;
    }
    const next = this.queue.shift();
    if (!next) {
      return;
    }

    this.executeTask(next).finally(() => {
      next.resolve();
    });
  }

  private async executeTask(pending: PendingTask): Promise<void> {
    const { assignment } = pending;
    this.activeCount += 1;
    this.notifyStats();

    const handler = this.registry.get(assignment.toolName);
    if (!handler) {
      this.logger.warn('No handler registered for tool', {
        taskId: assignment.taskId,
        toolName: assignment.toolName
      });
      this.sendFailure(assignment, 'capability_not_supported', 'No handler registered for tool', 0);
      this.activeCount -= 1;
      this.totalFailed += 1;
      this.notifyStats();
      this.processQueue();
      return;
    }

    const abortController = new AbortController();
    const timeoutTimer = setTimeout(() => {
      abortController.abort();
    }, pending.timeoutMs);

    const startTime = Date.now();
    try {
      const context: TaskContext = {
        logger: this.logger.child({ taskId: assignment.taskId }),
        assignment,
        signal: abortController.signal
      };

      const result = await handler(context);
      clearTimeout(timeoutTimer);
      this.sendSuccess(assignment, result, Date.now() - startTime);
      this.totalCompleted += 1;
      this.notifyStats();
    } catch (error) {
      clearTimeout(timeoutTimer);
      if ((error as Error).name === 'AbortError') {
        this.sendFailure(assignment, 'task_timeout', 'Task execution timed out', Date.now() - startTime);
        this.logger.warn('Task execution timed out', { taskId: assignment.taskId });
      } else {
        this.sendFailure(assignment, 'task_execution_failed', (error as Error).message, Date.now() - startTime);
        this.logger.error('Task execution error', {
          taskId: assignment.taskId,
          error: (error as Error).message
        });
      }
      this.totalFailed += 1;
      this.notifyStats();
    } finally {
      this.activeCount -= 1;
      this.notifyStats();
      this.processQueue();
    }

    const executionTime = Date.now() - startTime;
    this.logger.info('Task finished', {
      taskId: assignment.taskId,
      executionTime
    });
  }

  private sendSuccess(assignment: TaskAssignment, result: TaskResult, executionTime: number): void {
    const nodeId = this.getNodeId();
    const payloadResult = typeof result.result === 'undefined' ? result : result.result;
    this.sendResult({
      type: 'task_result',
      data: {
        taskId: assignment.taskId,
        nodeId: nodeId || assignment.nodeId,
        success: true,
        result: payloadResult,
        executionTime
      }
    });
  }

  private notifyStats(): void {
    if (this.onStatsChange) {
      this.onStatsChange(this.getStats());
    }
  }

  private sendFailure(assignment: TaskAssignment, code: string, message: string, executionTime: number): void {
    const nodeId = this.getNodeId();
    this.sendResult({
      type: 'task_result',
      data: {
        taskId: assignment.taskId,
        nodeId: nodeId || assignment.nodeId,
        success: false,
        error: {
          code,
          message
        },
        executionTime
      }
    });
  }
}

