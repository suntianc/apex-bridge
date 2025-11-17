/**
 * AsyncResult Cleanup Service
 * 
 * 定期清理过期的异步结果文件
 * 支持可配置的清理策略和时间间隔
 * 
 * @module services/AsyncResultCleanupService
 */

import { logger } from '../utils/logger';
import { CleanupStats } from '../types/async-result';

export interface CleanupServiceConfig {
  /** 是否启用清理 */
  enabled: boolean;
  
  /** 最大保留天数 */
  maxAgeDays: number;
  
  /** 清理间隔天数 */
  intervalDays: number;
  
  /** 清理策略：按目录或按文件 */
  strategy: 'directory' | 'file';
  
  /** 搜索范围限制天数 */
  searchDaysLimit?: number;
}

export class AsyncResultCleanupService {
  private config: CleanupServiceConfig;
  private asyncResultProvider: any;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(asyncResultProvider: any, config: CleanupServiceConfig) {
    this.asyncResultProvider = asyncResultProvider;
    this.config = config;

    logger.info('[AsyncCleanup] Cleanup service initialized with config:', {
      enabled: config.enabled,
      maxAgeDays: config.maxAgeDays,
      intervalDays: config.intervalDays,
      strategy: config.strategy
    });
  }

  /**
   * 启动定时清理
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('[AsyncCleanup] Cleanup is disabled, not starting');
      return;
    }

    if (this.isRunning) {
      logger.warn('[AsyncCleanup] Cleanup service is already running');
      return;
    }

    this.isRunning = true;
    
    // 立即执行一次清理
    this.executeCleanup();

    // 设置定时器（转换为毫秒）
    const intervalMs = this.config.intervalDays * 24 * 60 * 60 * 1000;
    this.cleanupTimer = setInterval(() => {
      this.executeCleanup();
    }, intervalMs);

    logger.info(`[AsyncCleanup] Cleanup task scheduled every ${this.config.intervalDays} day(s)`);
  }

  /**
   * 停止定时清理
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.isRunning = false;
    logger.info('[AsyncCleanup] Cleanup service stopped');
  }

  /**
   * 执行清理（内部）
   */
  private async executeCleanup(): Promise<void> {
    try {
      logger.info(`[AsyncCleanup] Starting cleanup (maxAge: ${this.config.maxAgeDays} days, strategy: ${this.config.strategy})`);

      const startTime = Date.now();

      // 调用 AsyncResultProvider 的 cleanupOldResults 方法
      const stats = await this.asyncResultProvider.cleanupOldResults(
        this.config.maxAgeDays,
        this.config.strategy
      );

      const duration = Date.now() - startTime;

      const cleanupStats: CleanupStats = {
        deletedDirs: stats.deletedDirs || 0,
        deletedFiles: stats.deletedFiles || 0,
        timestamp: Date.now()
      };

      if (cleanupStats.deletedDirs === 0 && cleanupStats.deletedFiles === 0) {
        logger.info(`[AsyncCleanup] Cleanup completed in ${duration}ms - No old results found`);
      } else {
        logger.info(`[AsyncCleanup] Cleanup completed in ${duration}ms - Deleted ${cleanupStats.deletedDirs} dirs, ${cleanupStats.deletedFiles} files`);
      }

    } catch (error) {
      logger.error('[AsyncCleanup] Error during cleanup:', error);
    }
  }

  /**
   * 手动触发清理（外部调用）
   */
  async triggerCleanup(): Promise<CleanupStats> {
    logger.info('[AsyncCleanup] Manual cleanup triggered');
    
    const startTime = Date.now();
    const stats = await this.asyncResultProvider.cleanupOldResults(
      this.config.maxAgeDays,
      this.config.strategy
    );

    const duration = Date.now() - startTime;
    logger.info(`[AsyncCleanup] Manual cleanup completed in ${duration}ms`);

    return {
      deletedDirs: stats.deletedDirs || 0,
      deletedFiles: stats.deletedFiles || 0,
      timestamp: Date.now()
    };
  }

  /**
   * 获取当前配置
   */
  getConfig(): CleanupServiceConfig {
    return { ...this.config };
  }

  /**
   * 更新配置（热更新）
   */
  updateConfig(newConfig: Partial<CleanupServiceConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    logger.info('[AsyncCleanup] Config updated:', {
      before: oldConfig,
      after: this.config
    });

    // 如果 enabled 状态或间隔改变，重启服务
    if (oldConfig.enabled !== this.config.enabled || oldConfig.intervalDays !== this.config.intervalDays) {
      this.stop();
      if (this.config.enabled) {
        this.start();
      }
    }
  }
}

