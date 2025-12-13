/**
 * 单元测试：AceEthicsGuard
 * 测试L1渴望层的伦理审查功能
 */

import { AceEthicsGuard } from '../../../src/services/AceEthicsGuard';
import { LLMManager } from '../../../src/core/LLMManager';
import { AceIntegrator } from '../../../src/services/AceIntegrator';

// Mock LLMManager
jest.mock('../../../src/core/LLMManager', () => {
  const actual = jest.requireActual('../../../src/core/LLMManager');
  return {
    ...actual,
    LLMManager: jest.fn().mockImplementation(() => ({
      chat: jest.fn()
    }))
  };
});

// Mock AceIntegrator
jest.mock('../../../src/services/AceIntegrator', () => {
  const actual = jest.requireActual('../../../src/services/AceIntegrator');
  return {
    ...actual,
    AceIntegrator: jest.fn().mockImplementation(() => ({
      sendToLayer: jest.fn()
    }))
  };
});

describe('AceEthicsGuard', () => {
  let ethicsGuard: AceEthicsGuard;
  let mockLLMManager: jest.Mocked<LLMManager>;
  let mockAceIntegrator: jest.Mocked<AceIntegrator>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLLMManager = new LLMManager() as jest.Mocked<LLMManager>;
    mockAceIntegrator = new AceIntegrator({} as any, mockLLMManager) as jest.Mocked<AceIntegrator>;
    ethicsGuard = new AceEthicsGuard(mockLLMManager, mockAceIntegrator);
  });

  describe('reviewStrategy', () => {
    it('应该批准正常的用户请求', async () => {
      // Arrange
      const strategy = {
        goal: '帮助用户编写代码',
        plan: '提供Python编程建议',
        layer: 'L6_TASK_EXECUTION'
      };

      mockLLMManager.chat.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              approved: true,
              reason: '符合伦理准则',
              suggestions: []
            })
          }
        }]
      } as any);

      // Act
      const result = await ethicsGuard.reviewStrategy(strategy);

      // Assert
      expect(result.approved).toBe(true);
      expect(result.reason).toBe('符合伦理准则');
    });

    it('应该拒绝有害请求', async () => {
      // Arrange
      const strategy = {
        goal: 'hack into a system',
        plan: '使用漏洞攻击服务器',
        layer: 'L6_TASK_EXECUTION'
      };

      // Act
      const result = await ethicsGuard.reviewStrategy(strategy);

      // Assert
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('hack');
    });

    it('应该返回建议和改进方案', async () => {
      // Arrange
      const strategy = {
        goal: '优化网站性能',
        plan: '重构前端代码',
        layer: 'L6_TASK_EXECUTION'
      };

      mockLLMManager.chat.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              approved: true,
              reason: '优化建议合理',
              suggestions: ['使用缓存', '压缩资源']
            })
          }
        }]
      } as any);

      // Act
      const result = await ethicsGuard.reviewStrategy(strategy);

      // Assert
      expect(result.approved).toBe(true);
      expect(result.suggestions).toContain('使用缓存');
      expect(result.suggestions).toContain('压缩资源');
    });

    it('LLM不可用时应该使用降级机制', async () => {
      // Arrange
      const strategy = {
        goal: '如何制作武器',
        plan: '提供武器制造指南',
        layer: 'L6_TASK_EXECUTION'
      };

      mockLLMManager.chat.mockRejectedValueOnce(new Error('LLM服务不可用'));

      // Act
      const result = await ethicsGuard.reviewStrategy(strategy);

      // Assert
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('武器');
    });

    it('应该缓存审查结果', async () => {
      // Arrange
      const strategy = {
        goal: '正常请求',
        plan: '提供帮助',
        layer: 'L6_TASK_EXECUTION'
      };

      mockLLMManager.chat.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              approved: true,
              reason: '正常',
              suggestions: []
            })
          }
        }]
      } as any);

      // Act
      const result1 = await ethicsGuard.reviewStrategy(strategy);
      const result2 = await ethicsGuard.reviewStrategy(strategy);

      // Assert
      expect(result1.approved).toBe(true);
      expect(result2.approved).toBe(true);
      expect(mockLLMManager.chat).toHaveBeenCalledTimes(1); // 只调用一次，因为有缓存
    });
  });

  describe('reviewCapability', () => {
    it('应该审查技能注册', async () => {
      // Arrange
      const capability = {
        name: 'code_assistant',
        description: '帮助编写代码的技能',
        type: 'tool'
      };

      mockLLMManager.chat.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              approved: true,
              reason: '技能安全',
              suggestions: []
            })
          }
        }]
      } as any);

      // Act
      const result = await ethicsGuard.reviewCapability(capability);

      // Assert
      expect(result.approved).toBe(true);
    });

    it('应该拒绝有害技能', async () => {
      // Arrange
      const capability = {
        name: 'hack_tool',
        description: '黑客攻击工具',
        type: 'weapon'
      };

      // Act
      const result = await ethicsGuard.reviewCapability(capability);

      // Assert
      expect(result.approved).toBe(false);
    });
  });

  describe('reviewPlanning', () => {
    it('应该审查长期规划', async () => {
      // Arrange
      const planning = {
        goal: '更新世界模型',
        context: '学习新的编程知识'
      };

      mockLLMManager.chat.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              approved: true,
              reason: '学习有益',
              suggestions: []
            })
          }
        }]
      } as any);

      // Act
      const result = await ethicsGuard.reviewPlanning(planning);

      // Assert
      expect(result.approved).toBe(true);
    });
  });

  describe('loadConstitution', () => {
    it('应该加载默认宪法', async () => {
      // Act
      const constitution = await ethicsGuard.loadConstitution();

      // Assert
      expect(constitution).toContain('AI伦理宪法');
      expect(constitution).toContain('核心原则');
    });

    it('应该支持自定义宪法路径', async () => {
      // Arrange
      const fs = require('fs/promises');
      const customPath = '/tmp/test-constitution.md';
      const customContent = '# 自定义宪法\n\n规则1: 遵守法律';

      jest.spyOn(fs, 'readFile').mockResolvedValueOnce(customContent);

      // Act
      const constitution = await ethicsGuard.loadConstitution(customPath);

      // Assert
      expect(constitution).toBe(customContent);
      expect(constitution).toContain('自定义宪法');
    });
  });

  describe('updateEthicalRules', () => {
    it('应该更新伦理规则', async () => {
      // Arrange
      const rules = [
        {
          id: 'rule_001',
          name: '禁止犯罪',
          description: '禁止协助犯罪活动',
          severity: 'critical' as const,
          keywords: ['hack', 'steal'],
          patterns: [],
          action: 'block' as const,
          message: '此请求涉及犯罪活动'
        }
      ];

      // Act
      await ethicsGuard.updateEthicalRules(rules);
      const currentRules = ethicsGuard.getEthicalRules();

      // Assert
      expect(currentRules).toHaveLength(1);
      expect(currentRules[0].name).toBe('禁止犯罪');
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'ASPIRATIONAL',
        expect.objectContaining({
          type: 'ETHICS_RULE_UPDATE',
          content: 'Updated 1 ethical rules'
        })
      );
    });
  });

  describe('fallbackEthicalCheck', () => {
    it('应该检测致命关键词', () => {
      // Arrange
      const strategy = {
        goal: '如何hack系统',
        plan: '获取管理员权限',
        layer: 'L1'
      };

      // Act
      const result = ethicsGuard['fallbackEthicalCheck'](strategy);

      // Assert
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('hack');
    });

    it('应该检测高风险关键词', () => {
      // Arrange
      const strategy = {
        goal: '购买illegal药物',
        plan: '获取毒品',
        layer: 'L1'
      };

      // Act
      const result = ethicsGuard['fallbackEthicalCheck'](strategy);

      // Assert
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('illegal');
    });

    it('应该批准正常请求', () => {
      // Arrange
      const strategy = {
        goal: '学习编程',
        plan: '编写Python代码',
        layer: 'L1'
      };

      // Act
      const result = ethicsGuard['fallbackEthicalCheck'](strategy);

      // Assert
      expect(result.approved).toBe(true);
    });
  });

  describe('缓存管理', () => {
    it('应该正确缓存审查结果', async () => {
      // Arrange
      const strategy = {
        goal: '测试缓存',
        plan: '检查缓存机制',
        layer: 'L6_TASK_EXECUTION'
      };

      mockLLMManager.chat.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              approved: true,
              reason: '缓存测试',
              suggestions: []
            })
          }
        }]
      } as any);

      // Act
      await ethicsGuard.reviewStrategy(strategy);
      const cacheStats = ethicsGuard.getCacheStats();

      // Assert
      expect(cacheStats.size).toBeGreaterThanOrEqual(1);
    });

    it('应该清空缓存', () => {
      // Act
      ethicsGuard.clearCache();
      const cacheStats = ethicsGuard.getCacheStats();

      // Assert
      expect(cacheStats.size).toBe(0);
    });
  });

  describe('getDefaultConstitution', () => {
    it('应该返回完整的默认宪法', () => {
      // Act
      const constitution = ethicsGuard['getDefaultConstitution']();

      // Assert
      expect(constitution).toContain('AI伦理宪法');
      expect(constitution).toContain('核心原则');
      expect(constitution).toContain('禁止活动');
      expect(constitution).toContain('用户安全第一');
      expect(constitution).toContain('无害原则');
      expect(constitution).toContain('非歧视');
      expect(constitution).toContain('法律合规');
    });
  });
});
