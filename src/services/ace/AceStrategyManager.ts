/**
 * AceStrategyManager - ACE 战略管理器（主协调器）
 *
 * 映射到 L2（Global Strategy Layer）- 全球战略层
 *
 * 核心职责：
 * 1. 维护长期战略和世界模型
 * 2. 使用 LanceDB 统一存储
 * 3. 跨会话的上下文连续性
 * 4. 战略学习与调整
 *
 * 架构：
 * - 主协调器，委托给子模块处理具体逻辑
 * - 依赖注入 PlaybookManager 和 PlaybookMatcher
 * - 内存管理委托给 MemoryManager
 *
 * @see {@link https://docs.abp.com/architecture/layers|L2 Global Strategy Layer}
 */

import { AceIntegrator } from '../AceIntegrator';
import { ToolRetrievalService } from '../ToolRetrievalService';
import { LLMManager } from '../../core/LLMManager';
import type { AceEthicsGuard } from '../AceEthicsGuard';
import { StrategicPlaybook } from '../../core/playbook/types';
import { PlaybookManager } from '../PlaybookManager';
import { PlaybookMatcher } from '../PlaybookMatcher';
import { logger } from '../../utils/logger';
import { MemoryManager } from './MemoryManager';
import { StrategicContextManager } from './StrategicContextManager';
import { WorldModelUpdater } from './WorldModelUpdater';
import { PlaybookSynthesis } from './PlaybookSynthesis';
import type {
  StrategicContext,
  StrategicLearning,
  LearningOutcome,
  ServiceStatus,
  WorldModelStats
} from './types';
import { ACE_STRATEGY_CONFIG } from './types';

/**
 * AceStrategyManager 主接口
 */
export interface IAceStrategyManager {
  /**
   * 加载战略上下文
   */
  loadStrategicContext(userId: string): Promise<string>;

  /**
   * 更新世界模型
   */
  updateWorldModel(sessionId: string, outcome: LearningOutcome): Promise<void>;

  /**
   * 检索战略知识
   */
  retrieveStrategicKnowledge(query: string, userId?: string): Promise<string[]>;

  /**
   * 启动战略学习收集
   */
  startStrategicLearningCollection(sessionId: string): Promise<void>;

  /**
   * 获取服务状态
   */
  getStatus(): ServiceStatus;

  /**
   * 搜索 Playbook
   */
  searchPlaybooks(
    query: string,
    options?: {
      type?: string;
      minSuccessRate?: number;
      limit?: number;
    }
  ): Promise<StrategicPlaybook[]>;

  /**
   * 匹配 Playbook
   */
  matchPlaybooks(context: {
    userQuery: string;
    sessionHistory?: string[];
    currentState?: string;
    userProfile?: Record<string, unknown>;
  }): Promise<StrategicPlaybook[]>;

  /**
   * 获取 Playbook 统计信息
   */
  getPlaybookStats(): {
    totalPlaybooks: number;
    activePlaybooks: number;
    deprecatedPlaybooks: number;
    averageSuccessRate: number;
    mostUsedType: string;
  };

  /**
   * 记录 Playbook 执行
   */
  recordPlaybookExecution(
    playbookId: string,
    sessionId: string,
    outcome: 'success' | 'failure' | 'partial' | 'abandoned',
    notes?: string
  ): Promise<void>;

  /**
   * 更新战略目标
   */
  updateStrategicGoals(userId: string, goals: string[]): Promise<void>;

  /**
   * 获取世界模型统计
   */
  getWorldModelStats(): WorldModelStats;

  /**
   * 销毁服务
   */
  destroy(): void;
}

/**
 * AceStrategyManager 实现
 *
 * 使用依赖注入模式，协调各子模块：
 * - StrategicContextManager: 战略上下文管理
 * - WorldModelUpdater: 世界模型更新
 * - PlaybookSynthesis: Playbook 提炼
 * - MemoryManager: 内存管理
 * - PlaybookManager: Playbook 管理（依赖注入）
 * - PlaybookMatcher: Playbook 匹配（依赖注入）
 */
export class AceStrategyManager implements IAceStrategyManager {
  /** 内存管理器 */
  private readonly memoryManager: MemoryManager;

  /** 战略上下文管理器 */
  private readonly contextManager: StrategicContextManager;

  /** 世界模型更新器 */
  private readonly worldModelUpdater: WorldModelUpdater;

  /** Playbook 合成器 */
  private readonly playbookSynthesis: PlaybookSynthesis;

  /** Playbook 管理器（依赖注入） */
  private playbookManager: PlaybookManager | null = null;

  /** Playbook 匹配器（依赖注入） */
  private playbookMatcher: PlaybookMatcher | null = null;

