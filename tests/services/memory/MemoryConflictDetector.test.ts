import { MemoryConflictDetector } from '../../../src/services/memory/conflict/MemoryConflictDetector';

const baseCandidate = {
  id: 'candidate',
  userId: 'user-1',
  content: '提醒我今天下午2点去开会',
  embedding: [0.1, 0.2, 0.3],
  timestamp: Date.now(),
  importance: 0.9,
  keywords: ['提醒', '开会', '下午']
};

const buildDetector = () =>
  new MemoryConflictDetector({
    semanticThreshold: 0.75,
    keywordOverlapThreshold: 0.4,
    timeWindowMs: 60_000,
    importanceDelta: 0.2
  });

describe('MemoryConflictDetector', () => {
  it('detects semantic similarity conflicts', () => {
    const detector = buildDetector();
    const existing = [
      {
        ...baseCandidate,
        id: 'existing',
        embedding: [0.11, 0.19, 0.31]
      }
    ];

    const result = detector.detectConflicts(baseCandidate, existing);
    const semanticSignals = result.conflicts.filter((signal) => signal.type === 'semantic');

    expect(semanticSignals).toHaveLength(1);
    expect(semanticSignals[0].targetId).toBe('existing');
  });

  it('detects keyword overlap conflicts', () => {
    const detector = buildDetector();
    const existing = [
      {
        ...baseCandidate,
        id: 'keywords',
        embedding: undefined,
        content: '下午需要提醒我准时开会'
      }
    ];

    const result = detector.detectConflicts(baseCandidate, existing);
    const keywordSignals = result.conflicts.filter((signal) => signal.type === 'keyword');

    expect(keywordSignals).toHaveLength(1);
    expect(keywordSignals[0].targetId).toBe('keywords');
  });

  it('detects time window conflicts', () => {
    const detector = buildDetector();
    const existing = [
      {
        ...baseCandidate,
        id: 'time',
        timestamp: (baseCandidate.timestamp ?? 0) - 10_000
      }
    ];

    const result = detector.detectConflicts(baseCandidate, existing);
    expect(result.conflicts.some((signal) => signal.type === 'time')).toBe(true);
  });

  it('detects importance conflicts when difference is large', () => {
    const detector = buildDetector();
    const existing = [
      {
        ...baseCandidate,
        id: 'importance',
        importance: 0.1
      }
    ];

    const result = detector.detectConflicts(baseCandidate, existing);
    expect(result.conflicts.some((signal) => signal.type === 'importance')).toBe(true);
  });

  it('ignores records belonging to other users', () => {
    const detector = buildDetector();
    const existing = [
      {
        ...baseCandidate,
        id: 'other-user',
        userId: 'user-2'
      }
    ];

    const result = detector.detectConflicts(baseCandidate, existing);
    expect(result.conflicts).toHaveLength(0);
  });
});

