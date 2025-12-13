/**
 * ACE L2/L3层集成示例
 * 展示如何在现有系统中集成AceCapabilityManager和AceStrategyManager
 *
 * P2阶段实现：
 * - L3（AceCapabilityManager）：技能能力管理
 * - L2（AceStrategyManager）：全球战略管理
 */

import { AceCapabilityManager } from './AceCapabilityManager';
import { AceStrategyManager } from './AceStrategyManager';
import { AceIntegrator } from './AceIntegrator';
import { SkillManager } from './SkillManager';
import { ToolRetrievalService } from './ToolRetrievalService';
import { LLMManager } from '../core/LLMManager';
import type { SkillTool } from '../types/tool-system';
import type { Message, ChatOptions } from '../types';
import { logger } from '../utils/logger';

/**
 * ACE L2/L3集成管理器
 * 统一管理L2和L3层的服务
 */
export class AceL2L3Integration {
  private capabilityManager: AceCapabilityManager;
  private strategyManager: AceStrategyManager;

  constructor(
    private aceIntegrator: AceIntegrator,
    private skillManager: SkillManager,
    private toolRetrievalService: ToolRetrievalService,
    private llmManager: LLMManager
  ) {
    // 初始化L3能力管理器（与SkillManager深度集成）
    this.capabilityManager = new AceCapabilityManager(
      this.aceIntegrator,
      this.skillManager,
      this.toolRetrievalService
    );

    // 初始化L2战略管理器（使用LanceDB进行长期记忆）
    this.strategyManager = new AceStrategyManager(
      this.aceIntegrator,
      this.toolRetrievalService,
      this.llmManager
    );

    logger.debug('[ACE L2/L3] Integration initialized - L3 (Capability) + L2 (Strategy) layers active');
  }

  /**
   * 会话开始时加载L2战略上下文
   * 在ChatService的chat方法开始时调用
   */
  async loadStrategicContextForSession(userId: string): Promise<string> {
    logger.debug(`[ACE L2/L3] Loading strategic context for user: ${userId}`);
    return this.strategyManager.loadStrategicContext(userId);
  }

  /**
   * 技能调用前更新L3活动状态
   * 在ReActStrategy执行工具前调用
   */
  async trackSkillUsage(skillName: string): Promise<void> {
    await this.capabilityManager.updateSkillActivity(skillName);
    logger.debug(`[ACE L2/L3] Tracked skill usage: ${skillName}`);
  }

  /**
   * 技能失败时标记为故障
   * 在ReActStrategy工具执行失败时调用
   */
  async markSkillAsFaulty(skillName: string, error: string): Promise<void> {
    await this.capabilityManager.markSkillAsFaulty(skillName, error);
    logger.warn(`[ACE L2/L3] Skill marked as faulty: ${skillName}`);
  }

  /**
   * 任务完成后更新L2世界模型
   * 在ChatService完成聊天后调用
   */
  async updateWorldModelAfterTask(
    sessionId: string,
    outcome: { summary: string; learnings: string[]; outcome: 'success' | 'failure' | 'partial' }
  ): Promise<void> {
    await this.strategyManager.updateWorldModel(sessionId, outcome);
    logger.info(`[ACE L2/L3] World model updated for session: ${sessionId}`);
  }

  /**
   * 获取L3当前可用技能列表
   * 在L4（AceStrategyOrchestrator）选择策略前调用
   */
  async getAvailableCapabilities(): Promise<string[]> {
    return this.capabilityManager.getAvailableCapabilities();
  }

  /**
   * 新技能注册时更新L3
   * 在SkillManager安装技能后调用
   */
  async registerNewSkill(skill: SkillTool): Promise<void> {
    await this.capabilityManager.registerSkill(skill);
    logger.info(`[ACE L2/L3] New skill registered in L3: ${skill.name}`);
  }

  /**
   * 技能卸载时从L3移除
   * 在SkillManager卸载技能后调用
   */
  async unregisterSkill(skillName: string): Promise<void> {
    await this.capabilityManager.unregisterSkill(skillName);
    logger.info(`[ACE L2/L3] Skill unregistered from L3: ${skillName}`);
  }

  /**
   * 获取L3能力指标
   * 用于监控和调试
   */
  getCapabilityMetrics() {
    return this.capabilityManager.getCapabilityMetrics();
  }

