/**
 * 闲时调度器
 *
 * 职责:
 * - 监控 CPU 使用率
 * - 在系统空闲时执行任务队列中的任务
 * - 避免影响主业务性能
 *
 * 特点:
 * - 使用 os.loadavg() 监控 CPU 负载
 * - 支持手动触发执行
 * - 可注册不同类型任务的处理器
 */

import os from 'os';
import { PlaybookTaskQueue } from './PlaybookTaskQueue';
import { TaskType, TaskHandler, IdleSchedulerOptions, ReflectionTask } from '../types/task-queue';
import { logger } from '../utils/logger';

export class IdleScheduler {
  private taskQueue: PlaybookTaskQueue;
  private interval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isExecuting: boolean = false;
  private cpuThreshold: number;
  private checkIntervalMs: number;
  private taskHandlers: Map<TaskType, TaskHandler>;

  constructor(
    taskQueue: PlaybookTaskQueue,
    options: IdleSchedulerOptions = {}
  ) {
    this.taskQueue = taskQueue;
    this.cpuThreshold = options.cpuThreshold ?? 0.3;
    this.checkIntervalMs = options.checkIntervalMs ?? 30000;
    this.taskHandlers = new Map();
  }

  /**
   * 注册任务处理器
   */
  registerHandler(taskType: TaskType, handler: TaskHandler): void {
    this.taskHandlers.set(taskType, handler);
    logger.debug(`[IdleScheduler] Handler registered for task type: ${taskType}`);
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[IdleScheduler] Scheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('[IdleScheduler] Scheduler started');

    // 启动时重置卡住的任务
    this.taskQueue.resetStuckTasks(30).catch(err => {
      logger.error('[IdleScheduler] Failed to reset stuck tasks:', err);
    });

    // 立即执行一次（应用启动时检查待处理任务）
    this.checkAndExecuteTasks();

    // 定期检查
    this.interval = setInterval(() => {
      this.checkAndExecuteTasks();
    }, this.checkIntervalMs);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isRunning = false;
    logger.info('[IdleScheduler] Scheduler stopped');
  }

  /**
   * 手动触发执行（前端调用）
   * @param limit 最多处理的任务数量
   * @returns 成功完成的任务数量
   */
  async triggerManual(limit: number = 10): Promise<number> {
    logger.info(`[IdleScheduler] Manual trigger: processing up to ${limit} tasks`);
    return await this.executeTasks(limit, true);
  }

  /**
   * 检查并执行任务
   */
  private async checkAndExecuteTasks(): Promise<void> {
    // 防止并发执行
    if (this.isExecuting) {
      logger.debug('[IdleScheduler] Already executing, skip this check');
      return;
    }

    // 检查 CPU 是否空闲
    if (!this.isCpuIdle()) {
      logger.debug('[IdleScheduler] CPU busy, skip task execution');
      return;
    }

    // 执行任务
    await this.executeTasks(5, false); // 每次最多执行 5 个任务
  }

  /**
   * 执行任务
   */
  private async executeTasks(limit: number, isManual: boolean): Promise<number> {
    this.isExecuting = true;

    try {
      const tasks = await this.taskQueue.dequeue(limit);

      if (tasks.length === 0) {
        logger.debug('[IdleScheduler] No pending tasks');
        return 0;
      }

      logger.info(
        `[IdleScheduler] Starting ${tasks.length} tasks (manual: ${isManual})`
      );

      let completedCount = 0;

      for (const task of tasks) {
        // 如果不是手动触发，在每个任务前检查 CPU
        if (!isManual && !this.isCpuIdle()) {
          logger.info('[IdleScheduler] CPU became busy, pausing execution');
          break;
        }

        try {
          // 标记为处理中
          await this.taskQueue.markProcessing(task.id);

          // 获取对应的处理器
          const handler = this.taskHandlers.get(task.task_type);
          if (!handler) {
            throw new Error(`No handler registered for task type: ${task.task_type}`);
          }

          // 执行任务
          await handler(task);

          // 标记为完成
          await this.taskQueue.markCompleted(task.id);
          completedCount++;

        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`[IdleScheduler] Task execution failed: ${task.id}`, error);
          await this.taskQueue.markFailed(task.id, errorMessage);
        }
      }

      logger.info(`[IdleScheduler] Completed ${completedCount}/${tasks.length} tasks`);
      return completedCount;

    } catch (error: unknown) {
      logger.error('[IdleScheduler] Error during task execution', error);
      return 0;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * 检查 CPU 是否空闲
   * 使用 1 分钟平均负载 / CPU 核心数
   */
  private isCpuIdle(): boolean {
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;

    // loadavg[0] 是 1 分钟平均负载
    // 除以 CPU 核心数得到平均每核心负载
    const avgLoad = loadAvg[0] / cpuCount;

    const isIdle = avgLoad < this.cpuThreshold;
    logger.debug(
      `[IdleScheduler] CPU load: ${(avgLoad * 100).toFixed(1)}% (threshold: ${this.cpuThreshold * 100}%), idle: ${isIdle}`
    );

    return isIdle;
  }

  /**
   * 获取调度器状态
   */
  getStatus(): {
    isRunning: boolean;
    isExecuting: boolean;
    cpuThreshold: number;
    checkIntervalMs: number;
    registeredHandlers: TaskType[];
    currentCpuLoad: number;
  } {
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;

    return {
      isRunning: this.isRunning,
      isExecuting: this.isExecuting,
      cpuThreshold: this.cpuThreshold,
      checkIntervalMs: this.checkIntervalMs,
      registeredHandlers: Array.from(this.taskHandlers.keys()),
      currentCpuLoad: loadAvg[0] / cpuCount
    };
  }
}
