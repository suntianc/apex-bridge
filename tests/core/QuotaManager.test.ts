import { QuotaManager } from '../../src/core/QuotaManager';

describe('QuotaManager', () => {
  test('allows requests under limits', () => {
    const quota = new QuotaManager({
      maxRequestsPerMinute: 2,
      maxTokensPerDay: 100,
      maxConcurrentStreams: 1,
      burstMultiplier: 1
    });

    const decision1 = quota.consumeRequest('node-1');
    const decision2 = quota.consumeRequest('node-1');

    expect(decision1.allowed).toBe(true);
    expect(decision2.allowed).toBe(true);
  });

  test('blocks when per-minute limit exceeded', () => {
    const quota = new QuotaManager({
      maxRequestsPerMinute: 1,
      burstMultiplier: 1
    });

    quota.consumeRequest('node-1');
    const decision = quota.consumeRequest('node-1');

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('requests_per_minute_exceeded');
  });

  test('blocks when concurrent stream limit exceeded', () => {
    const quota = new QuotaManager({
      maxConcurrentStreams: 1
    });

    const first = quota.consumeRequest('node-1', { stream: true });
    const second = quota.consumeRequest('node-1', { stream: true });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.code).toBe('stream_concurrency_exceeded');

    quota.completeRequest('node-1', { stream: true });
    const third = quota.consumeRequest('node-1', { stream: true });
    expect(third.allowed).toBe(true);
  });

  test('tracks token quota', () => {
    const quota = new QuotaManager({
      maxTokensPerDay: 5
    });

    quota.consumeRequest('node-1');
    quota.completeRequest('node-1', { tokens: 5 });

    const decision = quota.consumeRequest('node-1');
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('token_quota_exceeded');
  });
});

