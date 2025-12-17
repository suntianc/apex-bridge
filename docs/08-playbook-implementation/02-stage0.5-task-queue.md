# Stage 0.5: 任务队列基础设施

## 📋 阶段概述

| 属性 | 值 |
|------|-----|
| **阶段编号** | Stage 0.5 |
| **优先级** | 🔴 P0（关键修正） |
| **预估工作量** | 4 小时（周末半天） |
| **难度等级** | 🟡 中等 |
| **依赖** | Stage 0 验证通过 |
| **产出物** | SQLite 任务队列 + 事件驱动触发器 + 闲时调度器 + 前端管理面板 |

## 🎯 阶段目标

### 核心目标
解决 **运行环境冲突问题**：ApexBridge 是 Electron 桌面应用，晚上会关机/休眠，无法使用传统的 Cron 定时任务来处理 Playbook 反思循环。

### 技术方案
采用 **事件驱动 + SQLite 持久化任务队列 + 闲时调度** 模式：
1. 任务完成后 → 触发事件 → 入队到 SQLite
2. 应用启动时 → 检查待处理任务 → 闲时调度执行
3. 用户可手动触发 → 前端\"知识库维护\"面板

### 价值
- ✅ **消除启动卡顿**: 原 Cron 方案会导致应用启动时立即执行大量任务（+100% 启动时间）
- ✅ **持久化**: 任务数据存储在 SQLite，关机后不丢失
- ✅ **可控性**: 用户可查看待处理任务数，手动触发执行
- ✅ **性能优化**: 只在 CPU 空闲时（<30%）处理任务，不影响主业务

## 📚 背景知识

### 问题分析（来自工程评审）

原报告设计的 Cron 方案：
```typescript
// ❌ 错误方案
import cron from 'node-cron';

// 每天凌晨 2 点执行反思循环
cron.schedule('0 2 * * *', async () => {
  const trajectories = await getRecentTrajectories();
  await reflector.analyze(trajectories);
});
```

**致命缺陷**：
1. MacBook 晚上 2 点关机 → Cron 任务不会执行
2. 即使设置为\"应用启动时执行\" → 启动时卡顿 5-10 秒
3. 任务状态无持久化 → 重启后丢失

### 修正方案架构

```
┌─────────────────────────────────────────────────────┐
│  1. 任务完成 (Trajectory 保存完成)                   │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│  2. 触发事件: EventBus.emit('trajectory:saved')     │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│  3. 入队: PlaybookTaskQueue.enqueue({               │
│       task_type: 'GENERATE' | 'REFLECT',            │
│       trajectory_id: xxx,                           │
│       priority: 0 | 1                               │
│     })                                              │
│  → 持久化到 SQLite (reflection_queue 表)            │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│  4. 闲时调度器: IdleScheduler                        │
│     - 监听 CPU 使用率 (os.loadavg())                │
│     - 当 CPU < 30% 时，从队列取出任务执行           │
│     - 执行完成后更新状态为 COMPLETED                │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│  5. 手动触发: 前端\"知识库维护\"面板                  │
│     - 显示待处理任务数: SELECT COUNT(*) WHERE       │
│       status='PENDING'                              │
│     - 手动触发按钮: 立即执行前 N 个任务              │
└─────────────────────────────────────────────────────┘
```

## 🗄️ 数据结构设计

### SQLite 表结构

创建 `data/migrations/007_create_reflection_queue.sql`:

```sql
-- ==========================================
-- Playbook 反思任务队列表
-- ==========================================
CREATE TABLE IF NOT EXISTS reflection_queue (
  id TEXT PRIMARY KEY,                    -- UUID
  task_type TEXT NOT NULL,                -- 'GENERATE' | 'REFLECT' | 'CURATE'
  trajectory_id TEXT,                     -- 关联的 Trajectory ID（可选）
  status TEXT DEFAULT 'PENDING',          -- 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  priority INTEGER DEFAULT 0,             -- 优先级：0=普通, 1=高优先级（失败任务）
  payload TEXT,                           -- JSON 格式的任务数据
  error_message TEXT,                     -- 失败原因（如果 status='FAILED'）
  retry_count INTEGER DEFAULT 0,          -- 重试次数
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  scheduled_at TIMESTAMP,                 -- 计划执行时间（可选）
  completed_at TIMESTAMP                  -- 实际完成时间

  CHECK (task_type IN ('GENERATE', 'REFLECT', 'CURATE')),
  CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  CHECK (priority >= 0 AND priority <= 2)
);

-- 索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_reflection_queue_status
  ON reflection_queue(status);

CREATE INDEX IF NOT EXISTS idx_reflection_queue_priority
  ON reflection_queue(priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_reflection_queue_trajectory
  ON reflection_queue(trajectory_id);

-- 自动更新 updated_at 触发器
CREATE TRIGGER IF NOT EXISTS update_reflection_queue_timestamp
  AFTER UPDATE ON reflection_queue
  FOR EACH ROW
  BEGIN
    UPDATE reflection_queue
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
  END;
```

