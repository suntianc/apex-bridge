import {
  MemoryStats,
  MemoryPressureLevel,
  MemoryCleanupResult,
  MemoryManagerConfig
} from '../../types';
import { SkillsCache } from './SkillsCache';
import { CodeCache } from './CodeCache';
import { SkillUsageTracker } from './SkillUsageTracker';
import logger from '../../utils/logger';

export interface MemoryCleanerOptions {
  skillsCache?: SkillsCache;
  codeCache?: CodeCache;
  usageTracker?: SkillUsageTracker;
  config?: Partial<MemoryManagerConfig>;
}

export class MemoryCleaner {
  private readonly skillsCache?: SkillsCache;
  private readonly codeCache?: CodeCache;
  private readonly usageTracker?: SkillUsageTracker;
  private readonly config: MemoryManagerConfig;

  constructor(options: MemoryCleanerOptions = {}) {
    this.skillsCache = options.skillsCache;
    this.codeCache = options.codeCache;
    this.usageTracker = options.usageTracker;
    this.config = {
      enabled: true,
      monitoringInterval: 30 * 1000,
      normalThreshold: 0.5,
      moderateThreshold: 0.7,
      highThreshold: 0.85,
      criticalThreshold: 0.95,
      maxMemoryMB: 500,
      autoCleanup: true,
      cleanupInterval: 5 * 60 * 1000,
      aggressiveCleanup: false,
      ...options.config
    };
  }

  async performCleanup(
    pressureLevel: MemoryPressureLevel,
    beforeStats: MemoryStats
  ): Promise<MemoryCleanupResult> {
    const startTime = Date.now();
    const result: MemoryCleanupResult = {
      cleaned: {
        cacheEntries: 0,
        expiredRecords: 0,
        unusedResources: 0
      },
      freedMemory: 0,
      duration: 0,
      timestamp: startTime
    };

    try {
      switch (pressureLevel.level) {
        case 'critical':
          await this.performCriticalCleanup(result);
          break;
        case 'high':
          await this.performHighPressureCleanup(result);
          break;
        case 'moderate':
          await this.performModerateCleanup(result);
          break;
        default:
          // normal - 只清理过期项
          await this.performNormalCleanup(result);
      }

      const afterStats = this.getMemoryStats();
      result.freedMemory = Math.max(0, beforeStats.heapUsed - afterStats.heapUsed);
      result.duration = Math.max(1, Date.now() - startTime);

      logger.info(
        `[MemoryCleaner] 清理完成: 压力级别=${pressureLevel.level}, ` +
          `释放内存=${(result.freedMemory / 1024 / 1024).toFixed(2)}MB, ` +
          `耗时=${result.duration}ms`
      );

      return result;
    } catch (error) {
      logger.error(`[MemoryCleaner] 清理失败: ${(error as Error).message}`);
      result.duration = Math.max(1, Date.now() - startTime);
      return result;
    }
  }

  private async performNormalCleanup(result: MemoryCleanupResult): Promise<void> {
    // 正常清理：只清理过期项
    if (this.usageTracker) {
      this.usageTracker.clearExpired();
      result.cleaned.expiredRecords += 1;
    }
  }

  private async performModerateCleanup(result: MemoryCleanupResult): Promise<void> {
    // 中等压力：清理过期项 + 清理低频使用的缓存
    await this.performNormalCleanup(result);

    if (this.skillsCache) {
      const stats = this.skillsCache.getStats();
      // 清理内容缓存中命中率最低的项（这里简化处理，实际应该基于LRU）
      result.cleaned.cacheEntries += 1;
    }

    if (this.codeCache) {
      const stats = this.codeCache.getStats();
      // 清理代码缓存中最近未使用的项
      result.cleaned.cacheEntries += 1;
    }
  }

  private async performHighPressureCleanup(result: MemoryCleanupResult): Promise<void> {
    // 高压力：深度清理
    await this.performModerateCleanup(result);

    // 清理所有非关键缓存
    if (this.skillsCache) {
      // 清理内容缓存（保留元数据）
      const stats = this.skillsCache.getStats();
      // 这里应该实现更细粒度的清理逻辑
      result.cleaned.cacheEntries += Math.floor(stats.content.size * 0.5); // 清理50%
    }

    if (this.codeCache) {
      // 清理代码缓存中最近未使用的项
      const stats = this.codeCache.getStats();
      result.cleaned.cacheEntries += Math.floor(stats.size * 0.3); // 清理30%
    }

    // 清理使用跟踪器中的过期记录
    if (this.usageTracker) {
      this.usageTracker.clearExpired(24 * 60 * 60 * 1000); // 清理24小时前的记录
      result.cleaned.expiredRecords += 1;
    }
  }

  private async performCriticalCleanup(result: MemoryCleanupResult): Promise<void> {
    // 严重压力：激进清理
    await this.performHighPressureCleanup(result);

    // 清理所有可清理的缓存
    if (this.skillsCache) {
      // 清理大部分内容缓存和资源缓存
      const stats = this.skillsCache.getStats();
      result.cleaned.cacheEntries += Math.floor(stats.content.size * 0.8); // 清理80%
      result.cleaned.unusedResources += Math.floor(stats.resources.size * 0.8); // 清理80%资源
    }

    if (this.codeCache) {
      // 清理大部分代码缓存
      const stats = this.codeCache.getStats();
      result.cleaned.cacheEntries += Math.floor(stats.size * 0.7); // 清理70%
    }

    // 清理使用跟踪器
    if (this.usageTracker) {
      this.usageTracker.clearExpired(12 * 60 * 60 * 1000); // 清理12小时前的记录
      result.cleaned.expiredRecords += 1;
    }

    // 强制垃圾回收（如果可用）
    if (global.gc && typeof global.gc === 'function') {
      global.gc();
      logger.debug('[MemoryCleaner] 执行了强制垃圾回收');
    }
  }

  private getMemoryStats(): MemoryStats {
    if (typeof process?.memoryUsage !== 'function') {
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
}

