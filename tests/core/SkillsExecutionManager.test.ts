import type { SkillsLoader } from '../../src/core/skills/SkillsLoader';
import { SkillsExecutionManager } from '../../src/core/skills/SkillsExecutionManager';
import type {
  ExecutionMetadata,
  ExecutionRequest,
  ExecutionResponse,
  SkillLoadResult,
  SkillMetadata,
  SkillsExecutor,
  StandardSkillResult,
  ValidationResult
} from '../../src/types';
import type { IMemoryService, MemoryWriteSuggestion, StepTrace } from '../../src/types/memory';

describe('SkillsExecutionManager', () => {
  const createLoader = (
    type: SkillMetadata['type'],
    intentMatch: boolean = false
  ): SkillsLoader => {
    const metadata: SkillMetadata = {
      name: 'demo-skill',
      displayName: 'Demo Skill',
      description: 'A test skill',
      version: '1.0.0',
      type,
      category: 'test',
      domain: 'testing',
      keywords: ['demo'],
      permissions: {},
      cacheable: false,
      ttl: 60_000,
      path: '/tmp/demo-skill',
      loadedAt: Date.now()
    } as SkillMetadata;

    const loadSkill = jest.fn(async (_name: string) => {
      const result: SkillLoadResult = { metadata };
      return result;
    });

    const findSkillsByIntent = jest.fn(async (_intent: string) => {
      if (!intentMatch) {
        return [];
      }
      return [
        {
          metadata,
          confidence: 0.9,
          matchedKeywords: [],
          matchedDescriptionTerms: [],
          matchedTriggers: ['intent:demo']
        }
      ];
    });

    return {
      loadSkill,
      findSkillsByIntent
    } as unknown as SkillsLoader;
  };

  const createExecutor = (
    type: SkillMetadata['type'],
    response: ExecutionResponse
  ): SkillsExecutor => ({
    execute: jest.fn().mockResolvedValue(response),
    validate: jest.fn().mockResolvedValue({ valid: true, errors: [] } as ValidationResult),
    getExecutionContext: () => ({}),
    cleanup: jest.fn().mockResolvedValue(undefined)
  });

  const createMetadata = (type: SkillMetadata['type']): ExecutionMetadata => ({
    executionTime: 1,
    memoryUsage: 0,
    tokenUsage: 0,
    cacheHit: false,
    executionType: type,
    timestamp: Date.now()
  });

  it('uses primary executor when successful', async () => {
    const loader = createLoader('service');

    const serviceResponse: ExecutionResponse = {
      success: true,
      result: { status: 'success', format: 'object', data: { ok: true } },
      metadata: createMetadata('service')
    };

    const serviceExecutor = createExecutor('service', serviceResponse);

    const manager = new SkillsExecutionManager(loader, {
      executors: {
        service: serviceExecutor
      }
    });

    const response = await manager.execute({ skillName: 'demo-skill' });

    expect(response).toEqual(serviceResponse);
    expect((serviceExecutor.execute as jest.Mock)).toHaveBeenCalledTimes(1);

    const stats = manager.getExecutionStats();
    expect(stats.totalExecutions).toBe(1);
    expect(stats.successfulExecutions).toBe(1);
    expect(stats.executorStats.service.successful).toBe(1);
    expect(stats.executorStats.service.failed).toBe(0);
  });

  it('falls back when primary executor fails', async () => {
    const loader = createLoader('service');

    const failureResponse: ExecutionResponse = {
      success: false,
      error: { code: 'ERROR', message: 'primary failed' },
      result: { status: 'error', format: 'object', message: 'primary failed' },
      metadata: createMetadata('service')
    };

    const fallbackResponse: ExecutionResponse = {
      success: true,
      result: { status: 'success', format: 'object', data: { via: 'fallback' } },
      metadata: createMetadata('direct')
    };

    const serviceExecutor = createExecutor('service', failureResponse);
    const directExecutor = createExecutor('direct', fallbackResponse);

    const manager = new SkillsExecutionManager(loader, {
      executors: {
        service: serviceExecutor,
        direct: directExecutor
      }
    });

    const response = await manager.execute({ skillName: 'demo-skill' });

    expect(response.success).toBe(true);
    expect(response.result).toMatchObject({ status: 'success', data: { via: 'fallback' } });
    expect(response.warnings).toContain('执行器 service 失败，已使用 direct 作为故障转移');
    expect((serviceExecutor.execute as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((directExecutor.execute as jest.Mock)).toHaveBeenCalledTimes(1);

    const stats = manager.getExecutionStats();
    expect(stats.totalExecutions).toBe(2);
    expect(stats.failedExecutions).toBe(1);
    expect(stats.successfulExecutions).toBe(1);
    expect(stats.executorStats.service.failed).toBe(1);
    expect(stats.executorStats.direct.successful).toBe(1);
  });

  it('executes skill matched by intent triggers', async () => {
    const loader = createLoader('direct', true);
    const directResponse: ExecutionResponse = {
      success: true,
      result: { status: 'success', format: 'object', data: { via: 'intent' } },
      metadata: createMetadata('direct')
    };
    const directExecutor = createExecutor('direct', directResponse);

    const manager = new SkillsExecutionManager(loader, {
      executors: {
        direct: directExecutor
      }
    });

    const response = await manager.executeByIntent('触发 demo 技能', {
      parameters: { foo: 'bar' },
      minConfidence: 0.1
    });

    expect(response.success).toBe(true);
    expect((directExecutor.execute as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: 'demo-skill',
        parameters: { foo: 'bar' }
      })
    );
    expect((response.metadata as any).confidence).toBeGreaterThan(0);
    expect((response.metadata as any).matchedSkill).toBe('demo-skill');
  });

  describe('Memory integration hooks', () => {
    const buildRequest = (): ExecutionRequest => ({
      skillName: 'demo-skill'
    });

    const buildOutcome = (
      overrides: Partial<{ memoryWrites: MemoryWriteSuggestion[]; intermediateSteps: StepTrace[] }>
    ): StandardSkillResult => ({
      status: 'success',
      format: 'object',
      data: {
        memoryWrites: overrides.memoryWrites ?? [],
        intermediateSteps: overrides.intermediateSteps ?? []
      }
    });

    it('persists valid memoryWrites through IMemoryService and skips invalid payloads', async () => {
      const loader = createLoader('direct');
      const memoryService: IMemoryService = {
        save: jest.fn().mockResolvedValue(undefined),
        recall: jest.fn()
      };

      const validSuggestion: MemoryWriteSuggestion = {
        ownerType: 'user',
        ownerId: 'user-123',
        type: 'fact',
        importance: 3,
        content: '用户喜欢乌龙茶',
        metadata: {
          locale: 'zh-CN'
        }
      };

      const invalidSuggestion: MemoryWriteSuggestion = {
        ownerType: 'user',
        // 缺少 ownerId
        ownerId: '' as unknown as string,
        type: 'fact',
        importance: 2,
        content: '无效的建议'
      };

      const directResponse: ExecutionResponse = {
        success: true,
        result: buildOutcome({
          memoryWrites: [validSuggestion, invalidSuggestion]
        }),
        metadata: createMetadata('direct')
      };

      const directExecutor = createExecutor('direct', directResponse);

      const manager = new SkillsExecutionManager(loader, {
        executors: {
          direct: directExecutor
        },
        memoryService
      });

      await manager.execute(buildRequest());

      expect(memoryService.save).toHaveBeenCalledTimes(1);
      const savedMemory = (memoryService.save as jest.Mock).mock.calls[0][0];
      expect(savedMemory.content).toBe(validSuggestion.content);
      expect(savedMemory.userId).toBe('user-123');
      expect(savedMemory.metadata).toMatchObject({
        source: 'skill',
        sourceSkill: 'demo-skill',
        ownerType: 'user',
        ownerId: 'user-123',
        type: 'fact',
        importance: validSuggestion.importance / 5,
        locale: 'zh-CN'
      });
    });

    it('emits intermediateSteps telemetry for successful executions', async () => {
      const loader = createLoader('direct');
      const steps: StepTrace[] = [
        {
          stepId: 'step-1',
          stepName: 'Prepare memory write',
          input: { foo: 'bar' },
          output: { ok: true },
          duration: 12
        }
      ];

      const spy = jest.spyOn(SkillsExecutionManager.prototype as any, 'processIntermediateSteps');

      const directResponse: ExecutionResponse = {
        success: true,
        result: buildOutcome({
          intermediateSteps: steps
        }),
        metadata: createMetadata('direct')
      };

      const directExecutor = createExecutor('direct', directResponse);

      const manager = new SkillsExecutionManager(loader, {
        executors: {
          direct: directExecutor
        }
      });

      await manager.execute(buildRequest());

      expect(spy).toHaveBeenCalledWith(expect.arrayContaining(steps), expect.objectContaining({ skillName: 'demo-skill' }));
      spy.mockRestore();
    });
  });
});
