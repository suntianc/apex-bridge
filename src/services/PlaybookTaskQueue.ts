/**
 * Playbook 任务队列管理器
 *
 * 职责:
 * - 任务入队/出队
 * - 任务状态管理
 * - 优先级调度
 * - 重试机制
 *
 * 使用 SQLite 持久化存储任务，支持关机重启后恢复
 */

import crypto from 'crypto';
import Database from 'better-sqlite3';
import {
  ReflectionTask,
  TaskType,
  TaskStatus,
  TaskPriority,
  TaskQueueStats,
  EnqueueTaskParams,
  ReflectionQueueRow
} from '../types/task-queue';
import { logger } from '../utils/logger';

export class PlaybookTaskQueue {
  private db: Database.Database;
  private maxRetries: number;

  constructor(db: Database.Database, maxRetries: number = 3) {
    this.db = db;
    this.maxRetries = maxRetries;
    this.initializeDatabase();
  }

  /**
   * 初始化数据库表结构
   */
  private initializeDatabase(): void {
    const migrationSQL = `
      CREATE TABLE IF NOT EXISTS reflection_queue (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        trajectory_id TEXT,
        status TEXT DEFAULT 'PENDING',
        priority INTEGER DEFAULT 0,
        payload TEXT,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        scheduled_at TIMESTAMP,
        completed_at TIMESTAMP,
        CHECK (task_type IN ('GENERATE', 'REFLECT', 'CURATE')),
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
        CHECK (priority >= 0 AND priority <= 2)
      );

      CREATE INDEX IF NOT EXISTS idx_reflection_queue_status
        ON reflection_queue(status);

      CREATE INDEX IF NOT EXISTS idx_reflection_queue_priority
        ON reflection_queue(priority DESC, created_at ASC);

      CREATE INDEX IF NOT EXISTS idx_reflection_queue_trajectory
        ON reflection_queue(trajectory_id);
    `;

    this.db.exec(migrationSQL);
    logger.info('[PlaybookTaskQueue] Database initialized');
  }

  /**
   * 入队任务
   */
  async enqueue(params: EnqueueTaskParams): Promise<string> {
    const taskId = crypto.randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO reflection_queue (
        id, task_type, trajectory_id, priority, payload, scheduled_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      taskId,
      params.task_type,
      params.trajectory_id || null,
      params.priority ?? TaskPriority.NORMAL,
      params.payload ? JSON.stringify(params.payload) : null,
      params.scheduled_at?.toISOString() || null
    );

    logger.info(`[PlaybookTaskQueue] Task enqueued: ${taskId} (${params.task_type})`);
    return taskId;
  }

  /**
   * 出队任务（获取下一批待处理任务）
   * 按优先级降序、创建时间升序排列
   */
  async dequeue(limit: number = 1): Promise<ReflectionTask[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM reflection_queue
      WHERE status = 'PENDING'
        AND (scheduled_at IS NULL OR scheduled_at <= datetime('now'))
        AND retry_count < ?
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `);

    const rows = stmt.all(this.maxRetries, limit) as ReflectionQueueRow[];

    return rows.map(row => this.mapRowToTask(row));
  }

  /**
   * 标记任务为处理中
   */
  async markProcessing(taskId: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE reflection_queue
      SET status = 'PROCESSING', updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(taskId);
    logger.debug(`[PlaybookTaskQueue] Task marked as processing: ${taskId}`);
  }

  /**
   * 标记任务为完成
   */
  async markCompleted(taskId: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE reflection_queue
      SET status = 'COMPLETED',
          completed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(taskId);
    logger.info(`[PlaybookTaskQueue] Task completed: ${taskId}`);
  }

  /**
   * 标记任务为失败
   * 如果未超过最大重试次数，自动重新入队（5分钟后重试）
   */
  async markFailed(taskId: string, errorMessage: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE reflection_queue
      SET status = 'FAILED',
          error_message = ?,
          retry_count = retry_count + 1,
          updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(errorMessage, taskId);

    // 检查是否需要重试
    const task = await this.getTaskById(taskId);
    if (task && task.retry_count < this.maxRetries) {
      logger.warn(
        `[PlaybookTaskQueue] Task failed, scheduling retry (${task.retry_count}/${this.maxRetries}): ${taskId}`
      );

      const retryStmt = this.db.prepare(`
        UPDATE reflection_queue
        SET status = 'PENDING', scheduled_at = datetime('now', '+5 minutes')
        WHERE id = ?
      `);
      retryStmt.run(taskId);
    } else {
      logger.error(`[PlaybookTaskQueue] Task failed and exceeded max retries: ${taskId}`);
    }
  }

  /**
   * 获取任务统计信息
   */
  async getStats(): Promise<TaskQueueStats> {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM reflection_queue');
    const total = (totalStmt.get() as { count: number }).count;

    const statusStmt = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM reflection_queue
      GROUP BY status
    `);
    const statusCounts = statusStmt.all() as { status: string; count: number }[];