  /**
   * 获取L2世界模型统计
   * 用于监控和调试
   */
  getWorldModelStats() {
    return this.strategyManager.getWorldModelStats();
  }

  /**
   * 更新用户战略目标
   * 通过API或管理界面调用
   */
  async updateUserStrategicGoals(userId: string, goals: string[]): Promise<void> {
    await this.strategyManager.updateStrategicGoals(userId, goals);
    logger.info(`[ACE L2/L3] Updated strategic goals for user: ${userId}`);
  }

  /**
   * 检索用户相关战略知识
   * 用于回答复杂问题或进行战略规划
   */
  async retrieveStrategicKnowledge(query: string, userId?: string): Promise<string[]> {
    return this.strategyManager.retrieveStrategicKnowledge(query, userId);
  }

  /**
   * 获取用户战略摘要
   * 用于显示用户的历史战略信息
   */
  getUserStrategicSummary(userId: string) {
    return this.strategyManager.getStrategicSummary(userId);
  }

  /**
   * 清理过期数据
   * 定期调用以维护性能
   */
  async cleanup(): Promise<void> {
    // 清理不活跃技能（L3）
    await this.capabilityManager.cleanupInactiveSkills();

    // 清理过期上下文（L2）
    await this.strategyManager.cleanupExpiredContexts();

    logger.info('[ACE L2/L3] Cleanup completed');
  }
}

/**
 * ChatService集成示例
 * 展示如何在ChatService中集成L2/L3服务
 */
export class ChatServiceWithL2L3 {
  private l2l3Integration: AceL2L3Integration;

  constructor(
    private aceIntegrator: AceIntegrator,
    private skillManager: SkillManager,
    private toolRetrievalService: ToolRetrievalService,
    private llmManager: LLMManager
  ) {
    this.l2l3Integration = new AceL2L3Integration(
      this.aceIntegrator,
      this.skillManager,
      this.toolRetrievalService,
      this.llmManager
    );
  }

  /**
   * 聊天处理主方法（集成L2/L3）
   */
  async chat(messages: Message[], options: ChatOptions): Promise<any> {
    const sessionId = options.sessionId || this.generateSessionId();
    const userId = options.userId || 'anonymous';

    try {
      // === L2层：加载战略上下文 ===
      const strategicContext = await this.l2l3Integration.loadStrategicContextForSession(userId);

      // 如果有战略上下文，将其注入到系统提示词中
      if (strategicContext && strategicContext !== 'No previous strategic context found.') {
        messages = this.injectStrategicContext(messages, strategicContext);
      }

      // === 核心聊天处理（使用现有逻辑） ===
      const result = await this.executeChat(messages, options);

      // === L2层：任务完成后更新世界模型 ===
      await this.l2l3Integration.updateWorldModelAfterTask(sessionId, {
        summary: `Chat completed for user ${userId}`,
        learnings: this.extractLearnings(result),
        outcome: 'success'
      });

      return result;

    } catch (error: any) {
      // 任务失败时也更新世界模型
      await this.l2l3Integration.updateWorldModelAfterTask(sessionId, {
        summary: `Chat failed: ${error.message}`,
        learnings: [],
        outcome: 'failure'
      });

      throw error;
    }
  }

  /**
   * 工具调用前后处理（集成L3）
   */
  async handleToolCall(skillName: string, params: any, isError: boolean = false, error?: string): Promise<void> {
    if (isError) {
      // 技能失败：标记为故障
      await this.l2l3Integration.markSkillAsFaulty(skillName, error || 'Unknown error');
    } else {
      // 技能成功：更新活动状态
      await this.l2l3Integration.trackSkillUsage(skillName);
    }
  }

  /**
   * 获取可用的技能列表（L3）
   * 用于L4层决策
   */
  async getAvailableSkillsForOrchestration(): Promise<string[]> {
    return this.l2l3Integration.getAvailableCapabilities();
  }

  /**
   * 注入战略上下文到消息
   */
  private injectStrategicContext(messages: Message[], strategicContext: string): Message[] {
    // 在系统提示词中注入L2战略上下文
    const systemMessage: Message = {
      role: 'system',
      content: `Strategic Context (L2 Global Strategy Layer):\n${strategicContext}\n\nPlease consider this context when responding.`
    };

    return [systemMessage, ...messages];
  }

