/**
 * ACE L2/L3集成测试
 * P2阶段：L2/L3层协同工作测试
 */

import { AceL2L3Integration } from '../../../src/services/ACE-L2-L3-Integration';
import { AceCapabilityManager } from '../../../src/services/AceCapabilityManager';
import { AceStrategyManager } from '../../../src/services/AceStrategyManager';
import { AceIntegrator } from '../../../src/services/AceIntegrator';
import { SkillManager } from '../../../src/services/SkillManager';
import { ToolRetrievalService } from '../../../src/services/ToolRetrievalService';
import { LLMManager } from '../../../src/core/LLMManager';

// Mock dependencies
const mockAceIntegrator = {
  sendToLayer: jest.fn().mockResolvedValue(undefined),
  completeTask: jest.fn().mockResolvedValue(undefined)
};

const mockSkillManager = {
  listSkills: jest.fn().mockResolvedValue({
    skills: [
      {
        name: 'skill-1',
        enabled: true,
        type: 'skill' as const,
        description: 'Test skill 1',
        tags: ['test'],
        version: '1.0.0',
        path: '/path/to/skill-1',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        level: 3
      }
    ],
    total: 1
  }),
  getSkillByName: jest.fn().mockImplementation((name: string) => ({
    name,
    enabled: true,
    type: 'skill' as const,
    description: `Test skill ${name}`,
    tags: ['test'],
    version: '1.0.0',
    path: `/path/to/${name}`,
    parameters: {
      type: 'object' as const,
      properties: {}
    },
    level: 3
  })),
  installSkill: jest.fn(),
  uninstallSkill: jest.fn()
};

const mockToolRetrievalService = {
  indexSkill: jest.fn().mockResolvedValue(undefined),
  removeSkill: jest.fn().mockResolvedValue(undefined),
  findRelevantSkills: jest.fn().mockResolvedValue([])
};

const mockLLMManager = {
  chat: jest.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: 'Test strategic context',
          goals: ['goal1'],
          preferences: {}
        })
      }
    }]
  })
};

