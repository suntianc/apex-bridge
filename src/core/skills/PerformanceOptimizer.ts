import {
  SkillsExecutionManager,
  SkillsLoader,
  SkillsCache,
  SkillsIndex,
  MemoryManager,
  PreloadManager,
  SkillsPerformanceConfig,
  DEFAULT_PERFORMANCE_CONFIG,
  PRODUCTION_PERFORMANCE_CONFIG,
  HIGH_PERFORMANCE_CONFIG,
  LOW_RESOURCE_CONFIG
} from './index';
import logger from '../../utils/logger';
import type { ExecutionStats, MemoryStats } from '../../types';

/**
 * 性能分析结果
 */
export interface PerformanceAnalysis {
  timestamp: number;
  bottlenecks: PerformanceBottleneck[];
  recommendations: OptimizationRecommendation[];
  currentConfig: SkillsPerformanceConfig;
  suggestedConfig: Partial<SkillsPerformanceConfig>;
  estimatedImprovement: {
    executionTime: number; // 预计改善百分比
    memoryUsage: number;
    cacheHitRate: number;
  };
}

/**
 * 性能瓶颈
 */
export interface PerformanceBottleneck {
  type: 'execution' | 'memory' | 'cache' | 'loading' | 'indexing';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  currentValue: number;
  threshold: number;
  impact: string;
}

/**
 * 优化建议
 */
export interface OptimizationRecommendation {
  priority: 'low' | 'medium' | 'high';
  category: string;
  description: string;
  action: string;
  expectedImpact: string;
}

/**
 * 性能优化器
 * 
 * 基于实际运行数据分析和优化系统性能
 */
export class PerformanceOptimizer {
  private readonly executionManager: SkillsExecutionManager;
  private readonly skillsLoader: SkillsLoader;
  private readonly memoryManager: MemoryManager;
  private readonly preloadManager?: PreloadManager;
  private currentConfig: SkillsPerformanceConfig;

  constructor(
    executionManager: SkillsExecutionManager,
    skillsLoader: SkillsLoader,
    memoryManager: MemoryManager,
    preloadManager?: PreloadManager,
    initialConfig?: SkillsPerformanceConfig
  ) {
    this.executionManager = executionManager;
    this.skillsLoader = skillsLoader;
    this.memoryManager = memoryManager;
    this.preloadManager = preloadManager;
    this.currentConfig = initialConfig ?? DEFAULT_PERFORMANCE_CONFIG;
  }

  /**
   * 分析性能瓶颈
   */
  analyzePerformance(): PerformanceAnalysis {
    const executionStats = this.executionManager.getExecutionStats();
    const memoryStats = this.memoryManager.getStats();
    const cache = this.skillsLoader.getCache();
    const cacheStats = cache ? cache.getStats() : {
      metadata: { hits: 0, misses: 0, size: 0, capacity: 0 },
      content: { hits: 0, misses: 0, size: 0, capacity: 0 },
      resources: { hits: 0, misses: 0, size: 0, capacity: 0 }
    };

    const bottlenecks: PerformanceBottleneck[] = [];
    const recommendations: OptimizationRecommendation[] = [];

    // 分析执行性能
    this.analyzeExecutionPerformance(executionStats, bottlenecks, recommendations);

    // 分析内存性能
    this.analyzeMemoryPerformance(memoryStats, bottlenecks, recommendations);

    // 分析缓存性能
    this.analyzeCachePerformance(cacheStats, bottlenecks, recommendations);

    // 生成优化建议
    const suggestedConfig = this.generateOptimizationConfig(bottlenecks, recommendations);

    // 估算改善效果
    const estimatedImprovement = this.estimateImprovement(bottlenecks, suggestedConfig);

    return {
      timestamp: Date.now(),
      bottlenecks,
      recommendations,
      currentConfig: this.currentConfig,
      suggestedConfig,
      estimatedImprovement
    };
  }

  /**
   * 应用优化配置
   */
  applyOptimization(config: Partial<SkillsPerformanceConfig>): void {
    logger.info('[PerformanceOptimizer] 应用性能优化配置');

    // 更新缓存配置
    if (config.cache) {
      const cache = this.skillsLoader.getCache();
      if (cache && typeof (cache as any).updateConfig === 'function') {
        (cache as any).updateConfig(config.cache);
      }
    }

    // 更新内存管理配置
    if (config.memory) {
      this.memoryManager.updateConfig(config.memory);
    }

    // 更新预加载配置
    if (config.preload && this.preloadManager) {
      if (typeof (this.preloadManager as any).updateConfig === 'function') {
        (this.preloadManager as any).updateConfig(config.preload);
      }
    }

    // 合并配置
    this.currentConfig = {
      ...this.currentConfig,
      ...config
    };

    logger.info('[PerformanceOptimizer] ✅ 优化配置已应用');
  }

