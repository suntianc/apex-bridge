/**
 * AceCapabilityManager 单元测试
 * P2阶段：L3自我认知层测试
 */

import { AceCapabilityManager, CapabilityStatus, SkillCapabilityMetrics } from '../../../src/services/AceCapabilityManager';
import { AceIntegrator } from '../../../src/services/AceIntegrator';
import { SkillManager } from '../../../src/services/SkillManager';
import { ToolRetrievalService } from '../../../src/services/ToolRetrievalService';
import { ToolType } from '../../../src/types/tool-system';

// Mock dependencies
const mockAceIntegrator = {
  sendToLayer: jest.fn().mockResolvedValue(undefined)
};

const mockSkillManager = {
  listSkills: jest.fn().mockResolvedValue({
    skills: [
      {
        name: 'test-skill-1',
        enabled: true,
        type: ToolType.SKILL as const,
        description: 'Test skill 1',
        tags: ['test', 'example'],
        version: '1.0.0',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        level: 3
      },
      {
        name: 'test-skill-2',
        enabled: true,
        type: ToolType.SKILL as const,
        description: 'Test skill 2',
        tags: ['test'],
        version: '1.0.0',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        level: 3
      }
    ],
    total: 2
  }),
  getSkillByName: jest.fn().mockImplementation((name: string) => {
    return {
      name,
      enabled: true,
      type: ToolType.SKILL as const,
      description: `Test skill ${name}`,
      tags: ['test'],
      version: '1.0.0',
      parameters: {},
      level: 3
    };
  })
};

const mockToolRetrievalService = {
  indexSkill: jest.fn().mockResolvedValue(undefined),
  removeSkill: jest.fn().mockResolvedValue(undefined)
};