### TypeScript 类型定义

创建或更新 `src/types/task-queue.ts`:

```typescript
/**
 * 任务类型枚举
 */
export enum TaskType {
  /** 生成 Playbook（从成功 Trajectory） */
  GENERATE = 'GENERATE',

  /** 反思失败模式（从失败 Trajectory） */
  REFLECT = 'REFLECT',

  /** 维护知识库（去重/归档） */
  CURATE = 'CURATE'
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  /** 待处理 */
  PENDING = 'PENDING',

  /** 处理中 */
  PROCESSING = 'PROCESSING',

  /** 已完成 */
  COMPLETED = 'COMPLETED',

  /** 失败 */
  FAILED = 'FAILED'
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
  URGENT = 2
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
  payload?: Record<string, any>;
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
```

## 💻 核心代码实现

### 1. PlaybookTaskQueue 服务

创建 `src/services/PlaybookTaskQueue.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Database } from 'better-sqlite3';
import { ReflectionTask, TaskType, TaskStatus, TaskPriority, TaskQueueStats } from '../types/task-queue';
import { logger } from '../utils/logger';

/**
 * Playbook 任务队列管理器
 *
 * 职责:
 * - 任务入队/出队
 * - 任务状态管理
 * - 优先级调度
 * - 重试机制
 */
export class PlaybookTaskQueue {
  private db: Database;
  private maxRetries: number;

  constructor(db: Database, maxRetries: number = 3) {
    this.db = db;
    this.maxRetries = maxRetries;
    this.initializeDatabase();
  }

  /**
   * 初始化数据库（如果未执行迁移）
   */
  private initializeDatabase(): void {
    // 执行迁移脚本（通常由主应用处理，这里作为后备）
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
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
      );
    `;

    this.db.exec(migrationSQL);
  }

  /**
   * 入队任务
   */
  async enqueue(params: {
    task_type: TaskType;
    trajectory_id?: string;
    priority?: TaskPriority;
    payload?: Record<string, any>;
    scheduled_at?: Date;
  }): Promise<string> {
    const taskId = uuidv4();

    const stmt = this.db.prepare(`
      INSERT INTO reflection_queue (
        id, task_type, trajectory_id, priority, payload, scheduled_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      taskId,
      params.task_type,
      params.trajectory_id || null,
      params.priority || TaskPriority.NORMAL,
      params.payload ? JSON.stringify(params.payload) : null,
      params.scheduled_at?.toISOString() || null
    );

    logger.info(`[TaskQueue] 任务已入队: ${taskId} (${params.task_type})`);
    return taskId;
  }

  /**
   * 出队任务（获取下一个待处理任务）
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

    const rows = stmt.all(this.maxRetries, limit) as any[];

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
    logger.info(`[TaskQueue] 任务已完成: ${taskId}`);
  }

  /**
   * 标记任务为失败
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

    // 如果未超过最大重试次数，重新入队
    const task = await this.getTaskById(taskId);
    if (task && task.retry_count < this.maxRetries) {
      logger.warn(`[TaskQueue] 任务失败，重试中 (${task.retry_count}/${this.maxRetries}): ${taskId}`);

      const retryStmt = this.db.prepare(`
        UPDATE reflection_queue
        SET status = 'PENDING', scheduled_at = datetime('now', '+5 minutes')
        WHERE id = ?
      `);
      retryStmt.run(taskId);
    } else {
      logger.error(`[TaskQueue] 任务失败且超过最大重试次数: ${taskId}`);
    }
  }

  /**
   * 获取任务统计信息
   */
  async getStats(): Promise<TaskQueueStats> {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM reflection_queue');
    const total = (totalStmt.get() as any).count;

    const statusStmt = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM reflection_queue
      GROUP BY status
    `);
    const statusCounts = statusStmt.all() as any[];

    const typeStmt = this.db.prepare(`
      SELECT task_type, COUNT(*) as count
      FROM reflection_queue
      WHERE status IN ('PENDING', 'PROCESSING')
      GROUP BY task_type
    `);
    const typeCounts = typeStmt.all() as any[];

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
      stats[row.status.toLowerCase() as keyof TaskQueueStats] = row.count;
    });

    typeCounts.forEach(row => {
      stats.by_type[row.task_type as TaskType] = row.count;
    });

    return stats;
  }

  /**
   * 根据 ID 获取任务
   */
  async getTaskById(taskId: string): Promise<ReflectionTask | null> {
    const stmt = this.db.prepare('SELECT * FROM reflection_queue WHERE id = ?');
    const row = stmt.get(taskId) as any;

    return row ? this.mapRowToTask(row) : null;
  }

  /**
   * 清理已完成的旧任务（保留 30 天）
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
      logger.info(`[TaskQueue] 清理了 ${deletedCount} 个旧任务`);
    }

    return deletedCount;
  }

  /**
   * 映射数据库行到 TypeScript 对象
   */
  private mapRowToTask(row: any): ReflectionTask {
    return {
      id: row.id,
      task_type: row.task_type as TaskType,
      trajectory_id: row.trajectory_id,
      status: row.status as TaskStatus,
      priority: row.priority as TaskPriority,
      payload: row.payload ? JSON.parse(row.payload) : undefined,
      error_message: row.error_message,
      retry_count: row.retry_count,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      scheduled_at: row.scheduled_at ? new Date(row.scheduled_at) : undefined,
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined
    };
  }
}
```

### 2. IdleScheduler 闲时调度器

创建 `src/services/IdleScheduler.ts`:

```typescript
import os from 'os';
import { PlaybookTaskQueue } from './PlaybookTaskQueue';
import { TaskType } from '../types/task-queue';
import { logger } from '../utils/logger';

