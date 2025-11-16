import {
  SkillUsageRecord,
  UsagePattern,
  PreloadContext,
  PreloadConfig,
  PreloadStrategy
} from '../../types';

export class DefaultPreloadStrategy implements PreloadStrategy {
  private readonly config: PreloadConfig;

  constructor(config: Partial<PreloadConfig> = {}) {
    this.config = {
      enabled: true,
      interval: 5 * 60 * 1000, // 5分钟
      frequencyThreshold: 0.1, // 10%
      confidenceThreshold: 0.7, // 70%
      maxSkills: 10,
      lowLoadThreshold: 0.3, // 30%
      minMemoryMB: 100,
      ...config
    };
  }

  analyzeUsagePatterns(records: SkillUsageRecord[]): UsagePattern[] {
    if (records.length === 0) {
      return [];
    }

    const totalExecutions = records.reduce((sum, r) => sum + r.executionCount, 0);
    if (totalExecutions === 0) {
      return [];
    }

    const now = Date.now();
    const patterns: UsagePattern[] = [];

    for (const record of records) {
      // 计算使用频率（相对于总执行次数）
      const frequency = totalExecutions > 0 ? record.executionCount / totalExecutions : 0;

      // 计算最近度（时间衰减因子）
      const ageMs = now - record.lastExecutedAt;
      const recency = Math.max(0, 1 - ageMs / (7 * 24 * 60 * 60 * 1000)); // 7天窗口

      // 计算综合优先级分数
      // 权重：频率 40%, 置信度 30%, 最近度 20%, 缓存命中率 10%
      const priority =
        frequency * 0.4 +
        record.averageConfidence * 0.3 +
        recency * 0.2 +
        record.cacheHitRate * 0.1;

      patterns.push({
        skillName: record.skillName,
        frequency,
        confidence: record.averageConfidence,
        recency: record.lastExecutedAt,
        requiresResources: record.requiresResources,
        priority
      });
    }

    return patterns;
  }

  shouldPreload(pattern: UsagePattern, context: PreloadContext): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // 检查频率阈值
    if (pattern.frequency < this.config.frequencyThreshold) {
      return false;
    }

    // 检查置信度阈值
    if (pattern.confidence < this.config.confidenceThreshold) {
      return false;
    }

    // 检查系统负载
    if (context.currentLoad > this.config.lowLoadThreshold) {
      return false;
    }

    // 检查可用内存
    if (context.availableMemory < this.config.minMemoryMB) {
      return false;
    }

    // 如果缓存命中率已经很高，不需要预加载
    if (context.cacheStats.contentHitRate > 0.9) {
      return false;
    }

    return true;
  }

  getPreloadPriority(patterns: UsagePattern[]): UsagePattern[] {
    // 按优先级排序，返回前 N 个
    return patterns
      .filter((p) => p.priority > 0)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, this.config.maxSkills);
  }

  getConfig(): PreloadConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<PreloadConfig>): void {
    Object.assign(this.config, updates);
  }
}

