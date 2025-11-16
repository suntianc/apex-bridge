import {
  MemoryStats,
  MemoryPressureLevel,
  MemoryManagerConfig
} from '../../types';

export class MemoryMonitor {
  private readonly config: MemoryManagerConfig;

  constructor(config: Partial<MemoryManagerConfig> = {}) {
    this.config = {
      enabled: true,
      monitoringInterval: 30 * 1000, // 30秒
      normalThreshold: 0.5, // 50%
      moderateThreshold: 0.7, // 70%
      highThreshold: 0.85, // 85%
      criticalThreshold: 0.95, // 95%
      maxMemoryMB: 500,
      autoCleanup: true,
      cleanupInterval: 5 * 60 * 1000, // 5分钟
      aggressiveCleanup: false,
      ...config
    };
  }

  getMemoryStats(): MemoryStats {
    if (typeof process?.memoryUsage !== 'function') {
      return this.createEmptyStats();
    }

    const usage = process.memoryUsage();
    const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;
    const memoryUsagePercent = usage.heapUsed / maxMemoryBytes;
    const availableMemory = (maxMemoryBytes - usage.heapUsed) / 1024 / 1024;

    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      availableMemory: Math.max(0, availableMemory),
      memoryUsagePercent: Math.min(1, Math.max(0, memoryUsagePercent)),
      timestamp: Date.now()
    };
  }

  assessPressureLevel(stats: MemoryStats): MemoryPressureLevel {
    const usage = stats.memoryUsagePercent;

    if (usage >= this.config.criticalThreshold) {
      return {
        level: 'critical',
        threshold: this.config.criticalThreshold,
        action: '立即执行激进清理，释放所有非关键缓存'
      };
    }

    if (usage >= this.config.highThreshold) {
      return {
        level: 'high',
        threshold: this.config.highThreshold,
        action: '执行深度清理，清理过期和低频使用的缓存'
      };
    }

    if (usage >= this.config.moderateThreshold) {
      return {
        level: 'moderate',
        threshold: this.config.moderateThreshold,
        action: '执行常规清理，清理过期缓存'
      };
    }

    return {
      level: 'normal',
      threshold: this.config.normalThreshold,
      action: '内存使用正常，无需清理'
    };
  }

  shouldTriggerCleanup(stats: MemoryStats): boolean {
    if (!this.config.autoCleanup) {
      return false;
    }

    const pressure = this.assessPressureLevel(stats);
    return pressure.level !== 'normal';
  }

  getConfig(): MemoryManagerConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<MemoryManagerConfig>): void {
    Object.assign(this.config, updates);
  }

  private createEmptyStats(): MemoryStats {
    return {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
      availableMemory: 0,
      memoryUsagePercent: 0,
      timestamp: Date.now()
    };
  }
}

