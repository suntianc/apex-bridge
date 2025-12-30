/**
 * PlaybookSynthesis - Playbook 自动提炼模块
 *
 * 职责：
 * 1. 从成功案例提炼 Playbook（最佳实践）
 * 2. 从失败案例提炼"避免错误"Playbook（反向学习）
 * 3. 构建提炼提示词
 * 4. 解析 LLM 返回的 Playbook
 *
 * 依赖：
 * - LLMManager: LLM 管理器
 * - PlaybookManager: Playbook 管理器（依赖注入）
 * - AceIntegrator: ACE 集成器
 */

import { LLMManager } from '../../core/LLMManager';
import { AceIntegrator } from '../AceIntegrator';
import { logger } from '../../utils/logger';
import type { StrategicLearning, StrategicPlaybook } from './types';
import type { PlaybookManager } from '../PlaybookManager';

/**
 * Playbook 合成器接口
 */
export interface IPlaybookSynthesis {
  /**
   * 从成功案例提炼 Playbook
   */
  extractFromSuccess(
    learning: StrategicLearning,
    sessionId: string
  ): Promise<StrategicPlaybook | null>;

  /**
   * 从失败案例提炼 Playbook
   */
  extractFromFailure(
    learning: StrategicLearning,
    sessionId: string
  ): Promise<StrategicPlaybook | null>;

  /**
   * 构建提炼提示
   */
  buildExtractionPrompt(
    learning: StrategicLearning,
    context?: string
  ): string;

  /**
   * 保存提炼的 Playbook
   */
  savePlaybook(playbook: StrategicPlaybook): Promise<string>;
}

/**
 * Playbook 合成器实现
 */
export class PlaybookSynthesis implements IPlaybookSynthesis {
  /** Playbook 管理器（依赖注入） */
  private injectedPlaybookManager: PlaybookManager | null = null;

  /**
   * 构造函数
   *
   * @param llmManager LLM 管理器
   * @param playbookManager Playbook 管理器（可选，依赖注入）
   * @param aceIntegrator ACE 集成器
   */
  constructor(
    private readonly llmManager: LLMManager,
    private readonly playbookManager?: PlaybookManager,
    private readonly aceIntegrator?: AceIntegrator
  ) {
    // 如果构造函数中提供了 playbookManager，直接使用
    if (playbookManager) {
      this.injectedPlaybookManager = playbookManager;
    }
  }

  /**
   * 设置 Playbook 管理器（用于依赖注入）
   */
  setPlaybookManager(manager: PlaybookManager): void {
    this.injectedPlaybookManager = manager;
  }

  /**
   * 获取 Playbook 管理器
   */
  private getPlaybookManager(): PlaybookManager | null {
    return this.injectedPlaybookManager || this.getPlaybookManager() || null;
  }

  /**
   * 从成功案例提炼 Playbook
   */
  async extractFromSuccess(
    learning: StrategicLearning,
    sessionId: string
  ): Promise<StrategicPlaybook | null> {
    try {
      // 只对成功案例提炼 Playbook
      if (learning.outcome !== 'success') {
        logger.debug(`[PlaybookSynthesis] Skipping playbook extraction for ${learning.outcome} outcome`);
        return null;
      }

      // 获取会话上下文
      const sessionContext = await this.getSessionContext(sessionId);

      // 使用 PlaybookManager 提炼 Playbook
      if (this.getPlaybookManager()) {
        const playbook = await this.getPlaybookManager().extractPlaybookFromLearning(learning, sessionContext);

        if (playbook) {
          // 向全局战略层报告 Playbook 生成
          await this.reportPlaybookCreated(playbook, learning, sessionId);
          logger.info(`[PlaybookSynthesis] Extracted playbook: ${playbook.name} (${playbook.id})`);
        }

        return playbook;
      }

      // 如果没有 PlaybookManager，使用内置提炼逻辑
      return this.internalExtractFromSuccess(learning, sessionContext, sessionId);
    } catch (error) {
      logger.error('[PlaybookSynthesis] Failed to extract playbook from learning:', error);
      return null;
    }
  }

