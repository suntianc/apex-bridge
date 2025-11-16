import {
  MemoryStats,
  MemoryPressureLevel,
  MemoryCleanupResult,
  MemoryManagerConfig,
  MemoryManagerStats
} from '../../types';
import { MemoryMonitor } from './MemoryMonitor';
import { MemoryCleaner } from './MemoryCleaner';
import { SkillsCache } from './SkillsCache';
import { CodeCache } from './CodeCache';
import { SkillUsageTracker } from './SkillUsageTracker';
import logger from '../../utils/logger';

export interface MemoryManagerOptions {
  skillsCache?: SkillsCache;
  codeCache?: CodeCache;
  usageTracker?: SkillUsageTracker;
  config?: Partial<MemoryManagerConfig>;
}

export class MemoryManager {
  private readonly monitor: MemoryMonitor;
  private cleaner: MemoryCleaner;
  private config: MemoryManagerConfig;

  private monitoringTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private isMonitoring = false;
  private isCleaning = false;

  private cleanupHistory: MemoryCleanupResult[] = [];
  private totalCleanups = 0;
  private totalFreedMemory = 0;
  private totalCleanupTime = 0;
  private lastCleanupAt?: number;

  constructor(options: MemoryManagerOptions = {}) {
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

    this.monitor = new MemoryMonitor(this.config);
    this.cleaner = new MemoryCleaner({
      skillsCache: options.skillsCache,
      codeCache: options.codeCache,
      usageTracker: options.usageTracker,
      config: this.config
    });
  }

  start(): void {
    if (!this.config.enabled) {
      logger.info('[MemoryManager] 内存管理已禁用');
      return;
    }

    if (this.isMonitoring) {
      logger.warn('[MemoryManager] 内存监控已在运行');
      return;
    }

    logger.info(
      `[MemoryManager] 启动内存管理: 监控间隔=${this.config.monitoringInterval}ms, ` +
        `清理间隔=${this.config.cleanupInterval}ms, 最大内存=${this.config.maxMemoryMB}MB`
    );

    this.isMonitoring = true;

    // 启动监控
    this.monitoringTimer = setInterval(() => {
      this.checkMemoryAndCleanup().catch((error) => {
        logger.error(`[MemoryManager] 内存检查失败: ${(error as Error).message}`);
      });
    }, this.config.monitoringInterval);

    // 启动定期清理
    if (this.config.autoCleanup) {
      this.cleanupTimer = setInterval(() => {
        this.performScheduledCleanup().catch((error) => {
          logger.error(`[MemoryManager] 定期清理失败: ${(error as Error).message}`);
        });
      }, this.config.cleanupInterval);
    }

    // 立即执行一次检查
    this.checkMemoryAndCleanup().catch((error) => {
      logger.error(`[MemoryManager] 初始内存检查失败: ${(error as Error).message}`);
    });
  }

  stop(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    this.isMonitoring = false;
    logger.info('[MemoryManager] 已停止内存管理');
  }

  async checkMemoryAndCleanup(): Promise<void> {
    if (this.isCleaning) {
      return; // 避免并发清理
    }

    const stats = this.monitor.getMemoryStats();
    const pressureLevel = this.monitor.assessPressureLevel(stats);

    if (pressureLevel.level === 'normal') {
      return; // 内存正常，无需清理
    }

    logger.warn(
      `[MemoryManager] 检测到内存压力: 级别=${pressureLevel.level}, ` +
        `使用率=${(stats.memoryUsagePercent * 100).toFixed(2)}%, ` +
        `已用=${(stats.heapUsed / 1024 / 1024).toFixed(2)}MB, ` +
        `可用=${stats.availableMemory.toFixed(2)}MB`
    );

    if (this.monitor.shouldTriggerCleanup(stats)) {
      await this.performCleanup(pressureLevel, stats);
    }
  }

  async performScheduledCleanup(): Promise<void> {
    if (this.isCleaning) {
      return;
    }

    const stats = this.monitor.getMemoryStats();
    const pressureLevel = this.monitor.assessPressureLevel(stats);

    // 定期清理：即使内存正常也执行轻度清理
    await this.performCleanup(pressureLevel, stats);
  }

  async performCleanup(
    pressureLevel: MemoryPressureLevel,
    beforeStats: MemoryStats
  ): Promise<MemoryCleanupResult> {
    if (this.isCleaning) {
      logger.debug('[MemoryManager] 清理正在进行中，跳过本次请求');
      return {
        cleaned: { cacheEntries: 0, expiredRecords: 0, unusedResources: 0 },
        freedMemory: 0,
        duration: 0,
        timestamp: Date.now()
      };
    }

    this.isCleaning = true;

    try {
      const result = await this.cleaner.performCleanup(pressureLevel, beforeStats);

      // 更新统计
      this.totalCleanups += 1;
      this.totalFreedMemory += result.freedMemory;
      this.totalCleanupTime += result.duration;
      this.lastCleanupAt = result.timestamp;

      // 保存清理历史（保留最近20条）
      this.cleanupHistory.push(result);
      if (this.cleanupHistory.length > 20) {
        this.cleanupHistory.shift();
      }

      return result;
    } finally {
      this.isCleaning = false;
    }
  }

  getStats(): MemoryManagerStats {
    const currentStats = this.monitor.getMemoryStats();
    const pressureLevel = this.monitor.assessPressureLevel(currentStats);

    return {
      currentStats,
      pressureLevel,
      totalCleanups: this.totalCleanups,
      totalFreedMemory: this.totalFreedMemory,
      averageCleanupTime: this.totalCleanups > 0 ? this.totalCleanupTime / this.totalCleanups : 0,
      lastCleanupAt: this.lastCleanupAt,
      cleanupHistory: [...this.cleanupHistory]
    };
  }

  getCurrentMemoryStats(): MemoryStats {
    return this.monitor.getMemoryStats();
  }

  getCurrentPressureLevel(): MemoryPressureLevel {
    const stats = this.monitor.getMemoryStats();
    return this.monitor.assessPressureLevel(stats);
  }

  updateConfig(updates: Partial<MemoryManagerConfig>): void {
    const oldConfig = { ...this.config };
    Object.assign(this.config, updates);
    this.monitor.updateConfig(updates);
    
    // 重新创建 cleaner 以应用新配置
    const cleanerOptions: any = {};
    if (this.cleaner) {
      cleanerOptions.skillsCache = (this.cleaner as any).skillsCache;
      cleanerOptions.codeCache = (this.cleaner as any).codeCache;
      cleanerOptions.usageTracker = (this.cleaner as any).usageTracker;
    }
    cleanerOptions.config = this.config;
    this.cleaner = new MemoryCleaner(cleanerOptions);
  }

  getConfig(): MemoryManagerConfig {
    return { ...this.config };
  }
}

