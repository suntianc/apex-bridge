/**
 * ScoreCalculator - Playbook 评分计算器
 *
 * 负责计算 Playbook 的匹配分数，包括：
 * - 基础匹配分数计算
 * - 相似度分数计算
 * - 多标签匹配分数计算
 * - 文本相似度计算
 */

import {
  StrategicPlaybook,
  PlaybookMatch,
  MatchingContext,
} from '../../core/playbook/types';
import { logger } from '../../utils/logger';
import {
  IScoreCalculator,
  LegacyMatchingContext,
} from './PlaybookMatcher.types';

/**
 * 评分计算器实现
 * 负责所有与 Playbook 评分相关的计算逻辑
 */
export class ScoreCalculator implements IScoreCalculator {
  /**
   * 计算 Playbook 匹配分数
   *
   * 评分维度：
   * 1. 文本相似度 (30%)
   * 2. 成功率 (25%) - 常规 Playbook
   * 3. 使用频率 (15%)
   * 4. 时效性 (15%)
   * 5. 上下文匹配 (15%)
   */
  async calculateMatchScore(
    playbook: StrategicPlaybook,
    context: LegacyMatchingContext
  ): Promise<PlaybookMatch> {
    let score = 0;
    const matchReasons: string[] = [];

    // 检查是否为失败衍生的 Playbook（风险规避型）
    const isFailureDerived = playbook.tags.includes('failure-derived') ||
                             playbook.tags.includes('risk-avoidance');

    // 1. 文本相似度 (30%)
    const textSimilarity = await this.calculateTextSimilarity(
      context.userQuery,
      `${playbook.name} ${playbook.description} ${playbook.context.scenario}`
    );
    score += textSimilarity * 0.3;
    if (textSimilarity > 0.5) {
      matchReasons.push(`文本相似度高 (${(textSimilarity * 100).toFixed(0)}%)`);
    }

    // 2. 失败衍生 Playbook 的特殊处理
    if (isFailureDerived) {
      // 风险规避 Playbook 主要看场景匹配度，而不是成功率
      const contextMatch = this.calculateContextMatch(playbook, context);
      score += contextMatch * 0.4;
      if (contextMatch > 0.6) {
        matchReasons.push('风险规避场景匹配');
      }
    } else {
      // 2. 成功率 (25%) - 仅对常规 Playbook
      score += playbook.metrics.successRate * 0.25;
      if (playbook.metrics.successRate > 0.8) {
        matchReasons.push(`高成功率 (${(playbook.metrics.successRate * 100).toFixed(0)}%)`);
      }
    }

    // 3. 使用频率 (15%)
    const usageScore = Math.min(playbook.metrics.usageCount / 100, 1);
    score += usageScore * 0.15;
    if (usageScore > 0.5) {
      matchReasons.push(`经常使用 (${playbook.metrics.usageCount}次)`);
    }

    // 4. 时效性 (15%)
    const recencyScore = this.calculateRecencyScore(playbook.metrics.lastUsed);
    score += recencyScore * 0.15;
    if (recencyScore > 0.7) {
      matchReasons.push('最近更新');
    }

    // 5. 上下文匹配 (15%)
    const contextMatch = this.calculateContextMatch(playbook, context);
    score += contextMatch * 0.15;
    if (contextMatch > 0.6) {
      matchReasons.push('上下文高度匹配');
    }

    // 失败衍生 Playbook 的特别标记
    if (isFailureDerived) {
      matchReasons.push('失败经验衍生（风险规避）');
    }

    // archived 状态的 Playbook 应用权重惩罚（但不排除）
    if (playbook.status === 'archived') {
      score *= 0.7;
      matchReasons.push('已归档（降低权重）');
    }

    return {
      playbook,
      matchScore: Math.min(score, 1),
      matchReasons,
      applicableSteps: playbook.actions.map((_, i) => i),
    };
  }

  /**
   * 计算文本相似度
   * 基于关键词重叠的 Jaccard 相似度
   */
  async calculateTextSimilarity(text1: string, text2: string): Promise<number> {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) {
      return 0;
    }

