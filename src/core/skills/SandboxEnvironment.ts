import { NodeVM, NodeVMOptions } from 'vm2';
import {
  SandboxResourceLimits,
  SandboxRunOptions,
  SecurityReport,
  SecurityLevel
} from '../../types';
import {
  SandboxExecutionError,
  ResourceLimitError
} from './CodeGenerationErrors';

export interface SandboxEnvironmentOptions {
  resourceLimits?: Partial<SandboxResourceLimits>;
}

const DEFAULT_LIMITS: SandboxResourceLimits = {
  executionTimeout: 1000,
  memoryLimitMb: 128
};

export class SandboxEnvironment {
  private readonly defaultResourceLimits: SandboxResourceLimits;
  private readonly defaultVm: NodeVM;

  constructor(options: SandboxEnvironmentOptions = {}) {
    this.defaultResourceLimits = {
      ...DEFAULT_LIMITS,
      ...options.resourceLimits
    };

    this.defaultVm = this.createVm(this.defaultResourceLimits);
  }

  async execute(
    javascript: string,
    options: SandboxRunOptions = {}
  ): Promise<{
    result: unknown;
    executionTime: number;
    securityReport: SecurityReport;
  }> {
    const start = Date.now();
    const startMemory = this.getMemoryUsage();
    const effectiveLimits = this.mergeResourceLimits(options.resourceLimitsOverride);
    const vm = this.getVm(effectiveLimits);

    const wrapped = this.wrapCodeForSafeExecution(javascript, options);

    try {
      const scriptExports = vm.run(wrapped, 'skill.js');
      const executionResult =
        typeof scriptExports?.execute === 'function'
          ? scriptExports.execute(options.args ?? {})
          : scriptExports;
      const result = this.isPromise(executionResult) ? await executionResult : executionResult;

      const executionTime = Date.now() - start;
      const memoryUsage = Math.max(0, this.getMemoryUsage() - startMemory);
      const memoryLimitBytes = effectiveLimits.memoryLimitMb * 1024 * 1024;

      if (executionTime > effectiveLimits.executionTimeout) {
        throw new ResourceLimitError(
          `执行超时: ${executionTime}ms > ${effectiveLimits.executionTimeout}ms`,
          'time',
          effectiveLimits.executionTimeout,
          executionTime,
          { timeout: effectiveLimits.executionTimeout, actual: executionTime }
        );
      }

      if (memoryUsage > memoryLimitBytes) {
        throw new ResourceLimitError(
          `内存占用 ${this.formatBytes(memoryUsage)} 超出限制 ${effectiveLimits.memoryLimitMb}MB`,
          'memory',
          memoryLimitBytes,
          memoryUsage,
          { limitMb: effectiveLimits.memoryLimitMb, actualMb: memoryUsage / 1024 / 1024 }
        );
      }

      return {
        result,
        executionTime,
        securityReport: {
          passed: true,
          riskLevel: 'safe',
          issues: [],
          recommendations: ['沙箱执行通过'],
          durationMs: executionTime
        }
      };
    } catch (error: any) {
      const executionTime = Date.now() - start;
      const err = error instanceof Error ? error : new Error(String(error));
      throw new SandboxExecutionError(
        `沙箱执行失败: ${err.message}`,
        err,
        executionTime,
        { executionTime, resourceLimits: effectiveLimits }
      );
    }
  }

  private isPromise(value: unknown): value is Promise<unknown> {
    return Boolean(value) && typeof (value as any).then === 'function';
  }

  private wrapCodeForSafeExecution(
    javascript: string,
    options: SandboxRunOptions
  ): string {
    const context = options.context ?? {};

    const serializedContext = JSON.stringify(context);
    const envVars = JSON.stringify(this.sanitizeEnvironment(options.environment));

    return `
const context = ${serializedContext};
const SAFE_PROCESS = {
  env: ${envVars},
  version: process.version,
  platform: process.platform,
  memoryUsage: process.memoryUsage
};
const SAFE_GLOBAL = {
  console,
  Date,
  Math,
  JSON,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
};

const sandboxExports = {};

(function(exports, context){
  const process = SAFE_PROCESS;
  const global = SAFE_GLOBAL;
  ${javascript}
})(sandboxExports, context);

module.exports = sandboxExports;
`;
  }

  private createVm(limits: SandboxResourceLimits): NodeVM {
    const vmOptions: NodeVMOptions = {
      console: 'inherit',
      sandbox: {},
      timeout: limits.executionTimeout,
      require: {
        external: false,
        builtin: [],
        root: './'
      },
      wrapper: 'commonjs'
    };
    return new NodeVM(vmOptions);
  }

  private getVm(limits: SandboxResourceLimits): NodeVM {
    if (
      limits.executionTimeout === this.defaultResourceLimits.executionTimeout &&
      limits.memoryLimitMb === this.defaultResourceLimits.memoryLimitMb
    ) {
      return this.defaultVm;
    }
    return this.createVm(limits);
  }

  private mergeResourceLimits(
    overrides?: Partial<SandboxResourceLimits>
  ): SandboxResourceLimits {
    return {
      executionTimeout: Math.max(
        1,
        overrides?.executionTimeout ?? this.defaultResourceLimits.executionTimeout
      ),
      memoryLimitMb: Math.max(
        1,
        overrides?.memoryLimitMb ?? this.defaultResourceLimits.memoryLimitMb
      )
    };
  }

  private sanitizeEnvironment(environment?: Record<string, string>): Record<string, string> {
    if (!environment) {
      return {};
    }
    return Object.entries(environment).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value !== undefined && value !== null) {
        acc[key] = String(value);
      }
      return acc;
    }, {});
  }

  private getMemoryUsage(): number {
    if (typeof process?.memoryUsage === 'function') {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }

  private formatBytes(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  }
}

