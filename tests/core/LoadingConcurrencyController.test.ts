import { LoadingConcurrencyController } from '../../src/core/skills';

describe('LoadingConcurrencyController', () => {
  it('deduplicates concurrent loads for same key', async () => {
    const controller = new LoadingConcurrencyController(1);

    let resolveLoader: ((value: number) => void) | undefined;
    const loader = jest.fn(() => new Promise<number>((resolve) => {
      resolveLoader = resolve;
    }));

    const firstPromise = controller.loadWithDeduplication('demo', loader);
    await Promise.resolve();
    const secondPromise = controller.loadWithDeduplication('demo', loader);

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    expect(loader).toHaveBeenCalledTimes(1);
    resolveLoader?.(42);

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first).toBe(42);
    expect(second).toBe(42);
  });

  it('respects concurrency limit for different keys', async () => {
    const controller = new LoadingConcurrencyController(1);

    let releaseFirst: (() => void) | undefined;
    const firstLoader = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        })
    );
    const secondLoader = jest.fn().mockResolvedValue(undefined);

    const firstPromise = controller.loadWithDeduplication('first', firstLoader);
    const secondPromise = controller.loadWithDeduplication('second', secondLoader);

    await Promise.resolve();
    await Promise.resolve();
    expect(firstLoader).toHaveBeenCalledTimes(1);
    expect(secondLoader).not.toHaveBeenCalled();

    releaseFirst?.();
    await firstPromise;
    await secondPromise;

    expect(secondLoader).toHaveBeenCalledTimes(1);
  });
});
