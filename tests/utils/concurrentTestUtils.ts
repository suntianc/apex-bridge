/**
 * Concurrent Test Utilities - 并发测试工具函数
 * 
 * 用于编写并发测试，验证竞态条件修复
 */

/**
 * 并发执行操作
 * @param operation 要执行的操作
 * @param concurrency 并发数
 * @param iterations 每个并发操作的迭代次数
 * @returns 所有操作的执行结果
 */
export async function testConcurrentOperations<T>(
  operation: () => Promise<T>,
  concurrency: number,
  iterations: number = 1
): Promise<T[]> {
  const promises: Promise<T>[] = [];

  for (let i = 0; i < concurrency; i++) {
    const promise = async () => {
      const results: T[] = [];
      for (let j = 0; j < iterations; j++) {
        const result = await operation();
        results.push(result);
      }
      return results[results.length - 1]; // 返回最后一次迭代的结果
    };

    promises.push(promise());
  }

  return Promise.all(promises);
}

/**
 * 并发执行操作并收集所有结果（包括成功和失败）
 * @param operation 要执行的操作
 * @param concurrency 并发数
 * @param iterations 每个并发操作的迭代次数
 * @returns 所有操作的结果（成功和失败）
 */
export async function testConcurrentOperationsSettled<T>(
  operation: () => Promise<T>,
  concurrency: number,
  iterations: number = 1
): Promise<PromiseSettledResult<T>[]> {
  const promises: Promise<T>[] = [];

  for (let i = 0; i < concurrency; i++) {
    const promise = async () => {
      let lastResult: T | undefined;
      for (let j = 0; j < iterations; j++) {
        lastResult = await operation();
      }
      return lastResult!; // 返回最后一次迭代的结果
    };

    promises.push(promise());
  }

  return Promise.allSettled(promises);
}

/**
 * 并发执行不同的操作
 * @param operations 要执行的操作列表
 * @returns 所有操作的结果
 */
export async function testConcurrentDifferentOperations<T>(
  operations: Array<() => Promise<T>>
): Promise<PromiseSettledResult<T>[]> {
  const promises = operations.map(op => op());
  return Promise.allSettled(promises);
}

/**
 * 并发执行操作并测量性能
 * @param operation 要执行的操作
 * @param concurrency 并发数
 * @param iterations 每个并发操作的迭代次数
 * @returns 性能统计信息
 */
export async function testConcurrentOperationsWithPerformance<T>(
  operation: () => Promise<T>,
  concurrency: number,
  iterations: number = 1
): Promise<{
  results: T[];
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
}> {
  const startTime = Date.now();
  const results = await testConcurrentOperations(operation, concurrency, iterations);
  const endTime = Date.now();

  const totalTime = endTime - startTime;
  const averageTime = totalTime / (concurrency * iterations);
  const minTime = totalTime; // 简化处理
  const maxTime = totalTime;

  return {
    results,
    totalTime,
    averageTime,
    minTime,
    maxTime
  };
}

/**
 * 并发执行操作并验证数据一致性
 * @param operation 要执行的操作
 * @param concurrency 并发数
 * @param iterations 每个并发操作的迭代次数
 * @param validator 验证函数，用于验证最终状态
 * @returns 验证结果
 */
export async function testConcurrentOperationsWithValidation<T>(
  operation: () => Promise<T>,
  concurrency: number,
  iterations: number,
  validator: (results: T[]) => boolean
): Promise<{
  results: T[];
  valid: boolean;
}> {
  const results = await testConcurrentOperations(operation, concurrency, iterations);
  const valid = validator(results);

  return {
    results,
    valid
  };
}

/**
 * 模拟并发读写操作
 * @param readOperation 读操作
 * @param writeOperation 写操作
 * @param readConcurrency 读并发数
 * @param writeConcurrency 写并发数
 * @returns 读写操作的结果
 */
export async function testConcurrentReadWrite<TRead, TWrite>(
  readOperation: () => Promise<TRead>,
  writeOperation: () => Promise<TWrite>,
  readConcurrency: number,
  writeConcurrency: number
): Promise<{
  readResults: PromiseSettledResult<TRead>[];
  writeResults: PromiseSettledResult<TWrite>[];
}> {
  const readPromises = Array(readConcurrency).fill(null).map(() => readOperation());
  const writePromises = Array(writeConcurrency).fill(null).map(() => writeOperation());

  const [readResults, writeResults] = await Promise.all([
    Promise.allSettled(readPromises),
    Promise.allSettled(writePromises)
  ]);

  return {
    readResults,
    writeResults
  };
}
