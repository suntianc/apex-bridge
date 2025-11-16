import { SkillsIndex } from './SkillsIndex';
import logger from '../../utils/logger';
import type { SkillSearchResult, SkillMetadata } from '../../types';

/**
 * 匹配算法优化配置
 */
export interface MatchingOptimizationConfig {
  // 关键词匹配权重
  keywordWeight: number;
  // 描述匹配权重
  descriptionWeight: number;
  // 领域匹配权重
  domainWeight: number;
  // 置信度阈值
  confidenceThreshold: number;
  // 最大搜索结果数
  maxResults: number;
  // 是否启用模糊匹配
  fuzzyMatching: boolean;
  // 是否启用语义匹配（如果可用）
  semanticMatching: boolean;
}

/**
 * 匹配性能统计
 */
export interface MatchingPerformanceStats {
  totalSearches: number;
  averageResults: number;
  averageConfidence: number;
  averageSearchTime: number;
  topQueries: Array<{ query: string; count: number }>;
  lowConfidenceRate: number; // 低置信度结果比例
}

/**
 * Skills索引优化器
 * 
 * 优化智能匹配算法，提高匹配准确率和性能
 */
export class SkillsIndexOptimizer {
  private readonly skillsIndex: SkillsIndex;
  private config: MatchingOptimizationConfig;
  private performanceStats: MatchingPerformanceStats = {
    totalSearches: 0,
    averageResults: 0,
    averageConfidence: 0,
    averageSearchTime: 0,
    topQueries: [],
    lowConfidenceRate: 0
  };
  private queryHistory: Map<string, number> = new Map();
  private searchTimes: number[] = [];

  constructor(
    skillsIndex: SkillsIndex,
    config?: Partial<MatchingOptimizationConfig>
  ) {
    this.skillsIndex = skillsIndex;
    this.config = {
      keywordWeight: 0.5,
      descriptionWeight: 0.3,
      domainWeight: 0.2,
      confidenceThreshold: 0.15,
      maxResults: 5,
      fuzzyMatching: true,
      semanticMatching: false,
      ...config
    };
  }

  /**
   * 优化搜索
   */
  async optimizedSearch(
    query: string,
    options?: { limit?: number; minConfidence?: number; domain?: string }
  ): Promise<SkillSearchResult[]> {
    const startTime = Date.now();

    // 记录查询
    this.recordQuery(query);

    // 执行搜索
    const results = await this.skillsIndex.findRelevantSkills(query, {
      limit: options?.limit ?? this.config.maxResults,
      minConfidence: options?.minConfidence ?? this.config.confidenceThreshold,
      domain: options?.domain
    });

    const searchTime = Date.now() - startTime;
    this.recordSearch(searchTime, results);

    // 如果启用模糊匹配且结果不足，尝试模糊匹配
    if (this.config.fuzzyMatching && results.length < 2) {
      const fuzzyResults = await this.fuzzySearch(query, options);
      if (fuzzyResults.length > 0) {
        results.push(...fuzzyResults);
      }
    }

    return results.slice(0, options?.limit ?? this.config.maxResults);
  }

  /**
   * 模糊搜索
   */
  private async fuzzySearch(
    query: string,
    options?: { limit?: number; minConfidence?: number; domain?: string }
  ): Promise<SkillSearchResult[]> {
    const allMetadata = this.skillsIndex.getAllMetadata();
    const queryLower = query.toLowerCase();
    const results: SkillSearchResult[] = [];

    for (const metadata of allMetadata) {
      let score = 0;

      // 关键词模糊匹配
      for (const keyword of metadata.keywords) {
        if (keyword.toLowerCase().includes(queryLower) || queryLower.includes(keyword.toLowerCase())) {
          score += this.config.keywordWeight * 0.5;
        }
      }

      // 描述模糊匹配
      if (metadata.description.toLowerCase().includes(queryLower)) {
        score += this.config.descriptionWeight * 0.3;
      }

      // 名称模糊匹配
      if (metadata.name.toLowerCase().includes(queryLower) || metadata.displayName.toLowerCase().includes(queryLower)) {
        score += this.config.keywordWeight * 0.7;
      }

      if (score > 0 && score >= (options?.minConfidence ?? this.config.confidenceThreshold * 0.5)) {
        results.push({
          metadata,
          confidence: score,
          matchedKeywords: [],
          matchedDescriptionTerms: []
        });
      }
    }

    // 按置信度排序
    results.sort((a, b) => b.confidence - a.confidence);

    return results.slice(0, options?.limit ?? 2);
  }