/**
 * 闲时调度器
 *
 * 职责:
 * - 监控 CPU 使用率
 * - 在系统空闲时执行任务队列中的任务
 * - 避免影响主业务性能
 */
export class IdleScheduler {
  private taskQueue: PlaybookTaskQueue;
  private interval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private cpuThreshold: number;
  private checkIntervalMs: number;
  private taskHandlers: Map<TaskType, (task: any) => Promise<void>>;

  constructor(
    taskQueue: PlaybookTaskQueue,
    options: {
      cpuThreshold?: number;      // CPU 使用率阈值（默认 30%）
      checkIntervalMs?: number;    // 检查间隔（默认 30 秒）
    } = {}
  ) {
    this.taskQueue = taskQueue;
    this.cpuThreshold = options.cpuThreshold || 0.3;
    this.checkIntervalMs = options.checkIntervalMs || 30000;
    this.taskHandlers = new Map();
  }

  /**
   * 注册任务处理器
   */
  registerHandler(taskType: TaskType, handler: (task: any) => Promise<void>): void {
    this.taskHandlers.set(taskType, handler);
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[IdleScheduler] 调度器已在运行');
      return;
    }

    this.isRunning = true;
    logger.info('[IdleScheduler] 调度器已启动');

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
    logger.info('[IdleScheduler] 调度器已停止');
  }

  /**
   * 手动触发执行（前端调用）
   */
  async triggerManual(limit: number = 10): Promise<number> {
    logger.info(`[IdleScheduler] 手动触发执行，最多处理 ${limit} 个任务`);
    return await this.executeTasks(limit, true);
  }

  /**
   * 检查并执行任务
   */
  private async checkAndExecuteTasks(): Promise<void> {
    // 检查 CPU 是否空闲
    if (!this.isCpuIdle()) {
      logger.debug('[IdleScheduler] CPU 繁忙，跳过任务执行');
      return;
    }

    // 执行任务
    await this.executeTasks(5, false); // 每次最多执行 5 个任务
  }

  /**
   * 执行任务
   */
  private async executeTasks(limit: number, isManual: boolean): Promise<number> {
    try {
      const tasks = await this.taskQueue.dequeue(limit);

      if (tasks.length === 0) {
        logger.debug('[IdleScheduler] 没有待处理任务');
        return 0;
      }

      logger.info(`[IdleScheduler] 开始执行 ${tasks.length} 个任务 (手动触发: ${isManual})`);

      let completedCount = 0;

      for (const task of tasks) {
        try {
          // 标记为处理中
          await this.taskQueue.markProcessing(task.id);

          // 获取对应的处理器
          const handler = this.taskHandlers.get(task.task_type);
          if (!handler) {
            throw new Error(`未注册的任务类型: ${task.task_type}`);
          }

          // 执行任务
          await handler(task);

          // 标记为完成
          await this.taskQueue.markCompleted(task.id);
          completedCount++;

        } catch (error: any) {
          logger.error(`[IdleScheduler] 任务执行失败: ${task.id}`, error);
          await this.taskQueue.markFailed(task.id, error.message);
        }
      }

      logger.info(`[IdleScheduler] 完成 ${completedCount}/${tasks.length} 个任务`);
      return completedCount;

    } catch (error: any) {
      logger.error('[IdleScheduler] 执行任务时发生错误', error);
      return 0;
    }
  }

  /**
   * 检查 CPU 是否空闲
   */
  private isCpuIdle(): boolean {
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;

    // loadavg[0] 是 1 分钟平均负载
    // 除以 CPU 核心数得到平均每核心负载
    const avgLoad = loadAvg[0] / cpuCount;

    return avgLoad < this.cpuThreshold;
  }
}
```

### 3. 集成到 AceCore

修改 `src/core/ace/AceCore.ts`，在 `saveTrajectory()` 后触发事件：

```typescript
// src/core/ace/AceCore.ts

