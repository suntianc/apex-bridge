import { DefaultPreloadStrategy } from '../../src/core/skills/PreloadStrategy';
import {
  SkillUsageRecord,
  UsagePattern,
  PreloadContext,
  PreloadConfig
} from '../../src/types';

describe('DefaultPreloadStrategy', () => {
  let strategy: DefaultPreloadStrategy;

  beforeEach(() => {
    strategy = new DefaultPreloadStrategy();
  });

  const createUsageRecord = (
    skillName: string,
    executionCount: number,
    averageConfidence: number,
    cacheHitRate: number,
    lastExecutedAt: number = Date.now()
  ): SkillUsageRecord => ({
    skillName,
    executionCount,
    lastExecutedAt,
    firstExecutedAt: lastExecutedAt - 1000,
    averageConfidence,
    totalExecutionTime: executionCount * 100,
    averageExecutionTime: 100,
    cacheHitRate,
    requiresResources: false,
    executionType: 'direct'
  });

  const createPreloadContext = (
    currentLoad: number = 0.2,
    availableMemory: number = 500
  ): PreloadContext => ({
    currentLoad,
    availableMemory,
    timeSinceLastExecution: 0,
    cacheStats: {
      metadataHitRate: 0.8,
      contentHitRate: 0.6,
      resourceHitRate: 0.5
    }
  });

  describe('analyzeUsagePatterns', () => {
    it('应该分析使用模式并计算优先级', () => {
      const records: SkillUsageRecord[] = [
        createUsageRecord('skill1', 10, 0.9, 0.8),
        createUsageRecord('skill2', 5, 0.7, 0.6),
        createUsageRecord('skill3', 2, 0.5, 0.4)
      ];

      const patterns = strategy.analyzeUsagePatterns(records);

      expect(patterns.length).toBe(3);
      expect(patterns[0].skillName).toBe('skill1');
      expect(patterns[0].frequency).toBeGreaterThan(patterns[1].frequency);
      expect(patterns[0].priority).toBeGreaterThan(patterns[1].priority);
    });

    it('应该处理空记录', () => {
      const patterns = strategy.analyzeUsagePatterns([]);
      expect(patterns.length).toBe(0);
    });

    it('应该计算综合优先级分数', () => {
      const records: SkillUsageRecord[] = [
        createUsageRecord('high-freq', 20, 0.9, 0.8),
        createUsageRecord('low-freq', 1, 0.5, 0.3)
      ];

      const patterns = strategy.analyzeUsagePatterns(records);
      const highFreqPattern = patterns.find((p) => p.skillName === 'high-freq');
      const lowFreqPattern = patterns.find((p) => p.skillName === 'low-freq');

      expect(highFreqPattern?.priority).toBeGreaterThan(lowFreqPattern?.priority ?? 0);
    });
  });

  describe('shouldPreload', () => {
    it('应该允许预加载高频高置信度技能', () => {
      const pattern: UsagePattern = {
        skillName: 'test-skill',
        frequency: 0.15, // 15%
        confidence: 0.8, // 80%
        recency: Date.now(),
        requiresResources: false,
        priority: 0.7
      };

      const context = createPreloadContext(0.2, 500);

      expect(strategy.shouldPreload(pattern, context)).toBe(true);
    });

    it('应该拒绝频率过低的技能', () => {
      const pattern: UsagePattern = {
        skillName: 'test-skill',
        frequency: 0.05, // 5% < 10% 阈值
        confidence: 0.8,
        recency: Date.now(),
        requiresResources: false,
        priority: 0.5
      };

      const context = createPreloadContext(0.2, 500);

      expect(strategy.shouldPreload(pattern, context)).toBe(false);
    });

    it('应该拒绝置信度过低的技能', () => {
      const pattern: UsagePattern = {
        skillName: 'test-skill',
        frequency: 0.15,
        confidence: 0.5, // 50% < 70% 阈值
        recency: Date.now(),
        requiresResources: false,
        priority: 0.5
      };

      const context = createPreloadContext(0.2, 500);

      expect(strategy.shouldPreload(pattern, context)).toBe(false);
    });

    it('应该拒绝高负载时的预加载', () => {
      const pattern: UsagePattern = {
        skillName: 'test-skill',
        frequency: 0.15,
        confidence: 0.8,
        recency: Date.now(),
        requiresResources: false,
        priority: 0.7
      };

      const context = createPreloadContext(0.5, 500); // 50% 负载 > 30% 阈值

      expect(strategy.shouldPreload(pattern, context)).toBe(false);
    });

    it('应该拒绝内存不足时的预加载', () => {
      const pattern: UsagePattern = {
        skillName: 'test-skill',
        frequency: 0.15,
        confidence: 0.8,
        recency: Date.now(),
        requiresResources: false,
        priority: 0.7
      };

      const context = createPreloadContext(0.2, 50); // 50MB < 100MB 阈值

      expect(strategy.shouldPreload(pattern, context)).toBe(false);
    });

    it('应该拒绝缓存命中率已经很高的情况', () => {
      const pattern: UsagePattern = {
        skillName: 'test-skill',
        frequency: 0.15,
        confidence: 0.8,
        recency: Date.now(),
        requiresResources: false,
        priority: 0.7
      };

      const context: PreloadContext = {
        currentLoad: 0.2,
        availableMemory: 500,
        timeSinceLastExecution: 0,
        cacheStats: {
          metadataHitRate: 0.8,
          contentHitRate: 0.95, // > 90%
          resourceHitRate: 0.5
        }
      };

      expect(strategy.shouldPreload(pattern, context)).toBe(false);
    });
  });

  describe('getPreloadPriority', () => {
    it('应该按优先级排序并返回前N个', () => {
      const patterns: UsagePattern[] = [
        {
          skillName: 'skill1',
          frequency: 0.1,
          confidence: 0.8,
          recency: Date.now(),
          requiresResources: false,
          priority: 0.9
        },
        {
          skillName: 'skill2',
          frequency: 0.15,
          confidence: 0.7,
          recency: Date.now(),
          requiresResources: false,
          priority: 0.6
        },
        {
          skillName: 'skill3',
          frequency: 0.2,
          confidence: 0.9,
          recency: Date.now(),
          requiresResources: false,
          priority: 0.8
        }
      ];

      const prioritized = strategy.getPreloadPriority(patterns);

      expect(prioritized.length).toBeLessThanOrEqual(10); // 默认 maxSkills = 10
      expect(prioritized[0].priority).toBeGreaterThanOrEqual(prioritized[1]?.priority ?? 0);
    });

    it('应该过滤掉优先级为0的模式', () => {
      const patterns: UsagePattern[] = [
        {
          skillName: 'skill1',
          frequency: 0.1,
          confidence: 0.8,
          recency: Date.now(),
          requiresResources: false,
          priority: 0.5
        },
        {
          skillName: 'skill2',
          frequency: 0.05,
          confidence: 0.3,
          recency: Date.now(),
          requiresResources: false,
          priority: 0 // 优先级为0
        }
      ];

      const prioritized = strategy.getPreloadPriority(patterns);

      expect(prioritized.length).toBe(1);
      expect(prioritized[0].skillName).toBe('skill1');
    });
  });

  describe('配置管理', () => {
    it('应该允许更新配置', () => {
      strategy.updateConfig({ frequencyThreshold: 0.2 });

      const config = strategy.getConfig();
      expect(config.frequencyThreshold).toBe(0.2);
    });

    it('应该使用自定义配置', () => {
      const customStrategy = new DefaultPreloadStrategy({
        maxSkills: 5,
        frequencyThreshold: 0.15
      });

      const config = customStrategy.getConfig();
      expect(config.maxSkills).toBe(5);
      expect(config.frequencyThreshold).toBe(0.15);
    });
  });
});

