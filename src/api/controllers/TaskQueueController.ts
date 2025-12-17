/**
 * TaskQueue API Controller
 *
 * 任务队列管理的 REST API 端点
 * - 获取队列统计信息
 * - 手动触发任务执行
 * - 清理旧任务
 */

import { Router, Request, Response } from 'express';
import { PlaybookTaskQueue } from '../../services/PlaybookTaskQueue';
import { IdleScheduler } from '../../services/IdleScheduler';
import { logger } from '../../utils/logger';

export class TaskQueueController {
  private router: Router;
  private taskQueue: PlaybookTaskQueue;
  private scheduler: IdleScheduler;

  constructor(taskQueue: PlaybookTaskQueue, scheduler: IdleScheduler) {
    this.router = Router();
    this.taskQueue = taskQueue;
    this.scheduler = scheduler;
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // 获取队列统计
    this.router.get('/stats', this.getStats.bind(this));

    // 获取调度器状态
    this.router.get('/scheduler/status', this.getSchedulerStatus.bind(this));

    // 手动触发执行
    this.router.post('/trigger', this.triggerManual.bind(this));

    // 清理旧任务
    this.router.post('/cleanup', this.cleanup.bind(this));

    // 重置卡住的任务
    this.router.post('/reset-stuck', this.resetStuck.bind(this));
  }

  /**
   * GET /api/task-queue/stats
   * 获取任务队列统计信息
   */
  private async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.taskQueue.getStats();

      res.json({
        success: true,
        data: stats,
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[TaskQueue API] Failed to get stats:', error);

      res.status(500).json({
        success: false,
        error: {
          code: 'GET_STATS_FAILED',
          message: errorMessage
        }
      });
    }
  }

  /**
   * GET /api/task-queue/scheduler/status
   * 获取调度器状态
   */
  private async getSchedulerStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = this.scheduler.getStatus();

      res.json({
        success: true,
        data: status,
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[TaskQueue API] Failed to get scheduler status:', error);

      res.status(500).json({
        success: false,
        error: {
          code: 'GET_SCHEDULER_STATUS_FAILED',
          message: errorMessage
        }
      });
    }
  }

  /**
   * POST /api/task-queue/trigger
   * 手动触发任务执行
   *
   * Body: { limit?: number }
   */
  private async triggerManual(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 10 } = req.body;

      // 验证 limit 参数
      if (typeof limit !== 'number' || limit < 1 || limit > 100) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_LIMIT',
            message: 'Limit must be a number between 1 and 100'
          }
        });
        return;
      }

      const completedCount = await this.scheduler.triggerManual(limit);

      res.json({
        success: true,
        data: {
          completed: completedCount,
          requested: limit,
          message: `Successfully executed ${completedCount} tasks`
        }
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[TaskQueue API] Failed to trigger manual execution:', error);

      res.status(500).json({
        success: false,
        error: {
          code: 'TRIGGER_FAILED',
          message: errorMessage
        }
      });
    }
  }

  /**
   * POST /api/task-queue/cleanup
   * 清理旧的已完成任务
   *
   * Body: { days?: number }
   */
  private async cleanup(req: Request, res: Response): Promise<void> {
    try {
      const { days = 30 } = req.body;

      // 验证 days 参数
      if (typeof days !== 'number' || days < 1 || days > 365) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DAYS',
            message: 'Days must be a number between 1 and 365'
          }
        });
        return;
      }

      const deletedCount = await this.taskQueue.cleanup(days);

      res.json({
        success: true,
        data: {
          deleted: deletedCount,
          retentionDays: days,
          message: `Cleaned up ${deletedCount} old tasks`
        }
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[TaskQueue API] Failed to cleanup tasks:', error);

      res.status(500).json({
        success: false,
        error: {
          code: 'CLEANUP_FAILED',
          message: errorMessage
        }
      });
    }
  }

  /**
   * POST /api/task-queue/reset-stuck
   * 重置卡在 PROCESSING 状态的任务
   *
   * Body: { minutes?: number }
   */
  private async resetStuck(req: Request, res: Response): Promise<void> {
    try {
      const { minutes = 30 } = req.body;

      // 验证 minutes 参数
      if (typeof minutes !== 'number' || minutes < 5 || minutes > 1440) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_MINUTES',
            message: 'Minutes must be a number between 5 and 1440'
          }
        });
        return;
      }

      const resetCount = await this.taskQueue.resetStuckTasks(minutes);

      res.json({
        success: true,
        data: {
          reset: resetCount,
          thresholdMinutes: minutes,
          message: `Reset ${resetCount} stuck tasks`
        }
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[TaskQueue API] Failed to reset stuck tasks:', error);

      res.status(500).json({
        success: false,
        error: {
          code: 'RESET_STUCK_FAILED',
          message: errorMessage
        }
      });
    }
  }

  /**
   * 获取路由实例
   */
  getRouter(): Router {
    return this.router;
  }
}