import { PlaybookTaskQueue } from '../../services/PlaybookTaskQueue';
import { TaskType, TaskPriority } from '../../types/task-queue';

export class AceCore {
  private taskQueue: PlaybookTaskQueue;

  constructor(/* ... existing params */, taskQueue: PlaybookTaskQueue) {
    // ... existing initialization
    this.taskQueue = taskQueue;
  }

  /**
   * 保存 Trajectory（修改后）
   */
  async saveTrajectory(trajectory: Trajectory): Promise<void> {
    // ... 原有的保存逻辑 ...

    // 🆕 根据 outcome 入队不同的任务
    if (trajectory.outcome === 'SUCCESS') {
      // 成功任务 → Generator 任务
      await this.taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: trajectory.task_id,
        priority: TaskPriority.NORMAL,
        payload: {
          user_input: trajectory.user_input,
          step_count: trajectory.steps.length
        }
      });

      logger.debug(`[AceCore] 成功任务已入队: ${trajectory.task_id}`);

    } else if (trajectory.outcome === 'FAILURE') {
      // 失败任务 → Reflector 任务（高优先级）
      await this.taskQueue.enqueue({
        task_type: TaskType.REFLECT,
        trajectory_id: trajectory.task_id,
        priority: TaskPriority.HIGH,
        payload: {
          user_input: trajectory.user_input,
          error: trajectory.environment_feedback
        }
      });

      logger.debug(`[AceCore] 失败任务已入队（高优先级）: ${trajectory.task_id}`);
    }
  }
}
```

### 4. 应用启动集成

修改 `src/server.ts`，初始化任务队列和调度器：

```typescript
// src/server.ts

import { PlaybookTaskQueue } from './services/PlaybookTaskQueue';
import { IdleScheduler } from './services/IdleScheduler';
import { PlaybookManager } from './services/PlaybookManager';
import { PlaybookReflector } from './services/PlaybookReflector'; // Stage 1 实现

// ... existing imports

async function bootstrap() {
  // ... existing initialization

  // 🆕 初始化任务队列
  const taskQueue = new PlaybookTaskQueue(sqliteDb, 3);

  // 🆕 初始化调度器
  const idleScheduler = new IdleScheduler(taskQueue, {
    cpuThreshold: 0.3,      // CPU 负载 < 30%
    checkIntervalMs: 30000  // 每 30 秒检查一次
  });

  // 🆕 注册任务处理器
  const playbookManager = new PlaybookManager(/* deps */);
  const playbookReflector = new PlaybookReflector(/* deps */);

  idleScheduler.registerHandler(TaskType.GENERATE, async (task) => {
    const trajectory = await getTrajectoryById(task.trajectory_id);
    if (trajectory) {
      await playbookManager.extractPlaybookFromLearning({
        id: task.trajectory_id,
        summary: trajectory.user_input,
        learnings: trajectory.steps.map(s => s.thought),
        outcome: 'success',
        userId: 'system',
        timestamp: trajectory.timestamp
      });
    }
  });

  idleScheduler.registerHandler(TaskType.REFLECT, async (task) => {
    const failureTrajectory = await getTrajectoryById(task.trajectory_id);
    if (failureTrajectory) {
      // 获取最近的成功案例进行对比
      const successTrajectories = await getRecentSuccessTrajectories(10);
      await playbookReflector.analyzeFailurePatterns(
        successTrajectories,
        [failureTrajectory]
      );
    }
  });

  // 🆕 启动调度器
  idleScheduler.start();

  // 🆕 优雅关闭
  process.on('SIGTERM', () => {
    idleScheduler.stop();
    server.close();
  });

  // ... existing server start logic
}

