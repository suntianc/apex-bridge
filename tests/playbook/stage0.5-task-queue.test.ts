import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { PlaybookTaskQueue } from '../../src/services/PlaybookTaskQueue';
import { IdleScheduler } from '../../src/services/IdleScheduler';
import { TaskType, TaskPriority, TaskStatus, ReflectionTask } from '../../src/types/task-queue';

describe('Stage 0.5: Task Queue Infrastructure Verification', () => {
  let db: Database.Database;
  let taskQueue: PlaybookTaskQueue;
  let scheduler: IdleScheduler;

  beforeAll(() => {
    console.log('Initializing Stage 0.5 test environment...');

    // 使用内存数据库进行测试
    db = new Database(':memory:');
    taskQueue = new PlaybookTaskQueue(db, 3);
    scheduler = new IdleScheduler(taskQueue, {
      cpuThreshold: 1.0, // 设置高阈值，确保测试时总是能执行
      checkIntervalMs: 100000 // 设置长间隔，避免自动执行干扰测试
    });

    console.log('Test environment initialized');
  });

  afterAll(() => {
    console.log('\nCleaning up test environment...');
    scheduler.stop();
    db.close();
    console.log('Cleanup complete');
  });

  beforeEach(async () => {
    // 清理测试数据
    db.exec('DELETE FROM reflection_queue');
  });

  // ==========================================
  // 测试 1: 任务入队功能
  // ==========================================
  describe('PlaybookTaskQueue: enqueue()', () => {
    it('should enqueue a GENERATE task with default priority', async () => {
      const taskId = await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'traj-001'
      });

      expect(taskId).toBeTruthy();
      expect(typeof taskId).toBe('string');

      const task = await taskQueue.getTaskById(taskId);
      expect(task).toBeDefined();
      expect(task!.task_type).toBe(TaskType.GENERATE);
      expect(task!.trajectory_id).toBe('traj-001');
      expect(task!.priority).toBe(TaskPriority.NORMAL);
      expect(task!.status).toBe(TaskStatus.PENDING);
    });

    it('should enqueue a REFLECT task with HIGH priority', async () => {
      const taskId = await taskQueue.enqueue({
        task_type: TaskType.REFLECT,
        trajectory_id: 'traj-fail-001',
        priority: TaskPriority.HIGH,
        payload: { error: 'Test error' }
      });

      const task = await taskQueue.getTaskById(taskId);
      expect(task).toBeDefined();
      expect(task!.task_type).toBe(TaskType.REFLECT);
      expect(task!.priority).toBe(TaskPriority.HIGH);
      expect(task!.payload).toEqual({ error: 'Test error' });
    });

    it('should enqueue a CURATE task with scheduled_at', async () => {
      const scheduledTime = new Date(Date.now() + 60000); // 1 minute from now

      const taskId = await taskQueue.enqueue({
        task_type: TaskType.CURATE,
        scheduled_at: scheduledTime
      });

      const task = await taskQueue.getTaskById(taskId);
      expect(task).toBeDefined();
      expect(task!.task_type).toBe(TaskType.CURATE);
      expect(task!.scheduled_at).toBeDefined();
    });
  });

  // ==========================================
  // 测试 2: 任务出队功能（带优先级排序）
  // ==========================================
  describe('PlaybookTaskQueue: dequeue()', () => {
    it('should dequeue tasks in priority order (HIGH before NORMAL)', async () => {
      // 入队普通优先级任务
      await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'normal-1',
        priority: TaskPriority.NORMAL
      });

      // 入队高优先级任务
      await taskQueue.enqueue({
        task_type: TaskType.REFLECT,
        trajectory_id: 'high-1',
        priority: TaskPriority.HIGH
      });

      // 入队另一个普通优先级任务
      await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'normal-2',
        priority: TaskPriority.NORMAL
      });

      // 出队
      const tasks = await taskQueue.dequeue(3);

      expect(tasks.length).toBe(3);
      // 高优先级应该排在前面
      expect(tasks[0].priority).toBe(TaskPriority.HIGH);
      expect(tasks[0].trajectory_id).toBe('high-1');
    });

    it('should dequeue tasks in FIFO order for same priority', async () => {
      // 入队多个相同优先级的任务
      await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'first'
      });

      // 小延迟确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));

      await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'second'
      });

      const tasks = await taskQueue.dequeue(2);

      expect(tasks.length).toBe(2);
      expect(tasks[0].trajectory_id).toBe('first');
      expect(tasks[1].trajectory_id).toBe('second');
    });

    it('should not dequeue scheduled tasks before their time', async () => {
      // 入队一个未来时间的任务
      await taskQueue.enqueue({
        task_type: TaskType.CURATE,
        scheduled_at: new Date(Date.now() + 3600000) // 1 hour from now
      });

      // 入队一个立即可执行的任务
      await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'immediate'
      });

      const tasks = await taskQueue.dequeue(10);

      // 只应该出队立即可执行的任务
      expect(tasks.length).toBe(1);
      expect(tasks[0].trajectory_id).toBe('immediate');
    });
  });

  // ==========================================
  // 测试 3: 状态更新功能
  // ==========================================
  describe('PlaybookTaskQueue: status updates', () => {
    it('should mark task as PROCESSING', async () => {
      const taskId = await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'status-test'
      });

      await taskQueue.markProcessing(taskId);

      const task = await taskQueue.getTaskById(taskId);
      expect(task!.status).toBe(TaskStatus.PROCESSING);
    });

    it('should mark task as COMPLETED', async () => {
      const taskId = await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'complete-test'
      });

      await taskQueue.markProcessing(taskId);
      await taskQueue.markCompleted(taskId);

      const task = await taskQueue.getTaskById(taskId);
      expect(task!.status).toBe(TaskStatus.COMPLETED);
      expect(task!.completed_at).toBeDefined();
    });

    it('should mark task as FAILED and schedule retry', async () => {
      const taskId = await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'fail-test'
      });

      await taskQueue.markProcessing(taskId);
      await taskQueue.markFailed(taskId, 'Test error message');

      const task = await taskQueue.getTaskById(taskId);
      // 因为重试，状态应该回到 PENDING
      expect(task!.status).toBe(TaskStatus.PENDING);
      expect(task!.retry_count).toBe(1);
      expect(task!.error_message).toBe('Test error message');
      expect(task!.scheduled_at).toBeDefined();
    });
  });

  // ==========================================
  // 测试 4: 重试机制
  // ==========================================
  describe('PlaybookTaskQueue: retry mechanism', () => {
    it('should retry failed tasks up to max retries', async () => {
      const taskId = await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'retry-test'
      });

      // 模拟 3 次失败
      for (let i = 0; i < 3; i++) {
        await taskQueue.markProcessing(taskId);
        await taskQueue.markFailed(taskId, `Error ${i + 1}`);
      }

      const task = await taskQueue.getTaskById(taskId);
      expect(task!.retry_count).toBe(3);
      // 超过最大重试次数后，状态应该保持 FAILED
      expect(task!.status).toBe(TaskStatus.FAILED);
    });

    it('should not dequeue tasks that exceeded max retries', async () => {
      const taskId = await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'max-retry-test'
      });

      // 模拟 3 次失败
      for (let i = 0; i < 3; i++) {
        await taskQueue.markProcessing(taskId);
        await taskQueue.markFailed(taskId, `Error ${i + 1}`);
      }

      // 清除 scheduled_at 以便测试出队
      db.exec(`UPDATE reflection_queue SET scheduled_at = NULL WHERE id = '${taskId}'`);

      const tasks = await taskQueue.dequeue(10);
      // 超过最大重试的任务不应该被出队
      expect(tasks.find(t => t.id === taskId)).toBeUndefined();
    });
  });

  // ==========================================
  // 测试 5: 统计信息
  // ==========================================
  describe('PlaybookTaskQueue: getStats()', () => {
    it('should return correct statistics', async () => {
      // 入队不同类型和状态的任务
      await taskQueue.enqueue({ task_type: TaskType.GENERATE, trajectory_id: 'gen-1' });
      await taskQueue.enqueue({ task_type: TaskType.GENERATE, trajectory_id: 'gen-2' });
      await taskQueue.enqueue({ task_type: TaskType.REFLECT, trajectory_id: 'ref-1' });
      await taskQueue.enqueue({ task_type: TaskType.CURATE });

      // 完成一个任务
      const taskId = await taskQueue.enqueue({ task_type: TaskType.GENERATE, trajectory_id: 'gen-3' });
      await taskQueue.markProcessing(taskId);
      await taskQueue.markCompleted(taskId);

      const stats = await taskQueue.getStats();

      expect(stats.total).toBe(5);
      expect(stats.pending).toBe(4);
      expect(stats.completed).toBe(1);
      expect(stats.by_type[TaskType.GENERATE]).toBe(2); // 只统计 PENDING/PROCESSING
      expect(stats.by_type[TaskType.REFLECT]).toBe(1);
      expect(stats.by_type[TaskType.CURATE]).toBe(1);
    });
  });

  // ==========================================
  // 测试 6: 清理功能
  // ==========================================
  describe('PlaybookTaskQueue: cleanup()', () => {
    it('should cleanup old completed tasks', async () => {
      // 入队并完成任务
      const taskId = await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'cleanup-test'
      });
      await taskQueue.markProcessing(taskId);
      await taskQueue.markCompleted(taskId);

      // 手动修改 completed_at 为 31 天前
      db.exec(`
        UPDATE reflection_queue
        SET completed_at = datetime('now', '-31 days')
        WHERE id = '${taskId}'
      `);

      // 清理 30 天前的任务
      const deletedCount = await taskQueue.cleanup(30);

      expect(deletedCount).toBe(1);

      const task = await taskQueue.getTaskById(taskId);
      expect(task).toBeNull();
    });
  });

  // ==========================================
  // 测试 7: 闲时调度器
  // ==========================================
  describe('IdleScheduler', () => {
    it('should register task handlers', () => {
      const mockHandler = async (task: ReflectionTask) => {
        console.log(`Processing task: ${task.id}`);
      };

      scheduler.registerHandler(TaskType.GENERATE, mockHandler);
      scheduler.registerHandler(TaskType.REFLECT, mockHandler);

      const status = scheduler.getStatus();
      expect(status.registeredHandlers).toContain(TaskType.GENERATE);
      expect(status.registeredHandlers).toContain(TaskType.REFLECT);
    });

    it('should execute tasks manually', async () => {
      let executedTaskId: string | null = null;

      // 注册处理器
      scheduler.registerHandler(TaskType.GENERATE, async (task) => {
        executedTaskId = task.id;
      });

      // 入队任务
      const taskId = await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'manual-trigger-test'
      });

      // 手动触发
      const completedCount = await scheduler.triggerManual(1);

      expect(completedCount).toBe(1);
      expect(executedTaskId).toBe(taskId);

      // 验证任务状态
      const task = await taskQueue.getTaskById(taskId);
      expect(task!.status).toBe(TaskStatus.COMPLETED);
    });

    it('should handle task execution errors', async () => {
      // 注册一个会失败的处理器
      scheduler.registerHandler(TaskType.REFLECT, async () => {
        throw new Error('Simulated error');
      });

      // 入队任务
      const taskId = await taskQueue.enqueue({
        task_type: TaskType.REFLECT,
        trajectory_id: 'error-test'
      });

      // 手动触发
      const completedCount = await scheduler.triggerManual(1);

      expect(completedCount).toBe(0);

      // 验证任务被标记为失败并准备重试
      const task = await taskQueue.getTaskById(taskId);
      expect(task!.status).toBe(TaskStatus.PENDING);
      expect(task!.retry_count).toBe(1);
      expect(task!.error_message).toBe('Simulated error');
    });

    it('should report scheduler status', () => {
      const status = scheduler.getStatus();

      expect(typeof status.isRunning).toBe('boolean');
      expect(typeof status.isExecuting).toBe('boolean');
      expect(typeof status.cpuThreshold).toBe('number');
      expect(typeof status.checkIntervalMs).toBe('number');
      expect(Array.isArray(status.registeredHandlers)).toBe(true);
      expect(typeof status.currentCpuLoad).toBe('number');
    });
  });

  // ==========================================
  // 测试 8: 重置卡住任务
  // ==========================================
  describe('PlaybookTaskQueue: resetStuckTasks()', () => {
    it('should reset tasks stuck in PROCESSING state', async () => {
      const taskId = await taskQueue.enqueue({
        task_type: TaskType.GENERATE,
        trajectory_id: 'stuck-test'
      });

      await taskQueue.markProcessing(taskId);

      // 手动修改 updated_at 为 31 分钟前
      db.exec(`
        UPDATE reflection_queue
        SET updated_at = datetime('now', '-31 minutes')
        WHERE id = '${taskId}'
      `);

      const resetCount = await taskQueue.resetStuckTasks(30);

      expect(resetCount).toBe(1);

      const task = await taskQueue.getTaskById(taskId);
      expect(task!.status).toBe(TaskStatus.PENDING);
    });
  });

  // ==========================================
  // 验证报告
  // ==========================================
  describe('Verification Summary', () => {
    it('should generate verification report', () => {
      console.log('\n' + '='.repeat(60));
      console.log('Stage 0.5 Verification Report');
      console.log('='.repeat(60));

      console.log('\nVerified Features:');
      console.log('  1. Task enqueue with priority');
      console.log('  2. Task dequeue with priority ordering');
      console.log('  3. Task status updates (PENDING -> PROCESSING -> COMPLETED/FAILED)');
      console.log('  4. Retry mechanism (max 3 retries)');
      console.log('  5. Statistics collection');
      console.log('  6. Old task cleanup');
      console.log('  7. IdleScheduler manual trigger');
      console.log('  8. Reset stuck tasks');

      console.log('\nNext Steps:');
      console.log('  - Integrate with AceCore.saveTrajectory()');
      console.log('  - Add routes to server.ts');
      console.log('  - Implement frontend management panel');

      console.log('\n' + '='.repeat(60));

      expect(true).toBe(true);
    });
  });
});
