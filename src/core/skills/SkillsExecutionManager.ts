import {
  ExecutionRequest,
  ExecutionResponse,
  ExecutionStats,
  SkillExecutionType,
  SkillsExecutor,
  SkillSearchResult
} from '../../types';
import { IMemoryService } from '../../types/memory';
import logger from '../../utils/logger';
import { SkillsLoader } from './SkillsLoader';
import { SkillsMetricsCollector } from './SkillsMetricsCollector';
import { SkillUsageTracker } from './SkillUsageTracker';

export interface SkillsExecutionManagerOptions {
  executors?: Partial<Record<SkillExecutionType, SkillsExecutor>>;
  fallbackChain?: Partial<Record<SkillExecutionType, SkillExecutionType[]>>;
  defaultExecutor?: SkillExecutionType;
  usageTracker?: SkillUsageTracker; // 可选的使用跟踪器
  memoryService?: IMemoryService; // 可选的记忆服务
}

export interface ExecuteByIntentOptions extends Omit<ExecutionRequest, 'skillName'> {
  minConfidence?: number;
  limit?: number;
}

const DEFAULT_FALLBACKS: Partial<Record<SkillExecutionType, SkillExecutionType[]>> = {
  service: ['direct', 'internal'],
  distributed: ['service', 'direct'],
  direct: ['internal'],
  preprocessor: ['internal'],
  static: ['direct'],
  internal: []
};

export class SkillsExecutionManager {
  private readonly executors = new Map<SkillExecutionType, SkillsExecutor>();
  private readonly fallbackChain = new Map<SkillExecutionType, SkillExecutionType[]>();
  private readonly defaultExecutor: SkillExecutionType;
  private readonly logger = logger.child({ component: 'SkillsExecutionManager' });
  private readonly metrics = new SkillsMetricsCollector();
  private readonly usageTracker?: SkillUsageTracker;
  private readonly memoryService?: IMemoryService;

  constructor(
    private readonly loader: SkillsLoader,
    options: SkillsExecutionManagerOptions = {}
  ) {
    this.usageTracker = options.usageTracker;
    this.memoryService = options.memoryService;
    if (options.executors) {
      for (const [type, executor] of Object.entries(options.executors)) {
        if (executor) {
          this.executors.set(type as SkillExecutionType, executor);
        }
      }
    }

    const fallbackSource = { ...DEFAULT_FALLBACKS, ...options.fallbackChain };
    for (const [type, fallbacks] of Object.entries(fallbackSource)) {
      this.fallbackChain.set(type as SkillExecutionType, fallbacks ?? []);
    }

    this.defaultExecutor = options.defaultExecutor ?? 'direct';
  }

  registerExecutor(type: SkillExecutionType, executor: SkillsExecutor): void {
    this.executors.set(type, executor);
  }

  setFallbacks(type: SkillExecutionType, fallbacks: SkillExecutionType[]): void {
    this.fallbackChain.set(type, fallbacks);
  }

  getExecutionStats(): ExecutionStats {
    return this.metrics.getStats();
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
    const skill = await this.loader.loadSkill(request.skillName);
    if (!skill) {
      throw new Error(`技能不存在: ${request.skillName}`);
    }

    const primaryType = skill.metadata.type ?? this.defaultExecutor;
    return this.executeWithFallback(primaryType, request, new Set());
  }

  async executeByIntent(intent: string, options: ExecuteByIntentOptions = {}): Promise<ExecutionResponse> {
    const limit = options.limit ?? 5;
    const minConfidence = options.minConfidence ?? 0;
    const matches = await this.loader.findSkillsByIntent(intent, {
      limit,
      minConfidence
    });

    if (matches.length === 0) {
      throw new Error(`未找到与意图匹配的技能: ${intent}`);
    }

    let lastError: Error | undefined;
    for (const match of matches) {
      try {
        const response = await this.execute({
          skillName: match.metadata.name,
          parameters: options.parameters ?? {},
          context: options.context,
          timeout: options.timeout,
          permissions: options.permissions
        });
        this.annotateResponseWithMatch(response, match);
        return response;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `[SkillsExecutionManager] 通过意图执行技能 ${match.metadata.name} 失败: ${(error as Error).message}`
        );
      }
    }

