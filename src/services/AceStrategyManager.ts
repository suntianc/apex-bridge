/**
 * AceStrategyManager - ACE战略管理器
 * 映射到L2（Global Strategy Layer）- 全球战略层
 *
 * 核心职责：
 * 1. 维护长期战略和世界模型
 * 2. 使用LanceDB统一存储
 * 3. 跨会话的上下文连续性
 * 4. 战略学习与调整
 *
 * 内存管理改进：
 * - 使用TTL缓存管理战略上下文（30天过期）
 * - 限制世界模型更新列表大小
 * - 定期清理过期数据
 */

import { AceIntegrator } from './AceIntegrator';
import { ToolRetrievalService } from './ToolRetrievalService';
import { LLMManager } from '../core/LLMManager';
import type { AceEthicsGuard } from './AceEthicsGuard';
import type { StrategicPlaybook } from '../types/playbook';
import { PlaybookManager } from './PlaybookManager';
import { PlaybookMatcher } from './PlaybookMatcher';
import { logger } from '../utils/logger';
import { Cache, createCache } from '../utils/cache';

export interface StrategicContext {
  userId: string;
  goals: string[];
  preferences: Record<string, any>;
  pastStrategies: StrategicLearning[];
  lastUpdated: number;
}

export interface StrategicLearning {
  id: string;
  summary: string;
  learnings: string[];
  outcome: 'success' | 'failure' | 'partial';
  timestamp: number;
  context?: string;
}

export interface WorldModelUpdate {
  domain: string;
  knowledge: string;
  confidence: number;
  source: string;
  timestamp: number;
}

/**
 * ACE战略管理器（L2全球战略层）
 * 使用项目现有的LanceDB进行长期记忆和战略管理
 */
export class AceStrategyManager {
  // ========== 配置常量 ==========
  private static readonly MAX_CONTEXT_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30天
  private static readonly MAX_WORLD_MODEL_UPDATES = 500; // 世界模型更新最大条目
  private static readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1小时清理一次
  private static readonly MAX_STRATEGIC_CONTEXTS = 1000; // 最大战略上下文数

  /**
   * 战略上下文缓存 - 使用TTL缓存（30天过期）
   */
  private strategicContexts: Cache<StrategicContext>;

  /**
   * 世界模型更新列表（有大小限制）
   */
  private worldModelUpdates: WorldModelUpdate[] = [];

  /**
   * 定期清理定时器
   */
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Playbook管理器 - 自动从战略学习提炼Playbook
   */
  private playbookManager: PlaybookManager;

  /**
   * Playbook匹配引擎 - 智能推荐Playbook
   */
  private playbookMatcher: PlaybookMatcher;

  constructor(
    private aceIntegrator: AceIntegrator,
    private toolRetrievalService: ToolRetrievalService,
    private llmManager: LLMManager
  ) {
    // 初始化TTL缓存（30天过期，1小时清理一次，最多1000个上下文）
    this.strategicContexts = createCache<StrategicContext>(
      AceStrategyManager.MAX_CONTEXT_AGE_MS,
      AceStrategyManager.MAX_STRATEGIC_CONTEXTS
    );

    // 初始化Playbook系统
    this.playbookManager = new PlaybookManager(this, this.toolRetrievalService, this.llmManager);
    this.playbookMatcher = new PlaybookMatcher(this.toolRetrievalService, this.llmManager);

    // 启动定期清理
    this.startPeriodicCleanup();

    logger.info('[AceStrategyManager] Initialized with TTL cache and Playbook system');
  }

