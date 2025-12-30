/**
 * PlaybookMatcher - Playbook 推荐引擎主协调器
 *
 * 基于上下文和模式匹配，智能推荐最佳 Playbook
 *
 * 架构：
 * - 依赖注入模式，通过构造函数注入子模块
 * - 职责协调，不包含具体实现逻辑
 */

import {
  StrategicPlaybook,
  PlaybookMatch,
  MatchingContext,
} from '../../core/playbook/types';
import { ToolRetrievalService } from '../ToolRetrievalService';
import { LLMManager } from '../../core/LLMManager';
import { TypeVocabularyService } from '../TypeVocabularyService';
import { SimilarityService } from '../SimilarityService';
import { logger } from '../../utils/logger';
import { ScoreCalculator } from './ScoreCalculator';
import { DynamicTypeMatcher } from './DynamicTypeMatcher';
import { SequenceRecommender } from './SequenceRecommender';
import { PlaybookCurator } from './PlaybookCurator';
import {
  IPlaybookMatcher,
  LegacyMatchingContext,
  PlaybookRecommendationConfig,
  DEFAULT_RECOMMENDATION_CONFIG,
  SequenceResult,
} from './PlaybookMatcher.types';

/**
 * PlaybookMatcher 主协调器
 *
 * 职责：
 * 1. 协调各子模块完成匹配任务
 * 2. 提供统一的公共 API
 * 3. 保持向后兼容性
 */
export class PlaybookMatcher implements IPlaybookMatcher {
  // 子模块实例
  private readonly scoreCalculator: ScoreCalculator;
  private readonly dynamicTypeMatcher: DynamicTypeMatcher;
  private readonly sequenceRecommender: SequenceRecommender;
  private readonly curator: PlaybookCurator;
  private readonly similarityService: SimilarityService;
  private readonly toolRetrievalService: ToolRetrievalService;

  // 默认配置
  private readonly defaultConfig: PlaybookRecommendationConfig;

  /**
   * 构造函数 - 依赖注入
   *
   * @param toolRetrievalService 工具检索服务
   * @param llmManager LLM 管理器
   */
  constructor(
    toolRetrievalService: ToolRetrievalService,
    llmManager: LLMManager
  ) {
    // 初始化依赖服务
    const typeVocabularyService = TypeVocabularyService.getInstance();
    const similarityService = SimilarityService.getInstance();

    // 初始化子模块
    this.scoreCalculator = new ScoreCalculator();
    this.dynamicTypeMatcher = new DynamicTypeMatcher(
      typeVocabularyService,
      similarityService,
      toolRetrievalService
    );
    this.sequenceRecommender = new SequenceRecommender(llmManager);
    this.curator = new PlaybookCurator(toolRetrievalService, similarityService);

    // 保存依赖引用
    this.similarityService = similarityService;
    this.toolRetrievalService = toolRetrievalService;

    // 设置默认配置
    this.defaultConfig = { ...DEFAULT_RECOMMENDATION_CONFIG };

    logger.info('[PlaybookMatcher] 初始化完成');
  }

