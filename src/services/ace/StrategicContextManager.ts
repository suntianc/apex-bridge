/**
 * StrategicContextManager - 战略上下文管理器
 *
 * 职责：
 * 1. 战略上下文的加载、保存、更新
 * 2. 战略目标的增删改查
 * 3. 世界视图的加载
 * 4. 使用 LLM 生成战略洞察
 *
 * 依赖：
 * - LLMManager: LLM 管理器
 * - ToolRetrievalService: 工具检索服务（用于向量搜索）
 * - MemoryManager: 内存管理器（用于缓存）
 * - AceIntegrator: ACE 集成器（用于层间通信）
 */

import { LLMManager } from '../../core/LLMManager';
import { ToolRetrievalService } from '../ToolRetrievalService';
import { AceIntegrator } from '../AceIntegrator';
import { logger } from '../../utils/logger';
import { MemoryManager } from './MemoryManager';
import type { StrategicContext, StrategicLearning } from './types';
import type { ToolRetrievalResult, SkillTool } from '../../types/tool-system';

/**
 * 战略目标
 */
export interface StrategicGoal {
  /** 目标 ID */
  id: string;
  /** 目标描述 */
  description: string;
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
  /** 状态 */
  status: 'active' | 'achieved' | 'abandoned';
  /** 创建时间 */
  createdAt: number;
}

/**
 * 战略上下文管理器接口
 */
export interface IStrategicContextManager {
  /**
   * 加载战略上下文
   */
  loadContext(userId: string): Promise<StrategicContext | null>;

  /**
   * 保存战略上下文
   */
  saveContext(context: StrategicContext): Promise<void>;

  /**
   * 更新战略目标
   */
  updateGoals(userId: string, goals: string[]): Promise<void>;

  /**
   * 加载当前世界视图
   */
  loadWorldView(userId: string): Promise<string>;

  /**
   * 检查上下文是否过期
   */
  isExpired(context: StrategicContext): boolean;

  /**
   * 获取战略摘要
   */
  getStrategicSummary(userId: string): StrategicContext | null;
}

/**
 * 战略上下文管理器实现
 */
export class StrategicContextManager implements IStrategicContextManager {
  /** 上下文缓存键前缀 */
  private readonly CONTEXT_PREFIX = 'context:';

  /**
   * 构造函数
   *
   * @param llmManager LLM 管理器
   * @param toolRetrievalService 工具检索服务
   * @param memoryManager 内存管理器
   * @param aceIntegrator ACE 集成器
   */
  constructor(
    private readonly llmManager: LLMManager,
    private readonly toolRetrievalService: ToolRetrievalService,
    private readonly memoryManager: MemoryManager,
    private readonly aceIntegrator: AceIntegrator
  ) {}

