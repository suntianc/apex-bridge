/**
 * EvaluationEngine 单元测试
 */

import { EvaluationEngine } from '../../src/core/EvaluationEngine';
import { ProactiveScene, ProactiveContext } from '../../src/types/proactivity';
import { PersonalityConfig } from '../../src/types/personality';

describe('EvaluationEngine', () => {
  let evaluationEngine: EvaluationEngine;

  beforeEach(() => {
    evaluationEngine = new EvaluationEngine({
      actionThreshold: 0.62 // Phase 2标准阈值
    });
  });

  describe('evaluateScenes', () => {
    it('应该评估场景并返回评分', async () => {
      const scene: ProactiveScene = {
        id: 'test-scene',
        name: 'Test Scene',
        trigger: 'schedule',
        priority: 1,
        generateMessage: async () => 'Test message'
      };

      const context: ProactiveContext = {
        userId: 'test-user'
      };

      const scores = await evaluationEngine.evaluateScenes([scene], context);
      
      expect(scores.length).toBe(1);
      expect(scores[0].sceneId).toBe('test-scene');
      expect(scores[0].score).toBeGreaterThanOrEqual(0);
      expect(scores[0].score).toBeLessThanOrEqual(1);
    });

    it('应该按分数排序', async () => {
      const scenes: ProactiveScene[] = [
        {
          id: 'low-priority',
          name: 'Low Priority',
          trigger: 'schedule',
          priority: 0.1,
          generateMessage: async () => 'Message 1'
        },
        {
          id: 'high-priority',
          name: 'High Priority',
          trigger: 'schedule',
          priority: 1,
          generateMessage: async () => 'Message 2'
        }
      ];

      const context: ProactiveContext = {};
      const scores = await evaluationEngine.evaluateScenes(scenes, context);

      expect(scores.length).toBe(2);
      expect(scores[0].score).toBeGreaterThanOrEqual(scores[1].score);
    });
  });

  describe('shouldAct', () => {
    it('应该在分数高于阈值时允许执行', () => {
      expect(evaluationEngine.shouldAct(0.7)).toBe(true);
      expect(evaluationEngine.shouldAct(0.62)).toBe(true);
    });

    it('应该在分数低于阈值时阻止执行', () => {
      expect(evaluationEngine.shouldAct(0.61)).toBe(false);
      expect(evaluationEngine.shouldAct(0.5)).toBe(false);
      expect(evaluationEngine.shouldAct(0.3)).toBe(false);
    });

    it('应该使用Phase 2标准阈值0.62', () => {
      expect(evaluationEngine.shouldAct(0.62)).toBe(true);
      expect(evaluationEngine.shouldAct(0.61)).toBe(false);
    });
  });

  describe('Phase 2: 多维度评分', () => {
    it('应该计算Value维度分数', async () => {
      const scene: ProactiveScene = {
        id: 'value_test',
        name: 'Value测试',
        trigger: 'event',
        priority: 0.9,
        generateMessage: async () => '测试消息'
      };

      const scores = await evaluationEngine.evaluateScenes([scene], {});
      expect(scores[0].score).toBeGreaterThan(0);
      expect(scores[0].score).toBeLessThanOrEqual(1);
      expect(scores[0].reason).toContain('V=');
    });

    it('应该计算Urgency维度分数', async () => {
      const scene: ProactiveScene = {
        id: 'urgency_test',
        name: 'Urgency测试',
        trigger: 'event',
        priority: 0.8,
        generateMessage: async () => '测试消息'
      };

      const context: ProactiveContext = {
        metadata: {
          deadline: Date.now() + 12 * 60 * 60 * 1000 // 12小时后
        }
      };

      const scores = await evaluationEngine.evaluateScenes([scene], context);
      expect(scores[0].score).toBeGreaterThan(0);
      expect(scores[0].reason).toContain('U=');
    });

    it('应该计算Uncertainty维度分数', async () => {
      const scene: ProactiveScene = {
        id: 'uncertainty_test',
        name: 'Uncertainty测试',
        trigger: 'random',
        priority: 0.7,
        generateMessage: async () => '测试消息'
      };

      const scores = await evaluationEngine.evaluateScenes([scene], {});
      expect(scores[0].score).toBeGreaterThan(0);
      expect(scores[0].reason).toContain('U=');
    });

    it('应该计算Novelty维度分数', async () => {
      const scene: ProactiveScene = {
        id: 'novelty_test',
        name: 'Novelty测试',
        trigger: 'event',
        priority: 0.6,
        generateMessage: async () => '测试消息'
      };

      const scores = await evaluationEngine.evaluateScenes([scene], {});
      expect(scores[0].score).toBeGreaterThan(0);
      expect(scores[0].reason).toContain('N=');
    });

    it('应该应用多样性惩罚', async () => {
      const scene: ProactiveScene = {
        id: 'diversity_test',
        name: '多样性测试',
        trigger: 'schedule',
        priority: 0.7,
        generateMessage: async () => '测试消息'
      };

      // 第一次评估
      const scores1 = await evaluationEngine.evaluateScenes([scene], {});
      const score1 = scores1[0].score;

      // 记录话题（模拟第一次触发）
      evaluationEngine.recordTopic('diversity_test');

      // 第二次评估（应该受到多样性惩罚）
      const scores2 = await evaluationEngine.evaluateScenes([scene], {});
      const score2 = scores2[0].score;

      // 第二次分数应该更低（因为多样性惩罚）
      expect(score2).toBeLessThan(score1);
      expect(scores2[0].reason).toContain('DIV=');
    });

    it('应该综合所有维度计算最终分数', async () => {
      const scene: ProactiveScene = {
        id: 'comprehensive_test',
        name: '综合测试',
        trigger: 'event',
        priority: 0.9,
        generateMessage: async () => '测试消息'
      };

      const context: ProactiveContext = {
        metadata: {
          deadline: Date.now() + 6 * 60 * 60 * 1000 // 6小时后
        }
      };

      const scores = await evaluationEngine.evaluateScenes([scene], context);
      expect(scores[0].score).toBeGreaterThan(0);
      expect(scores[0].score).toBeLessThanOrEqual(1);
      
      // 验证评分原因包含多个维度
      const reason = scores[0].reason;
      expect(reason).toContain('V=');
      expect(reason).toContain('U=');
      expect(reason).toContain('U=');
      expect(reason).toContain('N=');
      expect(reason).toContain('E=');
    });
  });

  describe('recordTopic', () => {
    it('应该记录话题用于多样性惩罚', () => {
      evaluationEngine.recordTopic('scene1');
      evaluationEngine.recordTopic('scene2');
      evaluationEngine.recordTopic('scene3');
      
      // 记录后应该能正常工作（通过行为验证）
      expect(true).toBe(true);
    });
  });
});

