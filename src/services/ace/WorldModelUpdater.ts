/**
 * WorldModelUpdater - 世界模型更新器
 *
 * 职责：
 * 1. 从学习结果更新世界模型
 * 2. 存储战略学习到向量数据库
 * 3. 触发战略调整
 * 4. 管理世界模型更新列表
 *
 * 依赖：
 * - LLMManager: LLM 管理器
 * - ToolRetrievalService: 工具检索服务（用于向量存储）
 * - AceIntegrator: ACE 集成器（用于层间通信）
 * - MemoryManager: 内存管理器（用于缓存）
 */

import { LLMManager } from '../../core/LLMManager';
import { ToolRetrievalService } from '../ToolRetrievalService';
import { AceIntegrator } from '../AceIntegrator';
import { logger } from '../../utils/logger';
import { MemoryManager } from './MemoryManager';
import type { LearningOutcome, StrategicLearning, WorldModelUpdate, WorldModelStats } from './types';
import { ACE_STRATEGY_CONFIG } from './types';

/**
 * 世界模型更新器接口
 */
export interface IWorldModelUpdater {
  /**
   * 更新世界模型
   */
  updateModel(userId: string, outcome: LearningOutcome): Promise<void>;

  /**
   * 存储战略学习
   */
  storeLearning(learning: StrategicLearning): Promise<void>;

  /**
   * 从学习结果更新世界模型
   */
  updateFromLearning(outcome: LearningOutcome): Promise<string>;

  /**
   * 获取世界视图
   */
  getWorldView(userId: string): Promise<string>;

  /**
   * 查询相似学习
   */
  findSimilarLearnings(query: string, userId: string): Promise<StrategicLearning[]>;

  /**
   * 获取世界模型统计
   */
  getStats(): WorldModelStats;

  /**
   * 清理旧的世界模型更新
   */
  cleanupOldUpdates(): Promise<number>;
}

/**
 * 世界模型更新器实现
 */
export class WorldModelUpdater implements IWorldModelUpdater {
  /** 世界模型更新列表（有大小限制） */
  private worldModelUpdates: WorldModelUpdate[] = [];

  /**
   * 构造函数
   *
   * @param llmManager LLM 管理器
   * @param toolRetrievalService 工具检索服务
   * @param aceIntegrator ACE 集成器
   * @param memoryManager 内存管理器
   */
  constructor(
    private readonly llmManager: LLMManager,
    private readonly toolRetrievalService: ToolRetrievalService,
    private readonly aceIntegrator: AceIntegrator,
    private readonly memoryManager: MemoryManager
  ) {}

  /**
   * 更新世界模型
   */
  async updateModel(userId: string, outcome: LearningOutcome): Promise<void> {
    try {
      // 向全局战略层报告任务完成
      await this.aceIntegrator.sendToLayer('GLOBAL_STRATEGY', {
        type: 'STATUS_UPDATE',
        content: `Mission accomplished: ${outcome.summary}`,
        metadata: {
          sessionId: outcome.sessionId,
          learnings: outcome.learnings,
          outcome: outcome.outcome,
          timestamp: Date.now()
        }
      });

      // 提取关键战略学习
      const strategicLearning = await this.extractStrategicLearning(outcome);

      // 将战略学习存储到向量数据库
      await this.storeLearning(strategicLearning);

      // 更新世界模型
      await this.updateFromLearning(outcome);

      logger.info(`[WorldModelUpdater] World model updated with strategic learning from session: ${outcome.sessionId}`);
    } catch (error) {
      logger.error('[WorldModelUpdater] Failed to update world model:', error);
      throw error;
    }
  }

  /**
   * 存储战略学习到向量数据库
   */
  async storeLearning(learning: StrategicLearning): Promise<void> {
    try {
      const learningText = `Strategic Learning: ${learning.summary}\nLearnings: ${learning.learnings.join('; ')}`;

      // 使用 ToolRetrievalService 作为通用向量存储
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

      logger.debug(`[WorldModelUpdater] Strategic learning stored in vector DB: ${learning.id}`);
    } catch (error) {
      logger.error('[WorldModelUpdater] Failed to store strategic learning:', error);
      throw error;
    }
  }

