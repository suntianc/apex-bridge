interface TaskProgress {
  id: string;
  name: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  status: 'succeeded' | 'failed';
  message: string;
  checkpoints: Array<{ label: string; at: number }>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function simulateWork(
  durationMs: number,
  shouldFail: boolean,
  checkpoints: Array<{ label: string; at: number }>
): Promise<void> {
  const segments = checkpoints.length + 1;
  const segmentDuration = Math.max(50, Math.floor(durationMs / segments));

  for (let i = 0; i < segments; i++) {
    await new Promise((resolve) => setTimeout(resolve, segmentDuration));
    if (checkpoints[i]) {
      checkpoints[i].at = Date.now();
    }
  }

  if (shouldFail) {
    throw new Error('任务执行失败（模拟）');
  }
}

export async function execute(params: Record<string, unknown>): Promise<unknown> {
  const taskName = typeof params.taskName === 'string' ? params.taskName : '异步任务';
  const requestedDuration = typeof params.duration === 'number' ? params.duration : Number(params.duration);
  const durationMs = clamp(Number.isFinite(requestedDuration) ? requestedDuration : 2000, 200, 10000);
  const shouldFail = typeof params.shouldFail === 'boolean' ? params.shouldFail : false;

  const taskId = createTaskId();
  const startedAt = Date.now();

  const checkpoints = [
    { label: '任务已排队', at: startedAt },
    { label: '正在执行', at: startedAt },
    { label: '阶段性结果写入', at: startedAt }
  ];

  try {
    await simulateWork(durationMs, shouldFail, checkpoints);
    const finishedAt = Date.now();

    const result: TaskProgress = {
      id: taskId,
      name: taskName,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      status: 'succeeded',
      message: `${taskName} 已完成`,
      checkpoints
    };

    return {
      success: true,
      task: result
    };
  } catch (error: any) {
    const finishedAt = Date.now();
    const result: TaskProgress = {
      id: taskId,
      name: taskName,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      status: 'failed',
      message: error?.message ?? '任务失败',
      checkpoints
    };

    return {
      success: false,
      task: result,
      error: result.message
    };
  }
}