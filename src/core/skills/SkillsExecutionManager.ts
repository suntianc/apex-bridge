import {
  ExecutionRequest,
  ExecutionResponse,
  ExecutionStats,
  SkillExecutionType,
  SkillsExecutor,
  SkillSearchResult
} from '../../types';
import logger from '../../utils/logger';
import { SkillsLoader } from './SkillsLoader';

export interface SkillsExecutionManagerOptions {
  executors?: Partial<Record<SkillExecutionType, SkillsExecutor>>;
  fallbackChain?: Partial<Record<SkillExecutionType, SkillExecutionType[]>>;
  defaultExecutor?: SkillExecutionType;
}

export interface ExecuteByIntentOptions extends Omit<ExecutionRequest, 'skillName'> {
  minConfidence?: number;
  limit?: number;
}

const DEFAULT_FALLBACKS: Partial<Record<SkillExecutionType, SkillExecutionType[]>> = {
  direct: ['internal'],
  internal: []
};

export class SkillsExecutionManager {
  private readonly executors = new Map<SkillExecutionType, SkillsExecutor>();
  private readonly fallbackChain = new Map<SkillExecutionType, SkillExecutionType[]>();
  private readonly defaultExecutor: SkillExecutionType;
  private readonly logger = logger.child({ component: 'SkillsExecutionManager' });

  constructor(
    private readonly loader: SkillsLoader,
    options: SkillsExecutionManagerOptions = {}
  ) {
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

  // 执行统计已简化（OpenSpec Phase 4）

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
    } catch (error) {
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
