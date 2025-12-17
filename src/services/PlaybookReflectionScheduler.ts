/**
 * Playbook 反思调度器
 *
 * 职责:
 * - 定期触发批量 Playbook 提取
 * - 每天凌晨或应用启动时执行
 */

import { PlaybookTaskQueue } from './PlaybookTaskQueue';
import { TaskType, TaskPriority } from '../types/task-queue';
import { logger } from '../utils/logger';

/**
 * Playbook 反思调度器
 *
 * 负责定时触发批量 Playbook 提取任务
 * - 应用启动时立即执行一次
 * - 每天凌晨 2 点定时执行
 */
export class PlaybookReflectionScheduler {
  private taskQueue: PlaybookTaskQueue;
  private interval: NodeJS.Timeout | null = null;

  constructor(taskQueue: PlaybookTaskQueue) {
    this.taskQueue = taskQueue;
  }

  /**
   * 启动调度器
   */
  start(): void {
    logger.info('[ReflectionScheduler] 调度器已启动');

    // 应用启动时立即执行一次
    this.triggerBatchExtraction();

    // 每天凌晨 2 点执行（如果应用在运行）
    const now = new Date();
    const next2AM = new Date(now);
    next2AM.setHours(2, 0, 0, 0);
    if (next2AM <= now) {
      next2AM.setDate(next2AM.getDate() + 1);
    }

    const delay = next2AM.getTime() - now.getTime();

    setTimeout(() => {
      this.triggerBatchExtraction();

      // 之后每 24 小时执行一次
      this.interval = setInterval(() => {
        this.triggerBatchExtraction();
      }, 24 * 60 * 60 * 1000);
    }, delay);

    logger.info('[ReflectionScheduler] 下次执行时间已设置');
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    logger.info('[ReflectionScheduler] 调度器已停止');
  }

  /**
   * 触发批量提取
   */
  private async triggerBatchExtraction(): Promise<void> {
    try {
      await this.taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        priority: TaskPriority.NORMAL,
        payload: {
          mode: 'batch',
          triggered_by: 'scheduler',
          timestamp: Date.now()
        }
      });

      logger.info('[ReflectionScheduler] 批量提取任务已入队');
    } catch (error: any) {
      logger.error('[ReflectionScheduler] 入队失败', error);
    }
  }
}