  /**
   * 构造函数 - 依赖注入模式
   *
   * @param aceIntegrator ACE 集成器
   * @param toolRetrievalService 工具检索服务
   * @param llmManager LLM 管理器
   * @param playbookManager Playbook 管理器（可选，依赖注入）
   * @param playbookMatcher Playbook 匹配器（可选，依赖注入）
   */
  constructor(
    private readonly aceIntegrator: AceIntegrator,
    private readonly toolRetrievalService: ToolRetrievalService,
    private readonly llmManager: LLMManager,
    playbookManager?: PlaybookManager,
    playbookMatcher?: PlaybookMatcher
  ) {
    // 初始化内存管理器（30天过期，1小时清理一次，最多1000个上下文）
    this.memoryManager = new MemoryManager(
      ACE_STRATEGY_CONFIG.MAX_CONTEXT_AGE_MS,
      ACE_STRATEGY_CONFIG.MAX_STRATEGIC_CONTEXTS,
      ACE_STRATEGY_CONFIG.CLEANUP_INTERVAL_MS
    );

    // 初始化子模块
    this.contextManager = new StrategicContextManager(
      this.llmManager,
      this.toolRetrievalService,
      this.memoryManager,
      this.aceIntegrator
    );

    this.worldModelUpdater = new WorldModelUpdater(
      this.llmManager,
      this.toolRetrievalService,
      this.aceIntegrator,
      this.memoryManager
    );

    // 如果提供了 PlaybookManager，注入到 PlaybookSynthesis
    this.playbookSynthesis = new PlaybookSynthesis(this.llmManager, undefined, this.aceIntegrator);

    // 依赖注入 PlaybookManager
    if (playbookManager) {
      this.playbookManager = playbookManager;
      this.playbookSynthesis.setPlaybookManager(playbookManager);
    }

    // 依赖注入 PlaybookMatcher
    if (playbookMatcher) {
      this.playbookMatcher = playbookMatcher;
    }

    // 启动定期清理任务
    this.memoryManager.startPeriodicCleanup();

    logger.info('[AceStrategyManager] Initialized with dependency injection pattern');
  }

  /**
   * 设置 Playbook 管理器（用于依赖注入）
   */
  setPlaybookManager(manager: PlaybookManager): void {
    this.playbookManager = manager;
    this.playbookSynthesis.setPlaybookManager(manager);
    logger.info('[AceStrategyManager] PlaybookManager injected via setter');
  }

  /**
   * 设置 Playbook 匹配器（用于依赖注入）
   */
  setPlaybookMatcher(matcher: PlaybookMatcher): void {
    this.playbookMatcher = matcher;
    logger.info('[AceStrategyManager] PlaybookMatcher injected via setter');
  }

  /**
   * 加载战略上下文
   */
  async loadStrategicContext(userId: string): Promise<string> {
    try {
      return await this.contextManager.loadWorldView(userId);
    } catch (error) {
      logger.error(`[AceStrategyManager] Failed to load strategic context for user ${userId}:`, error);
      return 'Failed to load strategic context.';
    }
  }

  /**
   * 更新世界模型
   */
  async updateWorldModel(sessionId: string, outcome: LearningOutcome): Promise<void> {
    try {
      // L1 伦理审查
      const ethicsGuard = this.getEthicsGuard();
      if (ethicsGuard) {
        const reviewResult = await ethicsGuard.reviewPlanning({
          goal: 'Update world model with new learning',
          context: outcome.summary
        });

        if (!reviewResult.approved) {
          logger.warn('[AceStrategyManager] L1伦理审查未通过，阻止世界模型更新');

          await this.aceIntegrator.sendToLayer('ASPIRATIONAL', {
            type: 'WORLD_MODEL_UPDATE_REJECTED',
            content: '世界模型更新被拒绝',
            metadata: {
              reason: reviewResult.reason,
              suggestions: reviewResult.suggestions,
              summary: outcome.summary,
              timestamp: Date.now()
            }
          });

          return;
        }

        logger.info('[AceStrategyManager] L1伦理审查通过，允许世界模型更新');
      }

      // 更新世界模型
      await this.worldModelUpdater.updateModel(outcome.userId, outcome);

      // 触发战略调整
      await this.worldModelUpdater.triggerStrategicAdjustment(sessionId, outcome);

      // 自动从战略学习提炼 Playbook
      if (outcome.learnings.length > 0) {
        const learning = this.createStrategicLearning(outcome);

        if (outcome.outcome === 'success') {
          await this.playbookSynthesis.extractFromSuccess(learning, sessionId);
        } else if (outcome.outcome === 'failure') {
          await this.playbookSynthesis.extractFromFailure(learning, sessionId);
        }
      }

      logger.info(`[AceStrategyManager] World model updated with strategic learning from session: ${sessionId}`);
    } catch (error) {
      logger.error('[AceStrategyManager] Failed to update world model:', error);
    }
  }

