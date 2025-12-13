/**
 * Playbook管理器
 * 负责Playbook的CRUD、版本管理、生命周期管理
 */

import { StrategicPlaybook, PlaybookExecution, PlaybookOptimization } from '../types/playbook';
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

      const content = response.choices[0]?.message?.content || '';
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
        version: playbook.version,
        status: playbook.status,
        metrics: playbook.metrics,
        createdAt: playbook.createdAt
      }
    });
  }

  private parsePlaybookFromVector(tool: any): StrategicPlaybook | null {
    if (tool.metadata?.type !== 'strategic_playbook') {
      return null;
    }

    // 这里需要从metadata重建完整的playbook对象
    // 实际实现中可能需要额外的查询
    return null; // 简化处理
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
}
