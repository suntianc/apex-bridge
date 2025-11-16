import { CodeGenerationProfiler } from '../../src/core/skills/CodeGenerationProfiler';

describe('CodeGenerationProfiler', () => {
  it('records phase durations via measure', async () => {
    const profiler = new CodeGenerationProfiler();

    const result = await profiler.measure('extraction', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 42;
    });

    expect(result).toBe(42);

    profiler.startPhase('security');
    await new Promise((resolve) => setTimeout(resolve, 2));
    profiler.endPhase('security');

    const metrics = profiler.finalize({ test: true });

    expect(metrics.phases.extraction).toBeGreaterThan(0);
    expect(metrics.phases.security).toBeGreaterThan(0);
    expect(metrics.totalMs).toBeGreaterThanOrEqual(
      metrics.phases.extraction + metrics.phases.security
    );
    expect(metrics.metadata).toMatchObject({ test: true });
  });

  it('supports metadata merging and reset', async () => {
    const profiler = new CodeGenerationProfiler();
    profiler.setMetadata({ skill: 'demo' });
    await profiler.measure('dependency', () => 1);
    const metrics = profiler.finalize();
    expect(metrics.metadata).toMatchObject({ skill: 'demo' });

    profiler.reset();
    const resetMetrics = profiler.finalize();
    expect(resetMetrics.totalMs).toBe(0);
  });
});
