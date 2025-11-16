class Semaphore {
  private readonly queue: Array<() => void> = [];
  private available: number;

  constructor(maxConcurrent: number) {
    if (maxConcurrent <= 0) {
      throw new Error('[LoadingConcurrencyController] maxConcurrent must be greater than 0');
    }
    this.available = maxConcurrent;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => this.release();
    }

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    } else {
      this.available += 1;
    }
  }
}

export class LoadingConcurrencyController {
  private readonly activeLoads = new Map<string, Promise<unknown>>();
  private readonly semaphore: Semaphore;

  constructor(maxConcurrent: number = 5) {
    this.semaphore = new Semaphore(maxConcurrent);
  }

  async loadWithDeduplication<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (this.activeLoads.has(key)) {
      return this.activeLoads.get(key) as Promise<T>;
    }

    const release = await this.semaphore.acquire();

    const loadPromise = (async () => {
      try {
        return await loader();
      } finally {
        this.activeLoads.delete(key);
        release();
      }
    })();

    this.activeLoads.set(key, loadPromise);
    return loadPromise;
  }
}
