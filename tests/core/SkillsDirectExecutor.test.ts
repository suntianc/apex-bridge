import { SkillsDirectExecutor } from '../../src/core/skills/executors/SkillsDirectExecutor';
import { CodeCache } from '../../src/core/skills/CodeCache';
import { SandboxEnvironment } from '../../src/core/skills/SandboxEnvironment';
import type { CodeGenerator } from '../../src/core/skills/CodeGenerator';
import type { SecurityValidator } from '../../src/core/skills/SecurityValidator';
import type {
  GeneratedSkillCode,
  SecurityReport,
  SkillContent,
  SkillLoadResult,
  SkillMetadata
} from '../../src/types';
import type { SkillsLoader } from '../../src/core/skills/SkillsLoader';

describe('SkillsDirectExecutor', () => {
  const createLoader = (content?: SkillContent, overrides: Partial<SkillMetadata> = {}): SkillsLoader => {
    const metadata: SkillMetadata = {
      name: 'demo-skill',
      displayName: 'Demo Skill',
      description: 'A test skill',
      version: '1.0.0',
      type: 'direct',
      category: 'test',
      domain: 'testing',
      keywords: ['demo'],
      permissions: {},
      cacheable: true,
      ttl: 60_000,
      path: '/tmp/demo-skill',
      loadedAt: Date.now(),
      ...overrides
    } as SkillMetadata;

    const loadSkill = jest.fn(async (_name: string, options?: { includeContent?: boolean }) => {
      const result: SkillLoadResult = { metadata };
      if (options?.includeContent && content) {
        result.content = content;
      }
      return result;
    });

    return {
      loadSkill
    } as unknown as SkillsLoader;
  };

  const sampleContent: SkillContent = {
    name: 'demo-skill',
    raw: '```typescript\nexport function execute(args: { value: number }) {\n  return { doubled: args.value * 2 };\n}\n```',
    sections: [],
    codeBlocks: [
      {
        language: 'typescript',
        code: 'export function execute(args: { value: number }) {\n  return { doubled: args.value * 2 };\n}'
      }
    ],
    path: '/tmp/demo-skill/SKILL.md',
    loadedAt: Date.now()
  };

  it('executes TypeScript code and returns result', async () => {
    const loader = createLoader(sampleContent);
    const executor = new SkillsDirectExecutor({
      loader,
      cache: { ttlMs: 1_000, maxSize: 10 }
    });

    const response = await executor.execute({
      skillName: 'demo-skill',
      parameters: { value: 21 }
    });

    expect(response.success).toBe(true);
    expect(response.result).toMatchObject({
      status: 'success',
      format: 'object',
      data: { doubled: 42 }
    });
    expect(response.metadata.executionType).toBe('direct');
    expect(response.metadata.cacheHit).toBe(false);
    expect(response.metadata.profilerMetrics).toBeDefined();
  });

  it('returns cached response on subsequent calls when cacheable', async () => {
    const loader = createLoader(sampleContent);
    const executor = new SkillsDirectExecutor({
      loader,
      cache: { ttlMs: 5_000, maxSize: 5 }
    });

    const first = await executor.execute({
      skillName: 'demo-skill',
      parameters: { value: 10 }
    });

    expect(first.success).toBe(true);
    expect(first.metadata.cacheHit).toBe(false);

    const second = await executor.execute({
      skillName: 'demo-skill',
      parameters: { value: 10 }
    });

    expect(second.success).toBe(true);
    expect(second.metadata.cacheHit).toBe(true);
    expect(second.result).toMatchObject({ status: 'success' });
  });

  it('returns error when no TypeScript blocks are available', async () => {
    const loader = createLoader({
      ...sampleContent,
      codeBlocks: []
    });

    const executor = new SkillsDirectExecutor({
      loader,
      cache: { ttlMs: 1_000, maxSize: 5 }
    });

    const response = await executor.execute({
      skillName: 'demo-skill'
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('CODE_EXTRACTION_ERROR');
    expect(response.result).toMatchObject({ status: 'error', message: expect.any(String) });
  });

  it('reuses compiled code via code cache between executions', async () => {
    const loader = createLoader(sampleContent, { cacheable: false });

    const generated: GeneratedSkillCode = {
      javascript: 'module.exports.execute = (args) => ({ value: args.value });',
      metadata: { exports: [], imports: [], complexityScore: 1 },
      dependencies: [],
      sourceMap: undefined,
      diagnostics: undefined
    };

    const securityReport: SecurityReport = {
      passed: true,
      riskLevel: 'safe',
      issues: [],
      recommendations: [],
      durationMs: 2
    };

    const codeGeneratorMock = {
      generate: jest.fn().mockResolvedValue(generated)
    };
    const securityValidatorMock = {
      audit: jest.fn().mockReturnValue(securityReport)
    };

    const executor = new SkillsDirectExecutor({
      loader,
      codeGenerator: codeGeneratorMock as unknown as CodeGenerator,
      securityValidator: securityValidatorMock as unknown as SecurityValidator,
      sandbox: new SandboxEnvironment(),
      codeCache: new CodeCache({ ttlMs: 60_000, maxSize: 4 })
    });

    const first = await executor.execute({
      skillName: 'demo-skill',
      parameters: { value: 1 }
    });

    expect(codeGeneratorMock.generate).toHaveBeenCalledTimes(1);
    expect(securityValidatorMock.audit).toHaveBeenCalledTimes(1);
    expect(first.result).toMatchObject({ status: 'success', format: 'object' });

    const second = await executor.execute({
      skillName: 'demo-skill',
      parameters: { value: 2 }
    });

    expect(codeGeneratorMock.generate).toHaveBeenCalledTimes(1);
    expect(securityValidatorMock.audit).toHaveBeenCalledTimes(1);
    expect(second.result).toMatchObject({ status: 'success', format: 'object' });
    expect(first.metadata.profilerMetrics).toBeDefined();
    expect(second.metadata.profilerMetrics).toEqual(first.metadata.profilerMetrics);
  });

  it('applies security policy when invoking sandbox', async () => {
    const loader = createLoader(sampleContent, {
      security: {
        timeoutMs: 2500,
        memoryMb: 64,
        environment: {
          MODE: 'test'
        }
      }
    });

    const generated: GeneratedSkillCode = {
      javascript: 'module.exports.execute = () => ({ ok: true });',
      metadata: { exports: [], imports: [], complexityScore: 1 },
      dependencies: [],
      sourceMap: undefined,
      diagnostics: undefined
    };

    const securityReport: SecurityReport = {
      passed: true,
      riskLevel: 'safe',
      issues: [],
      recommendations: [],
      durationMs: 1
    };

    const codeGeneratorMock = { generate: jest.fn().mockResolvedValue(generated) };
    const securityValidatorMock = { audit: jest.fn().mockReturnValue(securityReport) };
    const sandboxMock = {
      execute: jest.fn().mockResolvedValue({
        result: { ok: true },
        executionTime: 5,
        securityReport
      })
    } as unknown as SandboxEnvironment;

    const executor = new SkillsDirectExecutor({
      loader,
      codeGenerator: codeGeneratorMock as unknown as CodeGenerator,
      securityValidator: securityValidatorMock as unknown as SecurityValidator,
      sandbox: sandboxMock,
      codeCache: new CodeCache({ ttlMs: 60_000, maxSize: 2 })
    });

    const response = await executor.execute({
      skillName: 'demo-skill'
    });

    expect(response.success).toBe(true);
    expect(sandboxMock.execute).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        resourceLimitsOverride: {
          executionTimeout: 2500,
          memoryLimitMb: 64
        },
        environment: {
          MODE: 'test'
        }
      })
    );
  });
});
