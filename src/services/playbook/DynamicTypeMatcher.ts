/**
 * DynamicTypeMatcher - 动态类型匹配器
 *
 * 负责动态类型标签的智能匹配，包括：
 * - 从用户查询中提取类型信号
 * - 基于类型信号检索候选 Playbook
 * - 计算多维度匹配分数
 * - 回退到向量检索策略
 */

import {
  StrategicPlaybook,
  PlaybookMatch,
  TypeVocabulary,
} from '../../core/playbook/types';
import { ToolRetrievalService } from '../ToolRetrievalService';
import { SimilarityService } from '../SimilarityService';
import { TypeVocabularyService } from '../TypeVocabularyService';
import { ScoreCalculator } from './ScoreCalculator';
import { logger } from '../../utils/logger';
import {
  IDynamicTypeMatcher,
  LegacyMatchingContext,
  PlaybookRecommendationConfig,
  DEFAULT_RECOMMENDATION_CONFIG,
} from './PlaybookMatcher.types';

/**
 * 动态类型匹配器实现
 * 支持动态类型标签的智能匹配
 */
export class DynamicTypeMatcher implements IDynamicTypeMatcher {
  private typeVocabularyService: TypeVocabularyService;
  private similarityService: SimilarityService;
  private toolRetrievalService: ToolRetrievalService;
  private scoreCalculator: ScoreCalculator;

  constructor(
    typeVocabularyService: TypeVocabularyService,
    similarityService: SimilarityService,
    toolRetrievalService: ToolRetrievalService
  ) {
    this.typeVocabularyService = typeVocabularyService;
    this.similarityService = similarityService;
    this.toolRetrievalService = toolRetrievalService;
    this.scoreCalculator = new ScoreCalculator();
  }