describe('AceCapabilityManager', () => {
  let capabilityManager: AceCapabilityManager;

  beforeEach(() => {
    jest.clearAllMocks();

    capabilityManager = new AceCapabilityManager(
      mockAceIntegrator as any,
      mockSkillManager as any,
      mockToolRetrievalService as any
    );
  });

  describe('registerSkill', () => {
    it('should register a new skill successfully', async () => {
      const skill = {
        name: 'test-skill',
        type: ToolType.SKILL as const,
        description: 'Test skill',
        tags: ['test'],
        version: '1.0.0',
        path: '/path/to/skill',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      };

      await capabilityManager.registerSkill(skill);

      // Verify L3 update was sent
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          type: 'CAPABILITY_UPDATE',
          content: 'New skill registered: test-skill',
          metadata: expect.objectContaining({
            skillName: 'test-skill',
            action: 'registered'
          })
        })
      );

      // Verify skill was indexed in LanceDB
      expect(mockToolRetrievalService.indexSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-skill',
          description: 'Test skill',
          tags: ['test']
        })
      );
    });

    it('should handle registration errors gracefully', async () => {
      const skill = {
        name: 'test-skill',
        type: ToolType.SKILL as const,
        description: 'Test skill',
        tags: ['test'],
        version: '1.0.0',
        path: '/path/to/skill',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      };

      mockToolRetrievalService.indexSkill.mockRejectedValueOnce(new Error('Indexing failed'));

      await expect(capabilityManager.registerSkill(skill)).rejects.toThrow('Indexing failed');
    });
  });

  describe('markSkillAsFaulty', () => {
    it('should mark skill as faulty after threshold failures', async () => {
      const skillName = 'test-skill';
      const error = 'Execution failed';

      // Register skill first
      await capabilityManager.registerSkill({
        name: skillName,
        type: ToolType.SKILL as const,
        description: 'Test skill',
        tags: ['test'],
        version: '1.0.0',
        path: '/path/to/skill',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      });

      // Mark as faulty 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        await capabilityManager.markSkillAsFaulty(skillName, error);
      }

      // Should trigger fault status update
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          type: 'CAPABILITY_UPDATE',
          content: expect.stringContaining('marked as faulty'),
          metadata: expect.objectContaining({
            status: 'faulty',
            failureCount: 3
          })
        })
      );
    });

    it('should record failure attempts below threshold', async () => {
      const skillName = 'test-skill';
      const error = 'Execution failed';

      await capabilityManager.registerSkill({
        name: skillName,
        type: ToolType.SKILL as const,
        description: 'Test skill',
        tags: ['test'],
        version: '1.0.0',
        path: '/path/to/skill',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      });

      // Mark as faulty only once (below threshold)
      await capabilityManager.markSkillAsFaulty(skillName, error);

      // Should record failure but not mark as faulty
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          content: expect.stringContaining('failed (attempt 1/3)'),
          metadata: expect.objectContaining({
            failureCount: 1,
            action: 'failed'
          })
        })
      );
    });
  });

  describe('getAvailableCapabilities', () => {
    it('should return list of active skills', async () => {
      // Register skills first so they appear in skillStatuses map
      const skill1 = {
        name: 'test-skill-1',
        type: ToolType.SKILL as const,
        description: 'Test skill 1',
        tags: ['test', 'example'],
        version: '1.0.0',
        path: '/path/to/skill1',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      };

      const skill2 = {
        name: 'test-skill-2',
        type: ToolType.SKILL as const,
        description: 'Test skill 2',
        tags: ['test'],
        version: '1.0.0',
        path: '/path/to/skill2',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      };

      await capabilityManager.registerSkill(skill1);
      await capabilityManager.registerSkill(skill2);

      const capabilities = await capabilityManager.getAvailableCapabilities();

      expect(Array.isArray(capabilities)).toBe(true);
      // Should include skills from SkillManager
      expect(capabilities).toContain('test-skill-1');
      expect(capabilities).toContain('test-skill-2');
    });

    it('should handle empty skill list', async () => {
      mockSkillManager.listSkills.mockResolvedValueOnce({
        skills: [],
        total: 0
      });

      const capabilities = await capabilityManager.getAvailableCapabilities();

      expect(capabilities).toEqual([]);
    });
  });

  describe('updateSkillActivity', () => {
    it('should update skill activity status', async () => {
      const skillName = 'test-skill';

      await capabilityManager.registerSkill({
        name: skillName,
        type: ToolType.SKILL as const,
        description: 'Test skill',
        tags: ['test'],
        version: '1.0.0',
        path: '/path/to/skill',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      });

      await capabilityManager.updateSkillActivity(skillName);

      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          type: 'ACTIVITY_UPDATE',
          content: 'Skill test-skill accessed',
          metadata: expect.objectContaining({
            skillName,
            status: 'active',
            action: 'accessed'
          })
        })
      );
    });

    it('should handle unknown skill', async () => {
      const skillName = 'unknown-skill';

      await capabilityManager.updateSkillActivity(skillName);

      // Should log warning but not throw
      expect(mockAceIntegrator.sendToLayer).not.toHaveBeenCalled();
    });
  });

  describe('cleanupInactiveSkills', () => {
    it('should mark inactive skills', async () => {
      const skillName = 'test-skill';

      await capabilityManager.registerSkill({
        name: skillName,
        type: ToolType.SKILL as const,
        description: 'Test skill',
        tags: ['test'],
        version: '1.0.0',
        path: '/path/to/skill',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      });

      // Simulate inactivity by directly manipulating internal state
      // In real scenario, this would happen automatically after timeout

      await capabilityManager.cleanupInactiveSkills();

      // Should report inactive status
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          type: 'CAPABILITY_UPDATE',
          content: expect.stringContaining('marked as inactive'),
          metadata: expect.objectContaining({
            status: 'inactive'
          })
        })
      );
    });
  });

  describe('getCapabilityMetrics', () => {
    it('should return metrics with skill statistics', async () => {
      const metrics = capabilityManager.getCapabilityMetrics();

      expect(metrics).toHaveProperty('totalSkills');
      expect(metrics).toHaveProperty('activeSkills');
      expect(metrics).toHaveProperty('faultySkills');
      expect(metrics).toHaveProperty('inactiveSkills');
      expect(metrics).toHaveProperty('mostUsedSkills');
      expect(metrics).toHaveProperty('failureRateBySkill');

      expect(typeof metrics.totalSkills).toBe('number');
      expect(Array.isArray(metrics.mostUsedSkills)).toBe(true);
      expect(Array.isArray(metrics.failureRateBySkill)).toBe(true);
    });
  });

  describe('getSkillCapabilityBoundary', () => {
    it('should return skill capability boundary', async () => {
      const skillName = 'test-skill';

      await capabilityManager.registerSkill({
        name: skillName,
        type: ToolType.SKILL as const,
        description: 'Test skill',
        tags: ['test'],
        version: '1.0.0',
        path: '/path/to/skill',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      });

      const boundary = await capabilityManager.getSkillCapabilityBoundary(skillName);

      expect(boundary).toBeDefined();
      expect(boundary?.skillName).toBe(skillName);
      expect(boundary?.status).toBe('active');
    });

    it('should return null for unknown skill', async () => {
      const boundary = await capabilityManager.getSkillCapabilityBoundary('unknown-skill');

      expect(boundary).toBeNull();
    });
  });

  describe('resetSkillStatus', () => {
    it('should reset skill status to active', async () => {
      const skillName = 'test-skill';

      await capabilityManager.registerSkill({
        name: skillName,
        type: ToolType.SKILL as const,
        description: 'Test skill',
        tags: ['test'],
        version: '1.0.0',
        path: '/path/to/skill',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      });

      // Mark as faulty
      await capabilityManager.markSkillAsFaulty(skillName, 'Test error');
      await capabilityManager.markSkillAsFaulty(skillName, 'Test error');
      await capabilityManager.markSkillAsFaulty(skillName, 'Test error');

      // Reset status
      await capabilityManager.resetSkillStatus(skillName);

      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'AGENT_MODEL',
        expect.objectContaining({
          type: 'CAPABILITY_UPDATE',
          content: 'Skill test-skill status reset',
          metadata: expect.objectContaining({
            action: 'reset'
          })
        })
      );
    });
  });

  describe('unregisterSkill', () => {
    it('should unregister skill from L3', async () => {
      const skillName = 'test-skill';

      await capabilityManager.registerSkill({
        name: skillName,
        type: ToolType.SKILL as const,
        description: 'Test skill',
        tags: ['test'],
        version: '1.0.0',
        path: '/path/to/skill',
        parameters: {
          type: 'object' as const,
          properties: {}
        },
        enabled: true,
        level: 3
      });

      await capabilityManager.unregisterSkill(skillName);

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
});
