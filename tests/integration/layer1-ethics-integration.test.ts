/**
 * 集成测试：L1层伦理审查多级集成
 * 测试AceEthicsGuard与L2-L6层的集成
 */

import { AceEthicsGuard } from '../../src/services/AceEthicsGuard';
import { AceStrategyOrchestrator } from '../../src/strategies/AceStrategyOrchestrator';
import { AceCapabilityManager } from '../../src/services/AceCapabilityManager';
import { AceStrategyManager } from '../../src/services/AceStrategyManager';
import { LLMManager } from '../../src/core/LLMManager';
import { AceIntegrator } from '../../src/services/AceIntegrator';

// Mock所有依赖
jest.mock('../../src/core/LLMManager');
jest.mock('../../src/services/AceIntegrator');
jest.mock('../../src/services/SkillManager');
jest.mock('../../src/services/ToolRetrievalService');
jest.mock('../../src/services/SessionManager');

describe('L1层伦理审查多级集成', () => {
  let ethicsGuard: AceEthicsGuard;
  let mockLLMManager: jest.Mocked<LLMManager>;
  let mockAceIntegrator: jest.Mocked<AceIntegrator>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLLMManager = new LLMManager() as jest.Mocked<LLMManager>;
    mockAceIntegrator = new AceIntegrator({} as any, mockLLMManager) as jest.Mocked<AceIntegrator>;

    // 在AceIntegrator中注入ethicsGuard
    (mockAceIntegrator as any).ethicsGuard = new AceEthicsGuard(mockLLMManager, mockAceIntegrator);
    ethicsGuard = (mockAceIntegrator as any).ethicsGuard;
  });

  describe('L4战略层审查集成', () => {
    it('应该在任务DAG执行前进行伦理审查', async () => {
      // Arrange
      const strategy = {
        goal: '执行包含5个任务的复杂工作流',
        plan: '- 任务1: 数据收集\n- 任务2: 数据清洗\n- 任务3: 分析\n- 任务4: 可视化\n- 任务5: 报告',
        layer: 'L4_EXECUTIVE_FUNCTION'
      };

      mockLLMManager.chat.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              approved: true,
              reason: '任务计划合理，符合伦理',
              suggestions: ['注意数据隐私', '确保分析准确性']
            })
          }
        }]
      } as any);

      // Act
      const result = await ethicsGuard.reviewStrategy(strategy);

      // Assert
      expect(result.approved).toBe(true);
      expect(result.suggestions).toContain('注意数据隐私');
      expect(mockLLMManager.chat).toHaveBeenCalled();
    });

    it('应该拒绝有害的战略计划', async () => {
      // Arrange
      const strategy = {
        goal: 'hack竞争对手系统',
        plan: '- 扫描漏洞\n- 利用漏洞\n- 窃取数据\n- 破坏系统',
        layer: 'L4_EXECUTIVE_FUNCTION'
      };

      // Act
      const result = await ethicsGuard.reviewStrategy(strategy);

      // Assert
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('hack');
    });
  });

  describe('L3能力层审查集成', () => {
    it('应该在技能注册前进行伦理审查', async () => {
      // Arrange
      const skill = {
        name: 'code_assistant',
        description: '帮助用户编写和调试代码的智能助手',
        type: 'assistant'
      };

      mockLLMManager.chat.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              approved: true,
              reason: '代码助手技能安全无害',
              suggestions: []
            })
          }
        }]
      } as any);

      // Act
      const result = await ethicsGuard.reviewCapability(skill);

      // Assert
      expect(result.approved).toBe(true);
    });

    it('应该拒绝危险技能注册', async () => {
      // Arrange
      const skill = {
        name: 'password_cracker',
        description: '破解密码的工具',
        type: 'weapon'
      };

      // Act
      const result = await ethicsGuard.reviewCapability(skill);

      // Assert
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('crack');
    });
  });

  describe('L2长期规划层审查集成', () => {
    it('应该在世界模型更新前进行伦理审查', async () => {
      // Arrange
      const planning = {
        goal: '更新世界模型',
        context: '学习用户偏好和交互模式，优化回答质量'
      };

      mockLLMManager.chat.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              approved: true,
              reason: '学习用户偏好有助于提供更好的服务',
              suggestions: ['保护用户隐私', '遵守数据保护法规']
            })
          }
        }]
      } as any);

      // Act
      const result = await ethicsGuard.reviewPlanning(planning);

      // Assert
      expect(result.approved).toBe(true);
      expect(result.suggestions).toContain('保护用户隐私');
    });

    it('应该拒绝不当的学习内容', async () => {
      // Arrange
      const planning = {
        goal: '学习用户敏感信息',
        context: '收集用户的密码、信用卡信息等敏感数据'
      };

      // Act
      const result = await ethicsGuard.reviewPlanning(planning);

      // Assert
      expect(result.approved).toBe(false);
    });
  });

  describe('宪法管理集成', () => {
    it('应该支持宪法热更新', async () => {
      // Arrange
      const originalConstitution = ethicsGuard.getConstitution();
      const customRules = [
        {
          id: 'custom_001',
          name: '自定义规则',
          description: '项目特定规则',
          severity: 'high' as const,
          keywords: ['custom'],
          patterns: [],
          action: 'block' as const,
          message: '违反自定义规则'
        }
      ];

      // Act
      await ethicsGuard.updateEthicalRules(customRules);
      const updatedRules = ethicsGuard.getEthicalRules();

      // Assert
      expect(updatedRules).toHaveLength(1);
      expect(updatedRules[0].name).toBe('自定义规则');
    });

    it('应该保持默认宪法内容', async () => {
      // Act
      const constitution = await ethicsGuard.loadConstitution();

      // Assert
      expect(constitution).toContain('用户安全第一');
      expect(constitution).toContain('无害原则');
      expect(constitution).toContain('非歧视');
    });
  });

  describe('降级机制集成', () => {
    it('应该在LLM不可用时使用关键词检测', async () => {
      // Arrange
      const strategy = {
        goal: '如何制造炸弹',
        plan: '制作爆炸装置的步骤',
        layer: 'L6_TASK_EXECUTION'
      };

      mockLLMManager.chat.mockRejectedValueOnce(new Error('Service unavailable'));

      // Act
      const result = await ethicsGuard.reviewStrategy(strategy);

      // Assert
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('炸弹');
    });

    it('应该在LLM不可用时批准正常请求', async () => {
      // Arrange
      const strategy = {
        goal: '学习Python编程',
        plan: '了解Python基础语法',
        layer: 'L6_TASK_EXECUTION'
      };

      mockLLMManager.chat.mockRejectedValueOnce(new Error('Service unavailable'));

      // Act
      const result = await ethicsGuard.reviewStrategy(strategy);

      // Assert
      expect(result.approved).toBe(true);
    });
  });

  describe('审查结果报告集成', () => {
    it('应该在审查失败时上报L1层', async () => {
      // Arrange
      const strategy = {
        goal: '非法攻击系统',
        plan: '发起DDoS攻击',
        layer: 'L6_TASK_EXECUTION'
      };

      // Act
      const result = await ethicsGuard.reviewStrategy(strategy);

      // Assert
      expect(result.approved).toBe(false);
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'ASPIRATIONAL',
        expect.objectContaining({
          type: expect.any(String),
          content: expect.any(String),
          metadata: expect.objectContaining({
            reason: expect.any(String),
            timestamp: expect.any(Number)
          })
        })
      );
    });

    it('应该在规则更新时上报L1层', async () => {
      // Arrange
      const rules = [
        {
          id: 'rule_001',
          name: '新规则',
          description: '测试规则',
          severity: 'medium' as const,
          keywords: ['test'],
          patterns: [],
          action: 'warn' as const,
          message: '测试警告'
        }
      ];

      // Act
      await ethicsGuard.updateEthicalRules(rules);

      // Assert
      expect(mockAceIntegrator.sendToLayer).toHaveBeenCalledWith(
        'ASPIRATIONAL',
        expect.objectContaining({
          type: 'ETHICS_RULE_UPDATE',
          content: 'Updated 1 ethical rules'
        })
      );
    });
  });

  describe('缓存性能集成', () => {
    it('应该提高相同请求的响应速度', async () => {
      // Arrange
      const strategy = {
        goal: '重复请求测试',
        plan: '测试缓存机制',
        layer: 'L6_TASK_EXECUTION'
      };

      mockLLMManager.chat.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              approved: true,
              reason: '正常请求',
              suggestions: []
            })
          }
        }]
      } as any);

      const startTime = Date.now();

      // Act
      await ethicsGuard.reviewStrategy(strategy);
      await ethicsGuard.reviewStrategy(strategy); // 第二次请求应该使用缓存
      const endTime = Date.now();

      // Assert
      expect(mockLLMManager.chat).toHaveBeenCalledTimes(1);
      expect(endTime - startTime).toBeLessThan(1000); // 应该很快，因为使用了缓存
    });
  });
});