  /**
   * 提取学习要点
   */
  private extractLearnings(result: any): string[] {
    // 简单实现：从结果中提取关键信息
    // 实际应用中可以使用LLM分析结果
    const learnings: string[] = [];

    if (result.content) {
      learnings.push('Generated response based on user query');
    }

    if (result.iterations && result.iterations > 0) {
      learnings.push(`Completed ${result.iterations} iterations of reasoning`);
    }

    return learnings;
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `ace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 执行核心聊天逻辑
   * 这里应该调用现有的聊天处理逻辑
   */
  private async executeChat(messages: Message[], options: ChatOptions): Promise<any> {
    // TODO: 集成现有的聊天处理逻辑
    // 这里应该调用ReActStrategy或其他策略
    throw new Error('Not implemented: integrate with existing chat logic');
  }
}

/**
 * SkillManager集成示例
 * 展示如何在SkillManager中集成L3服务
 */
export class SkillManagerWithL3 {
  constructor(
    private skillManager: SkillManager,
    private l2l3Integration: AceL2L3Integration
  ) {}

  /**
   * 安装技能后更新L3
   */
  async installSkillWithL3Update(zipBuffer: Buffer, options: any): Promise<any> {
    const result = await this.skillManager.installSkill(zipBuffer, options);

    if (result.success && result.skillName) {
      // 获取技能详细信息
      const skill = await this.skillManager.getSkillByName(result.skillName);
      if (skill) {
        // 更新L3能力管理器
        await this.l2l3Integration.registerNewSkill(skill);
      }
    }

    return result;
  }

  /**
   * 卸载技能后从L3移除
   */
  async uninstallSkillWithL3Update(skillName: string): Promise<any> {
    const result = await this.skillManager.uninstallSkill(skillName);

    if (result.success) {
      // 从L3能力管理器中移除
      await this.l2l3Integration.unregisterSkill(skillName);
    }

    return result;
  }
}

/**
 * 使用示例
 */
export const integrationExamples = {
  /**
   * 示例1：完整集成到ChatService
   */
  chatServiceIntegration: `
    // 在ChatService构造函数中
    constructor(...) {
      // ... 现有初始化 ...

      // 初始化L2/L3集成
      this.l2l3Integration = new AceL2L3Integration(
        this.aceIntegrator,
        this.skillManager,
        this.toolRetrievalService,
        this.llmManager
      );
    }

    // 在chat方法中
    async chat(messages, options) {
      const userId = options.userId || 'anonymous';

      // L2：加载战略上下文
      const strategicContext = await this.l2l3Integration.loadStrategicContextForSession(userId);
      if (strategicContext) {
        messages = this.injectStrategicContext(messages, strategicContext);
      }

      // 执行聊天
      const result = await this.executeChat(messages, options);

      // L2：更新世界模型
      await this.l2l3Integration.updateWorldModelAfterTask(options.sessionId, {
        summary: 'Chat completed',
        learnings: ['Completed chat interaction'],
        outcome: 'success'
      });

      return result;
    }
  `,

  /**
   * 示例2：集成到ReActStrategy
   */
  reactStrategyIntegration: `
    // 在ReActStrategy中
    async executeTool(toolName, params) {
      try {
        // L3：更新技能活动状态
        await this.l2l3Integration.trackSkillUsage(toolName);

        const result = await this.executeToolInternal(toolName, params);
        return result;
      } catch (error) {
        // L3：标记技能为故障
        await this.l2l3Integration.markSkillAsFaulty(toolName, error.message);
        throw error;
      }
    }
  `,

  /**
   * 示例3：集成到SkillManager
   */
  skillManagerIntegration: `
    // 在SkillManager中
    async installSkill(zipBuffer, options) {
      const result = await this.installSkillInternal(zipBuffer, options);

      if (result.success) {
        const skill = await this.getSkillByName(result.skillName);
        if (skill) {
          // L3：注册新技能
          await this.l2l3Integration.registerNewSkill(skill);
        }
      }

      return result;
    }

    async uninstallSkill(skillName) {
      const result = await this.uninstallSkillInternal(skillName);

      if (result.success) {
        // L3：从能力管理器中移除
        await this.l2l3Integration.unregisterSkill(skillName);
      }

      return result;
    }
  `
};
