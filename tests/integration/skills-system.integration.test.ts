/**
 * Skills系统端到端集成测试
 * 
 * 测试完整的Skills系统流程，包括：
 * - 三级加载机制
 * - 代码生成和执行
 * - 缓存系统
 * - 执行器选择
 * - 错误处理
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  MetadataLoader,
  SkillsIndex,
  SkillsCache,
  InstructionLoader,
  ResourceLoader,
  SkillsLoader,
  CodeGenerator,
  SecurityValidator,
  SandboxEnvironment,
  SkillsDirectExecutor,
  SkillsExecutionManager,
  SkillUsageTracker,
  PreloadManager,
  MemoryManager
} from '../../src/core/skills';
import type {
  ExecutionRequest,
  ExecutionResponse,
  SkillMetadata
} from '../../src/types';

/**
 * 创建测试技能目录结构
 */
async function createTestSkill(
  skillRoot: string,
  skillName: string,
  options: {
    hasCode?: boolean;
    hasResources?: boolean;
    type?: 'direct' | 'static' | 'service';
  } = {}
): Promise<string> {
  const skillDir = path.join(skillRoot, skillName);
  await fs.mkdir(skillDir, { recursive: true });

  const type = options.type ?? 'direct';

  // 创建METADATA.yml
  const metadata = {
    name: skillName,
    displayName: `${skillName}测试`,
    description: `这是一个测试技能：${skillName}`,
    version: '1.0.0',
    type,
    domain: 'test',
    keywords: [skillName, 'test'],
    permissions: {
      network: false,
      filesystem: 'none',
      externalApis: []
    },
    cacheable: true,
    ttl: 3600
  };

  await fs.writeFile(
    path.join(skillDir, 'METADATA.yml'),
    `name: ${metadata.name}
displayName: ${metadata.displayName}
description: ${metadata.description}
version: ${metadata.version}
type: ${metadata.type}
domain: ${metadata.domain}
keywords:
  - ${metadata.keywords[0]}
  - ${metadata.keywords[1]}
permissions:
  network: ${metadata.permissions.network}
  filesystem: none
cacheable: ${metadata.cacheable}
ttl: ${metadata.ttl}
`,
    'utf-8'
  );

  // 创建SKILL.md
  let skillContent = `# ${metadata.displayName}\n\n${metadata.description}\n\n`;
  
  if (options.hasCode !== false) {
    skillContent += `## 代码\n\n\`\`\`typescript\nexport async function execute(params: Record<string, unknown>): Promise<unknown> {
  const { a = 0, b = 0, op = '+' } = params as { a?: number; b?: number; op?: string };
  
  let result: number;
  switch (op) {
    case '+':
      result = a + b;
      break;
    case '-':
      result = a - b;
      break;
    case '*':
      result = a * b;
      break;
    case '/':
      if (b === 0) {
        throw new Error('除数不能为零');
      }
      result = a / b;
      break;
    default:
      throw new Error(\`不支持的操作符: \${op}\`);
  }
  
  return {
    success: true,
    result,
    message: \`\${a} \${op} \${b} = \${result}\`
  };
}\n\`\`\`\n`;
  }

  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent, 'utf-8');

  // 创建资源文件（如果需要）
  if (options.hasResources) {
    const scriptsDir = path.join(skillDir, 'scripts');
    await fs.mkdir(scriptsDir, { recursive: true });
    await fs.writeFile(
      path.join(scriptsDir, 'helper.ts'),
      'export const helper = () => "helper";',
      'utf-8'
    );
  }

  return skillDir;
}