  /**
   * 自动优化
   */
  autoOptimize(): PerformanceAnalysis {
    logger.info('[PerformanceOptimizer] 开始自动性能优化');

    const analysis = this.analyzePerformance();

    // 如果有高优先级建议，自动应用
    const highPriorityRecommendations = analysis.recommendations.filter(
      r => r.priority === 'high'
    );

    if (highPriorityRecommendations.length > 0) {
      logger.info(`[PerformanceOptimizer] 发现 ${highPriorityRecommendations.length} 个高优先级优化建议，自动应用`);
      this.applyOptimization(analysis.suggestedConfig);
    } else {
      logger.info('[PerformanceOptimizer] 未发现高优先级优化建议');
    }

    return analysis;
  }

  /**
   * 分析执行性能
   */
  private analyzeExecutionPerformance(
    stats: ExecutionStats,
    bottlenecks: PerformanceBottleneck[],
    recommendations: OptimizationRecommendation[]
  ): void {
    // 检查错误率
    const errorRate = stats.totalExecutions > 0
      ? stats.failedExecutions / stats.totalExecutions
      : 0;

    if (errorRate > 0.1) {
      bottlenecks.push({
        type: 'execution',
        severity: errorRate > 0.2 ? 'critical' : 'high',
        description: `执行错误率过高: ${(errorRate * 100).toFixed(2)}%`,
        currentValue: errorRate,
        threshold: 0.1,
        impact: '影响系统可靠性'
      });

      recommendations.push({
        priority: 'high',
        category: '执行稳定性',
        description: '执行错误率过高，需要检查技能代码质量',
        action: '检查失败技能的代码，修复错误',
        expectedImpact: '降低错误率，提高系统稳定性'
      });
    }

    // 检查执行时间
    if (stats.averageExecutionTime > 200) {
      bottlenecks.push({
        type: 'execution',
        severity: stats.averageExecutionTime > 500 ? 'high' : 'medium',
        description: `平均执行时间较长: ${stats.averageExecutionTime.toFixed(2)}ms`,
        currentValue: stats.averageExecutionTime,
        threshold: 200,
        impact: '影响响应速度'
      });

      recommendations.push({
        priority: stats.averageExecutionTime > 500 ? 'high' : 'medium',
        category: '执行性能',
        description: '执行时间较长，建议优化代码或增加缓存',
        action: '增加代码缓存大小，优化慢速技能',
        expectedImpact: `预计减少执行时间 ${Math.min(30, (stats.averageExecutionTime - 200) / stats.averageExecutionTime * 100).toFixed(1)}%`
      });
    }
  }

  /**
   * 分析内存性能
   */
  private analyzeMemoryPerformance(
    stats: { currentStats: MemoryStats; pressureLevel: any },
    bottlenecks: PerformanceBottleneck[],
    recommendations: OptimizationRecommendation[]
  ): void {
    const pressure = stats.currentStats.memoryUsagePercent;

    if (pressure > 0.9) {
      bottlenecks.push({
        type: 'memory',
        severity: 'critical',
        description: `内存使用率严重: ${(pressure * 100).toFixed(2)}%`,
        currentValue: pressure,
        threshold: 0.85,
        impact: '可能导致OOM错误'
      });

      recommendations.push({
        priority: 'high',
        category: '内存管理',
        description: '内存使用率过高，需要立即优化',
        action: '减少缓存大小，启用激进清理，增加清理频率',
        expectedImpact: '降低内存使用率，防止OOM'
      });
    } else if (pressure > 0.85) {
      bottlenecks.push({
        type: 'memory',
        severity: 'high',
        description: `内存使用率较高: ${(pressure * 100).toFixed(2)}%`,
        currentValue: pressure,
        threshold: 0.85,
        impact: '接近内存限制'
      });

      recommendations.push({
        priority: 'high',
        category: '内存管理',
        description: '内存使用率较高，建议优化',
        action: '调整缓存大小，优化内存清理策略',
        expectedImpact: '降低内存使用率'
      });
    }
  }

  /**
   * 分析缓存性能
   */
  private analyzeCachePerformance(
    cacheStats: any,
    bottlenecks: PerformanceBottleneck[],
    recommendations: OptimizationRecommendation[]
  ): void {
    // 计算总体缓存命中率
    const metadataHitRate = this.calculateHitRate(cacheStats.metadata.hits, cacheStats.metadata.misses);
    const contentHitRate = this.calculateHitRate(cacheStats.content.hits, cacheStats.content.misses);
    const resourcesHitRate = this.calculateHitRate(cacheStats.resources.hits, cacheStats.resources.misses);
    const overallHitRate = (metadataHitRate + contentHitRate + resourcesHitRate) / 3;

    if (overallHitRate < 0.7) {
      bottlenecks.push({
        type: 'cache',
        severity: overallHitRate < 0.5 ? 'high' : 'medium',
        description: `缓存命中率较低: ${(overallHitRate * 100).toFixed(2)}%`,
        currentValue: overallHitRate,
        threshold: 0.7,
        impact: '影响加载性能'
      });

      recommendations.push({
        priority: overallHitRate < 0.5 ? 'high' : 'medium',
        category: '缓存优化',
        description: '缓存命中率较低，建议增加缓存大小或TTL',
        action: '增加缓存容量，延长TTL，启用预加载',
        expectedImpact: `预计提高缓存命中率至 ${Math.min(85, overallHitRate * 100 + 15).toFixed(1)}%`
      });
    }

    // 检查缓存容量
    if (cacheStats.content.size >= cacheStats.content.capacity * 0.9) {
      recommendations.push({
        priority: 'medium',
        category: '缓存容量',
        description: '内容缓存接近容量上限',
        action: '增加内容缓存容量',
        expectedImpact: '提高缓存命中率'
      });
    }
  }

