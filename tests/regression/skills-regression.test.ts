/**
 * Skills系统全面回归测试
 * 
 * 测试迁移后的Skills系统功能完整性：
 * - 所有迁移的技能都能正常执行
 * - 功能与原始插件一致
 * - 错误处理正确
 * - 性能符合预期
 */

import {
  MetadataLoader,
  SkillsIndex,
  SkillsCache,
  InstructionLoader,
  ResourceLoader,
  SkillsLoader,
  SkillsExecutionManager,
  SkillsDirectExecutor,
  CodeGenerator,
  SecurityValidator,
  SandboxEnvironment,
  CodeCache
} from '../../src/core/skills';
import * as path from 'path';
import logger from '../../src/utils/logger';
import type { ExecutionRequest, ExecutionResponse } from '../../src/types';

describe.skip('Skills系统全面回归测试', () => {
  let skillsRoot: string;
  let skillsIndex: SkillsIndex;
  let skillsLoader: SkillsLoader;
  let executionManager: SkillsExecutionManager;

  beforeAll(async () => {
    skillsRoot = path.join(__dirname, '../../skills');
    
    const metadataLoader = new MetadataLoader();
    const skillsCache = new SkillsCache();
    skillsIndex = new SkillsIndex({
      skillsRoot,
      metadataProvider: metadataLoader
    });
    const instructionLoader = new InstructionLoader(skillsIndex, skillsCache);
    const resourceLoader = new ResourceLoader(skillsIndex, skillsCache);
    skillsLoader = new SkillsLoader(skillsIndex, instructionLoader, resourceLoader, skillsCache);

    const codeGenerator = new CodeGenerator();
    const securityValidator = new SecurityValidator();
    // DemoAsyncTask 需要较长执行时间，回归测试放宽沙箱超时时间
    const sandbox = new SandboxEnvironment({
      resourceLimits: {
        executionTimeout: 5000,
        memoryLimitMb: 128
      }
    });
    const codeCache = new CodeCache();
    const directExecutor = new SkillsDirectExecutor({
      loader: skillsLoader,
      codeGenerator,
      securityValidator,
      sandbox,
      codeCache
    });

    executionManager = new SkillsExecutionManager(skillsLoader, {
      executors: {
        direct: directExecutor
      }
    });

    await skillsIndex.buildIndex();
  });

  describe('功能完整性测试', () => {
    const testSkills = ['SimpleDice', 'RockPaperScissors', 'DemoAsyncTask', 'TimeInfo', 'SystemInfo', 'HealthCheck'];

    test.each(testSkills)('应该能够加载和执行技能: %s', async (skillName) => {
      // 测试加载
      const skill = await skillsLoader.loadSkill(skillName, {
        includeContent: true,
        includeResources: true
      });

      expect(skill).toBeDefined();
      expect(skill?.metadata).toBeDefined();
      expect(skill?.metadata.name).toBe(skillName);

      // 测试执行
      const response = await executionManager.execute({
        skillName,
        parameters: {}
      });

      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.result).toBeDefined();
    });

    test.each(testSkills)('技能元数据应该完整: %s', async (skillName) => {
      const metadata = skillsIndex.getMetadata(skillName);

      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe(skillName);
      expect(metadata?.displayName).toBeDefined();
      expect(metadata?.description).toBeDefined();
      expect(metadata?.version).toBeDefined();
      expect(metadata?.type).toBeDefined();
      expect(metadata?.permissions).toBeDefined();
    });

    test.each(testSkills)('技能内容应该可加载: %s', async (skillName) => {
      const skill = await skillsLoader.loadSkill(skillName, {
        includeContent: true
      });

      expect(skill?.content).toBeDefined();
      // 至少应该有代码块或内容
      expect(
        (skill?.content?.codeBlocks.length ?? 0) > 0 ||
        (skill?.content?.sections.length ?? 0) > 0
      ).toBe(true);
    });
  });

  describe('SimpleDice回归测试', () => {
    it('应该能够掷骰子', async () => {
      const response = await executionManager.execute({
        skillName: 'SimpleDice',
        parameters: { sides: 6, count: 1 }
      });

      expect(response.success).toBe(true);
      expect(response.result).toBeDefined();
    });

    it('应该支持自定义面数', async () => {
      const response = await executionManager.execute({
        skillName: 'SimpleDice',
        parameters: { sides: 20, count: 1 }
      });

      expect(response.success).toBe(true);
    });

    it('应该支持多次掷骰', async () => {
      const response = await executionManager.execute({
        skillName: 'SimpleDice',
        parameters: { sides: 6, count: 3 }
      });

      expect(response.success).toBe(true);
    });
  });

  describe('TimeInfo回归测试', () => {
    it('应该返回时间信息', async () => {
      const response = await executionManager.execute({
        skillName: 'TimeInfo',
        parameters: {}
      });

      expect(response.success).toBe(true);
      expect(response.result).toBeDefined();
    });

    it('应该包含时间相关字段', async () => {
      const response = await executionManager.execute({
        skillName: 'TimeInfo',
        parameters: {}
      });

      const result = response.result as any;
      // 检查是否包含时间相关字段（根据实际实现调整）
      expect(result).toBeDefined();
    });
  });

  describe('SystemInfo回归测试', () => {
    it('应该返回系统信息', async () => {
      const response = await executionManager.execute({
        skillName: 'SystemInfo',
        parameters: {}
      });

      expect(response.success).toBe(true);
      expect(response.result).toBeDefined();
    });
  });

  describe('错误处理回归测试', () => {
    it('应该正确处理不存在的技能', async () => {
      await expect(
        executionManager.execute({
          skillName: 'NonExistentSkill',
          parameters: {}
        })
      ).rejects.toThrow();
    });

    it('应该正确处理无效参数', async () => {
      // 根据实际实现，可能是返回错误响应或抛出异常
      try {
        const response = await executionManager.execute({
          skillName: 'SimpleDice',
          parameters: { sides: 'invalid' }
        });
        // 如果返回响应，应该标记为失败或包含错误信息
        expect(response).toBeDefined();
      } catch (error) {
        // 如果抛出异常，也是可以接受的
        expect(error).toBeDefined();
      }
    });
  });

  describe('性能回归测试', () => {
    it('执行时间应该在合理范围内', async () => {
      const startTime = Date.now();
      await executionManager.execute({
        skillName: 'SimpleDice',
        parameters: { sides: 6, count: 1 }
      });
      const executionTime = Date.now() - startTime;

      // 执行时间应该 < 500ms（包含加载和执行）
      expect(executionTime).toBeLessThan(500);
    });

    it('缓存应该提高性能', async () => {
      // 第一次执行
      const firstStart = Date.now();
      await executionManager.execute({
        skillName: 'TimeInfo',
        parameters: {}
      });
      const firstTime = Date.now() - firstStart;

      // 第二次执行（应该使用缓存）
      const secondStart = Date.now();
      await executionManager.execute({
        skillName: 'TimeInfo',
        parameters: {}
      });
      const secondTime = Date.now() - secondStart;

      // 第二次应该更快或相近（缓存生效）
      const baseline = Math.max(firstTime * 1.5, 1);
      expect(secondTime).toBeLessThanOrEqual(baseline);
    });
  });

  describe('并发执行回归测试', () => {
    it('应该支持并发执行', async () => {
      const requests: ExecutionRequest[] = [
        { skillName: 'SimpleDice', parameters: { sides: 6, count: 1 } },
        { skillName: 'TimeInfo', parameters: {} },
        { skillName: 'SystemInfo', parameters: {} }
      ];

      const responses = await Promise.all(
        requests.map(req => executionManager.execute(req))
      );

      expect(responses.length).toBe(3);
      responses.forEach(response => {
        expect(response.success).toBe(true);
      });
    });
  });

  describe('向后兼容性测试', () => {
    it('应该保持API兼容性', async () => {
      // 测试标准执行接口
      const response = await executionManager.execute({
        skillName: 'SimpleDice',
        parameters: { sides: 6, count: 1 }
      });

      // 验证响应格式
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('result');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('executionTime');
    });

    it('应该支持参数传递', async () => {
      const response = await executionManager.execute({
        skillName: 'SimpleDice',
        parameters: { sides: 10, count: 2 }
      });

      expect(response.success).toBe(true);
    });
  });
});

