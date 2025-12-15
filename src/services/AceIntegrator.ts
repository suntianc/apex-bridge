/**
 * AceIntegrator - ACE引擎集成服务
 * 职责：统一管理所有ACE相关的轨迹保存、会话更新、轨迹构建等逻辑
 * P0阶段扩展：集成L5（认知控制）和L6（任务执行）层机制
 *
 * 内存管理改进：
 * - 使用LRU缓存限制Scratchpad存储大小
 * - 事件监听器生命周期管理
 * - 自动清理过期会话数据
 */

import { EventEmitter } from 'events';
import { AceService } from './AceService';
import { LLMManager } from '../core/LLMManager';
import type { Message } from '../types';
import { logger } from '../utils/logger';
import { LRUMap, EventListenerTracker } from '../utils/cache';
import { extractTextFromMessage } from '../utils/message-utils';

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
  // ========== 配置常量 ==========
  private static readonly MAX_SCRATCHPAD_SESSIONS = 500;  // 最大Scratchpad会话数
  private static readonly MAX_LAYER_CONTENT_SIZE = 50000; // 单层内容最大字符数
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5分钟清理一次

  constructor(
    private aceService: AceService,
    private llmManager?: LLMManager  // P0阶段新增：用于思考过程压缩
  ) {
    // P0阶段：初始化本地Scratchpad存储和事件总线
    this.initializeLocalStorage();
    this.startPeriodicCleanup();
  }

  // ========== P0阶段新增：本地化存储 ==========

  /**
   * 本地Scratchpad存储 - 使用LRU缓存防止内存泄漏
   * 结构：sessionId -> layerId -> content
   */
  private scratchpads: LRUMap<string, Map<string, string>> = new LRUMap(
    AceIntegrator.MAX_SCRATCHPAD_SESSIONS
  );

  /**
   * 本地事件总线（替代ace-engine-core BusManager）
   */
  private bus = {
    northbound: new EventEmitter(), // 上报事件（层级 -> 外部）
    southbound: new EventEmitter()  // 下达指令（外部 -> 层级）
  };

  /**
   * 事件监听器追踪器 - 防止监听器泄漏
   */
  private listenerTracker = new EventListenerTracker();

  /**
   * 定期清理定时器
   */
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * 初始化本地存储
   */
  private initializeLocalStorage(): void {
    logger.debug('[AceIntegrator] Initializing local Scratchpad storage with LRU cache and EventBus');
  }

  /**
   * 启动定期清理任务
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOversizedScratchpads();
    }, AceIntegrator.CLEANUP_INTERVAL_MS);

    // 确保不阻止进程退出
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * 清理超大的Scratchpad内容
   */
  private cleanupOversizedScratchpads(): void {
    let cleanedCount = 0;

    for (const [sessionId, layerMap] of this.scratchpads.entries()) {
      for (const [layerId, content] of layerMap.entries()) {
        if (content.length > AceIntegrator.MAX_LAYER_CONTENT_SIZE) {
          // 截断过长内容，保留最新部分
          const truncatedContent = content.slice(-AceIntegrator.MAX_LAYER_CONTENT_SIZE / 2);
          layerMap.set(layerId, `[Truncated]...\n${truncatedContent}`);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`[AceIntegrator] Truncated ${cleanedCount} oversized scratchpad entries`);
    }
  }

  /**
   * 销毁服务，清理资源
   */
  destroy(): void {
    // 停止定期清理
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // 移除所有事件监听器
    this.listenerTracker.removeAll();
    this.bus.northbound.removeAllListeners();
    this.bus.southbound.removeAllListeners();

    // 清空Scratchpad
    this.scratchpads.clear();

    logger.info('[AceIntegrator] Destroyed and cleaned up all resources');
  }

  /**
   * 保存轨迹（统一入口）
   * 支持单轮处理和ReAct模式的轨迹保存
   */
  async saveTrajectory(params: TrajectoryParams): Promise<void> {
    const aceCore = this.aceService.getEngine();
    if (!aceCore) {
      logger.debug('[AceIntegrator] AceCore not initialized, skipping trajectory save');
      return;
    }

    const userQuery = params.messages.find(m => m.role === 'user')
      ? extractTextFromMessage(params.messages.find(m => m.role === 'user')!)
      : '';

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
      // ✅ 使用AceCore的evolve方法
      await aceCore.evolve(trajectory);
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

    const aceCore = this.aceService.getEngine();
    if (!aceCore) {
      return;
    }

    try {
      // ✅ 使用AceCore的updateSessionActivity方法
      await aceCore.updateSessionActivity(sessionId);
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
   * 向AceCore发布消息（带会话）
   * @param sessionId 会话ID
   * @param content 消息内容
   * @param layer 目标层级
   */
  async publishWithSession(
    sessionId: string,
    content: string,
    layer: string = 'GLOBAL_STRATEGY'
  ): Promise<void> {
    const aceCore = this.aceService.getEngine();
    if (!aceCore) {
      logger.warn(`[AceIntegrator] AceCore not initialized, cannot publish message`);
      return;
    }

    try {
      // ✅ 使用AceCore的publishWithSession方法
      await aceCore.publishWithSession(sessionId, content, layer);
      logger.debug(`[AceIntegrator] Published message to AceCore (session: ${sessionId}, layer: ${layer})`);
    } catch (error: any) {
      logger.error(`[AceIntegrator] Failed to publish to AceCore: ${error.message}`);
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

  // ========== P0阶段新增：层级通信机制 ==========

  /**
   * 向指定层级发送消息（南向）
   * 用于从外部向ACE各层发送指令或数据
   */
  async sendToLayer(
    layerId: string,
    packet: { content?: string; type?: string; metadata?: any }
  ): Promise<void> {
    const message = {
      targetLayer: layerId,
      content: packet.content || '',
      type: packet.type || 'DIRECTIVE',
      metadata: packet.metadata || {},
      timestamp: Date.now()
    };

    // 南向消息：EXTERNAL -> ACE层级
    this.bus.southbound.emit('message', message);

    // 同时记录到Scratchpad（用于调试）
    if (this.scratchpads.has(layerId)) {
      const layerScratchpad = this.scratchpads.get(layerId)!;
      const existing = layerScratchpad.get('COMMUNICATION_LOG') || '';
      layerScratchpad.set('COMMUNICATION_LOG',
        existing + `\n[${new Date().toISOString()}] OUT: ${packet.content}`
      );
    }

    logger.debug(`[AceIntegrator] Sent message to ${layerId}: ${packet.content}`);
  }

  /**
   * 监听来自层级的事件（北向）
   * 用于接收来自ACE各层的事件和反馈
   * 使用EventListenerTracker防止监听器泄漏
   */
  onMessageFromLayer(layerId: string, callback: (message: any) => void): () => void {
    this.listenerTracker.addListener(this.bus.northbound, layerId, callback);
    logger.debug(`[AceIntegrator] Listening for messages from layer: ${layerId}`);

    // 返回取消订阅函数
    return () => {
      this.bus.northbound.removeListener(layerId, callback);
      logger.debug(`[AceIntegrator] Stopped listening for messages from layer: ${layerId}`);
    };
  }

  // ========== P0阶段新增：Scratchpad管理 ==========

  /**
   * 记录L5的思考过程
   */
  async recordThought(sessionId: string, thought: {
    content: string;
    reasoning: string
  }): Promise<void> {
    const sessionScratchpads = this.scratchpads.get(sessionId) || new Map();
    const existing = sessionScratchpads.get('COGNITIVE_CONTROL') || '';
    sessionScratchpads.set('COGNITIVE_CONTROL',
      existing + `\n[Thought] ${thought.reasoning}\n[Action] ${thought.content}`
    );
    this.scratchpads.set(sessionId, sessionScratchpads);
    logger.debug(`[AceIntegrator] Recorded thought for session: ${sessionId}`);
  }

  /**
   * 获取Scratchpad内容
   */
  async getScratchpad(sessionId: string, layerId: string): Promise<string> {
    return this.scratchpads.get(sessionId)?.get(layerId) || '';
  }

  /**
   * 清空Scratchpad
   */
  async clearScratchpad(sessionId: string, layerId: string): Promise<void> {
    this.scratchpads.get(sessionId)?.delete(layerId);
    logger.debug(`[AceIntegrator] Cleared scratchpad for session: ${sessionId}, layer: ${layerId}`);
  }

  /**
   * 清理会话的所有Scratchpad
   */
  async clearSessionScratchpads(sessionId: string): Promise<void> {
    this.scratchpads.delete(sessionId);
    logger.info(`[AceIntegrator] Cleared all scratchpads for session: ${sessionId}`);
  }

  // ========== P0阶段新增：工具执行记录 ==========

  /**
   * 记录轨迹事件（内部方法）
   */
  private async recordTrajectory(params: {
    sessionId: string;
    layerId: string;
    eventType: string;
    content: string;
    metadata?: any;
  }): Promise<void> {
    // 这里可以扩展为更详细的轨迹记录
    logger.debug(`[AceIntegrator] Recorded trajectory: ${params.eventType} on ${params.layerId}`);
  }

  /**
   * L6工具执行记录（适配当前项目工具调用格式）
   */
  async recordAction(sessionId: string, action: {
    layer: string;
    action: string;
    payload: any
  }): Promise<void> {
    await this.recordTrajectory({
      sessionId,
      layerId: action.layer,
      eventType: 'ACTION',
      content: JSON.stringify(action.payload),
      metadata: { actionType: action.action }
    });
  }

  /**
   * L6观察结果记录（适配 ToolResult 格式）
   */
  async recordObservation(sessionId: string, obs: {
    layer: string;
    observation: {
      success: boolean;
      output: any;
      error?: any;
      duration?: number;
      exitCode?: number
    };
    timestamp: number
  }): Promise<void> {
    const content = obs.observation.success
      ? JSON.stringify({ success: true, output: obs.observation.output })
      : JSON.stringify({ success: false, error: obs.observation.error });

    await this.recordTrajectory({
      sessionId,
      layerId: obs.layer,
      eventType: 'OBSERVATION',
      content,
      metadata: {
        timestamp: obs.timestamp,
        duration: obs.observation.duration,
        exitCode: obs.observation.exitCode
      }
    });

    logger.debug(`[AceIntegrator] Recorded observation for ${obs.layer}: success=${obs.observation.success}`);
  }

  // ========== P0阶段新增：任务完结清洗机制 ==========

  /**
   * 任务完成上报（触发L5 → L4的上下文压缩）
   */
  async completeTask(
    sessionId: string,
    summary: { summary: string; outcome: string }
  ): Promise<void> {
    // 1. 从L5的Scratchpad提取完整思考过程
    const scratchpad = this.scratchpads.get(sessionId)?.get('COGNITIVE_CONTROL') || '';

    // 2. 压缩为摘要（递归摘要）
    const compressed = await this.compressThoughts(scratchpad);

    // 3. 上报到L4（待P1阶段实现）
    await this.sendToLayer('EXECUTIVE_FUNCTION', {
      type: 'STATUS_UPDATE',
      content: `Task completed: ${summary.summary}\nOutcome: ${summary.outcome}\nDetails: ${compressed}`
    });

    // 4. 清空L5的Scratchpad（关键：释放内存）
    this.scratchpads.get(sessionId)?.delete('COGNITIVE_CONTROL');

    logger.info(`[AceIntegrator] Task completed and L5 scratchpad cleared for session: ${sessionId}`);
  }

  /**
   * 递归摘要算法（使用项目现有的LLMManager）
   */
  private async compressThoughts(scratchpad: string): Promise<string> {
    if (scratchpad.length < 500) return scratchpad;

    if (!this.llmManager) {
      logger.warn('[AceIntegrator] LLMManager not available, cannot compress thoughts');
      return scratchpad;
    }

    try {
      const response = await this.llmManager.chat([{
        role: 'user',
        content: `Summarize the following reasoning process into 2-3 sentences:\n\n${scratchpad}`
      }], { stream: false });

      return (response.choices[0]?.message?.content as string) || scratchpad;
    } catch (error) {
      logger.warn('[AceIntegrator] Failed to compress thoughts, using original text');
      return scratchpad;
    }
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