  /**
   * 记录查询
   */
  private recordQuery(query: string): void {
    const count = this.queryHistory.get(query) || 0;
    this.queryHistory.set(query, count + 1);
  }

  /**
   * 记录搜索性能
   */
  private recordSearch(searchTime: number, results: SkillSearchResult[]): void {
    this.performanceStats.totalSearches += 1;
    this.searchTimes.push(searchTime);

    // 更新平均结果数
    const totalResults = this.performanceStats.averageResults * (this.performanceStats.totalSearches - 1) + results.length;
    this.performanceStats.averageResults = totalResults / this.performanceStats.totalSearches;

    // 更新平均置信度
    const avgConfidence = results.length > 0
      ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
      : 0;
    const totalConfidence = this.performanceStats.averageConfidence * (this.performanceStats.totalSearches - 1) + avgConfidence;
    this.performanceStats.averageConfidence = totalConfidence / this.performanceStats.totalSearches;

    // 更新平均搜索时间
    const totalTime = this.performanceStats.averageSearchTime * (this.performanceStats.totalSearches - 1) + searchTime;
    this.performanceStats.averageSearchTime = totalTime / this.performanceStats.totalSearches;

    // 更新低置信度比例
    const lowConfidenceCount = results.filter(r => r.confidence < this.config.confidenceThreshold).length;
    const lowConfidenceRate = this.performanceStats.lowConfidenceRate * (this.performanceStats.totalSearches - 1) + (lowConfidenceCount / results.length || 0);
    this.performanceStats.lowConfidenceRate = lowConfidenceRate / this.performanceStats.totalSearches;

    // 更新热门查询（保留最近1000次）
    if (this.queryHistory.size > 1000) {
      const entries = Array.from(this.queryHistory.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 500);
      this.queryHistory.clear();
      entries.forEach(([query, count]) => this.queryHistory.set(query, count));
    }
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(): MatchingPerformanceStats {
    // 更新热门查询
    const topQueries = Array.from(this.queryHistory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));

    return {
      ...this.performanceStats,
      topQueries
    };
  }

  /**
   * 分析匹配性能
   */
  analyzeMatchingPerformance(): {
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 检查平均置信度
    if (this.performanceStats.averageConfidence < 0.3) {
      issues.push(`平均置信度较低: ${(this.performanceStats.averageConfidence * 100).toFixed(2)}%`);
      recommendations.push('降低置信度阈值或改进匹配算法');
    }

    // 检查低置信度比例
    if (this.performanceStats.lowConfidenceRate > 0.3) {
      issues.push(`低置信度结果比例较高: ${(this.performanceStats.lowConfidenceRate * 100).toFixed(2)}%`);
      recommendations.push('优化关键词和描述，提高匹配质量');
    }

    // 检查搜索时间
    if (this.performanceStats.averageSearchTime > 50) {
      issues.push(`平均搜索时间较长: ${this.performanceStats.averageSearchTime.toFixed(2)}ms`);
      recommendations.push('优化索引结构，减少搜索时间');
    }

    // 检查结果数量
    if (this.performanceStats.averageResults < 1) {
      issues.push('平均搜索结果数过少');
      recommendations.push('降低置信度阈值或启用模糊匹配');
    }

    return { issues, recommendations };
  }

  /**
   * 优化配置
   */
  optimizeConfig(): Partial<MatchingOptimizationConfig> {
    const stats = this.getPerformanceStats();
    const optimizations: Partial<MatchingOptimizationConfig> = {};

    // 如果平均置信度低，降低阈值
    if (stats.averageConfidence < 0.3 && this.config.confidenceThreshold > 0.1) {
      optimizations.confidenceThreshold = Math.max(0.1, this.config.confidenceThreshold * 0.8);
    }

    // 如果结果数少，增加最大结果数
    if (stats.averageResults < 2 && this.config.maxResults < 10) {
      optimizations.maxResults = Math.min(10, this.config.maxResults + 2);
    }

    // 如果搜索时间短，可以启用更多功能
    if (stats.averageSearchTime < 20) {
      optimizations.fuzzyMatching = true;
    }

    return optimizations;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<MatchingOptimizationConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[SkillsIndexOptimizer] 配置已更新');
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<MatchingOptimizationConfig> {
    return { ...this.config };
  }
}

