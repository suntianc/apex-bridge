/**
 * Playbook管理器
 * 负责Playbook的CRUD、版本管理、生命周期管理
 */

import { StrategicPlaybook, PlaybookExecution, PlaybookOptimization, TrajectoryCluster, BatchExtractionOptions } from '../types/playbook';
import type { Trajectory } from '../types/ace-core.d.ts';
import { AceStrategyManager, StrategicLearning } from './AceStrategyManager';
import { ToolRetrievalService } from './ToolRetrievalService';
import { LLMManager } from '../core/LLMManager';
import { logger } from '../utils/logger';
import { Cache, createCache } from '../utils/cache';

export class PlaybookManager {
  private static readonly PLAYBOOK_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时
  private static readonly MAX_PLAYBOOKS_PER_USER = 1000;
  private static readonly MIN_SUCCESS_RATE = 0.6; // 60%成功率阈值

  // Playbook内存缓存
  private playbookCache: Cache<Map<string, StrategicPlaybook>>;

  // 执行记录缓存
  private executionCache: Cache<Map<string, PlaybookExecution[]>>;

  // 正在处理的提炼任务（防止重复）
  private activeExtractions: Set<string> = new Set();

  constructor(
    private strategyManager: AceStrategyManager,
    private toolRetrievalService: ToolRetrievalService,
    private llmManager: LLMManager
  ) {
    this.playbookCache = createCache<Map<string, StrategicPlaybook>>(
      PlaybookManager.PLAYBOOK_CACHE_TTL,
      PlaybookManager.MAX_PLAYBOOKS_PER_USER
    );

    this.executionCache = createCache<Map<string, PlaybookExecution[]>>(
      PlaybookManager.PLAYBOOK_CACHE_TTL,
      PlaybookManager.MAX_PLAYBOOKS_PER_USER
    );

    logger.info('[PlaybookManager] Initialized with caching');
  }

  /**
   * 创建新Playbook
   */
  async createPlaybook(playbook: Omit<StrategicPlaybook, 'id' | 'createdAt' | 'lastUpdated'>): Promise<StrategicPlaybook> {
    const newPlaybook: StrategicPlaybook = {
      ...playbook,
      id: this.generatePlaybookId(),
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      lastOptimized: Date.now(),
      metrics: {
        successRate: 0,
        usageCount: 0,
        averageOutcome: 0,
        lastUsed: 0,
        timeToResolution: 0,
        userSatisfaction: 0
      }
    };

    // 存储到LanceDB
    await this.storePlaybookToVectorDB(newPlaybook);

    // 更新缓存
    const cache = this.playbookCache.get('default') || new Map();
    cache.set(newPlaybook.id, newPlaybook);
    this.playbookCache.set('default', cache);

    logger.info(`[PlaybookManager] Created playbook: ${newPlaybook.name} (${newPlaybook.id})`);
    return newPlaybook;
  }

  /**
   * 获取Playbook
   */
  async getPlaybook(id: string): Promise<StrategicPlaybook | null> {
    const cache = this.playbookCache.get('default');
    if (cache?.has(id)) {
      return cache.get(id)!;
    }

    // 从向量数据库检索
    const searchResult = await this.toolRetrievalService.findRelevantSkills(
      `playbook ${id}`,
      1,
      0.99
    );

    if (searchResult.length > 0) {
      const playbook = this.parsePlaybookFromVector(searchResult[0].tool);
      if (playbook) {
        const cache = this.playbookCache.get('default') || new Map();
        cache.set(id, playbook);
        this.playbookCache.set('default', cache);
        return playbook;
      }
    }

    return null;
  }