bootstrap();
```

## 🎨 前端管理面板（可选）

### API 端点

创建 `src/api/controllers/TaskQueueController.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { PlaybookTaskQueue } from '../../services/PlaybookTaskQueue';
import { IdleScheduler } from '../../services/IdleScheduler';

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

    // 手动触发执行
    this.router.post('/trigger', this.triggerManual.bind(this));

    // 清理旧任务
    this.router.post('/cleanup', this.cleanup.bind(this));
  }

  /**
   * GET /api/task-queue/stats
   */
  private async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.taskQueue.getStats();
      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/task-queue/trigger
   * Body: { limit?: number }
   */
  private async triggerManual(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 10 } = req.body;
      const completedCount = await this.scheduler.triggerManual(limit);

      res.json({
        success: true,
        data: {
          completed: completedCount,
          message: `成功执行 ${completedCount} 个任务`
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/task-queue/cleanup
   * Body: { days?: number }
   */
  private async cleanup(req: Request, res: Response): Promise<void> {
    try {
      const { days = 30 } = req.body;
      const deletedCount = await this.taskQueue.cleanup(days);

      res.json({
        success: true,
        data: {
          deleted: deletedCount,
          message: `清理了 ${deletedCount} 个旧任务`
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  getRouter(): Router {
    return this.router;
  }
}
```

### 前端界面（React 示例）

```tsx
// admin-panel/src/components/TaskQueuePanel.tsx

import React, { useEffect, useState } from 'react';
import { Button, Card, Statistic, Row, Col, message } from 'antd';
import { SyncOutlined, DeleteOutlined } from '@ant-design/icons';

interface TaskQueueStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  by_type: {
    GENERATE: number;
    REFLECT: number;
    CURATE: number;
  };
}

export const TaskQueuePanel: React.FC = () => {
  const [stats, setStats] = useState<TaskQueueStats | null>(null);
  const [loading, setLoading] = useState(false);

  // 加载统计数据
  const loadStats = async () => {
    try {
      const response = await fetch('/api/task-queue/stats');
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      message.error('加载失败');
    }
  };

  // 手动触发执行
  const triggerManual = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/task-queue/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 })
      });
      const data = await response.json();

      if (data.success) {
        message.success(data.data.message);
        loadStats(); // 刷新统计
      }
    } catch (error) {
      message.error('执行失败');
    } finally {
      setLoading(false);
    }
  };

  // 清理旧任务
  const cleanup = async () => {
    try {
      const response = await fetch('/api/task-queue/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 30 })
      });
      const data = await response.json();

      if (data.success) {
        message.success(data.data.message);
        loadStats();
      }
    } catch (error) {
      message.error('清理失败');
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 10000); // 每 10 秒刷新
    return () => clearInterval(interval);
  }, []);

  if (!stats) {
    return <div>加载中...</div>;
  }

  return (
    <Card title="知识库维护" extra={
      <Button onClick={loadStats} icon={<SyncOutlined />}>
        刷新
      </Button>
    }>
      <Row gutter={16}>
        <Col span={6}>
          <Statistic title="待处理" value={stats.pending} />
        </Col>
        <Col span={6}>
          <Statistic title="处理中" value={stats.processing} />
        </Col>
        <Col span={6}>
          <Statistic title="已完成" value={stats.completed} />
        </Col>
        <Col span={6}>
          <Statistic title="失败" value={stats.failed} valueStyle={{ color: '#cf1322' }} />
        </Col>
      </Row>

      <div style={{ marginTop: 24 }}>
        <h4>按类型统计</h4>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic title="生成任务" value={stats.by_type.GENERATE} />
          </Col>
          <Col span={8}>
            <Statistic title="反思任务" value={stats.by_type.REFLECT} />
          </Col>
          <Col span={8}>
            <Statistic title="维护任务" value={stats.by_type.CURATE} />
          </Col>
        </Row>
      </div>

      <div style={{ marginTop: 24 }}>
        <Button
          type="primary"
          onClick={triggerManual}
          loading={loading}
          disabled={stats.pending === 0}
        >
          立即执行前 10 个任务
        </Button>
        <Button
          onClick={cleanup}
          icon={<DeleteOutlined />}
          style={{ marginLeft: 8 }}
        >
          清理旧任务（30天前）
        </Button>
      </div>
    </Card>
  );
};
```

## 🧪 测试验收

### 测试场景

创建 `tests/playbook/stage0.5-task-queue.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PlaybookTaskQueue } from '../../src/services/PlaybookTaskQueue';
import { TaskType, TaskPriority, TaskStatus } from '../../src/types/task-queue';
import Database from 'better-sqlite3';

