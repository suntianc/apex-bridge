/**
 * Skills系统安全性和权限测试
 * 
 * 测试：
 * - 代码安全验证
 * - 沙箱隔离
 * - 权限控制
 * - 恶意代码防护
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
  SkillsExecutionManager
} from '../../src/core/skills';
import type { ExecutionRequest } from '../../src/types';

/**
 * 创建包含危险代码的测试技能
 */
async function createDangerousSkill(
  skillsRoot: string,
  skillName: string,
  dangerousCode: string
): Promise<void> {
  const skillDir = path.join(skillsRoot, skillName);
  await fs.mkdir(skillDir, { recursive: true });

  await fs.writeFile(
    path.join(skillDir, 'METADATA.yml'),
    `name: ${skillName}
displayName: 危险技能测试
description: 包含危险代码的测试技能
version: 1.0.0
type: direct
domain: test
keywords: [test, dangerous]
permissions:
  network: false
  filesystem: none
cacheable: false
ttl: 3600
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    `# 危险技能测试

## 代码

\`\`\`typescript
${dangerousCode}
\`\`\`
`,
    'utf-8'
  );
}

describe('Skills系统安全性和权限测试', () => {
  jest.setTimeout(20000);
  let skillsRoot: string;
  let skillsIndex: SkillsIndex;
  let skillsLoader: SkillsLoader;
  let codeGenerator: CodeGenerator;
  let securityValidator: SecurityValidator;
  let sandbox: SandboxEnvironment;
  let executionManager: SkillsExecutionManager;

  beforeAll(async () => {
    skillsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-security-'));
    
    const metadataLoader = new MetadataLoader();
    const skillsCache = new SkillsCache();
    skillsIndex = new SkillsIndex({
      skillsRoot,
      metadataProvider: metadataLoader
    });
    const instructionLoader = new InstructionLoader(skillsIndex, skillsCache);
    const resourceLoader = new ResourceLoader(skillsIndex, skillsCache);
    skillsLoader = new SkillsLoader(skillsIndex, instructionLoader, resourceLoader, skillsCache);
    codeGenerator = new CodeGenerator();
    securityValidator = new SecurityValidator();
    sandbox = new SandboxEnvironment({
      resourceLimits: {
        executionTimeout: 1000,
        memoryLimitMb: 64
      }
    });

    const directExecutor = new SkillsDirectExecutor({
      loader: skillsLoader,
      codeGenerator,
      securityValidator,
      sandbox
    });

    executionManager = new SkillsExecutionManager(skillsLoader, {
      executors: {
        direct: directExecutor
      }
    });

    await skillsIndex.buildIndex();
  });

  afterAll(async () => {
    await fs.rm(skillsRoot, { recursive: true, force: true });
  });

  describe('代码安全验证', () => {
    it('应该拒绝包含eval的代码', async () => {
      await createDangerousSkill(
        skillsRoot,
        'dangerous-eval',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  const code = params.code as string;
  return eval(code);
}`
      );

      await skillsIndex.buildIndex();
      const skill = await skillsLoader.loadSkill('dangerous-eval', { includeContent: true });

      if (skill?.content) {
        const generated = await codeGenerator.generate(skill.content);
        const securityReport = securityValidator.audit(generated);

        expect(securityReport.passed).toBe(false);
        expect(securityReport.riskLevel).not.toBe('safe');
      }
    });

    it('应该拒绝包含child_process的代码', async () => {
      await createDangerousSkill(
        skillsRoot,
        'dangerous-process',
        `import { exec } from 'child_process';
export async function execute(params: Record<string, unknown>): Promise<unknown> {
  exec('rm -rf /', () => {});
  return { success: true };
}`
      );

      await skillsIndex.buildIndex();
      const skill = await skillsLoader.loadSkill('dangerous-process', { includeContent: true });

      if (skill?.content) {
        await expect(codeGenerator.generate(skill.content)).rejects.toThrow('内置模块未在白名单中');
      }
    });

    it('应该拒绝包含Function构造函数的代码', async () => {
      await createDangerousSkill(
        skillsRoot,
        'dangerous-function',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  const fn = new Function('return process.exit(1)');
  return fn();
}`
      );

      await skillsIndex.buildIndex();
      const skill = await skillsLoader.loadSkill('dangerous-function', { includeContent: true });

      if (skill?.content) {
        const generated = await codeGenerator.generate(skill.content);
        const securityReport = securityValidator.audit(generated);

        expect(securityReport.passed).toBe(false);
      }
    });

    it('应该允许安全的代码', async () => {
      await createDangerousSkill(
        skillsRoot,
        'safe-skill',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  const { a = 0, b = 0 } = params as { a?: number; b?: number };
  return {
    success: true,
    result: a + b
  };
}`
      );

      await skillsIndex.buildIndex();
      const skill = await skillsLoader.loadSkill('safe-skill', { includeContent: true });

      if (skill?.content) {
        const generated = await codeGenerator.generate(skill.content);
        const securityReport = securityValidator.audit(generated);

        expect(securityReport.passed).toBe(true);
        expect(securityReport.riskLevel).toBe('safe');
      }
    });
  });

  describe('沙箱隔离', () => {
    it('应该限制资源访问', async () => {
      await createDangerousSkill(
        skillsRoot,
        'resource-test',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  // 尝试访问process
  try {
    return process.env;
  } catch (e) {
    return { error: 'access denied' };
  }
}`
      );

      await skillsIndex.buildIndex();
      const skill = await skillsLoader.loadSkill('resource-test', { includeContent: true });

      if (skill?.content) {
        const generated = await codeGenerator.generate(skill.content);
        const securityReport = securityValidator.audit(generated);

        if (securityReport.passed) {
          // 即使通过安全验证，沙箱也应该限制访问
          const result = await sandbox.execute(generated.javascript, {
            args: {},
            context: {}
          });

          // 应该无法访问process.env
          expect(result.result).not.toEqual(process.env);
        }
      }
    });

    it('应该限制执行时间', async () => {
      await createDangerousSkill(
        skillsRoot,
        'timeout-test',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  // 无限循环
  while (true) {
    // 等待
  }
  return { success: true };
}`
      );

      await skillsIndex.buildIndex();
      const skill = await skillsLoader.loadSkill('timeout-test', { includeContent: true });

      if (skill?.content) {
        const generated = await codeGenerator.generate(skill.content);
        const securityReport = securityValidator.audit(generated);

        if (securityReport.passed) {
          // 应该超时
          await expect(
            sandbox.execute(generated.javascript, {
              args: {},
              context: {}
            })
          ).rejects.toThrow();
        }
      }
    });
  });

  describe('权限控制', () => {
    it('应该尊重权限配置', async () => {
      // 创建需要网络权限的技能
      await createDangerousSkill(
        skillsRoot,
        'network-skill',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  // 尝试网络访问
  return { success: true };
}`
      );

      await skillsIndex.buildIndex();
      const metadata = skillsIndex.getMetadata('network-skill');
      
      // 检查权限配置
      expect(metadata?.permissions.network).toBe(false);
    });
  });

  describe('错误处理', () => {
    it('应该安全地处理执行错误', async () => {
      await createDangerousSkill(
        skillsRoot,
        'error-skill',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  throw new Error('测试错误');
}`
      );

      await skillsIndex.buildIndex();
      
      const response = await executionManager.execute({
        skillName: 'error-skill',
        parameters: {}
      });

      // 应该返回错误响应而不是崩溃
      expect(response).toBeDefined();
      expect(response.success).toBe(false);
      expect(response.error?.message).toContain('沙箱执行失败');
    });
  });
});

