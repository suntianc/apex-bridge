import { CodeCache } from '../../src/core/skills/CodeCache';
import type {
  CodeGenerationMetrics,
  GeneratedSkillCode,
  SecurityReport
} from '../../src/types';

describe('CodeCache', () => {
  const createGeneratedCode = (body: string): GeneratedSkillCode => ({
    javascript: body,
    metadata: { exports: [], imports: [], complexityScore: 1 },
    dependencies: [],
    sourceMap: undefined,
    diagnostics: undefined
  });

  const createSecurityReport = (): SecurityReport => ({
    passed: true,
    riskLevel: 'safe',
    issues: [],
    recommendations: [],
    durationMs: 1
  });

  const createMetrics = (): CodeGenerationMetrics => ({
    phases: {
      total: 10,
      extraction: 2,
      dependency: 1,
      compilation: 5,
      security: 1,
      sandbox: 1
    },
    totalMs: 10,
    timestamp: Date.now(),
    metadata: { cacheStatus: 'miss' }
  });

  it('returns cached entry when hash matches', () => {
    const cache = new CodeCache({ maxSize: 2, ttlMs: 1_000 });

    cache.set('demo', 'hash-1', createGeneratedCode('module.exports=1;'), createSecurityReport(), createMetrics());

    const hit = cache.get('demo', 'hash-1');
    expect(hit).toBeDefined();
    expect(hit?.code.javascript).toContain('module.exports');

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(0);
  });

  it('misses when hash differs', () => {
    const cache = new CodeCache({ maxSize: 2, ttlMs: 1_000 });
    cache.set('demo', 'hash-1', createGeneratedCode('module.exports=1;'), createSecurityReport(), createMetrics());

    const miss = cache.get('demo', 'hash-2');
    expect(miss).toBeUndefined();

    const stats = cache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(1);
  });

  it('evicts oldest entry when capacity exceeded', () => {
    const cache = new CodeCache({ maxSize: 1, ttlMs: 1_000 });
    cache.set('first', 'hash-1', createGeneratedCode('module.exports=1;'), createSecurityReport(), createMetrics());
    cache.set('second', 'hash-2', createGeneratedCode('module.exports=2;'), createSecurityReport(), createMetrics());

    expect(cache.get('first', 'hash-1')).toBeUndefined();
    expect(cache.get('second', 'hash-2')).toBeDefined();

    const stats = cache.getStats();
    expect(stats.evictions).toBe(1);
  });
});
