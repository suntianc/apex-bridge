/**
 * DistributedLock - 分布式锁实现
 * 
 * 支持 Redis 分布式锁和内存锁（Mutex）回退
 * 用于防止并发操作导致的数据不一致
 */

import { RedisService } from '../services/RedisService';
import { Mutex } from './Mutex';
import { logger } from './logger';

export interface LockOptions {
  timeout?: number; // 获取锁的超时时间（毫秒），默认 5000ms
  ttl?: number; // 锁的过期时间（毫秒），默认 30000ms
  retryInterval?: number; // 重试间隔（毫秒），默认 100ms
}

export interface LockHandle {
  lockId: string;
  provider: 'redis' | 'memory';
  release: () => Promise<boolean>;
}

/**
 * 分布式锁管理器
 */
export class DistributedLock {
  private static instance: DistributedLock;
  private redisService: RedisService;
  private memoryLocks: Map<string, Mutex> = new Map();
  private redisLockValues: Map<string, string> = new Map(); // 存储 Redis 锁的值

  private constructor() {
    this.redisService = RedisService.getInstance();
  }

  public static getInstance(): DistributedLock {
    if (!DistributedLock.instance) {
      DistributedLock.instance = new DistributedLock();
    }
    return DistributedLock.instance;
  }

  /**
   * 获取锁
   * @param resourceId 资源ID
   * @param options 锁选项
   * @returns 锁句柄（包含释放方法）
   */
  public async acquireLock(
    resourceId: string,
    options: LockOptions = {}
  ): Promise<LockHandle | null> {
    const {
      timeout = 5000,
      ttl = 30000,
      retryInterval = 100
    } = options;

    // 尝试使用 Redis 锁
    const redisClient = await this.redisService.getClient();
    if (redisClient) {
      try {
        const lockId = await this.acquireRedisLock(redisClient, resourceId, timeout, ttl, retryInterval);
        if (lockId) {
          return {
            lockId,
            provider: 'redis',
            release: () => this.releaseRedisLock(resourceId, lockId)
          };
        }
      } catch (error: any) {
        logger.warn(`⚠️ Failed to acquire Redis lock for ${resourceId}, falling back to memory lock:`, error.message);
      }
    }

    // 回退到内存锁
    return this.acquireMemoryLock(resourceId, timeout);
  }

  /**
   * 获取 Redis 锁
   */
  private async acquireRedisLock(
    redisClient: any,
    resourceId: string,
    timeout: number,
    ttl: number,
    retryInterval: number
  ): Promise<string | null> {
    const lockKey = `lock:${resourceId}`;
    const lockValue = `${Date.now()}:${Math.random()}:${process.pid}`;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // 使用 SET NX PX 原子操作获取锁
        // Redis v4+ API: set(key, value, { NX: true, PX: ttl })
        const result = await redisClient.set(lockKey, lockValue, {
          NX: true,
          PX: ttl
        });

        if (result === 'OK' || result === true) {
          // 存储锁值，用于释放时验证
          this.redisLockValues.set(resourceId, lockValue);
          
          logger.debug(`✅ Redis lock acquired for ${resourceId} (TTL: ${ttl}ms)`);
          return lockValue;
        }

        // 锁已被占用，等待后重试
        await this.sleep(retryInterval);
      } catch (error: any) {
        logger.error(`❌ Error acquiring Redis lock for ${resourceId}:`, error);
        throw error;
      }
    }

    // 超时未获取到锁
    logger.warn(`⚠️ Timeout acquiring Redis lock for ${resourceId} after ${timeout}ms`);
    return null;
  }

  /**
   * 释放 Redis 锁
   */
  private async releaseRedisLock(resourceId: string, lockId: string): Promise<boolean> {
    const lockKey = `lock:${resourceId}`;
    const storedLockValue = this.redisLockValues.get(resourceId);

    if (!storedLockValue || storedLockValue !== lockId) {
      logger.warn(`⚠️ Lock value mismatch for ${resourceId}, cannot release`);
      return false;
    }

    const redisClient = await this.redisService.getClient();
    if (!redisClient) {
      logger.warn(`⚠️ Redis client not available, cannot release lock for ${resourceId}`);
      return false;
    }

    try {
      // 使用 Lua 脚本原子释放锁（只有锁值匹配时才释放）
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await redisClient.eval(script, {
        keys: [lockKey],
        arguments: [lockId]
      }) as number;

      if (result === 1) {
        this.redisLockValues.delete(resourceId);
        logger.debug(`✅ Redis lock released for ${resourceId}`);
        return true;
      } else {
        logger.warn(`⚠️ Failed to release Redis lock for ${resourceId} (lock may have expired or been released)`);
        this.redisLockValues.delete(resourceId);
        return false;
      }
    } catch (error: any) {
      logger.error(`❌ Error releasing Redis lock for ${resourceId}:`, error);
      this.redisLockValues.delete(resourceId);
      return false;
    }
  }

  /**
   * 获取内存锁
   */
  private async acquireMemoryLock(resourceId: string, timeout: number): Promise<LockHandle | null> {
    // 获取或创建 Mutex
    let mutex = this.memoryLocks.get(resourceId);
    if (!mutex) {
      mutex = new Mutex();
      this.memoryLocks.set(resourceId, mutex);
    }

    const lockId = `${Date.now()}:${Math.random()}:${process.pid}`;
    const startTime = Date.now();

    // 检查锁是否可用，如果被占用则等待
    while (Date.now() - startTime < timeout) {
      if (!mutex.isLocked()) {
        try {
          const releaseFn = await mutex.acquire();
          logger.debug(`✅ Memory lock acquired for ${resourceId}`);
          
          // 返回锁句柄，包含释放函数
          return {
            lockId,
            provider: 'memory',
            release: async () => {
              try {
                releaseFn();
                logger.debug(`✅ Memory lock released for ${resourceId}`);
                return true;
              } catch (error: any) {
                logger.error(`❌ Error releasing memory lock for ${resourceId}:`, error);
                return false;
              }
            }
          };
        } catch (error: any) {
          logger.error(`❌ Error acquiring memory lock for ${resourceId}:`, error);
          return null;
        }
      }

      // 等待一段时间后重试
      await this.sleep(100);
    }

    // 超时未获取到锁
    logger.warn(`⚠️ Timeout acquiring memory lock for ${resourceId} after ${timeout}ms`);
    return null;
  }

  /**
   * 等待指定时间
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 清理不再使用的内存锁
   */
  public cleanupMemoryLocks(): void {
    // 可以定期清理不再使用的 Mutex
    // 这里简化处理，不自动清理
  }
}

/**
 * 使用分布式锁执行操作
 * @param resourceId 资源ID
 * @param operation 要执行的操作
 * @param options 锁选项
 */
export async function withLock<T>(
  resourceId: string,
  operation: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const lockManager = DistributedLock.getInstance();
  const lockHandle = await lockManager.acquireLock(resourceId, options);

  if (!lockHandle) {
    throw new Error(`Failed to acquire lock for ${resourceId}`);
  }

  try {
    return await operation();
  } finally {
    // 释放锁
    await lockHandle.release();
  }
}