  /**
   * 检索战略知识
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
    } catch (error) {
      logger.error('[AceStrategyManager] Failed to retrieve strategic knowledge:', error);
      return [];
    }
  }

  /**
   * 启动战略学习收集
   */
  async startStrategicLearningCollection(sessionId: string): Promise<void> {
    logger.info(`[AceStrategyManager] Starting strategic learning collection for session: ${sessionId}`);
    // 实现逻辑可以根据需求扩展
  }

  /**
   * 获取服务状态
   */
  getStatus(): ServiceStatus {
    const stats = this.memoryManager.getStats();

    return {
      initialized: true,
      cacheStatus: {
        contextCount: stats.size,
        worldModelCount: this.worldModelUpdater.getStats().totalUpdates,
        learningCount: stats.size
      },
      lastCleanup: new Date(),
      healthy: true
    };
  }

  /**
   * 搜索 Playbook
   */
  async searchPlaybooks(
    query: string,
    options?: {
      type?: string;
      minSuccessRate?: number;
      limit?: number;
    }
  ): Promise<StrategicPlaybook[]> {
    if (this.playbookManager) {
      return this.playbookManager.searchPlaybooks(query, options);
    }

    logger.warn('[AceStrategyManager] No PlaybookManager available, returning empty results');
    return [];
  }

  /**
   * 匹配 Playbook
   */
  async matchPlaybooks(context: {
    userQuery: string;
    sessionHistory?: string[];
    currentState?: string;
    userProfile?: Record<string, unknown>;
  }): Promise<StrategicPlaybook[]> {
    if (this.playbookMatcher) {
      const matches = await this.playbookMatcher.matchPlaybooks({
        userQuery: context.userQuery,
        sessionHistory: context.sessionHistory,
        domain: context.userProfile?.domain as string | undefined,
        scenario: context.userProfile?.scenario as string | undefined
      });

      return matches.map(m => m.playbook);
    }

    logger.warn('[AceStrategyManager] No PlaybookMatcher available, returning empty results');
    return [];
  }

  /**
   * 获取 Playbook 统计信息
   */
  getPlaybookStats(): {
    totalPlaybooks: number;
    activePlaybooks: number;
    deprecatedPlaybooks: number;
    averageSuccessRate: number;
    mostUsedType: string;
  } {
    if (this.playbookManager) {
      return this.playbookManager.getPlaybookStats();
    }

    logger.warn('[AceStrategyManager] No PlaybookManager available, returning default stats');
    return {
      totalPlaybooks: 0,
      activePlaybooks: 0,
      deprecatedPlaybooks: 0,
      averageSuccessRate: 0,
      mostUsedType: 'none'
    };
  }

  /**
   * 记录 Playbook 执行
   */
  async recordPlaybookExecution(
    playbookId: string,
    sessionId: string,
    outcome: 'success' | 'failure' | 'partial' | 'abandoned',
    notes?: string
  ): Promise<void> {
    if (this.playbookManager) {
      await this.playbookManager.recordExecution({
        playbookId,
        sessionId,
        startedAt: Date.now(),
        outcome,
        actualSteps: 0,
        totalSteps: 0,
        notes: notes || ''
      });
    } else {
      logger.warn('[AceStrategyManager] No PlaybookManager available, cannot record execution');
    }
  }

  /**
   * 更新战略目标
   */
  async updateStrategicGoals(userId: string, goals: string[]): Promise<void> {
    await this.contextManager.updateGoals(userId, goals);
  }

  /**
   * 获取世界模型统计
   */
  getWorldModelStats(): WorldModelStats {
    return this.worldModelUpdater.getStats();
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.memoryManager.destroy();
    logger.info('[AceStrategyManager] Destroyed and cleaned up all resources');
  }

  /**
   * 获取伦理守卫实例
   */
  private getEthicsGuard(): AceEthicsGuard | null {
    return (this.aceIntegrator as { ethicsGuard?: AceEthicsGuard }).ethicsGuard || null;
  }

  /**
   * 创建战略学习对象
   */
  private createStrategicLearning(outcome: LearningOutcome): StrategicLearning {
    return {
      id: `learning_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      summary: outcome.summary,
      learnings: outcome.learnings,
      outcome: outcome.outcome,
      timestamp: Date.now()
    };
  }
}

/**
 * AceStrategyManager 工厂函数
 *
 * @param aceIntegrator ACE 集成器
 * @param toolRetrievalService 工具检索服务
 * @param llmManager LLM 管理器
 * @param playbookManager Playbook 管理器（可选）
 * @param playbookMatcher Playbook 匹配器（可选）
 * @returns AceStrategyManager 实例
 */
export function createAceStrategyManager(
  aceIntegrator: AceIntegrator,
  toolRetrievalService: ToolRetrievalService,
  llmManager: LLMManager,
  playbookManager?: PlaybookManager,
  playbookMatcher?: PlaybookMatcher
): AceStrategyManager {
  return new AceStrategyManager(
    aceIntegrator,
    toolRetrievalService,
    llmManager,
    playbookManager,
    playbookMatcher
  );
}