  /**
   * 加载战略上下文
   */
  async loadContext(userId: string): Promise<StrategicContext | null> {
    try {
      // 检查缓存
      const cached = await this.memoryManager.get<StrategicContext>(`${this.CONTEXT_PREFIX}${userId}`);
      if (cached && !this.isExpired(cached.data)) {
        logger.debug(`[StrategicContextManager] Loaded strategic context from cache for user: ${userId}`);
        return cached.data;
      }

      // 从向量库检索历史战略
      const query = `User ${userId} strategic goals plans preferences`;
      const relevantPlans = await this.toolRetrievalService.findRelevantSkills(
        query,
        5, // limit
        0.5 // threshold
      );

      // 使用 LLM 分析并生成战略上下文
      const strategicInsight = await this.generateStrategicInsight(userId, relevantPlans);

      const context: StrategicContext = {
        userId,
        goals: strategicInsight.goals,
        preferences: strategicInsight.preferences,
        pastStrategies: strategicInsight.pastStrategies,
        lastUpdated: Date.now()
      };

      // 更新缓存
      await this.memoryManager.set(`${this.CONTEXT_PREFIX}${userId}`, context, 30 * 24 * 60 * 60 * 1000);

      logger.info(`[StrategicContextManager] Loaded strategic context for user: ${userId}`);
      return context;
    } catch (error) {
      logger.error(`[StrategicContextManager] Failed to load strategic context for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * 保存战略上下文
   */
  async saveContext(context: StrategicContext): Promise<void> {
    try {
      context.lastUpdated = Date.now();
      await this.memoryManager.set(`${this.CONTEXT_PREFIX}${context.userId}`, context, 30 * 24 * 60 * 60 * 1000);
      logger.debug(`[StrategicContextManager] Saved strategic context for user: ${context.userId}`);
    } catch (error) {
      logger.error(`[StrategicContextManager] Failed to save strategic context:`, error);
      throw error;
    }
  }

  /**
   * 更新战略目标
   */
  async updateGoals(userId: string, goals: string[]): Promise<void> {
    try {
      // 获取现有上下文或创建新的
      let context = await this.loadContext(userId);
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
      await this.saveContext(context);

      // 向全局战略层报告目标更新
      await this.aceIntegrator.sendToLayer('GLOBAL_STRATEGY', {
        type: 'GOAL_UPDATE',
        content: `Strategic goals updated for user: ${userId}`,
        metadata: {
          userId,
          goals,
          timestamp: Date.now()
        }
      });

      logger.info(`[StrategicContextManager] Strategic goals updated for user: ${userId}`);
    } catch (error) {
      logger.error(`[StrategicContextManager] Failed to update strategic goals:`, error);
      throw error;
    }
  }

  /**
   * 加载当前世界视图
   */
  async loadWorldView(userId: string): Promise<string> {
    const context = await this.loadContext(userId);
    if (!context) {
      return '';
    }

    return this.buildContextSummary(context);
  }

  /**
   * 检查上下文是否过期（默认 30 天）
   */
  isExpired(context: StrategicContext): boolean {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
    return Date.now() - context.lastUpdated > maxAge;
  }

  /**
   * 获取战略摘要
   */
  getStrategicSummary(userId: string): StrategicContext | null {
    // 同步方法，快速返回
    return null; // 实际实现需要异步获取
  }

  /**
   * 生成战略洞察
   * 使用 LLM 分析历史数据，生成有价值的战略洞察
   */
  private async generateStrategicInsight(
    userId: string,
    relevantPlans: ToolRetrievalResult[]
  ): Promise<{
    summary: string;
    goals: string[];
    preferences: Record<string, unknown>;
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
        // tags 可能在 SkillTool 上，不在 BuiltInTool 上
        tags: 'tags' in r.tool && Array.isArray((r.tool as SkillTool).tags)
          ? (r.tool as SkillTool).tags
          : [],
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

      // 使用 LLM 分析
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
            summary: r.tool.description as string || '',
            learnings: [],
            outcome: 'success' as const,
            timestamp: Date.now(),
            context: `Retrieved from vector search with score ${r.score}`
          }))
        };
      } catch (parseError) {
        logger.warn('[StrategicContextManager] Failed to parse LLM response, using fallback');
        return {
          summary: `Found ${relevantPlans.length} historical strategic items.`,
          goals: [],
          preferences: {},
          pastStrategies: []
        };
      }
    } catch (error) {
      logger.error('[StrategicContextManager] Failed to generate strategic insight:', error);
      return {
        summary: 'Failed to generate strategic insight.',
        goals: [],
        preferences: {},
        pastStrategies: []
      };
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
  protected inferDomain(text: string): string {
    const domains: Record<string, string[]> = {
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
}

/**
 * 创建战略上下文管理器
 */
export function createStrategicContextManager(
  llmManager: LLMManager,
  toolRetrievalService: ToolRetrievalService,
  memoryManager: MemoryManager,
  aceIntegrator: AceIntegrator
): StrategicContextManager {
  return new StrategicContextManager(llmManager, toolRetrievalService, memoryManager, aceIntegrator);
}
