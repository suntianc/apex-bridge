import {
  ExecutionResponse,
  ExecutionStats,
  ExecutorStatsSnapshot,
  SkillExecutionType
} from '../../types';

interface Totals {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalExecutionTime: number;
}

interface ExecutorMetrics extends ExecutorStatsSnapshot {
  totalExecutionTime: number;
}

const createEmptyMetrics = (): ExecutorMetrics => ({
  total: 0,
  successful: 0,
  failed: 0,
  totalExecutionTime: 0,
  averageExecutionTime: 0,
  cacheHits: 0,
  cacheMisses: 0,
  tokenUsage: 0
});

export class SkillsMetricsCollector {
  private readonly metrics = new Map<SkillExecutionType, ExecutorMetrics>();
  private readonly totals: Totals = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    totalExecutionTime: 0
  };

  recordExecution(type: SkillExecutionType, response: ExecutionResponse): void {
    const record = this.ensureMetrics(type);
    const executionTime = response.metadata.executionTime ?? 0;

    record.total += 1;
    this.totals.totalExecutions += 1;
    record.totalExecutionTime += executionTime;
    this.totals.totalExecutionTime += executionTime;
    record.averageExecutionTime = record.totalExecutionTime / record.total;
    record.tokenUsage += response.metadata.tokenUsage ?? 0;
    record.lastExecutionAt = Date.now();

    if (response.success) {
      record.successful += 1;
      this.totals.successfulExecutions += 1;
    } else {
      record.failed += 1;
      this.totals.failedExecutions += 1;
    }

    if (response.metadata.cacheHit) {
      record.cacheHits += 1;
    } else {
      record.cacheMisses += 1;
    }
  }

  recordFailure(type: SkillExecutionType, executionTime = 0): void {
    const dummy: ExecutionResponse = {
      success: false,
      metadata: {
        executionTime,
        memoryUsage: 0,
        tokenUsage: 0,
        cacheHit: false,
        executionType: type,
        timestamp: Date.now()
      }
    };
    this.recordExecution(type, dummy);
  }

  getStats(): ExecutionStats {
    const executorStats: Record<SkillExecutionType, ExecutorStatsSnapshot> = {} as Record<SkillExecutionType, ExecutorStatsSnapshot>;

    for (const [type, metrics] of this.metrics.entries()) {
      executorStats[type] = {
        total: metrics.total,
        successful: metrics.successful,
        failed: metrics.failed,
        cacheHits: metrics.cacheHits,
        cacheMisses: metrics.cacheMisses,
        tokenUsage: metrics.tokenUsage,
        averageExecutionTime: metrics.averageExecutionTime,
        lastExecutionAt: metrics.lastExecutionAt,
        totalExecutionTime: metrics.totalExecutionTime
      };
    }

    const averageExecutionTime = this.totals.totalExecutions > 0
      ? this.totals.totalExecutionTime / this.totals.totalExecutions
      : 0;

    return {
      totalExecutions: this.totals.totalExecutions,
      successfulExecutions: this.totals.successfulExecutions,
      failedExecutions: this.totals.failedExecutions,
      averageExecutionTime,
      executorStats
    };
  }

  private ensureMetrics(type: SkillExecutionType): ExecutorMetrics {
    if (!this.metrics.has(type)) {
      this.metrics.set(type, createEmptyMetrics());
    }
    return this.metrics.get(type)!;
  }
}