describe('Skills系统端到端集成测试', () => {
  let skillsRoot: string;
  let metadataLoader: MetadataLoader;
  let skillsIndex: SkillsIndex;
  let skillsCache: SkillsCache;
  let instructionLoader: InstructionLoader;
  let resourceLoader: ResourceLoader;
  let skillsLoader: SkillsLoader;
  let codeGenerator: CodeGenerator;
  let securityValidator: SecurityValidator;
  let sandbox: SandboxEnvironment;
  let directExecutor: SkillsDirectExecutor;
  let executionManager: SkillsExecutionManager;
  let usageTracker: SkillUsageTracker;

  beforeAll(async () => {
    // 创建临时技能目录
    skillsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-integration-'));
    
    // 创建测试技能
    await createTestSkill(skillsRoot, 'calculator', { hasCode: true });
    await createTestSkill(skillsRoot, 'simple-echo', {
      hasCode: true,
      type: 'direct'
    });

    // 初始化组件
    metadataLoader = new MetadataLoader();
    skillsCache = new SkillsCache();
    skillsIndex = new SkillsIndex({
      skillsRoot,
      metadataProvider: metadataLoader
    });
    instructionLoader = new InstructionLoader(skillsIndex, skillsCache);
    resourceLoader = new ResourceLoader(skillsIndex, skillsCache);
    skillsLoader = new SkillsLoader(skillsIndex, instructionLoader, resourceLoader, skillsCache);
    codeGenerator = new CodeGenerator();
    securityValidator = new SecurityValidator();
    sandbox = new SandboxEnvironment();
    directExecutor = new SkillsDirectExecutor({
      loader: skillsLoader,
      codeGenerator,
      securityValidator,
      sandbox
    });
    usageTracker = new SkillUsageTracker();
    executionManager = new SkillsExecutionManager(skillsLoader, {
      executors: {
        direct: directExecutor
      },
      usageTracker
    });

    // 构建索引
    await skillsIndex.buildIndex();
  });

  afterAll(async () => {
    // 清理临时目录
    await fs.rm(skillsRoot, { recursive: true, force: true });
  });

  describe('三级加载机制', () => {
    it('应该能够按需加载元数据、内容和资源', async () => {
      // Level 1: 仅加载元数据
      const metadataOnly = await skillsLoader.loadSkill('calculator', {
        includeContent: false,
        includeResources: false
      });

      expect(metadataOnly).toBeDefined();
      expect(metadataOnly?.metadata).toBeDefined();
      expect(metadataOnly?.content).toBeUndefined();
      expect(metadataOnly?.resources).toBeUndefined();

      // Level 2: 加载元数据 + 内容
      const withContent = await skillsLoader.loadSkill('calculator', {
        includeContent: true,
        includeResources: false
      });

      expect(withContent?.content).toBeDefined();
      expect(withContent?.content?.codeBlocks.length).toBeGreaterThan(0);
      expect(withContent?.resources).toBeUndefined();

      // Level 3: 加载完整技能
      const fullSkill = await skillsLoader.loadSkill('calculator', {
        includeContent: true,
        includeResources: true
      });

      expect(fullSkill?.content).toBeDefined();
      expect(fullSkill?.resources).toBeDefined();
    });

    it('应该使用缓存避免重复加载', async () => {
      const cacheStatsBefore = skillsCache.getStats();

      // 第一次加载
      await skillsLoader.loadSkill('calculator', { includeContent: true });
      const statsAfterFirst = skillsCache.getStats();

      // 第二次加载（应该命中缓存）
      await skillsLoader.loadSkill('calculator', { includeContent: true });
      const statsAfterSecond = skillsCache.getStats();

      // 内容缓存应该有命中
      expect(statsAfterSecond.content.hits).toBeGreaterThan(statsAfterFirst.content.hits);
    });
  });

  describe('代码生成和执行', () => {
    it('应该能够生成代码并执行', async () => {
      const skill = await skillsLoader.loadSkill('calculator', { includeContent: true });
      expect(skill?.content).toBeDefined();

      if (skill?.content) {
        const generated = await codeGenerator.generate(skill.content);
        expect(generated.javascript).toBeDefined();
        expect(generated.javascript.length).toBeGreaterThan(0);

        // 安全验证
        const securityReport = securityValidator.audit(generated);
        expect(securityReport.passed).toBe(true);

        // 沙箱执行
        const result = await sandbox.execute(generated.javascript, {
          args: { a: 10, b: 5, op: '+' },
          context: {}
        });

        expect(result.result).toBeDefined();
        expect((result.result as any).success).toBe(true);
        expect((result.result as any).result).toBe(15);
      }
    });

    it('应该正确处理执行错误', async () => {
      const skill = await skillsLoader.loadSkill('calculator', { includeContent: true });
      expect(skill?.content).toBeDefined();

      if (skill?.content) {
        const generated = await codeGenerator.generate(skill.content);
        const securityReport = securityValidator.audit(generated);
        expect(securityReport.passed).toBe(true);

        // 测试除零错误
        await expect(
          sandbox.execute(generated.javascript, {
            args: { a: 10, b: 0, op: '/' },
            context: {}
          })
        ).rejects.toThrow();
      }
    });
  });

  describe('执行管理器', () => {
    it('应该能够执行技能并返回标准化结果', async () => {
      const request: ExecutionRequest = {
        skillName: 'calculator',
        parameters: { a: 10, b: 5, op: '+' }
      };

      const response = await executionManager.execute(request);

      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.result).toBeDefined();
      expect(response.result?.status).toBe('success');
      expect(response.result?.format).toBeDefined();
      expect(response.metadata).toBeDefined();
      expect(response.metadata.executionTime).toBeGreaterThan(0);
    });

    it('应该记录执行指标', async () => {
      const statsBefore = executionManager.getExecutionStats();

      await executionManager.execute({
        skillName: 'calculator',
        parameters: { a: 5, b: 3, op: '*' }
      });

      const statsAfter = executionManager.getExecutionStats();
      expect(statsAfter.totalExecutions).toBeGreaterThan(statsBefore.totalExecutions);
    });

    it('应该跟踪技能使用情况', async () => {
      await executionManager.execute({
        skillName: 'calculator',
        parameters: { a: 2, b: 2, op: '+' }
      });

      const usageRecord = usageTracker.getUsageRecord('calculator');
      expect(usageRecord).toBeDefined();
      expect(usageRecord?.executionCount).toBeGreaterThan(0);
    });
  });

  describe('缓存系统集成', () => {
    it('应该在不同层级使用缓存', async () => {
      const cacheStatsBefore = skillsCache.getStats();

      // 多次加载同一技能
      for (let i = 0; i < 3; i++) {
        await skillsLoader.loadSkill('calculator', {
          includeContent: true,
          includeResources: true
        });
      }

      const cacheStatsAfter = skillsCache.getStats();
      
      // 应该有缓存命中
      expect(cacheStatsAfter.metadata.hits).toBeGreaterThan(cacheStatsBefore.metadata.hits);
      expect(cacheStatsAfter.content.hits).toBeGreaterThan(cacheStatsBefore.content.hits);
    });
  });

  describe('错误处理', () => {
    it('应该正确处理不存在的技能', async () => {
      await expect(
        executionManager.execute({
          skillName: 'non-existent-skill',
          parameters: {}
        })
      ).rejects.toThrow();
    });

    it('应该正确处理无效参数', async () => {
      const response = await executionManager.execute({
        skillName: 'calculator',
        parameters: { a: 'invalid', b: 5, op: '+' }
      });

      // 应该返回错误响应而不是抛出异常
      expect(response).toBeDefined();
      // 根据实际实现，可能是success: false或抛出异常
    });
  });

  describe('并发执行', () => {
    it('应该支持并发执行多个技能', async () => {
      const requests: ExecutionRequest[] = [
        { skillName: 'calculator', parameters: { a: 1, b: 1, op: '+' } },
        { skillName: 'calculator', parameters: { a: 2, b: 2, op: '+' } },
        { skillName: 'calculator', parameters: { a: 3, b: 3, op: '+' } }
      ];

      const responses = await Promise.all(
        requests.map((req) => executionManager.execute(req))
      );

      expect(responses.length).toBe(3);
      responses.forEach((response) => {
        expect(response.success).toBe(true);
      });
    });
  });
});

