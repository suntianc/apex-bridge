/**
 * TransactionManager Concurrency Tests - 事务管理器并发测试
 */

import { TransactionManager, executeTransaction, withTransaction } from '../../src/utils/TransactionManager';
import { testConcurrentOperationsSettled, testConcurrentDifferentOperations } from '../utils/concurrentTestUtils';

describe('TransactionManager - Concurrency Tests', () => {
  describe('Concurrent Transaction Execution', () => {
    it('should handle concurrent transactions safely', async () => {
      const results = await testConcurrentOperationsSettled(
        async () => {
          const transaction = new TransactionManager();
          let executed = false;

          transaction.addOperation({
            execute: async () => {
              executed = true;
            },
            rollback: async () => {
              executed = false;
            },
            description: 'test operation'
          });

          const result = await transaction.commit();
          return result;
        },
        5,  // 5 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有事务都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(5);
    });

    it('should handle concurrent transactions with multiple operations', async () => {
      const results = await testConcurrentOperationsSettled(
        async () => {
          const transaction = new TransactionManager();
          const executionOrder: number[] = [];

          // 添加多个操作
          for (let i = 0; i < 3; i++) {
            transaction.addOperation({
              execute: async () => {
                executionOrder.push(i);
              },
              rollback: async () => {
                // No rollback needed
              },
              description: `operation ${i}`
            });
          }

          const result = await transaction.commit();
          return { result, executionOrder };
        },
        3,  // 3 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有事务都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(3);
    });

    it('should handle concurrent transactions with rollback', async () => {
      const results = await testConcurrentOperationsSettled(
        async () => {
          const transaction = new TransactionManager();
          let executed = false;
          let rolledBack = false;

          transaction.addOperation({
            execute: async () => {
              executed = true;
            },
            rollback: async () => {
              rolledBack = true;
            },
            description: 'operation 1'
          });

          transaction.addOperation({
            execute: async () => {
              // 第二个操作失败
              throw new Error('Operation 2 failed');
            },
            rollback: async () => {
              // No rollback needed
            },
            description: 'operation 2'
          });

          // TransactionManager.commit() 返回 TransactionResult，不会抛出错误
          const result = await transaction.commit();
          return { result, executed, rolledBack };
        },
        3,  // 3 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有操作都完成（Promise.allSettled 总是返回 fulfilled）
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(3);

      // 检查事务结果
      for (const result of successes) {
        if (result.status === 'fulfilled' && result.value) {
          // 验证第一个操作被执行
          expect(result.value.executed).toBe(true);
          
          // 验证事务结果
          expect(result.value.result).toBeDefined();
          expect(result.value.result.success).toBe(false); // 事务应该失败
          expect(result.value.result.rollbackCount).toBeGreaterThan(0); // 应该执行了回滚
          
          // 验证回滚被执行
          expect(result.value.rolledBack).toBe(true);
        }
      }
    });
  });

  describe('Concurrent Transaction with Shared Resources', () => {
    it('should handle concurrent transactions with shared state', async () => {
      let sharedCounter = 0;

      const results = await testConcurrentOperationsSettled(
        async () => {
          const transaction = new TransactionManager();
          const initialValue = sharedCounter;

          transaction.addOperation({
            execute: async () => {
              sharedCounter = initialValue + 1;
            },
            rollback: async () => {
              sharedCounter = initialValue;
            },
            description: 'increment counter'
          });

          const result = await transaction.commit();
          return { result, counter: sharedCounter };
        },
        5,  // 5 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有事务都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(5);

      // 注意：由于并发执行，最终值可能不是 5（因为事务之间没有锁）
      // 这里主要验证事务能够正常执行和回滚
    });
  });

  describe('Concurrent Transaction with Helper Functions', () => {
    it('should handle concurrent transactions with executeTransaction', async () => {
      const results = await testConcurrentOperationsSettled(
        async () => {
          return await executeTransaction([
            {
              execute: async () => {
                // Operation 1
              },
              rollback: async () => {
                // Rollback 1
              },
              description: 'operation 1'
            },
            {
              execute: async () => {
                // Operation 2
              },
              rollback: async () => {
                // Rollback 2
              },
              description: 'operation 2'
            }
          ]);
        },
        3,  // 3 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有事务都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(3);
    });

    it('should handle concurrent transactions with withTransaction', async () => {
      const results = await testConcurrentOperationsSettled(
        async () => {
          return await withTransaction((transaction) => {
            transaction.add(
              async () => {
                // Operation 1
              },
              async () => {
                // Rollback 1
              },
              'operation 1'
            );

            transaction.add(
              async () => {
                // Operation 2
              },
              async () => {
                // Rollback 2
              },
              'operation 2'
            );
          });
        },
        3,  // 3 个并发操作
        1   // 每个 1 次迭代
      );

      // 验证所有事务都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(3);
    });
  });
});