  /**
   * 从失败案例提炼 Playbook（反向学习）
   */
  async extractFromFailure(
    learning: StrategicLearning,
    sessionId: string
  ): Promise<StrategicPlaybook | null> {
    try {
      // 只对失败案例提炼"反向 Playbook"
      if (learning.outcome !== 'failure') {
        logger.debug(`[PlaybookSynthesis] Skipping failure playbook extraction for ${learning.outcome} outcome`);
        return null;
      }

      // 获取会话上下文
      const sessionContext = await this.getSessionContext(sessionId);

      // 使用 LLM 分析失败案例，提炼"避免错误"的策略
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
        // 创建"避免错误"类型的 Playbook
        if (this.getPlaybookManager()) {
          const playbook = await this.getPlaybookManager().createPlaybook(failurePlaybook);

          // 向全局战略层报告失败 Playbook 生成
          await this.reportFailurePlaybookCreated(playbook, learning, sessionId);
          logger.info(`[PlaybookSynthesis] Extracted failure playbook: ${playbook.name} (${playbook.id})`);

          return playbook;
        }

        // 如果没有 PlaybookManager，直接返回解析结果
        const playbook = {
          ...failurePlaybook,
          id: this.generatePlaybookId(),
          createdAt: Date.now(),
          lastUpdated: Date.now()
        };

        await this.reportFailurePlaybookCreated(playbook, learning, sessionId);
        return playbook;
      }

      return null;
    } catch (error) {
      logger.error('[PlaybookSynthesis] Failed to extract failure playbook from learning:', error);
      return null;
    }
  }

  /**
   * 构建提炼提示
   */
  buildExtractionPrompt(
    learning: StrategicLearning,
    context?: string
  ): string {
    return `
分析以下战略学习内容，提炼出可复用的 Playbook：

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

  /**
   * 保存提炼的 Playbook
   */
  async savePlaybook(playbook: StrategicPlaybook): Promise<string> {
    if (this.getPlaybookManager()) {
      const saved = await this.getPlaybookManager().createPlaybook(playbook);
      return saved.id;
    }

    logger.warn('[PlaybookSynthesis] No PlaybookManager available, cannot save playbook');
    return playbook.id;
  }

  /**
   * 内部提炼方法（当没有 PlaybookManager 时使用）
   */
  private async internalExtractFromSuccess(
    learning: StrategicLearning,
    context: string,
    sessionId: string
  ): Promise<StrategicPlaybook | null> {
    try {
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
        const playbook: StrategicPlaybook = {
          ...extracted,
          id: this.generatePlaybookId(),
          createdAt: Date.now(),
          lastUpdated: Date.now()
        };

        await this.reportPlaybookCreated(playbook, learning, sessionId);
        logger.info(`[PlaybookSynthesis] Extracted playbook: ${playbook.name} (${playbook.id})`);

        return playbook;
      }

      return null;
    } catch (error) {
      logger.error('[PlaybookSynthesis] Failed to internally extract playbook:', error);
      return null;
    }
  }

  /**
   * 获取会话上下文
   */
  private async getSessionContext(sessionId: string): Promise<string> {
    try {
      // 从 AceIntegrator 获取会话轨迹
      // 这里简化处理，实际实现可以从轨迹中提取更多上下文
      return `Session: ${sessionId}`;
    } catch (error) {
      logger.error('[PlaybookSynthesis] Failed to get session context:', error);
      return '';
    }
  }

  /**
   * 构建失败案例提炼 Prompt
   */
  private buildFailureExtractionPrompt(
    learning: StrategicLearning,
    context?: string
  ): string {
    return `
分析以下失败案例，提炼出"避免错误"的反向 Playbook：

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
   * 解析 LLM 返回的 Playbook
   */
  private parsePlaybookFromLLMResponse(
    response: string,
    learning: StrategicLearning
  ): Omit<StrategicPlaybook, 'id' | 'createdAt' | 'lastUpdated'> | null {
    try {
      // 提取 JSON 部分
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
        actions: parsed.actions || [],
        sourceLearningIds: [learning.id],
        lastOptimized: Date.now(),
        optimizationCount: 0,
        metrics: {
          successRate: learning.outcome === 'success' ? 1 : 0,
          usageCount: 0,
          avgSatisfaction: learning.outcome === 'success' ? 0.8 : 0.3,
          lastUsed: 0,
          avgExecutionTime: 0,
          userSatisfaction: learning.outcome === 'success' ? 8 : 3,
          averageOutcome: learning.outcome === 'success' ? 8 : 3,
          timeToResolution: 0
        },
        tags: parsed.tags || [],
        author: 'auto-extracted',
        reviewers: []
      };
    } catch (error) {
      logger.error('[PlaybookSynthesis] Failed to parse LLM response:', error);
      return null;
    }
  }

  /**
   * 解析 LLM 返回的失败 Playbook
   */
  private parseFailurePlaybookFromLLMResponse(
    response: string,
    learning: StrategicLearning
  ): Omit<StrategicPlaybook, 'id' | 'createdAt' | 'lastUpdated'> | null {
    try {
      // 提取 JSON 部分
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
        actions: parsed.actions || [],
        sourceLearningIds: [learning.id],
        lastOptimized: Date.now(),
        optimizationCount: 0,
        metrics: {
          successRate: 0, // 失败案例初始成功率为 0，但会随使用更新
          usageCount: 0,
          avgSatisfaction: 0,
          lastUsed: 0,
          avgExecutionTime: 0,
          userSatisfaction: 0,
          averageOutcome: 0,
          timeToResolution: 0
        },
        tags: parsed.tags || ['risk-avoidance', 'failure-derived'],
        author: 'failure-analysis',
        reviewers: []
      };
    } catch (error) {
      logger.error('[PlaybookSynthesis] Failed to parse failure playbook from LLM response:', error);
      return null;
    }
  }

  /**
   * 生成 Playbook ID
   */
  private generatePlaybookId(): string {
    return `pb_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 报告 Playbook 创建事件
   */
  private async reportPlaybookCreated(
    playbook: StrategicPlaybook,
    learning: StrategicLearning,
    sessionId: string
  ): Promise<void> {
    if (this.aceIntegrator) {
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
    }
  }

  /**
   * 报告失败 Playbook 创建事件
   */
  private async reportFailurePlaybookCreated(
    playbook: StrategicPlaybook,
    learning: StrategicLearning,
    sessionId: string
  ): Promise<void> {
    if (this.aceIntegrator) {
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
    }
  }
}

/**
 * 创建 Playbook 合成器
 */
export function createPlaybookSynthesis(
  llmManager: LLMManager,
  playbookManager?: PlaybookManager,
  aceIntegrator?: AceIntegrator
): PlaybookSynthesis {
  const synthesis = new PlaybookSynthesis(llmManager, playbookManager, aceIntegrator);

  if (playbookManager) {
    synthesis.setPlaybookManager(playbookManager);
  }

  return synthesis;
}
