import {
  ExecutionRequest,
  SkillExecutionOutcome,
  SkillExecutionType,
  SkillMetadata,
  SkillContent,
  GeneratedSkillCode,
  CodeGenerationMetrics,
  ValidationResult,
  SecurityReport,
  SandboxRunOptions,
  SandboxResourceLimits
} from '../../../types';
import { SkillsLoader } from '../SkillsLoader';
import { CodeGenerator } from '../CodeGenerator';
import { SecurityValidator } from '../SecurityValidator';
import { SandboxEnvironment } from '../SandboxEnvironment';
import { CodeGenerationProfiler } from '../CodeGenerationProfiler';
import { CodeCache } from '../CodeCache';
import { BaseSkillsExecutor, BaseSkillsExecutorOptions } from './BaseSkillsExecutor';
import {
  CodeExtractionError,
  SecurityValidationError
} from '../CodeGenerationErrors';
import crypto from 'crypto';

const RISK_ORDER: Record<SecurityReport['riskLevel'], number> = {
  safe: 0,
  low: 1,
  medium: 2,
  high: 3
};

export interface SkillsDirectExecutorOptions extends Omit<BaseSkillsExecutorOptions, 'executionType'> {
  loader: SkillsLoader;
  codeGenerator?: CodeGenerator;
  securityValidator?: SecurityValidator;
  sandbox?: SandboxEnvironment;
  codeCache?: CodeCache;
  executionType?: Extract<SkillExecutionType, 'direct' | 'preprocessor' | 'internal'>;
}

export class SkillsDirectExecutor extends BaseSkillsExecutor {
  private readonly loader: SkillsLoader;
  private readonly codeGenerator: CodeGenerator;
  private readonly securityValidator: SecurityValidator;
  private readonly sandbox: SandboxEnvironment;
  private readonly codeCache: CodeCache;
  private readonly expectedType: Extract<SkillExecutionType, 'direct' | 'preprocessor' | 'internal'>;

  constructor(options: SkillsDirectExecutorOptions) {
    const executionType = options.executionType ?? 'direct';
    super({ ...options, executionType });
    this.loader = options.loader;
    this.codeGenerator = options.codeGenerator ?? new CodeGenerator();
    this.securityValidator = options.securityValidator ?? new SecurityValidator();
    this.sandbox = options.sandbox ?? new SandboxEnvironment();
    this.codeCache = options.codeCache ?? new CodeCache();
    this.expectedType = executionType;
  }

