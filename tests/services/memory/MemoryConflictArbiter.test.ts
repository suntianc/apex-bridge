import { MemoryConflictArbiter } from '../../../src/services/memory/conflict/MemoryConflictArbiter';
import {
  ArbitrationResult,
  ConflictDetectionResult,
  ConflictSignal,
  MemoryConflictCandidate
} from '../../../src/types/memory';

describe('MemoryConflictArbiter', () => {
  let arbiter: MemoryConflictArbiter;

  beforeEach(() => {
    arbiter = new MemoryConflictArbiter();
  });

  describe('arbitrate', () => {
    it('should return keep action when no conflicts detected', () => {
      const candidate: MemoryConflictCandidate = {
        id: 'candidate-1',
        userId: 'user-1',
        content: 'Test content',
        importance: 0.8,
        timestamp: Date.now()
      };

      const detectionResult: ConflictDetectionResult = {
        candidate,
        conflicts: [],
        matchedRecords: []
      };

      const result = arbiter.arbitrate(detectionResult);

      expect(result.action).toBe('keep');
      expect(result.winner).toBe(candidate);
      expect(result.reason).toBe('No conflicts detected');
      expect(result.confidence).toBe(1.0);
    });

    it('should prioritize by importance when priorityImportance is enabled', () => {
      const candidate: MemoryConflictCandidate = {
        id: 'candidate-1',
        userId: 'user-1',
        content: 'Test content',
        importance: 0.9,
        timestamp: Date.now() - 10000
      };

      const existing: MemoryConflictCandidate = {
        id: 'existing-1',
        userId: 'user-1',
        content: 'Similar content',
        importance: 0.5,
        timestamp: Date.now()
      };

      const signals: ConflictSignal[] = [
        {
          type: 'semantic',
          score: 0.85,
          targetId: 'existing-1'
        }
      ];

      const detectionResult: ConflictDetectionResult = {
        candidate,
        conflicts: signals,
        matchedRecords: [existing]
      };

      const result = arbiter.arbitrate(detectionResult);

      expect(result.action).toBe('keep');
      expect(result.winner).toBe(candidate);
      expect(result.loser).toBe(existing);
      expect(result.reason).toContain('Importance-based');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should prioritize by timestamp when priorityRecency is enabled', () => {
      const candidate: MemoryConflictCandidate = {
        id: 'candidate-1',
        userId: 'user-1',
        content: 'Test content',
        importance: 0.5,
        timestamp: Date.now()
      };

      const existing: MemoryConflictCandidate = {
        id: 'existing-1',
        userId: 'user-1',
        content: 'Similar content',
        importance: 0.5,
        timestamp: Date.now() - 10000
      };

      const signals: ConflictSignal[] = [
        {
          type: 'semantic',
          score: 0.85,
          targetId: 'existing-1'
        }
      ];

      const detectionResult: ConflictDetectionResult = {
        candidate,
        conflicts: signals,
        matchedRecords: [existing]
      };

      const result = arbiter.arbitrate(detectionResult);

      expect(result.action).toBe('keep');
      expect(result.winner).toBe(candidate);
      expect(result.loser).toBe(existing);
      expect(result.reason).toContain('Recency-based');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should prioritize by source type when prioritySource is enabled', () => {
      const candidate: MemoryConflictCandidate = {
        id: 'candidate-1',
        userId: 'user-1',
        content: 'Test content',
        importance: 0.5,
        timestamp: Date.now(),
        source: 'user'
      };

      const existing: MemoryConflictCandidate = {
        id: 'existing-1',
        userId: 'user-1',
        content: 'Similar content',
        importance: 0.5,
        timestamp: Date.now(),
        source: 'inferred'
      };

      const signals: ConflictSignal[] = [
        {
          type: 'semantic',
          score: 0.85,
          targetId: 'existing-1'
        }
      ];

      const detectionResult: ConflictDetectionResult = {
        candidate,
        conflicts: signals,
        matchedRecords: [existing]
      };

      const result = arbiter.arbitrate(detectionResult);

      expect(result.action).toBe('keep');
      expect(result.winner).toBe(candidate);
      expect(result.loser).toBe(existing);
      expect(result.reason).toContain('Source-based');
      expect(result.confidence).toBe(0.7);
    });

    it('should suggest merge when scores are close', () => {
      const candidate: MemoryConflictCandidate = {
        id: 'candidate-1',
        userId: 'user-1',
        content: 'Test content',
        importance: 0.5,
        timestamp: Date.now(),
        source: 'conversation'
      };

      const existing: MemoryConflictCandidate = {
        id: 'existing-1',
        userId: 'user-1',
        content: 'Similar content',
        importance: 0.5,
        timestamp: Date.now(),
        source: 'conversation'
      };

      const signals: ConflictSignal[] = [
        {
          type: 'semantic',
          score: 0.85,
          targetId: 'existing-1'
        }
      ];

      const detectionResult: ConflictDetectionResult = {
        candidate,
        conflicts: signals,
        matchedRecords: [existing]
      };

      const result = arbiter.arbitrate(detectionResult, {
        allowMerge: true,
        mergeThreshold: 0.5 // Large threshold to force merge
      });

      expect(result.action).toBe('merge');
      expect(result.winner).toBe(candidate);
      expect(result.loser).toBe(existing);
      expect(result.reason).toContain('Multi-factor scores are close');
      expect(result.confidence).toBe(0.6);
    });

    it('should use default strategy when all factors are equal', () => {
      const candidate: MemoryConflictCandidate = {
        id: 'candidate-1',
        userId: 'user-1',
        content: 'Test content',
        importance: 0.5,
        timestamp: Date.now(),
        source: 'conversation'
      };

      const existing: MemoryConflictCandidate = {
        id: 'existing-1',
        userId: 'user-1',
        content: 'Similar content',
        importance: 0.5,
        timestamp: Date.now(),
        source: 'conversation'
      };

      const signals: ConflictSignal[] = [
        {
          type: 'semantic',
          score: 0.5,
          targetId: 'existing-1'
        }
      ];

      const detectionResult: ConflictDetectionResult = {
        candidate,
        conflicts: signals,
        matchedRecords: [existing]
      };

      const result = arbiter.arbitrate(detectionResult, {
        allowMerge: false,
        defaultStrategy: 'keep-candidate'
      });

      expect(result.action).toBe('keep');
      expect(result.reason).toContain('Default strategy');
      expect(result.confidence).toBe(0.5);
    });

    it('should select most severe conflict when multiple matches exist', () => {
      const candidate: MemoryConflictCandidate = {
        id: 'candidate-1',
        userId: 'user-1',
        content: 'Test content',
        importance: 0.9, // Higher importance to ensure keep action
        timestamp: Date.now(),
        source: 'user'
      };

      const existing1: MemoryConflictCandidate = {
        id: 'existing-1',
        userId: 'user-1',
        content: 'Similar content 1',
        importance: 0.5,
        timestamp: Date.now() - 1000,
        source: 'conversation'
      };

      const existing2: MemoryConflictCandidate = {
        id: 'existing-2',
        userId: 'user-1',
        content: 'Similar content 2',
        importance: 0.5,
        timestamp: Date.now() - 2000,
        source: 'conversation'
      };

      const signals: ConflictSignal[] = [
        {
          type: 'semantic',
          score: 0.7,
          targetId: 'existing-1'
        },
        {
          type: 'semantic',
          score: 0.9,
          targetId: 'existing-2'
        }
      ];

      const detectionResult: ConflictDetectionResult = {
        candidate,
        conflicts: signals,
        matchedRecords: [existing1, existing2]
      };

      const result = arbiter.arbitrate(detectionResult, {
        allowMerge: false // Disable merge to force keep action
      });

      expect(result.action).toBe('keep');
      // Should arbitrate against existing2 (most severe conflict)
      expect(result.loser?.id).toBe('existing-2');
    });

    it('should respect custom factor weights', () => {
      const candidate: MemoryConflictCandidate = {
        id: 'candidate-1',
        userId: 'user-1',
        content: 'Test content',
        importance: 0.5,
        timestamp: Date.now() - 10000,
        source: 'user'
      };

      const existing: MemoryConflictCandidate = {
        id: 'existing-1',
        userId: 'user-1',
        content: 'Similar content',
        importance: 0.9,
        timestamp: Date.now(),
        source: 'inferred'
      };

      const signals: ConflictSignal[] = [
        {
          type: 'semantic',
          score: 0.85,
          targetId: 'existing-1'
        }
      ];

      const detectionResult: ConflictDetectionResult = {
        candidate,
        conflicts: signals,
        matchedRecords: [existing]
      };

      // With default weights, importance should win
      const result1 = arbiter.arbitrate(detectionResult, {
        priorityImportance: false,
        priorityRecency: true
      });

      expect(result1.action).toBe('keep');
      expect(result1.winner).toBe(existing); // Should win due to recency

      // With recency disabled, source should win
      const result2 = arbiter.arbitrate(detectionResult, {
        priorityImportance: false,
        priorityRecency: false,
        prioritySource: true
      });

      expect(result2.action).toBe('keep');
      expect(result2.winner).toBe(candidate); // Should win due to source priority
    });
  });
});