  /**
   * 更新Playbook
   */
  async updatePlaybook(id: string, updates: Partial<StrategicPlaybook>): Promise<StrategicPlaybook | null> {
    const playbook = await this.getPlaybook(id);
    if (!playbook) {
      return null;
    }

    const updated: StrategicPlaybook = {
      ...playbook,
      ...updates,
      id, // 保持ID不变
      createdAt: playbook.createdAt, // 保持创建时间不变
      lastUpdated: Date.now()
    };

    // 如果是版本更新，创建新版本
    if (updates.version && updates.version !== playbook.version) {
      updated.parentId = playbook.parentId || playbook.id;
      updated.optimizationCount = playbook.optimizationCount + 1;
    }

    // 存储到向量数据库
    await this.storePlaybookToVectorDB(updated);

    // 更新缓存
    const cache = this.playbookCache.get('default') || new Map();
    cache.set(id, updated);
    this.playbookCache.set('default', cache);

    logger.info(`[PlaybookManager] Updated playbook: ${id} to version ${updated.version}`);
    return updated;
  }

  /**
   * 记录Playbook执行
   */
  async recordExecution(execution: Omit<PlaybookExecution, 'completedAt'>): Promise<void> {
    const fullExecution: PlaybookExecution = {
      ...execution,
      completedAt: Date.now()
    };

    // 存储执行记录
    const cache = this.executionCache.get(execution.playbookId) || new Map();
    const executions = cache.get(execution.sessionId) || [];
    executions.push(fullExecution);
    cache.set(execution.sessionId, executions);
    this.executionCache.set(execution.playbookId, cache);

    // 更新Playbook指标
    await this.updatePlaybookMetrics(execution.playbookId, fullExecution);

    logger.debug(`[PlaybookManager] Recorded execution for playbook: ${execution.playbookId}`);
  }

  /**
   * 🆕 记录Playbook强制执行情况（Stage 3.5）
   * 使用指数移动平均更新成功率
   */
  async recordExecutionForced(params: {
    playbookId: string;
    sessionId: string;
    outcome: 'success' | 'failure';
    duration: number;
    reason?: string;
  }): Promise<void> {
    const playbook = await this.getPlaybook(params.playbookId);
    if (!playbook) return;

    // 使用指数移动平均更新成功率
    const alpha = 0.2;  // 学习率
    const newSuccessRate = alpha * (params.outcome === 'success' ? 1 : 0)
                         + (1 - alpha) * playbook.metrics.successRate;

    // 更新平均执行时间
    const newAvgDuration = (playbook.metrics.timeToResolution * playbook.metrics.usageCount + params.duration)
                         / (playbook.metrics.usageCount + 1);

    await this.updatePlaybook(params.playbookId, {
      metrics: {
        successRate: newSuccessRate,
        usageCount: playbook.metrics.usageCount + 1,
        timeToResolution: newAvgDuration,
        lastUsed: Date.now(),
        // 保持其他指标不变
        averageOutcome: playbook.metrics.averageOutcome,
        userSatisfaction: playbook.metrics.userSatisfaction
      },
      updatedAt: new Date()
    } as any);

    logger.info(
      `[PlaybookManager] 记录强制执行: ${params.playbookId} → ${params.outcome} ` +
      `(新成功率: ${(newSuccessRate * 100).toFixed(1)}%)`
    );

    // 如果成功率下降到阈值以下，触发反思
    if (newSuccessRate < 0.6 && playbook.metrics.usageCount > 10) {
      logger.warn(`[PlaybookManager] Playbook ${playbook.name} 成功率过低，建议重新评估`);
      // TODO: 入队 REFLECT 任务
    }
  }

  /**
   * 搜索Playbook
   */
  async searchPlaybooks(
    query: string,
    options?: {
      type?: string;
      minSuccessRate?: number;
      limit?: number;
    }
  ): Promise<StrategicPlaybook[]> {
    const searchQuery = options?.type
      ? `${query} type:${options.type}`
      : query;

    const searchResult = await this.toolRetrievalService.findRelevantSkills(
      searchQuery,
      options?.limit || 10,
      0.5
    );

    const playbooks = searchResult
      .map(r => this.parsePlaybookFromVector(r.tool))
      .filter((p): p is StrategicPlaybook => p !== null);

    // 过滤成功率
    const filtered = options?.minSuccessRate
      ? playbooks.filter(p => p.metrics.successRate >= options.minSuccessRate!)
      : playbooks;

    // 按成功率和使用次数排序
    return filtered.sort((a, b) => {
      const scoreA = a.metrics.successRate * 0.7 + (a.metrics.usageCount / 100) * 0.3;
      const scoreB = b.metrics.successRate * 0.7 + (b.metrics.usageCount / 100) * 0.3;
      return scoreB - scoreA;
    });
  }

