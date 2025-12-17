import { StrategicLearning } from '../../../src/services/AceStrategyManager';

/**
 * 生成测试用 StrategicLearning
 */
export function createMockLearning(overrides?: Partial<StrategicLearning>): StrategicLearning {
  return {
    id: `test-${Date.now()}`,
    summary: '测试学习记录',
    learnings: ['测试学习点1', '测试学习点2'],
    outcome: 'success',
    timestamp: Date.now(),
    context: '测试上下文',
    ...overrides
  } as StrategicLearning;
}

/**
 * 等待异步操作完成（带超时）
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Timeout after ${timeout}ms`);
}

/**
 * 生成唯一ID
 */
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
