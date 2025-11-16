/**
 * Skills系统回滚机制测试
 * 
 * 测试：
 * - 版本回滚
 * - 配置回滚
 * - 错误恢复
 * - 向后兼容性
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
  SkillsExecutionManager,
  SkillsDirectExecutor,
  CodeGenerator,
  SecurityValidator,
  SandboxEnvironment
} from '../../src/core/skills';
import type { ExecutionRequest, ExecutionResponse } from '../../src/types';

function extractResultData(response: ExecutionResponse | undefined): any {
  if (!response || !response.result) {
    return undefined;
  }
  const result = response.result as any;
  return result.data ?? result;
}

/**
 * 创建技能版本
 */
async function createSkillVersion(
  skillsRoot: string,
  skillName: string,
  version: string,
  code: string
): Promise<void> {
  const skillDir = path.join(skillsRoot, skillName);
  await fs.mkdir(skillDir, { recursive: true });

  await fs.writeFile(
    path.join(skillDir, 'METADATA.yml'),
    `name: ${skillName}
displayName: ${skillName}测试
description: 测试技能版本${version}
version: ${version}
type: direct
domain: test
keywords: [test, rollback]
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    `# ${skillName} v${version}

## 代码

\`\`\`typescript
${code}
\`\`\`
`,
    'utf-8'
  );
}

describe('Skills系统回滚机制测试', () => {
  let skillsRoot: string;
  let skillsIndex: SkillsIndex;
  let skillsLoader: SkillsLoader;
  let executionManager: SkillsExecutionManager;

  beforeAll(async () => {
    skillsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-rollback-'));
    
    // 创建初始版本
    await createSkillVersion(
      skillsRoot,
      'rollback-test',
      '1.0.0',
      `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  return { success: true, version: '1.0.0', result: 'stable' };
}`
    );

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
    const sandbox = new SandboxEnvironment();
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

  describe('版本回滚', () => {
    it('应该能够回滚到之前的版本', async () => {
      // 执行初始版本
      const v1Response = await executionManager.execute({
        skillName: 'rollback-test',
        parameters: {}
      });

      expect(v1Response.success).toBe(true);
      expect(extractResultData(v1Response)?.version).toBe('1.0.0');

      // 更新到新版本（有问题的版本）
      await createSkillVersion(
        skillsRoot,
        'rollback-test',
        '2.0.0',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  throw new Error('新版本有问题');
}`
      );

      // 重新构建索引
      await skillsIndex.buildIndex();

      // 新版本应该失败
      const failedResponse = await executionManager.execute({
        skillName: 'rollback-test',
        parameters: {}
      });
      expect(failedResponse.success).toBe(false);
      expect(failedResponse.error?.message ?? '').toContain('沙箱执行失败');

      // 回滚到旧版本
      await createSkillVersion(
        skillsRoot,
        'rollback-test',
        '1.0.0',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  return { success: true, version: '1.0.0', result: 'stable' };
}`
      );

      await skillsIndex.buildIndex();

      // 应该能够正常执行
      const rollbackResponse = await executionManager.execute({
        skillName: 'rollback-test',
        parameters: {}
      });

      expect(rollbackResponse.success).toBe(true);
      expect(extractResultData(rollbackResponse)?.version).toBe('1.0.0');
    });
  });

  describe('错误恢复', () => {
    it('应该能够从执行错误中恢复', async () => {
      // 创建一个会失败的技能
      await createSkillVersion(
        skillsRoot,
        'error-recovery',
        '1.0.0',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  const { shouldFail = false } = params as { shouldFail?: boolean };
  if (shouldFail) {
    throw new Error('执行失败');
  }
  return { success: true };
}`
      );

      await skillsIndex.buildIndex();

      // 第一次执行失败
      const failingExecution = await executionManager.execute({
        skillName: 'error-recovery',
        parameters: { shouldFail: true }
      });
      expect(failingExecution.success).toBe(false);
      expect(failingExecution.error?.message ?? '').toContain('执行失败');

      // 修复后应该能够正常执行
      const recoveryResponse = await executionManager.execute({
        skillName: 'error-recovery',
        parameters: { shouldFail: false }
      });

      expect(recoveryResponse.success).toBe(true);
    });
  });

  describe('向后兼容性', () => {
    it('应该支持旧版本API', async () => {
      // 创建使用旧API的技能
      await createSkillVersion(
        skillsRoot,
        'backward-compat',
        '1.0.0',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  // 旧版本API
  const result = params.value || 0;
  return { success: true, result };
}`
      );

      await skillsIndex.buildIndex();

      // 应该能够使用旧API执行
      const response = await executionManager.execute({
        skillName: 'backward-compat',
        parameters: { value: 42 }
      });

      expect(response.success).toBe(true);
      expect(extractResultData(response)?.result).toBe(42);
    });

    it('应该支持新版本API', async () => {
      // 创建使用新API的技能
      await createSkillVersion(
        skillsRoot,
        'forward-compat',
        '2.0.0',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  // 新版本API
  const { value = 0, options = {} } = params as { value?: number; options?: Record<string, unknown> };
  return { success: true, result: value, options };
}`
      );

      await skillsIndex.buildIndex();

      // 应该能够使用新API执行
      const response = await executionManager.execute({
        skillName: 'forward-compat',
        parameters: { value: 100, options: { format: 'json' } }
      });

      expect(response.success).toBe(true);
      expect(extractResultData(response)?.result).toBe(100);
    });
  });

  describe('缓存清理', () => {
    it('应该在回滚时清理相关缓存', async () => {
      const cache = skillsLoader.getCache();
      const statsBefore = cache.getStats();

      // 加载技能
      await skillsLoader.loadSkill('rollback-test', { includeContent: true });

      // 更新技能
      await createSkillVersion(
        skillsRoot,
        'rollback-test',
        '2.0.0',
        `export async function execute(params: Record<string, unknown>): Promise<unknown> {
  return { success: true, version: '2.0.0' };
}`
      );

      // 清理缓存
      cache.clear('rollback-test');

      // 重新构建索引
      await skillsIndex.buildIndex();

      // 重新加载应该获取新版本
      const skill = await skillsLoader.loadSkill('rollback-test', { includeContent: true });
      expect(skill?.metadata.version).toBe('2.0.0');
    });
  });
});

