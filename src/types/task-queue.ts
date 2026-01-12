/**
 * Task Queue Types - Playbook 反思任务队列类型定义
 *
 * 用于支持 Stage 0.5: 任务队列基础设施
 * - 事件驱动 + SQLite 持久化任务队列 + 闲时调度模式
 */

/**
 * 任务类型枚举
 */
export enum TaskType {
  /** 生成 Playbook（从成功 Trajectory） */
  GENERATE = "GENERATE",

  /** 反思失败模式（从失败 Trajectory） */
  REFLECT = "REFLECT",

  /** 维护知识库（去重/归档） */
  CURATE = "CURATE",
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  /** 待处理 */
  PENDING = "PENDING",

  /** 处理中 */
  PROCESSING = "PROCESSING",

  /** 已完成 */
  COMPLETED = "COMPLETED",

  /** 失败 */
  FAILED = "FAILED",
}

/**
 * 任务优先级
 */
export enum TaskPriority {
  /** 普通优先级 */
  NORMAL = 0,

  /** 高优先级（失败任务反思） */
  HIGH = 1,

  /** 紧急（手动触发） */
  URGENT = 2,
}

/**
 * 反思任务实体
 */
export interface ReflectionTask {
  id: string;
  task_type: TaskType;
  trajectory_id?: string;
  status: TaskStatus;
  priority: TaskPriority;
  payload?: Record<string, unknown>;
  error_message?: string;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
  scheduled_at?: Date;
  completed_at?: Date;
}

/**
 * 任务统计信息
 */
export interface TaskQueueStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  by_type: {
    [key in TaskType]: number;
  };
}

/**
 * 入队任务参数
 */
export interface EnqueueTaskParams {
  task_type: TaskType;
  trajectory_id?: string;
  priority?: TaskPriority;
  payload?: Record<string, unknown>;
  scheduled_at?: Date;
}

/**
 * 任务处理器函数类型
 */
export type TaskHandler = (task: ReflectionTask) => Promise<void>;

/**
 * 闲时调度器配置
 */
export interface IdleSchedulerOptions {
  /** CPU 使用率阈值（默认 0.3 即 30%） */
  cpuThreshold?: number;
  /** 检查间隔（毫秒，默认 30000） */
  checkIntervalMs?: number;
}

/**
 * SQLite 数据库行映射类型
 */
export interface ReflectionQueueRow {
  id: string;
  task_type: string;
  trajectory_id: string | null;
  status: string;
  priority: number;
  payload: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  scheduled_at: string | null;
  completed_at: string | null;
}