  /**
   * 从学习结果更新世界模型
   */
  async updateFromLearning(outcome: LearningOutcome): Promise<string> {
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

      // 保持世界模型更新列表的大小
      this.trimWorldModelUpdates();

      logger.debug(`[WorldModelUpdater] World model updated with ${outcome.learnings.length} knowledge items`);

      return `Updated with ${outcome.learnings.length} new knowledge items`;
    } catch (error) {
      logger.error('[WorldModelUpdater] Failed to update world model from learning:', error);
      throw error;
    }
  }

  /**
   * 获取世界视图
   */
  async getWorldView(userId: string): Promise<string> {
    // 获取该用户的最新世界模型更新
    const userUpdates = this.worldModelUpdates
      .filter(update => update.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000) // 7天内
      .slice(-50); // 最多50条

    if (userUpdates.length === 0) {
      return 'No world model updates found.';
    }

    // 按领域分组
    const domainGroups: Record<string, string[]> = {};
    for (const update of userUpdates) {
      if (!domainGroups[update.domain]) {
        domainGroups[update.domain] = [];
      }
      domainGroups[update.domain].push(`- ${update.knowledge} (confidence: ${(update.confidence * 100).toFixed(0)}%)`);
    }

    // 构建世界视图摘要
    const domainSummary = Object.entries(domainGroups)
      .map(([domain, items]) => `## ${domain}\n${items.join('\n')}`)
      .join('\n\n');

    return `# World Model View\n\nLast Updated: ${new Date().toISOString()}\n\n${domainSummary}`;
  }

  /**
   * 查询相似学习
   */
  async findSimilarLearnings(query: string, userId: string): Promise<StrategicLearning[]> {
    try {
      const searchQuery = `User ${userId} ${query}`;
      const results = await this.toolRetrievalService.findRelevantSkills(
        searchQuery,
        10, // limit
        0.6 // threshold
      );

      return results
        .filter(r => {
          // 假设 metadata 存储在 tool 上，需要类型断言
          const toolWithMetadata = r.tool as unknown as { metadata?: { type?: string; id?: string; summary?: string; learnings?: string[]; outcome?: string; storedAt?: number } };
          return toolWithMetadata.metadata?.type === 'strategic_learning';
        })
        .map(r => {
          const toolWithMetadata = r.tool as unknown as { metadata?: { id?: string; summary?: string; learnings?: string[]; outcome?: string; storedAt?: number } };
          const metadata = toolWithMetadata.metadata || {};
          return {
            id: metadata.id || '',
            summary: metadata.summary || '',
            learnings: metadata.learnings || [],
            outcome: (metadata.outcome as 'success' | 'failure' | 'partial') || 'partial',
            timestamp: metadata.storedAt || Date.now()
          };
        });
    } catch (error) {
      logger.error('[WorldModelUpdater] Failed to find similar learnings:', error);
      return [];
    }
  }

  /**
   * 获取世界模型统计
   */
  getStats(): WorldModelStats {
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
   * 清理旧的世界模型更新
   */
  async cleanupOldUpdates(): Promise<number> {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天
    const oldLength = this.worldModelUpdates.length;

    this.worldModelUpdates = this.worldModelUpdates.filter(
      update => (now - update.timestamp) < maxAge
    );

    const cleanedCount = oldLength - this.worldModelUpdates.length;
    if (cleanedCount > 0) {
      logger.info(`[WorldModelUpdater] Cleaned up ${cleanedCount} old world model updates`);
    }

    return cleanedCount;
  }

  /**
   * 触发战略调整
   */
  async triggerStrategicAdjustment(
    sessionId: string,
    outcome: LearningOutcome
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

      logger.debug(`[WorldModelUpdater] Strategic adjustment triggered for session: ${sessionId}`);
    } catch (error) {
      logger.error('[WorldModelUpdater] Failed to trigger strategic adjustment:', error);
    }
  }

  /**
   * 提取战略学习
   */
  private async extractStrategicLearning(
    outcome: LearningOutcome
  ): Promise<StrategicLearning> {
    return {
      id: `learning_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      summary: outcome.summary,
      learnings: outcome.learnings,
      outcome: outcome.outcome,
      timestamp: Date.now()
    };
  }

  /**
   * 保持世界模型更新列表的大小
   */
  private trimWorldModelUpdates(): void {
    const maxUpdates = ACE_STRATEGY_CONFIG.MAX_WORLD_MODEL_UPDATES;

    if (this.worldModelUpdates.length > maxUpdates) {
      // 保留最新的一半
      const keepCount = Math.floor(maxUpdates / 2);
      this.worldModelUpdates = this.worldModelUpdates.slice(-keepCount);
      logger.debug(`[WorldModelUpdater] Trimmed world model updates to ${keepCount} entries`);
    }
  }

  /**
   * 从文本推断知识域
   */
  private inferDomain(text: string): string {
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
 * 创建世界模型更新器
 */
export function createWorldModelUpdater(
  llmManager: LLMManager,
  toolRetrievalService: ToolRetrievalService,
  aceIntegrator: AceIntegrator,
  memoryManager: MemoryManager
): WorldModelUpdater {
  return new WorldModelUpdater(llmManager, toolRetrievalService, aceIntegrator, memoryManager);
}
