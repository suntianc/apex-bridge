import logger from '../../utils/logger';
import {
  CodeExtractionError,
  SecurityValidationError,
  CodeGenerationError,
  SandboxExecutionError
} from './CodeGenerationErrors';

/**
 * 错误级别
 */
export type ErrorLevel = 'info' | 'warning' | 'error' | 'critical';

/**
 * 错误分类
 */
export type ErrorCategory =
  | 'execution'
  | 'validation'
  | 'security'
  | 'loading'
  | 'cache'
  | 'memory'
  | 'network'
  | 'unknown';

/**
 * 错误上下文
 */
export interface ErrorContext {
  skillName?: string;
  executionType?: string;
  requestId?: string;
  userId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * 错误记录
 */
export interface ErrorRecord {
  id: string;
  level: ErrorLevel;
  category: ErrorCategory;
  message: string;
  error: Error;
  context: ErrorContext;
  stack?: string;
  resolved: boolean;
  resolvedAt?: number;
  count: number;
  firstOccurred: number;
  lastOccurred: number;
}

/**
 * 错误处理配置
 */
export interface ErrorHandlerConfig {
  // 是否启用错误记录
  enableLogging: boolean;
  // 是否启用错误聚合
  enableAggregation: boolean;
  // 错误记录保留时间（ms）
  retentionPeriod: number;
  // 最大错误记录数
  maxRecords: number;
  // 错误聚合窗口（ms）
  aggregationWindow: number;
  // 自动解决时间（ms，超过此时间自动标记为已解决）
  autoResolveTime: number;
}

/**
 * 错误处理器
 * 
 * 统一处理、记录和聚合系统错误
 */
export class ErrorHandler {
  private readonly config: Required<ErrorHandlerConfig>;
  private readonly errorRecords: Map<string, ErrorRecord> = new Map();
  private readonly errorCounts: Map<string, number> = new Map();
  private readonly aggregationWindow: Map<string, number[]> = new Map();

  constructor(config?: Partial<ErrorHandlerConfig>) {
    this.config = {
      enableLogging: true,
      enableAggregation: true,
      retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7天
      maxRecords: 1000,
      aggregationWindow: 60 * 1000, // 1分钟
      autoResolveTime: 24 * 60 * 60 * 1000, // 24小时
      ...config
    };

    // 定期清理过期记录
    setInterval(() => this.cleanupExpiredRecords(), 60 * 60 * 1000); // 每小时清理一次
  }

  /**
   * 处理错误
   */
  handleError(
    error: Error,
    level: ErrorLevel = 'error',
    context?: Partial<ErrorContext>
  ): ErrorRecord {
    const category = this.categorizeError(error);
    const errorId = this.generateErrorId(error, context);
    const now = Date.now();

    // 获取或创建错误记录
    let record = this.errorRecords.get(errorId);

    if (record) {
      // 更新现有记录
      record.count += 1;
      record.lastOccurred = now;
      record.resolved = false;
      record.resolvedAt = undefined;
    } else {
      // 创建新记录
      record = {
        id: errorId,
        level,
        category,
        message: error.message,
        error,
        context: {
          timestamp: now,
          ...context
        },
        stack: error.stack,
        resolved: false,
        count: 1,
        firstOccurred: now,
        lastOccurred: now
      };

      // 如果超过最大记录数，删除最旧的记录
      if (this.errorRecords.size >= this.config.maxRecords) {
        this.removeOldestRecord();
      }

      this.errorRecords.set(errorId, record);
    }

    // 记录错误
    if (this.config.enableLogging) {
      this.logError(record);
    }

    // 聚合错误
    if (this.config.enableAggregation) {
      this.aggregateError(errorId, now);
    }

    return record;
  }

  /**
   * 处理技能执行错误
   */
  handleSkillExecutionError(
    error: Error,
    skillName: string,
    executionType: string,
    requestId?: string
  ): ErrorRecord {
    return this.handleError(error, 'error', {
      skillName,
      executionType,
      requestId,
      metadata: {
        errorType: error.constructor.name
      }
    });
  }

  /**
   * 处理代码生成错误
   */
  handleCodeGenerationError(
    error: CodeExtractionError | SecurityValidationError | CodeGenerationError,
    skillName: string
  ): ErrorRecord {
    const level: ErrorLevel = error instanceof SecurityValidationError ? 'critical' : 'error';
    return this.handleError(error, level, {
      skillName,
      executionType: 'code-generation',
      metadata: {
        errorType: error.constructor.name,
        riskLevel: (error as any).riskLevel
      }
    });
  }

  /**
   * 处理沙箱执行错误
   */
  handleSandboxError(
    error: SandboxExecutionError,
    skillName: string,
    requestId?: string
  ): ErrorRecord {
    return this.handleError(error, 'error', {
      skillName,
      executionType: 'sandbox',
      requestId,
      metadata: {
        errorType: 'SandboxExecutionError',
        timeout: (error as any).timeout
      }
    });
  }

  /**
   * 处理加载错误
   */
  handleLoadingError(
    error: Error,
    skillName: string,
    resourceType: 'metadata' | 'content' | 'resource'
  ): ErrorRecord {
    return this.handleError(error, 'warning', {
      skillName,
      executionType: 'loading',
      metadata: {
        resourceType
      }
    });
  }