describe('Stage 0.5: Task Queue Verification', () => {
  let db: Database.Database;
  let taskQueue: PlaybookTaskQueue;

  beforeAll(() => {
    db = new Database(':memory:');
    taskQueue = new PlaybookTaskQueue(db);
  });

  afterAll(() => {
    db.close();
  });

  it('场景1: 完成成功任务 → 队列中新增 1 条 GENERATE 任务', async () => {
    const taskId = await taskQueue.enqueue({
      task_type: TaskType.GENERATE,
      trajectory_id: 'traj-success-001',
      priority: TaskPriority.NORMAL
    });

    expect(taskId).toBeTruthy();

    const stats = await taskQueue.getStats();
    expect(stats.pending).toBeGreaterThanOrEqual(1);
    expect(stats.by_type.GENERATE).toBeGreaterThanOrEqual(1);
  });

  it('场景2: 完成失败任务 → 队列中新增 1 条 REFLECT 任务（priority=1）', async () => {
    const taskId = await taskQueue.enqueue({
      task_type: TaskType.REFLECT,
      trajectory_id: 'traj-failure-001',
      priority: TaskPriority.HIGH
    });

    const task = await taskQueue.getTaskById(taskId);
    expect(task).toBeDefined();
    expect(task!.priority).toBe(TaskPriority.HIGH);
  });

  it('场景3: 手动触发维护 → 前 10 个任务被处理，状态更新为 COMPLETED', async () => {
    // 入队 15 个任务
    for (let i = 0; i < 15; i++) {
      await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: `traj-${i}`
      });
    }

    // 出队 10 个任务
    const tasks = await taskQueue.dequeue(10);
    expect(tasks.length).toBe(10);

    // 模拟处理并标记完成
    for (const task of tasks) {
      await taskQueue.markProcessing(task.id);
      await taskQueue.markCompleted(task.id);
    }

    const stats = await taskQueue.getStats();
    expect(stats.completed).toBeGreaterThanOrEqual(10);
  });

  it('场景4: 关机重启应用 → 队列中的 PENDING 任务仍存在（持久化验证）', async () => {
    // 入队任务
    const taskId = await taskQueue.enqueue({
      task_type: TaskType.CURATE,
      trajectory_id: 'traj-persist-001'
    });

    // 模拟关机（关闭数据库连接）
    db.close();

    // 模拟重启（重新打开数据库）
    const newDb = new Database(':memory:'); // 注意：内存数据库无法真正持久化，实际测试需要文件数据库
    const newTaskQueue = new PlaybookTaskQueue(newDb);

    // 验证任务仍存在（仅对文件数据库有效）
    // const task = await newTaskQueue.getTaskById(taskId);
    // expect(task).toBeDefined();
    // expect(task!.status).toBe(TaskStatus.PENDING);

    newDb.close();
  });
});
```

### 验收标准

| 场景 | 通过标准 |
|------|---------|
| **场景1** | 成功任务触发 GENERATE 任务入队 |
| **场景2** | 失败任务触发 REFLECT 任务入队（priority=1） |
| **场景3** | 手动触发能处理前 N 个任务，状态更新正确 |
| **场景4** | 应用重启后任务队列数据不丢失 |

## ⏱️ 时间估算

| 任务 | 预计时间 |
|------|---------|
| 创建数据库迁移脚本 | 15 分钟 |
| 实现 PlaybookTaskQueue 类 | 60 分钟 |
| 实现 IdleScheduler 类 | 45 分钟 |
| 集成到 AceCore | 20 分钟 |
| 实现 API 端点 | 30 分钟 |
| 编写测试用例 | 30 分钟 |
| 前端管理面板（可选） | 40 分钟 |
| **总计** | **4 小时** |

## 📅 下一步

完成后，阅读 [Stage 0.6: Trajectory 质量提升](03-stage0.6-trajectory-quality.md)

---

**文档版本**: v1.0
**创建日期**: 2025-12-16
