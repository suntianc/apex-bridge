import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { ApexLLMAdapter } from './ApexLLMAdapter';
import { ReadWriteLock } from '../../utils/cache';

// ========== 本地化类型定义 ==========

export interface TrajectoryStep {
  thought: string;
  action: string;
  output: string;
}

export interface Trajectory {
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
  evolution_status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

export interface ReflectionTrigger {
  type: string;
  level: string;
  sessionId: string;
  traceId: string;
  timestamp: number;
  context?: any;
}

export interface AceCoreConfig {
  agentId: string;
  reflectionCycleInterval?: number;
  maxSessionAge?: number;
  storage?: {
    mode: 'memory' | 'sqlite';
    sqlitePath?: string;
    logsPath?: string;
  };
  memory?: {
    provider: 'memory' | 'lancedb';
    endpoint?: string;
    collectionPrefix?: string;
  };
  llm?: {
    driver: ApexLLMAdapter;
    modelMap?: Record<string, string>;
  };
  reflectionTrigger?: {
    predictionErrorThreshold?: number;
    loopDetectionWindow?: number;
    loopDetectionThreshold?: number;
    stagnationTimeWindow?: number;
    stagnationProgressThreshold?: number;
    maxTokens?: number;
    maxSteps?: number;
    maxTime?: number;
    cooldownMs?: number;
    contextWindowThreshold?: number;
  };
}

interface Session {
  userId: string;
  metadata: any;
  createdAt: number;
  lastActivity: number;
}

// ========== AceCore核心实现 ==========

export class AceCore {
  // ========== 并发安全控制 ==========
  /**
   * 读写锁 - 保护共享状态（sessions、scratchpads等）
   */
  private rwLock = new ReadWriteLock();

  /**
   * 并发操作锁 - 用于序列化复杂的复合操作
   */
  private sessionOperationLock = new ReadWriteLock();

  // 事件总线
  public readonly bus = {
    northbound: new EventEmitter(),
    southbound: new EventEmitter()
  };

  // 存储（这些map现在通过读写锁保护）
  private scratchpads: Map<string, Map<string, string>> = new Map();
  private sessions: Map<string, Session> = new Map();
  private reflectionTriggers: Map<string, ReflectionTrigger> = new Map();

  // 调度器
  private scheduler: NodeJS.Timeout | null = null;

  constructor(private config: AceCoreConfig) {
    // 启动定期会话清理
    this.startSessionCleanupScheduler();
  }

  /**
   * 启动会话清理调度器
   * 定期清理过期会话，释放内存
   */
  private startSessionCleanupScheduler(): void {
    // 每5分钟清理一次过期会话
    const cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);

    // 确保不阻止进程退出
    if (cleanupInterval.unref) {
      cleanupInterval.unref();
    }
  }

  /**
   * 销毁并清理资源
   */
  async destroy(): Promise<void> {
    // 停止调度器
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }

    // 销毁读写锁
    this.rwLock.destroy();
    this.sessionOperationLock.destroy();

    // 清空所有存储
    this.scratchpads.clear();
    this.sessions.clear();
    this.reflectionTriggers.clear();

    // 移除所有事件监听器
    this.bus.northbound.removeAllListeners();
    this.bus.southbound.removeAllListeners();

