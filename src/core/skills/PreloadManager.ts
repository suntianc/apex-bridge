import {
  PreloadConfig,
  PreloadContext,
  PreloadResult,
  PreloadStats,
  UsagePattern
} from '../../types';
import { SkillsLoader } from './SkillsLoader';
import { SkillUsageTracker } from './SkillUsageTracker';
import { DefaultPreloadStrategy } from './PreloadStrategy';
import { SkillsCache } from './SkillsCache';
import logger from '../../utils/logger';

export interface PreloadManagerOptions {
  loader: SkillsLoader;
  usageTracker: SkillUsageTracker;
  strategy?: DefaultPreloadStrategy;
  cache?: SkillsCache;
  config?: Partial<PreloadConfig>;
}

export class PreloadManager {
  private readonly loader: SkillsLoader;
  private readonly usageTracker: SkillUsageTracker;
  private readonly strategy: DefaultPreloadStrategy;
  private readonly cache: SkillsCache;
  private readonly config: PreloadConfig;

  private preloadTimer?: NodeJS.Timeout;
  private isPreloading = false;
  private preloadResults: PreloadResult[] = [];
  private preloadStartTime = 0;
  private totalPreloads = 0;
  private successfulPreloads = 0;
  private failedPreloads = 0;

  constructor(options: PreloadManagerOptions) {
    this.loader = options.loader;
    this.usageTracker = options.usageTracker;
    this.strategy = options.strategy ?? new DefaultPreloadStrategy(options.config);
    this.cache = options.cache ?? this.loader.getCache();
    this.config = this.strategy.getConfig();
  }

  start(): void {
    if (!this.config.enabled) {
      logger.info('[PreloadManager] 预加载已禁用');
      return;
    }

    if (this.preloadTimer) {
      logger.warn('[PreloadManager] 预加载已在运行');
      return;
    }

    logger.info(`[PreloadManager] 启动智能预加载，间隔: ${this.config.interval}ms`);

    // 立即执行一次
    this.executePreload().catch((error) => {
      logger.error(`[PreloadManager] 初始预加载失败: ${(error as Error).message}`);
    });

    // 设置定时器
    this.preloadTimer = setInterval(() => {
      this.executePreload().catch((error) => {
        logger.error(`[PreloadManager] 定时预加载失败: ${(error as Error).message}`);
      });
    }, this.config.interval);
  }

  stop(): void {
    if (this.preloadTimer) {
      clearInterval(this.preloadTimer);
      this.preloadTimer = undefined;
      logger.info('[PreloadManager] 已停止智能预加载');
    }
  }

  async executePreload(): Promise<PreloadResult[]> {
    if (this.isPreloading) {
      logger.debug('[PreloadManager] 预加载正在进行中，跳过本次执行');
      return [];
    }

    this.isPreloading = true;
    this.preloadStartTime = Date.now();
    this.preloadResults = [];

    try {
      const context = await this.buildPreloadContext();
      const records = this.usageTracker.getAllUsageRecords();
      const patterns = this.strategy.analyzeUsagePatterns(records);
      const candidates = this.strategy.getPreloadPriority(patterns);

      logger.debug(
        `[PreloadManager] 分析完成: ${records.length} 条记录, ${patterns.length} 个模式, ${candidates.length} 个候选`
      );

      const preloadPromises = candidates
        .filter((pattern) => this.strategy.shouldPreload(pattern, context))
        .map((pattern) => this.preloadSkill(pattern, context));

      const results = await Promise.allSettled(preloadPromises);
      for (const result of results) {
        if (result.status === 'fulfilled') {
          this.preloadResults.push(result.value);
          if (result.value.success) {
            this.successfulPreloads += 1;
          } else {
            this.failedPreloads += 1;
          }
        } else {
          this.failedPreloads += 1;
          logger.error(`[PreloadManager] 预加载失败: ${result.reason}`);
        }
      }

      this.totalPreloads += this.preloadResults.length;

      const duration = Date.now() - this.preloadStartTime;
      logger.info(
        `[PreloadManager] 预加载完成: ${this.preloadResults.length} 个技能, 成功: ${this.successfulPreloads}, 失败: ${this.failedPreloads}, 耗时: ${duration}ms`
      );

      return this.preloadResults;
    } catch (error) {
      logger.error(`[PreloadManager] 预加载执行失败: ${(error as Error).message}`);
      throw error;
    } finally {
      this.isPreloading = false;
    }
  }

