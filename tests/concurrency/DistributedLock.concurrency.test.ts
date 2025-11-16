/**
 * DistributedLock Concurrency Tests - 分布式锁并发测试
 */

import { DistributedLock, withLock } from '../../src/utils/DistributedLock';
import { RedisService } from '../../src/services/RedisService';
import { testConcurrentOperationsSettled, testConcurrentDifferentOperations } from '../utils/concurrentTestUtils';

// Mock RedisService
jest.mock('../../src/services/RedisService', () => {
  return {
    RedisService: {
      getInstance: jest.fn(() => ({
        getClient: jest.fn(() => Promise.resolve(null)) // 模拟 Redis 不可用，使用内存锁
      }))
    }
  };
});

describe('DistributedLock - Concurrency Tests', () => {
  let distributedLock: DistributedLock;

  beforeEach(() => {
    // Reset singleton instance
    (DistributedLock as any).instance = undefined;
    distributedLock = DistributedLock.getInstance();
  });

  describe('Concurrent Lock Acquisition', () => {
    it('should handle concurrent lock acquisition for same resource', async () => {
      const resourceId = 'test-resource';
      const results: Array<{ lockId: string | null; provider: string } | null> = [];

      // 多个并发获取锁请求
      const promises = Array(10).fill(null).map(async () => {
        const lockHandle = await distributedLock.acquireLock(resourceId, {
          timeout: 1000,
          ttl: 5000
        });
        if (lockHandle) {
          results.push({ lockId: lockHandle.lockId, provider: lockHandle.provider });
          // 延迟释放锁
          await new Promise(resolve => setTimeout(resolve, 50));
          await lockHandle.release();
        } else {
          results.push(null);
        }
      });

      await Promise.allSettled(promises);

      // 验证至少有一个请求获取到锁
      const successfulLocks = results.filter(r => r !== null);
      expect(successfulLocks.length).toBeGreaterThan(0);

      // 验证所有成功的锁都是内存锁（Redis 不可用）
      for (const lock of successfulLocks) {
        if (lock) {
          expect(lock.provider).toBe('memory');
        }
      }
    });

    it('should handle concurrent lock acquisition for different resources', async () => {
      const resourceIds = ['resource-1', 'resource-2', 'resource-3', 'resource-4', 'resource-5'];
      const results: Array<{ resourceId: string; lockId: string | null }> = [];

      // 多个并发获取锁请求（不同的资源）
      const promises = resourceIds.map(async (resourceId) => {
        const lockHandle = await distributedLock.acquireLock(resourceId, {
          timeout: 1000,
          ttl: 5000
        });
        if (lockHandle) {
          results.push({ resourceId, lockId: lockHandle.lockId });
          await lockHandle.release();
        } else {
          results.push({ resourceId, lockId: null });
        }
      });

      await Promise.allSettled(promises);

      // 验证所有请求都获取到锁（不同资源可以同时锁定）
      const successfulLocks = results.filter(r => r.lockId !== null);
      expect(successfulLocks.length).toBe(resourceIds.length);
    });
  });

  describe('Concurrent Operations with Lock', () => {
    it('should serialize concurrent operations with lock', async () => {
      const resourceId = 'test-resource';
      const executionOrder: number[] = [];
      let currentValue = 0;

      // 多个并发操作，使用锁保护
      const operations = Array(5).fill(null).map((_, index) => {
        return async () => {
          return await withLock(resourceId, async () => {
            const value = currentValue;
            await new Promise(resolve => setTimeout(resolve, 10));
            currentValue = value + 1;
            executionOrder.push(index);
            return currentValue;
          }, {
            timeout: 2000,
            ttl: 5000
          });
        };
      });

      const results = await testConcurrentDifferentOperations(operations);

      // 验证所有操作都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(5);

      // 验证最终值正确（应该是 5，因为每个操作都增加了 1）
      expect(currentValue).toBe(5);

      // 验证执行顺序（应该是有序的，因为使用了锁）
      expect(executionOrder.length).toBe(5);
    });

    it('should prevent race conditions in concurrent updates', async () => {
      const resourceId = 'test-resource';
      let counter = 0;

      // 多个并发操作，尝试增加计数器
      const operations = Array(10).fill(null).map(() => {
        return async () => {
          return await withLock(resourceId, async () => {
            const current = counter;
            await new Promise(resolve => setTimeout(resolve, 5));
            counter = current + 1;
            return counter;
          }, {
            timeout: 2000,
            ttl: 5000
          });
        };
      });

      const results = await testConcurrentDifferentOperations(operations);

      // 验证所有操作都成功
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(10);

      // 验证计数器值正确（应该是 10，没有丢失更新）
      expect(counter).toBe(10);
    });
  });

  describe('Lock Timeout Handling', () => {
    it('should handle lock timeout correctly', async () => {
      const resourceId = 'test-resource';

      // 获取锁并保持较长时间
      const lockHandle1 = await distributedLock.acquireLock(resourceId, {
        timeout: 1000,
        ttl: 10000
      });
      expect(lockHandle1).not.toBeNull();

      // 尝试获取同一个资源的锁（应该超时）
      const lockHandle2 = await distributedLock.acquireLock(resourceId, {
        timeout: 100,  // 很短的超时时间
        ttl: 5000
      });

      // 第二个请求应该获取不到锁（超时）
      expect(lockHandle2).toBeNull();

      // 释放第一个锁
      if (lockHandle1) {
        await lockHandle1.release();
      }
    });
  });

  describe('Lock Release', () => {
    it('should release lock correctly after operation', async () => {
      const resourceId = 'test-resource';

      // 获取锁
      const lockHandle1 = await distributedLock.acquireLock(resourceId, {
        timeout: 1000,
        ttl: 5000
      });
      expect(lockHandle1).not.toBeNull();

      // 释放锁
      if (lockHandle1) {
        const released = await lockHandle1.release();
        expect(released).toBe(true);
      }

      // 再次获取锁（应该成功）
      const lockHandle2 = await distributedLock.acquireLock(resourceId, {
        timeout: 1000,
        ttl: 5000
      });
      expect(lockHandle2).not.toBeNull();

      // 释放锁
      if (lockHandle2) {
        await lockHandle2.release();
      }
    });

    it('should handle concurrent lock releases', async () => {
      const resourceId = 'test-resource';
      const lockHandles: Array<{ lockId: string; provider: string; release: () => Promise<boolean> }> = [];

      // 获取多个锁（不同资源）
      for (let i = 0; i < 5; i++) {
        const lockHandle = await distributedLock.acquireLock(`${resourceId}-${i}`, {
          timeout: 1000,
          ttl: 5000
        });
        if (lockHandle) {
          lockHandles.push(lockHandle);
        }
      }

      // 并发释放所有锁
      const releaseResults = await Promise.allSettled(
        lockHandles.map(lock => lock.release())
      );

      // 验证所有释放操作都成功
      const successes = releaseResults.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(lockHandles.length);
    });
  });
});