  /**
   * 启动定期清理任务
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredContexts();
      this.evaluateAndUpdatePlaybookStatuses();
    }, AceStrategyManager.CLEANUP_INTERVAL_MS);

    // 确保不阻止进程退出
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * 销毁服务，清理资源
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.strategicContexts.destroy();
    this.worldModelUpdates = [];

    logger.info('[AceStrategyManager] Destroyed and cleaned up all resources');
  }

  /**
   * 会话开始时从L2加载战略上下文
   * 使用LanceDB检索用户的历史战略和偏好
   */
  async loadStrategicContext(userId: string): Promise<string> {
    try {
      // 检查TTL缓存
      const cachedContext = this.strategicContexts.get(userId);
      if (cachedContext) {
        logger.debug(`[AceStrategyManager] Loaded strategic context from cache for user: ${userId}`);
        return this.buildContextSummary(cachedContext);
      }

      // 从LanceDB检索历史战略
      const query = `User ${userId} strategic goals plans preferences`;
      const relevantPlans = await this.toolRetrievalService.findRelevantSkills(
        query,
        5, // limit
        0.5 // threshold
      );

      let contextSummary = '';
      if (relevantPlans.length > 0) {
        // 构建历史战略摘要
        const pastStrategies = relevantPlans.map(r =>
          `- ${r.tool.name}: ${r.tool.description}`
        ).join('\n');

        contextSummary = `Historical Strategic Context:\n${pastStrategies}\n\n`;
        logger.info(`[AceStrategyManager] Loaded ${relevantPlans.length} historical strategies for user: ${userId}`);
      } else {
        contextSummary = 'No previous strategic context found.\n\n';
        logger.debug(`[AceStrategyManager] No historical context found for user: ${userId}`);
      }

      // 使用LLM分析并生成战略上下文摘要
      const strategicInsight = await this.generateStrategicInsight(userId, relevantPlans);

      // 更新TTL缓存
      const context: StrategicContext = {
        userId,
        goals: strategicInsight.goals,
        preferences: strategicInsight.preferences,
        pastStrategies: strategicInsight.pastStrategies,
        lastUpdated: Date.now()
      };
      this.strategicContexts.set(userId, context);

      return contextSummary + strategicInsight.summary;
    } catch (error: any) {
      logger.error(`[AceStrategyManager] Failed to load strategic context for user ${userId}:`, error);
      return 'Failed to load strategic context.';
    }
  }

  /**
   * 任务完成后更新L2的世界模型
   * 将学习到的知识和经验存储到LanceDB，形成长期记忆
   */
  async updateWorldModel(
    sessionId: string,
    outcome: { summary: string; learnings: string[]; outcome: 'success' | 'failure' | 'partial' }
  ): Promise<void> {
    try {
      // 🆕 L2长期规划前，先经过L1伦理审查
      const ethicsGuard = this.getEthicsGuard();
      if (ethicsGuard) {
        const reviewResult = await ethicsGuard.reviewPlanning({
          goal: `Update world model with new learning`,
          context: outcome.summary
        });

        if (!reviewResult.approved) {
          logger.warn(`[AceStrategyManager] L1伦理审查未通过，阻止世界模型更新`);

          // 向L1层报告阻止
          await this.aceIntegrator.sendToLayer('ASPIRATIONAL', {
            type: 'WORLD_MODEL_UPDATE_REJECTED',
            content: `世界模型更新被拒绝`,
            metadata: {
              reason: reviewResult.reason,
              suggestions: reviewResult.suggestions,
              summary: outcome.summary,
              timestamp: Date.now()
            }
          });

          return; // 阻止更新
        }

        logger.info('[AceStrategyManager] L1伦理审查通过，允许世界模型更新');
      }

      // 向L2全球战略层报告任务完成
      await this.aceIntegrator.sendToLayer('GLOBAL_STRATEGY', {
        type: 'STATUS_UPDATE',
        content: `Mission accomplished: ${outcome.summary}`,
        metadata: {
          sessionId,
          learnings: outcome.learnings,
          outcome: outcome.outcome,
          timestamp: Date.now()
        }
      });

      // 提取关键战略学习
      const strategicLearning = await this.extractStrategicLearning(outcome);

      // 将战略学习存储到LanceDB（作为特殊"战略技能"）
      await this.storeStrategicLearning(strategicLearning);

      // 更新世界模型
      await this.updateWorldModelFromLearning(outcome);

      // 🆕 自动从战略学习提炼Playbook
      // 成功案例提炼为"最佳实践"Playbook
      if (outcome.outcome === 'success' && outcome.learnings.length > 0) {
        await this.extractPlaybookFromLearning(strategicLearning, sessionId);
      }
      // 失败案例提炼为"避免错误"Playbook（反向学习）
      else if (outcome.outcome === 'failure' && outcome.learnings.length > 0) {
        await this.extractFailurePlaybookFromLearning(strategicLearning, sessionId);
      }

      // 触发L2的战略调整（使用本地事件总线）
      await this.triggerStrategicAdjustment(sessionId, outcome);

      logger.info(`[AceStrategyManager] World model updated with strategic learning from session: ${sessionId}`);
    } catch (error: any) {
      logger.error(`[AceStrategyManager] Failed to update world model:`, error);
    }
  }

