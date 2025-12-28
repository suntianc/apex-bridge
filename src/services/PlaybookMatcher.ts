/**
 * Playbook匹配与推荐引擎
 * 基于上下文和模式匹配，智能推荐最佳Playbook
 */

import { StrategicPlaybook, PlaybookMatch, PlaybookRecommendationConfig } from '../core/playbook/types';
import { DuplicatePlaybookPair, ArchiveCandidate } from '../types/playbook-maintenance';
import { ToolRetrievalService } from './ToolRetrievalService';
import { LLMManager } from '../core/LLMManager';
import { TypeVocabularyService } from './TypeVocabularyService';
import { SimilarityService } from './SimilarityService';
import { TypeSignal, TypeVocabulary, MatchingContext } from '../core/playbook/types';
import { logger } from '../utils/logger';

interface LegacyMatchingContext {
  userQuery: string;
  sessionHistory?: string[];
  currentState?: string;
  userProfile?: {
    userId: string;
    preferences?: Record<string, any>;
    pastSuccessPatterns?: string[];
  };
  constraints?: {
    maxSteps?: number;
    timeLimit?: number;
    requiredResources?: string[];
  };
}

export class PlaybookMatcher {
  private static readonly DEFAULT_CONFIG: PlaybookRecommendationConfig = {
    maxRecommendations: 5,
    minMatchScore: 0.5,
    useDynamicTypes: false,
    useSimilarityMatching: true,
    similarityThreshold: 0.7
  };

  private typeVocabularyService: TypeVocabularyService;
  private similarityService: SimilarityService;

  constructor(
    private toolRetrievalService: ToolRetrievalService,
    private llmManager: LLMManager
  ) {
    this.typeVocabularyService = TypeVocabularyService.getInstance();
    this.similarityService = SimilarityService.getInstance();
  }

