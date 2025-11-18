import {
  ExecutionError,
  ExecutionMetadata,
  ExecutionRequest,
  ExecutionResponse,
  ExecutionContext,
  ExecutorCacheConfig,
  SkillExecutionOutcome,
  SkillExecutionType,
  SkillMetadata,
  SkillsExecutor,
  ValidationResult,
  StandardSkillResult,
  SkillResultFormat,
  SkillResultStatus
} from '../../../types';
import { Cache, createCache } from '../../../utils/cache';
import logger from '../../../utils/logger';
import { ErrorWrapper } from '../CodeGenerationErrors';
import type { Logger } from 'winston';

interface CacheEntry {
  response: ExecutionResponse;
}

export interface BaseSkillsExecutorOptions {
  executionType: SkillExecutionType;
  cache?: ExecutorCacheConfig;
  loggerContext?: string;
}

export abstract class BaseSkillsExecutor implements SkillsExecutor {
  protected readonly executionType: SkillExecutionType;
  protected readonly cache?: Cache<CacheEntry>;
  protected readonly logger: Logger;

  constructor(options: BaseSkillsExecutorOptions) {
    this.executionType = options.executionType;
    this.logger = options.loggerContext
      ? logger.child({ executor: options.loggerContext })
      : logger.child({ executor: this.constructor.name });

    if (options.cache) {
      // 使用统一的 Cache 类替代 TTLCache
      this.cache = createCache<CacheEntry>(
        options.cache.ttlMs,
        options.cache.maxSize
      );
    }
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
    const startTime = Date.now();
    const startMemory = this.getMemoryUsage();

    const validation = await this.validateRequest(request);
    if (!validation.valid) {
      this.logger.warn(`[SkillsExecutor] 请求验证失败: ${validation.errors.join('; ')}`);
      return this.createErrorResponse(
        startTime,
        startMemory,
        {
          code: 'VALIDATION_FAILED',
          message: '技能执行请求验证失败',
          details: { errors: validation.errors }
        },
        validation.warnings
      );
    }

    const metadata = validation.metadata;

    const cacheKey = this.shouldUseCache(request, metadata)
      ? this.generateCacheKey(request, metadata)
      : undefined;

    if (cacheKey && this.cache?.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.logger.debug(`[SkillsExecutor] 命中缓存: ${cacheKey}`);
        return this.decorateCachedResponse(cached.response, startTime, startMemory);
      }
    }