  /**
   * 标记错误为已解决
   */
  resolveError(errorId: string): void {
    const record = this.errorRecords.get(errorId);
    if (record && !record.resolved) {
      record.resolved = true;
      record.resolvedAt = Date.now();
      logger.info(`[ErrorHandler] 错误已解决: ${errorId} - ${record.message}`);
    }
  }

  /**
   * 获取错误记录
   */
  getErrorRecord(errorId: string): ErrorRecord | undefined {
    return this.errorRecords.get(errorId);
  }

  /**
   * 获取所有错误记录
   */
  getAllErrors(includeResolved: boolean = false): ErrorRecord[] {
    const records = Array.from(this.errorRecords.values());
    return includeResolved
      ? records
      : records.filter(r => !r.resolved);
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): {
    total: number;
    byLevel: Record<ErrorLevel, number>;
    byCategory: Record<ErrorCategory, number>;
    unresolved: number;
    topErrors: Array<{ id: string; message: string; count: number }>;
  } {
    const records = Array.from(this.errorRecords.values());
    const byLevel: Record<ErrorLevel, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0
    };
    const byCategory: Record<ErrorCategory, number> = {
      execution: 0,
      validation: 0,
      security: 0,
      loading: 0,
      cache: 0,
      memory: 0,
      network: 0,
      unknown: 0
    };

    for (const record of records) {
      byLevel[record.level] = (byLevel[record.level] || 0) + record.count;
      byCategory[record.category] = (byCategory[record.category] || 0) + record.count;
    }

    const unresolved = records.filter(r => !r.resolved).length;
    const topErrors = records
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(r => ({
        id: r.id,
        message: r.message,
        count: r.count
      }));

    return {
      total: records.length,
      byLevel,
      byCategory,
      unresolved,
      topErrors
    };
  }

  /**
   * 分类错误
   */
  private categorizeError(error: Error): ErrorCategory {
    const errorName = error.constructor.name.toLowerCase();

    if (errorName.includes('security') || errorName.includes('validation')) {
      return 'security';
    }
    if (errorName.includes('extraction') || errorName.includes('generation')) {
      return 'validation';
    }
    if (errorName.includes('sandbox') || errorName.includes('execution')) {
      return 'execution';
    }
    if (errorName.includes('load') || errorName.includes('cache')) {
      return 'loading';
    }
    if (errorName.includes('memory') || errorName.includes('oom')) {
      return 'memory';
    }
    if (errorName.includes('network') || errorName.includes('timeout') || errorName.includes('connection')) {
      return 'network';
    }

    return 'unknown';
  }

  /**
   * 生成错误ID
   */
  private generateErrorId(error: Error, context?: Partial<ErrorContext>): string {
    const parts = [
      error.constructor.name,
      error.message.substring(0, 50),
      context?.skillName || 'unknown'
    ];
    return parts.join('|');
  }

  /**
   * 记录错误
   */
  private logError(record: ErrorRecord): void {
    const logData = {
      errorId: record.id,
      level: record.level,
      category: record.category,
      message: record.message,
      skillName: record.context.skillName,
      count: record.count,
      context: record.context
    };

    switch (record.level) {
      case 'critical':
        logger.error(`[ErrorHandler] 严重错误: ${record.message}`, logData);
        break;
      case 'error':
        logger.error(`[ErrorHandler] 错误: ${record.message}`, logData);
        break;
      case 'warning':
        logger.warn(`[ErrorHandler] 警告: ${record.message}`, logData);
        break;
      case 'info':
        logger.info(`[ErrorHandler] 信息: ${record.message}`, logData);
        break;
    }
  }

  /**
   * 聚合错误
   */
  private aggregateError(errorId: string, timestamp: number): void {
    const window = this.aggregationWindow.get(errorId) || [];
    window.push(timestamp);

    // 移除窗口外的记录
    const cutoff = timestamp - this.config.aggregationWindow;
    const filtered = window.filter(t => t > cutoff);
    this.aggregationWindow.set(errorId, filtered);

    // 如果错误频率过高，提升级别
    if (filtered.length > 10) {
      const record = this.errorRecords.get(errorId);
      if (record && record.level !== 'critical') {
        logger.warn(`[ErrorHandler] 错误 ${errorId} 频率过高，考虑提升级别`);
      }
    }
  }

  /**
   * 清理过期记录
   */
  private cleanupExpiredRecords(): void {
    const now = Date.now();
    const cutoff = now - this.config.retentionPeriod;

    for (const [id, record] of this.errorRecords.entries()) {
      // 删除过期记录
      if (record.lastOccurred < cutoff) {
        this.errorRecords.delete(id);
        this.aggregationWindow.delete(id);
        continue;
      }

      // 自动解决长时间未发生的错误
      if (!record.resolved && record.lastOccurred < now - this.config.autoResolveTime) {
        record.resolved = true;
        record.resolvedAt = now;
      }
    }

    logger.debug(`[ErrorHandler] 清理完成，剩余记录: ${this.errorRecords.size}`);
  }

  /**
   * 删除最旧的记录
   */
  private removeOldestRecord(): void {
    let oldestId: string | undefined;
    let oldestTime = Date.now();

    for (const [id, record] of this.errorRecords.entries()) {
      if (record.firstOccurred < oldestTime) {
        oldestTime = record.firstOccurred;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.errorRecords.delete(oldestId);
      this.aggregationWindow.delete(oldestId);
    }
  }
}