  /**
   * 生成优化配置
   */
  private generateOptimizationConfig(
    bottlenecks: PerformanceBottleneck[],
    recommendations: OptimizationRecommendation[]
  ): Partial<SkillsPerformanceConfig> {
    const config: Partial<SkillsPerformanceConfig> = {};

    // 根据瓶颈调整配置
    const hasMemoryBottleneck = bottlenecks.some(b => b.type === 'memory' && b.severity === 'critical');
    const hasCacheBottleneck = bottlenecks.some(b => b.type === 'cache' && b.severity === 'high');
    const hasExecutionBottleneck = bottlenecks.some(b => b.type === 'execution' && b.severity === 'high');

    if (hasMemoryBottleneck) {
      // 内存压力大，减少缓存
      config.cache = {
        metadata: { maxSize: this.currentConfig.cache.metadata.maxSize * 0.8, ttl: this.currentConfig.cache.metadata.ttl },
        content: { maxSize: this.currentConfig.cache.content.maxSize * 0.8, ttl: this.currentConfig.cache.content.ttl },
        resources: { maxSize: this.currentConfig.cache.resources.maxSize * 0.8, ttl: this.currentConfig.cache.resources.ttl }
      };
      config.memory = {
        ...this.currentConfig.memory,
        aggressiveCleanup: true,
        cleanupInterval: this.currentConfig.memory.cleanupInterval * 0.5
      };
    }

    if (hasCacheBottleneck && !hasMemoryBottleneck) {
      // 缓存命中率低，增加缓存
      config.cache = {
        metadata: { maxSize: this.currentConfig.cache.metadata.maxSize * 1.5, ttl: this.currentConfig.cache.metadata.ttl * 1.5 },
        content: { maxSize: this.currentConfig.cache.content.maxSize * 1.5, ttl: this.currentConfig.cache.content.ttl * 1.5 },
        resources: { maxSize: this.currentConfig.cache.resources.maxSize * 1.5, ttl: this.currentConfig.cache.resources.ttl * 1.5 }
      };
      config.preload = {
        ...this.currentConfig.preload,
        enabled: true,
        maxSkills: this.currentConfig.preload.maxSkills * 1.5
      };
    }

    if (hasExecutionBottleneck) {
      // 执行性能问题，增加代码缓存
      config.codeCache = {
        maxSize: this.currentConfig.codeCache.maxSize * 1.5,
        ttlMs: this.currentConfig.codeCache.ttlMs * 1.5
      };
    }

    return config;
  }

  /**
   * 估算改善效果
   */
  private estimateImprovement(
    bottlenecks: PerformanceBottleneck[],
    suggestedConfig: Partial<SkillsPerformanceConfig>
  ): {
    executionTime: number;
    memoryUsage: number;
    cacheHitRate: number;
  } {
    let executionTimeImprovement = 0;
    let memoryUsageImprovement = 0;
    let cacheHitRateImprovement = 0;

    // 根据瓶颈类型估算改善
    for (const bottleneck of bottlenecks) {
      if (bottleneck.type === 'execution' && suggestedConfig.codeCache) {
        executionTimeImprovement += 20; // 代码缓存可减少20%执行时间
      }
      if (bottleneck.type === 'memory' && suggestedConfig.memory) {
        memoryUsageImprovement += 15; // 内存优化可减少15%使用
      }
      if (bottleneck.type === 'cache' && suggestedConfig.cache) {
        cacheHitRateImprovement += 15; // 缓存优化可提高15%命中率
      }
    }

    return {
      executionTime: Math.min(executionTimeImprovement, 50),
      memoryUsage: Math.min(memoryUsageImprovement, 30),
      cacheHitRate: Math.min(cacheHitRateImprovement, 20)
    };
  }

  /**
   * 计算命中率
   */
  private calculateHitRate(hits: number, misses: number): number {
    const total = hits + misses;
    return total > 0 ? hits / total : 0;
  }

  /**
   * 获取当前配置
   */
  getCurrentConfig(): Readonly<SkillsPerformanceConfig> {
    return { ...this.currentConfig };
  }

  /**
   * 切换到预设配置
   */
  switchToPreset(preset: 'development' | 'production' | 'high-performance' | 'low-resource'): void {
    let config: SkillsPerformanceConfig;

    switch (preset) {
      case 'production':
        config = PRODUCTION_PERFORMANCE_CONFIG;
        break;
      case 'high-performance':
        config = HIGH_PERFORMANCE_CONFIG;
        break;
      case 'low-resource':
        config = LOW_RESOURCE_CONFIG;
        break;
      default:
        config = DEFAULT_PERFORMANCE_CONFIG;
    }

    this.applyOptimization(config);
    logger.info(`[PerformanceOptimizer] 已切换到 ${preset} 配置`);
  }
}

