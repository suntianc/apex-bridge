/**
 * Task Queue API Routes
 *
 * 任务队列管理的 REST API 路由
 *
 * 路由:
 * - GET  /api/task-queue/stats           - 获取队列统计
 * - GET  /api/task-queue/scheduler/status - 获取调度器状态
 * - POST /api/task-queue/trigger          - 手动触发执行
 * - POST /api/task-queue/cleanup          - 清理旧任务
 * - POST /api/task-queue/reset-stuck      - 重置卡住的任务
 */

import { Router } from 'express';
import { TaskQueueController } from '../controllers/TaskQueueController';
import { PlaybookTaskQueue } from '../../services/PlaybookTaskQueue';
import { IdleScheduler } from '../../services/IdleScheduler';

/**
 * 创建任务队列路由
 *
 * @param taskQueue PlaybookTaskQueue 实例
 * @param scheduler IdleScheduler 实例
 * @returns Express Router
 */
export function createTaskQueueRoutes(
  taskQueue: PlaybookTaskQueue,
  scheduler: IdleScheduler
): Router {
  const controller = new TaskQueueController(taskQueue, scheduler);
  return controller.getRouter();
}

export default createTaskQueueRoutes;