    throw lastError ?? new Error(`未能执行与意图匹配的技能: ${intent}`);
  }

  private async executeWithFallback(
    type: SkillExecutionType,
    request: ExecutionRequest,
    visited: Set<SkillExecutionType>
  ): Promise<ExecutionResponse> {
    if (visited.has(type)) {
      throw new Error(`检测到执行器循环: ${Array.from(visited).join(' -> ')} -> ${type}`);
    }
    visited.add(type);

    const executor = this.executors.get(type) ?? this.executors.get(this.defaultExecutor);
    if (!executor) {
      throw new Error(`未注册执行器: ${type}`);
    }

    let response: ExecutionResponse;
    try {
      response = await executor.execute(request);
      this.metrics.recordExecution(type, response);

      // 记录使用情况（如果启用了使用跟踪）
      if (this.usageTracker) {
        const skill = await this.loader.loadSkill(request.skillName);
        const requiresResources = Boolean(skill?.resources);
        // 从响应中提取置信度（如果有）
        const confidence = (response.metadata as any).confidence;
        this.usageTracker.recordExecution(request.skillName, response, confidence, requiresResources);
      }

      // 收集memoryWrites和intermediateSteps（如果执行成功）
      if (response.success && response.result?.data) {
        const outcome = response.result.data as any;
        const memoryWrites = outcome.memoryWrites;
        const intermediateSteps = outcome.intermediateSteps;

        // 处理memoryWrites：提交到IMemoryService
        if (memoryWrites && Array.isArray(memoryWrites) && memoryWrites.length > 0 && this.memoryService) {
          await this.processMemoryWrites(memoryWrites, request);
        }

        // 处理intermediateSteps：用于调试和监控
        if (intermediateSteps && Array.isArray(intermediateSteps) && intermediateSteps.length > 0) {
          this.processIntermediateSteps(intermediateSteps, request);
        }
      }
    } catch (error) {
      this.metrics.recordFailure(type);
      throw error;
    }

    if (response.success) {
      return response;
    }

    const fallbacks = this.fallbackChain.get(type) ?? [];
    if (fallbacks.length === 0) {
      return response;
    }

    this.logger.warn(`主执行器 ${type} 执行失败，尝试故障转移`);

    for (const fallbackType of fallbacks) {
      if (visited.has(fallbackType)) {
        continue;
      }
      const fallbackResponse = await this.executeWithFallback(fallbackType, request, visited);
      if (fallbackResponse.success) {
        const warnings = new Set<string>(fallbackResponse.warnings ?? []);
        warnings.add(`执行器 ${type} 失败，已使用 ${fallbackType} 作为故障转移`);
        return {
          ...fallbackResponse,
          warnings: Array.from(warnings)
        };
      }
    }

    return response;
  }

  /**
   * 处理记忆写入建议
   * 将memoryWrites提交到IMemoryService
   */
  private async processMemoryWrites(
    memoryWrites: import('../../types/memory').MemoryWriteSuggestion[],
    request: ExecutionRequest
  ): Promise<void> {
    if (!this.memoryService) {
      this.logger.debug('[SkillsExecutionManager] MemoryService未配置，跳过memoryWrites处理');
      return;
    }

    try {
      for (const suggestion of memoryWrites) {
        // 验证suggestion格式
        if (!this.validateMemoryWriteSuggestion(suggestion)) {
          this.logger.warn('[SkillsExecutionManager] 无效的memoryWrite建议，已跳过', {
            suggestion,
            skillName: request.skillName
          });
          continue;
        }

        // 转换为Memory格式
        const memory: import('../../types/memory').Memory = {
          content: suggestion.content,
          userId: suggestion.ownerType === 'user' ? suggestion.ownerId : undefined,
          timestamp: Date.now(),
          metadata: {
            source: 'skill',
            sourceSkill: request.skillName,
            ownerType: suggestion.ownerType,
            ownerId: suggestion.ownerId,
            type: suggestion.type,
            importance: suggestion.importance / 5, // 转换为0-1范围
            ...suggestion.metadata
          }
        };

        // 提交到IMemoryService
        await this.memoryService.save(memory);
        this.logger.debug('[SkillsExecutionManager] 成功保存记忆', {
          skillName: request.skillName,
          ownerType: suggestion.ownerType,
          ownerId: suggestion.ownerId,
          type: suggestion.type
        });
      }
    } catch (error) {
      this.logger.error('[SkillsExecutionManager] 处理memoryWrites时出错', {
        error: (error as Error).message,
        skillName: request.skillName,
        count: memoryWrites.length
      });
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 验证memoryWrite建议的格式
   */
  private validateMemoryWriteSuggestion(
    suggestion: import('../../types/memory').MemoryWriteSuggestion
  ): boolean {
    if (!suggestion.ownerType || !suggestion.ownerId || !suggestion.type || !suggestion.content) {
      return false;
    }
    if (!['user', 'household', 'task', 'group'].includes(suggestion.ownerType)) {
      return false;
    }
    if (!['preference', 'fact', 'event', 'summary'].includes(suggestion.type)) {
      return false;
    }
    if (typeof suggestion.importance !== 'number' || suggestion.importance < 1 || suggestion.importance > 5) {
      return false;
    }
    return true;
  }

  /**
   * 处理中间步骤追踪
   * 将intermediateSteps用于调试日志和可观测性监控
   */
  private processIntermediateSteps(
    steps: import('../../types/memory').StepTrace[],
    request: ExecutionRequest
  ): void {
    try {
      // 记录调试日志
      this.logger.debug('[SkillsExecutionManager] 技能执行中间步骤', {
        skillName: request.skillName,
        stepCount: steps.length,
        steps: steps.map((step) => ({
          stepId: step.stepId,
          stepName: step.stepName,
          duration: step.duration,
          hasError: !!step.error
        }))
      });

      // 记录详细步骤信息（仅在debug模式）
      if (this.logger.level === 'debug') {
        for (const step of steps) {
          this.logger.debug(`[SkillsExecutionManager] 步骤: ${step.stepName}`, {
            stepId: step.stepId,
            duration: `${step.duration}ms`,
            input: step.input,
            output: step.output,
            error: step.error?.message,
            timestamp: step.timestamp ?? Date.now()
          });
        }
      }

      // 计算总耗时
      const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
      if (totalDuration > 1000) {
        this.logger.warn('[SkillsExecutionManager] 技能执行总耗时较长', {
          skillName: request.skillName,
          totalDuration: `${totalDuration}ms`,
          stepCount: steps.length
        });
      }

      // 检查是否有错误步骤
      const errorSteps = steps.filter((step) => step.error);
      if (errorSteps.length > 0) {
        this.logger.warn('[SkillsExecutionManager] 技能执行过程中有错误步骤', {
          skillName: request.skillName,
          errorStepCount: errorSteps.length,
          errors: errorSteps.map((step) => ({
            stepId: step.stepId,
            stepName: step.stepName,
            error: step.error?.message
          }))
        });
      }
    } catch (error) {
      this.logger.error('[SkillsExecutionManager] 处理intermediateSteps时出错', {
        error: (error as Error).message,
        skillName: request.skillName
      });
      // 不抛出错误，避免影响主流程
    }
  }

  private annotateResponseWithMatch(
    response: ExecutionResponse,
    match: SkillSearchResult
  ): void {
    (response.metadata as any).confidence = match.confidence;
    (response.metadata as any).matchedSkill = match.metadata.name;
    if (match.matchedTriggers && match.matchedTriggers.length > 0) {
      (response.metadata as any).matchedTriggers = match.matchedTriggers;
    }
  }
}
