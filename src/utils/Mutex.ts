/**
 * Mutex - 互斥锁实现
 * 
 * 用于实现线程安全的操作，防止竞态条件
 */

/**
 * 互斥锁
 * 用于确保同一时间只有一个操作可以执行
 */
export class Mutex {
  private queue: (() => void)[] = [];
  private locked: boolean = false;

  /**
   * 获取锁
   * @returns 释放锁的函数
   */
  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve(() => this.release());
      } else {
        this.queue.push(() => {
          this.locked = true;
          resolve(() => this.release());
        });
      }
    });
  }

  /**
   * 释放锁
   */
  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }

  /**
   * 检查锁是否被占用
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * 获取等待队列长度
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}