    try {
      const outcome = await this.executeSkill(request, metadata);
      const response = this.createSuccessResponse(startTime, startMemory, outcome, validation.warnings);

      if (cacheKey && this.cache) {
        this.cache.set(cacheKey, {
          response: {
            ...response,
            metadata: { ...response.metadata, cacheHit: false }
          }
        });
      }

      return response;
    } catch (error) {
      this.logger.error(`[SkillsExecutor] 执行失败: ${(error as Error).message}`);
      return this.createErrorResponse(
        startTime,
        startMemory,
        this.normalizeError(error, request, metadata),
        validation.warnings
      );
    }
  }

  async validate(skill: SkillMetadata): Promise<ValidationResult> {
    return this.validateSkillMetadata(skill);
  }

  getExecutionContext(): ExecutionContext {
    return {};
  }

  async cleanup(): Promise<void> {
    return Promise.resolve();
  }

  protected shouldUseCache(request: ExecutionRequest, metadata?: SkillMetadata): boolean {
    return Boolean(this.cache) && Boolean(metadata?.cacheable);
  }

  protected generateCacheKey(request: ExecutionRequest, metadata?: SkillMetadata): string {
    return JSON.stringify({
      skill: request.skillName,
      params: request.parameters ?? {},
      metadataVersion: metadata?.updatedAt ?? metadata?.loadedAt
    });
  }

  protected createSuccessResponse(
    startTime: number,
    startMemory: number,
    outcome: SkillExecutionOutcome,
    warnings?: string[]
  ): ExecutionResponse {
    const endTime = Date.now();
    const endMemory = this.getMemoryUsage();

    const metadata: ExecutionMetadata = {
      executionTime: endTime - startTime,
      memoryUsage: Math.max(0, endMemory - startMemory),
      tokenUsage: outcome.tokenUsage ?? 0,
      cacheHit: false,
      executionType: this.executionType,
      timestamp: endTime,
      securityReport: outcome.securityReport,
      profilerMetrics: outcome.profilerMetrics
    };

    const combinedWarnings = new Set<string>();
    if (warnings) {
      for (const warning of warnings) {
        combinedWarnings.add(warning);
      }
    }
    if (outcome.warnings) {
      for (const warning of outcome.warnings) {
        combinedWarnings.add(warning);
      }
    }

    const response: ExecutionResponse = {
      success: true,
      result: this.createResultEnvelope(outcome, 'success'),
      metadata
    };

    if (combinedWarnings.size > 0) {
      response.warnings = Array.from(combinedWarnings);
    }

    return response;
  }

  protected createErrorResponse(
    startTime: number,
    startMemory: number,
    error: ExecutionError,
    warnings?: string[]
  ): ExecutionResponse {
    const endTime = Date.now();
    const endMemory = this.getMemoryUsage();

    const metadata: ExecutionMetadata = {
      executionTime: endTime - startTime,
      memoryUsage: Math.max(0, endMemory - startMemory),
      tokenUsage: 0,
      cacheHit: false,
      executionType: this.executionType,
      timestamp: endTime
    };

    const combinedWarnings = new Set<string>(warnings ?? []);

    const response: ExecutionResponse = {
      success: false,
      error,
      result: this.createErrorResult(error),
      metadata
    };

    if (combinedWarnings.size > 0) {
      response.warnings = Array.from(combinedWarnings);
    }

    return response;
  }

  protected decorateCachedResponse(
    cached: ExecutionResponse,
    startTime: number,
    startMemory: number
  ): ExecutionResponse {
    const endTime = Date.now();
    const endMemory = this.getMemoryUsage();
    const metadata: ExecutionMetadata = {
      ...cached.metadata,
      executionTime: endTime - startTime,
      memoryUsage: Math.max(0, endMemory - startMemory),
      cacheHit: true,
      timestamp: endTime
    };

    return {
      ...cached,
      metadata
    };
  }

  protected createResultEnvelope(
    outcome: SkillExecutionOutcome,
    status: SkillResultStatus
  ): StandardSkillResult {
    const format = outcome.format ?? this.inferResultFormat(outcome.output);
    const message = outcome.message;
    if (format === 'text') {
      const textMessage = message ?? (typeof outcome.output === 'string' ? outcome.output : String(outcome.output ?? ''));
      return {
        status,
        format: 'text',
        message: textMessage
      };
    }

    const envelope: StandardSkillResult = {
      status,
      format,
      data: outcome.output
    };

    if (message) {
      envelope.message = message;
    }

    return envelope;
  }

  protected createErrorResult(error: ExecutionError): StandardSkillResult {
    const envelope: StandardSkillResult = {
      status: 'error',
      format: 'object',
      message: error.message
    };

    if (error.details) {
      envelope.data = error.details;
    }

    return envelope;
  }

  protected inferResultFormat(output: unknown): SkillResultFormat {
    if (typeof output === 'string') {
      return 'text';
    }

    if (output === undefined) {
      return 'void';
    }

    if (output === null) {
      return 'object';
    }

    if (typeof output === 'object') {
      const binaryTypes = ['[object Uint8Array]', '[object ArrayBuffer]', '[object Buffer]'];
      const tag = Object.prototype.toString.call(output);
      if (binaryTypes.includes(tag)) {
        return 'binary';
      }
      return 'object';
    }

    if (typeof output === 'number' || typeof output === 'boolean') {
      return 'primitive';
    }

    return 'object';
  }

  protected normalizeError(
    error: unknown,
    request: ExecutionRequest,
    metadata?: SkillMetadata
  ): ExecutionError {
    const wrapped = ErrorWrapper.wrap(error, {
      skillName: request.skillName,
      executorType: this.executionType,
      metadata
    });
    const sanitized = ErrorWrapper.sanitize(wrapped);

    const executionError: ExecutionError = {
      code: sanitized.code,
      message: sanitized.message,
      details: sanitized.context
    };

    if (sanitized.stack) {
      executionError.stack = sanitized.stack;
    }

    return executionError;
  }

  protected getMemoryUsage(): number {
    if (typeof process?.memoryUsage === 'function') {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }

  protected abstract executeSkill(
    request: ExecutionRequest,
    metadata?: SkillMetadata
  ): Promise<SkillExecutionOutcome>;

  protected abstract validateRequest(request: ExecutionRequest): Promise<ValidationResult>;

  protected async validateSkillMetadata(skill: SkillMetadata): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }
}