  /**
   * 存储战略学习到LanceDB
   * 使用LanceDB作为统一的长期记忆存储
   */
  private async storeStrategicLearning(learning: StrategicLearning): Promise<void> {
    try {
      const learningText = `Strategic Learning: ${learning.summary}\nLearnings: ${learning.learnings.join('; ')}`;

      // 使用ToolRetrievalService作为通用向量存储
      await this.toolRetrievalService.indexSkill({
        name: `strategic_learning_${learning.id}`,
        description: learningText,
        tags: ['strategic', 'learning', 'long-term', learning.outcome],
        path: 'memory://strategic',
        metadata: {
          type: 'strategic_learning',
          id: learning.id,
          summary: learning.summary,
          learnings: learning.learnings,
          outcome: learning.outcome,
          storedAt: Date.now()
        }
      });

      logger.debug(`[AceStrategyManager] Strategic learning stored in LanceDB: ${learning.id}`);
    } catch (error: any) {
      logger.error('[AceStrategyManager] Failed to store strategic learning:', error);
    }
  }

  /**
   * 从LanceDB检索相关战略知识
   * 用于回答复杂问题或进行战略规划
   */
  async retrieveStrategicKnowledge(query: string, userId?: string): Promise<string[]> {
    try {
      let searchQuery = query;
      if (userId) {
        searchQuery = `User ${userId} ${query}`;
      }

      const relevantKnowledge = await this.toolRetrievalService.findRelevantSkills(
        searchQuery,
        10, // limit
        0.6 // threshold
      );

      return relevantKnowledge.map(k =>
        `Knowledge: ${k.tool.description}\nRelevance: ${(k.score * 100).toFixed(2)}%`
      );
    } catch (error: any) {
      logger.error('[AceStrategyManager] Failed to retrieve strategic knowledge:', error);
      return [];
    }
  }

  /**
   * 更新用户的战略目标
   */
  async updateStrategicGoals(userId: string, goals: string[]): Promise<void> {
    try {
      // 获取现有上下文或创建新的
      let context = this.strategicContexts.get(userId);
      if (!context) {
        context = {
          userId,
          goals: [],
          preferences: {},
          pastStrategies: [],
          lastUpdated: 0
        };
      }

      context.goals = goals;
      context.lastUpdated = Date.now();
      this.strategicContexts.set(userId, context);

      // 向L2报告目标更新
      await this.aceIntegrator.sendToLayer('GLOBAL_STRATEGY', {
        type: 'GOAL_UPDATE',
        content: `Strategic goals updated for user: ${userId}`,
        metadata: {
          userId,
          goals,
          timestamp: Date.now()
        }
      });

      logger.info(`[AceStrategyManager] Strategic goals updated for user: ${userId}`);
    } catch (error: any) {
      logger.error(`[AceStrategyManager] Failed to update strategic goals:`, error);
    }
  }

  /**
   * 获取用户的战略摘要
   */
  getStrategicSummary(userId: string): StrategicContext | null {
    return this.strategicContexts.get(userId) || null;
  }

