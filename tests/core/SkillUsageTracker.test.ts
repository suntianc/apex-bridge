import { SkillUsageTracker } from '../../src/core/skills/SkillUsageTracker';
import { ExecutionResponse, ExecutionMetadata } from '../../src/types';

describe('SkillUsageTracker', () => {
  let tracker: SkillUsageTracker;

  beforeEach(() => {
    tracker = new SkillUsageTracker(24 * 60 * 60 * 1000); // 24小时窗口
  });

  afterEach(() => {
    tracker.clear();
  });

  const createMockResponse = (
    success: boolean,
    executionTime: number,
    cacheHit: boolean,
    executionType: string = 'direct'
  ): ExecutionResponse => ({
    success,
    metadata: {
      executionTime,
      memoryUsage: 0,
      tokenUsage: 0,
      cacheHit,
      executionType: executionType as any,
      timestamp: Date.now()
    }
  });

  describe('recordExecution', () => {
    it('应该记录技能执行', () => {
      const response = createMockResponse(true, 100, false);
      tracker.recordExecution('test-skill', response, 0.8, false);

      const record = tracker.getUsageRecord('test-skill');
      expect(record).toBeDefined();
      expect(record?.executionCount).toBe(1);
      expect(record?.averageConfidence).toBe(0.8);
      expect(record?.requiresResources).toBe(false);
    });

    it('应该累计多次执行', () => {
      const response1 = createMockResponse(true, 100, false);
      const response2 = createMockResponse(true, 150, true);

      tracker.recordExecution('test-skill', response1, 0.8, false);
      tracker.recordExecution('test-skill', response2, 0.9, false);

      const record = tracker.getUsageRecord('test-skill');
      expect(record?.executionCount).toBe(2);
      expect(record?.averageConfidence).toBeCloseTo(0.85, 2); // (0.8 + 0.9) / 2
      expect(record?.totalExecutionTime).toBe(250);
      expect(record?.cacheHitRate).toBe(0.5); // 1 hit / 2 requests
    });

    it('应该跟踪缓存命中率', () => {
      const response1 = createMockResponse(true, 100, true);
      const response2 = createMockResponse(true, 100, false);
      const response3 = createMockResponse(true, 100, true);

      tracker.recordExecution('test-skill', response1, 0.8);
      tracker.recordExecution('test-skill', response2, 0.8);
      tracker.recordExecution('test-skill', response3, 0.8);

      const record = tracker.getUsageRecord('test-skill');
      expect(record?.cacheHitRate).toBeCloseTo(0.667, 2); // 2 hits / 3 requests
    });
  });

  describe('getAllUsageRecords', () => {
    it('应该返回所有使用记录', () => {
      tracker.recordExecution('skill1', createMockResponse(true, 100, false), 0.8);
      tracker.recordExecution('skill2', createMockResponse(true, 200, false), 0.9);
      tracker.recordExecution('skill3', createMockResponse(true, 150, false), 0.7);

      const records = tracker.getAllUsageRecords();
      expect(records.length).toBe(3);
      expect(records.map((r) => r.skillName)).toContain('skill1');
      expect(records.map((r) => r.skillName)).toContain('skill2');
      expect(records.map((r) => r.skillName)).toContain('skill3');
    });

    it('应该过滤过期记录', () => {
      const shortWindowTracker = new SkillUsageTracker(1000); // 1秒窗口

      shortWindowTracker.recordExecution('skill1', createMockResponse(true, 100, false), 0.8);
      shortWindowTracker.recordExecution('skill2', createMockResponse(true, 200, false), 0.9);

      // 等待过期
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const records = shortWindowTracker.getAllUsageRecords();
          expect(records.length).toBe(0);
          resolve();
        }, 1100);
      });
    });
  });

  describe('getTopSkills', () => {
    it('应该返回使用频率最高的技能', () => {
      tracker.recordExecution('skill1', createMockResponse(true, 100, false), 0.8);
      tracker.recordExecution('skill1', createMockResponse(true, 100, false), 0.8);
      tracker.recordExecution('skill1', createMockResponse(true, 100, false), 0.8);
      tracker.recordExecution('skill2', createMockResponse(true, 200, false), 0.9);
      tracker.recordExecution('skill3', createMockResponse(true, 150, false), 0.7);

      const topSkills = tracker.getTopSkills(2);
      expect(topSkills.length).toBe(2);
      expect(topSkills[0].skillName).toBe('skill1'); // 执行次数最多
    });
  });

  describe('clearExpired', () => {
    it('应该清理过期记录', () => {
      const shortWindowTracker = new SkillUsageTracker(1000); // 1秒窗口

      shortWindowTracker.recordExecution('skill1', createMockResponse(true, 100, false), 0.8);

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          shortWindowTracker.clearExpired();
          const record = shortWindowTracker.getUsageRecord('skill1');
          expect(record).toBeUndefined();
          resolve();
        }, 1100);
      });
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', () => {
      tracker.recordExecution('skill1', createMockResponse(true, 100, false), 0.8);
      tracker.recordExecution('skill1', createMockResponse(true, 100, false), 0.8);
      tracker.recordExecution('skill2', createMockResponse(true, 200, false), 0.9);

      const stats = tracker.getStats();
      expect(stats.totalSkills).toBe(2);
      expect(stats.totalExecutions).toBe(3);
      expect(stats.averageExecutionsPerSkill).toBe(1.5);
    });
  });
});

