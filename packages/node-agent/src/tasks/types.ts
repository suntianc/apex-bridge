import { Logger } from 'winston';

export interface TaskAssignment {
  taskId: string;
  nodeId: string;
  toolName: string;
  capability?: string;
  toolArgs: Record<string, unknown>;
  timeout?: number;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface TaskContext {
  logger: Logger;
  assignment: TaskAssignment;
  signal: AbortSignal;
}

export type TaskHandler = (context: TaskContext) => Promise<TaskResult>;

export interface TaskOrchestratorStats {
  activeTasks: number;
  queuedTasks: number;
  totalCompleted: number;
  totalFailed: number;
}

export interface TaskResultMessage {
  type: 'task_result';
  data: {
    taskId: string;
    nodeId: string;
    success: boolean;
    result?: unknown;
    error?: {
      code: string;
      message: string;
      details?: unknown;
    };
    executionTime?: number;
  };
}