    const typeStmt = this.db.prepare(`
      SELECT task_type, COUNT(*) as count
      FROM reflection_queue
      WHERE status IN ('PENDING', 'PROCESSING')
      GROUP BY task_type
    `);
    const typeCounts = typeStmt.all() as { task_type: string; count: number }[];

    const stats: TaskQueueStats = {
      total,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      by_type: {
        [TaskType.GENERATE]: 0,
        [TaskType.REFLECT]: 0,
        [TaskType.CURATE]: 0
      }
    };

    statusCounts.forEach(row => {
      const key = row.status.toLowerCase();
      switch (key) {
        case 'pending':
          stats.pending = row.count;
          break;
        case 'processing':
          stats.processing = row.count;
          break;
        case 'completed':
          stats.completed = row.count;
          break;
        case 'failed':
          stats.failed = row.count;
          break;
      }
    });

    typeCounts.forEach(row => {
      if (row.task_type in stats.by_type) {
        stats.by_type[row.task_type as TaskType] = row.count;
      }
    });

    return stats;
  }

  /**
   * 根据 ID 获取任务
   */
  async getTaskById(taskId: string): Promise<ReflectionTask | null> {
    const stmt = this.db.prepare('SELECT * FROM reflection_queue WHERE id = ?');
    const row = stmt.get(taskId) as ReflectionQueueRow | undefined;

    return row ? this.mapRowToTask(row) : null;
  }

  /**
   * 清理已完成的旧任务
   * @param daysToKeep 保留天数（默认 30 天）
   * @returns 删除的任务数量
   */
  async cleanup(daysToKeep: number = 30): Promise<number> {
    const stmt = this.db.prepare(`
      DELETE FROM reflection_queue
      WHERE status = 'COMPLETED'
        AND completed_at < datetime('now', '-' || ? || ' days')
    `);

    const result = stmt.run(daysToKeep);
    const deletedCount = result.changes;

    if (deletedCount > 0) {
      logger.info(`[PlaybookTaskQueue] Cleaned up ${deletedCount} old tasks`);
    }

    return deletedCount;
  }

  /**
   * 获取指定状态的任务列表
   */
  async getTasksByStatus(status: TaskStatus, limit: number = 100): Promise<ReflectionTask[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM reflection_queue
      WHERE status = ?
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `);

    const rows = stmt.all(status, limit) as ReflectionQueueRow[];
    return rows.map(row => this.mapRowToTask(row));
  }

  /**
   * 重置卡在 PROCESSING 状态的任务
   * 用于处理因异常中断导致的任务状态不一致
   */
  async resetStuckTasks(minutesThreshold: number = 30): Promise<number> {
    const stmt = this.db.prepare(`
      UPDATE reflection_queue
      SET status = 'PENDING',
          updated_at = datetime('now')
      WHERE status = 'PROCESSING'
        AND updated_at < datetime('now', '-' || ? || ' minutes')
    `);

    const result = stmt.run(minutesThreshold);
    const resetCount = result.changes;

    if (resetCount > 0) {
      logger.warn(`[PlaybookTaskQueue] Reset ${resetCount} stuck tasks`);
    }

    return resetCount;
  }

  /**
   * 映射数据库行到 TypeScript 对象
   */
  private mapRowToTask(row: ReflectionQueueRow): ReflectionTask {
    return {
      id: row.id,
      task_type: row.task_type as TaskType,
      trajectory_id: row.trajectory_id || undefined,
      status: row.status as TaskStatus,
      priority: row.priority as TaskPriority,
      payload: row.payload ? JSON.parse(row.payload) : undefined,
      error_message: row.error_message || undefined,
      retry_count: row.retry_count,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      scheduled_at: row.scheduled_at ? new Date(row.scheduled_at) : undefined,
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined
    };
  }
}
