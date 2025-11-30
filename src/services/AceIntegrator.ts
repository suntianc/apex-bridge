/**
 * AceIntegrator - ACE引擎集成服务
 * 职责：统一管理所有ACE相关的轨迹保存、会话更新、轨迹构建等逻辑
 */

import { AceService } from './AceService';
import type { Message } from '../types';
import { logger } from '../utils/logger';

/**
 * 轨迹参数接口
 */
interface TrajectoryParams {
  /** 请求ID */
  requestId: string;
  /** 会话ID（可选） */
  sessionId?: string;
  /** 消息数组 */
  messages: Message[];
  /** 最终内容 */
  finalContent: string;
  /** 思考过程（ReAct模式） */
  thinkingProcess?: string[];
  /** 迭代次数（ReAct模式） */
  iterations?: number;
  /** 是否为ReAct模式 */
  isReAct: boolean;
}

/**
 * ACE轨迹步骤接口
 */
interface TrajectoryStep {
  thought: string;
  action: string;
  output: string;
}

/**
 * ACE轨迹接口
 */
interface Trajectory {
  task_id: string;
  session_id?: string;
  user_input: string;
  steps: TrajectoryStep[];
  final_result: string;
  outcome: 'SUCCESS' | 'FAILURE';
  environment_feedback: string;
  used_rule_ids: string[];
  timestamp: number;
  duration_ms: number;
  evolution_status: 'PENDING';
}

export class AceIntegrator {
  constructor(private aceService: AceService) {}

  /**
   * 保存轨迹（统一入口）
   * 支持单轮处理和ReAct模式的轨迹保存
   */
  async saveTrajectory(params: TrajectoryParams): Promise<void> {
    const engine = this.aceService.getEngine();
    if (!engine) {
      logger.debug('[AceIntegrator] ACE Engine not initialized, skipping trajectory save');
      return;
    }

    const userQuery = params.messages.find(m => m.role === 'user')?.content || '';

    const trajectory: Trajectory = {
      task_id: params.requestId,
      session_id: params.sessionId,
      user_input: userQuery,
      steps: this.buildSteps(params),
      final_result: params.finalContent,
      outcome: params.finalContent ? 'SUCCESS' : 'FAILURE',
      environment_feedback: this.buildFeedback(params),
      used_rule_ids: [],
      timestamp: Date.now(),
      duration_ms: 0, // TODO: 可补充耗时计算
      evolution_status: 'PENDING'
    };

    try {
      await this.aceService.evolve(trajectory);
      logger.debug(`[AceIntegrator] Trajectory saved for task: ${params.requestId}`);
    } catch (error: any) {
      logger.error(`[AceIntegrator] Failed to save trajectory: ${error.message}`);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 更新会话活动时间
   * @param sessionId 会话ID
   */
  async updateSessionActivity(sessionId?: string): Promise<void> {
    if (!sessionId) {
      return;
    }

    const engine = this.aceService.getEngine();
    if (!engine) {
      return;
    }

    try {
      await engine.updateSessionActivity(sessionId);
      logger.debug(`[AceIntegrator] Session activity updated: ${sessionId}`);
    } catch (error: any) {
      logger.warn(`[AceIntegrator] Failed to update session activity: ${error.message}`);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 更新会话元数据（消息计数、Token使用量等）
   * @param sessionId 会话ID
   * @param usage Token使用信息
   */
  async updateSessionMetadata(
    sessionId: string,
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
  ): Promise<void> {
    // 委托给SessionManager处理
    // 注意：这里应该有SessionManager的引用，避免循环依赖
    // 暂时不实现，由ChatService调用SessionManager
    logger.debug(`[AceIntegrator] Session metadata update delegated to SessionManager`);
  }

  /**
   * 向ACE引擎发布消息（带会话）
   * @param sessionId 会话ID
   * @param content 消息内容
   * @param layer 目标层级
   */
  async publishWithSession(
    sessionId: string,
    content: string,
    layer: string = 'GLOBAL_STRATEGY'
  ): Promise<void> {
    const engine = this.aceService.getEngine();
    if (!engine) {
      logger.warn(`[AceIntegrator] ACE Engine not initialized, cannot publish message`);
      return;
    }

    try {
      await engine.publishWithSession(sessionId, content, layer as any);
      logger.debug(`[AceIntegrator] Published message to ACE (session: ${sessionId}, layer: ${layer})`);
    } catch (error: any) {
      logger.error(`[AceIntegrator] Failed to publish to ACE: ${error.message}`);
    }
  }

  /**
   * 构建轨迹步骤
   */
  private buildSteps(params: TrajectoryParams): TrajectoryStep[] {
    // ReAct模式：使用thinkingProcess构建步骤
    if (params.isReAct && params.thinkingProcess) {
      return params.thinkingProcess.map((thought, index) => ({
        thought: thought || `Iteration ${index + 1}`,
        action: 'think',
        output: ''
      }));
    }

    // 单轮处理模式
    return [{
      thought: 'Single round processing',
      action: 'chat',
      output: params.finalContent
    }];
  }

  /**
   * 构建环境反馈
   */
  private buildFeedback(params: TrajectoryParams): string {
    if (params.isReAct) {
      return `ReAct Engine: ${params.iterations || 0} iterations completed`;
    }

    return 'Stream response completed';
  }

  /**
   * 批量保存轨迹（用于批量处理场景）
   */
  async batchSaveTrajectories(paramsList: TrajectoryParams[]): Promise<void> {
    if (!paramsList || paramsList.length === 0) {
      return;
    }

    logger.debug(`[AceIntegrator] Batch saving ${paramsList.length} trajectories`);

    // 并行保存所有轨迹
    await Promise.all(
      paramsList.map(params => this.saveTrajectory(params))
    ).catch(error => {
      logger.error(`[AceIntegrator] Batch trajectory save failed: ${error.message}`);
    });
  }

  /**
   * 检查ACE Engine是否可用
   */
  isEnabled(): boolean {
    return !!this.aceService.getEngine();
  }

  /**
   * 获取ACE Service实例
   */
  getAceService(): AceService {
    return this.aceService;
  }
}