  /**
   * 匹配最佳Playbook
   */
  async matchPlaybooks(
    context: MatchingContext,
    config: PlaybookRecommendationConfig = PlaybookMatcher.DEFAULT_CONFIG
  ): Promise<PlaybookMatch[]> {
    try {
      // 1. 构建搜索查询
      const searchQuery = this.buildSearchQuery(context);

      // 2. 从向量数据库检索候选Playbook
      const candidates = await this.toolRetrievalService.findRelevantSkills(
        searchQuery,
        20, // 获取更多候选，后续筛选
        0.4
      );

      const playbooks = candidates
        .map(r => this.parsePlaybookFromVector(r.tool))
        .filter((p): p is StrategicPlaybook => p !== null);

      // 3. 过滤无效的Playbook
      // 包含active和archived状态的Playbook
      // - active: 正常检索权重
      // - archived: 降低权重但不排除（个人知识库永久资产）
      // - deprecated: 排除（明确低效）
      const validPlaybooks = playbooks.filter(p => p.status === 'active' || p.status === 'archived');

      // 4. 计算匹配分数
      const matches = await Promise.all(
        validPlaybooks.map(pb => this.calculateMatchScore(pb, context))
      );

      // 5. 排序和筛选
      const sortedMatches = matches
        .filter(m => m.matchScore >= config.minMatchScore)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, config.maxRecommendations);

      logger.info(
        `[PlaybookMatcher] Found ${sortedMatches.length} matches for query: "${context.userQuery.substring(0, 50)}..."`
      );

      // 为每个匹配的Playbook输出激活日志
      sortedMatches.forEach(match => {
        const playbook = match.playbook;
        const successRate = Math.round(playbook.metrics.successRate * 100);
        const playbookName = this.formatPlaybookName(playbook);

        logger.info(`📖 Activated Strategy: ${playbookName} (Success: ${successRate}%)`);
      });

      return sortedMatches;
    } catch (error) {
      logger.error('[PlaybookMatcher] Failed to match playbooks:', error);
      return [];
    }
  }

  /**
   * 查找相似Playbook
   */
  async findSimilarPlaybooks(
    playbookId: string,
    limit: number = 5
  ): Promise<PlaybookMatch[]> {
    try {
      // 获取目标Playbook
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

      const matches = await Promise.all(
        playbooks.map(pb => this.calculateSimilarityScore(pb, target))
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
   * 智能推荐Playbook组合
   */
  async recommendPlaybookSequence(
    context: MatchingContext,
    targetOutcome: string
  ): Promise<{
    sequence: PlaybookMatch[];
    rationale: string;
    estimatedSuccessRate: number;
  }> {
    try {
      // 第一步：获取初始匹配
      // 转换 MatchingContext 为 LegacyMatchingContext 以保持兼容性
      const legacyContext: LegacyMatchingContext = {
        userQuery: context.userQuery,
        sessionHistory: [],
        currentState: '',
        userProfile: undefined,
        constraints: undefined
      };

      const initialMatches = await this.matchPlaybooks(legacyContext, {
        maxRecommendations: 10,
        minMatchScore: 0.4,
        useDynamicTypes: false,
        useSimilarityMatching: true,
        similarityThreshold: 0.7
      });

      if (initialMatches.length === 0) {
        return {
          sequence: [],
          rationale: '未找到合适的Playbook',
          estimatedSuccessRate: 0
        };
      }

      // 第二步：使用LLM分析最佳序列
      const prompt = this.buildSequencePrompt(context, targetOutcome, initialMatches);

      const response = await this.llmManager.chat([
        {
          role: 'user',
          content: prompt
        }
      ], { stream: false });

      const content = (response.choices[0]?.message?.content as string) || '';
      const sequence = this.parseSequenceFromResponse(content, initialMatches);

      // 第三步：计算估计成功率
      const estimatedSuccessRate = this.calculateSequenceSuccessRate(sequence);

      return {
        sequence,
        rationale: this.extractRationale(content as string),
        estimatedSuccessRate
      };

    } catch (error) {
      logger.error('[PlaybookMatcher] Failed to recommend playbook sequence:', error);
      return {
        sequence: [],
        rationale: '分析过程中发生错误',
        estimatedSuccessRate: 0
      };
    }
  }

  // ========== 私有方法 ==========

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
        .map(([k, v]) => `${k}:${v}`)
        .join(' ');
      parts.push(prefStr);
    }

    return parts.join(' ');
  }

  private async calculateMatchScore(
    playbook: StrategicPlaybook,
    context: LegacyMatchingContext
  ): Promise<PlaybookMatch> {
    let score = 0;
    const matchReasons: string[] = [];

    // 检查是否为失败衍生的Playbook（风险规避型）
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

    // 2. 失败衍生Playbook的特殊处理
    if (isFailureDerived) {
      // 风险规避Playbook主要看场景匹配度，而不是成功率
      // 给予更高的上下文匹配权重
      const contextMatch = this.calculateContextMatch(playbook, context);
      score += contextMatch * 0.4; // 风险规避型更看重上下文匹配
      if (contextMatch > 0.6) {
        matchReasons.push('风险规避场景匹配');
      }
    } else {
      // 2. 成功率 (25%) - 仅对常规Playbook
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

    // 失败衍生Playbook的特别标记
    if (isFailureDerived) {
      matchReasons.push('失败经验衍生（风险规避）');
    }

    // archived状态的Playbook应用权重惩罚（但不排除）
    if (playbook.status === 'archived') {
      score *= 0.7; // 降低30%权重，但仍可检索
      matchReasons.push('已归档（降低权重）');
    }

    return {
      playbook,
      matchScore: Math.min(score, 1),
      matchReasons,
      applicableSteps: playbook.actions.map((_, i) => i)
    };
  }

  private async calculateTextSimilarity(text1: string, text2: string): Promise<number> {
    // 简化实现：基于关键词重叠
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private calculateRecencyScore(lastUsed: number): number {
    const daysSinceUsed = (Date.now() - lastUsed) / (24 * 60 * 60 * 1000);
    if (daysSinceUsed === 0) return 1;
    return Math.max(0, 1 - (daysSinceUsed / 365));
  }

  private calculateContextMatch(
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

  private buildSequencePrompt(
    context: MatchingContext,
    targetOutcome: string,
    matches: PlaybookMatch[]
  ): string {
    const playbookList = matches.map((m, i) => `
${i + 1}. ${m.playbook.name}
   描述: ${m.playbook.description}
   成功率: ${(m.playbook.metrics.successRate * 100).toFixed(0)}%
   步骤数: ${m.playbook.actions.length}
   匹配分数: ${(m.matchScore * 100).toFixed(0)}%
`).join('');

    return `
给定以下上下文和候选Playbook，推荐一个最优的执行序列：

用户查询: ${context.userQuery}
目标结果: ${targetOutcome}
${context.domain ? `领域: ${context.domain}` : ''}

候选Playbook:
${playbookList}

请推荐：
1. 最佳执行序列（按顺序编号）
2. 每个Playbook的使用理由
3. 整体估计成功率

请以JSON格式返回：
{
  "sequence": [1, 3, 2], // Playbook编号
  "reasons": ["理由1", "理由2", "理由3"],
  "estimatedSuccessRate": 0.85,
  "rationale": "总体策略说明"
}
`;
  }

  private parseSequenceFromResponse(
    response: string,
    matches: PlaybookMatch[]
  ): PlaybookMatch[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return matches.slice(0, 3);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const sequence = parsed.sequence as number[];

      return sequence
        .map(idx => matches[idx - 1])
        .filter((m): m is PlaybookMatch => m !== undefined);
    } catch (error) {
      logger.error('[PlaybookMatcher] Failed to parse sequence:', error);
      return matches.slice(0, 3);
    }
  }

  private calculateSequenceSuccessRate(sequence: PlaybookMatch[]): number {
    if (sequence.length === 0) return 0;

    // 简化计算：序列成功率 = 各步骤成功率的乘积
    // 实际实现中可能需要更复杂的模型
    const baseRate = sequence[0].playbook.metrics.successRate;
    const complexityPenalty = Math.pow(0.95, sequence.length - 1);

    return Math.min(baseRate * complexityPenalty, 1);
  }

  private extractRationale(response: string): string {
    const rationaleMatch = response.match(/"rationale":\s*"([^"]+)"/);
    return rationaleMatch?.[1] || '基于成功率和上下文匹配的智能推荐';
  }

  private async calculateSimilarityScore(
    playbook: StrategicPlaybook,
    target: StrategicPlaybook
  ): Promise<PlaybookMatch> {
    let score = 0;

    // 领域相似性
    if (playbook.context.domain === target.context.domain) {
      score += 0.4;
    }

    // 复杂度相似性
    if (playbook.context.complexity === target.context.complexity) {
      score += 0.3;
    }

    // 标签重叠
    const tagOverlap = this.calculateTagOverlap(playbook.tags, target.tags);
    score += tagOverlap * 0.3;

    return {
      playbook,
      matchScore: Math.min(score, 1),
      matchReasons: [
        playbook.context.domain === target.context.domain ? '领域匹配' : '',
        `标签重叠 ${(tagOverlap * 100).toFixed(0)}%`
      ].filter(Boolean),
      applicableSteps: playbook.actions.map((_, i) => i)
    };
  }

  private calculateTagOverlap(tags1: string[], tags2: string[]): number {
    const set1 = new Set(tags1);
    const set2 = new Set(tags2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  private parsePlaybookFromVector(tool: any): StrategicPlaybook | null {
    if (tool.metadata?.type !== 'strategic_playbook') {
      return null;
    }

    const metadata = tool.metadata;
    try {
      const playbook: StrategicPlaybook = {
        id: metadata.playbookId,
        name: metadata.name || tool.name,
        description: metadata.description || tool.description,
        type: metadata.type || 'problem_solving',
        version: metadata.version || '1.0.0',
        status: metadata.status || 'active',
        context: {
          domain: metadata.domain || 'general',
          scenario: metadata.scenario || 'unspecified',
          complexity: 'medium',
          stakeholders: []
        },
        trigger: {
          type: 'event',
          condition: 'Automatically extracted from strategic learning'
        },
        actions: metadata.actions || [],
        sourceLearningIds: metadata.sourceLearningIds || [],
        createdAt: metadata.createdAt || Date.now(),
        lastUpdated: Date.now(),
        lastOptimized: metadata.lastOptimized || Date.now(),
        metrics: metadata.metrics || {
          usageCount: 0,
          successRate: 0,
          avgSatisfaction: 0,
          lastUsed: 0,
          avgExecutionTime: 0
        },
        optimizationCount: metadata.optimizationCount || 0,
        parentId: metadata.parentId,
        tags: tool.tags || ['playbook'],
        author: metadata.author || 'auto-extracted',
        reviewers: metadata.reviewers || [],
        type_tags: metadata.type_tags,
        type_confidence: metadata.type_confidence,
        prompt_template_id: metadata.prompt_template_id,
        guidance_level: metadata.guidance_level,
        guidance_steps: metadata.guidance_steps
      };

      return playbook;
    } catch (error) {
      logger.error('[PlaybookMatcher] Failed to parse playbook from vector:', error);
      return null;
    }
  }

  private async getPlaybookById(id: string): Promise<StrategicPlaybook | null> {
    try {
      // 从向量存储中检索
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
   * 格式化Playbook名称为 [领域-具体名称] 的格式
   */
  private formatPlaybookName(playbook: StrategicPlaybook): string {
    // 领域映射：将英文领域转换为中文
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

  // ========== Stage 3: Curator 知识库维护方法 ==========

  /**
   * 🆕 维护 Playbook 知识库（主入口）
   */
  async maintainPlaybookKnowledgeBase(): Promise<{ merged: number; archived: number }> {
    logger.info('[Curator] 开始知识库维护');

    let mergedCount = 0;
    let archivedCount = 0;

    try {
      // 1. 去重与合并
      const duplicates = await this.findDuplicates();
      logger.info(`[Curator] 发现 ${duplicates.length} 对重复 Playbook`);

      for (const pair of duplicates) {
        if (pair.recommendation === 'merge') {
          await this.mergePlaybooks(pair.playbook1, pair.playbook2);
          mergedCount++;
        }
      }

      // 2. 自动归档
      const candidates = await this.findArchiveCandidates();
      logger.info(`[Curator] 发现 ${candidates.length} 个归档候选`);

      for (const candidate of candidates) {
        await this.archivePlaybook(candidate.playbook.id);
        archivedCount++;
      }

      logger.info(`[Curator] 维护完成: 合并 ${mergedCount} 个, 归档 ${archivedCount} 个`);

      return { merged: mergedCount, archived: archivedCount };

    } catch (error: any) {
      logger.error('[Curator] 维护失败', error);
      throw error;
    }
  }

  /**
   * 🆕 查找重复 Playbook
   */
  async findDuplicates(threshold: number = 0.9): Promise<DuplicatePlaybookPair[]> {
    const allPlaybooks = await this.getAllPlaybooks({ status: 'active' });
    const duplicates: DuplicatePlaybookPair[] = [];
    const processed = new Set<string>();

    for (const playbook1 of allPlaybooks) {
      if (processed.has(playbook1.id)) continue;

      // 查找相似 Playbook
      const similar = await this.findSimilarPlaybooks(playbook1.id, 5);

      for (const match of similar) {
        if (match.matchScore >= threshold && !processed.has(match.playbook.id)) {
          duplicates.push({
            playbook1,
            playbook2: match.playbook,
            similarity: match.matchScore,
            recommendation: this.shouldMerge(playbook1, match.playbook) ? 'merge' : 'keep_both'
          });

          processed.add(playbook1.id);
          processed.add(match.playbook.id);
        }
      }
    }

    return duplicates;
  }

  /**
   * 🆕 判断是否应该合并
   */
  private shouldMerge(pb1: StrategicPlaybook, pb2: StrategicPlaybook): boolean {
    // 如果名称完全相同或高度相似（编辑距离 <3），建议合并
    const nameDistance = this.levenshteinDistance(pb1.name, pb2.name);
    if (nameDistance < 3) return true;

    // 如果工具列表相同，建议合并
    const tools1 = new Set(pb1.context.stakeholders || []);
    const tools2 = new Set(pb2.context.stakeholders || []);
    const sameTools = [...tools1].every(t => tools2.has(t)) && [...tools2].every(t => tools1.has(t));
    if (sameTools) return true;

    return false;
  }

  /**
   * 🆕 合并 Playbook
   */
  async mergePlaybooks(pb1: StrategicPlaybook, pb2: StrategicPlaybook): Promise<void> {
    // 保留成功率更高的版本
    const keeper = pb1.metrics.successRate >= pb2.metrics.successRate ? pb1 : pb2;
    const removed = keeper === pb1 ? pb2 : pb1;

    logger.info(`[Curator] 合并 Playbook: 保留 ${keeper.id}, 移除 ${removed.id}`);

    // 合并统计数据
    const mergedMetrics = {
      usageCount: keeper.metrics.usageCount + removed.metrics.usageCount,
      successRate: (
        keeper.metrics.successRate * keeper.metrics.usageCount +
        removed.metrics.successRate * removed.metrics.usageCount
      ) / (keeper.metrics.usageCount + removed.metrics.usageCount),
      avgSatisfaction: (
        (keeper.metrics.avgSatisfaction || 0) * keeper.metrics.usageCount +
        (removed.metrics.avgSatisfaction || 0) * removed.metrics.usageCount
      ) / (keeper.metrics.usageCount + removed.metrics.usageCount),
      lastUsed: Math.max(keeper.metrics.lastUsed, removed.metrics.lastUsed),
      avgExecutionTime: (
        (keeper.metrics.avgExecutionTime || 0) * keeper.metrics.usageCount +
        (removed.metrics.avgExecutionTime || 0) * removed.metrics.usageCount
      ) / (keeper.metrics.usageCount + removed.metrics.usageCount)
    };

    // 合并来源 Trajectory
    const mergedSources = [
      ...(keeper.sourceLearningIds || []),
      ...(removed.sourceLearningIds || [])
    ];

    // 更新保留的 Playbook
    await this.updatePlaybook(keeper.id, {
      metrics: mergedMetrics,
      sourceLearningIds: Array.from(new Set(mergedSources)),
      lastUpdated: Date.now()
    });

    // 删除被移除的 Playbook
    await this.deletePlaybook(removed.id);
  }

  /**
   * 🆕 查找归档候选
   */
  async findArchiveCandidates(): Promise<ArchiveCandidate[]> {
    const allPlaybooks = await this.getAllPlaybooks({ status: 'active' });
    const candidates: ArchiveCandidate[] = [];
    const now = Date.now();

    for (const playbook of allPlaybooks) {
      const daysSinceUsed = (now - playbook.metrics.lastUsed) / (24 * 60 * 60 * 1000);

      // 归档条件: 90 天未使用 AND 成功率 <50%
      if (daysSinceUsed > 90 && playbook.metrics.successRate < 0.5) {
        candidates.push({
          playbook,
          reason: `${Math.round(daysSinceUsed)} 天未使用且成功率 ${(playbook.metrics.successRate * 100).toFixed(1)}%`,
          days_since_last_used: daysSinceUsed,
          success_rate: playbook.metrics.successRate
        });
      }
    }

    return candidates;
  }

  /**
   * 🆕 归档 Playbook
   */
  async archivePlaybook(playbookId: string): Promise<void> {
    await this.updatePlaybook(playbookId, {
      status: 'archived',
      lastUpdated: Date.now()
    });

    logger.info(`[Curator] Playbook 已归档: ${playbookId}`);
  }

  /**
   * 辅助方法：Levenshtein 编辑距离
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  // ========== 辅助方法 ==========

  /**
   * 获取所有 Playbook（带过滤）
   */
  private async getAllPlaybooks(filters?: { status?: string }): Promise<StrategicPlaybook[]> {
    try {
      // 从向量存储中检索所有 Playbook
      const searchResult = await this.toolRetrievalService.findRelevantSkills(
        'strategic_playbook',
        1000,  // 获取大量结果
        0.1    // 低阈值，获取更多候选
      );

      const playbooks = searchResult
        .map(r => this.parsePlaybookFromVector(r.tool))
        .filter((p): p is StrategicPlaybook => p !== null);

      // 应用过滤器
      if (filters?.status) {
        return playbooks.filter(p => p.status === filters.status);
      }

      return playbooks;
    } catch (error) {
      logger.error('[PlaybookMatcher] Failed to get all playbooks:', error);
      return [];
    }
  }

  /**
   * 更新 Playbook
   */
  private async updatePlaybook(playbookId: string, updates: Partial<StrategicPlaybook>): Promise<void> {
    try {
      // TODO: 实现具体的更新逻辑
      // 需要与实际存储系统集成（LanceDB/SQLite）
      logger.debug(`[PlaybookMatcher] Update playbook ${playbookId}`, updates);
    } catch (error) {
      logger.error('[PlaybookMatcher] Failed to update playbook:', error);
      throw error;
    }
  }

  /**
   * 删除 Playbook
   */
  private async deletePlaybook(playbookId: string): Promise<void> {
    try {
      // TODO: 实现具体的删除逻辑
      // 需要与实际存储系统集成（LanceDB/SQLite）
      logger.debug(`[PlaybookMatcher] Delete playbook ${playbookId}`);
    } catch (error) {
      logger.error('[PlaybookMatcher] Failed to delete playbook:', error);
      throw error;
    }
  }

  // ========== 动态类型匹配方法 ==========

  /**
   * 多标签动态匹配 - 支持动态类型标签的智能匹配
   *
   * 该方法通过以下步骤实现动态类型匹配：
   * 1. 从用户查询中提取类型信号
   * 2. 基于类型信号检索候选 Playbook
   * 3. 计算多维度匹配分数（完全匹配、语义相似、共现模式、上下文、频率）
   * 4. 按分数排序并返回最佳匹配
   *
   * @param context 匹配上下文（包含用户查询、域、场景等）
   * @param config 推荐配置（可自定义阈值和参数）
   * @returns 匹配的 Playbook 列表，按分数降序排列
   */
  async matchPlaybooksDynamic(
    context: LegacyMatchingContext,
    config: PlaybookRecommendationConfig = PlaybookMatcher.DEFAULT_CONFIG
  ): Promise<PlaybookMatch[]> {
    try {
      logger.debug('[PlaybookMatcher] 开始动态类型匹配', {
        useDynamicTypes: config.useDynamicTypes
      });

      // 1. 获取动态类型词汇表
      const typeVocabulary = await this.typeVocabularyService.getAllTags();

      if (typeVocabulary.length === 0) {
        logger.warn('[PlaybookMatcher] 类型词汇表为空，使用回退策略');
        return this.fallbackVectorSearchLegacy(context, config);
      }

      // 2. 从查询中提取类型信号
      const typeSignals = await this.extractTypeSignals(context.userQuery, typeVocabulary);

      logger.debug('[PlaybookMatcher] 提取到类型信号', {
        signalCount: typeSignals.size,
        topSignals: Array.from(typeSignals.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([tag, strength]) => `${tag}:${strength.toFixed(2)}`)
      });

      // 3. 基于类型信号检索候选 Playbook
      const typeBasedCandidates = await this.findPlaybooksByTypeSignals(typeSignals);

      logger.debug('[PlaybookMatcher] 基于类型信号检索候选', {
        candidateCount: typeBasedCandidates.length
      });

      if (typeBasedCandidates.length === 0) {
        logger.warn('[PlaybookMatcher] 未找到基于类型信号的候选，使用回退策略');
        return this.fallbackVectorSearchLegacy(context, config);
      }

      // 4. 计算多标签匹配分数
      const matches = await Promise.all(
        typeBasedCandidates.map(pb => this.calculateMultiTagMatchScore(pb, context, typeSignals))
      );

      // 5. 过滤和排序
      const sortedMatches = matches
        .filter(m => m.matchScore >= config.minMatchScore)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, config.maxRecommendations);

      logger.info(
        `[PlaybookMatcher] 动态匹配完成，找到 ${sortedMatches.length} 个匹配结果`
      );

      // 记录匹配详情（改为 debug 级别，避免臃肿）
      sortedMatches.forEach((match, index) => {
        const playbook = match.playbook;
        logger.debug(
          `[PlaybookMatcher] 匹配 #${index + 1}: ${playbook.name} (分数: ${(match.matchScore * 100).toFixed(1)}%)`
        );
      });

      return sortedMatches;

    } catch (error) {
      logger.error('[PlaybookMatcher] 动态匹配失败，使用回退策略', error);
      return this.fallbackVectorSearchLegacy(context, config);
    }
  }

  /**
   * 计算多标签匹配分数 - 支持多维度评分算法
   *
   * 评分维度：
   * 1. 完全匹配 (权重 1.0) - 类型标签完全匹配
   * 2. 语义相似 (权重 0.8) - 标签语义相似
   * 3. 共现模式 (权重 0.6) - 标签共现统计
   * 4. 上下文匹配 (权重 0.2) - 场景、域等上下文
   * 5. 使用频率 (权重 0.1) - Playbook 使用统计
   *
   * @param playbook 待评估的 Playbook
   * @param context 匹配上下文
   * @param typeSignals 从查询中提取的类型信号
   * @returns 包含详细分数的匹配结果
   */
  private async calculateMultiTagMatchScore(
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
    for (const tag of playbookTags) {
      const similarTags = await this.similarityService.getSimilarTags(tag, 0.7);

      for (const similar of similarTags) {
        const similarTagName = similar.tag1 === tag ? similar.tag2 : similar.tag1;
        const signalStrength = typeSignals.get(similarTagName) || 0;

        if (signalStrength > 0.6) {
          const confidence = playbookConfidences[tag] || 0.5;
          const score = signalStrength * confidence * similar.similarity_score * 0.8;
          totalScore += score;
          tagScores.push({ tag, score: score / 0.8, matchType: 'similar' });
          matchReasons.push(`标签 "${tag}" 语义相似 "${similarTagName}" (${(score * 100).toFixed(0)}%)`);
        }
      }
    }

    // 3. 标签共现模式匹配 (权重 0.6)
    const cooccurrenceScore = await this.calculateCooccurrenceScore(playbookTags, typeSignals);
    if (cooccurrenceScore > 0) {
      totalScore += cooccurrenceScore * 0.6;
      matchReasons.push(`标签共现模式匹配 (${(cooccurrenceScore * 100 * 0.6).toFixed(0)}%)`);
    }

    // 4. 上下文匹配 (权重 0.2)
    const contextScore = this.calculateContextMatchLegacy(playbook, context as any) * 0.2;
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
      tagScores
    };
  }

  /**
   * 提取类型信号 - 从用户查询中识别潜在的类型标签
   *
   * 通过以下方式提取信号：
   * 1. 关键词匹配 - 查询与类型关键词的直接匹配
   * 2. 语义分析 - 考虑同义词和相关词
   * 3. 信号强度计算 - 匹配关键词数 / 总关键词数
   *
   * @param query 用户查询文本
   * @param typeVocabulary 类型词汇表
   * @returns 类型信号映射，key 为标签名，value 为信号强度 [0-1]
   */
  private async extractTypeSignals(
    query: string,
    typeVocabulary: TypeVocabulary[]
  ): Promise<Map<string, number>> {
    const signals = new Map<string, number>();
    const queryLower = query.toLowerCase();

    // 分词预处理
    const queryWords = this.tokenizeQuery(queryLower);

    logger.debug('[PlaybookMatcher] 开始提取类型信号', {
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

        logger.debug('[PlaybookMatcher] 类型信号匹配', {
          tag: type.tag_name,
          matchedKeywords,
          signalStrength: signalStrength.toFixed(3)
        });
      }
    }

    return signals;
  }

  /**
   * 基于类型信号检索 Playbook - 智能检索策略
   *
   * 检索策略：
   * 1. 选择信号强度 > 0.5 的强信号标签
   * 2. 取前 5 个最强信号
   * 3. 基于这些标签查询关联的 Playbook
   * 4. 如果没有强信号，回退到向量检索
   *
   * @param typeSignals 类型信号映射
   * @returns 候选 Playbook 列表
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

    logger.debug('[PlaybookMatcher] 强信号标签', {
      strongSignalCount: strongSignals.length,
      tags: strongSignals
    });

    if (strongSignals.length === 0) {
      logger.warn('[PlaybookMatcher] 没有强信号标签，回退到向量检索');
      return await this.fallbackVectorSearch();
    }

    // TODO: 实现基于类型标签的 Playbook 查询
    // 这里需要与实际的存储系统集成
    // 目前使用向量检索作为替代

    logger.debug('[PlaybookMatcher] 基于类型标签查询 Playbook', {
      tagCount: strongSignals.length
    });

    // 回退到向量检索（临时实现）
    return await this.fallbackVectorSearch();
  }

  /**
   * 计算标签共现分数 - 分析标签组合的统计意义
   *
   * 共现分析：
   * 1. 计算 Playbook 中标签两两之间的相似度
   2. 结合类型信号的强度
   3. 得出标签组合的整体分数
   *
   * @param playbookTags Playbook 的标签列表
   * @param typeSignals 类型信号映射
   * @returns 共现分数 [0-1]
   */
  private async calculateCooccurrenceScore(
    playbookTags: string[],
    typeSignals: Map<string, number>
  ): Promise<number> {
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

        try {
          // 获取标签相似度
          const similarity = await this.similarityService.calculateSimilarity(tag1, tag2);
          const signal1 = typeSignals.get(tag1) || 0;
          const signal2 = typeSignals.get(tag2) || 0;

          // 共现分数 = 相似度 * 平均信号强度
          const pairScore = similarity * (signal1 + signal2) / 2;
          totalCooccurrence += pairScore;
          pairCount++;

        } catch (error) {
          logger.warn('[PlaybookMatcher] 计算共现分数失败', {
            tag1,
            tag2,
            error: error instanceof Error ? error.message : 'unknown'
          });
        }
      }
    }

    const cooccurrenceScore = pairCount > 0 ? totalCooccurrence / pairCount : 0;

    logger.debug('[PlaybookMatcher] 标签共现分数', {
      tagCount: playbookTags.length,
      pairCount,
      cooccurrenceScore: cooccurrenceScore.toFixed(3)
    });

    return cooccurrenceScore;
  }

  /**
   * 回退到向量检索 - 当动态类型匹配失败时的备选方案
   *
   * @returns 通过向量检索得到的 Playbook 列表
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
      logger.error('[PlaybookMatcher] 向量检索失败', error);
      return [];
    }
  }

  /**
   * 回退到向量检索（Legacy 版本）- 兼容性方法
   *
   * @param context 匹配上下文
   * @param config 推荐配置
   * @returns 匹配的 Playbook 列表
   */
  private async fallbackVectorSearchLegacy(
    context: MatchingContext,
    config: PlaybookRecommendationConfig
  ): Promise<PlaybookMatch[]> {
    try {
      const searchQuery = this.buildSearchQuery(context as any);
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
        validPlaybooks.map(pb => this.calculateMatchScore(pb, context as any))
      );

      return matches
        .filter(m => m.matchScore >= config.minMatchScore)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, config.maxRecommendations);

    } catch (error) {
      logger.error('[PlaybookMatcher] Legacy 向量检索失败', error);
      return [];
    }
  }

  /**
   * 分词查询文本 - 提取关键词
   *
   * @param query 查询文本
   * @returns 分词结果
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
   * 兼容性方法：保持原有上下文匹配逻辑
   * @deprecated 使用 calculateMultiTagMatchScore 替代
   */
  private calculateContextMatchLegacy(
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
}
