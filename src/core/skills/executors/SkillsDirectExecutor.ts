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
import { CodeCache } from '../CodeCache';
import { BaseSkillsExecutor, BaseSkillsExecutorOptions } from './BaseSkillsExecutor';
import {
  CodeExtractionError,
  SecurityValidationError
} from '../CodeGenerationErrors';
import crypto from 'crypto';
import { createContext, runInContext } from 'vm';

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
    let profiler: any | undefined; // CodeGenerationProfiler 已移除，保留接口兼容性

    if (cached) {
      generated = cached.code;
      securityReport = cached.securityReport;
    } else {

      generated = await this.codeGenerator.generate(skill.content, { 
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
    }

    // 🆕 根据 sandboxExecution 配置决定是否使用沙箱执行
    const useSandbox = metadata.sandboxExecution !== false; // 默认 true

    let executionResult: any;
    let executionTime: number;
    let finalSecurityReport: SecurityReport;

    if (useSandbox) {
      // 使用沙箱执行（默认行为）
      const sandboxStart = Date.now();
      const sandboxOptions = this.buildSandboxRunOptions(request, metadata);
      const sandboxResult = await this.sandbox.execute(generated.javascript, sandboxOptions);
      executionTime = Date.now() - sandboxStart;
      executionResult = sandboxResult.result;
      finalSecurityReport = this.mergeSecurityReports(securityReport, sandboxResult.securityReport);
    } else {
      // 直接执行（不使用沙箱）- 仅用于可信代码
      this.logger.warn(`[SkillsDirectExecutor] 技能 ${metadata.name} 配置为不使用沙箱执行，直接执行代码（安全风险）`);
      const directStart = Date.now();
      try {
        // 使用 Node.js vm 模块执行代码（比完全无限制执行稍安全，但仍不如沙箱）
        const context = createContext({
          ...request.parameters,
          ...(request.context || {}),
          console: console,
          setTimeout,
          setInterval,
          clearTimeout,
          clearInterval,
          Buffer,
          Date,
          Math,
          JSON,
          Array,
          Object,
          String,
          Number,
          Boolean,
          RegExp,
          Error,
          TypeError,
          RangeError,
          ReferenceError
        });
        
        // 包装代码为函数调用
        const wrappedCode = `
          (function() {
            ${generated.javascript}
            // 假设代码最后返回结果
            return typeof result !== 'undefined' ? result : null;
          })();
        `;
        
        executionResult = runInContext(wrappedCode, context, {
          timeout: metadata.security?.timeoutMs || 5000,
          displayErrors: true
        });
        executionTime = Date.now() - directStart;
        
        // 直接执行时，安全报告保持不变（因为没有沙箱的额外安全检查）
        finalSecurityReport = securityReport;
        
        // 添加警告
        if (!finalSecurityReport.recommendations) {
          finalSecurityReport.recommendations = [];
        }
        finalSecurityReport.recommendations.push('代码在非沙箱环境中执行，存在安全风险');
      } catch (error: any) {
        executionTime = Date.now() - directStart;
        throw new CodeExtractionError(
          `技能 ${metadata.name} 直接执行失败: ${error.message}`,
          request.skillName
        );
      }
    }

    // CodeGenerationProfiler 已移除，不再记录性能指标
    // if (profiler) {
    //   profiler.record(useSandbox ? 'sandbox' : 'direct', executionTime);
    //   profilerMetrics = profiler.finalize({
    //     skillName: metadata.name,
    //     executionType: this.expectedType,
    //     cacheStatus: 'miss'
    //   });
    //   this.codeCache.set(metadata.name, contentHash, generated, securityReport, profilerMetrics);
    // }
    // 即使没有 profiler，也缓存结果（不包含性能指标）
    if (!cached) {
      this.codeCache.set(metadata.name, contentHash, generated, securityReport, profilerMetrics);
    }

    return {
      output: executionResult,
      securityReport: finalSecurityReport,
      profilerMetrics,
      tokenUsage: Math.max(0, Math.ceil(generated.javascript.length / 4)),
      warnings: finalSecurityReport.recommendations.length > 0 ? finalSecurityReport.recommendations : undefined
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
