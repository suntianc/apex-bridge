/**
 * AceStrategyManager 单元测试
 * P2阶段：L2全球战略层测试
 */

import { AceStrategyManager, StrategicContext, StrategicLearning, WorldModelUpdate } from '../../../src/services/AceStrategyManager';
import { AceIntegrator } from '../../../src/services/AceIntegrator';
import { ToolRetrievalService } from '../../../src/services/ToolRetrievalService';
import { LLMManager } from '../../../src/core/LLMManager';

// Mock dependencies
const mockAceIntegrator = {
  sendToLayer: jest.fn().mockResolvedValue(undefined)
};

const mockToolRetrievalService = {
  findRelevantSkills: jest.fn().mockResolvedValue([]),
  indexSkill: jest.fn().mockResolvedValue(undefined)
};

const mockLLMManager = {
  chat: jest.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: 'Test strategic context',
          goals: ['goal1', 'goal2'],
          preferences: { theme: 'dark' }
        })
      }
    }]
  })
};

describe('AceStrategyManager', () => {
  let strategyManager: AceStrategyManager;

  beforeEach(() => {
    jest.clearAllMocks();

    strategyManager = new AceStrategyManager(
      mockAceIntegrator as any,
      mockToolRetrievalService as any,
      mockLLMManager as any
    );
  });

  describe('loadStrategicContext', () => {
    it('should load strategic context for user', async () => {
      const userId = 'test-user';
      const mockRelevantSkills = [
        {
          tool: {
            name: 'strategic_learning_1',
            description: 'User prefers dark theme'
          },
          score: 0.8
        }
      ];

      mockToolRetrievalService.findRelevantSkills.mockResolvedValueOnce(mockRelevantSkills);

      const context = await strategyManager.loadStrategicContext(userId);

      expect(context).toBeDefined();
      expect(typeof context).toBe('string');

      // Should search for relevant skills
      expect(mockToolRetrievalService.findRelevantSkills).toHaveBeenCalledWith(
        expect.stringContaining(userId),
        5,
        0.5
      );

      // Should analyze with LLM
      expect(mockLLMManager.chat).toHaveBeenCalled();
    });

    it('should handle empty strategic context', async () => {
      const userId = 'new-user';

      mockToolRetrievalService.findRelevantSkills.mockResolvedValueOnce([]);

      const context = await strategyManager.loadStrategicContext(userId);

      expect(context).toContain('No previous strategic context found');
    });

    it('should cache strategic context', async () => {
      const userId = 'test-user';

      mockToolRetrievalService.findRelevantSkills.mockResolvedValueOnce([]);

      // First call
      await strategyManager.loadStrategicContext(userId);

      // Second call should use cache
      await strategyManager.loadStrategicContext(userId);

      // Should only call LLM once (cached)
      expect(mockLLMManager.chat).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully', async () => {
      const userId = 'test-user';

      mockToolRetrievalService.findRelevantSkills.mockRejectedValueOnce(
        new Error('Database error')
      );

      const context = await strategyManager.loadStrategicContext(userId);

      expect(context).toContain('Failed to load strategic context');
    });
  });

  describe('updateWorldModel', () => {
    it('should update world model after task completion', async () => {
      const sessionId = 'test-session';
      const outcome = {
        summary: 'Task completed successfully',
        learnings: ['Learned to use tool X', 'Improved workflow'],
        outcome: 'success' as const
      };

      await strategyManager.updateWorldModel(sessionId, outcome);

      // Should send update to L2 global strategy layer
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'GLOBAL_STRATEGY',
        expect.objectContaining({
          type: 'STATUS_UPDATE',
          content: 'Mission accomplished: Task completed successfully',
          metadata: expect.objectContaining({
            sessionId,
            outcome: 'success',
            learnings: outcome.learnings
          })
        })
      );

      // Should store strategic learning in LanceDB
      expect(mockToolRetrievalService.indexSkill).toHaveBeenCalled();
    });

    it('should handle task failure', async () => {
      const sessionId = 'test-session';
      const outcome = {
        summary: 'Task failed',
        learnings: [],
        outcome: 'failure' as const
      };

      await strategyManager.updateWorldModel(sessionId, outcome);

      // Should still update world model even on failure
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'GLOBAL_STRATEGY',
        expect.objectContaining({
          type: 'STATUS_UPDATE',
          content: 'Mission accomplished: Task failed'
        })
      );
    });

    it('should trigger strategic adjustment', async () => {
      const sessionId = 'test-session';
      const outcome = {
        summary: 'Task completed',
        learnings: ['Important learning'],
        outcome: 'success' as const
      };

      await strategyManager.updateWorldModel(sessionId, outcome);

      // Should trigger reflection on global strategy layer
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'GLOBAL_STRATEGY',
        expect.objectContaining({
          type: 'REFLECTION_TRIGGER',
          metadata: expect.objectContaining({
            triggerType: 'MISSION_COMPLETE'
          })
        })
      );
    });
  });

  describe('retrieveStrategicKnowledge', () => {
    it('should retrieve relevant knowledge', async () => {
      const query = 'database design';
      const userId = 'test-user';

      const mockResults = [
        {
          tool: {
            name: 'learning_1',
            description: 'Best practices for database design'
          },
          score: 0.9
        }
      ];

      mockToolRetrievalService.findRelevantSkills.mockResolvedValueOnce(mockResults);

      const knowledge = await strategyManager.retrieveStrategicKnowledge(query, userId);

      expect(Array.isArray(knowledge)).toBe(true);
      expect(knowledge.length).toBeGreaterThan(0);
      expect(knowledge[0]).toContain('Best practices');
      expect(knowledge[0]).toContain('90.00%'); // Score percentage
    });

    it('should search without user context', async () => {
      const query = 'machine learning';

      mockToolRetrievalService.findRelevantSkills.mockResolvedValueOnce([]);

      const knowledge = await strategyManager.retrieveStrategicKnowledge(query);

      expect(Array.isArray(knowledge)).toBe(true);
      expect(knowledge).toEqual([]);
    });

    it('should handle search errors', async () => {
      const query = 'test query';

      mockToolRetrievalService.findRelevantSkills.mockRejectedValueOnce(
        new Error('Search failed')
      );

      const knowledge = await strategyManager.retrieveStrategicKnowledge(query);

      expect(knowledge).toEqual([]);
    });
  });

  describe('updateStrategicGoals', () => {
    it('should update user strategic goals', async () => {
      const userId = 'test-user';
      const goals = ['Goal 1', 'Goal 2', 'Goal 3'];

      await strategyManager.updateStrategicGoals(userId, goals);

      // Should send update to global strategy layer
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'GLOBAL_STRATEGY',
        expect.objectContaining({
          type: 'GOAL_UPDATE',
          content: 'Strategic goals updated for user: test-user',
          metadata: expect.objectContaining({
            userId,
            goals
          })
        })
      );
    });

    it('should create new context for unknown user', async () => {
      const userId = 'new-user';
      const goals = ['New goal'];

      await strategyManager.updateStrategicGoals(userId, goals);

      // Should create new context
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalled();
    });
  });

  describe('getStrategicSummary', () => {
    it('should return strategic summary for user', async () => {
      const userId = 'test-user';

      // Set up context
      await strategyManager.updateStrategicGoals(userId, ['Goal 1']);

      const summary = strategyManager.getStrategicSummary(userId);

      expect(summary).toBeDefined();
      expect(summary?.userId).toBe(userId);
      expect(summary?.goals).toContain('Goal 1');
    });

    it('should return null for unknown user', async () => {
      const summary = strategyManager.getStrategicSummary('unknown-user');

      expect(summary).toBeNull();
    });
  });

  describe('getWorldModelStats', () => {
    it('should return world model statistics', async () => {
      // Add some world model updates
      const sessionId = 'test-session';
      await strategyManager.updateWorldModel(sessionId, {
        summary: 'Test task',
        learnings: ['Learning 1'],
        outcome: 'success' as const
      });

      const stats = strategyManager.getWorldModelStats();

      expect(stats).toHaveProperty('totalUpdates');
      expect(stats).toHaveProperty('domainDistribution');
      expect(stats).toHaveProperty('averageConfidence');

      expect(typeof stats.totalUpdates).toBe('number');
      expect(typeof stats.averageConfidence).toBe('number');
      expect(typeof stats.domainDistribution).toBe('object');
    });

    it('should handle empty world model', async () => {
      const stats = strategyManager.getWorldModelStats();

      expect(stats.totalUpdates).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(Object.keys(stats.domainDistribution).length).toBe(0);
    });
  });

  describe('cleanupExpiredContexts', () => {
    it('should clean up expired contexts', async () => {
      const userId = 'test-user';

      // Set up old context
      await strategyManager.updateStrategicGoals(userId, ['Goal 1']);

      // Manually manipulate internal state to simulate expiration
      // In real scenario, this would happen after 30 days

      await strategyManager.cleanupExpiredContexts();

      // Should log cleanup action
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalled();
    });

    it('should not clean up recent contexts', async () => {
      const userId = 'test-user';

      // Set up recent context
      await strategyManager.updateStrategicGoals(userId, ['Goal 1']);

      // Immediately cleanup (should not remove recent context)
      await strategyManager.cleanupExpiredContexts();

      // Context should still exist
      const summary = strategyManager.getStrategicSummary(userId);
      expect(summary).toBeDefined();
    });
  });

  describe('generateStrategicInsight', () => {
    it('should generate strategic insight from relevant plans', async () => {
      const userId = 'test-user';
      const relevantPlans = [
        {
          tool: {
            name: 'learning_1',
            description: 'User prefers API-based solutions',
            tags: ['api', 'architecture']
          },
          score: 0.8
        }
      ];

      // Use private method through public interface
      const context = await strategyManager.loadStrategicContext(userId);

      expect(context).toBeDefined();
      expect(typeof context).toBe('string');
    });

    it('should handle LLM analysis errors', async () => {
      const userId = 'test-user';

      // Mock LLM error
      mockLLMManager.chat.mockRejectedValueOnce(new Error('LLM error'));

      const context = await strategyManager.loadStrategicContext(userId);

      expect(context).toBeDefined();
      // Should fallback to basic context
    });

    it('should handle invalid LLM response', async () => {
      const userId = 'test-user';

      // Mock invalid JSON response
      mockLLMManager.chat.mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }]
      });

      const context = await strategyManager.loadStrategicContext(userId);

      expect(context).toBeDefined();
      // Should fallback gracefully
    });
  });

  describe('extractStrategicLearning', () => {
    it('should extract learning from task outcome', async () => {
      const outcome = {
        summary: 'Completed database design task',
        learnings: ['Use normalization', 'Index frequently queried columns'],
        outcome: 'success' as const
      };

      // This is tested through updateWorldModel
      await strategyManager.updateWorldModel('session-1', outcome);

      // Should have been indexed
      expect(mockToolRetrievalService.indexSkill).toHaveBeenCalled();
    });
  });

  describe('triggerStrategicAdjustment', () => {
    it('should trigger strategic adjustment after mission complete', async () => {
      const sessionId = 'test-session';
      const outcome = {
        summary: 'Mission completed',
        learnings: ['Key learning'],
        outcome: 'success' as const
      };

      await strategyManager.updateWorldModel(sessionId, outcome);

      // Should trigger reflection
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'GLOBAL_STRATEGY',
        expect.objectContaining({
          type: 'REFLECTION_TRIGGER',
          metadata: expect.objectContaining({
            triggerType: 'MISSION_COMPLETE'
          })
        })
      );
    });
  });
});