describe('AceL2L3Integration', () => {
  let integration: AceL2L3Integration;

  beforeEach(() => {
    jest.clearAllMocks();

    integration = new AceL2L3Integration(
      mockAceIntegrator as any,
      mockSkillManager as any,
      mockToolRetrievalService as any,
      mockLLMManager as any
    );
  });

  describe('loadStrategicContextForSession', () => {
    it('should load strategic context for session', async () => {
      const userId = 'test-user';

      const context = await integration.loadStrategicContextForSession(userId);

      expect(context).toBeDefined();
      expect(typeof context).toBe('string');

      // Should delegate to strategy manager
      expect(mockLLMManager.chat).toHaveBeenCalled();
    });

    it('should handle new user without history', async () => {
      const userId = 'new-user';

      mockToolRetrievalService.findRelevantSkills.mockResolvedValueOnce([]);

      const context = await integration.loadStrategicContextForSession(userId);

      expect(context).toContain('No previous strategic context found');
    });
  });

  describe('trackSkillUsage', () => {
    it('should track skill usage through L3', async () => {
      const skillName = 'test-skill';

      await integration.trackSkillUsage(skillName);

      // Should delegate to capability manager
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          type: 'ACTIVITY_UPDATE',
          content: 'Skill test-skill accessed'
        })
      );
    });
  });

  describe('markSkillAsFaulty', () => {
    it('should mark skill as faulty through L3', async () => {
      const skillName = 'test-skill';
      const error = 'Execution failed';

      await integration.markSkillAsFaulty(skillName, error);

      // Should delegate to capability manager
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          type: 'CAPABILITY_UPDATE',
          content: expect.stringContaining('marked as faulty'),
          metadata: expect.objectContaining({
            skillName,
            status: 'faulty',
            error
          })
        })
      );
    });
  });

  describe('updateWorldModelAfterTask', () => {
    it('should update world model after task completion', async () => {
      const sessionId = 'test-session';
      const outcome = {
        summary: 'Task completed',
        learnings: ['Learning 1', 'Learning 2'],
        outcome: 'success' as const
      };

      await integration.updateWorldModelAfterTask(sessionId, outcome);

      // Should delegate to strategy manager
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'GLOBAL_STRATEGY',
        expect.objectContaining({
          type: 'STATUS_UPDATE',
          content: 'Mission accomplished: Task completed',
          metadata: expect.objectContaining({
            sessionId,
            learnings: outcome.learnings,
            outcome: 'success'
          })
        })
      );

      // Should store strategic learning
      expect(mockToolRetrievalService.indexSkill).toHaveBeenCalled();
    });

    it('should handle task failure', async () => {
      const sessionId = 'test-session';
      const outcome = {
        summary: 'Task failed',
        learnings: [],
        outcome: 'failure' as const
      };

      await integration.updateWorldModelAfterTask(sessionId, outcome);

      // Should still update world model
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'GLOBAL_STRATEGY',
        expect.objectContaining({
          type: 'STATUS_UPDATE',
          content: 'Mission accomplished: Task failed'
        })
      );
    });
  });

  describe('getAvailableCapabilities', () => {
    it('should return available capabilities from L3', async () => {
      const capabilities = await integration.getAvailableCapabilities();

      expect(Array.isArray(capabilities)).toBe(true);
      expect(capabilities).toContain('skill-1');

      // Should delegate to capability manager
      expect(mockSkillManager.listSkills).toHaveBeenCalled();
    });
  });

  describe('registerNewSkill', () => {
    it('should register new skill in L3', async () => {
      const skill = {
        name: 'new-skill',
        type: 'skill' as const,
        description: 'New test skill',
        tags: ['new'],
        version: '1.0.0',
        path: '/path/to/new-skill',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      };

      await integration.registerNewSkill(skill);

      // Should send update to L3
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          type: 'CAPABILITY_UPDATE',
          content: 'New skill registered: new-skill',
          metadata: expect.objectContaining({
            skillName: 'new-skill',
            action: 'registered'
          })
        })
      );

      // Should index in LanceDB
      expect(mockToolRetrievalService.indexSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'new-skill',
          description: 'New test skill'
        })
      );
    });
  });

  describe('unregisterSkill', () => {
    it('should unregister skill from L3', async () => {
      const skillName = 'test-skill';

      await integration.unregisterSkill(skillName);

      // Should send unregister notification
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          type: 'CAPABILITY_UPDATE',
          content: 'Skill test-skill unregistered',
          metadata: expect.objectContaining({
            action: 'unregistered'
          })
        })
      );

      // Should remove from vector index
      expect(mockToolRetrievalService.removeSkill).toHaveBeenCalledWith(skillName);
    });
  });

  describe('getCapabilityMetrics', () => {
    it('should return capability metrics', async () => {
      const metrics = integration.getCapabilityMetrics();

      expect(metrics).toHaveProperty('totalSkills');
      expect(metrics).toHaveProperty('activeSkills');
      expect(metrics).toHaveProperty('faultySkills');
      expect(metrics).toHaveProperty('inactiveSkills');
      expect(metrics).toHaveProperty('mostUsedSkills');
      expect(metrics).toHaveProperty('failureRateBySkill');
    });
  });

  describe('getWorldModelStats', () => {
    it('should return world model statistics', async () => {
      const stats = integration.getWorldModelStats();

      expect(stats).toHaveProperty('totalUpdates');
      expect(stats).toHaveProperty('domainDistribution');
      expect(stats).toHaveProperty('averageConfidence');
    });
  });

  describe('updateUserStrategicGoals', () => {
    it('should update user strategic goals', async () => {
      const userId = 'test-user';
      const goals = ['Goal 1', 'Goal 2', 'Goal 3'];

      await integration.updateUserStrategicGoals(userId, goals);

      // Should delegate to strategy manager
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'GLOBAL_STRATEGY',
        expect.objectContaining({
          type: 'GOAL_UPDATE',
          metadata: expect.objectContaining({
            userId,
            goals
          })
        })
      );
    });
  });

  describe('retrieveStrategicKnowledge', () => {
    it('should retrieve strategic knowledge', async () => {
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

      const knowledge = await integration.retrieveStrategicKnowledge(query, userId);

      expect(Array.isArray(knowledge)).toBe(true);
      expect(knowledge.length).toBeGreaterThan(0);

      // Should search with user context
      expect(mockToolRetrievalService.findRelevantSkills).toHaveBeenCalledWith(
        expect.stringContaining(userId),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should search without user context', async () => {
      const query = 'machine learning';

      mockToolRetrievalService.findRelevantSkills.mockResolvedValueOnce([]);

      const knowledge = await integration.retrieveStrategicKnowledge(query);

      expect(Array.isArray(knowledge)).toBe(true);
      expect(knowledge).toEqual([]);
    });
  });

  describe('getUserStrategicSummary', () => {
    it('should return user strategic summary', async () => {
      const userId = 'test-user';

      // Set up goals first
      await integration.updateUserStrategicGoals(userId, ['Goal 1']);

      const summary = integration.getUserStrategicSummary(userId);

      expect(summary).toBeDefined();
      expect(summary?.userId).toBe(userId);
      expect(summary?.goals).toContain('Goal 1');
    });

    it('should return null for unknown user', async () => {
      const summary = integration.getUserStrategicSummary('unknown-user');

      expect(summary).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should clean up expired data', async () => {
      await integration.cleanup();

      // Should clean up both L2 and L3 data
      // The exact calls depend on internal implementation
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalled();
    });
  });

  describe('integration workflow', () => {
    it('should handle complete chat workflow with L2/L3', async () => {
      const userId = 'test-user';
      const sessionId = 'test-session';
      const skillName = 'test-skill';

      // Step 1: Load strategic context (L2)
      const strategicContext = await integration.loadStrategicContextForSession(userId);
      expect(strategicContext).toBeDefined();

      // Step 2: Track skill usage (L3)
      await integration.trackSkillUsage(skillName);

      // Step 3: Update world model (L2)
      await integration.updateWorldModelAfterTask(sessionId, {
        summary: 'Task completed successfully',
        learnings: ['Learned to use test-skill'],
        outcome: 'success' as const
      });

      // Verify all steps were called
      expect(mockLLMManager.chat).toHaveBeenCalled(); // L2 strategic analysis
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalled(); // L3 activity tracking
      expect(mockToolRetrievalService.indexSkill).toHaveBeenCalled(); // L2 learning storage
    });

    it('should handle skill failure workflow', async () => {
      const userId = 'test-user';
      const sessionId = 'test-session';
      const skillName = 'faulty-skill';

      // Step 1: Load context
      await integration.loadStrategicContextForSession(userId);

      // Step 2: Mark skill as faulty (L3)
      await integration.markSkillAsFaulty(skillName, 'Skill execution failed');

      // Step 3: Update world model with failure (L2)
      await integration.updateWorldModelAfterTask(sessionId, {
        summary: 'Task failed due to skill error',
        learnings: ['Skill faulty-skill is unreliable'],
        outcome: 'failure' as const
      });

      // Verify fault was recorded
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          type: 'CAPABILITY_UPDATE',
          content: expect.stringContaining('marked as faulty')
        })
      );
    });

    it('should handle skill lifecycle', async () => {
      const skill = {
        name: 'lifecycle-skill',
        type: 'skill' as const,
        description: 'Skill for testing lifecycle',
        tags: ['lifecycle', 'test'],
        version: '1.0.0',
        path: '/path/to/lifecycle-skill',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      };

      // Step 1: Register skill (L3)
      await integration.registerNewSkill(skill);
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          type: 'CAPABILITY_UPDATE',
          content: 'New skill registered: lifecycle-skill'
        })
      );

      // Step 2: Use skill (L3 activity)
      await integration.trackSkillUsage(skill.name);

      // Step 3: Unregister skill (L3)
      await integration.unregisterSkill(skill.name);
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          type: 'CAPABILITY_UPDATE',
          content: 'Skill lifecycle-skill unregistered'
        })
      );
    });
  });
});