  /**
   * 多标签动态匹配
   *
   * 该方法通过以下步骤实现动态类型匹配：
   * 1. 从用户查询中提取类型信号
   * 2. 基于类型信号检索候选 Playbook
   * 3. 计算多维度匹配分数
   * 4. 按分数排序并返回最佳匹配
   */
  async matchPlaybooksDynamic(
    context: LegacyMatchingContext,
    config: PlaybookRecommendationConfig = DEFAULT_RECOMMENDATION_CONFIG
  ): Promise<PlaybookMatch[]> {
    try {
      logger.debug('[DynamicTypeMatcher] 开始动态类型匹配', {
        useDynamicTypes: config.useDynamicTypes
      });

      // 1. 获取动态类型词汇表
      const typeVocabulary = await this.typeVocabularyService.getAllTags();

      if (typeVocabulary.length === 0) {
        logger.warn('[DynamicTypeMatcher] 类型词汇表为空，使用回退策略');
        return this.fallbackVectorSearchLegacy(context, config);
      }

      // 2. 从查询中提取类型信号
      const typeSignals = await this.extractTypeSignals(context.userQuery, typeVocabulary);

      logger.debug('[DynamicTypeMatcher] 提取到类型信号', {
        signalCount: typeSignals.size,
        topSignals: Array.from(typeSignals.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([tag, strength]) => `${tag}:${strength.toFixed(2)}`)
      });

      // 3. 基于类型信号检索候选 Playbook
      const typeBasedCandidates = await this.findPlaybooksByTypeSignals(typeSignals);

      logger.debug('[DynamicTypeMatcher] 基于类型信号检索候选', {
        candidateCount: typeBasedCandidates.length
      });

      if (typeBasedCandidates.length === 0) {
        logger.warn('[DynamicTypeMatcher] 未找到基于类型信号的候选，使用回退策略');
        return this.fallbackVectorSearchLegacy(context, config);
      }

      // 4. 计算多标签匹配分数
      const matches = await Promise.all(
        typeBasedCandidates.map(pb => this.scoreCalculator.calculateMultiTagMatchScore(
          pb,
          { userQuery: context.userQuery },
          typeSignals
        ))
      );

      // 5. 过滤和排序
      const sortedMatches = matches
        .filter(m => m.matchScore >= (config.minMatchScore ?? DEFAULT_RECOMMENDATION_CONFIG.minMatchScore!))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, config.maxRecommendations ?? DEFAULT_RECOMMENDATION_CONFIG.maxRecommendations!);

      logger.info(
        `[DynamicTypeMatcher] 动态匹配完成，找到 ${sortedMatches.length} 个匹配结果`
      );

      // 记录匹配详情
      sortedMatches.forEach((match, index) => {
        const playbook = match.playbook;
        logger.debug(
          `[DynamicTypeMatcher] 匹配 #${index + 1}: ${playbook.name} (分数: ${(match.matchScore * 100).toFixed(1)}%)`
        );
      });

      return sortedMatches;

    } catch (error) {
      logger.error('[DynamicTypeMatcher] 动态匹配失败，使用回退策略', error);
      return this.fallbackVectorSearchLegacy(context, config);
    }
  }

  /**
   * 提取类型信号
   *
   * 通过以下方式提取信号：
   * 1. 关键词匹配 - 查询与类型关键词的直接匹配
   * 2. 模糊匹配 - 考虑部分匹配关系
   * 3. 信号强度计算 - 匹配关键词数 / 总关键词数
   */
  async extractTypeSignals(
    query: string,
    typeVocabulary: TypeVocabulary[]
  ): Promise<Map<string, number>> {
    const signals = new Map<string, number>();
    const queryLower = query.toLowerCase();

    // 分词预处理
    const queryWords = this.tokenizeQuery(queryLower);

    logger.debug('[DynamicTypeMatcher] 开始提取类型信号', {
      queryLength: query.length,
      queryWords: queryWords.slice(0, 10)
    });

    for (const type of typeVocabulary) {
      let matchCount = 0;
      const matchedKeywords: string[] = [];

      // 检查关键词匹配
      for (const keyword of type.keywords) {
        const keywordLower = keyword.toLowerCase();

        // 直接匹配
        if (queryLower.includes(keywordLower)) {
          matchCount++;
          matchedKeywords.push(keyword);
          continue;
        }

        // 模糊匹配（包含关系）
        for (const queryWord of queryWords) {
          if (queryWord.length < 2) continue; // 跳过单字符

          // 检查是否包含或被包含
          if (keywordLower.includes(queryWord) || queryWord.includes(keywordLower)) {
            matchCount += 0.5; // 模糊匹配权重较低
            matchedKeywords.push(keyword);
            break;
          }
        }
      }

      // 计算信号强度
      // 基础强度 = 匹配关键词数 / 总关键词数
      const baseStrength = type.keywords.length > 0
        ? matchCount / type.keywords.length
        : 0;

      // 增强因子：如果类型置信度高，增强信号强度
      const confidenceBoost = type.confidence * 0.2;

      // 增强因子：如果 playbook 数量多，增强信号强度
      const playbookCountBoost = Math.min(type.playbook_count / 100, 0.3);

      // 最终信号强度
      const signalStrength = Math.min(baseStrength + confidenceBoost + playbookCountBoost, 1);

      if (signalStrength > 0) {
        signals.set(type.tag_name, signalStrength);

        logger.debug('[DynamicTypeMatcher] 类型信号匹配', {
          tag: type.tag_name,
          matchedKeywords,
          signalStrength: signalStrength.toFixed(3)
        });
      }
    }

    return signals;
  }

  /**
   * 计算类型兼容性
   * 计算两个类型之间的兼容程度
   */
  async calculateTypeCompatibility(sourceType: string, targetType: string): Promise<number> {
    try {
      // 首先检查是否完全相同
      if (sourceType === targetType) {
        return 1.0;
      }

      // 获取相似标签
      const similarTags = await this.similarityService.getSimilarTags(sourceType, 0.7);

      // 检查目标类型是否在相似标签中
      for (const similar of similarTags) {
        const similarTagName = similar.tag1 === sourceType ? similar.tag2 : similar.tag1;
        if (similarTagName === targetType) {
          return similar.similarity_score;
        }
      }

      // 如果没有找到，返回基础相似度
      const similarity = await this.similarityService.calculateSimilarity(sourceType, targetType);
      return similarity;

    } catch (error) {
      logger.warn('[DynamicTypeMatcher] 计算类型兼容性失败', {
        sourceType,
        targetType,
        error: error instanceof Error ? error.message : 'unknown'
      });
      return 0;
    }
  }

  /**
   * 基于类型信号检索 Playbook
   *
   * 检索策略：
   * 1. 选择信号强度 > 0.5 的强信号标签
   * 2. 取前 5 个最强信号
   * 3. 基于这些标签查询关联的 Playbook
   * 4. 如果没有强信号，回退到向量检索
   */
  private async findPlaybooksByTypeSignals(
    typeSignals: Map<string, number>
  ): Promise<StrategicPlaybook[]> {
    // 选择强信号标签
    const strongSignals = Array.from(typeSignals.entries())
      .filter(([_, strength]) => strength > 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // 取前 5 个强信号
      .map(([tag, _]) => tag);

    logger.debug('[DynamicTypeMatcher] 强信号标签', {
      strongSignalCount: strongSignals.length,
      tags: strongSignals
    });

    if (strongSignals.length === 0) {
      logger.warn('[DynamicTypeMatcher] 没有强信号标签，回退到向量检索');
      return this.fallbackVectorSearch();
    }

    // 回退到向量检索（临时实现）
    // TODO: 实现基于类型标签的 Playbook 查询
    return this.fallbackVectorSearch();
  }

  /**
   * 回退到向量检索
   * 当动态类型匹配失败时的备选方案
   */
  private async fallbackVectorSearch(): Promise<StrategicPlaybook[]> {
    try {
      const candidates = await this.toolRetrievalService.findRelevantSkills(
        'strategic_playbook',
        20,
        0.4
      );

      return candidates
        .map(r => this.parsePlaybookFromVector(r.tool))
        .filter((p): p is StrategicPlaybook => p !== null);

    } catch (error) {
      logger.error('[DynamicTypeMatcher] 向量检索失败', error);
      return [];
    }
  }

  /**
   * 回退到向量检索（Legacy 版本）
   * 兼容性方法
   */
  private async fallbackVectorSearchLegacy(
    context: LegacyMatchingContext,
    config: PlaybookRecommendationConfig
  ): Promise<PlaybookMatch[]> {
    try {
      const searchQuery = this.buildSearchQuery(context);
      const candidates = await this.toolRetrievalService.findRelevantSkills(
        searchQuery,
        20,
        0.4
      );

      const playbooks = candidates
        .map(r => this.parsePlaybookFromVector(r.tool))
        .filter((p): p is StrategicPlaybook => p !== null);

      const validPlaybooks = playbooks.filter(p => p.status === 'active' || p.status === 'archived');

      const matches = await Promise.all(
        validPlaybooks.map(pb => this.scoreCalculator.calculateMatchScore(pb, context))
      );

      return matches
        .filter(m => m.matchScore >= (config.minMatchScore ?? DEFAULT_RECOMMENDATION_CONFIG.minMatchScore!))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, config.maxRecommendations ?? DEFAULT_RECOMMENDATION_CONFIG.maxRecommendations!);

    } catch (error) {
      logger.error('[DynamicTypeMatcher] Legacy 向量检索失败', error);
      return [];
    }
  }

  /**
   * 分词查询文本
   * 提取关键词
   */
  private tokenizeQuery(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[，。？！；：、,\.!?;:\s]+/g, ' ')
      .split(' ')
      .filter(w => w.length > 0)
      .slice(0, 50); // 限制关键词数量
  }

  /**
   * 构建搜索查询
   */
  private buildSearchQuery(context: LegacyMatchingContext): string {
    const parts: string[] = [context.userQuery];

    // 添加历史上下文
    if (context.sessionHistory && context.sessionHistory.length > 0) {
      parts.push(context.sessionHistory.slice(-3).join(' '));
    }

    // 添加当前状态
    if (context.currentState) {
      parts.push(context.currentState);
    }

    // 添加用户偏好
    if (context.userProfile?.preferences) {
      const prefStr = Object.entries(context.userProfile.preferences)
        .map(([k, v]) => `${k}:${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' ');
      parts.push(prefStr);
    }

    return parts.join(' ');
  }

  /**
   * 从向量结果解析 Playbook
   * 处理 BuiltInTool | SkillTool 类型
   */
  private parsePlaybookFromVector(tool: unknown): StrategicPlaybook | null {
    // 检查是否为对象
    if (tool === null || tool === undefined || typeof tool !== 'object') {
      return null;
    }

    const toolObj = tool as Record<string, unknown>;

    // 检查是否有 metadata
    const metadataValue = toolObj.metadata;
    if (metadataValue === null || metadataValue === undefined) {
      return null;
    }

    const metadata = metadataValue as Record<string, unknown>;

    // 检查是否为 strategic_playbook 类型
    if (metadata.type !== 'strategic_playbook') {
      return null;
    }

    try {
      // 提取 tags
      const tags = this.extractTagsFromTool(toolObj);

      const playbook: StrategicPlaybook = {
        id: String(metadata.playbookId || toolObj.id || ''),
        name: String(metadata.name || toolObj.name || ''),
        description: String(metadata.description || toolObj.description || ''),
        type: String(metadata.type || 'problem_solving'),
        version: String(metadata.version || '1.0.0'),
        status: (metadata.status as StrategicPlaybook['status']) || 'active',
        context: {
          domain: String(metadata.domain || 'general'),
          scenario: String(metadata.scenario || 'unspecified'),
          complexity: 'medium',
          stakeholders: [],
        },
        trigger: {
          type: 'event',
          condition: 'Automatically extracted from strategic learning'
        },
        actions: (metadata.actions as StrategicPlaybook['actions']) || [],
        sourceLearningIds: (metadata.sourceLearningIds as string[]) || [],
        createdAt: Number(metadata.createdAt) || Date.now(),
        lastUpdated: Date.now(),
        lastOptimized: Number(metadata.lastOptimized) || Date.now(),
        metrics: {
          usageCount: Number(metadata.usageCount) || 0,
          successRate: Number(metadata.successRate) || 0,
          avgSatisfaction: 0,
          lastUsed: Number(metadata.lastUsed) || 0,
          avgExecutionTime: 0
        },
        optimizationCount: Number(metadata.optimizationCount) || 0,
        parentId: metadata.parentId as string | undefined,
        tags: tags,
        author: String(metadata.author || 'auto-extracted'),
        reviewers: (metadata.reviewers as string[]) || [],
        type_tags: metadata.type_tags as string[] | undefined,
        type_confidence: metadata.type_confidence as Record<string, number> | undefined,
        prompt_template_id: metadata.prompt_template_id as string | undefined,
        guidance_level: metadata.guidance_level as 'light' | 'medium' | 'intensive' | undefined,
        guidance_steps: metadata.guidance_steps as StrategicPlaybook['guidance_steps'],
      };

      return playbook;
    } catch (error) {
      logger.error('[DynamicTypeMatcher] Failed to parse playbook from vector:', error);
      return null;
    }
  }

  /**
   * 从工具对象中提取 tags
   */
  private extractTagsFromTool(tool: Record<string, unknown>): string[] {
    const tagsValue = tool.tags;
    if (Array.isArray(tagsValue)) {
      return tagsValue.filter((t): t is string => typeof t === 'string');
    }
    return ['playbook'];
  }
}