    return intersection.size / union.size;
  }

  /**
   * 计算时效性分数
   * 根据最后使用时间计算分数，越近分数越高
   */
  calculateRecencyScore(lastUsed: number): number {
    const daysSinceUsed = (Date.now() - lastUsed) / (24 * 60 * 60 * 1000);
    if (daysSinceUsed === 0) return 1;
    return Math.max(0, 1 - (daysSinceUsed / 365));
  }

  /**
   * 计算上下文匹配分数
   */
  calculateContextMatch(
    playbook: StrategicPlaybook,
    context: LegacyMatchingContext
  ): number {
    let match = 0;

    // 检查约束匹配
    if (context.constraints?.maxSteps && playbook.actions.length <= context.constraints.maxSteps) {
      match += 0.3;
    }

    // 检查资源匹配
    if (context.constraints?.requiredResources) {
      const hasResources = context.constraints.requiredResources.every(r =>
        playbook.actions.some(a => a.resources?.includes(r))
      );
      if (hasResources) match += 0.4;
    }

    // 检查用户偏好匹配
    if (context.userProfile?.pastSuccessPatterns) {
      const hasPattern = context.userProfile.pastSuccessPatterns.some(p =>
        playbook.tags.includes(p)
      );
      if (hasPattern) match += 0.3;
    }

    return Math.min(match, 1);
  }

  /**
   * 计算两个 Playbook 之间的相似度分数
   *
   * 评分维度：
   * 1. 领域相似性 (40%)
   * 2. 复杂度相似性 (30%)
   * 3. 标签重叠 (30%)
   */
  async calculateSimilarityScore(
    playbook: StrategicPlaybook,
    target: StrategicPlaybook
  ): Promise<PlaybookMatch> {
    let score = 0;

    // 1. 领域相似性 (40%)
    if (playbook.context.domain === target.context.domain) {
      score += 0.4;
    }

    // 2. 复杂度相似性 (30%)
    if (playbook.context.complexity === target.context.complexity) {
      score += 0.3;
    }

    // 3. 标签重叠 (30%)
    const tagOverlap = this.calculateTagOverlap(playbook.tags, target.tags);
    score += tagOverlap * 0.3;

    return {
      playbook,
      matchScore: Math.min(score, 1),
      matchReasons: [
        playbook.context.domain === target.context.domain ? '领域匹配' : '',
        `标签重叠 ${(tagOverlap * 100).toFixed(0)}%`
      ].filter(Boolean),
      applicableSteps: playbook.actions.map((_, i) => i),
    };
  }

  /**
   * 计算标签重叠度
   * 使用 Jaccard 相似度计算两个标签集合的重叠程度
   */
  calculateTagOverlap(tags1: string[], tags2: string[]): number {
    const set1 = new Set(tags1);
    const set2 = new Set(tags2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) {
      return 0;
    }

    return intersection.size / union.size;
  }

  /**
   * 计算多标签匹配分数
   * 支持动态类型标签的智能匹配
   *
   * 评分维度：
   * 1. 标签完全匹配 (权重 1.0)
   * 2. 标签语义相似匹配 (权重 0.8)
   * 3. 标签共现模式匹配 (权重 0.6)
   * 4. 上下文匹配 (权重 0.2)
   * 5. 使用频率 (权重 0.1)
   * 6. 时效性 (权重 0.1)
   */
  async calculateMultiTagMatchScore(
    playbook: StrategicPlaybook,
    context: MatchingContext,
    typeSignals: Map<string, number>
  ): Promise<PlaybookMatch> {
    let totalScore = 0;
    const matchReasons: string[] = [];
    const tagScores: Array<{ tag: string; score: number; matchType: 'exact' | 'similar' | 'cooccurrence' }> = [];

    const playbookTags = playbook.type_tags || [];
    const playbookConfidences = playbook.type_confidence || {};

    // 1. 标签完全匹配 (权重 1.0)
    for (const tag of playbookTags) {
      const signalStrength = typeSignals.get(tag) || 0;
      const confidence = playbookConfidences[tag] || 0.5;

      if (signalStrength > 0.7) {
        const score = signalStrength * confidence * 1.0;
        totalScore += score;
        tagScores.push({ tag, score, matchType: 'exact' });
        matchReasons.push(`标签 "${tag}" 完全匹配 (${(score * 100).toFixed(0)}%)`);
      }
    }

    // 2. 标签语义相似匹配 (权重 0.8)
    // 注意：语义相似匹配需要 SimilarityService，这里只做基础评分
    // 详细的语义相似评分在 DynamicTypeMatcher 中实现

    // 3. 标签共现模式匹配 (权重 0.6)
    const cooccurrenceScore = this.calculateCooccurrenceScore(playbookTags, typeSignals);
    if (cooccurrenceScore > 0) {
      totalScore += cooccurrenceScore * 0.6;
      matchReasons.push(`标签共现模式匹配 (${(cooccurrenceScore * 100 * 0.6).toFixed(0)}%)`);
    }

    // 4. 上下文匹配 (权重 0.2)
    // 使用基本的上下文匹配
    const contextScore = this.calculateBasicContextMatch(playbook, context) * 0.2;
    if (contextScore > 0) {
      totalScore += contextScore;
      matchReasons.push(`上下文匹配 (${(contextScore * 100).toFixed(0)}%)`);
    }

    // 5. 使用频率 (权重 0.1)
    const usageScore = Math.min(playbook.metrics.usageCount / 100, 1) * 0.1;
    if (usageScore > 0) {
      totalScore += usageScore;
      matchReasons.push(`使用频率 (${playbook.metrics.usageCount}次)`);
    }

    // 6. 时效性 (权重 0.1)
    const recencyScore = this.calculateRecencyScore(playbook.metrics.lastUsed) * 0.1;
    if (recencyScore > 0) {
      totalScore += recencyScore;
      matchReasons.push(`最近更新 (${(recencyScore * 100).toFixed(0)}%)`);
    }

    // archived 状态的 Playbook 应用权重惩罚（但不排除）
    if (playbook.status === 'archived') {
      totalScore *= 0.7;
      matchReasons.push('已归档（降低权重）');
    }

    // 归一化到 [0, 1]
    const normalizedScore = Math.min(totalScore, 1);

    return {
      playbook,
      matchScore: normalizedScore,
      matchReasons,
      applicableSteps: playbook.actions.map((_, i) => i),
      tagScores,
    };
  }

  /**
   * 计算标签共现分数
   */
  private calculateCooccurrenceScore(
    playbookTags: string[],
    typeSignals: Map<string, number>
  ): number {
    if (playbookTags.length < 2) {
      return 0;
    }

    let totalCooccurrence = 0;
    let pairCount = 0;

    // 计算所有标签对的共现分数
    for (let i = 0; i < playbookTags.length; i++) {
      for (let j = i + 1; j < playbookTags.length; j++) {
        const tag1 = playbookTags[i];
        const tag2 = playbookTags[j];

        const signal1 = typeSignals.get(tag1) || 0;
        const signal2 = typeSignals.get(tag2) || 0;

        // 共现分数 = 平均信号强度
        const pairScore = (signal1 + signal2) / 2;
        totalCooccurrence += pairScore;
        pairCount++;
      }
    }

    return pairCount > 0 ? totalCooccurrence / pairCount : 0;
  }

  /**
   * 计算基本的上下文匹配分数
   */
  private calculateBasicContextMatch(
    playbook: StrategicPlaybook,
    context: MatchingContext
  ): number {
    let match = 0;

    // 域匹配
    if (context.domain && playbook.context.domain === context.domain) {
      match += 0.5;
    }

    // 场景匹配
    if (context.scenario && playbook.context.scenario === context.scenario) {
      match += 0.3;
    }

    // 复杂度匹配
    if (context.complexity && playbook.context.complexity === context.complexity) {
      match += 0.2;
    }

    return Math.min(match, 1);
  }
}
