/**
 * PlaybookCurator - Playbook 知识库维护者
 *
 * 负责 Playbook 知识库的管理和维护，包括：
 * - 去重与合并
 * - 自动归档低效 Playbook
 * - 查找重复项
 * - 维护 Playbook 质量
 */

import { StrategicPlaybook, PlaybookMetrics } from '../../core/playbook/types';
import { ToolRetrievalService } from '../ToolRetrievalService';
import { SimilarityService } from '../SimilarityService';
import { logger } from '../../utils/logger';
import {
  IPlaybookCurator,
  CuratorResult,
  DuplicateInfo,
  ArchiveCandidate,
} from './PlaybookMatcher.types';

/**
 * Playbook Curator 实现
 * 负责知识库维护和管理
 */
export class PlaybookCurator implements IPlaybookCurator {
  private toolRetrievalService: ToolRetrievalService;
  private similarityService: SimilarityService;

  constructor(
    toolRetrievalService: ToolRetrievalService,
    similarityService: SimilarityService
  ) {
    this.toolRetrievalService = toolRetrievalService;
    this.similarityService = similarityService;
  }

  /**
   * 维护 Playbook 知识库（主入口）
   *
   * 执行流程：
   * 1. 查找并合并重复的 Playbook
   * 2. 归档低效的 Playbook
   * 3. 返回维护结果统计
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
        if (pair.suggestedAction === 'merge') {
          const playbook1 = await this.getPlaybookById(pair.playbookId);
          const playbook2 = await this.getPlaybookById(pair.duplicateId);

          if (playbook1 && playbook2) {
            await this.mergePlaybooks(playbook1, playbook2);
            mergedCount++;
          }
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

    } catch (error: unknown) {
      logger.error('[Curator] 维护失败', error);
      throw error;
    }
  }

  /**
   * 查找重复 Playbook
   *
   * 使用相似度服务查找相似的 Playbook 对
   */
  async findDuplicates(threshold: number = 0.9): Promise<DuplicateInfo[]> {
    const allPlaybooks = await this.getAllPlaybooks({ status: 'active' });
    const duplicates: DuplicateInfo[] = [];
    const processed = new Set<string>();

    for (const playbook1 of allPlaybooks) {
      if (processed.has(playbook1.id)) continue;

      // 查找相似 Playbook
      const similar = await this.findSimilarPlaybooks(playbook1.id, 5);

      for (const match of similar) {
        if (match.matchScore >= threshold && !processed.has(match.playbook.id)) {
          const shouldMergeResult = this.shouldMerge(playbook1, match.playbook);

          duplicates.push({
            playbookId: playbook1.id,
            duplicateId: match.playbook.id,
            similarity: match.matchScore,
            suggestedAction: shouldMergeResult ? 'merge' : 'keep',
          });

          processed.add(playbook1.id);
          processed.add(match.playbook.id);
        }
      }
    }

    return duplicates;
  }