  /**
   * 从战略学习提炼Playbook
   */
  async extractPlaybookFromLearning(
    learning: StrategicLearning,
    context?: string
  ): Promise<StrategicPlaybook | null> {
    // 防止重复提炼
    if (this.activeExtractions.has(learning.id)) {
      logger.debug(`[PlaybookManager] Extraction already in progress for: ${learning.id}`);
      return null;
    }

    this.activeExtractions.add(learning.id);

    try {
      // 使用LLM分析学习内容，提炼可复用的模式
      const prompt = this.buildExtractionPrompt(learning, context);

      const response = await this.llmManager.chat([
        {
          role: 'user',
          content: prompt
        }
      ], { stream: false });

      const content = (response.choices[0]?.message?.content as string) || '';
      const extracted = this.parsePlaybookFromLLMResponse(content, learning);

      if (extracted) {
        const playbook = await this.createPlaybook(extracted);
        logger.info(`[PlaybookManager] Extracted playbook from learning: ${learning.id}`);
        return playbook;
      }

      return null;
    } catch (error) {
      logger.error(`[PlaybookManager] Failed to extract playbook from learning ${learning.id}:`, error);
      return null;
    } finally {
      this.activeExtractions.delete(learning.id);
    }
  }

  /**
   * 自动优化Playbook
   */
  async optimizePlaybook(playbookId: string): Promise<PlaybookOptimization[]> {
    const playbook = await this.getPlaybook(playbookId);
    if (!playbook) {
      return [];
    }

    const optimizations: PlaybookOptimization[] = [];

    // 基于成功率分析
    if (playbook.metrics.successRate < PlaybookManager.MIN_SUCCESS_RATE) {
      optimizations.push({
        playbookId,
        type: 'trigger_refinement',
        suggestion: '优化触发条件，提高匹配的准确性',
        rationale: `当前成功率 ${(playbook.metrics.successRate * 100).toFixed(1)}% 低于阈值 ${(PlaybookManager.MIN_SUCCESS_RATE * 100)}%`,
        expectedImprovement: {
          successRateDelta: 0.15,
          usageIncreaseEstimate: 0.3
        },
        confidence: 0.8
      });
    }

    // 基于使用频率分析
    const daysSinceLastUsed = (Date.now() - playbook.metrics.lastUsed) / (24 * 60 * 60 * 1000);
    if (daysSinceLastUsed > 30 && playbook.metrics.usageCount < 5) {
      optimizations.push({
        playbookId,
        type: 'context_expansion',
        suggestion: '扩展应用场景，增加使用频率',
        rationale: `超过30天未使用，且使用次数仅${playbook.metrics.usageCount}次`,
        expectedImprovement: {
          successRateDelta: 0.05,
          usageIncreaseEstimate: 0.5
        },
        confidence: 0.6
      });
    }

    // 基于执行效率分析
    const avgSteps = playbook.actions.length;
    const avgExecutedSteps = playbook.metrics.averageOutcome * avgSteps / 10;
    if (avgExecutedSteps < avgSteps * 0.6) {
      optimizations.push({
        playbookId,
        type: 'action_update',
        suggestion: '简化操作步骤，提高执行效率',
        rationale: `平均执行步骤 ${avgExecutedSteps.toFixed(1)} 远少于总步骤 ${avgSteps}`,
        expectedImprovement: {
          successRateDelta: 0.1,
          usageIncreaseEstimate: 0.2
        },
        confidence: 0.7
      });
    }

    logger.info(`[PlaybookManager] Generated ${optimizations.length} optimization suggestions for ${playbookId}`);
    return optimizations;
  }