  /**
   * 生成战略洞察
   * 使用LLM分析历史数据，生成有价值的战略洞察
   */
  private async generateStrategicInsight(
    userId: string,
    relevantPlans: any[]
  ): Promise<{
    summary: string;
    goals: string[];
    preferences: Record<string, any>;
    pastStrategies: StrategicLearning[];
  }> {
    try {
      if (relevantPlans.length === 0) {
        return {
          summary: 'This is a new user with no previous strategic context.',
          goals: [],
          preferences: {},
          pastStrategies: []
        };
      }

      // 构建分析提示
      const contextData = relevantPlans.map(r => ({
        name: r.tool.name,
        description: r.tool.description,
        tags: r.tool.tags,
        score: r.score
      }));

      const prompt = `Analyze the following strategic context for user ${userId} and provide a concise summary:

Context Data:
${JSON.stringify(contextData, null, 2)}

Please provide a JSON response with:
{
  "summary": "2-3 sentence summary of user's strategic patterns",
  "goals": ["list of inferred strategic goals"],
  "preferences": {"key": "value"} // user preferences inferred from context
}`;

      // 使用LLM分析
      const response = await this.llmManager.chat([{
        role: 'user',
        content: prompt
      }], { stream: false });

      const content = (response.choices[0]?.message?.content as string) || '{}';

      try {
        const result = JSON.parse(content);
        return {
          summary: result.summary || 'Strategic context analyzed.',
          goals: Array.isArray(result.goals) ? result.goals : [],
          preferences: typeof result.preferences === 'object' ? result.preferences : {},
          pastStrategies: relevantPlans.map((r, i) => ({
            id: `historical_${i}`,
            summary: r.tool.description,
            learnings: [],
            outcome: 'success' as const,
            timestamp: Date.now(),
            context: `Retrieved from vector search with score ${r.score}`
          }))
        };
      } catch (parseError) {
        logger.warn('[AceStrategyManager] Failed to parse LLM response, using fallback');
        return {
          summary: `Found ${relevantPlans.length} historical strategic items.`,
          goals: [],
          preferences: {},
          pastStrategies: []
        };
      }
    } catch (error: any) {
      logger.error('[AceStrategyManager] Failed to generate strategic insight:', error);
      return {
        summary: 'Failed to generate strategic insight.',
        goals: [],
        preferences: {},
        pastStrategies: []
      };
    }
  }

