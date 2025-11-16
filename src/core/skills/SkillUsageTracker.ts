import {
  SkillUsageRecord,
  SkillExecutionType,
  ExecutionResponse
} from '../../types';
import logger from '../../utils/logger';

interface InternalUsageRecord {
  skillName: string;
  executionCount: number;
  lastExecutedAt: number;
  firstExecutedAt: number;
  confidenceSum: number;
  confidenceCount: number;
  totalExecutionTime: number;
  cacheHits: number;
  cacheMisses: number;
  requiresResources: boolean;
  executionType: SkillExecutionType;
}

export class SkillUsageTracker {
  private readonly records = new Map<string, InternalUsageRecord>();
  private readonly windowMs: number; // 时间窗口（用于计算频率）

  constructor(windowMs: number = 24 * 60 * 60 * 1000) {
    // 默认24小时窗口
    this.windowMs = windowMs;
  }

  recordExecution(
    skillName: string,
    response: ExecutionResponse,
    confidence?: number,
    requiresResources?: boolean
  ): void {
    const now = Date.now();
    const record = this.records.get(skillName) ?? this.createEmptyRecord(skillName);

    record.executionCount += 1;
    record.lastExecutedAt = now;
    if (record.firstExecutedAt === 0) {
      record.firstExecutedAt = now;
    }

    if (confidence !== undefined) {
      record.confidenceSum += confidence;
      record.confidenceCount += 1;
    }

    record.totalExecutionTime += response.metadata.executionTime ?? 0;

    if (response.metadata.cacheHit) {
      record.cacheHits += 1;
    } else {
      record.cacheMisses += 1;
    }

    if (requiresResources !== undefined) {
      record.requiresResources = requiresResources;
    }

    record.executionType = response.metadata.executionType;

    this.records.set(skillName, record);
  }

  getUsageRecord(skillName: string): SkillUsageRecord | undefined {
    const record = this.records.get(skillName);
    if (!record) {
      return undefined;
    }

    return this.toSkillUsageRecord(record);
  }

  getAllUsageRecords(): SkillUsageRecord[] {
    const now = Date.now();
    const records: SkillUsageRecord[] = [];

    for (const record of this.records.values()) {
      // 只返回在时间窗口内的记录
      if (now - record.lastExecutedAt <= this.windowMs) {
        records.push(this.toSkillUsageRecord(record));
      }
    }

    return records;
  }

  getTopSkills(limit: number = 10): SkillUsageRecord[] {
    const records = this.getAllUsageRecords();
    return records
      .sort((a, b) => {
        // 按执行次数和最近使用时间排序
        const scoreA = a.executionCount * (1 + a.lastExecutedAt / 1_000_000_000);
        const scoreB = b.executionCount * (1 + b.lastExecutedAt / 1_000_000_000);
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  clear(): void {
    this.records.clear();
  }

  clearExpired(windowMs?: number): void {
    const window = windowMs ?? this.windowMs;
    const now = Date.now();
    const expired: string[] = [];

    for (const [skillName, record] of this.records.entries()) {
      if (now - record.lastExecutedAt > window) {
        expired.push(skillName);
      }
    }

    for (const skillName of expired) {
      this.records.delete(skillName);
    }

    if (expired.length > 0) {
      logger.debug(`[SkillUsageTracker] 清理了 ${expired.length} 个过期记录`);
    }
  }

  getStats(): {
    totalSkills: number;
    totalExecutions: number;
    averageExecutionsPerSkill: number;
  } {
    const records = this.getAllUsageRecords();
    const totalExecutions = records.reduce((sum, r) => sum + r.executionCount, 0);

    return {
      totalSkills: records.length,
      totalExecutions,
      averageExecutionsPerSkill: records.length > 0 ? totalExecutions / records.length : 0
    };
  }

  private createEmptyRecord(skillName: string): InternalUsageRecord {
    return {
      skillName,
      executionCount: 0,
      lastExecutedAt: 0,
      firstExecutedAt: 0,
      confidenceSum: 0,
      confidenceCount: 0,
      totalExecutionTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      requiresResources: false,
      executionType: 'direct'
    };
  }

  private toSkillUsageRecord(record: InternalUsageRecord): SkillUsageRecord {
    const averageConfidence =
      record.confidenceCount > 0 ? record.confidenceSum / record.confidenceCount : 0;
    const averageExecutionTime =
      record.executionCount > 0 ? record.totalExecutionTime / record.executionCount : 0;
    const totalCacheRequests = record.cacheHits + record.cacheMisses;
    const cacheHitRate = totalCacheRequests > 0 ? record.cacheHits / totalCacheRequests : 0;

    return {
      skillName: record.skillName,
      executionCount: record.executionCount,
      lastExecutedAt: record.lastExecutedAt,
      firstExecutedAt: record.firstExecutedAt,
      averageConfidence,
      totalExecutionTime: record.totalExecutionTime,
      averageExecutionTime,
      cacheHitRate,
      requiresResources: record.requiresResources,
      executionType: record.executionType
    };
  }
}