    logger.info('[AceCore] Destroyed and cleaned up all resources');
  }

  /**
   * 启动AceCore
   * 启动调度器，开始反思周期
   */
  async start(): Promise<void> {
    if (this.scheduler) {
      logger.warn('[AceCore] Scheduler already started');
      return;
    }

    const interval = this.config.reflectionCycleInterval || 60000;

    this.scheduler = setInterval(() => {
      this.runReflectionCycle();
    }, interval);

    logger.debug(`[AceCore] Scheduler started with interval: ${interval}ms`);
  }

  /**
   * 停止AceCore
   * 停止调度器
   */
  async stop(): Promise<void> {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
      logger.info('[AceCore] Scheduler stopped');
    }
  }

  /**
   * 创建新会话（使用写锁保护并发）
   * @param sessionId 会话ID（可选，如果不提供则自动生成）
   * @param metadata 会话元数据
   */
  async createSession(sessionId?: string, metadata?: any): Promise<string> {
    return await this.sessionOperationLock.withWriteLock(async () => {
      const finalSessionId = sessionId || crypto.randomUUID();
      const session: Session = {
        userId: metadata?.userId || 'unknown',
        metadata: metadata || {},
        createdAt: Date.now(),
        lastActivity: Date.now()
      };

      this.sessions.set(finalSessionId, session);

      // 上报会话创建事件
      this.bus.northbound.emit('SESSION_CREATED', {
        data: {
          sessionId: finalSessionId,
          config: metadata,
          timestamp: Date.now()
        }
      });

      logger.info(`[AceCore] Created session: ${finalSessionId}`);
      return finalSessionId;
    });
  }

  /**
   * 更新会话活动时间（使用读写锁保护并发）
   * @param sessionId 会话ID
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    return await this.rwLock.withWriteLock(async () => {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.lastActivity = Date.now();

        // 上报会话活动事件
        this.bus.northbound.emit('SESSION_ACTIVITY', {
          data: {
            sessionId,
            timestamp: Date.now()
          }
        });

        logger.debug(`[AceCore] Updated session activity: ${sessionId}`);
      }
    });
  }

  /**
   * 获取会话信息（使用读锁保护并发）
   * @param sessionId 会话ID
   * @returns 会话信息
   */
  async getSession(sessionId: string): Promise<Session | undefined> {
    return await this.rwLock.withReadLock(async () => this.sessions.get(sessionId));
  }

  /**
   * 获取会话状态（向后兼容，使用读锁保护并发）
   * @param sessionId 会话ID
   * @returns 会话状态
   */
  async getSessionState(sessionId: string): Promise<any> {
    return await this.rwLock.withReadLock(async () => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return null;
      }

      return {
        sessionId,
        status: 'active',
        ...session
      };
    });
  }

  /**
   * 更新会话元数据（使用写锁保护并发）
   * @param sessionId 会话ID
   * @param metadata 元数据
   */
  async updateSessionMetadata(sessionId: string, metadata: any): Promise<void> {
    return await this.rwLock.withWriteLock(async () => {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.metadata = { ...session.metadata, ...metadata };
        session.lastActivity = Date.now();
        this.sessions.set(sessionId, session);

        logger.debug(`[AceCore] Updated session metadata: ${sessionId}`);
      }
    });
  }

  /**
   * 归档会话（使用写锁保护并发）
   * @param sessionId 会话ID
   */
  async archiveSession(sessionId: string): Promise<void> {
    return await this.sessionOperationLock.withWriteLock(async () => {
      this.sessions.delete(sessionId);
      this.scratchpads.delete(sessionId);

      logger.info(`[AceCore] Archived session: ${sessionId}`);
    });
  }

  /**
   * 获取所有活动会话（使用读锁保护并发）
   * @returns 活动会话列表
   */
  async getActiveSessions(): Promise<any[]> {
    return await this.rwLock.withReadLock(async () => {
      const sessions = [];
      for (const [sessionId, session] of this.sessions.entries()) {
        sessions.push({
          sessionId,
          status: 'active',
          ...session
        });
      }
      return sessions;
    });
  }

  /**
   * 获取会话遥测数据（使用读锁保护并发）
   * @param sessionId 会话ID
   * @returns 遥测数据
   */
  async getTelemetryBySession(sessionId: string): Promise<any> {
    return await this.rwLock.withReadLock(async () => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return null;
      }

      return {
        sessionId,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        metadata: session.metadata
      };
    });
  }

  /**
   * 获取会话指令
   * @param sessionId 会话ID
   * @returns 指令列表
   */
  getDirectivesBySession(sessionId: string): any[] {
    // 本地化实现：返回空数组
    // 实际指令存储可以在Scratchpad中
    return [];
  }

  /**
   * 追加内容到Scratchpad（使用写锁保护并发）
   * @param sessionId 会话ID
   * @param layerId 层级ID
   * @param content 内容
   */
  async appendToScratchpad(sessionId: string, layerId: string, content: string): Promise<void> {
    return await this.rwLock.withWriteLock(async () => {
      if (!this.scratchpads.has(sessionId)) {
        this.scratchpads.set(sessionId, new Map());
      }

      const layerScratchpad = this.scratchpads.get(sessionId)!;
      const existing = layerScratchpad.get(layerId) || '';
      layerScratchpad.set(layerId, existing + '\n' + content);

      logger.debug(`[AceCore] Appended to scratchpad: ${layerId} for session: ${sessionId}`);
    });
  }

  /**
   * 获取Scratchpad内容（使用读锁保护并发）
   * @param sessionId 会话ID
   * @param layerId 层级ID
   * @returns 内容
   */
  async getScratchpad(sessionId: string, layerId: string): Promise<string> {
    return await this.rwLock.withReadLock(async () => {
      return this.scratchpads.get(sessionId)?.get(layerId) || '';
    });
  }

  /**
   * 清空Scratchpad（使用写锁保护并发）
   * @param sessionId 会话ID
   * @param layerId 层级ID
   */
  async clearScratchpad(sessionId: string, layerId: string): Promise<void> {
    return await this.rwLock.withWriteLock(async () => {
      this.scratchpads.get(sessionId)?.delete(layerId);
      logger.debug(`[AceCore] Cleared scratchpad: ${layerId} for session: ${sessionId}`);
    });
  }

  /**
   * 清空会话的所有Scratchpad（使用写锁保护并发）
   * @param sessionId 会话ID
   */
  async clearSessionScratchpads(sessionId: string): Promise<void> {
    return await this.rwLock.withWriteLock(async () => {
      this.scratchpads.delete(sessionId);
      logger.debug(`[AceCore] Cleared all scratchpads for session: ${sessionId}`);
    });
  }

  /**
   * 进化轨迹
   * 保存轨迹数据供反思周期处理
   * @param trajectory 轨迹数据
   */
  async evolve(trajectory: Trajectory): Promise<void> {
    try {
      // 上报轨迹保存事件
      this.bus.northbound.emit('TRAJECTORY_SAVED', {
        data: {
          taskId: trajectory.task_id,
          sessionId: trajectory.session_id,
          timestamp: trajectory.timestamp
        }
      });

      logger.debug(`[AceCore] Trajectory saved for evolution: ${trajectory.task_id}`);
    } catch (error) {
      logger.error(`[AceCore] Failed to save trajectory: ${error}`);
      throw error;
    }
  }

  /**
   * 发布带会话的消息
   * @param sessionId 会话ID
   * @param content 消息内容
   * @param layer 目标层级
   */
  async publishWithSession(
    sessionId: string,
    content: string,
    layer: string
  ): Promise<void> {
    try {
      const message = {
        sessionId,
        content,
        layer,
        timestamp: Date.now()
      };

      this.bus.southbound.emit('MESSAGE', {
        data: message
      });

      logger.debug(`[AceCore] Published message to ${layer} for session: ${sessionId}`);
    } catch (error) {
      logger.error(`[AceCore] Failed to publish message: ${error}`);
      throw error;
    }
  }

  /**
   * 触发反思事件
   * @param trigger 反思触发器
   */
  async triggerReflection(trigger: ReflectionTrigger): Promise<void> {
    this.reflectionTriggers.set(trigger.traceId, trigger);

    // 上报到总线
    this.bus.northbound.emit(trigger.level as string, {
      data: { trigger }
    });

    logger.info(`[AceCore] Reflection triggered: ${trigger.type} at level ${trigger.level}`, {
      sessionId: trigger.sessionId,
      traceId: trigger.traceId
    });
  }

  /**
   * 获取所有反思触发统计
   * @returns 反思触发统计
   */
  getReflectionTriggers(): Map<string, ReflectionTrigger> {
    return this.reflectionTriggers;
  }

  /**
   * 运行反思周期
   * 调度器定期执行的方法
   */
  private async runReflectionCycle(): Promise<void> {
    try {
      logger.debug('[AceCore] Running scheduled reflection cycle');

      // 1. 清理过期会话
      await this.cleanupExpiredSessions();

      // 2. 触发全局反思事件
      const reflectionTrigger: ReflectionTrigger = {
        type: 'PERIODIC_REFLECTION',
        level: 'GLOBAL_STRATEGY',
        sessionId: 'system',
        traceId: crypto.randomUUID(),
        timestamp: Date.now(),
        context: 'Periodic reflection cycle'
      };

      await this.triggerReflection(reflectionTrigger);

      logger.debug('[AceCore] Reflection cycle completed');
    } catch (error) {
      logger.error('[AceCore] Reflection cycle failed:', error);
    }
  }

  /**
   * 清理过期会话（使用写锁保护并发）
   * 移除超过最大年龄的会话和Scratchpad
   */
  private async cleanupExpiredSessions(): Promise<void> {
    return await this.sessionOperationLock.withWriteLock(async () => {
      const now = Date.now();
      const maxAge = this.config.maxSessionAge || (24 * 60 * 60 * 1000); // 24小时

      let cleanedCount = 0;

      for (const [sessionId, session] of this.sessions.entries()) {
        if (now - session.lastActivity > maxAge) {
          this.sessions.delete(sessionId);
          this.scratchpads.delete(sessionId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info(`[AceCore] Cleaned up ${cleanedCount} expired sessions`);
      }
    });
  }

  /**
   * 获取配置
   * @returns 配置对象
   */
  getConfig(): AceCoreConfig {
    return this.config;
  }

  /**
   * 检查是否已启动
   * @returns 是否已启动
   */
  isStarted(): boolean {
    return this.scheduler !== null;
  }
}