  protected override async validateRequest(request: ExecutionRequest): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!request.skillName) {
      errors.push('技能名称不能为空');
    }

    if (request.parameters !== undefined && typeof request.parameters !== 'object') {
      errors.push('技能参数必须是对象');
    }

    const skill = request.skillName
      ? await this.loader.loadSkill(request.skillName)
      : undefined;

    if (!skill) {
      errors.push(`未找到技能: ${request.skillName}`);
    }

    const metadata = skill?.metadata;

    if (metadata && metadata.type !== this.expectedType) {
      warnings.push(`技能类型为 ${metadata.type}，与执行器期望的 ${this.expectedType} 不符`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata
    };
  }

  protected override async executeSkill(
    request: ExecutionRequest,
    metadata?: SkillMetadata
  ): Promise<SkillExecutionOutcome> {
    if (!metadata) {
      throw new CodeExtractionError(`技能 ${request.skillName} 缺少元数据`, request.skillName);
    }

    const skill = await this.loader.loadSkill(request.skillName, { includeContent: true });

    if (!skill?.content) {
      throw new CodeExtractionError(
        `技能 ${request.skillName} 未包含可执行的 TypeScript 内容`,
        request.skillName
      );
    }

    const contentHash = this.computeContentHash(skill.content);
    const cached = this.codeCache.get(metadata.name, contentHash);

    let generated: GeneratedSkillCode;
    let securityReport: SecurityReport;
    let profilerMetrics: CodeGenerationMetrics | undefined = cached?.profilerMetrics;
    let profiler: CodeGenerationProfiler | undefined;

    if (cached) {
      generated = cached.code;
      securityReport = cached.securityReport;
    } else {
      profiler = new CodeGenerationProfiler();
      profiler.setMetadata({
        skillName: metadata.name,
        executionType: this.expectedType,
        cacheStatus: 'miss'
      });
      // 传递Skill元数据以支持ABP协议
      generated = await this.codeGenerator.generate(skill.content, { 
        profiler,
        skillMetadata: metadata
      });
      securityReport = this.securityValidator.audit(generated);
      if (!securityReport.passed) {
        throw new SecurityValidationError(
          `技能 ${metadata.name} 未通过安全审计`,
          securityReport.riskLevel === 'safe' ? 'low' : securityReport.riskLevel,
          securityReport.issues.map((issue) => issue.message),
          { skillName: metadata.name }
        );
      }
      profiler.record('security', securityReport.durationMs);
    }

    const sandboxStart = Date.now();
    const sandboxOptions = this.buildSandboxRunOptions(request, metadata);
    const sandboxResult = await this.sandbox.execute(generated.javascript, sandboxOptions);
    const sandboxTime = Date.now() - sandboxStart;

    const combinedSecurity = this.mergeSecurityReports(securityReport, sandboxResult.securityReport);

    if (profiler) {
      profiler.record('sandbox', sandboxTime);
      profilerMetrics = profiler.finalize({
        skillName: metadata.name,
        executionType: this.expectedType,
        cacheStatus: 'miss'
      });
      this.codeCache.set(metadata.name, contentHash, generated, securityReport, profilerMetrics);
    }

    return {
      output: sandboxResult.result,
      securityReport: combinedSecurity,
      profilerMetrics,
      tokenUsage: Math.max(0, Math.ceil(generated.javascript.length / 4)),
      warnings: combinedSecurity.recommendations.length > 0 ? combinedSecurity.recommendations : undefined
    };
  }

  protected override shouldUseCache(
    request: ExecutionRequest,
    metadata?: SkillMetadata
  ): boolean {
    return super.shouldUseCache(request, metadata) && metadata?.cacheable === true;
  }

  private computeContentHash(content: SkillContent): string {
    const hash = crypto.createHash('sha256');
    hash.update(content.raw);
    if (content.frontMatter) {
      hash.update(JSON.stringify(content.frontMatter));
    }
    hash.update(String(content.loadedAt));
    return hash.digest('hex');
  }

  private mergeSecurityReports(
    primary: SecurityReport,
    secondary: SecurityReport
  ): SecurityReport {
    const higherRisk =
      RISK_ORDER[primary.riskLevel] >= RISK_ORDER[secondary.riskLevel]
        ? primary.riskLevel
        : secondary.riskLevel;

    return {
      passed: primary.passed && secondary.passed,
      riskLevel: higherRisk,
      issues: [...primary.issues, ...secondary.issues],
      recommendations: Array.from(new Set([...primary.recommendations, ...secondary.recommendations])),
      durationMs: primary.durationMs + secondary.durationMs
    };
  }

  private buildSandboxRunOptions(
    request: ExecutionRequest,
    metadata: SkillMetadata
  ): SandboxRunOptions {
    const sandboxOptions: SandboxRunOptions = {
      args: request.parameters ?? {},
      context: request.context ? { ...request.context } : {}
    };

    const security = metadata.security;
    if (security) {
      const overrides: Partial<SandboxResourceLimits> = {};
      if (typeof security.timeoutMs === 'number' && Number.isFinite(security.timeoutMs)) {
        overrides.executionTimeout = Math.max(1, Math.floor(security.timeoutMs));
      }
      if (typeof security.memoryMb === 'number' && Number.isFinite(security.memoryMb)) {
        overrides.memoryLimitMb = Math.max(1, Math.floor(security.memoryMb));
      }
      if (Object.keys(overrides).length > 0) {
        sandboxOptions.resourceLimitsOverride = overrides;
      }
      if (security.environment) {
        sandboxOptions.environment = { ...security.environment };
      }
    }

    return sandboxOptions;
  }
}
