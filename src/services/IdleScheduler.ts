/**
 * 闲时调度器（空实现，Playbook功能已移除）

 * 职责:
 * - 监控 CPU 使用率
 * - 在系统空闲时执行任务队列中的任务
 * - 避免影响主业务性能
 *
 * 注意: 此文件保留但 PlaybookTaskQueue 已移除，
 * 调度器不再执行任何任务。
 */

import os from "os";
import { TaskType, TaskHandler, IdleSchedulerOptions } from "../types/task-queue";
import { logger } from "../utils/logger";

export class IdleScheduler {
  private interval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isExecuting: boolean = false;
  private cpuThreshold: number;
  private checkIntervalMs: number;
  private taskHandlers: Map<TaskType, TaskHandler>;

  constructor(options: IdleSchedulerOptions = {}) {
    this.cpuThreshold = options.cpuThreshold ?? 0.3;
    this.checkIntervalMs = options.checkIntervalMs ?? 30000;
    this.taskHandlers = new Map();
    logger.info("[IdleScheduler] Initialized (no-op, Playbook removed)");
  }

  /**
   * 注册任务处理器
   */
  registerHandler(taskType: TaskType, handler: TaskHandler): void {
    this.taskHandlers.set(taskType, handler);
    logger.debug(`[IdleScheduler] Handler registered for task type: ${taskType} (not used)`);
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.isRunning) {
      logger.warn("[IdleScheduler] Scheduler is already running");
      return;
    }

    this.isRunning = true;
    logger.info("[IdleScheduler] Started (no-op mode)");
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
    logger.info("[IdleScheduler] Stopped");
  }

  /**
   * 手动触发执行（前端调用）
   */
  async triggerManual(limit: number = 10): Promise<number> {
    logger.info("[IdleScheduler] Manual trigger called (no tasks to process)");
    return 0;
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
      currentCpuLoad: loadAvg[0] / cpuCount,
    };
  }
}