  /**
   * 合并重复的 Playbook
   *
   * 保留成功率更高的版本，合并统计数据
   */
  async mergePlaybooks(
    pb1: StrategicPlaybook,
    pb2: StrategicPlaybook
  ): Promise<void> {
    // 保留成功率更高的版本
    const keeper = pb1.metrics.successRate >= pb2.metrics.successRate ? pb1 : pb2;
    const removed = keeper === pb1 ? pb2 : pb1;

    logger.info(`[Curator] 合并 Playbook: 保留 ${keeper.id}, 移除 ${removed.id}`);

    // 合并统计数据
    const mergedMetrics = this.mergeMetrics(keeper.metrics, removed.metrics);

    // 合并来源
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
   * 合并指标数据
   */
  private mergeMetrics(
    metrics1: PlaybookMetrics,
    metrics2: PlaybookMetrics
  ): PlaybookMetrics {
    const totalUsage = metrics1.usageCount + metrics2.usageCount;

    if (totalUsage === 0) {
      return metrics1;
    }

    return {
      usageCount: totalUsage,
      successRate: (
        metrics1.successRate * metrics1.usageCount +
        metrics2.successRate * metrics2.usageCount
      ) / totalUsage,
      avgSatisfaction: (
        (metrics1.avgSatisfaction || 0) * metrics1.usageCount +
        (metrics2.avgSatisfaction || 0) * metrics2.usageCount
      ) / totalUsage,
      lastUsed: Math.max(metrics1.lastUsed, metrics2.lastUsed),
      avgExecutionTime: (
        (metrics1.avgExecutionTime || 0) * metrics1.usageCount +
        (metrics2.avgExecutionTime || 0) * metrics2.usageCount
      ) / totalUsage,
    };
  }

  /**
   * 归档不活跃的 Playbook
   *
   * 归档条件：
   * 1. 90 天未使用
   * 2. 成功率低于 50%
   */
  async archiveInactivePlaybooks(daysInactive: number): Promise<number> {
    const candidates = await this.findArchiveCandidates();

    // 过滤符合归档条件的
    const now = Date.now();
    const inactiveCandidates = candidates.filter(c => {
      const daysSinceUsed = (now - c.playbook.metrics.lastUsed) / (24 * 60 * 60 * 1000);
      return daysSinceUsed > daysInactive;
    });

    // 执行归档
    for (const candidate of inactiveCandidates) {
      await this.archivePlaybook(candidate.playbook.id);
    }

    return inactiveCandidates.length;
  }

  /**
   * 查找归档候选
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
   * 归档 Playbook
   */
  async archivePlaybook(playbookId: string): Promise<void> {
    await this.updatePlaybook(playbookId, {
      status: 'archived',
      lastUpdated: Date.now()
    });

    logger.info(`[Curator] Playbook 已归档: ${playbookId}`);
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 查找相似的 Playbook（内部使用）
   */
  private async findSimilarPlaybooks(
    playbookId: string,
    limit: number
  ): Promise<{ playbook: StrategicPlaybook; matchScore: number }[]> {
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
      const results: { playbook: StrategicPlaybook; matchScore: number }[] = [];

      for (const pb of playbooks) {
        // 领域相似性
        let score = 0;
        if (pb.context.domain === target.context.domain) {
          score += 0.4;
        }

        // 复杂度相似性
        if (pb.context.complexity === target.context.complexity) {
          score += 0.3;
        }

        // 标签重叠
        const tagOverlap = this.calculateTagOverlap(pb.tags, target.tags);
        score += tagOverlap * 0.3;

        results.push({
          playbook: pb,
          matchScore: Math.min(score, 1),
        });
      }

      return results
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, limit);

    } catch (error) {
      logger.error('[Curator] 查找相似 Playbook 失败:', error);
      return [];
    }
  }

  /**
   * 判断是否应该合并两个 Playbook
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
   * 计算 Levenshtein 编辑距离
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

  /**
   * 计算标签重叠度
   */
  private calculateTagOverlap(tags1: string[], tags2: string[]): number {
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
   * 获取所有 Playbook（带过滤）
   */
  private async getAllPlaybooks(
    filters?: { status?: string }
  ): Promise<StrategicPlaybook[]> {
    try {
      // 从向量存储中检索所有 Playbook
      const searchResult = await this.toolRetrievalService.findRelevantSkills(
        'strategic_playbook',
        1000, // 获取大量结果
        0.1   // 低阈值，获取更多候选
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
      logger.error('[Curator] 获取所有 Playbook 失败:', error);
      return [];
    }
  }

  /**
   * 获取单个 Playbook
   */
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
      logger.error('[Curator] 获取 Playbook 失败:', error);
      return null;
    }
  }

  /**
   * 更新 Playbook
   */
  private async updatePlaybook(
    playbookId: string,
    updates: Partial<StrategicPlaybook>
  ): Promise<void> {
    try {
      // TODO: 实现具体的更新逻辑
      // 需要与实际存储系统集成（LanceDB/SQLite）
      logger.debug(`[Curator] Update playbook ${playbookId}`, updates);
    } catch (error) {
      logger.error('[Curator] 更新 Playbook 失败:', error);
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
      logger.debug(`[Curator] Delete playbook ${playbookId}`);
    } catch (error) {
      logger.error('[Curator] 删除 Playbook 失败:', error);
      throw error;
    }
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
      logger.error('[Curator] 解析 Playbook 失败:', error);
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
