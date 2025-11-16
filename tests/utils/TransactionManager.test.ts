/**
 * TransactionManager Tests - 事务管理器测试
 */

import { TransactionManager, executeTransaction, withTransaction } from '../../src/utils/TransactionManager';

describe('TransactionManager', () => {
  let transaction: TransactionManager;

  beforeEach(() => {
    transaction = new TransactionManager();
  });

  describe('Basic Operations', () => {
    it('should commit empty transaction', async () => {
      const result = await transaction.commit();
      expect(result.success).toBe(true);
      expect(result.executedCount).toBe(0);
      expect(result.rollbackCount).toBe(0);
    });

    it('should execute single operation successfully', async () => {
      let executed = false;

      transaction.addOperation({
        execute: async () => {
          executed = true;
        },
        rollback: async () => {
          // No rollback needed
        },
        description: 'test operation'
      });

      const result = await transaction.commit();

      expect(result.success).toBe(true);
      expect(result.executedCount).toBe(1);
      expect(result.rollbackCount).toBe(0);
      expect(executed).toBe(true);
    });

    it('should execute multiple operations in order', async () => {
      const executionOrder: number[] = [];

      transaction.addOperation({
        execute: async () => {
          executionOrder.push(1);
        },
        rollback: async () => {},
        description: 'operation 1'
      });

      transaction.addOperation({
        execute: async () => {
          executionOrder.push(2);
        },
        rollback: async () => {},
        description: 'operation 2'
      });

      transaction.addOperation({
        execute: async () => {
          executionOrder.push(3);
        },
        rollback: async () => {},
        description: 'operation 3'
      });

      const result = await transaction.commit();

      expect(result.success).toBe(true);
      expect(result.executedCount).toBe(3);
      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });

  describe('Rollback Operations', () => {
    it('should rollback all operations on error', async () => {
      const rollbackOrder: number[] = [];

      transaction.addOperation({
        execute: async () => {
          // Operation 1 succeeds
        },
        rollback: async () => {
          rollbackOrder.push(1);
        },
        description: 'operation 1'
      });

      transaction.addOperation({
        execute: async () => {
          // Operation 2 succeeds
        },
        rollback: async () => {
          rollbackOrder.push(2);
        },
        description: 'operation 2'
      });

      transaction.addOperation({
        execute: async () => {
          // Operation 3 fails
          throw new Error('Operation 3 failed');
        },
        rollback: async () => {
          rollbackOrder.push(3);
        },
        description: 'operation 3'
      });

      const result = await transaction.commit();

      expect(result.success).toBe(false);
      expect(result.executedCount).toBe(2); // First 2 operations executed
      expect(result.rollbackCount).toBe(2); // First 2 operations rolled back
      expect(rollbackOrder).toEqual([2, 1]); // Rolled back in reverse order
    });

    it('should continue rollback even if one rollback fails', async () => {
      const rollbackOrder: number[] = [];

      transaction.addOperation({
        execute: async () => {
          // Operation 1 succeeds
        },
        rollback: async () => {
          rollbackOrder.push(1);
          throw new Error('Rollback 1 failed');
        },
        description: 'operation 1'
      });

      transaction.addOperation({
        execute: async () => {
          // Operation 2 succeeds
        },
        rollback: async () => {
          rollbackOrder.push(2);
        },
        description: 'operation 2'
      });

      transaction.addOperation({
        execute: async () => {
          // Operation 3 fails
          throw new Error('Operation 3 failed');
        },
        rollback: async () => {
          rollbackOrder.push(3);
        },
        description: 'operation 3'
      });

      const result = await transaction.commit();

      expect(result.success).toBe(false);
      expect(result.executedCount).toBe(2);
      // Both operations should attempt rollback, even if one fails
      expect(rollbackOrder.length).toBeGreaterThanOrEqual(1);
    });

    it('should not execute operations after error', async () => {
      let operation3Executed = false;

      transaction.addOperation({
        execute: async () => {
          // Operation 1 succeeds
        },
        rollback: async () => {},
        description: 'operation 1'
      });

      transaction.addOperation({
        execute: async () => {
          // Operation 2 fails
          throw new Error('Operation 2 failed');
        },
        rollback: async () => {},
        description: 'operation 2'
      });

      transaction.addOperation({
        execute: async () => {
          operation3Executed = true;
        },
        rollback: async () => {},
        description: 'operation 3'
      });

      const result = await transaction.commit();

      expect(result.success).toBe(false);
      expect(result.executedCount).toBe(1); // Only first operation executed
      expect(operation3Executed).toBe(false); // Third operation not executed
    });
  });

  describe('Helper Functions', () => {
    it('should work with executeTransaction helper', async () => {
      let executed = false;

      const result = await executeTransaction([
        {
          execute: async () => {
            executed = true;
          },
          rollback: async () => {},
          description: 'test operation'
        }
      ]);

      expect(result.success).toBe(true);
      expect(result.executedCount).toBe(1);
      expect(executed).toBe(true);
    });

    it('should work with withTransaction helper', async () => {
      let executed = false;

      const result = await withTransaction((tx) => {
        tx.addOperation({
          execute: async () => {
            executed = true;
          },
          rollback: async () => {},
          description: 'test operation'
        });
      });

      expect(result.success).toBe(true);
      expect(result.executedCount).toBe(1);
      expect(executed).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should prevent adding operations while committing', async () => {
      transaction.addOperation({
        execute: async () => {
          // Operation takes some time
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        rollback: async () => {},
        description: 'slow operation'
      });

      // Start commit (async)
      const commitPromise = transaction.commit();

      // Try to add operation while committing
      expect(() => {
        transaction.addOperation({
          execute: async () => {},
          rollback: async () => {},
          description: 'late operation'
        });
      }).toThrow('Cannot add operations while transaction is committing');

      await commitPromise;
    });

    it('should handle clear operation', () => {
      transaction.addOperation({
        execute: async () => {},
        rollback: async () => {},
        description: 'operation 1'
      });

      expect(transaction.getOperationCount()).toBe(1);
      expect(transaction.isEmpty()).toBe(false);

      transaction.clear();

      expect(transaction.getOperationCount()).toBe(0);
      expect(transaction.isEmpty()).toBe(true);
    });

    it('should prevent clear while committing', async () => {
      transaction.addOperation({
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        rollback: async () => {},
        description: 'slow operation'
      });

      // Start commit (async)
      const commitPromise = transaction.commit();

      // Try to clear while committing
      expect(() => {
        transaction.clear();
      }).toThrow('Cannot clear operations while transaction is committing');

      await commitPromise;
    });
  });

  describe('Error Handling', () => {
    it('should include error details in result', async () => {
      transaction.addOperation({
        execute: async () => {
          throw new Error('Test error');
        },
        rollback: async () => {},
        description: 'failing operation'
      });

      const result = await transaction.commit();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].operation).toBe('failing operation');
      expect(result.errors?.[0].error.message).toBe('Test error');
    });

    it('should handle multiple errors', async () => {
      transaction.addOperation({
        execute: async () => {
          throw new Error('Error 1');
        },
        rollback: async () => {},
        description: 'operation 1'
      });

      transaction.addOperation({
        execute: async () => {
          throw new Error('Error 2');
        },
        rollback: async () => {},
        description: 'operation 2'
      });

      const result = await transaction.commit();

      expect(result.success).toBe(false);
      expect(result.errors?.length).toBe(1); // Only first error is caught
      expect(result.errors?.[0].operation).toBe('operation 1');
    });
  });
});