  /**
   * 提取战略学习
   * 从任务结果中提取可泛化的战略知识
   */
  private async extractStrategicLearning(
    outcome: { summary: string; learnings: string[]; outcome: 'success' | 'failure' | 'partial' }
  ): Promise<StrategicLearning> {
    return {
      id: `learning_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      summary: outcome.summary,
      learnings: outcome.learnings,
      outcome: outcome.outcome,
      timestamp: Date.now()
    };
  }

  /**
   * 从学习中更新世界模型
   * 限制世界模型更新列表大小，防止内存泄漏
   */
  private async updateWorldModelFromLearning(
    outcome: { summary: string; learnings: string[]; outcome: string }
  ): Promise<void> {
    try {
      // 提取可泛化的知识
      for (const learning of outcome.learnings) {
        const update: WorldModelUpdate = {
          domain: this.inferDomain(learning),
          knowledge: learning,
          confidence: outcome.outcome === 'success' ? 0.8 : 0.4,
          source: 'task_outcome',
          timestamp: Date.now()
        };

        this.worldModelUpdates.push(update);
      }

      // 保持世界模型更新列表的大小，使用更激进的清理策略
      if (this.worldModelUpdates.length > AceStrategyManager.MAX_WORLD_MODEL_UPDATES) {
        // 保留最新的一半
        const keepCount = Math.floor(AceStrategyManager.MAX_WORLD_MODEL_UPDATES / 2);
        this.worldModelUpdates = this.worldModelUpdates.slice(-keepCount);
        logger.debug(`[AceStrategyManager] Trimmed world model updates to ${keepCount} entries`);
      }

      logger.debug(`[AceStrategyManager] World model updated with ${outcome.learnings.length} knowledge items`);
    } catch (error: any) {
      logger.error('[AceStrategyManager] Failed to update world model:', error);
    }
  }

  /**
   * 触发战略调整
   * 使用本地事件总线通知其他层战略变化
   */
  private async triggerStrategicAdjustment(
    sessionId: string,
    outcome: { summary: string; learnings: string[]; outcome: string }
  ): Promise<void> {
    try {
      // 向全局战略层发送反思触发
      await this.aceIntegrator.sendToLayer('GLOBAL_STRATEGY', {
        type: 'REFLECTION_TRIGGER',
        content: `Strategic adjustment triggered by task outcome: ${outcome.summary}`,
        metadata: {
          sessionId,
          outcome: outcome.outcome,
          learnings: outcome.learnings,
          timestamp: Date.now(),
          triggerType: 'MISSION_COMPLETE'
        }
      });

      logger.debug(`[AceStrategyManager] Strategic adjustment triggered for session: ${sessionId}`);
    } catch (error: any) {
      logger.error('[AceStrategyManager] Failed to trigger strategic adjustment:', error);
    }
  }

  /**
   * 构建上下文摘要
   */
  private buildContextSummary(context: StrategicContext): string {
    const goalsText = context.goals.length > 0
      ? `Goals: ${context.goals.join(', ')}\n`
      : '';

    const strategiesText = context.pastStrategies.length > 0
      ? `Past Strategies: ${context.pastStrategies.length} items\n`
      : '';

    return `Cached Strategic Context:\n${goalsText}${strategiesText}Last Updated: ${new Date(context.lastUpdated).toISOString()}\n`;
  }

  /**
   * 从文本推断知识域
   */
  private inferDomain(text: string): string {
    const domains = {
      'development': ['code', 'programming', 'software', 'api', 'database', 'server'],
      'analysis': ['analyze', 'data', 'report', 'statistics', 'trends'],
      'communication': ['email', 'message', 'chat', 'presentation', 'meeting'],
      'research': ['search', 'find', 'investigate', 'explore', 'study']
    };

    const lowerText = text.toLowerCase();
    for (const [domain, keywords] of Object.entries(domains)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        return domain;
      }
    }

    return 'general';
  }

  /**
   * 获取世界模型统计
   */
  getWorldModelStats(): {
    totalUpdates: number;
    domainDistribution: Record<string, number>;
    averageConfidence: number;
  } {
    const domainDistribution: Record<string, number> = {};
    let totalConfidence = 0;

    for (const update of this.worldModelUpdates) {
      domainDistribution[update.domain] = (domainDistribution[update.domain] || 0) + 1;
      totalConfidence += update.confidence;
    }

    return {
      totalUpdates: this.worldModelUpdates.length,
      domainDistribution,
      averageConfidence: this.worldModelUpdates.length > 0
        ? totalConfidence / this.worldModelUpdates.length
        : 0
    };
  }

  /**
   * 清理过期上下文
   * 由TTL缓存自动处理过期，这里只需要记录统计信息
   */
  async cleanupExpiredContexts(): Promise<void> {
    const beforeSize = this.strategicContexts.size();

    // TTL缓存会自动清理过期项，我们只需要记录
    const afterSize = this.strategicContexts.size();
    const cleanedCount = beforeSize - afterSize;

    if (cleanedCount > 0) {
      logger.info(`[AceStrategyManager] Cleaned up ${cleanedCount} expired strategic contexts`);
    }

    // 同时清理过旧的世界模型更新
    const now = Date.now();
    const oldLength = this.worldModelUpdates.length;
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天

    this.worldModelUpdates = this.worldModelUpdates.filter(
      update => (now - update.timestamp) < maxAge
    );

    const worldModelCleaned = oldLength - this.worldModelUpdates.length;
    if (worldModelCleaned > 0) {
      logger.info(`[AceStrategyManager] Cleaned up ${worldModelCleaned} old world model updates`);
    }
  }

  /**
   * 定期评估并更新Playbook状态
   * 个人知识库管理：只淘汰明确低效的，保留长期资产
   */
  private async evaluateAndUpdatePlaybookStatuses(): Promise<void> {
    try {
      // 获取所有Playbook
      const playbooks = await this.searchPlaybooks('', { limit: 1000 });

      let archivedCount = 0;
      let deprecatedCount = 0;
      let reactivatedCount = 0;

      for (const playbook of playbooks) {
        const shouldArchive = this.shouldArchivePlaybook(playbook);
        const shouldDeprecate = this.shouldDeprecatePlaybook(playbook);
        const shouldReactivate = this.shouldReactivatePlaybook(playbook);

        // 第一步：长期未用的标记为archived（降低权重，不淘汰）
        if (shouldArchive && playbook.status === 'active') {
          await this.playbookManager.updatePlaybook(playbook.id, {
            status: 'archived'
          });
          archivedCount++;
          logger.info(`[AceStrategyManager] Playbook archived (long-term unused): ${playbook.name} (id: ${playbook.id})`);

          // 向L2层报告归档事件
          await this.aceIntegrator.sendToLayer('GLOBAL_STRATEGY', {
            type: 'PLAYBOOK_ARCHIVED',
            content: `Playbook "${playbook.name}" has been archived due to long-term non-use`,
            metadata: {
              playbookId: playbook.id,
              daysSinceLastUsed: (Date.now() - playbook.metrics.lastUsed) / (24 * 60 * 60 * 1000),
              usageCount: playbook.metrics.usageCount,
              reason: '长期未使用（180天+）',
              timestamp: Date.now()
            }
          });
        }
        // 第二步：明确低效的标记为deprecated（真正淘汰）
        else if (shouldDeprecate && playbook.status === 'active') {
          await this.playbookManager.updatePlaybook(playbook.id, {
            status: 'deprecated'
          });
          deprecatedCount++;
          logger.info(`[AceStrategyManager] Playbook deprecated (low performance): ${playbook.name} (id: ${playbook.id})`);

          // 向L2层报告淘汰事件
          await this.aceIntegrator.sendToLayer('GLOBAL_STRATEGY', {
            type: 'PLAYBOOK_DEPRECATED',
            content: `Playbook "${playbook.name}" has been deprecated due to low performance`,
            metadata: {
              playbookId: playbook.id,
              successRate: playbook.metrics.successRate,
              usageCount: playbook.metrics.usageCount,
              reason: this.getDeprecationReason(playbook),
              timestamp: Date.now()
            }
          });
        }
        // 第三步：重新激活archived或deprecated的Playbook
        else if (shouldReactivate && (playbook.status === 'archived' || playbook.status === 'deprecated')) {
          await this.playbookManager.updatePlaybook(playbook.id, {
            status: 'active'
          });
          reactivatedCount++;
          logger.info(`[AceStrategyManager] Playbook reactivated: ${playbook.name} (id: ${playbook.id})`);
        }
      }

      if (archivedCount > 0 || deprecatedCount > 0 || reactivatedCount > 0) {
        logger.info(`[AceStrategyManager] Playbook status update: ${archivedCount} archived, ${deprecatedCount} deprecated, ${reactivatedCount} reactivated`);
      }
    } catch (error) {
      logger.error('[AceStrategyManager] Failed to evaluate playbook statuses:', error);
    }
  }

  /**
   * 判断Playbook是否应该被归档（长期未用）
   * 注意：个人知识库是永久资产，不因时间久远而失效
   * 只对长期未用的标记为archived，降低检索权重，但不淘汰
   */
  private shouldArchivePlaybook(playbook: StrategicPlaybook): boolean {
    // 连续180天未使用，且使用次数少于5次 → 标记为archived（降低权重，不淘汰）
    const daysSinceLastUsed = (Date.now() - playbook.metrics.lastUsed) / (24 * 60 * 60 * 1000);
    if (daysSinceLastUsed > 180 && playbook.metrics.usageCount < 5) {
      return true;
    }

    return false;
  }

  /**
   * 判断Playbook是否应该被淘汰
   * 只有明确低效的才会被淘汰：低成功率或用户明确不满
   */
  private shouldDeprecatePlaybook(playbook: StrategicPlaybook): boolean {
    // 成功率低于30%，且使用次数超过10次 → 明确低效，淘汰
    if (playbook.metrics.successRate < 0.3 && playbook.metrics.usageCount > 10) {
      return true;
    }

    // 用户满意度低于2分（1-10分制），且反馈超过5次 → 明确不满，淘汰
    if (playbook.metrics.userSatisfaction < 2 && playbook.metrics.usageCount > 5) {
      return true;
    }

    // 优化超过5次仍然低效（成功率<40%）→ 多次优化仍无效，淘汰
    if (playbook.optimizationCount > 5 && playbook.metrics.successRate < 0.4) {
      return true;
    }

    return false;
  }

  /**
   * 判断已淘汰或已归档的Playbook是否应该重新激活
   */
  private shouldReactivatePlaybook(playbook: StrategicPlaybook): boolean {
    // 成功率提升到50%以上 → 可以重新激活
    if (playbook.metrics.successRate > 0.5) {
      return true;
    }

    // 用户满意度提升到5分以上 → 可以重新激活
    if (playbook.metrics.userSatisfaction > 5) {
      return true;
    }

    // 重新开始使用（使用次数>5）→ 可以重新激活
    if (playbook.metrics.usageCount > 5) {
      return true;
    }

    return false;
  }

  /**
   * 获取Playbook淘汰原因
   * 注意：时间未使用是归档原因，不是淘汰原因
   */
  private getDeprecationReason(playbook: StrategicPlaybook): string {
    const reasons: string[] = [];

    if (playbook.metrics.successRate < 0.3 && playbook.metrics.usageCount > 10) {
      reasons.push('成功率过低（<30%）');
    }

    if (playbook.metrics.userSatisfaction < 2 && playbook.metrics.usageCount > 5) {
      reasons.push('用户满意度极低（<2分）');
    }

    if (playbook.optimizationCount > 5 && playbook.metrics.successRate < 0.4) {
      reasons.push('多次优化仍低效（成功率<40%）');
    }

    return reasons.join('; ');
  }

  /**
   * 获取伦理守卫实例
   */
  private getEthicsGuard(): AceEthicsGuard | null {
    return (this.aceIntegrator as any).ethicsGuard || null;
  }

  // ========== Playbook系统集成方法 ==========

  /**
   * 从战略学习自动提炼Playbook
   * 这是ACE L2层的核心进化能力
   */
  private async extractPlaybookFromLearning(
    learning: StrategicLearning,
    sessionId: string
  ): Promise<void> {
    try {
      // 只对成功案例提炼Playbook
      if (learning.outcome !== 'success') {
        logger.debug(`[AceStrategyManager] Skipping playbook extraction for ${learning.outcome} outcome`);
        return;
      }

      // 获取会话上下文
      const sessionContext = await this.getSessionContext(sessionId);

      // 使用PlaybookManager提炼Playbook
      const playbook = await this.playbookManager.extractPlaybookFromLearning(
        learning,
        sessionContext
      );

      if (playbook) {
        // 向L2层报告Playbook生成
        await this.aceIntegrator.sendToLayer('GLOBAL_STRATEGY', {
          type: 'PLAYBOOK_CREATED',
          content: `New playbook extracted: ${playbook.name}`,
          metadata: {
            playbookId: playbook.id,
            playbookType: playbook.type,
            sourceLearningId: learning.id,
            sessionId,
            timestamp: Date.now()
          }
        });

        logger.info(`[AceStrategyManager] Extracted playbook: ${playbook.name} (${playbook.id})`);
      }
    } catch (error: any) {
      logger.error('[AceStrategyManager] Failed to extract playbook from learning:', error);
    }
  }

  /**
   * 从失败案例提炼"避免错误"Playbook
   * 失败经验同样宝贵，可以转化为反向学习指南
   */
  private async extractFailurePlaybookFromLearning(
    learning: StrategicLearning,
    sessionId: string
  ): Promise<void> {
    try {
      // 只对失败案例提炼"反向Playbook"
      if (learning.outcome !== 'failure') {
        logger.debug(`[AceStrategyManager] Skipping failure playbook extraction for ${learning.outcome} outcome`);
        return;
      }

      // 获取会话上下文
      const sessionContext = await this.getSessionContext(sessionId);

      // 使用LLM分析失败案例，提炼"避免错误"的策略
      const prompt = this.buildFailureExtractionPrompt(learning, sessionContext);

      const response = await this.llmManager.chat([
        {
          role: 'user',
          content: prompt
        }
      ], { stream: false });

      const content = (response.choices[0]?.message?.content as string) || '';
      const failurePlaybook = this.parseFailurePlaybookFromLLMResponse(content, learning);

      if (failurePlaybook) {
        // 创建"避免错误"类型的Playbook
        const playbook = await this.playbookManager.createPlaybook(failurePlaybook);

        // 向L2层报告失败Playbook生成
        await this.aceIntegrator.sendToLayer('GLOBAL_STRATEGY', {
          type: 'FAILURE_PLAYBOOK_CREATED',
          content: `New failure-derived playbook created: ${playbook.name}`,
          metadata: {
            playbookId: playbook.id,
            playbookType: playbook.type,
            sourceLearningId: learning.id,
            sessionId,
            isFailureDerived: true,
            timestamp: Date.now()
          }
        });

        logger.info(`[AceStrategyManager] Extracted failure playbook: ${playbook.name} (${playbook.id})`);
      }
    } catch (error: any) {
      logger.error('[AceStrategyManager] Failed to extract failure playbook from learning:', error);
    }
  }

  /**
   * 获取会话上下文（用于Playbook提炼）
   */
  private async getSessionContext(sessionId: string): Promise<string> {
    try {
      // 从AceIntegrator获取会话轨迹
      // 这里简化处理，实际实现可以从轨迹中提取更多上下文
      return `Session: ${sessionId}`;
    } catch (error) {
      logger.error('[AceStrategyManager] Failed to get session context:', error);
      return '';
    }
  }

  /**
   * 构建失败案例提炼Prompt
   * 将失败经验转化为"避免错误"的反向指南
   */
  private buildFailureExtractionPrompt(learning: StrategicLearning, context?: string): string {
    return `
分析以下失败案例，提炼出"避免错误"的反向Playbook：

失败摘要: ${learning.summary}
失败原因: ${learning.learnings.join('; ')}
${context ? `\n上下文: ${context}` : ''}

请提炼出以下信息（JSON格式）：
{
  "name": "避免[具体错误]的策略",
  "description": "详细描述（1-2句话，说明如何避免此错误）",
  "type": "playbook类型（risk_avoidance/crisis_prevention/problem_prevention）",
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
      "description": "具体的预防行动",
      "expectedOutcome": "预期结果",
      "resources": ["资源1", "资源2"]
    }
  ],
  "tags": ["risk-avoidance", "failure-derived", "prevention"],
  "rationale": "基于失败案例提炼的预防策略说明"
}

注意：
1. 重点提炼"如何避免"此类错误
2. 将失败经验转化为正面指导
3. 提供具体的预防措施
`;
  }

  /**
   * 解析LLM返回的失败Playbook
   */
  private parseFailurePlaybookFromLLMResponse(
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
        type: parsed.type || 'problem_solving',
        version: '1.0.0',
        status: 'active',
        context: parsed.context,
        trigger: parsed.trigger,
        actions: parsed.actions,
        sourceLearningIds: [learning.id],
        lastOptimized: Date.now(),
        optimizationCount: 0,
        metrics: {
          successRate: 0, // 失败案例初始成功率为0，但会随使用更新
          usageCount: 0,
          averageOutcome: 0,
          lastUsed: 0,
          timeToResolution: 0,
          userSatisfaction: 0
        },
        tags: parsed.tags || ['risk-avoidance', 'failure-derived'],
        author: 'failure-analysis',
        reviewers: []
      };
    } catch (error) {
      logger.error('[AceStrategyManager] Failed to parse failure playbook from LLM response:', error);
      return null;
    }
  }

  /**
   * 搜索可用的Playbook（供外部调用）
   */
  async searchPlaybooks(
    query: string,
    options?: {
      type?: string;
      minSuccessRate?: number;
      limit?: number;
    }
  ) {
    return this.playbookManager.searchPlaybooks(query, options);
  }

  /**
   * 匹配Playbook（供外部调用）
   */
  async matchPlaybooks(
    context: {
      userQuery: string;
      sessionHistory?: string[];
      currentState?: string;
      userProfile?: any;
    }
  ) {
    return this.playbookMatcher.matchPlaybooks(context);
  }

  /**
   * 获取Playbook统计信息
   */
  getPlaybookStats() {
    return this.playbookManager.getPlaybookStats();
  }

  /**
   * 记录Playbook执行（供外部调用）
   */
  async recordPlaybookExecution(
    playbookId: string,
    sessionId: string,
    outcome: 'success' | 'failure' | 'partial' | 'abandoned',
    notes?: string
  ) {
    await this.playbookManager.recordExecution({
      playbookId,
      sessionId,
      startedAt: Date.now(),
      outcome,
      actualSteps: 0,
      totalSteps: 0,
      notes: notes || ''
    });
  }
}
