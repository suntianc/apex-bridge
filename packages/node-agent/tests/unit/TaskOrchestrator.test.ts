import { jest } from '@jest/globals';
import { TaskOrchestrator } from 'src/tasks/TaskOrchestrator';
import type { TaskAssignment, TaskResultMessage } from 'src/tasks/types';
import { createTestLogger } from '../helpers';

function createAssignment(overrides: Partial<TaskAssignment> = {}): TaskAssignment {
  return {
    taskId: overrides.taskId ?? `task-${Math.random().toString(36).slice(2, 8)}`,
    nodeId: overrides.nodeId ?? 'node-1',
    toolName: overrides.toolName ?? 'echo',
    capability: overrides.capability,
    toolArgs: overrides.toolArgs ?? {},
    timeout: overrides.timeout,
    priority: overrides.priority,
    metadata: overrides.metadata
  };
}

describe('TaskOrchestrator', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('executes tasks sequentially and respects priority ordering', async () => {
    jest.useFakeTimers({ now: Date.now() });
    const sendResult = jest.fn<void, [TaskResultMessage]>();
    const orchestrator = new TaskOrchestrator({
      logger: createTestLogger('error'),
      maxConcurrent: 1,
      defaultTimeoutMs: 5_000,
      sendResult,
      getNodeId: () => 'node-1'
    });

    orchestrator.registerTool('echo', async (ctx) => {
      const duration = (ctx.assignment.metadata?.duration as number) ?? 0;
      await new Promise((resolve) => setTimeout(resolve, duration));
      return { result: { echoed: ctx.assignment.toolArgs } };
    });

    orchestrator.handleAssignment(
      createAssignment({ taskId: 'first', priority: 3, metadata: { duration: 10 } })
    );
    orchestrator.handleAssignment(
      createAssignment({ taskId: 'second', priority: 1, metadata: { duration: 10 } })
    );
    orchestrator.handleAssignment(
      createAssignment({ taskId: 'high', priority: 10, metadata: { duration: 10 } })
    );

    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();

    const order = sendResult.mock.calls.map((call) => call[0].data.taskId);
    expect(order).toEqual(['first', 'high', 'second']);
  });

  it('aborts long running task when timeout is reached', async () => {
    jest.useFakeTimers({ now: Date.now() });
    const sendResult = jest.fn<void, [TaskResultMessage]>();
    const orchestrator = new TaskOrchestrator({
      logger: createTestLogger('error'),
      maxConcurrent: 1,
      defaultTimeoutMs: 500,
      sendResult,
      getNodeId: () => 'node-1'
    });

    orchestrator.registerTool('slow', (ctx) => {
      return new Promise((_, reject) => {
        ctx.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    orchestrator.handleAssignment(
      createAssignment({
        taskId: 'slow-task',
        toolName: 'slow',
        timeout: 100
      })
    );

    await jest.advanceTimersByTimeAsync(150);
    await Promise.resolve();

    expect(sendResult).toHaveBeenCalledTimes(1);
    const message = sendResult.mock.calls[0][0];
    expect(message.data.success).toBe(false);
    expect(message.data.error?.code).toBe('task_timeout');
  });

  it('reports capability_not_supported when handler missing', () => {
    const sendResult = jest.fn<void, [TaskResultMessage]>();
    const orchestrator = new TaskOrchestrator({
      logger: createTestLogger('error'),
      maxConcurrent: 1,
      defaultTimeoutMs: 1_000,
      sendResult,
      getNodeId: () => 'node-1'
    });

    orchestrator.handleAssignment(
      createAssignment({ taskId: 'missing', toolName: 'unknown', priority: 5 })
    );

    expect(sendResult).toHaveBeenCalledTimes(1);
    const message = sendResult.mock.calls[0][0];
    expect(message.data.success).toBe(false);
    expect(message.data.error?.code).toBe('capability_not_supported');
  });

  it('falls back to TaskResult payload when handler omits result field', async () => {
    const sendResult = jest.fn<void, [TaskResultMessage]>();
    const orchestrator = new TaskOrchestrator({
      logger: createTestLogger('error'),
      maxConcurrent: 1,
      defaultTimeoutMs: 1_000,
      sendResult,
      getNodeId: () => 'node-1'
    });

    orchestrator.registerTool('noop-success', async () => ({ success: true }));

    orchestrator.handleAssignment(
      createAssignment({ taskId: 'noop-task', toolName: 'noop-success' })
    );

    await Promise.resolve();

    expect(sendResult).toHaveBeenCalledTimes(1);
    expect(sendResult.mock.calls[0][0].data).toMatchObject({
      taskId: 'noop-task',
      success: true,
      result: { success: true }
    });
  });
});