  /**
   * 匹配最佳 Playbook
   *
   * 流程：
   * 1. 如果启用动态类型匹配，使用 DynamicTypeMatcher
   * 2. 否则使用标准评分匹配（向量检索 + ScoreCalculator）
   * 3. 过滤和排序结果
   */
  async matchPlaybooks(
    context: MatchingContext,
    config?: PlaybookRecommendationConfig
  ): Promise<PlaybookMatch[]> {
    const finalConfig = { ...this.defaultConfig, ...config };

    try {
      // 优先使用动态类型匹配
      if (finalConfig.useDynamicTypes) {
        const legacyContext = this.toLegacyContext(context);
        return this.dynamicTypeMatcher.matchPlaybooksDynamic(legacyContext, finalConfig);
      }

      // 标准评分匹配
      const searchQuery = this.buildSearchQuery(context);
      const candidates = await this.toolRetrievalService.findRelevantSkills(
        searchQuery,
        20, // 获取更多候选，后续筛选
        0.4
      );

      const playbooks = candidates
        .map(r => this.parsePlaybookFromVector(r.tool))
        .filter((p): p is StrategicPlaybook => p !== null);

      // 过滤有效的 Playbook（active 或 archived）
      const validPlaybooks = playbooks.filter(
        p => p.status === 'active' || p.status === 'archived'
      );

      // 计算匹配分数
      const legacyContext = this.toLegacyContext(context);
      const matches = await Promise.all(
        validPlaybooks.map(pb => this.scoreCalculator.calculateMatchScore(pb, legacyContext))
      );

      // 过滤和排序
      const sortedMatches = matches
        .filter(m => m.matchScore >= (finalConfig.minMatchScore ?? 0.5))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, finalConfig.maxRecommendations ?? 5);

      // 记录匹配日志
      logger.info(
        `[PlaybookMatcher] Found ${sortedMatches.length} matches for query: "${context.userQuery.substring(0, 50)}..."`
      );

      // 输出每个匹配的激活日志
      sortedMatches.forEach(match => {
        const playbook = match.playbook;
        const successRate = Math.round(playbook.metrics.successRate * 100);
        const playbookName = this.formatPlaybookName(playbook);
        logger.info(`[PlaybookMatcher] Activated Strategy: ${playbookName} (Success: ${successRate}%)`);
      });

      return sortedMatches;

    } catch (error) {
      logger.error('[PlaybookMatcher] Failed to match playbooks:', error);
      return [];
    }
  }

  /**
   * 查找相似 Playbook
   */
  async findSimilarPlaybooks(
    playbookId: string,
    limit: number = 5
  ): Promise<PlaybookMatch[]> {
    try {
      // 获取目标 Playbook
      const target = await this.getPlaybookById(playbookId);
      if (!target) {
        return [];
      }

      // 构建相似性查询
      const similarityQuery = `similar to ${target.name} ${target.context.domain} ${target.description}`;

      const candidates = await this.toolRetrievalService.findRelevantSkills(
        similarityQuery,
        limit * 2,
        0.6
      );

      const playbooks = candidates
        .map(r => this.parsePlaybookFromVector(r.tool))
        .filter((p): p is StrategicPlaybook => p !== null && p.id !== playbookId);

      // 计算相似度分数
      const matches = await Promise.all(
        playbooks.map(pb => this.scoreCalculator.calculateSimilarityScore(pb, target))
      );

      return matches
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, limit);

    } catch (error) {
      logger.error('[PlaybookMatcher] Failed to find similar playbooks:', error);
      return [];
    }
  }

  /**
   * 推荐 Playbook 序列
   */
  async recommendPlaybookSequence(
    context: MatchingContext,
    targetOutcome: string
  ): Promise<SequenceResult> {
    try {
      // 第一步：获取初始匹配
      const initialMatches = await this.matchPlaybooks(context, {
        maxRecommendations: 10,
        minMatchScore: 0.4,
        useDynamicTypes: false,
        useSimilarityMatching: true,
        similarityThreshold: 0.7
      });

      if (initialMatches.length === 0) {
        return {
          sequence: [],
          rationale: '未找到合适的 Playbook',
          estimatedSuccessRate: 0,
        };
      }

      // 第二步：使用 SequenceRecommender 分析最佳序列
      return this.sequenceRecommender.recommendSequence(context, targetOutcome, initialMatches);

    } catch (error) {
      logger.error('[PlaybookMatcher] Failed to recommend playbook sequence:', error);
      return {
        sequence: [],
        rationale: '分析过程中发生错误',
        estimatedSuccessRate: 0,
      };
    }
  }

  /**
   * 维护知识库（公开方法）
   */
  async maintainKnowledgeBase(): Promise<{ merged: number; archived: number }> {
    return this.curator.maintainPlaybookKnowledgeBase();
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 转换为遗留上下文（兼容性）
   */
  private toLegacyContext(context: MatchingContext): LegacyMatchingContext {
    return {
      userQuery: context.userQuery,
      sessionHistory: context.sessionHistory,
      currentState: undefined,
      userProfile: undefined,
      constraints: undefined,
    };
  }

  /**
   * 构建搜索查询
   */
  private buildSearchQuery(context: MatchingContext): string {
    const parts: string[] = [context.userQuery];

    // 添加历史上下文
    if (context.sessionHistory && context.sessionHistory.length > 0) {
      parts.push(context.sessionHistory.slice(-3).join(' '));
    }

    // 添加域上下文
    if (context.domain) {
      parts.push(context.domain);
    }

    // 添加场景上下文
    if (context.scenario) {
      parts.push(context.scenario);
    }

    return parts.join(' ');
  }

  /**
   * 获取单个 Playbook
   */
  private async getPlaybookById(id: string): Promise<StrategicPlaybook | null> {
    try {
      const searchResult = await this.toolRetrievalService.findRelevantSkills(
        `playbook ${id}`,
        1,
        0.99
      );

      if (searchResult.length > 0) {
        return this.parsePlaybookFromVector(searchResult[0].tool);
      }

      return null;
    } catch (error) {
      logger.error('[PlaybookMatcher] Failed to get playbook by id:', error);
      return null;
    }
  }

  /**
   * 格式化 Playbook 名称
   */
  private formatPlaybookName(playbook: StrategicPlaybook): string {
    const domainMap: Record<string, string> = {
      'general': '通用',
      'business': '商业',
      'technical': '技术',
      'management': '管理',
      'strategy': '策略'
    };

    const domainInChinese = domainMap[playbook.context.domain] || playbook.context.domain;
    return `[${domainInChinese}-${playbook.name}]`;
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
      // 提取 tags（从工具对象中获取）
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
      logger.error('[PlaybookMatcher] Failed to parse playbook from vector:', error);
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
