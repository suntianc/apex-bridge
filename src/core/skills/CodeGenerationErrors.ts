import { CompilationDiagnostic } from '../../types';

/**
 * 代码生成相关错误的基类
 */
export abstract class CodeGenerationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * 获取格式化的错误信息
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * 通用代码生成错误（用于包装未知错误）
 */
export class GenericCodeGenerationError extends CodeGenerationError {
  constructor(
    message: string,
    code: string = 'UNKNOWN_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, context);
  }
}

/**
 * TypeScript 编译错误
 */
export class CompilationError extends CodeGenerationError {
  constructor(
    message: string,
    public readonly diagnostics: CompilationDiagnostic[] = [],
    context?: Record<string, unknown>
  ) {
    super(message, 'COMPILATION_ERROR', {
      ...context,
      diagnosticCount: diagnostics.length
    });
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      diagnostics: this.diagnostics
    };
  }
}

/**
 * 代码提取错误
 */
export class CodeExtractionError extends CodeGenerationError {
  constructor(
    message: string,
    public readonly skillName?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'CODE_EXTRACTION_ERROR', {
      ...context,
      skillName
    });
  }
}

/**
 * 依赖解析错误
 */
export class DependencyResolutionError extends CodeGenerationError {
  constructor(
    message: string,
    public readonly dependency: string,
    public readonly reason: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'DEPENDENCY_RESOLUTION_ERROR', {
      ...context,
      dependency,
      reason
    });
  }
}

/**
 * 安全验证错误
 */
export class SecurityValidationError extends CodeGenerationError {
  constructor(
    message: string,
    public readonly riskLevel: 'low' | 'medium' | 'high',
    public readonly issues: string[],
    context?: Record<string, unknown>
  ) {
    super(message, 'SECURITY_VALIDATION_ERROR', {
      ...context,
      riskLevel,
      issueCount: issues.length
    });
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      riskLevel: this.riskLevel,
      issues: this.issues
    };
  }
}

/**
 * 沙箱执行错误
 */
export class SandboxExecutionError extends CodeGenerationError {
  constructor(
    message: string,
    public readonly originalError?: Error,
    public readonly executionTime?: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'SANDBOX_EXECUTION_ERROR', {
      ...context,
      executionTime,
      originalErrorName: originalError?.name
    });
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      executionTime: this.executionTime,
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack
          }
        : undefined
    };
  }
}

/**
 * 资源限制错误
 */
export class ResourceLimitError extends CodeGenerationError {
  constructor(
    message: string,
    public readonly resourceType: 'memory' | 'time' | 'cpu',
    public readonly limit: number,
    public readonly actual: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'RESOURCE_LIMIT_ERROR', {
      ...context,
      resourceType,
      limit,
      actual
    });
  }
}

/**
 * 错误包装器 - 将各种错误统一包装为 CodeGenerationError
 */
export class ErrorWrapper {
  /**
   * 包装任意错误为 CodeGenerationError
   */
  static wrap(error: unknown, context?: Record<string, unknown>): CodeGenerationError {
    if (error instanceof CodeGenerationError) {
      return error;
    }

    if (error instanceof Error) {
      // 尝试从错误消息中推断错误类型
      if (error.message.includes('compilation') || error.message.includes('TypeScript')) {
        return new CompilationError(error.message, [], context);
      }

      if (error.message.includes('security') || error.message.includes('forbidden')) {
        return new SecurityValidationError(
          error.message,
          'high',
          [error.message],
          context
        );
      }

      if (error.message.includes('timeout') || error.message.includes('execution')) {
        return new SandboxExecutionError(error.message, error, undefined, context);
      }

      // 默认包装为通用错误
      return new GenericCodeGenerationError(
        error.message,
        'UNKNOWN_ERROR',
        { ...context, originalError: error.name }
      );
    }

    // 非 Error 对象
    return new GenericCodeGenerationError(
      String(error),
      'UNKNOWN_ERROR',
      context
    );
  }

  /**
   * 清理错误信息，移除敏感数据
   */
  static sanitize(error: CodeGenerationError): CodeGenerationError {
    const sanitizedContext: Record<string, unknown> = {};

    if (error.context) {
      const sensitiveKeywords = ['apikey', 'password', 'token', 'secret'];
      for (const [key, value] of Object.entries(error.context)) {
        // 移除可能包含敏感信息的字段
        const keyLower = key.toLowerCase();
        const isSensitive = sensitiveKeywords.some((sensitive) =>
          keyLower.includes(sensitive)
        );
        if (!isSensitive) {
          sanitizedContext[key] = value;
        }
      }
    }

    // 根据错误类型创建新的实例
    if (error instanceof CompilationError) {
      return new CompilationError(error.message, error.diagnostics, sanitizedContext);
    }
    if (error instanceof CodeExtractionError) {
      return new CodeExtractionError(error.message, error.skillName, sanitizedContext);
    }
    if (error instanceof DependencyResolutionError) {
      return new DependencyResolutionError(
        error.message,
        error.dependency,
        error.reason,
        sanitizedContext
      );
    }
    if (error instanceof SecurityValidationError) {
      return new SecurityValidationError(
        error.message,
        error.riskLevel,
        error.issues,
        sanitizedContext
      );
    }
    if (error instanceof SandboxExecutionError) {
      return new SandboxExecutionError(
        error.message,
        error.originalError,
        error.executionTime,
        sanitizedContext
      );
    }
    if (error instanceof ResourceLimitError) {
      return new ResourceLimitError(
        error.message,
        error.resourceType,
        error.limit,
        error.actual,
        sanitizedContext
      );
    }

    // 默认返回通用错误
    return new GenericCodeGenerationError(error.message, error.code, sanitizedContext);
  }

  /**
   * 格式化错误为用户友好的消息
   */
  static formatUserMessage(error: CodeGenerationError): string {
    const prefix = `[${error.code}]`;

    switch (error.code) {
      case 'COMPILATION_ERROR':
        return `${prefix} TypeScript 编译失败: ${error.message}`;
      case 'CODE_EXTRACTION_ERROR':
        return `${prefix} 代码提取失败: ${error.message}`;
      case 'DEPENDENCY_RESOLUTION_ERROR':
        return `${prefix} 依赖解析失败: ${error.message}`;
      case 'SECURITY_VALIDATION_ERROR':
        return `${prefix} 安全验证失败: ${error.message}`;
      case 'SANDBOX_EXECUTION_ERROR':
        return `${prefix} 沙箱执行失败: ${error.message}`;
      case 'RESOURCE_LIMIT_ERROR':
        return `${prefix} 资源限制超出: ${error.message}`;
      default:
        return `${prefix} ${error.message}`;
    }
  }
}