  getStats(): PreloadStats {
    const cacheStats = this.cache.getStats();
    const contentHitRate = cacheStats.content.hits / (cacheStats.content.hits + cacheStats.content.misses) || 0;

    return {
      totalPreloads: this.totalPreloads,
      successfulPreloads: this.successfulPreloads,
      failedPreloads: this.failedPreloads,
      preloadHitRate: contentHitRate,
      averagePreloadTime:
        this.preloadResults.length > 0
          ? (Date.now() - this.preloadStartTime) / this.preloadResults.length
          : 0,
      lastPreloadAt: this.preloadResults.length > 0 ? Date.now() : undefined
    };
  }

  private async buildPreloadContext(): Promise<PreloadContext> {
    const cacheStats = this.cache.getStats();
    const contentTotal = cacheStats.content.hits + cacheStats.content.misses;
    const resourceTotal = cacheStats.resources.hits + cacheStats.resources.misses;

    // 简单的负载估算：基于当前活跃的加载任务
    // 这里可以扩展为更复杂的负载计算
    const currentLoad = 0.1; // 占位值，实际应该从系统监控获取

    // 获取可用内存
    const availableMemory =
      typeof process?.memoryUsage === 'function'
        ? (process.memoryUsage().heapTotal - process.memoryUsage().heapUsed) / 1024 / 1024
        : 1000;

    return {
      currentLoad,
      availableMemory,
      timeSinceLastExecution: 0, // 占位值
      cacheStats: {
        metadataHitRate: cacheStats.metadata.hits / (cacheStats.metadata.hits + cacheStats.metadata.misses) || 0,
        contentHitRate: contentTotal > 0 ? cacheStats.content.hits / contentTotal : 0,
        resourceHitRate: resourceTotal > 0 ? cacheStats.resources.hits / resourceTotal : 0
      }
    };
  }

  private async preloadSkill(
    pattern: UsagePattern,
    context: PreloadContext
  ): Promise<PreloadResult> {
    const startTime = Date.now();
    const result: PreloadResult = {
      skillName: pattern.skillName,
      success: false,
      preloaded: {
        metadata: false,
        content: false,
        resources: false
      },
      timestamp: startTime
    };

    try {
      // 预加载元数据（应该已经在缓存中，但确保存在）
      const metadata = await this.loader.loadSkill(pattern.skillName, {
        includeContent: false,
        includeResources: false
      });

      if (metadata) {
        result.preloaded.metadata = true;
      }

      // 预加载内容（如果置信度足够高）
      if (pattern.confidence >= this.config.confidenceThreshold) {
        const skillWithContent = await this.loader.loadSkill(pattern.skillName, {
          includeContent: true,
          includeResources: false
        });

        if (skillWithContent?.content) {
          result.preloaded.content = true;
        }
      }

      // 预加载资源（如果需要）
      if (pattern.requiresResources) {
        const skillWithResources = await this.loader.loadSkill(pattern.skillName, {
          includeContent: true,
          includeResources: true
        });

        if (skillWithResources?.resources) {
          result.preloaded.resources = true;
        }
      }

      result.success = result.preloaded.metadata || result.preloaded.content || result.preloaded.resources;
    } catch (error) {
      result.error = (error as Error).message;
      logger.warn(`[PreloadManager] 预加载技能失败: ${pattern.skillName}`, error);
    }

    return result;
  }
}