  /**
   * 获取Playbook统计信息
   */
  getPlaybookStats(): {
    totalPlaybooks: number;
    activePlaybooks: number;
    deprecatedPlaybooks: number;
    averageSuccessRate: number;
    mostUsedType: string;
  } {
    const cache = this.playbookCache.get('default');
    const playbooks = cache ? Array.from(cache.values()) : [];

    const stats = {
      totalPlaybooks: playbooks.length,
      activePlaybooks: playbooks.filter(p => p.status === 'active').length,
      deprecatedPlaybooks: playbooks.filter(p => p.status === 'deprecated').length,
      averageSuccessRate: playbooks.length > 0
        ? playbooks.reduce((sum, p) => sum + p.metrics.successRate, 0) / playbooks.length
        : 0,
      mostUsedType: this.getMostUsedPlaybookType(playbooks)
    };

    return stats;
  }

  // ========== 私有方法 ==========

  private generatePlaybookId(): string {
    return `pb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async storePlaybookToVectorDB(playbook: StrategicPlaybook): Promise<void> {
    const description = `Playbook: ${playbook.name}\nType: ${playbook.type}\nContext: ${playbook.context.scenario}\nActions: ${playbook.actions.length} steps`;

    await this.toolRetrievalService.indexSkill({
      name: playbook.id,
      description,
      tags: ['playbook', playbook.type, ...playbook.tags],
      path: `playbook://${playbook.id}`,
      metadata: {
        type: 'strategic_playbook',
        playbookId: playbook.id,
        name: playbook.name,
        description: playbook.description,
        playbookType: playbook.type,
        version: playbook.version,
        status: playbook.status,
        domain: playbook.context.domain,
        scenario: playbook.context.scenario,
        actions: playbook.actions,
        sourceLearningIds: playbook.sourceLearningIds,
        metrics: playbook.metrics,
        optimizationCount: playbook.optimizationCount,
        parentId: playbook.parentId,
        lastOptimized: playbook.lastOptimized,
        author: playbook.author,
        reviewers: playbook.reviewers,
        createdAt: playbook.createdAt,
        lastUpdated: playbook.lastUpdated
      }
    });
  }

  private parsePlaybookFromVector(tool: any): StrategicPlaybook | null {
    if (tool.metadata?.type !== 'strategic_playbook') {
      return null;
    }

    const metadata = tool.metadata;
    try {
      // 从metadata重建完整的playbook对象
      const playbook: StrategicPlaybook = {
        id: metadata.playbookId,
        name: tool.name,
        description: tool.description,
        type: metadata.playbookType || 'problem_solving',
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
          successRate: 0,
          usageCount: 0,
          averageOutcome: 0,
          lastUsed: 0,
          timeToResolution: 0,
          userSatisfaction: 0
        },
        optimizationCount: metadata.optimizationCount || 0,
        parentId: metadata.parentId,
        tags: tool.tags || ['playbook'],
        author: metadata.author || 'auto-extracted',
        reviewers: metadata.reviewers || []
      };

      return playbook;
    } catch (error) {
      logger.error('[PlaybookManager] Failed to parse playbook from vector:', error);
      return null;
    }
  }

  private buildExtractionPrompt(learning: StrategicLearning, context?: string): string {
    return `
分析以下战略学习内容，提炼出可复用的Playbook：

学习摘要: ${learning.summary}
学习要点: ${learning.learnings.join('; ')}
结果: ${learning.outcome}
${context ? `\n上下文: ${context}` : ''}

请提炼出以下信息（JSON格式）：
{
  "name": "Playbook名称（简洁有力）",
  "description": "详细描述（1-2句话）",
  "type": "playbook类型（growth/crisis/negotiation/problem_solving/product_launch/customer_success）",
  "context": {
    "domain": "应用领域",
    "scenario": "具体场景",
    "complexity": "low/medium/high",
    "stakeholders": ["角色1", "角色2"]
  },
  "trigger": {
    "type": "event/state/pattern",
    "condition": "触发条件描述",
    "threshold": 0.8
  },
  "actions": [
    {
      "step": 1,
      "description": "具体行动描述",
      "expectedOutcome": "预期结果",
      "resources": ["资源1", "资源2"]
    }
  ],
  "tags": ["标签1", "标签2"],
  "rationale": "提炼理由和价值"
}
`;
  }

  private parsePlaybookFromLLMResponse(
    response: string,
    learning: StrategicLearning
  ): Omit<StrategicPlaybook, 'id' | 'createdAt' | 'lastUpdated'> | null {
    try {
      // 提取JSON部分
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        name: parsed.name,
        description: parsed.description,
        type: parsed.type,
        version: '1.0.0',
        status: 'active',
        context: parsed.context,
        trigger: parsed.trigger,
        actions: parsed.actions,
        sourceLearningIds: [learning.id],
        lastOptimized: Date.now(),
        optimizationCount: 0,
        metrics: {
          successRate: learning.outcome === 'success' ? 1 : 0,
          usageCount: 0,
          averageOutcome: learning.outcome === 'success' ? 8 : 3,
          lastUsed: 0,
          timeToResolution: 0,
          userSatisfaction: 0
        },
        tags: parsed.tags || [],
        author: 'auto-extracted',
        reviewers: []
      };
    } catch (error) {
      logger.error('[PlaybookManager] Failed to parse LLM response:', error);
      return null;
    }
  }

  private async updatePlaybookMetrics(
    playbookId: string,
    execution: PlaybookExecution
  ): Promise<void> {
    const playbook = await this.getPlaybook(playbookId);
    if (!playbook) {
      return;
    }

    const newMetrics = {
      ...playbook.metrics,
      usageCount: playbook.metrics.usageCount + 1,
      lastUsed: Date.now()
    };

    // 计算新的成功率
    const executions = this.executionCache.get(playbookId);
    if (executions) {
      const allExecutions = Array.from(executions.values()).flat();
      const successCount = allExecutions.filter(e => e.outcome === 'success').length;
      newMetrics.successRate = successCount / allExecutions.length;
    }

    await this.updatePlaybook(playbookId, { metrics: newMetrics });
  }

  private getMostUsedPlaybookType(playbooks: StrategicPlaybook[]): string {
    const typeCount: Record<string, number> = {};
    playbooks.forEach(p => {
      typeCount[p.type] = (typeCount[p.type] || 0) + 1;
    });

    return Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';
  }

  // ========== Stage 2: 批量聚类提取方法 ==========

  /**
   * 🆕 批量聚类提取 Playbook
   */
  async batchExtractPlaybooks(
    trajectories: Trajectory[],
    options: Partial<BatchExtractionOptions> = {}
  ): Promise<StrategicPlaybook[]> {
    const config: BatchExtractionOptions = {
      minClusterSize: options.minClusterSize || 3,
      minSimilarity: options.minSimilarity || 0.7,
      maxClusters: options.maxClusters || 10,
      lookbackDays: options.lookbackDays || 7
    };

    logger.info(`[Generator] 批量提取开始: ${trajectories.length} 个 Trajectory`);

    // 1. 聚类 Trajectory
    const clusters = this.clusterTrajectories(trajectories, config);

    logger.info(`[Generator] 聚类完成: ${clusters.length} 个簇`);

    // 2. 过滤小簇
    const validClusters = clusters.filter(c => c.trajectories.length >= config.minClusterSize);

    logger.info(`[Generator] 有效簇数量: ${validClusters.length} (>=${config.minClusterSize} 个样本)`);

    // 3. 每个簇提取通用 Playbook
    const playbooks: StrategicPlaybook[] = [];

    for (const cluster of validClusters.slice(0, config.maxClusters)) {
      try {
        const playbook = await this.extractFromCluster(cluster);
        playbooks.push(playbook);

        // 持久化
        await this.createPlaybook(playbook);

        logger.info(`[Generator] 从簇 ${cluster.cluster_id} 提取 Playbook: ${playbook.name}`);
      } catch (error: any) {
        logger.error(`[Generator] 簇 ${cluster.cluster_id} 提取失败`, error);
      }
    }

    return playbooks;
  }

  /**
   * 聚类 Trajectory（基于关键词）
   */
  private clusterTrajectories(
    trajectories: Trajectory[],
    config: BatchExtractionOptions
  ): TrajectoryCluster[] {
    const clusters: TrajectoryCluster[] = [];

    // 简单聚类算法：基于用户输入的关键词重叠
    const processed = new Set<string>();

    for (const trajectory of trajectories) {
      if (processed.has(trajectory.task_id)) continue;

      const keywords = this.extractKeywords(trajectory.user_input);
      const similarTrajectories: Trajectory[] = [trajectory];
      processed.add(trajectory.task_id);

      // 查找相似 Trajectory
      for (const other of trajectories) {
        if (processed.has(other.task_id)) continue;

        const otherKeywords = this.extractKeywords(other.user_input);
        const similarity = this.calculateKeywordSimilarity(keywords, otherKeywords);

        if (similarity >= config.minSimilarity) {
          similarTrajectories.push(other);
          processed.add(other.task_id);
        }
      }

      // 如果簇足够大，创建聚类
      if (similarTrajectories.length >= config.minClusterSize) {
        const commonTools = this.extractCommonTools(similarTrajectories);
        const commonKeywords = this.extractCommonKeywords(similarTrajectories);

        clusters.push({
          cluster_id: `cluster-${clusters.length + 1}`,
          trajectories: similarTrajectories,
          common_keywords: commonKeywords,
          common_tools: commonTools,
          representative_input: trajectory.user_input,  // 使用第一个作为代表
          confidence: this.calculateClusterConfidence(similarTrajectories)
        });
      }
    }

    return clusters;
  }

  /**
   * 从簇中提取 Playbook
   */
  private async extractFromCluster(cluster: TrajectoryCluster): Promise<StrategicPlaybook> {
    // 使用 LLM 分析簇中的共性
    const prompt = this.buildClusterExtractionPrompt(cluster);

    const response = await this.llmManager.chat([
      { role: 'user', content: prompt }
    ], { stream: false });

    const content = (response.choices[0]?.message?.content as string) || '';
    const extracted = this.parsePlaybookFromLLMResponse(content, {
      id: 'cluster-extraction',
      summary: `从 ${cluster.trajectories.length} 个相似任务中提取的通用模式`,
      learnings: cluster.common_keywords,
      outcome: 'success',
      timestamp: Date.now()
    } as StrategicLearning);

    // 增强 Playbook 信息
    const playbook: StrategicPlaybook = {
      ...extracted,
      id: this.generatePlaybookId(),
      context: {
        ...extracted.context,
        domain: extracted.context?.domain || 'general',
        scenario: extracted.context?.scenario || cluster.representative_input,
        complexity: extracted.context?.complexity || 'medium',
        stakeholders: extracted.context?.stakeholders || []
      },
      metrics: {
        successRate: 0.8,  // 初始值基于簇大小
        usageCount: 0,
        averageOutcome: 8,
        lastUsed: 0,
        timeToResolution: this.calculateAvgDuration(cluster.trajectories),
        userSatisfaction: 7
      },
      sourceTrajectoryIds: cluster.trajectories.map(t => t.task_id),
      tags: [...(extracted.tags || []), 'batch-extracted', ...cluster.common_keywords],
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };

    return playbook;
  }

  /**
   * 构建聚类提取 Prompt
   */
  private buildClusterExtractionPrompt(cluster: TrajectoryCluster): string {
    const examples = cluster.trajectories.slice(0, 5).map((t, i) => `
示例 ${i + 1}:
用户输入: ${t.user_input}
执行步骤: ${t.steps.map(s => s.action).join(' → ')}
最终结果: ${t.final_result}
    `).join('\n');

    return `
分析以下 ${cluster.trajectories.length} 个成功任务，提取可复用的通用模式：

${examples}

共性特征:
- 常用工具: ${cluster.common_tools.join(', ')}
- 关键词: ${cluster.common_keywords.join(', ')}

请输出 JSON 格式的 Playbook：
{
  "name": "任务名称",
  "description": "简要描述",
  "type": "problem_solving",
  "context": {
    "domain": "应用领域",
    "scenario": "具体场景",
    "complexity": "low/medium/high",
    "stakeholders": []
  },
  "trigger": {
    "type": "pattern",
    "condition": "触发条件（基于关键词）"
  },
  "actions": [
    {
      "step": 1,
      "description": "步骤描述",
      "expectedOutcome": "预期结果",
      "resources": []
    }
  ],
  "tags": ["标签1", "标签2"],
  "rationale": "提炼理由和价值"
}
`;
  }

  /**
   * 提取关键词（辅助方法）
   */
  private extractKeywords(text: string): string[] {
    // 简单分词 + 停用词过滤
    const stopWords = new Set(['的', '了', '在', '是', '和', '与', '及', '等', 'the', 'a', 'an', 'and', 'or']);

    // 先按标点符号和空格分割
    const segments = text
      .toLowerCase()
      .replace(/[，。？！；：、,\.!?;:\s]+/g, ' ')
      .split(' ')
      .filter(s => s.length > 0);

    // 从每个片段中提取关键词
    const words: string[] = [];
    segments.forEach(segment => {
      // 匹配2-4个连续的中文字符
      const chineseMatches = segment.match(/[\u4e00-\u9fa5]{2,4}/g);
      if (chineseMatches) {
        words.push(...chineseMatches);
      }

      // 匹配英文字符串（长度>1）
      const englishMatches = segment.match(/[a-z0-9]{2,}/g);
      if (englishMatches) {
        words.push(...englishMatches);
      }
    });

    // 过滤停用词和短词
    return Array.from(new Set(words))
      .filter(w => w.length > 1 && !stopWords.has(w));
  }

  /**
   * 计算关键词相似度（Jaccard 系数）
   */
  private calculateKeywordSimilarity(keywords1: string[], keywords2: string[]): number {
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);

    const intersection = new Set([...set1].filter(k => set2.has(k)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * 提取簇中常用工具
   */
  private extractCommonTools(trajectories: Trajectory[]): string[] {
    const toolCounts = new Map<string, number>();

    trajectories.forEach(t => {
      t.steps.forEach(step => {
        if (step.tool_details?.tool_name) {
          const toolName = step.tool_details.tool_name;
          toolCounts.set(toolName, (toolCounts.get(toolName) || 0) + 1);
        }
      });
    });

    // 返回出现频率 >50% 的工具
    const threshold = trajectories.length * 0.5;
    return Array.from(toolCounts.entries())
      .filter(([_, count]) => count >= threshold)
      .map(([tool, _]) => tool);
  }

  /**
   * 提取簇中常用关键词
   */
  private extractCommonKeywords(trajectories: Trajectory[]): string[] {
    const keywordCounts = new Map<string, number>();

    trajectories.forEach(t => {
      const keywords = this.extractKeywords(t.user_input);
      keywords.forEach(kw => {
        keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
      });
    });

    // 返回出现频率前 5 的关键词
    return Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([kw, _]) => kw);
  }

  /**
   * 计算簇置信度
   */
  private calculateClusterConfidence(trajectories: Trajectory[]): number {
    // 基于簇大小：3 个样本 = 60%，10 个及以上 = 100%
    return Math.min(0.6 + (trajectories.length - 3) * 0.057, 1.0);
  }

  /**
   * 计算平均执行时间
   */
  private calculateAvgDuration(trajectories: Trajectory[]): number {
    const total = trajectories.reduce((sum, t) => sum + t.duration_ms, 0);
    return Math.round(total / trajectories.length);
  }
}
